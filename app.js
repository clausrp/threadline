import {
  getMeta, setMeta,
  getUsers, saveUser, deleteUser,
  getWorkspaces, saveWorkspace, deleteWorkspace,
  getProcesses, saveProcess, deleteProcess,
  getEntries, saveEntry, deleteEntry,
  getUpcoming, saveUpcoming, deleteUpcoming,
  importAll, exportAll, loadAppState, hasData,
} from "./db.js";

// ── Seed data ─────────────────────────────────────────────────────────────────

const seed = {
  users: [
    { id: "alex", name: "Alex Morgan", email: "alex@example.com", role: "admin" },
    { id: "sam", name: "Sam Taylor", email: "sam@example.com", role: "user" },
    { id: "jordan", name: "Jordan Lee", email: "jordan@example.com", role: "user" }
  ],
  activeWorkspaceId: "personal",
  workspaces: [
    {
      id: "personal", name: "Personal workspace", ownerId: "alex",
      processes: [
        { id: "health", name: "Mum's health journey", color: "blue", started: "Aug 12, 2026", entries: [
          { id: "e1", type: "meeting", date: "Sep 11, 2026", title: "Follow-up with Dr. Chen", description: "Reviewed blood test results and discussed adjusting the medication plan.", tags: ["Minutes added", "Recording"], recording: true },
          { id: "e2", type: "note", date: "Sep 05, 2026", title: "New prescription started", description: "Started the new course of medication. Set a reminder to check in after one week.", tags: ["Personal note"] },
          { id: "e3", type: "milestone", date: "Aug 28, 2026", title: "First specialist appointment", description: "Referral accepted by the neurology team. Appointment confirmed for September.", tags: ["Milestone"] },
          { id: "e4", type: "meeting", date: "Aug 21, 2026", title: "Call with GP practice", description: "Discussed the referral and agreed to keep a record of symptoms before the specialist visit.", tags: ["Minutes added"] },
          { id: "e5", type: "note", date: "Aug 18, 2026", title: "Symptom notes updated", description: "Energy levels seem steadier in the mornings. Added questions for the next appointment.", tags: ["Personal note"] },
          { id: "e6", type: "milestone", date: "Aug 15, 2026", title: "Referral sent to neurology", description: "Referral letter submitted with recent test results and medication history.", tags: ["Milestone"] },
          { id: "e7", type: "meeting", date: "Aug 13, 2026", title: "Initial appointment with Dr. Patel", description: "Collected the initial history and agreed on blood tests and a follow-up plan.", tags: ["Minutes added", "Recording"], recording: true },
          { id: "e8", type: "note", date: "Aug 12, 2026", title: "Started tracking the process", description: "Created this timeline to keep appointments, questions, and decisions together.", tags: ["Personal note"] }
        ]},
        { id: "renovation", name: "House renovation", color: "orange", started: "Jul 03, 2026", entries: [
          { id: "e9", type: "meeting", date: "Sep 03, 2026", title: "Kitchen design review", description: "Agreed on oak fronts and revised lighting plan.", tags: ["Minutes added"] }
        ]},
        { id: "legal", name: "Estate planning", color: "green", started: "May 18, 2026", entries: [
          { id: "e10", type: "meeting", date: "Aug 19, 2026", title: "Meeting with solicitor", description: "Reviewed the first draft of the will and next steps.", tags: ["Minutes added"] }
        ]}
      ],
      upcoming: [
        { id: "u1", day: "16", month: "SEP", date: "2026-09-16", time: "09:30", title: "Medication review", meta: "Wed, 9:30 AM  •  Mum's health journey", location: "GP practice", processId: "health", processName: "Mum's health journey" },
        { id: "u2", day: "30", month: "SEP", date: "2026-09-30", time: "11:00", title: "Specialist preparation call", meta: "Wed, 11:00 AM  •  Mum's health journey", location: "Phone", processId: "health", processName: "Mum's health journey" }
      ]
    }
  ]
};

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const formatEntryDate = (d) => `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2,"0")}, ${d.getFullYear()}`;
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const $ = (s) => document.querySelector(s);

// ── App state ──────────────────────────────────────────────────────────────────

let data = null; // populated by init()
let selectedId = null;
let editingUserId = null;
let editingIndex = null;
let addingUpcomingMeeting = false;
let upcomingEditingIndex = null;
let showAllEntries = false;
let activeFilter = "all";
let searchTerm = "";
let historySort = "newest";
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let sharingProcessId = null;

const dashboardDefaults = { process: true, upcoming: true, insight: true };
let viewState = {};
try { viewState = JSON.parse(localStorage.getItem("threadline-view") || "{}"); } catch { /* ignore */ }

// ── Derived helpers ───────────────────────────────────────────────────────────

const activeWorkspace = () => data.workspaces.find((w) => w.id === data.activeWorkspaceId) || data.workspaces[0];
const currentUser = () => data.users.find((u) => u.id === activeWorkspace()?.ownerId) || data.users[0];
const isAdmin = () => currentUser()?.role === "admin";
const selected = () => data.processes.find((p) => p.id === selectedId) || data.processes[0] || { id: "", name: "No processes yet", entries: [] };
const saveViewState = () => localStorage.setItem("threadline-view", JSON.stringify({ selectedId, showAllEntries, activeFilter, searchTerm, historySort }));

// ── Targeted save helpers ─────────────────────────────────────────────────────

async function persistProcess(process) {
  await saveProcess(process, data.activeWorkspaceId);
}

async function persistEntry(entry, processId) {
  await saveEntry(entry, processId);
}

async function persistUpcoming(meeting) {
  await saveUpcoming(meeting, data.activeWorkspaceId);
}

async function persistMeta() {
  await setMeta("activeWorkspaceId", data.activeWorkspaceId);
}

async function persistUser(user) {
  await saveUser(user);
}

async function persistWorkspace(workspace) {
  await saveWorkspace(workspace);
}

// ── Migration from old localStorage ──────────────────────────────────────────

async function migrateFromLocalStorage() {
  const raw = localStorage.getItem("threadline-data") || localStorage.getItem("threadline-data-backup");
  if (!raw) return false;
  try {
    const old = JSON.parse(raw);
    if (!Array.isArray(old?.processes)) return false;

    // Ensure all records have stable ids
    let idCounter = Date.now();
    const uid = () => `migrated-${idCounter++}-${Math.random().toString(36).slice(2,8)}`;

    old.users ||= [{ id: "alex", name: "Alex Morgan", email: "alex@example.com", role: "admin" }];
    old.users.forEach((u) => { u.role ||= u.id === "alex" ? "admin" : "user"; });
    old.workspaces ||= [{ id: "personal", name: "Personal workspace", ownerId: "alex", processes: old.processes, upcoming: old.upcoming || [] }];
    old.activeWorkspaceId ||= old.workspaces[0]?.id;

    old.workspaces.forEach((ws) => {
      ws.processes ||= [];
      ws.upcoming ||= [];
      ws.processes.forEach((p) => {
        p.entries ||= [];
        p.entries.forEach((e) => { e.id ||= uid(); });
      });
      ws.upcoming.forEach((m) => { m.id ||= uid(); });
    });

    await importAll(old);

    // Clear old localStorage keys
    localStorage.removeItem("threadline-data");
    localStorage.removeItem("threadline-data-backup");
    localStorage.removeItem("threadline-record-journal");
    console.info("Threadline: migrated from localStorage to IndexedDB.");
    return true;
  } catch (error) {
    console.warn("Threadline: localStorage migration failed.", error);
    return false;
  }
}

// ── Upcoming promotion ────────────────────────────────────────────────────────

async function promoteDueMeetings() {
  const now = Date.now();
  let promoted = false;
  const toRemove = [];
  for (const meeting of data.upcoming) {
    if (meeting.status === "completed" || !meeting.date) continue;
    if (new Date(`${meeting.date}T${meeting.time || "23:59"}`).getTime() > now) continue;
    const process = data.processes.find((p) => p.id === meeting.processId || p.name === meeting.processName) || data.processes[0];
    if (!process) continue;
    if (!process.entries.some((e) => e.id === meeting.id)) {
      const entry = {
        id: meeting.id || createId("entry"),
        type: "meeting",
        date: formatEntryDate(new Date(`${meeting.date}T${meeting.time || "12:00"}`)),
        title: meeting.title,
        description: meeting.description || "Upcoming meeting completed.",
        location: meeting.location || "",
        tags: ["Minutes added"],
      };
      process.entries.unshift(entry);
      await persistEntry(entry, process.id);
    }
    meeting.status = "completed";
    meeting.completedAt = new Date().toISOString();
    await persistUpcoming(meeting);
    promoted = true;
    toRemove.push(meeting.id);
  }
  if (promoted) {
    data.upcoming = data.upcoming.filter((m) => !toRemove.includes(m.id) || m.status === "completed");
  }
  return promoted;
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const process = selected();
  const dashboard = { ...dashboardDefaults, ...(activeWorkspace()?.dashboard || {}) };

  document.querySelectorAll("[data-dashboard-object]").forEach((el) => {
    el.hidden = !dashboard[el.dataset.dashboardObject];
  });

  $("#process-list").innerHTML = data.processes.map((p) => `
    <div class="process-row ${p.id === selectedId ? "active" : ""}">
      <button class="process-item" data-process="${p.id}">
        <i class="process-dot" style="background:${p.color === "orange" ? "#ed9a72" : p.color === "green" ? "#93be9e" : "#7eb0bd"}"></i>
        <span>${p.name}</span>
      </button>
      <button class="process-more" data-process-menu="${p.id}" aria-label="Options for ${p.name}">•••</button>
      <div class="process-menu" data-process-menu-panel="${p.id}" hidden>
        <button data-share-process="${p.id}">⇧ Share process</button>
        <button data-delete-process="${p.id}">⌫ Delete process</button>
      </div>
    </div>`).join("");

  $("#workspace-label").textContent = activeWorkspace()?.name || "Personal workspace";
  $("#process-count").textContent = data.processes.length;
  $("#active-count").textContent = data.processes.length;
  $("#selected-title").textContent = process.name;
  $("#breadcrumb-title").textContent = process.name;

  const matchingEntries = process.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => activeFilter === "all" || entry.type === activeFilter)
    .filter(({ entry }) => !searchTerm || `${entry.title} ${entry.description} ${entry.date}`.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const diff = new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime();
      return historySort === "newest" ? diff : -diff;
    });

  const visibleEntries = showAllEntries || activeFilter !== "all" || searchTerm
    ? matchingEntries
    : matchingEntries.slice(0, 4);

  $("#timeline").innerHTML = visibleEntries.length
    ? visibleEntries.map(({ entry: e, index }) => `
        <article class="timeline-entry ${e.type}" data-entry-index="${index}" title="Edit entry">
          <div class="entry-date">${e.date}</div>
          <div class="entry-title">${e.title}</div>
          <div class="entry-description">${e.description || ""}</div>
          <div class="entry-tags">${(e.tags || []).map((t) => `<span class="tag ${t === "Recording" ? "recording-tag" : ""}">${t === "Recording" ? "◉ " : ""}${t}</span>`).join("")}</div>
        </article>`).join("")
    : `<p class="empty-results">No matching events found.</p>`;

  $("#show-all").hidden = Boolean(searchTerm || activeFilter !== "all");
  $("#show-all").innerHTML = showAllEntries
    ? "Show fewer entries <span>↑</span>"
    : `View all ${process.entries.length} entries <span>→</span>`;

  const activeUpcoming = data.upcoming.filter((m) => m.status !== "completed");
  const upcomingEntries = activeUpcoming
    .map((meeting, index) => ({ meeting, index }))
    .sort((a, b) => {
      const aDate = a.meeting.date ? new Date(`${a.meeting.date}T${a.meeting.time || "23:59"}`).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.meeting.date ? new Date(`${b.meeting.date}T${b.meeting.time || "23:59"}`).getTime() : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });

  $("#upcoming-list").innerHTML = upcomingEntries.map(({ meeting: m, index }) => `
    <div class="upcoming-item" data-upcoming-index="${index}" title="Edit upcoming meeting">
      <div class="date-block"><strong>${m.day}</strong><small>${m.month}</small></div>
      <div>
        <h4>${m.title}</h4><p>${m.meta}</p>
        <p class="upcoming-location">⌖ ${m.location || "To be confirmed"}</p>
      </div>
    </div>`).join("");

  document.querySelectorAll("[data-upcoming-index]").forEach((el) =>
    el.addEventListener("click", () => openUpcomingEdit(Number(el.dataset.upcomingIndex))));

  $("#meeting-count").textContent = activeUpcoming.length;
  $("#notes-count").textContent = data.processes.reduce((n, p) => n + p.entries.length, 0);

  document.querySelectorAll("[data-process]").forEach((b) =>
    b.addEventListener("click", () => { selectedId = b.dataset.process; showAllEntries = false; render(); }));
  document.querySelectorAll("[data-process-menu]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll("[data-process-menu-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.processMenuPanel !== b.dataset.processMenu;
      });
    }));
  document.querySelectorAll("[data-share-process]").forEach((b) =>
    b.addEventListener("click", () => openShareModal(b.dataset.shareProcess)));
  document.querySelectorAll("[data-entry-index]").forEach((el) =>
    el.addEventListener("click", () => openEditModal(Number(el.dataset.entryIndex))));

  saveViewState();
}

// ── Modals ────────────────────────────────────────────────────────────────────

function openModal(upcomingMeeting = false) {
  editingIndex = null;
  upcomingEditingIndex = null;
  addingUpcomingMeeting = upcomingMeeting;
  $("#modal-eyebrow").textContent = upcomingMeeting ? "NEW UPCOMING MEETING" : "NEW TIMELINE ENTRY";
  $("#modal-title").textContent = "Add a meeting";
  $("#entry-form").querySelector("[type=submit]").textContent = "Save";
  $("#delete-entry").hidden = true;
  $("#modal-subtitle").textContent = "Capture the details while they're fresh.";
  $("#entry-type").value = "meeting";
  $("#entry-date").value = new Date().toISOString().slice(0, 10);
  $("#entry-time").value = "10:00";
  $("#entry-title").value = "";
  $("#entry-location").value = "";
  $("#entry-notes").value = "";
  $("#recording-label").textContent = "Attach a recording";
  $("#recording-status").textContent = "Audio or video; limited by available browser storage";
  $("#modal-backdrop").hidden = false;
}

function openEditModal(index) {
  const entry = selected().entries[index];
  if (!entry) return;
  editingIndex = index;
  upcomingEditingIndex = null;
  addingUpcomingMeeting = false;
  $("#modal-eyebrow").textContent = "EDIT ENTRY";
  $("#modal-title").textContent = "Edit entry";
  $("#entry-form").querySelector("[type=submit]").textContent = "Update";
  $("#delete-entry").hidden = false;
  $("#entry-type").value = entry.type || "meeting";
  try { $("#entry-date").value = new Date(entry.date).toISOString().slice(0, 10); } catch { $("#entry-date").value = ""; }
  $("#entry-time").value = entry.time || "10:00";
  $("#entry-title").value = entry.title || "";
  $("#entry-location").value = entry.location || "";
  $("#entry-notes").value = entry.description || "";
  $("#recording-label").textContent = entry.recordingData?.name || "Attach a recording";
  $("#recording-status").textContent = entry.recordingData
    ? `${Math.ceil((entry.recordingData.size || 0) / 1024 / 1024)} MB attached`
    : "Audio or video; limited by available browser storage";
  $("#modal-backdrop").hidden = false;
}

function openUpcomingEdit(index) {
  const meeting = data.upcoming.filter((m) => m.status !== "completed")[index];
  if (!meeting) return;
  upcomingEditingIndex = data.upcoming.indexOf(meeting);
  editingIndex = null;
  addingUpcomingMeeting = false;
  $("#modal-eyebrow").textContent = "EDIT UPCOMING MEETING";
  $("#modal-title").textContent = "Edit upcoming meeting";
  $("#entry-form").querySelector("[type=submit]").textContent = "Update";
  $("#delete-entry").hidden = false;
  $("#entry-type").value = "meeting";
  $("#entry-date").value = meeting.date || "";
  $("#entry-time").value = meeting.time || "10:00";
  $("#entry-title").value = meeting.title || "";
  $("#entry-location").value = meeting.location || "";
  $("#entry-notes").value = meeting.description || "";
  $("#recording-label").textContent = "Attach a recording";
  $("#recording-status").textContent = "Audio or video; limited by available browser storage";
  $("#modal-backdrop").hidden = false;
}

function closeModal() {
  $("#modal-backdrop").hidden = true;
  $("#entry-form").reset();
  editingIndex = null;
  upcomingEditingIndex = null;
  addingUpcomingMeeting = false;
}

function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function meetingDate(meeting) {
  if (meeting.date) return new Date(`${meeting.date}T${meeting.time || "12:00"}`);
  const month = new Date(`${meeting.month || ""} 1, ${calendarMonth.getFullYear()}`).getMonth();
  return Number.isFinite(month) && meeting.day
    ? new Date(calendarMonth.getFullYear(), month, Number(meeting.day), 12)
    : null;
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  $("#calendar-title").textContent = calendarMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const meetings = data.upcoming
    .filter((m) => m.status !== "completed")
    .map((m) => ({ meeting: m, date: meetingDate(m) }))
    .filter(({ date }) => date && date.getFullYear() === year && date.getMonth() === month)
    .sort((a, b) => a.date - b.date);
  $("#calendar-list").innerHTML = meetings.map(({ meeting, date }) => {
    const time = meeting.time ? new Date(`2000-01-01T${meeting.time}`).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
    const processName = data.processes.find((p) => p.id === meeting.processId)?.name || meeting.processName || "";
    return `<article class="calendar-meeting">
      <div class="calendar-date"><strong>${date.toLocaleDateString("en-GB", { day: "numeric" })}</strong><span>${date.toLocaleDateString("en-GB", { weekday: "short" })}</span></div>
      <div class="calendar-meeting-details"><h3>${meeting.title}</h3><p>${time} · ${meeting.location || "Location to be confirmed"}</p><small>${processName}</small></div>
    </article>`;
  }).join("");
  $("#calendar-empty").hidden = meetings.length > 0;
}

function openCalendar() {
  calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  renderCalendar();
  $("#calendar-backdrop").hidden = false;
}

// ── AI summary (placeholder) ──────────────────────────────────────────────────

function generateSummary() {
  toast("Your case summary is ready — 3 key threads found.");
  setTimeout(() => alert(`CASE SUMMARY — ${selected().name}\n\nThe process has ${selected().entries.length} recorded entries. Recent activity includes ${selected().entries[0]?.title || "no entries"}.\n\nNext suggested step: review the upcoming commitments and add any follow-up notes.`), 400);
}

// ── CSV export ────────────────────────────────────────────────────────────────

function escapeCsv(value) {
  const str = String(value ?? "").replace(/"/g, '""');
  return /[,"\n]/.test(str) ? `"${str}"` : str;
}

function exportAllEvents() {
  const process = selected();
  const rows = process.entries
    .map((entry) => ({ date: entry.date, process: process.name, type: entry.type, title: entry.title, summary: entry.description }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const csv = [
    ["Date", "Process", "Type", "Title", "Summary"].map(escapeCsv).join(","),
    ...rows.map((row) => [row.date, row.process, row.type, row.title, row.summary].map(escapeCsv).join(","))
  ].join("\n");
  const safeProcessName = process.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `${safeProcessName}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── Gzip helpers ──────────────────────────────────────────────────────────────

async function gzipText(text) {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

async function gunzipText(buffer) {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(buffer);
  writer.close();
  return new TextDecoder().decode(await new Response(stream.readable).arrayBuffer());
}

// ── Backup / restore ──────────────────────────────────────────────────────────

async function backupAllData() {
  try {
    const snapshot = await exportAll();
    const backup = {
      format: "threadline-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      processCount: snapshot.processes.length,
      eventCount: snapshot.processes.reduce((n, p) => n + p.entries.length, 0),
      data: snapshot,
    };
    const compressed = await gzipText(JSON.stringify(backup));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([compressed], { type: "application/gzip" }));
    link.download = `threadline-backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("Compressed backup downloaded.");
  } catch {
    toast("This browser cannot create compressed backups.");
  }
}

async function restoreBackup(file) {
  try {
    const raw = await gunzipText(await file.arrayBuffer());
    const backup = JSON.parse(raw);
    if (backup.format !== "threadline-backup" || !Array.isArray(backup.data?.processes)) throw new Error("Invalid backup");
    await importAll(backup.data);
    data = await loadAppState();
    selectedId = data.processes[0]?.id;
    activeFilter = "all"; searchTerm = ""; showAllEntries = false;
    render();
    toast("Backup restored successfully.");
  } catch {
    toast("That file is not a valid compressed Threadline backup.");
  }
}

// ── Recordings (separate IDB database — unchanged) ────────────────────────────

function storeRecording(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("threadline-recordings", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const id = `recording-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tx = request.result.transaction("recordings", "readwrite");
      tx.objectStore("recordings").put({ id, name: file.name, type: file.type, size: file.size, blob: file });
      tx.oncomplete = () => resolve({ id, name: file.name, type: file.type, size: file.size });
      tx.onerror = () => reject(tx.error);
    };
  });
}

// ── User editor ───────────────────────────────────────────────────────────────

function openUserEditor(user, canChangeRole = false) {
  if (!user) return;
  editingUserId = user.id;
  $("#edit-user-name").value = user.name;
  $("#edit-user-email").value = user.email;
  $("#edit-user-admin").checked = user.role === "admin";
  $("#edit-user-admin-label").hidden = !canChangeRole;
  $("#edit-user-backdrop").hidden = false;
}

// ── Share modal ───────────────────────────────────────────────────────────────

function openShareModal(processId) {
  sharingProcessId = processId;
  const process = data.processes.find((p) => p.id === processId);
  $("#share-process-name").textContent = process ? `Choose users who can access "${process.name}".` : "";
  $("#share-user-list").innerHTML = data.users
    .filter((u) => u.id !== currentUser().id)
    .map((u) => `<label class="share-user"><input type="checkbox" value="${u.id}" ${(process?.sharedWith || []).includes(u.id) ? "checked" : ""}><span><strong>${u.name}</strong><small>${u.email}</small></span></label>`)
    .join("");
  $("#share-backdrop").hidden = false;
}

function closeShareModal() { $("#share-backdrop").hidden = true; sharingProcessId = null; }

// ── Workspace helpers ─────────────────────────────────────────────────────────

function renderWorkspaces() {
  $("#workspace-list").innerHTML = data.workspaces.map((w) => `
    <div class="workspace-option ${w.id === data.activeWorkspaceId ? "active" : ""}">
      <span><strong>${w.name}</strong><small>${w.processes?.length ?? 0} processes</small></span>
      <button class="button button-outline" data-switch-workspace="${w.id}">${w.id === data.activeWorkspaceId ? "Current" : "Switch"}</button>
    </div>`).join("");
  document.querySelectorAll("[data-switch-workspace]").forEach((b) =>
    b.addEventListener("click", () => switchWorkspace(b.dataset.switchWorkspace)));
}

function renderAdminPeople() {
  $("#backup-settings-card").hidden = !isAdmin();
  $("#restore-settings-card").hidden = !isAdmin();
  $("#admin-user-settings").hidden = !isAdmin();
  $("#edit-user-admin-label").hidden = !isAdmin();
  const dashboard = { ...dashboardDefaults, ...(activeWorkspace()?.dashboard || {}) };
  document.querySelectorAll("[data-dashboard-setting]").forEach((input) => { input.checked = dashboard[input.dataset.dashboardSetting]; });
  $("#admin-people-list").innerHTML = [...data.users]
    .sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin"))
    .map((u) => `<div class="person-row"><span><strong>${u.name}</strong><small>${u.email} · ${u.role === "admin" ? "Admin" : "User"}</small></span>${u.id !== currentUser().id ? `<span><button data-edit-person="${u.id}">Edit</button><button data-admin-remove-person="${u.id}">Remove user</button></span>` : `<small>Admin</small>`}</div>`)
    .join("");
  document.querySelectorAll("[data-edit-person]").forEach((b) => b.addEventListener("click", () => {
    const user = data.users.find((u) => u.id === b.dataset.editPerson);
    if (user) openUserEditor(user, true);
  }));
  document.querySelectorAll("[data-admin-remove-person]").forEach((b) => b.addEventListener("click", async () => {
    const userId = b.dataset.adminRemovePerson;
    data.users = data.users.filter((u) => u.id !== userId);
    data.workspaces = data.workspaces.filter((w) => w.ownerId !== userId);
    data.workspaces.forEach((w) => w.processes?.forEach((p) => { p.sharedWith = (p.sharedWith || []).filter((id) => id !== userId); }));
    if (!data.workspaces.some((w) => w.id === data.activeWorkspaceId)) {
      const next = data.workspaces[0];
      data.activeWorkspaceId = next.id;
      data.processes = next.processes;
      data.upcoming = next.upcoming;
      selectedId = data.processes[0]?.id;
    }
    await deleteUser(userId);
    await persistMeta();
    render(); renderAdminPeople();
    toast("User and workspace removed.");
  }));
}

function renderDashboardSettings() {
  const dashboard = { ...dashboardDefaults, ...(activeWorkspace()?.dashboard || {}) };
  document.querySelectorAll("[data-dashboard-setting]").forEach((input) => {
    input.checked = dashboard[input.dataset.dashboardSetting];
    input.onchange = async () => {
      const ws = activeWorkspace();
      ws.dashboard = { ...dashboardDefaults, ...(ws.dashboard || {}), [input.dataset.dashboardSetting]: input.checked };
      await persistWorkspace(ws);
      render();
    };
  });
}

async function switchWorkspace(workspaceId) {
  if (workspaceId === data.activeWorkspaceId) return;
  const next = data.workspaces.find((w) => w.id === workspaceId);
  if (!next) return;
  data.activeWorkspaceId = workspaceId;
  data.processes = next.processes;
  data.upcoming = next.upcoming;
  selectedId = data.processes[0]?.id;
  activeFilter = "all"; searchTerm = ""; showAllEntries = false;
  await persistMeta();
  render(); renderWorkspaces();
  toast(`Switched to ${next.name}.`);
}

async function removeWorkspace(workspaceId) {
  if (data.workspaces.length === 1) return;
  const index = data.workspaces.findIndex((w) => w.id === workspaceId);
  if (index < 0) return;
  data.workspaces.splice(index, 1);
  if (workspaceId === data.activeWorkspaceId) {
    const next = data.workspaces[0];
    data.activeWorkspaceId = next.id;
    data.processes = next.processes;
    data.upcoming = next.upcoming;
    selectedId = data.processes[0]?.id;
  }
  await deleteWorkspace(workspaceId);
  await persistMeta();
  render(); renderWorkspaces();
  toast("Workspace removed.");
}

// ── Event listeners ───────────────────────────────────────────────────────────

$("#new-entry").addEventListener("click", () => openModal(false));
$("#add-meeting").addEventListener("click", () => { $("#upcoming-menu").hidden = true; openModal(true); });
$("#upcoming-menu-button").addEventListener("click", () => { const menu = $("#upcoming-menu"); menu.hidden = !menu.hidden; $("#upcoming-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); });
$("#timeline-menu-button").addEventListener("click", () => { const menu = $("#timeline-menu"); menu.hidden = !menu.hidden; $("#timeline-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); });
$("#sort-newest").addEventListener("click", () => { historySort = "newest"; $("#timeline-menu").hidden = true; render(); toast("History sorted newest first."); });
$("#sort-oldest").addEventListener("click", () => { historySort = "oldest"; $("#timeline-menu").hidden = true; render(); toast("History sorted oldest first."); });
document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { activeFilter = b.dataset.filter; showAllEntries = true; $("#timeline-menu").hidden = true; render(); toast(activeFilter === "all" ? "Showing all event types." : `Showing ${activeFilter}s only.`); }));
$("#menu-search").addEventListener("click", () => { $("#timeline-menu").hidden = true; $("#search-popover").hidden = false; $("#event-search").focus(); });
$("#export-events").addEventListener("click", exportAllEvents);
$("#share-close").addEventListener("click", closeShareModal);
$("#cancel-share").addEventListener("click", closeShareModal);
$("#save-share").addEventListener("click", async () => {
  const process = data.processes.find((p) => p.id === sharingProcessId);
  if (!process) return;
  process.sharedWith = [...document.querySelectorAll("#share-user-list input:checked")].map((input) => input.value);
  await persistProcess(process);
  closeShareModal();
  toast(`Access updated for ${process.name}.`);
});
$("#workspace-switcher").addEventListener("click", () => { renderWorkspaces(); $("#workspace-backdrop").hidden = false; });
$("#workspace-close").addEventListener("click", () => { $("#workspace-backdrop").hidden = true; });
$("#workspace-backdrop").addEventListener("click", (e) => { if (e.target.id === "workspace-backdrop") $("#workspace-backdrop").hidden = true; });
$("#admin-add-person").addEventListener("click", async () => {
  const name = $("#admin-person-name").value.trim();
  const email = $("#admin-person-email").value.trim();
  if (!name || !email) return;
  const userId = `user-${Date.now()}`;
  const role = $("#admin-person-admin").checked ? "admin" : "user";
  const user = { id: userId, name, email, role };
  const workspace = { id: `workspace-${Date.now()}`, name: `${name}'s workspace`, ownerId: userId };
  data.users.push(user);
  data.workspaces.push({ ...workspace, processes: [], upcoming: [] });
  await persistUser(user);
  await persistWorkspace(workspace);
  $("#admin-person-name").value = "";
  $("#admin-person-email").value = "";
  $("#admin-person-admin").checked = false;
  renderAdminPeople();
  toast(`${name} and their workspace were added.`);
});
$("#edit-user-close").addEventListener("click", () => { $("#edit-user-backdrop").hidden = true; editingUserId = null; });
$("#cancel-edit-user").addEventListener("click", () => { $("#edit-user-backdrop").hidden = true; editingUserId = null; });
$("#save-edit-user").addEventListener("click", async () => {
  const user = data.users.find((u) => u.id === editingUserId);
  const name = $("#edit-user-name").value.trim();
  const email = $("#edit-user-email").value.trim();
  if (!user || !name || !email) return;
  const oldName = user.name;
  user.name = name;
  user.email = email;
  if (isAdmin()) user.role = $("#edit-user-admin").checked ? "admin" : "user";
  const workspace = data.workspaces.find((w) => w.ownerId === user.id);
  if (workspace) { workspace.name = `${name}'s workspace`; await persistWorkspace(workspace); }
  await persistUser(user);
  renderAdminPeople();
  $("#edit-user-backdrop").hidden = true;
  editingUserId = null;
  toast(`${oldName} updated.`);
});
$("#cancel-delete-process").addEventListener("click", () => { $("#delete-process-backdrop").hidden = true; });
$("#confirm-delete-process").addEventListener("click", async () => {
  if (data.processes.length === 1) { $("#delete-process-backdrop").hidden = true; toast("Keep at least one process in your workspace."); return; }
  const removed = selected();
  const removedIndex = data.processes.findIndex((p) => p.id === selectedId);
  data.processes.splice(removedIndex, 1);
  selectedId = data.processes[Math.max(0, removedIndex - 1)].id;
  activeFilter = "all"; searchTerm = ""; showAllEntries = false;
  await deleteProcess(removed.id);
  render();
  $("#delete-process-backdrop").hidden = true;
  toast(`${removed.name} deleted.`);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".timeline-actions") && !e.target.closest("#search-popover")) $("#timeline-menu").hidden = true;
  if (!e.target.closest(".process-row")) document.querySelectorAll("[data-process-menu-panel]").forEach((p) => { p.hidden = true; });
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-delete-process]");
  if (!btn) return;
  e.preventDefault(); e.stopPropagation();
  selectedId = btn.dataset.deleteProcess;
  document.querySelectorAll("[data-process-menu-panel]").forEach((p) => { p.hidden = true; });
  $("#delete-process-backdrop").hidden = false;
}, true);
$("#modal-close").addEventListener("click", closeModal);
$("#cancel-entry").addEventListener("click", closeModal);
$("#delete-entry").addEventListener("click", async () => {
  if (editingIndex !== null) {
    const entry = selected().entries[editingIndex];
    selected().entries.splice(editingIndex, 1);
    if (entry?.id) await deleteEntry(entry.id);
    render(); closeModal(); toast("Entry deleted.");
  } else if (upcomingEditingIndex !== null) {
    const meeting = data.upcoming[upcomingEditingIndex];
    data.upcoming.splice(upcomingEditingIndex, 1);
    if (meeting?.id) await deleteUpcoming(meeting.id);
    render(); closeModal(); toast("Upcoming meeting deleted.");
  }
});
$("#modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
$("#entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const file = $("#entry-recording").files[0];
    if (!$("#entry-title").value.trim() || !$("#entry-date").value) { toast("Add a title and date before saving."); return; }
    const existingEntry = editingIndex === null ? null : selected().entries[editingIndex];
    const date = new Date(`${$("#entry-date").value}T${$("#entry-time").value || "12:00"}`);
    const process = selected();
    const recording = file ? await storeRecording(file) : existingEntry?.recordingData;
    const hasRecording = Boolean(file) || Boolean(existingEntry?.recording || existingEntry?.recordingData);
    const location = $("#entry-location").value.trim();

    // Editing an upcoming meeting
    if (upcomingEditingIndex !== null) {
      const meeting = data.upcoming[upcomingEditingIndex];
      meeting.day = String(date.getDate()).padStart(2, "0");
      meeting.month = MONTHS[date.getMonth()].toUpperCase();
      meeting.date = $("#entry-date").value;
      meeting.time = $("#entry-time").value || "12:00";
      meeting.title = $("#entry-title").value.trim();
      meeting.meta = `${meeting.time} • ${process.name}`;
      meeting.location = location;
      meeting.description = $("#entry-notes").value.trim();
      await persistUpcoming(meeting);
      render(); closeModal(); toast("Upcoming meeting updated.");
      return;
    }

    // New or edited timeline entry
    const updatedEntry = {
      id: existingEntry?.id || createId("entry"),
      type: $("#entry-type").value,
      date: formatEntryDate(date),
      title: $("#entry-title").value.trim(),
      description: $("#entry-notes").value || "Entry captured in Threadline.",
      location,
      tags: [$("#entry-type").value === "meeting" ? "Minutes added" : "Personal note", ...(hasRecording ? ["Recording"] : [])],
      recording: hasRecording,
      ...(recording ? { recordingData: recording } : {}),
    };
    const wasEditing = editingIndex !== null;
    if (!addingUpcomingMeeting && !wasEditing) process.entries.unshift(updatedEntry);
    else if (!addingUpcomingMeeting) process.entries[editingIndex] = updatedEntry;
    await persistEntry(updatedEntry, process.id);

    // New upcoming meeting
    if (addingUpcomingMeeting) {
      const meeting = {
        id: createId("meeting"),
        day: String(date.getDate()).padStart(2, "0"),
        month: MONTHS[date.getMonth()].toUpperCase(),
        title: $("#entry-title").value.trim(),
        meta: `${$("#entry-time").value || "12:00"} • ${process.name}`,
        location,
        date: $("#entry-date").value,
        time: $("#entry-time").value || "12:00",
        processId: process.id,
        processName: process.name,
        description: $("#entry-notes").value.trim(),
      };
      data.upcoming.unshift(meeting);
      await persistUpcoming(meeting);
      await promoteDueMeetings();
    }

    render(); closeModal();
    toast(wasEditing ? "Entry updated." : (file ? "Entry and recording saved." : "Entry saved to the timeline."));
  } catch (error) {
    console.error(error);
    toast(`The entry could not be saved: ${error.message || "check browser storage and try again."}`);
  }
});
$("#entry-recording").addEventListener("change", () => {
  const file = $("#entry-recording").files[0];
  if (!file) return;
  $("#recording-label").textContent = file.name;
  $("#recording-status").textContent = `${Math.ceil(file.size / 1024 / 1024)} MB recording selected`;
});
$("#history-summary").addEventListener("click", generateSummary);
$("#generate-overview").addEventListener("click", generateSummary);
$("#show-all").addEventListener("click", () => { showAllEntries = !showAllEntries; render(); });
$("#open-calendar").addEventListener("click", openCalendar);
$("#calendar-close").addEventListener("click", () => { $("#calendar-backdrop").hidden = true; });
$("#calendar-previous").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
$("#calendar-next").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$("#calendar-backdrop").addEventListener("click", (e) => { if (e.target.id === "calendar-backdrop") $("#calendar-backdrop").hidden = true; });
$("#add-process").addEventListener("click", async () => {
  const name = prompt("Name this process");
  if (!name?.trim()) return;
  const id = createId("process");
  const process = { id, name: name.trim(), color: "blue", started: formatEntryDate(new Date()), entries: [] };
  data.processes.push(process);
  selectedId = id;
  await persistProcess(process);
  render(); toast("New process created.");
});
$("#settings-button").addEventListener("click", () => { renderAdminPeople(); renderDashboardSettings(); $("#settings-backdrop").hidden = false; });
$("#edit-my-profile").addEventListener("click", () => { $("#settings-backdrop").hidden = true; openUserEditor(currentUser(), false); });
$("#settings-close").addEventListener("click", () => { $("#settings-backdrop").hidden = true; });
$("#settings-backdrop").addEventListener("click", (e) => { if (e.target.id === "settings-backdrop") $("#settings-backdrop").hidden = true; });
$("#settings-backup").addEventListener("click", backupAllData);
$("#settings-restore").addEventListener("click", () => { $("#settings-backdrop").hidden = true; $("#restore-file").click(); });
$("#restore-file").addEventListener("change", (e) => { if (e.target.files[0]) restoreBackup(e.target.files[0]); e.target.value = ""; });
$("#event-search").addEventListener("input", (e) => { searchTerm = e.target.value.trim(); showAllEntries = true; render(); });
$("#clear-search").addEventListener("click", () => { searchTerm = ""; $("#event-search").value = ""; render(); $("#event-search").focus(); });
document.addEventListener("click", (e) => { if (!e.target.closest(".timeline-actions") && !e.target.closest("#search-popover")) { $("#timeline-menu").hidden = true; } });

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  // 1. Migrate from old localStorage if present
  if (!(await hasData())) {
    const migrated = await migrateFromLocalStorage();
    if (!migrated) {
      // Fresh install — seed the database
      await importAll(seed);
    }
  }

  // 2. Load full app state from IndexedDB
  data = await loadAppState();

  // 3. Restore view state
  selectedId = data.processes.some((p) => p.id === viewState.selectedId) ? viewState.selectedId : data.processes[0]?.id;
  showAllEntries = Boolean(viewState.showAllEntries);
  activeFilter = viewState.activeFilter || "all";
  searchTerm = viewState.searchTerm || "";
  historySort = viewState.historySort === "oldest" ? "oldest" : "newest";

  // 4. Promote any past upcoming meetings
  await promoteDueMeetings();

  // 5. First render
  render();

  // 6. Periodic re-render (upcoming promotion check)
  setInterval(async () => { await promoteDueMeetings(); render(); }, 30000);
}

init().catch((error) => {
  console.error("Threadline failed to start.", error);
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif"><h2>Threadline could not start</h2><p>${error.message}</p><p>Try clearing site data in your browser settings and reloading.</p></div>`;
});
