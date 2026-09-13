const seed = {
  processes: [
    { id: "health", name: "Mum's health journey", color: "blue", started: "Aug 12, 2026", entries: [
      { type: "meeting", date: "Sep 11, 2026", title: "Follow-up with Dr. Chen", description: "Reviewed blood test results and discussed adjusting the medication plan.", tags: ["Minutes added", "Recording"], recording: true },
      { type: "note", date: "Sep 05, 2026", title: "New prescription started", description: "Started the new course of medication. Set a reminder to check in after one week.", tags: ["Personal note"] },
      { type: "milestone", date: "Aug 28, 2026", title: "First specialist appointment", description: "Referral accepted by the neurology team. Appointment confirmed for September.", tags: ["Milestone"] }
    ]},
    { id: "renovation", name: "House renovation", color: "orange", started: "Jul 03, 2026", entries: [{ type: "meeting", date: "Sep 03, 2026", title: "Kitchen design review", description: "Agreed on oak fronts and revised lighting plan.", tags: ["Minutes added"] }]},
    { id: "legal", name: "Estate planning", color: "green", started: "May 18, 2026", entries: [{ type: "meeting", date: "Aug 19, 2026", title: "Meeting with solicitor", description: "Reviewed the first draft of the will and next steps.", tags: ["Minutes added"] }]}
  ],
  upcoming: [
    { day: "15", month: "SEP", title: "Neurology appointment", meta: "Tue, 10:30 AM  •  Mum's health journey" },
    { day: "19", month: "SEP", title: "Contractor site visit", meta: "Sat, 2:00 PM  •  House renovation" }
  ]
};
let data = JSON.parse(localStorage.getItem("threadline-data") || "null") || seed;
if (!data.workspaces) {
  data = {
    users: [
      { id: "alex", name: "Alex Morgan", email: "alex@example.com" },
      { id: "sam", name: "Sam Taylor", email: "sam@example.com" },
      { id: "jordan", name: "Jordan Lee", email: "jordan@example.com" }
    ],
    activeWorkspaceId: "personal",
    workspaces: [{ id: "personal", name: "Personal workspace", ownerId: "alex", processes: data.processes, upcoming: data.upcoming }],
    processes: data.processes,
    upcoming: data.upcoming
  };
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
data.users ||= [{ id: "alex", name: "Alex Morgan", email: "alex@example.com" }];
data.users.forEach((user) => { user.role ||= user.id === "alex" ? "admin" : "user"; });
data.workspaces ||= [];
data.activeWorkspaceId ||= data.workspaces[0]?.id;
const activeWorkspace = () => data.workspaces.find((workspace) => workspace.id === data.activeWorkspaceId) || data.workspaces[0];
const currentUser = () => data.users.find((user) => user.id === activeWorkspace()?.ownerId) || data.users[0];
const isAdmin = () => currentUser()?.role === "admin";
const dashboardDefaults = { process: true, upcoming: true, insight: true };
function syncWorkspace() {
  const workspace = activeWorkspace();
  if (workspace) {
    workspace.processes = data.processes;
    workspace.upcoming = data.upcoming;
  }
}
let selectedId = data.processes[0]?.id;
let editingUserId = null;
let editingIndex = null;
let showAllEntries = false;
let activeFilter = "all";
let searchTerm = "";
const $ = (s) => document.querySelector(s);
const save = () => { syncWorkspace(); localStorage.setItem("threadline-data", JSON.stringify(data)); };
const selected = () => data.processes.find((p) => p.id === selectedId) || data.processes[0] || { id: "", name: "No processes yet", entries: [] };
function addDemoEntries() {
  const health = data.processes.find((p) => p.id === "health");
  if (!health || health.entries.length >= 8) return;
  health.entries.push(
    { type: "meeting", date: "Aug 21, 2026", title: "Call with GP practice", description: "Discussed the referral and agreed to keep a record of symptoms before the specialist visit.", tags: ["Minutes added"] },
    { type: "note", date: "Aug 18, 2026", title: "Symptom notes updated", description: "Energy levels seem steadier in the mornings. Added questions for the next appointment.", tags: ["Personal note"] },
    { type: "milestone", date: "Aug 15, 2026", title: "Referral sent to neurology", description: "Referral letter submitted with recent test results and medication history.", tags: ["Milestone"] },
    { type: "meeting", date: "Aug 13, 2026", title: "Initial appointment with Dr. Patel", description: "Collected the initial history and agreed on blood tests and a follow-up plan.", tags: ["Minutes added", "Recording"], recording: true },
    { type: "note", date: "Aug 12, 2026", title: "Started tracking the process", description: "Created this timeline to keep appointments, questions, and decisions together.", tags: ["Personal note"] }
  );
  save();
}
function addTestProcesses() {
  const testProcesses = [
    {
      id: "test-moving",
      name: "Moving house — test",
      color: "orange",
      started: "Sep 02, 2026",
      entries: [
        { type: "meeting", date: "Sep 12, 2026", title: "Inventory walkthrough", description: "Reviewed the room-by-room inventory and confirmed which items need extra packing protection.", tags: ["Minutes added"] },
        { type: "note", date: "Sep 08, 2026", title: "Packing supplies ordered", description: "Ordered boxes, labels, tape, and protective wrap for the move.", tags: ["Personal note"] },
        { type: "milestone", date: "Sep 02, 2026", title: "Move date confirmed", description: "Moving date confirmed with the removal company for October 3.", tags: ["Milestone"] }
      ]
    },
    {
      id: "test-renewal",
      name: "Car insurance renewal — test",
      color: "green",
      started: "Aug 25, 2026",
      entries: [
        { type: "note", date: "Sep 10, 2026", title: "Renewal quote received", description: "New quote received and saved for comparison with two alternative providers.", tags: ["Personal note"] },
        { type: "meeting", date: "Aug 28, 2026", title: "Call with insurance adviser", description: "Discussed coverage limits, roadside assistance, and the renewal deadline.", tags: ["Minutes added", "Recording"], recording: true }
      ]
    },
    {
      id: "test-course",
      name: "Evening course — test",
      color: "blue",
      started: "Aug 17, 2026",
      entries: [
        { type: "milestone", date: "Sep 09, 2026", title: "First assignment submitted", description: "Submitted the first assignment and noted feedback questions for the tutor.", tags: ["Milestone"] },
        { type: "meeting", date: "Aug 17, 2026", title: "Course orientation", description: "Joined the orientation session and reviewed the weekly workload and assessment dates.", tags: ["Minutes added"] }
      ]
    }
  ];
  const existingIds = new Set(data.processes.map((process) => process.id));
  testProcesses.forEach((process) => { if (!existingIds.has(process.id)) data.processes.push(process); });
  const testMeetings = [
    { day: "22", month: "SEP", title: "Removal company estimate", meta: "Tue, 5:30 PM  •  Moving house — test" },
    { day: "26", month: "SEP", title: "Tutor check-in", meta: "Sat, 11:00 AM  •  Evening course — test" }
  ];
  testMeetings.forEach((meeting) => { if (!data.upcoming.some((item) => item.title === meeting.title && item.meta === meeting.meta)) data.upcoming.push(meeting); });
  save();
}
function render() {
  const process = selected();
  const dashboard = { ...dashboardDefaults, ...(activeWorkspace()?.dashboard || {}) };
  document.querySelectorAll("[data-dashboard-object]").forEach((object) => { object.hidden = !dashboard[object.dataset.dashboardObject]; });
  $("#process-list").innerHTML = data.processes.map((p) => `<div class="process-row ${p.id === selectedId ? "active" : ""}"><button class="process-item" data-process="${p.id}"><i class="process-dot" style="background:${p.color === "orange" ? "#ed9a72" : p.color === "green" ? "#93be9e" : "#7eb0bd"}"></i><span>${p.name}</span></button><button class="process-more" data-process-menu="${p.id}" aria-label="Options for ${p.name}">•••</button><div class="process-menu" data-process-menu-panel="${p.id}" hidden><button data-share-process="${p.id}">⇧ Share process</button><button data-delete-process="${p.id}">⌫ Delete process</button></div></div>`).join("");
  $("#workspace-label").textContent = activeWorkspace()?.name || "Personal workspace";
  $("#process-count").textContent = data.processes.length;
  $("#active-count").textContent = data.processes.length;
  $("#selected-title").textContent = process.name;
  $("#breadcrumb-title").textContent = process.name;
  const matchingEntries = process.entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => activeFilter === "all" || entry.type === activeFilter).filter(({ entry }) => !searchTerm || `${entry.title} ${entry.description} ${entry.date}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const visibleEntries = showAllEntries || activeFilter !== "all" || searchTerm ? matchingEntries : matchingEntries.slice(0, 4);
  $("#timeline").innerHTML = visibleEntries.length ? visibleEntries.map(({ entry: e, index }) => `<article class="timeline-entry ${e.type}" data-entry-index="${index}" title="Edit entry"><div class="entry-date">${e.date}</div><div class="entry-title">${e.title}</div><div class="entry-description">${e.description || ""}</div><div class="entry-tags">${(e.tags || []).map((t) => `<span class="tag ${t === "Recording" ? "recording-tag" : ""}">${t === "Recording" ? "◉ " : ""}${t}</span>`).join("")}</div></article>`).join("") : `<p class="empty-results">No matching events found.</p>`;
  $("#show-all").hidden = Boolean(searchTerm || activeFilter !== "all");
  $("#show-all").innerHTML = showAllEntries ? "Show fewer entries <span>↑</span>" : `View all ${process.entries.length} entries <span>→</span>`;
  $("#upcoming-list").innerHTML = data.upcoming.map((m) => `<div class="upcoming-item"><div class="date-block"><strong>${m.day}</strong><small>${m.month}</small></div><div><h4>${m.title}</h4><p>${m.meta}</p></div></div>`).join("");
  $("#meeting-count").textContent = data.upcoming.length;
  $("#notes-count").textContent = data.processes.reduce((n, p) => n + p.entries.length, 0) + 9;
    document.querySelectorAll("[data-process]").forEach((b) => b.addEventListener("click", () => { selectedId = b.dataset.process; showAllEntries = false; render(); }));
    document.querySelectorAll("[data-process-menu]").forEach((b) => b.addEventListener("click", (event) => { event.stopPropagation(); document.querySelectorAll("[data-process-menu-panel]").forEach((panel) => { panel.hidden = panel.dataset.processMenuPanel !== b.dataset.processMenu; }); }));
    document.querySelectorAll("[data-share-process]").forEach((b) => b.addEventListener("click", () => openShareModal(b.dataset.shareProcess)));
  document.querySelectorAll("[data-entry-index]").forEach((entry) => entry.addEventListener("click", () => openEditModal(Number(entry.dataset.entryIndex))));
}
function openModal() {
  editingIndex = null;
  $("#modal-eyebrow").textContent = "NEW TIMELINE ENTRY";
  $("#modal-title").textContent = "Add a meeting";
  $("#entry-form").querySelector("[type=submit]").textContent = "Save entry";
  $("#delete-entry").hidden = true;
  $("#modal-backdrop").hidden = false;
  $("#entry-date").value = new Date().toISOString().slice(0, 10);
  $("#entry-title").focus();
}
function openEditModal(index) {
  const entry = selected().entries[index];
  if (!entry) return;
  editingIndex = index;
  $("#modal-eyebrow").textContent = "EDIT TIMELINE ENTRY";
  $("#modal-title").textContent = "Edit entry";
  $("#entry-form").querySelector("[type=submit]").textContent = "Save changes";
  $("#delete-entry").hidden = false;
  $("#entry-type").value = entry.type;
  $("#entry-title").value = entry.title;
  $("#entry-date").value = new Date(entry.date).toISOString().slice(0, 10);
  $("#entry-time").value = "10:00";
  $("#entry-notes").value = entry.description || "";
  $("#modal-backdrop").hidden = false;
  $("#entry-title").focus();
}
function closeModal() { $("#modal-backdrop").hidden = true; $("#entry-form").reset(); editingIndex = null; }
function toast(message) { const t = $("#toast"); t.textContent = message; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); }
function generateSummary() { toast("Your case summary is ready — 3 key threads found."); setTimeout(() => alert(`CASE SUMMARY — ${selected().name}\n\nThe process has ${selected().entries.length} recorded entries. Recent activity includes ${selected().entries[0]?.title || "no entries"}.\n\nNext suggested step: review the upcoming commitments and add any follow-up notes.`), 400); }
function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}
function exportAllEvents() {
  const process = selected();
  const rows = process.entries.map((entry) => ({
    date: entry.date,
    process: process.name,
    type: entry.type.charAt(0).toUpperCase() + entry.type.slice(1),
    title: entry.title,
    summary: (entry.description || "").replace(/\s+/g, " ").trim()
  })).sort((a, b) => new Date(b.date) - new Date(a.date));
  const csv = [
    ["Date", "Process", "Type", "Event", "Short summary"],
    ...rows.map((row) => [row.date, row.process, row.type, row.title, row.summary])
  ].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const safeProcessName = process.name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "process";
  link.download = `${safeProcessName}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  $("#timeline-menu").hidden = true;
  toast(`${rows.length} events from ${process.name} exported to Excel.`);
}
async function gzipText(text) {
  if (!("CompressionStream" in window)) throw new Error("Compression is not supported by this browser.");
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzipText(buffer) {
  if (!("DecompressionStream" in window)) throw new Error("Decompression is not supported by this browser.");
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
async function backupAllData() {
  const backup = {
    format: "threadline-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    processCount: data.processes.length,
    eventCount: data.processes.reduce((count, process) => count + process.entries.length, 0),
    data
  };
  try {
    const compressed = await gzipText(JSON.stringify(backup));
    const blob = new Blob([compressed], { type: "application/gzip" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
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
      const backup = JSON.parse(await gunzipText(await file.arrayBuffer()));
      if (backup.format !== "threadline-backup" || !Array.isArray(backup.data?.processes) || !Array.isArray(backup.data?.upcoming) || backup.data.processes.some((process) => !Array.isArray(process.entries))) throw new Error("Invalid backup");
      data = backup.data;
      selectedId = data.processes[0]?.id;
      activeFilter = "all";
      searchTerm = "";
      showAllEntries = false;
      save();
      render();
      toast("Backup restored successfully.");
  } catch {
    toast("That file is not a valid compressed Threadline backup.");
  }
}
let sharingProcessId = null;
function openShareModal(processId) {
  sharingProcessId = processId;
  const process = data.processes.find((item) => item.id === processId);
  $("#share-process-name").textContent = process ? `Choose users who can access “${process.name}”.` : "";
  $("#share-user-list").innerHTML = data.users.filter((user) => user.id !== "alex").map((user) => `<label class="share-user"><input type="checkbox" value="${user.id}" ${(process?.sharedWith || []).includes(user.id) ? "checked" : ""}><span><strong>${user.name}</strong><small>${user.email}</small></span></label>`).join("");
  $("#share-backdrop").hidden = false;
}
function closeShareModal() { $("#share-backdrop").hidden = true; sharingProcessId = null; }
function renderWorkspaces() {
  $("#workspace-list").innerHTML = data.workspaces.map((workspace) => `<div class="workspace-option ${workspace.id === data.activeWorkspaceId ? "active" : ""}"><span><strong>${workspace.name}</strong><small>${workspace.processes.length} processes</small></span><button class="button button-outline" data-switch-workspace="${workspace.id}">${workspace.id === data.activeWorkspaceId ? "Current" : "Switch"}</button></div>`).join("");
  document.querySelectorAll("[data-switch-workspace]").forEach((button) => button.addEventListener("click", () => switchWorkspace(button.dataset.switchWorkspace)));
  document.querySelectorAll("[data-remove-workspace]").forEach((button) => button.addEventListener("click", () => removeWorkspace(button.dataset.removeWorkspace)));
}
function renderAdminPeople() {
  $("#backup-settings-card").hidden = !isAdmin();
  $("#restore-settings-card").hidden = !isAdmin();
  $("#admin-user-settings").hidden = !isAdmin();
  $("#edit-user-admin-label").hidden = !isAdmin();
  const dashboard = { ...dashboardDefaults, ...(activeWorkspace()?.dashboard || {}) };
  document.querySelectorAll("[data-dashboard-setting]").forEach((input) => { input.checked = dashboard[input.dataset.dashboardSetting]; });
  $("#admin-people-list").innerHTML = [...data.users].sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin")).map((user) => `<div class="person-row"><span><strong>${user.name}</strong><small>${user.email} · ${user.role === "admin" ? "Admin" : "User"}</small></span>${user.id !== "alex" ? `<span><button data-edit-person="${user.id}">Edit</button><button data-admin-remove-person="${user.id}">Remove user</button></span>` : `<small>Admin</small>`}</div>`).join("");
  document.querySelectorAll("[data-edit-person]").forEach((button) => button.addEventListener("click", () => {
    const user = data.users.find((item) => item.id === button.dataset.editPerson);
    if (!user) return;
    openUserEditor(user, true);
  }));
  document.querySelectorAll("[data-admin-remove-person]").forEach((button) => button.addEventListener("click", () => {
    const userId = button.dataset.adminRemovePerson;
    data.users = data.users.filter((user) => user.id !== userId);
    data.workspaces = data.workspaces.filter((workspace) => workspace.ownerId !== userId);
    data.workspaces.forEach((workspace) => workspace.processes.forEach((process) => { process.sharedWith = (process.sharedWith || []).filter((id) => id !== userId); }));
    if (!data.workspaces.some((workspace) => workspace.id === data.activeWorkspaceId)) {
      const next = data.workspaces[0];
      data.activeWorkspaceId = next.id; data.processes = next.processes; data.upcoming = next.upcoming; selectedId = data.processes[0]?.id;
    }
    save(); render(); renderAdminPeople(); toast("User and workspace removed.");
  }));
}
function switchWorkspace(workspaceId) {
  if (workspaceId === data.activeWorkspaceId) return;
  syncWorkspace();
  const next = data.workspaces.find((workspace) => workspace.id === workspaceId);
  if (!next) return;
  data.activeWorkspaceId = workspaceId;
  data.processes = next.processes;
  data.upcoming = next.upcoming;
  selectedId = data.processes[0]?.id;
  activeFilter = "all"; searchTerm = ""; showAllEntries = false;
  save(); render(); renderWorkspaces(); toast(`Switched to ${next.name}.`);
}
function renderDashboardSettings() {
  const dashboard = { ...dashboardDefaults, ...(activeWorkspace()?.dashboard || {}) };
  document.querySelectorAll("[data-dashboard-setting]").forEach((input) => {
    input.checked = dashboard[input.dataset.dashboardSetting];
    input.onchange = () => {
      activeWorkspace().dashboard = { ...dashboardDefaults, ...(activeWorkspace().dashboard || {}), [input.dataset.dashboardSetting]: input.checked };
      save(); render();
    };
  });
}
function removeWorkspace(workspaceId) {
  if (data.workspaces.length === 1) return;
  const index = data.workspaces.findIndex((workspace) => workspace.id === workspaceId);
  if (index < 0) return;
  data.workspaces.splice(index, 1);
  if (workspaceId === data.activeWorkspaceId) {
    const next = data.workspaces[0];
    data.activeWorkspaceId = next.id; data.processes = next.processes; data.upcoming = next.upcoming; selectedId = data.processes[0]?.id;
  }
  save(); render(); renderWorkspaces(); toast("Workspace removed.");
}
$("#new-entry").addEventListener("click", openModal); $("#add-meeting").addEventListener("click", openModal);
$("#timeline-menu-button").addEventListener("click", () => { const menu = $("#timeline-menu"); menu.hidden = !menu.hidden; $("#timeline-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); });
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { activeFilter = button.dataset.filter; showAllEntries = true; $("#timeline-menu").hidden = true; render(); toast(activeFilter === "all" ? "Showing all event types." : `Showing ${activeFilter}s only.`); }));
$("#menu-search").addEventListener("click", () => { $("#timeline-menu").hidden = true; $("#search-popover").hidden = false; $("#event-search").focus(); });
$("#export-events").addEventListener("click", exportAllEvents);
$("#share-close").addEventListener("click", closeShareModal); $("#cancel-share").addEventListener("click", closeShareModal);
$("#save-share").addEventListener("click", () => {
  const process = data.processes.find((item) => item.id === sharingProcessId);
  if (!process) return;
  process.sharedWith = [...document.querySelectorAll("#share-user-list input:checked")].map((input) => input.value);
  save(); closeShareModal(); toast(`Access updated for ${process.name}.`);
});
$("#workspace-switcher").addEventListener("click", () => { renderWorkspaces(); $("#workspace-backdrop").hidden = false; });
$("#workspace-close").addEventListener("click", () => { $("#workspace-backdrop").hidden = true; });
$("#workspace-backdrop").addEventListener("click", (event) => { if (event.target.id === "workspace-backdrop") $("#workspace-backdrop").hidden = true; });
$("#admin-add-person").addEventListener("click", () => {
  const name = $("#admin-person-name").value.trim(); const email = $("#admin-person-email").value.trim();
  if (!name || !email) return;
  const userId = `user-${Date.now()}`;
  const role = $("#admin-person-admin").checked ? "admin" : "user";
  data.users.push({ id: userId, name, email, role });
  const workspace = { id: `workspace-${Date.now()}`, name: `${name}'s workspace`, ownerId: userId, processes: [], upcoming: [] };
  data.workspaces.push(workspace);
  $("#admin-person-name").value = ""; $("#admin-person-email").value = ""; $("#admin-person-admin").checked = false; save(); renderAdminPeople(); toast(`${name} and their workspace were added.`);
});
$("#edit-user-close").addEventListener("click", () => { $("#edit-user-backdrop").hidden = true; editingUserId = null; });
$("#cancel-edit-user").addEventListener("click", () => { $("#edit-user-backdrop").hidden = true; editingUserId = null; });
$("#save-edit-user").addEventListener("click", () => {
  const user = data.users.find((item) => item.id === editingUserId);
  const name = $("#edit-user-name").value.trim();
  const email = $("#edit-user-email").value.trim();
  if (!user || !name || !email) return;
  const oldName = user.name;
  user.name = name;
  user.email = email;
  if (isAdmin()) user.role = $("#edit-user-admin").checked ? "admin" : "user";
  const workspace = data.workspaces.find((item) => item.ownerId === user.id);
  if (workspace) workspace.name = `${name}'s workspace`;
  save(); renderAdminPeople(); $("#edit-user-backdrop").hidden = true; editingUserId = null; toast(`${oldName} updated.`);
});
$("#cancel-delete-process").addEventListener("click", () => { $("#delete-process-backdrop").hidden = true; });
$("#confirm-delete-process").addEventListener("click", () => {
  if (data.processes.length === 1) {
    $("#delete-process-backdrop").hidden = true;
    toast("Keep at least one process in your workspace.");
    return;
  }
  const removed = selected();
  const removedIndex = data.processes.findIndex((process) => process.id === selectedId);
  data.processes.splice(removedIndex, 1);
  selectedId = data.processes[Math.max(0, removedIndex - 1)].id;
  activeFilter = "all";
  searchTerm = "";
  showAllEntries = false;
  save(); render();
  $("#delete-process-backdrop").hidden = true;
  toast(`${removed.name} deleted.`);
});
$("#restore-file").addEventListener("change", (event) => { if (event.target.files[0]) restoreBackup(event.target.files[0]); event.target.value = ""; });
$("#event-search").addEventListener("input", (event) => { searchTerm = event.target.value.trim(); showAllEntries = true; render(); });
$("#clear-search").addEventListener("click", () => { searchTerm = ""; $("#event-search").value = ""; render(); $("#event-search").focus(); });
document.addEventListener("click", (event) => { if (!event.target.closest(".timeline-actions") && !event.target.closest("#search-popover")) { $("#timeline-menu").hidden = true; } if (!event.target.closest(".process-row")) { document.querySelectorAll("[data-process-menu-panel]").forEach((panel) => { panel.hidden = true; }); } });
document.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-process]");
  if (!deleteButton) return;
  event.preventDefault();
  event.stopPropagation();
  selectedId = deleteButton.dataset.deleteProcess;
  document.querySelectorAll("[data-process-menu-panel]").forEach((panel) => { panel.hidden = true; });
  $("#delete-process-backdrop").hidden = false;
}, true);
$("#modal-close").addEventListener("click", closeModal); $("#cancel-entry").addEventListener("click", closeModal);
$("#delete-entry").addEventListener("click", () => {
  if (editingIndex === null) return;
  selected().entries.splice(editingIndex, 1);
  save(); render(); closeModal(); toast("Entry deleted.");
});
$("#modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
$("#entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = $("#entry-recording").files[0];
  const existingEntry = editingIndex === null ? null : selected().entries[editingIndex];
  const date = new Date(`${$("#entry-date").value}T${$("#entry-time").value || "12:00"}`);
  const process = selected();
  const recording = file ? { name: file.name, type: file.type, data: await readFileAsDataUrl(file) } : existingEntry?.recordingData;
  const hasRecording = Boolean(file) || Boolean(existingEntry?.recording || existingEntry?.recordingData);
  const updatedEntry = { type: $("#entry-type").value, date: date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }), title: $("#entry-title").value, description: $("#entry-notes").value || "Entry captured in Threadline.", tags: [$("#entry-type").value === "meeting" ? "Minutes added" : "Personal note", ...(hasRecording ? ["Recording"] : [])], recording: hasRecording, ...(recording ? { recordingData: recording } : {}) };
  if (editingIndex === null) process.entries.unshift(updatedEntry);
  else process.entries[editingIndex] = updatedEntry;
  const wasEditing = editingIndex !== null;
  save(); render(); closeModal(); toast(wasEditing ? "Entry updated." : (file ? "Entry and recording saved." : "Entry saved to the timeline."));
});
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
$("#history-summary").addEventListener("click", generateSummary); $("#generate-overview").addEventListener("click", generateSummary);
$("#show-all").addEventListener("click", () => { showAllEntries = !showAllEntries; render(); });
$("#open-calendar").addEventListener("click", () => toast("Calendar view is coming soon."));
$("#add-process").addEventListener("click", () => { const name = prompt("Name this process"); if (name?.trim()) { const id = `${Date.now()}`; data.processes.push({ id, name: name.trim(), color: "blue", started: "Sep 13, 2026", entries: [] }); selectedId = id; save(); render(); toast("New process created."); } });
$("#settings-button").addEventListener("click", () => { renderAdminPeople(); renderDashboardSettings(); $("#settings-backdrop").hidden = false; });
$("#edit-my-profile").addEventListener("click", () => { $("#settings-backdrop").hidden = true; openUserEditor(currentUser(), false); });
$("#settings-close").addEventListener("click", () => { $("#settings-backdrop").hidden = true; });
$("#settings-backdrop").addEventListener("click", (event) => { if (event.target.id === "settings-backdrop") $("#settings-backdrop").hidden = true; });
$("#settings-backup").addEventListener("click", () => { backupAllData(); });
$("#settings-restore").addEventListener("click", () => { $("#settings-backdrop").hidden = true; $("#restore-file").click(); });
addDemoEntries();
addTestProcesses();
render();
