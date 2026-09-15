"""
Threadline — SQLAlchemy models and database setup.
Database: threadline.db (SQLite, single file in the project root)
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, String, Text, create_engine, event,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

# ── Database path ──────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent.parent / "threadline.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(conn, _record):
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Base ───────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Models ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id    = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name  = Column(String, nullable=False)
    email = Column(String, nullable=False)
    role  = Column(String, nullable=False, default="user")  # "admin" | "user"

    workspaces = relationship("Workspace", back_populates="owner", cascade="all, delete-orphan")


class Workspace(Base):
    __tablename__ = "workspaces"

    id        = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name      = Column(String, nullable=False)
    owner_id  = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    dashboard = Column(Text, nullable=True)  # JSON: {"process":true,"upcoming":true,"insight":true}

    owner    = relationship("User", back_populates="workspaces")
    processes = relationship(
        "Process", back_populates="workspace",
        cascade="all, delete-orphan",
        order_by="Process.created_at",
    )
    upcoming = relationship("Upcoming", back_populates="workspace", cascade="all, delete-orphan")


class Process(Base):
    __tablename__ = "processes"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name         = Column(String, nullable=False)
    color        = Column(String, nullable=False, default="blue")
    started      = Column(String, nullable=False)   # display string e.g. "Sep 13, 2026"
    shared_with  = Column(Text, nullable=True)       # JSON array of user ids
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    workspace = relationship("Workspace", back_populates="processes")
    entries   = relationship(
        "Entry", back_populates="process",
        cascade="all, delete-orphan",
        order_by="Entry.sort_date.desc()",
    )


class Entry(Base):
    __tablename__ = "entries"

    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    process_id     = Column(String, ForeignKey("processes.id", ondelete="CASCADE"), nullable=False)
    entry_type     = Column(String, nullable=False)   # "meeting" | "note" | "milestone"
    entry_date     = Column(String, nullable=False)   # display string e.g. "Sep 11, 2026"
    sort_date      = Column(String, nullable=False)   # ISO "YYYY-MM-DD" for sorting
    title          = Column(String, nullable=False)
    description    = Column(Text, nullable=True)
    location       = Column(String, nullable=True)
    tags           = Column(Text, nullable=True)       # JSON array
    has_recording  = Column(Boolean, default=False)
    recording_id   = Column(String, nullable=True)
    recording_name = Column(String, nullable=True)
    recording_size = Column(String, nullable=True)
    transcript     = Column(Text, nullable=True)
    ai_summary     = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    process = relationship("Process", back_populates="entries")


class Upcoming(Base):
    __tablename__ = "upcoming"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    title        = Column(String, nullable=False)
    meeting_date = Column(String, nullable=True)   # "YYYY-MM-DD"
    meeting_time = Column(String, nullable=True)   # "HH:MM"
    location     = Column(String, nullable=True)
    description  = Column(Text, nullable=True)
    process_id   = Column(String, nullable=True)
    process_name = Column(String, nullable=True)
    status       = Column(String, nullable=False, default="pending")  # "pending" | "completed"
    completed_at = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    workspace = relationship("Workspace", back_populates="upcoming")


class Meta(Base):
    __tablename__ = "meta"

    key   = Column(String, primary_key=True)
    value = Column(Text, nullable=True)


# ── Schema creation ────────────────────────────────────────────────────────────

def create_tables():
    Base.metadata.create_all(bind=engine)


# ── Seed data ──────────────────────────────────────────────────────────────────

def seed_database(db: Session):
    """Insert default data on first run (no-op if data already exists)."""
    if db.query(User).count() > 0:
        return

    admin = User(id="user-admin", name="Claus Ramstedt Petersen", email="claus.ramstedt@gmail.com", role="admin")
    db.add(admin)
    db.flush()

    workspace = Workspace(id="ws-personal", name="Claus's workspace", owner_id=admin.id)
    db.add(workspace)
    db.flush()

    db.add(Meta(key="active_workspace_id", value=workspace.id))

    health = Process(
        id="proc-health", workspace_id=workspace.id,
        name="Mum's health journey", color="blue", started="Aug 12, 2026",
    )
    db.add(health)
    db.flush()

    for entry_data in [
        ("entry-e1", "meeting", "Sep 11, 2026", "2026-09-11", "Follow-up with Dr. Chen",
         "Reviewed blood test results and discussed adjusting the medication plan.", ["Minutes added"]),
        ("entry-e2", "note", "Sep 05, 2026", "2026-09-05", "New prescription started",
         "Started the new course of medication. Set a reminder to check in after one week.", ["Personal note"]),
        ("entry-e3", "milestone", "Aug 28, 2026", "2026-08-28", "First specialist appointment",
         "Referral accepted by the neurology team. Appointment confirmed for September.", ["Milestone"]),
    ]:
        db.add(Entry(
            id=entry_data[0], process_id=health.id,
            entry_type=entry_data[1], entry_date=entry_data[2], sort_date=entry_data[3],
            title=entry_data[4], description=entry_data[5], tags=json.dumps(entry_data[6]),
        ))

    db.add(Upcoming(
        id="upcoming-u1", workspace_id=workspace.id,
        title="Medication review", meeting_date="2026-09-16", meeting_time="09:30",
        location="GP practice", process_id=health.id, process_name=health.name,
    ))

    db.commit()
