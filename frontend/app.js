/**
 * Threadline — frontend app
 * All data operations go through the local FastAPI backend at /api/*
 * No IndexedDB or localStorage for data — only view state is kept locally.
 */

// ── API helpers ───────────────────────────────────────────────────────────────

const API = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.status === 204 ? null : res.json();
  },
  async patch(path, body) {
    const res = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.json();
  },
  async delete(path) {
    const res = await fetch(path, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return null;
  },
  async upload(path, file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(path, { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    return res.json();
  },
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const $ = (s) => document.querySelector(s);

// ── App state ─────────────────────────────────────────────────────────────────

let data = null;
let selectedId = null;
let editingEntryId = null;
let editingUpcomingId = null;
let addingUpcomingMeeting = false;
let showAllEntries = false;
let activeFilter = "all";
let searchTerm = "";
let historySort = "newest";
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let sharingProcessId = null;
let editingUserId = null;

const dashboardDefaults = { process: true, upcoming: true, insight: true };
let viewState = {};
try { viewState = JSON.parse(localStorage.getItem("threadline-view") || "{}"); } catch { /**/ }

// ── Derived helpers ───────────────────────────────────────────────────────────

const activeWorkspace = () => data.workspaces.find((w) => w.id === data.activeWorkspaceId) || data.workspaces[0];
const currentUser = () => data.users.find((u) => u.id === activeWorkspace()?.ownerId) || data.users[0];
const isAdmin = () => currentUser()?.role === "admin";
const selected = () => data.processes.find((p) => p.id === selectedId) || data.processes[0] || { id: "", name: "No processes yet", entries: [] };
const saveViewState = () => localStorage.setItem("threadline-view", JSON.stringify({ selectedId, showAllEntries, activeFilter, searchTerm, historySort }));

// ── Render ────────────────────────────────────────────────────────────────────

const isOverview = () => selectedId === null;

function render() {
  const overview = isOverview();
  const process = overview ? null : selected();
  const dashboard = { ...dashboardDefaults, ...(activeWorkspace()?.dashboard || {}) };

  document.querySelectorAll("[data-dashboard-object]").forEach((el) => {
    el.hidden = !dashboard[el.dataset.dashboardObject];
  });

  // Sidebar nav — highlight Overview when no process selected
  document.querySelectorAll(".primary-nav .nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === "overview" && overview);
  });

  $("#process-list").innerHTML = data.processes.map((p) => `
    <div class="process-row ${!overview && p.id === selectedId ? "active" : ""}">
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

  // ── History panel ─────────────────────────────────────────────────────────

  const historyTitle = overview ? "All processes" : process.name;
  $("#selected-title").textContent = historyTitle;
  $("#breadcrumb-title").textContent = overview ? "Overview" : process.name;

  // In overview: merge all entries; in process mode: single process entries
  const sourceEntries = overview
    ? data.processes.flatMap((p) => (p.entries || []).map((e) => ({ ...e, _processName: p.name })))
    : (process.entries || []);

  const matchingEntries = sourceEntries
    .filter((e) => activeFilter === "all" || e.type === activeFilter)
    .filter((e) => !searchTerm || `${e.title} ${e.description} ${e.date}`.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return historySort === "newest" ? diff : -diff;
    });

  const visibleEntries = showAllEntries || activeFilter !== "all" || searchTerm
    ? matchingEntries : matchingEntries.slice(0, 5);

  $("#timeline").innerHTML = visibleEntries.length
    ? visibleEntries.map((e) => `
        <article class="timeline-entry ${e.type}" data-entry-id="${e.id}" title="Edit entry">
          <div class="entry-date">${e.date}${overview && e._processName ? ` <span class="entry-process-tag">${e._processName}</span>` : ""}</div>
          <div class="entry-title">${e.title}</div>
          <div class="entry-description">${e.description || ""}</div>
          <div class="entry-tags">
            ${(e.tags || []).map((t) => `<span class="tag ${t === "Recording" ? "recording-tag" : ""}">${t === "Recording" ? "◉ " : ""}${t}</span>`).join("")}
            ${e.aiSummary ? `<span class="tag ai-tag">✦ Summary</span>` : ""}
          </div>
        </article>`).join("")
    : `<p class="empty-results">No entries yet.</p>`;

  $("#show-all").hidden = Boolean(searchTerm || activeFilter !== "all");
  $("#show-all").innerHTML = showAllEntries
    ? "Show fewer entries <span>↑</span>"
    : `View all ${matchingEntries.length} entries <span>→</span>`;

  // ── Upcoming panel ────────────────────────────────────────────────────────

  const allUpcoming = (data.upcoming || []).filter((m) => m.status !== "completed");
  // In process mode: only show upcoming for this process
  const visibleUpcoming = overview
    ? allUpcoming
    : allUpcoming.filter((m) => m.processId === process?.id || m.processName === process?.name);

  const sortedUpcoming = [...visibleUpcoming].sort((a, b) => {
    const aDate = a.date ? new Date(`${a.date}T${a.time || "23:59"}`).getTime() : Number.MAX_SAFE_INTEGER;
    const bDate = b.date ? new Date(`${b.date}T${b.time || "23:59"}`).getTime() : Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  });

  $("#upcoming-list").innerHTML = sortedUpcoming.length
    ? sortedUpcoming.map((m) => `
        <div class="upcoming-item" data-upcoming-id="${m.id}" title="Edit upcoming meeting">
          <div class="date-block"><strong>${m.day}</strong><small>${m.month}</small></div>
          <div>
            <h4>${m.title}</h4><p>${m.meta}</p>
            <p class="upcoming-location">⌖ ${m.location || "To be confirmed"}</p>
          </div>
        </div>`).join("")
    : `<p class="empty-results" style="padding:12px 0;font-size:12px;color:#9aaba6">No upcoming meetings.</p>`;

  document.querySelectorAll("[data-upcoming-id]").forEach((el) =>
    el.addEventListener("click", () => openUpcomingEdit(el.dataset.upcomingId)));

  $("#meeting-count").textContent = allUpcoming.length;
  $("#notes-count").textContent = (data.processes || []).reduce((n, p) => n + (p.entries || []).length, 0);

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
  document.querySelectorAll("[data-entry-id]").forEach((el) =>
    el.addEventListener("click", () => openEditModal(el.dataset.entryId)));

  // ── User / greeting ──────────────────────────────────────────────────────
  const user = currentUser();
  if (user) {
    const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    const avatarEl = document.getElementById("user-avatar");
    const nameEl   = document.getElementById("user-name");
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl)   nameEl.textContent   = user.name;
  }

  const dateEl = document.getElementById("page-date");
  if (dateEl) {
    const now  = new Date();
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const mons = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    dateEl.textContent = `${days[now.getDay()]}, ${mons[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`.toUpperCase();
  }

  const titleEl = document.getElementById("page-title");
  if (titleEl) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const firstName = currentUser()?.name?.split(" ")[0] || "";
    titleEl.innerHTML = `${greeting}, ${firstName} <span>✦</span>`;
  }

  saveViewState();
}

// ── Modals ────────────────────────────────────────────────────────────────────

function resetEntryForm() {
  $("#entry-type").value = "meeting";
  $("#entry-date").value = new Date().toISOString().slice(0, 10);
  $("#entry-time").value = "10:00";
  $("#entry-title").value = "";
  $("#entry-location").value = "";
  $("#entry-notes").value = "";
  $("#recording-label").textContent = "Attach a recording";
  $("#recording-status").textContent = "Audio or video; stored on this device";
  if ($("#entry-recording")) $("#entry-recording").value = "";
}

function openModal(upcomingMeeting = false) {
  editingEntryId = null;
  editingUpcomingId = null;
  addingUpcomingMeeting = upcomingMeeting;
  $("#modal-eyebrow").textContent = upcomingMeeting ? "NEW UPCOMING MEETING" : "NEW TIMELINE ENTRY";
  $("#modal-title").textContent = "Add a meeting";
  $("#entry-form").querySelector("[type=submit]").textContent = "Save";
  $("#delete-entry").hidden = true;
  resetEntryForm();
  // Show/hide AI section
  const aiSection = document.getElementById("ai-section");
  if (aiSection) aiSection.hidden = true;
  $("#modal-backdrop").hidden = false;
}

function openEditModal(entryId) {
  const process = selected();
  const entry = (process.entries || []).find((e) => e.id === entryId);
  if (!entry) return;
  editingEntryId = entryId;
  editingUpcomingId = null;
  addingUpcomingMeeting = false;
  $("#modal-eyebrow").textContent = "EDIT ENTRY";
  $("#modal-title").textContent = "Edit entry";
  $("#entry-form").querySelector("[type=submit]").textContent = "Update";
  $("#delete-entry").hidden = false;
  $("#entry-type").value = entry.type || "meeting";
  $("#entry-date").value = entry.isoDate || "";
  $("#entry-time").value = entry.time || "";
  $("#entry-title").value = entry.title || "";
  $("#entry-location").value = entry.location || "";
  $("#entry-notes").value = entry.description || "";
  $("#recording-label").textContent = entry.recordingData?.name || "Attach a recording";
  $("#recording-status").textContent = entry.recordingData
    ? `${Math.ceil((Number(entry.recordingData.size) || 0) / 1024 / 1024)} MB attached`
    : "Audio or video; stored on this device";
  // Show AI section if entry has a recording or transcript
  const aiSection = document.getElementById("ai-section");
  if (aiSection) {
    aiSection.hidden = !entry.recording;
    renderAiSection(entry);
  }
  $("#modal-backdrop").hidden = false;
}

function openUpcomingEdit(upcomingId) {
  const meeting = (data.upcoming || []).find((m) => m.id === upcomingId);
  if (!meeting) return;
  editingUpcomingId = upcomingId;
  editingEntryId = null;
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
  const aiSection = document.getElementById("ai-section");
  if (aiSection) aiSection.hidden = true;
  $("#modal-backdrop").hidden = false;
}

function closeModal() {
  $("#modal-backdrop").hidden = true;
  editingEntryId = null;
  editingUpcomingId = null;
  addingUpcomingMeeting = false;
}

function toast(message, duration = 3000) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), duration);
}

// ── AI section in modal ───────────────────────────────────────────────────────

function renderAiSection(entry) {
  const aiSection = document.getElementById("ai-section");
  if (!aiSection) return;
  if (!entry.recording) { aiSection.hidden = true; return; }
  aiSection.hidden = false;

  const hasTranscript = Boolean(entry.transcript);
  const hasSummary = Boolean(entry.aiSummary);

  aiSection.innerHTML = `
    <div class="ai-section-inner">
      <p class="eyebrow">✦ AI ASSISTANT</p>
      ${hasTranscript
        ? `<p class="ai-transcript-preview">${entry.transcript.slice(0, 200)}${entry.transcript.length > 200 ? "…" : ""}</p>`
        : `<p class="ai-hint">Transcribe the recording to generate a summary.</p>`
      }
      <div class="ai-actions">
        ${!hasTranscript
          ? `<button type="button" class="button button-outline" id="btn-transcribe">⌁ Transcribe recording</button>`
          : `<button type="button" class="button button-outline" id="btn-transcribe">⌁ Re-transcribe</button>`
        }
        ${hasTranscript
          ? `<button type="button" class="button button-outline" id="btn-summarise">✦ ${hasSummary ? "Re-generate summary" : "Generate summary"}</button>`
          : ""
        }
      </div>
      ${hasSummary ? renderSummaryCard(entry.aiSummary) : ""}
    </div>`;

  document.getElementById("btn-transcribe")?.addEventListener("click", async () => {
    toast("Transcribing… this may take a moment.");
    try {
      const updated = await API.post(`/api/entries/${entry.id}/transcribe`, {});
      // Update local entry
      const p = selected();
      const idx = (p.entries || []).findIndex((e) => e.id === entry.id);
      if (idx >= 0) p.entries[idx] = updated;
      renderAiSection(updated);
      toast("Transcription complete.");
    } catch (err) {
      toast(`Transcription failed: ${err.message}`);
    }
  });

  document.getElementById("btn-summarise")?.addEventListener("click", async () => {
    toast("Generating summary…");
    try {
      const updated = await API.post(`/api/entries/${entry.id}/summarise`, {});
      const p = selected();
      const idx = (p.entries || []).findIndex((e) => e.id === entry.id);
      if (idx >= 0) p.entries[idx] = updated;
      renderAiSection(updated);
      render();
      toast("Summary ready.");
    } catch (err) {
      toast(`Summary failed: ${err.message}`);
    }
  });
}

function renderSummaryCard(aiSummary) {
  const s = typeof aiSummary === "string" ? JSON.parse(aiSummary) : aiSummary;
  const points = (s.key_points || []).map((p) => `<li>${p}</li>`).join("");
  const actions = (s.action_items || []).map((a) => `<li>${a}</li>`).join("");
  return `
    <div class="ai-summary-card">
      <p>${s.summary || ""}</p>
      ${points ? `<p class="eyebrow" style="margin-top:10px">KEY POINTS</p><ul>${points}</ul>` : ""}
      ${actions ? `<p class="eyebrow" style="margin-top:10px">ACTION ITEMS</p><ul>${actions}</ul>` : ""}
    </div>`;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function meetingDate(m) {
  if (m.date) return new Date(`${m.date}T${m.time || "12:00"}`);
  const month = new Date(`${m.month || ""} 1, ${calendarMonth.getFullYear()}`).getMonth();
  return Number.isFinite(month) && m.day
    ? new Date(calendarMonth.getFullYear(), month, Number(m.day), 12)
    : null;
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  $("#calendar-title").textContent = calendarMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const meetings = (data.upcoming || [])
    .filter((m) => m.status !== "completed")
    .map((m) => ({ meeting: m, date: meetingDate(m) }))
    .filter(({ date }) => date && date.getFullYear() === year && date.getMonth() === month)
    .sort((a, b) => a.date - b.date);
  $("#calendar-list").innerHTML = meetings.map(({ meeting: m, date }) => {
    const time = m.time ? new Date(`2000-01-01T${m.time}`).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
    const procName = data.processes.find((p) => p.id === m.processId)?.name || m.processName || "";
    return `<article class="calendar-meeting">
      <div class="calendar-date"><strong>${date.toLocaleDateString("en-GB", { day: "numeric" })}</strong><span>${date.toLocaleDateString("en-GB", { weekday: "short" })}</span></div>
      <div class="calendar-meeting-details"><h3>${m.title}</h3><p>${time} · ${m.location || "Location to be confirmed"}</p><small>${procName}</small></div>
    </article>`;
  }).join("");
  $("#calendar-empty").hidden = meetings.length > 0;
}

function openCalendar() {
  calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  renderCalendar();
  $("#calendar-backdrop").hidden = false;
}

// ── Process summary ───────────────────────────────────────────────────────────

async function generateSummary() {
  const process = selected();
  if (!process.id) return;
  toast("Generating summary… this may take a moment.", 8000);
  try {
    const result = await API.post(`/api/processes/${process.id}/summarise`, {});
    const themes = (result.key_themes || []).map((t) => `• ${t}`).join("\n");
    const steps = (result.next_steps || []).map((s) => `• ${s}`).join("\n");
    alert(`CASE SUMMARY — ${process.name}\n\n${result.summary}\n\n${themes ? "KEY THEMES\n" + themes + "\n\n" : ""}${steps ? "NEXT STEPS\n" + steps : ""}`);
    toast("Summary ready.");
  } catch (err) {
    toast(`Could not generate summary: ${err.message}`);
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────

function escapeCsv(value) {
  const str = String(value ?? "").replace(/"/g, '""');
  return /[,"\n]/.test(str) ? `"${str}"` : str;
}

function exportAllEvents() {
  const process = selected();
  const rows = (process.entries || [])
    .map((e) => ({ date: e.date, process: process.name, type: e.type, title: e.title, summary: e.description }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const csv = [
    ["Date", "Process", "Type", "Title", "Summary"].map(escapeCsv).join(","),
    ...rows.map((r) => [r.date, r.process, r.type, r.title, r.summary].map(escapeCsv).join(",")),
  ].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = `${process.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── Gzip helpers (backup/restore) ─────────────────────────────────────────────

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

async function backupAllData() {
  try {
    const snapshot = await API.get("/api/backup");
    const compressed = await gzipText(JSON.stringify(snapshot));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([compressed], { type: "application/gzip" }));
    link.download = `threadline-backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast("Backup downloaded.");
  } catch {
    toast("Backup failed.");
  }
}

async function restoreBackup(file) {
  try {
    const raw = await gunzipText(await file.arrayBuffer());
    const backup = JSON.parse(raw);
    if (!backup.format?.startsWith("threadline-backup")) throw new Error("Invalid format");
    await API.post("/api/restore", { data: backup });
    await reloadState();
    toast("Backup restored.");
  } catch {
    toast("That file is not a valid Threadline backup.");
  }
}

// ── Share modal ───────────────────────────────────────────────────────────────

function openShareModal(processId) {
  sharingProcessId = processId;
  const process = data.processes.find((p) => p.id === processId);
  $("#share-process-name").textContent = process ? `Choose users who can access "${process.name}".` : "";
  $("#share-user-list").innerHTML = data.users
    .filter((u) => u.id !== currentUser()?.id)
    .map((u) => `<label class="share-user"><input type="checkbox" value="${u.id}" ${(process?.sharedWith || []).includes(u.id) ? "checked" : ""}><span><strong>${u.name}</strong><small>${u.email}</small></span></label>`)
    .join("");
  $("#share-backdrop").hidden = false;
}

function closeShareModal() { $("#share-backdrop").hidden = true; sharingProcessId = null; }

// ── Workspaces ────────────────────────────────────────────────────────────────

function renderWorkspaces() {
  $("#workspace-list").innerHTML = data.workspaces.map((w) => `
    <div class="workspace-option ${w.id === data.activeWorkspaceId ? "active" : ""}">
      <span><strong>${w.name}</strong><small>${(w.processes || []).length} processes</small></span>
      <button class="button button-outline" data-switch-workspace="${w.id}">${w.id === data.activeWorkspaceId ? "Current" : "Switch"}</button>
    </div>`).join("");
  document.querySelectorAll("[data-switch-workspace]").forEach((b) =>
    b.addEventListener("click", () => switchWorkspace(b.dataset.switchWorkspace)));
}

function renderAdminPeople() {
  $("#backup-settings-card").hidden = !isAdmin();
  $("#restore-settings-card").hidden = !isAdmin();
  const dashboard = { ...dashboardDefaults, ...(activeWorkspace()?.dashboard || {}) };
  document.querySelectorAll("[data-dashboard-setting]").forEach((input) => { input.checked = dashboard[input.dataset.dashboardSetting]; });
}

function renderDashboardSettings() {
  document.querySelectorAll("[data-dashboard-setting]").forEach((input) => {
    const ws = activeWorkspace();
    const dashboard = { ...dashboardDefaults, ...(ws?.dashboard || {}) };
    input.checked = Boolean(dashboard[input.dataset.dashboardSetting]);
    input.onchange = async () => {
      const ws = activeWorkspace();
      const key = input.dataset.dashboardSetting;
      const newValue = input.checked;
      const current = { ...dashboardDefaults, ...(ws?.dashboard || {}) };
      const updated = { ...current, [key]: newValue };
      ws.dashboard = updated;
      render();
      await API.patch(`/api/workspaces/${ws.id}/dashboard`, updated);
    };
  });
}

function openUserEditor(user, canChangeRole = false) {
  if (!user) return;
  editingUserId = user.id;
  $("#edit-user-name").value = user.name;
  $("#edit-user-email").value = user.email;
  $("#edit-user-admin").checked = user.role === "admin";
  $("#edit-user-admin-label").hidden = !canChangeRole;
  $("#edit-user-backdrop").hidden = false;
}

async function switchWorkspace(workspaceId) {
  if (workspaceId === data.activeWorkspaceId) return;
  const state = await API.post("/api/active-workspace", { workspaceId });
  data.activeWorkspaceId = workspaceId;
  data.processes = state.processes || [];
  data.upcoming = state.upcoming || [];
  selectedId = data.processes[0]?.id;
  activeFilter = "all"; searchTerm = ""; showAllEntries = false;
  render(); renderWorkspaces();
  toast(`Switched to ${state.name}.`);
}

// ── State reload ──────────────────────────────────────────────────────────────

async function reloadState() {
  const state = await API.get("/api/state");
  data = state;
  // Keep selectedId if process still exists; keep null (overview) if it was null
  if (selectedId !== null) {
    selectedId = data.processes.some((p) => p.id === selectedId) ? selectedId : null;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

// Overview nav button → clear selection → overview mode
document.querySelectorAll(".primary-nav [data-view='overview']").forEach((b) =>
  b.addEventListener("click", () => { selectedId = null; showAllEntries = false; activeFilter = "all"; searchTerm = ""; render(); }));

$("#new-entry").addEventListener("click", () => openModal(false));
$("#add-meeting").addEventListener("click", () => { $("#upcoming-menu").hidden = true; openModal(true); });
$("#upcoming-menu-button").addEventListener("click", () => { const menu = $("#upcoming-menu"); menu.hidden = !menu.hidden; $("#upcoming-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); });
$("#timeline-menu-button").addEventListener("click", () => { const menu = $("#timeline-menu"); menu.hidden = !menu.hidden; $("#timeline-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); });
$("#sort-newest").addEventListener("click", () => { historySort = "newest"; $("#timeline-menu").hidden = true; render(); toast("Sorted newest first."); });
$("#sort-oldest").addEventListener("click", () => { historySort = "oldest"; $("#timeline-menu").hidden = true; render(); toast("Sorted oldest first."); });
document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => { activeFilter = b.dataset.filter; showAllEntries = true; $("#timeline-menu").hidden = true; render(); toast(activeFilter === "all" ? "Showing all types." : `Showing ${activeFilter}s only.`); }));
$("#menu-search").addEventListener("click", () => { $("#timeline-menu").hidden = true; $("#search-popover").hidden = false; $("#event-search").focus(); });
$("#export-events").addEventListener("click", exportAllEvents);
$("#share-close").addEventListener("click", closeShareModal);
$("#cancel-share").addEventListener("click", closeShareModal);
$("#save-share").addEventListener("click", async () => {
  const process = data.processes.find((p) => p.id === sharingProcessId);
  if (!process) return;
  const sharedWith = [...document.querySelectorAll("#share-user-list input:checked")].map((i) => i.value);
  await API.patch(`/api/processes/${process.id}`, { sharedWith });
  process.sharedWith = sharedWith;
  closeShareModal();
  toast(`Access updated for ${process.name}.`);
});
$("#workspace-switcher").addEventListener("click", () => { renderWorkspaces(); $("#workspace-backdrop").hidden = false; });
$("#workspace-close").addEventListener("click", () => { $("#workspace-backdrop").hidden = true; });
$("#workspace-backdrop").addEventListener("click", (e) => { if (e.target.id === "workspace-backdrop") $("#workspace-backdrop").hidden = true; });
$("#edit-user-close").addEventListener("click", () => { $("#edit-user-backdrop").hidden = true; editingUserId = null; });
$("#cancel-edit-user").addEventListener("click", () => { $("#edit-user-backdrop").hidden = true; editingUserId = null; });
$("#save-edit-user").addEventListener("click", async () => {
  const name = $("#edit-user-name").value.trim();
  const email = $("#edit-user-email").value.trim();
  if (!name || !email) return;
  const role = isAdmin() && $("#edit-user-admin").checked ? "admin" : "user";
  const updated = await API.patch(`/api/users/${editingUserId}`, { name, email, role });
  const idx = data.users.findIndex((u) => u.id === editingUserId);
  if (idx >= 0) data.users[idx] = updated;
  renderAdminPeople();
  $("#edit-user-backdrop").hidden = true;
  editingUserId = null;
  toast("User updated.");
});
$("#cancel-delete-process").addEventListener("click", () => { $("#delete-process-backdrop").hidden = true; });
$("#confirm-delete-process").addEventListener("click", async () => {
  if (data.processes.length === 1) { $("#delete-process-backdrop").hidden = true; toast("Keep at least one process."); return; }
  const process = selected();
  await API.delete(`/api/processes/${process.id}`);
  const idx = data.processes.findIndex((p) => p.id === process.id);
  data.processes.splice(idx, 1);
  selectedId = data.processes[Math.max(0, idx - 1)]?.id;
  activeFilter = "all"; searchTerm = ""; showAllEntries = false;
  render();
  $("#delete-process-backdrop").hidden = true;
  toast(`${process.name} deleted.`);
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
$("#modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
$("#delete-entry").addEventListener("click", async () => {
  if (editingEntryId) {
    await API.delete(`/api/entries/${editingEntryId}`);
    const p = selected();
    p.entries = (p.entries || []).filter((e) => e.id !== editingEntryId);
    render(); closeModal(); toast("Entry deleted.");
  } else if (editingUpcomingId) {
    await API.delete(`/api/upcoming/${editingUpcomingId}`);
    data.upcoming = (data.upcoming || []).filter((m) => m.id !== editingUpcomingId);
    render(); closeModal(); toast("Upcoming meeting deleted.");
  }
});
$("#entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!$("#entry-title").value.trim() || !$("#entry-date").value) { toast("Add a title and date before saving."); return; }
  const process = selected();
  const file = $("#entry-recording")?.files[0];
  const dateStr = $("#entry-date").value;
  const timeStr = $("#entry-time").value || "12:00";
  const title = $("#entry-title").value.trim();
  const location = $("#entry-location").value.trim();
  const description = $("#entry-notes").value.trim() || "Entry captured in Threadline.";
  const entryType = $("#entry-type").value;

  try {
    if (editingUpcomingId) {
      // Update upcoming meeting — preserve the meeting's existing process association
      const existing = (data.upcoming || []).find((m) => m.id === editingUpcomingId);
      const procId   = process?.id   ?? existing?.processId;
      const procName = process?.name ?? existing?.processName;
      await API.patch(`/api/upcoming/${editingUpcomingId}`, {
        title, date: dateStr, time: timeStr, location,
        description: $("#entry-notes").value.trim(),
        processId: procId, processName: procName,
      });
      // Date may have been moved to the past — run promotion check
      const { promoted } = await API.post("/api/upcoming/promote", {});
      if (promoted.length) {
        await reloadState();
        render(); closeModal(); toast("Meeting moved to history (date has passed).");
      } else {
        await reloadState();
        render(); closeModal(); toast("Upcoming meeting updated.");
      }
      return;
    }

    if (addingUpcomingMeeting) {
      // Create upcoming meeting — fall back to first process if in overview mode
      const targetProc = process ?? data.processes[0];
      if (!targetProc) { toast("Create a process first."); return; }
      const meeting = await API.post(`/api/workspaces/${data.activeWorkspaceId}/upcoming`, {
        title, date: dateStr, time: timeStr, location,
        description: $("#entry-notes").value.trim(),
        processId: targetProc.id, processName: targetProc.name,
      });
      data.upcoming.unshift(meeting);
      // Trigger promotion check (date may already be in the past)
      const { promoted } = await API.post("/api/upcoming/promote", {});
      if (promoted.length) {
        await reloadState();
        render(); closeModal(); toast("Meeting added to history (date has passed).");
      } else {
        render(); closeModal(); toast("Upcoming meeting added.");
      }
      return;
    }

    if (editingEntryId) {
      // Update existing entry
      const updated = await API.patch(`/api/entries/${editingEntryId}`, {
        type: entryType, date: dateStr, time: timeStr,
        title, description, location,
      });
      const p = selected();
      const idx = (p.entries || []).findIndex((en) => en.id === editingEntryId);
      if (idx >= 0) p.entries[idx] = updated;
      if (file) {
        const withRec = await API.upload(`/api/entries/${editingEntryId}/recording`, file);
        if (idx >= 0) p.entries[idx] = withRec;
      }
      render(); closeModal(); toast("Entry updated.");
      return;
    }

    // Create new entry
    const entry = await API.post(`/api/processes/${process.id}/entries`, {
      type: entryType, date: dateStr, time: timeStr,
      title, description, location,
    });
    if (file) {
      const withRec = await API.upload(`/api/entries/${entry.id}/recording`, file);
      process.entries = [withRec, ...(process.entries || [])];
    } else {
      process.entries = [entry, ...(process.entries || [])];
    }
    render(); closeModal(); toast(file ? "Entry and recording saved." : "Entry saved.");
  } catch (err) {
    toast(`Could not save: ${err.message}`);
  }
});
$("#entry-recording")?.addEventListener("change", () => {
  const file = $("#entry-recording").files[0];
  if (!file) return;
  $("#recording-label").textContent = file.name;
  $("#recording-status").textContent = `${Math.ceil(file.size / 1024 / 1024)} MB selected`;
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
  const process = await API.post(`/api/workspaces/${data.activeWorkspaceId}/processes`, { name: name.trim() });
  data.processes.push({ ...process, entries: [] });
  selectedId = process.id;
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

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const state = await API.get("/api/state");
    data = state;
    // null = overview mode; restore last selected process if it still exists
    selectedId = viewState.selectedId === null
      ? null
      : data.processes.some((p) => p.id === viewState.selectedId)
        ? viewState.selectedId
        : null;  // default to overview on first load
    showAllEntries = Boolean(viewState.showAllEntries);
    activeFilter = viewState.activeFilter || "all";
    searchTerm = viewState.searchTerm || "";
    historySort = viewState.historySort === "oldest" ? "oldest" : "newest";

    // Promote any due upcoming meetings
    await API.post("/api/upcoming/promote", {});
    const refreshed = await API.get("/api/state");
    data = refreshed;

    render();
    setInterval(async () => {
      await API.post("/api/upcoming/promote", {});
      await reloadState();
      render();
    }, 30000);
  } catch (err) {
    document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;max-width:500px;margin:auto">
      <h2>Threadline could not connect</h2>
      <p>The local server is not responding. Please start Threadline using the launch script and try again.</p>
      <p style="color:#888;font-size:12px">${err.message}</p>
      <button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;cursor:pointer">Retry</button>
    </div>`;
  }
}

init();
