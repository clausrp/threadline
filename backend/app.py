"""
Threadline — FastAPI backend
Serves the frontend and provides the REST API for all data and AI operations.
"""

import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import (
    Entry, Meta, Process, Upcoming, User, Workspace,
    create_tables, get_db, seed_database, SessionLocal,
)
from ai import (
    check_ollama, check_whisper,
    summarise_entry, summarise_process, transcribe_audio,
)

# ── Recordings directory ───────────────────────────────────────────────────────

RECORDINGS_DIR = Path(__file__).parent.parent / "recordings"
RECORDINGS_DIR.mkdir(exist_ok=True)

# ── Frontend path ──────────────────────────────────────────────────────────────

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# ── Helpers ────────────────────────────────────────────────────────────────────

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def fmt_date(d: datetime) -> str:
    return f"{MONTHS[d.month - 1]} {d.day:02d}, {d.year}"


def iso_to_display(iso: str) -> str:
    """Convert 'YYYY-MM-DD' to 'Sep 11, 2026'."""
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
        return fmt_date(d)
    except Exception:
        return iso


def display_to_iso(display: str) -> str:
    """Convert 'Sep 11, 2026' to '2026-09-11'. Returns display string on failure."""
    try:
        d = datetime.strptime(display, "%b %d, %Y")
        return d.strftime("%Y-%m-%d")
    except Exception:
        return display


def entry_to_dict(e: Entry) -> dict:
    tags = []
    try:
        tags = json.loads(e.tags or "[]")
    except Exception:
        pass
    return {
        "id": e.id,
        "type": e.entry_type,
        "date": e.entry_date,
        "title": e.title,
        "description": e.description or "",
        "location": e.location or "",
        "tags": tags,
        "recording": e.has_recording,
        "recordingData": {"id": e.recording_id, "name": e.recording_name, "size": e.recording_size}
            if e.recording_id else None,
        "transcript": e.transcript,
        "aiSummary": json.loads(e.ai_summary) if e.ai_summary else None,
    }


def upcoming_to_dict(u: Upcoming) -> dict:
    day, month = "", ""
    if u.meeting_date:
        try:
            d = datetime.strptime(u.meeting_date, "%Y-%m-%d")
            day = f"{d.day:02d}"
            month = MONTHS[d.month - 1].upper()
        except Exception:
            pass
    time_str = u.meeting_time or ""
    process_name = u.process_name or ""
    meta = f"{time_str} • {process_name}" if time_str and process_name else process_name
    return {
        "id": u.id,
        "title": u.title,
        "day": day,
        "month": month,
        "date": u.meeting_date or "",
        "time": u.meeting_time or "",
        "meta": meta,
        "location": u.location or "",
        "description": u.description or "",
        "processId": u.process_id or "",
        "processName": u.process_name or "",
        "status": u.status,
    }


def process_to_dict(p: Process, include_entries: bool = True) -> dict:
    shared = []
    try:
        shared = json.loads(p.shared_with or "[]")
    except Exception:
        pass
    result = {
        "id": p.id,
        "name": p.name,
        "color": p.color,
        "started": p.started,
        "sharedWith": shared,
    }
    if include_entries:
        result["entries"] = [entry_to_dict(e) for e in p.entries]
    return result


def workspace_to_dict(w: Workspace, include_processes: bool = True) -> dict:
    dashboard = {"process": True, "upcoming": True, "insight": True}
    try:
        if w.dashboard:
            dashboard.update(json.loads(w.dashboard))
    except Exception:
        pass
    result = {
        "id": w.id,
        "name": w.name,
        "ownerId": w.owner_id,
        "dashboard": dashboard,
    }
    if include_processes:
        result["processes"] = [process_to_dict(p) for p in w.processes]
        result["upcoming"] = [
            upcoming_to_dict(u) for u in w.upcoming if u.status == "pending"
        ]
    return result


def get_active_workspace_id(db: Session) -> str:
    row = db.query(Meta).filter(Meta.key == "active_workspace_id").first()
    if row:
        return row.value
    ws = db.query(Workspace).first()
    return ws.id if ws else ""


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_tables()
    with SessionLocal() as db:
        seed_database(db)
    yield


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Threadline", lifespan=lifespan)

# ── Pydantic schemas ───────────────────────────────────────────────────────────

class ProcessCreate(BaseModel):
    name: str
    color: str = "blue"
    started: Optional[str] = None

class ProcessUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    sharedWith: Optional[list[str]] = None

class EntryCreate(BaseModel):
    type: str
    date: str           # "YYYY-MM-DD" from date input
    time: Optional[str] = "12:00"
    title: str
    description: Optional[str] = ""
    location: Optional[str] = ""
    tags: Optional[list[str]] = []

class EntryUpdate(BaseModel):
    type: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    tags: Optional[list[str]] = None

class UpcomingCreate(BaseModel):
    title: str
    date: str           # "YYYY-MM-DD"
    time: Optional[str] = "12:00"
    location: Optional[str] = ""
    description: Optional[str] = ""
    processId: Optional[str] = ""
    processName: Optional[str] = ""

class UpcomingUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    processId: Optional[str] = None
    processName: Optional[str] = None

class WorkspaceCreate(BaseModel):
    name: str

class WorkspaceDashboard(BaseModel):
    process: bool = True
    upcoming: bool = True
    insight: bool = True

class UserCreate(BaseModel):
    name: str
    email: str
    role: str = "user"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None

class ActiveWorkspaceSet(BaseModel):
    workspaceId: str

class RestorePayload(BaseModel):
    data: dict

# ── App state ──────────────────────────────────────────────────────────────────

@app.get("/api/state")
def get_state(db: Session = Depends(get_db)):
    """Full app state on boot."""
    active_ws_id = get_active_workspace_id(db)
    workspaces = db.query(Workspace).all()
    users = db.query(User).all()

    active_ws = next((w for w in workspaces if w.id == active_ws_id), workspaces[0] if workspaces else None)

    return {
        "activeWorkspaceId": active_ws_id,
        "users": [{"id": u.id, "name": u.name, "email": u.email, "role": u.role} for u in users],
        "workspaces": [workspace_to_dict(w, include_processes=False) for w in workspaces],
        "processes": [process_to_dict(p) for p in (active_ws.processes if active_ws else [])],
        "upcoming": [
            upcoming_to_dict(u) for u in (active_ws.upcoming if active_ws else [])
            if u.status == "pending"
        ],
    }


@app.post("/api/active-workspace")
def set_active_workspace(body: ActiveWorkspaceSet, db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == body.workspaceId).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    row = db.query(Meta).filter(Meta.key == "active_workspace_id").first()
    if row:
        row.value = ws.id
    else:
        db.add(Meta(key="active_workspace_id", value=ws.id))
    db.commit()
    return workspace_to_dict(ws)


# ── Processes ──────────────────────────────────────────────────────────────────

@app.get("/api/workspaces/{workspace_id}/processes")
def list_processes(workspace_id: str, db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return [process_to_dict(p) for p in ws.processes]


@app.post("/api/workspaces/{workspace_id}/processes", status_code=201)
def create_process(workspace_id: str, body: ProcessCreate, db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    started = body.started or fmt_date(datetime.now())
    p = Process(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        name=body.name,
        color=body.color,
        started=started,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return process_to_dict(p)


@app.patch("/api/processes/{process_id}")
def update_process(process_id: str, body: ProcessUpdate, db: Session = Depends(get_db)):
    p = db.query(Process).filter(Process.id == process_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Process not found")
    if body.name is not None:
        p.name = body.name
    if body.color is not None:
        p.color = body.color
    if body.sharedWith is not None:
        p.shared_with = json.dumps(body.sharedWith)
    db.commit()
    db.refresh(p)
    return process_to_dict(p)


@app.delete("/api/processes/{process_id}", status_code=204)
def delete_process(process_id: str, db: Session = Depends(get_db)):
    p = db.query(Process).filter(Process.id == process_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Process not found")
    db.delete(p)
    db.commit()


# ── Entries ────────────────────────────────────────────────────────────────────

@app.post("/api/processes/{process_id}/entries", status_code=201)
def create_entry(process_id: str, body: EntryCreate, db: Session = Depends(get_db)):
    p = db.query(Process).filter(Process.id == process_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Process not found")
    display_date = iso_to_display(body.date)
    tags = body.tags or []
    if body.type == "meeting" and "Minutes added" not in tags:
        tags = ["Minutes added"] + tags
    elif body.type != "meeting" and "Personal note" not in tags and "Milestone" not in tags:
        tags = ["Personal note"] + tags
    e = Entry(
        id=str(uuid.uuid4()),
        process_id=process_id,
        entry_type=body.type,
        entry_date=display_date,
        sort_date=body.date,
        title=body.title,
        description=body.description or "Entry captured in Threadline.",
        location=body.location or "",
        tags=json.dumps(tags),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return entry_to_dict(e)


@app.patch("/api/entries/{entry_id}")
def update_entry(entry_id: str, body: EntryUpdate, db: Session = Depends(get_db)):
    e = db.query(Entry).filter(Entry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if body.type is not None:
        e.entry_type = body.type
    if body.date is not None:
        e.entry_date = iso_to_display(body.date)
        e.sort_date = body.date
    if body.title is not None:
        e.title = body.title
    if body.description is not None:
        e.description = body.description
    if body.location is not None:
        e.location = body.location
    if body.tags is not None:
        e.tags = json.dumps(body.tags)
    db.commit()
    db.refresh(e)
    return entry_to_dict(e)


@app.delete("/api/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: str, db: Session = Depends(get_db)):
    e = db.query(Entry).filter(Entry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(e)
    db.commit()


# ── Recordings ─────────────────────────────────────────────────────────────────

@app.post("/api/entries/{entry_id}/recording")
async def upload_recording(entry_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    e = db.query(Entry).filter(Entry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    suffix = Path(file.filename or "recording.bin").suffix
    rec_id = f"rec-{uuid.uuid4()}{suffix}"
    dest = RECORDINGS_DIR / rec_id
    audio_bytes = await file.read()
    dest.write_bytes(audio_bytes)
    e.has_recording = True
    e.recording_id = rec_id
    e.recording_name = file.filename
    e.recording_size = str(len(audio_bytes))
    if "Recording" not in (json.loads(e.tags or "[]")):
        tags = json.loads(e.tags or "[]")
        tags.append("Recording")
        e.tags = json.dumps(tags)
    db.commit()
    db.refresh(e)
    return entry_to_dict(e)


@app.get("/api/recordings/{rec_id}")
def get_recording(rec_id: str):
    path = RECORDINGS_DIR / rec_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Recording not found")
    return FileResponse(str(path))


# ── Upcoming ───────────────────────────────────────────────────────────────────

@app.get("/api/workspaces/{workspace_id}/upcoming")
def list_upcoming(workspace_id: str, db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return [upcoming_to_dict(u) for u in ws.upcoming if u.status == "pending"]


@app.post("/api/workspaces/{workspace_id}/upcoming", status_code=201)
def create_upcoming(workspace_id: str, body: UpcomingCreate, db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    u = Upcoming(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title=body.title,
        meeting_date=body.date,
        meeting_time=body.time or "12:00",
        location=body.location or "",
        description=body.description or "",
        process_id=body.processId or "",
        process_name=body.processName or "",
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return upcoming_to_dict(u)


@app.patch("/api/upcoming/{upcoming_id}")
def update_upcoming(upcoming_id: str, body: UpcomingUpdate, db: Session = Depends(get_db)):
    u = db.query(Upcoming).filter(Upcoming.id == upcoming_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Upcoming meeting not found")
    if body.title is not None:
        u.title = body.title
    if body.date is not None:
        u.meeting_date = body.date
    if body.time is not None:
        u.meeting_time = body.time
    if body.location is not None:
        u.location = body.location
    if body.description is not None:
        u.description = body.description
    if body.processId is not None:
        u.process_id = body.processId
    if body.processName is not None:
        u.process_name = body.processName
    db.commit()
    db.refresh(u)
    return upcoming_to_dict(u)


@app.delete("/api/upcoming/{upcoming_id}", status_code=204)
def delete_upcoming(upcoming_id: str, db: Session = Depends(get_db)):
    u = db.query(Upcoming).filter(Upcoming.id == upcoming_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Upcoming meeting not found")
    db.delete(u)
    db.commit()


@app.post("/api/upcoming/promote")
def promote_due_meetings(db: Session = Depends(get_db)):
    """Move past upcoming meetings into process history."""
    now = datetime.now(timezone.utc)
    promoted = []
    meetings = db.query(Upcoming).filter(Upcoming.status == "pending").all()
    for u in meetings:
        if not u.meeting_date:
            continue
        try:
            dt_str = f"{u.meeting_date}T{u.meeting_time or '23:59'}"
            dt = datetime.fromisoformat(dt_str).replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if dt > now:
            continue
        process = db.query(Process).filter(Process.id == u.process_id).first()
        if not process:
            continue
        existing = db.query(Entry).filter(Entry.id == u.id).first()
        if not existing:
            display_date = iso_to_display(u.meeting_date)
            entry = Entry(
                id=u.id,
                process_id=process.id,
                entry_type="meeting",
                entry_date=display_date,
                sort_date=u.meeting_date,
                title=u.title,
                description=u.description or "Upcoming meeting completed.",
                location=u.location or "",
                tags=json.dumps(["Minutes added"]),
            )
            db.add(entry)
        u.status = "completed"
        u.completed_at = now
        promoted.append(u.id)
    db.commit()
    return {"promoted": promoted}


# ── Workspaces ─────────────────────────────────────────────────────────────────

@app.get("/api/workspaces")
def list_workspaces(db: Session = Depends(get_db)):
    workspaces = db.query(Workspace).all()
    return [workspace_to_dict(w, include_processes=False) for w in workspaces]


@app.post("/api/workspaces", status_code=201)
def create_workspace(body: WorkspaceCreate, db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.role == "admin").first()
    if not admin:
        raise HTTPException(status_code=400, detail="No admin user found")
    ws = Workspace(id=str(uuid.uuid4()), name=body.name, owner_id=admin.id)
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return workspace_to_dict(ws, include_processes=False)


@app.patch("/api/workspaces/{workspace_id}/dashboard")
def update_dashboard(workspace_id: str, body: WorkspaceDashboard, db: Session = Depends(get_db)):
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws.dashboard = json.dumps(body.model_dump())
    db.commit()
    return {"ok": True}


@app.delete("/api/workspaces/{workspace_id}", status_code=204)
def delete_workspace(workspace_id: str, db: Session = Depends(get_db)):
    count = db.query(Workspace).count()
    if count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only workspace")
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    db.delete(ws)
    db.commit()


# ── Users ──────────────────────────────────────────────────────────────────────

@app.get("/api/users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"id": u.id, "name": u.name, "email": u.email, "role": u.role} for u in users]


@app.post("/api/users", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    user_id = str(uuid.uuid4())
    user = User(id=user_id, name=body.name, email=body.email, role=body.role)
    ws = Workspace(
        id=str(uuid.uuid4()),
        name=f"{body.name}'s workspace",
        owner_id=user_id,
    )
    db.add(user)
    db.add(ws)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@app.patch("/api/users/{user_id}")
def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.name is not None:
        user.name = body.name
        ws = db.query(Workspace).filter(Workspace.owner_id == user_id).first()
        if ws:
            ws.name = f"{body.name}'s workspace"
    if body.email is not None:
        user.email = body.email
    if body.role is not None:
        user.role = body.role
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()


# ── AI ─────────────────────────────────────────────────────────────────────────

@app.get("/api/ai/status")
def ai_status():
    return {
        "whisper": check_whisper(),
        "ollama": check_ollama(),
    }


@app.post("/api/entries/{entry_id}/transcribe")
async def transcribe_entry(entry_id: str, db: Session = Depends(get_db)):
    """Transcribe the attached recording using faster-whisper."""
    e = db.query(Entry).filter(Entry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if not e.recording_id:
        raise HTTPException(status_code=400, detail="No recording attached to this entry")
    rec_path = RECORDINGS_DIR / e.recording_id
    if not rec_path.exists():
        raise HTTPException(status_code=404, detail="Recording file not found")
    try:
        transcript = transcribe_audio(rec_path.read_bytes(), e.recording_name or e.recording_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    e.transcript = transcript
    db.commit()
    db.refresh(e)
    return entry_to_dict(e)


@app.post("/api/entries/{entry_id}/summarise")
def summarise_entry_route(entry_id: str, db: Session = Depends(get_db)):
    """Generate an AI summary for a single entry using its transcript or description."""
    e = db.query(Entry).filter(Entry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    text = e.transcript or e.description or ""
    if not text.strip():
        raise HTTPException(status_code=400, detail="No transcript or description to summarise")
    try:
        result = summarise_entry(
            title=e.title,
            transcript=text,
            process_name=e.process.name if e.process else "",
            entry_type=e.entry_type,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    e.ai_summary = json.dumps(result)
    db.commit()
    db.refresh(e)
    return entry_to_dict(e)


@app.post("/api/processes/{process_id}/summarise")
def summarise_process_route(process_id: str, db: Session = Depends(get_db)):
    """Generate a high-level AI summary across all entries in a process."""
    p = db.query(Process).filter(Process.id == process_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Process not found")
    entries = [
        {"entry_type": e.entry_type, "entry_date": e.entry_date,
         "title": e.title, "description": e.description or ""}
        for e in p.entries
    ]
    if not entries:
        raise HTTPException(status_code=400, detail="No entries to summarise")
    try:
        result = summarise_process(process_name=p.name, entries=entries)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return result


# ── Backup / restore ───────────────────────────────────────────────────────────

@app.get("/api/backup")
def backup(db: Session = Depends(get_db)):
    """Return full data snapshot as JSON (frontend gzips and downloads it)."""
    workspaces = db.query(Workspace).all()
    users = db.query(User).all()
    active_ws_id = get_active_workspace_id(db)
    snapshot = {
        "format": "threadline-backup",
        "version": 3,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "users": [{"id": u.id, "name": u.name, "email": u.email, "role": u.role} for u in users],
        "activeWorkspaceId": active_ws_id,
        "workspaces": [],
    }
    for w in workspaces:
        ws_dict = {
            "id": w.id, "name": w.name, "ownerId": w.owner_id,
            "processes": [], "upcoming": [],
        }
        for p in w.processes:
            pd = {
                "id": p.id, "name": p.name, "color": p.color, "started": p.started,
                "entries": [entry_to_dict(e) for e in p.entries],
            }
            ws_dict["processes"].append(pd)
        for u in w.upcoming:
            ws_dict["upcoming"].append(upcoming_to_dict(u))
        snapshot["workspaces"].append(ws_dict)
    return snapshot


@app.post("/api/restore")
def restore(body: RestorePayload, db: Session = Depends(get_db)):
    """Restore from a backup payload (frontend decompresses and sends JSON)."""
    snap = body.data
    if snap.get("format") not in ("threadline-backup", "threadline-backup"):
        raise HTTPException(status_code=400, detail="Invalid backup format")

    # Clear existing data
    db.query(Entry).delete()
    db.query(Upcoming).delete()
    db.query(Process).delete()
    db.query(Workspace).delete()
    db.query(User).delete()
    db.query(Meta).delete()
    db.commit()

    # Restore users
    for u in snap.get("users", []):
        db.add(User(id=u["id"], name=u["name"], email=u["email"], role=u.get("role", "user")))
    db.flush()

    # Restore workspaces, processes, entries, upcoming
    for w in snap.get("workspaces", []):
        db.add(Workspace(id=w["id"], name=w["name"], owner_id=w["ownerId"]))
        db.flush()
        for p in w.get("processes", []):
            db.add(Process(
                id=p["id"], workspace_id=w["id"],
                name=p["name"], color=p.get("color", "blue"), started=p.get("started", ""),
            ))
            db.flush()
            for e in p.get("entries", []):
                rd = e.get("recordingData") or {}
                db.add(Entry(
                    id=e["id"], process_id=p["id"],
                    entry_type=e.get("type", "note"),
                    entry_date=e.get("date", ""),
                    sort_date=display_to_iso(e.get("date", "")),
                    title=e.get("title", ""),
                    description=e.get("description", ""),
                    location=e.get("location", ""),
                    tags=json.dumps(e.get("tags", [])),
                    has_recording=bool(e.get("recording")),
                    recording_id=rd.get("id"),
                    recording_name=rd.get("name"),
                    recording_size=str(rd.get("size", "")),
                ))
        for u in w.get("upcoming", []):
            db.add(Upcoming(
                id=u["id"], workspace_id=w["id"],
                title=u.get("title", ""),
                meeting_date=u.get("date", ""),
                meeting_time=u.get("time", ""),
                location=u.get("location", ""),
                description=u.get("description", ""),
                process_id=u.get("processId", ""),
                process_name=u.get("processName", ""),
                status=u.get("status", "pending"),
            ))

    db.add(Meta(key="active_workspace_id", value=snap.get("activeWorkspaceId", "")))
    db.commit()
    return {"ok": True}


# ── Serve frontend ─────────────────────────────────────────────────────────────

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import shutil
    import socket
    import subprocess
    import threading
    import time
    import webbrowser
    import uvicorn

    def find_free_port(preferred: int) -> int:
        """Return preferred port if free, otherwise find the next available one."""
        for port in range(preferred, preferred + 20):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("127.0.0.1", port)) != 0:
                    return port
        raise RuntimeError("No free port found in range.")

    def ensure_ollama():
        """Start Ollama serve if it is installed but not already running."""
        if not shutil.which("ollama"):
            return
        try:
            import urllib.request
            urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2)
            print("✓  Ollama already running")
        except Exception:
            print("→  Starting Ollama...")
            subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            time.sleep(2)
            print("✓  Ollama started")

    preferred_port = int(os.getenv("PORT", "8000"))
    port = find_free_port(preferred_port)
    if port != preferred_port:
        print(f"⚠️   Port {preferred_port} in use — using port {port} instead")
    url = f"http://127.0.0.1:{port}"

    def open_browser():
        time.sleep(1.2)
        webbrowser.open(url)

    ensure_ollama()
    print(f"→  Opening {url}")
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("app:app", host="127.0.0.1", port=port, reload=False)
