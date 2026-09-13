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
    { day: "15", month: "SEP", title: "Neurology appointment", meta: "Tue, 10:30 AM  •  Mum's health journey", location: "St Mary's Hospital" },
    { day: "19", month: "SEP", title: "Contractor site visit", meta: "Sat, 2:00 PM  •  House renovation", location: "14 Oak Street" }
  ]
};
const DATA_STORAGE_KEY = "threadline-data";
const DATA_BACKUP_KEY = "threadline-data-backup";
const RECORD_JOURNAL_KEY = "threadline-record-journal";
const STRUCTURED_DB_NAME = "threadline-structured-data";
const STRUCTURED_STORE_NAME = "snapshots";
const STRUCTURED_SNAPSHOT_ID = "current";
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
function openStructuredDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STRUCTURED_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STRUCTURED_STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveStructuredSnapshot(snapshot) {
  try {
    const db = await openStructuredDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STRUCTURED_STORE_NAME, "readwrite");
      transaction.objectStore(STRUCTURED_STORE_NAME).put({ id: STRUCTURED_SNAPSHOT_ID, data: snapshot });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch (error) {
    console.warn("Unable to save the structured Threadline snapshot.", error);
  }
}
async function readStructuredSnapshot() {
  try {
    const db = await openStructuredDatabase();
    const snapshot = await new Promise((resolve, reject) => {
      const request = db.transaction(STRUCTURED_STORE_NAME, "readonly").objectStore(STRUCTURED_STORE_NAME).get(STRUCTURED_SNAPSHOT_ID);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return snapshot && Array.isArray(snapshot.processes) && Array.isArray(snapshot.upcoming) ? snapshot : null;
  } catch (error) {
    console.warn("Unable to read the structured Threadline snapshot.", error);
    return null;
  }
}
function readStoredData(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && Array.isArray(value.processes) && Array.isArray(value.upcoming) ? value : null;
  } catch (error) {
    console.warn(`Unable to read ${key}.`, error);
    return null;
  }
}
function ensureStableIds() {
  let changed = false;
  data.processes?.forEach((process) => process.entries?.forEach((entry) => {
    if (!entry.id) {
      entry.id = createId("entry");
      changed = true;
    }
  }));
  data.upcoming?.forEach((meeting) => {
    if (!meeting.id) {
      meeting.id = createId("meeting");
      changed = true;
    }
  });
  data.workspaces?.forEach((workspace) => {
    workspace.processes?.forEach((process) => process.entries?.forEach((entry) => {
      if (!entry.id) {
        entry.id = createId("entry");
        changed = true;
      }
    }));
    workspace.upcoming?.forEach((meeting) => {
      if (!meeting.id) {
        meeting.id = createId("meeting");
        changed = true;
      }
    });
  });
  return changed;
}
let data = readStoredData(DATA_STORAGE_KEY) || readStoredData(DATA_BACKUP_KEY) || seed;
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
function reconcileActiveWorkspace() {
  const workspace = data.workspaces.find((item) => item.id === data.activeWorkspaceId) || data.workspaces[0];
  if (!workspace) return;
  data.activeWorkspaceId = workspace.id;
  const key = (record) => record.id || `${record.title || ""}|${record.date || ""}|${record.time || ""}`;
  const topProcesses = data.processes || [];
  const workspaceProcesses = workspace.processes || [];
  const mergedProcesses = topProcesses.map((process) => {
    const matchingWorkspace = workspaceProcesses.find((item) => item.id === process.id);
    if (!matchingWorkspace) return process;
    const entries = [...(process.entries || [])];
    (matchingWorkspace.entries || []).forEach((entry) => {
      if (!entries.some((item) => key(item) === key(entry))) entries.push(entry);
    });
    return { ...matchingWorkspace, ...process, entries };
  });
  workspaceProcesses.forEach((process) => {
    if (!mergedProcesses.some((item) => item.id === process.id)) mergedProcesses.push(process);
  });
  data.processes = workspace.processes = mergedProcesses;
  data.upcoming = workspace.upcoming = [...(data.upcoming || []), ...(workspace.upcoming || []).filter((meeting) => !data.upcoming.some((item) => key(item) === key(meeting)))];
}
reconcileActiveWorkspace();
function readRecordJournal() {
  try {
    const value = JSON.parse(localStorage.getItem(RECORD_JOURNAL_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function recordKey(record) {
  return record.id || `${record.title || ""}|${record.date || ""}|${record.time || ""}`;
}
function restoreRecordJournal() {
  const journal = readRecordJournal();
  Object.values(journal).forEach((record) => {
    if (record.kind === "upcoming") {
      if (!data.upcoming.some((item) => recordKey(item) === recordKey(record))) data.upcoming.push(record);
      return;
    }
    const process = data.processes.find((item) => item.id === record.processId || item.name === record.processName) || data.processes[0];
    if (process && !process.entries.some((item) => recordKey(item) === recordKey(record))) process.entries.push(record);
  });
}
function removeJournalRecord(id) {
  if (!id) return;
  const journal = readRecordJournal();
  delete journal[id];
  localStorage.setItem(RECORD_JOURNAL_KEY, JSON.stringify(journal));
}
restoreRecordJournal();
const activeWorkspace = () => data.workspaces.find((workspace) => workspace.id === data.activeWorkspaceId) || data.workspaces[0];
const currentUser = () => data.users.find((user) => user.id === activeWorkspace()?.ownerId) || data.users[0];
const isAdmin = () => currentUser()?.role === "admin";
const dashboardDefaults = { process: true, upcoming: true, insight: true };
let viewState = JSON.parse(localStorage.getItem("threadline-view") || "{}");
function removeLegacyRecordingData() {
  data.workspaces.forEach((workspace) => workspace.processes?.forEach((process) => process.entries?.forEach((entry) => {
    if (entry.recordingData?.data) {
      entry.recordingData = { name: entry.recordingData.name || "Recording", type: entry.recordingData.type || "application/octet-stream", size: entry.recordingData.data.length };
    }
  })));
}
function ensureUpcomingLocations() {
  const knownLocations = {
    "Neurology appointment": "St Mary's Hospital",
    "Contractor site visit": "14 Oak Street",
    "Removal company estimate": "Current home",
    "Tutor check-in": "Online"
  };
  data.upcoming?.forEach((meeting) => { meeting.location ||= knownLocations[meeting.title] || "To be confirmed"; });
}
function promoteDueMeetings() {
  const now = Date.now();
  const remaining = [];
  let promoted = false;
  data.upcoming?.forEach((meeting) => {
    if (meeting.status === "completed" || !meeting.date || new Date(`${meeting.date}T${meeting.time || "23:59"}`).getTime() > now) {
      remaining.push(meeting);
      return;
    }
    const process = data.processes.find((item) => item.id === meeting.processId || item.name === meeting.processName) || data.processes[0];
    if (process) {
      if (!process.entries.some((entry) => entry.id === meeting.id)) {
        process.entries.unshift({
          id: meeting.id || createId("entry"),
          type: "meeting",
          date: new Date(`${meeting.date}T${meeting.time || "12:00"}`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
          title: meeting.title,
          description: meeting.description || "Upcoming meeting completed.",
          location: meeting.location || "",
          tags: ["Minutes added"]
        });
      }
      meeting.status = "completed";
      meeting.completedAt = new Date().toISOString();
      const journal = readRecordJournal();
      journal[meeting.id] = {
        id: meeting.id,
        type: "meeting",
        date: new Date(`${meeting.date}T${meeting.time || "12:00"}`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
        title: meeting.title,
        description: meeting.description || "Upcoming meeting completed.",
        location: meeting.location || "",
        tags: ["Minutes added"],
        kind: "history",
        processId: process.id,
        processName: process.name
      };
      localStorage.setItem(RECORD_JOURNAL_KEY, JSON.stringify(journal));
      promoted = true;
    }
  });
  data.upcoming = remaining;
  return promoted;
}
removeLegacyRecordingData();
ensureUpcomingLocations();
const idsAdded = ensureStableIds();
let promotedMeetings = false;
function syncWorkspace() {
  const workspace = activeWorkspace();
  if (workspace) {
    data.processes = workspace.processes = data.processes;
    data.upcoming = workspace.upcoming = data.upcoming;
  }
}
let selectedId = data.processes.some((process) => process.id === viewState.selectedId) ? viewState.selectedId : data.processes[0]?.id;
let editingUserId = null;
let editingIndex = null;
let addingUpcomingMeeting = false;
let upcomingEditingIndex = null;
let showAllEntries = Boolean(viewState.showAllEntries);
let activeFilter = viewState.activeFilter || "all";
let searchTerm = viewState.searchTerm || "";
let historySort = viewState.historySort === "oldest" ? "oldest" : "newest";
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const $ = (s) => document.querySelector(s);
function mergeRecordCollections(current, stored) {
  const result = [...(current || [])];
  (stored || []).forEach((record) => {
    const key = record.id || `${record.title || ""}|${record.date || ""}|${record.time || ""}`;
    const existingIndex = result.findIndex((item) => (item.id || `${item.title || ""}|${item.date || ""}|${item.time || ""}`) === key);
    if (existingIndex < 0) result.push(record);
  });
  return result;
}
function mergeStoredRecords(snapshot) {
  if (!snapshot) return;
  const storedProcesses = snapshot.processes || [];
  data.processes.forEach((process) => {
    const storedProcess = storedProcesses.find((item) => item.id === process.id);
    if (storedProcess) process.entries = mergeRecordCollections(process.entries, storedProcess.entries);
  });
  storedProcesses.forEach((process) => {
    if (!data.processes.some((item) => item.id === process.id)) data.processes.push(process);
  });
  const historyIds = new Set(data.processes.flatMap((process) => process.entries || []).map((entry) => entry.id).filter(Boolean));
  data.upcoming = mergeRecordCollections(
    data.upcoming,
    (snapshot.upcoming || []).filter((meeting) => meeting.status !== "completed" && !historyIds.has(meeting.id))
  );
}
const save = () => {
  removeLegacyRecordingData();
  ensureStableIds();
  mergeStoredRecords(readStoredData(DATA_STORAGE_KEY));
  mergeStoredRecords(readStoredData(DATA_BACKUP_KEY));
  syncWorkspace();
  const journal = readRecordJournal();
  data.upcoming.forEach((meeting) => { journal[recordKey(meeting)] = { ...meeting, kind: "upcoming" }; });
  data.processes.forEach((process) => process.entries?.forEach((entry) => {
    journal[recordKey(entry)] = { ...entry, kind: "history", processId: process.id, processName: process.name };
  }));
  localStorage.setItem(RECORD_JOURNAL_KEY, JSON.stringify(journal));
  const serialized = JSON.stringify(data);
  saveStructuredSnapshot(JSON.parse(serialized));
  try {
    localStorage.setItem(DATA_BACKUP_KEY, serialized);
    localStorage.setItem(DATA_STORAGE_KEY, serialized);
    if (localStorage.getItem(DATA_STORAGE_KEY) !== serialized) throw new Error("Saved data could not be verified.");
    const workspace = activeWorkspace();
    if (workspace && (workspace.processes !== data.processes || workspace.upcoming !== data.upcoming)) {
      throw new Error("The active workspace could not be verified.");
    }
  } catch (error) {
    throw new Error(`Threadline could not save your changes. ${error.message || "Browser storage may be unavailable or full."}`);
  }
};
const verifyEntrySaved = (id) => {
  const stores = [readStoredData(DATA_STORAGE_KEY), readStoredData(DATA_BACKUP_KEY)];
  const found = stores.every((stored) => stored && (
    stored.upcoming?.some((meeting) => meeting.id === id) ||
    stored.processes?.some((process) => process.entries?.some((entry) => entry.id === id))
  ));
  const workspace = activeWorkspace();
  const inWorkspace = Boolean(workspace && (
    workspace.upcoming?.some((meeting) => meeting.id === id) ||
    workspace.processes?.some((process) => process.entries?.some((entry) => entry.id === id))
  ));
  if (!found || !inWorkspace) throw new Error("The saved entry could not be verified in browser storage.");
};
const saveViewState = () => localStorage.setItem("threadline-view", JSON.stringify({ selectedId, showAllEntries, activeFilter, searchTerm, historySort }));
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
    { date: "2026-09-16", time: "09:30", title: "Medication review", meta: "Wed, 9:30 AM  •  Mum's health journey", location: "GP practice", processId: "health", processName: "Mum's health journey" },
    { date: "2026-09-18", time: "14:00", title: "Packing progress check", meta: "Fri, 2:00 PM  •  Moving house — test", location: "Current home", processId: "test-moving", processName: "Moving house — test" },
    { date: "2026-09-23", time: "10:00", title: "Insurance documents review", meta: "Wed, 10:00 AM  •  Car insurance renewal — test", location: "Online", processId: "test-renewal", processName: "Car insurance renewal — test" },
    { date: "2026-09-24", time: "18:30", title: "Course progress meeting", meta: "Thu, 6:30 PM  •  Evening course — test", location: "Classroom 2", processId: "test-course", processName: "Evening course — test" },
    { date: "2026-09-30", time: "11:00", title: "Specialist preparation call", meta: "Wed, 11:00 AM  •  Mum's health journey", location: "Phone", processId: "health", processName: "Mum's health journey" },
    { date: "2026-10-02", time: "15:00", title: "Removal plan confirmation", meta: "Fri, 3:00 PM  •  Moving house — test", location: "Online", processId: "test-moving", processName: "Moving house — test" },
    { date: "2026-10-07", time: "09:00", title: "Renewal decision meeting", meta: "Wed, 9:00 AM  •  Car insurance renewal — test", location: "Insurance office", processId: "test-renewal", processName: "Car insurance renewal — test" },
    { date: "2026-10-12", time: "18:00", title: "Assignment planning session", meta: "Mon, 6:00 PM  •  Evening course — test", location: "Classroom 2", processId: "test-course", processName: "Evening course — test" },
    { date: "2026-10-16", time: "13:30", title: "Follow-up with neurology", meta: "Fri, 1:30 PM  •  Mum's health journey", location: "St Mary's Hospital", processId: "health", processName: "Mum's health journey" },
    { date: "2026-10-24", time: "10:30", title: "Move-in readiness review", meta: "Sat, 10:30 AM  •  Moving house — test", location: "New home", processId: "test-moving", processName: "Moving house — test" },
    { date: "2026-11-03", time: "16:00", title: "Policy renewal follow-up", meta: "Tue, 4:00 PM  •  Car insurance renewal — test", location: "Online", processId: "test-renewal", processName: "Car insurance renewal — test" },
    { date: "2026-11-06", time: "18:30", title: "Tutor feedback session", meta: "Fri, 6:30 PM  •  Evening course — test", location: "Online", processId: "test-course", processName: "Evening course — test" },
    { date: "2026-11-11", time: "10:00", title: "Health plan review", meta: "Wed, 10:00 AM  •  Mum's health journey", location: "GP practice", processId: "health", processName: "Mum's health journey" },
    { date: "2026-11-18", time: "14:30", title: "Post-move check-in", meta: "Wed, 2:30 PM  •  Moving house — test", location: "New home", processId: "test-moving", processName: "Moving house — test" },
    { date: "2026-11-27", time: "11:30", title: "Course term review", meta: "Fri, 11:30 AM  •  Evening course — test", location: "Classroom 2", processId: "test-course", processName: "Evening course — test" }
  ];
  testMeetings.forEach((meeting) => {
    if (data.upcoming.some((item) => item.title === meeting.title && item.date === meeting.date)) return;
    const date = new Date(`${meeting.date}T${meeting.time}`);
    data.upcoming.push({
      ...meeting,
      day: String(date.getDate()).padStart(2, "0"),
      month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
    });
  });
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
  const matchingEntries = process.entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => activeFilter === "all" || entry.type === activeFilter).filter(({ entry }) => !searchTerm || `${entry.title} ${entry.description} ${entry.date}`.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => {
    const difference = new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime();
    return historySort === "newest" ? difference : -difference;
  });
  const visibleEntries = showAllEntries || activeFilter !== "all" || searchTerm ? matchingEntries : matchingEntries.slice(0, 4);
  $("#timeline").innerHTML = visibleEntries.length ? visibleEntries.map(({ entry: e, index }) => `<article class="timeline-entry ${e.type}" data-entry-index="${index}" title="Edit entry"><div class="entry-date">${e.date}</div><div class="entry-title">${e.title}</div><div class="entry-description">${e.description || ""}</div><div class="entry-tags">${(e.tags || []).map((t) => `<span class="tag ${t === "Recording" ? "recording-tag" : ""}">${t === "Recording" ? "◉ " : ""}${t}</span>`).join("")}</div></article>`).join("") : `<p class="empty-results">No matching events found.</p>`;
  $("#show-all").hidden = Boolean(searchTerm || activeFilter !== "all");
  $("#show-all").innerHTML = showAllEntries ? "Show fewer entries <span>↑</span>" : `View all ${process.entries.length} entries <span>→</span>`;
  const upcomingEntries = data.upcoming.map((meeting, index) => ({ meeting, index })).filter(({ meeting }) => meeting.status !== "completed").sort((a, b) => {
    const aDate = a.meeting.date ? new Date(`${a.meeting.date}T${a.meeting.time || "23:59"}`).getTime() : Number.MAX_SAFE_INTEGER;
    const bDate = b.meeting.date ? new Date(`${b.meeting.date}T${b.meeting.time || "23:59"}`).getTime() : Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  });
  $("#upcoming-list").innerHTML = upcomingEntries.map(({ meeting: m, index }) => `<div class="upcoming-item" data-upcoming-index="${index}" title="Edit upcoming meeting"><div class="date-block"><strong>${m.day}</strong><small>${m.month}</small></div><div><h4>${m.title}</h4><p>${m.meta}</p><p class="upcoming-location">⌖ ${m.location || "To be confirmed"}</p></div></div>`).join("");
  document.querySelectorAll("[data-upcoming-index]").forEach((meeting) => meeting.addEventListener("click", () => openUpcomingEdit(Number(meeting.dataset.upcomingIndex))));
  $("#meeting-count").textContent = data.upcoming.length;
  $("#notes-count").textContent = data.processes.reduce((n, p) => n + p.entries.length, 0) + 9;
    document.querySelectorAll("[data-process]").forEach((b) => b.addEventListener("click", () => { selectedId = b.dataset.process; showAllEntries = false; render(); }));
    document.querySelectorAll("[data-process-menu]").forEach((b) => b.addEventListener("click", (event) => { event.stopPropagation(); document.querySelectorAll("[data-process-menu-panel]").forEach((panel) => { panel.hidden = panel.dataset.processMenuPanel !== b.dataset.processMenu; }); }));
    document.querySelectorAll("[data-share-process]").forEach((b) => b.addEventListener("click", () => openShareModal(b.dataset.shareProcess)));
  document.querySelectorAll("[data-entry-index]").forEach((entry) => entry.addEventListener("click", () => openEditModal(Number(entry.dataset.entryIndex))));
    saveViewState();
}
function openModal(upcomingMeeting = false) {
  editingIndex = null;
  upcomingEditingIndex = null;
  addingUpcomingMeeting = upcomingMeeting;
  $("#modal-eyebrow").textContent = upcomingMeeting ? "NEW UPCOMING MEETING" : "NEW TIMELINE ENTRY";
  $("#modal-title").textContent = "Add a meeting";
  $("#entry-form").querySelector("[type=submit]").textContent = "Save";
  $("#delete-entry").hidden = true;
  $("#entry-form").reset();
  $("#recording-label").textContent = "Attach a recording";
  $("#recording-status").textContent = "Audio or video; limited by available browser storage";
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
  $("#entry-location").value = entry.location || "";
  $("#entry-notes").value = entry.description || "";
  $("#recording-label").textContent = entry.recordingData?.name || (entry.recording ? "Recording attached" : "Attach a recording");
  $("#recording-status").textContent = entry.recordingData ? "Recording ready to keep" : "Audio or video; limited by available browser storage";
  $("#modal-backdrop").hidden = false;
  $("#entry-title").focus();
}
function closeModal() { $("#modal-backdrop").hidden = true; $("#entry-form").reset(); editingIndex = null; upcomingEditingIndex = null; addingUpcomingMeeting = false; }
function openUpcomingEdit(index) {
  const meeting = data.upcoming[index];
  if (!meeting) return;
  upcomingEditingIndex = index;
  addingUpcomingMeeting = false;
  editingIndex = null;
  $("#modal-eyebrow").textContent = "EDIT UPCOMING MEETING";
  $("#modal-title").textContent = "Edit meeting";
  $("#entry-form").querySelector("[type=submit]").textContent = "Save changes";
  $("#delete-entry").hidden = true;
  $("#entry-type").value = "meeting";
  $("#entry-title").value = meeting.title;
  $("#entry-date").value = meeting.date || "";
  $("#entry-time").value = meeting.time || "10:00";
  $("#entry-location").value = meeting.location || "";
  $("#entry-notes").value = meeting.description || "";
  $("#modal-backdrop").hidden = false;
  $("#entry-title").focus();
}
function toast(message) { const t = $("#toast"); t.textContent = message; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); }
function meetingDate(meeting) {
  if (meeting.date) return new Date(`${meeting.date}T${meeting.time || "12:00"}`);
  const month = new Date(`${meeting.month || ""} 1, ${calendarMonth.getFullYear()}`).getMonth();
  return Number.isFinite(month) && meeting.day ? new Date(calendarMonth.getFullYear(), month, Number(meeting.day), 12) : null;
}
function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  $("#calendar-title").textContent = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  $("#calendar-month-label").textContent = "Scheduled meetings";
  const meetings = (data.upcoming || []).filter((meeting) => meeting.status !== "completed").map((meeting) => ({ meeting, date: meetingDate(meeting) })).filter(({ date }) => date && date.getFullYear() === year && date.getMonth() === month);
  meetings.sort((a, b) => a.date - b.date);
  $("#calendar-list").innerHTML = meetings.map(({ meeting, date }) => {
    const processName = meeting.processName || meeting.meta?.split("•").pop()?.trim() || "Process";
    const time = meeting.time || meeting.meta?.split("•")[0]?.trim() || "Time to be confirmed";
    return `<article class="calendar-meeting"><div class="calendar-date"><strong>${date.toLocaleDateString("en-US", { day: "numeric" })}</strong><span>${date.toLocaleDateString("en-US", { weekday: "short" })}</span></div><div class="calendar-meeting-details"><h3>${meeting.title}</h3><p>${time} · ${meeting.location || "Location to be confirmed"}</p><small>${processName}</small></div></article>`;
  }).join("");
  $("#calendar-empty").hidden = meetings.length > 0;
}
function openCalendar() {
  calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  renderCalendar();
  $("#calendar-backdrop").hidden = false;
}
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
$("#new-entry").addEventListener("click", openModal); $("#add-meeting").addEventListener("click", () => { $("#upcoming-menu").hidden = true; openModal(true); });
$("#upcoming-menu-button").addEventListener("click", () => { const menu = $("#upcoming-menu"); menu.hidden = !menu.hidden; $("#upcoming-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); });
$("#timeline-menu-button").addEventListener("click", () => { const menu = $("#timeline-menu"); menu.hidden = !menu.hidden; $("#timeline-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); });
$("#sort-newest").addEventListener("click", () => { historySort = "newest"; $("#timeline-menu").hidden = true; render(); toast("History sorted newest first."); });
$("#sort-oldest").addEventListener("click", () => { historySort = "oldest"; $("#timeline-menu").hidden = true; render(); toast("History sorted oldest first."); });
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
  const removed = selected().entries[editingIndex];
  selected().entries.splice(editingIndex, 1);
  removeJournalRecord(removed?.id);
  save(); render(); closeModal(); toast("Entry deleted.");
});
$("#modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
$("#entry-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
  const file = $("#entry-recording").files[0];
  if (!$("#entry-title").value.trim() || !$("#entry-date").value) {
    toast("Add a title and date before saving.");
    return;
  }
  const existingEntry = editingIndex === null ? null : selected().entries[editingIndex];
  const date = new Date(`${$("#entry-date").value}T${$("#entry-time").value || "12:00"}`);
  const process = selected();
  let previousEntries = null;
  let previousUpcoming = null;
  const recording = file ? await storeRecording(file) : existingEntry?.recordingData;
  const hasRecording = Boolean(file) || Boolean(existingEntry?.recording || existingEntry?.recordingData);
  const location = $("#entry-location").value.trim();
  let savedId = existingEntry?.id;
  if (upcomingEditingIndex !== null) {
    const meeting = data.upcoming[upcomingEditingIndex];
    meeting.day = String(date.getDate()).padStart(2, "0");
    meeting.month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
    meeting.date = $("#entry-date").value;
    meeting.time = $("#entry-time").value || "12:00";
    meeting.title = $("#entry-title").value.trim();
    meeting.meta = `${meeting.time} • ${process.name}`;
    meeting.location = location;
    meeting.description = $("#entry-notes").value.trim();
    save();
    verifyEntrySaved(meeting.id);
    render(); closeModal(); toast("Upcoming meeting updated.");
    return;
  }
  const updatedEntry = { type: $("#entry-type").value, date: date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }), title: $("#entry-title").value, description: $("#entry-notes").value || "Entry captured in Threadline.", location, tags: [$("#entry-type").value === "meeting" ? "Minutes added" : "Personal note", ...(hasRecording ? ["Recording"] : [])], recording: hasRecording, ...(recording ? { recordingData: recording } : {}) };
  updatedEntry.id = existingEntry?.id || createId("entry");
  previousEntries = process.entries.slice();
  previousUpcoming = data.upcoming.slice();
  if (!addingUpcomingMeeting && editingIndex === null) process.entries.unshift(updatedEntry);
  else if (!addingUpcomingMeeting) process.entries[editingIndex] = updatedEntry;
  if (addingUpcomingMeeting) {
    const meeting = {
      id: createId("meeting"),
      day: String(date.getDate()).padStart(2, "0"),
      month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      title: $("#entry-title").value.trim(),
      meta: `${$("#entry-time").value || "12:00"} • ${process.name}`,
      location,
      date: $("#entry-date").value,
      time: $("#entry-time").value || "12:00",
      processId: process.id,
      processName: process.name,
      description: $("#entry-notes").value.trim()
    };
    data.upcoming.unshift(meeting);
    savedId = meeting.id;
  }
  const wasEditing = editingIndex !== null;
  save();
  if (addingUpcomingMeeting && promoteDueMeetings()) save();
  verifyEntrySaved(savedId);
  render();
  closeModal();
  toast(wasEditing ? "Entry updated." : (file ? "Entry and recording saved." : "Entry saved to the timeline."));
  } catch (error) {
    console.error(error);
    if (previousEntries) process.entries = previousEntries;
    if (previousUpcoming) data.upcoming = previousUpcoming;
    toast(`The entry could not be saved: ${error.message || "check browser storage and try again."}`);
  }
});
$("#entry-recording").addEventListener("change", () => {
  const file = $("#entry-recording").files[0];
  if (!file) return;
  $("#recording-label").textContent = file.name;
  $("#recording-status").textContent = `${Math.ceil(file.size / 1024 / 1024)} MB recording selected`;
});
function storeRecording(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("threadline-recordings", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const id = `recording-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const transaction = request.result.transaction("recordings", "readwrite");
      transaction.objectStore("recordings").put({ id, name: file.name, type: file.type, size: file.size, blob: file });
      transaction.oncomplete = () => resolve({ id, name: file.name, type: file.type, size: file.size });
      transaction.onerror = () => reject(transaction.error);
    };
  });
}
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
$("#open-calendar").addEventListener("click", openCalendar);
$("#calendar-close").addEventListener("click", () => { $("#calendar-backdrop").hidden = true; });
$("#calendar-previous").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
$("#calendar-next").addEventListener("click", () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$("#calendar-backdrop").addEventListener("click", (event) => { if (event.target.id === "calendar-backdrop") $("#calendar-backdrop").hidden = true; });
$("#add-process").addEventListener("click", () => { const name = prompt("Name this process"); if (name?.trim()) { const id = `${Date.now()}`; data.processes.push({ id, name: name.trim(), color: "blue", started: "Sep 13, 2026", entries: [] }); selectedId = id; save(); render(); toast("New process created."); } });
$("#settings-button").addEventListener("click", () => { renderAdminPeople(); renderDashboardSettings(); $("#settings-backdrop").hidden = false; });
$("#edit-my-profile").addEventListener("click", () => { $("#settings-backdrop").hidden = true; openUserEditor(currentUser(), false); });
$("#settings-close").addEventListener("click", () => { $("#settings-backdrop").hidden = true; });
$("#settings-backdrop").addEventListener("click", (event) => { if (event.target.id === "settings-backdrop") $("#settings-backdrop").hidden = true; });
$("#settings-backup").addEventListener("click", () => { backupAllData(); });
$("#settings-restore").addEventListener("click", () => { $("#settings-backdrop").hidden = true; $("#restore-file").click(); });
promotedMeetings = promoteDueMeetings();
render();
readStructuredSnapshot().then((snapshot) => {
  if (snapshot) mergeStoredRecords(snapshot);
  ensureStableIds();
  syncWorkspace();
  promoteDueMeetings();
  addDemoEntries();
  addTestProcesses();
  save();
  render();
}).catch((error) => console.warn("Unable to restore the structured Threadline snapshot.", error));
setInterval(() => render(), 30000);
