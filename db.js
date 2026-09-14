/**
 * Threadline — IndexedDB storage layer
 * Database: threadline-v2  (separate from the old threadline-structured-data)
 * Stores: workspaces, processes, entries, upcoming, users, meta
 */

const DB_NAME = "threadline-v2";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("workspaces")) {
        db.createObjectStore("workspaces", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("processes")) {
        const ps = db.createObjectStore("processes", { keyPath: "id" });
        ps.createIndex("workspaceId", "workspaceId", { unique: false });
      }
      if (!db.objectStoreNames.contains("entries")) {
        const es = db.createObjectStore("entries", { keyPath: "id" });
        es.createIndex("processId", "processId", { unique: false });
      }
      if (!db.objectStoreNames.contains("upcoming")) {
        const us = db.createObjectStore("upcoming", { keyPath: "id" });
        us.createIndex("workspaceId", "workspaceId", { unique: false });
      }
      if (!db.objectStoreNames.contains("users")) {
        db.createObjectStore("users", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Generic helpers ────────────────────────────────────────────────────────────

function txGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function txGetAll(db, store) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txGetByIndex(db, store, index, value) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txPut(db, store, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function txPutAll(db, store, records) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    records.forEach((r) => os.put(r));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function txDelete(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function txDeleteByIndex(db, store, index, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const req = os.index(index).openKeyCursor(IDBKeyRange.only(value));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { os.delete(cursor.primaryKey); cursor.continue(); }
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function txClear(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export async function getMeta(key) {
  const db = await openDB();
  const row = await txGet(db, "meta", key);
  db.close();
  return row?.value ?? null;
}

export async function setMeta(key, value) {
  const db = await openDB();
  await txPut(db, "meta", { key, value });
  db.close();
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getUsers() {
  const db = await openDB();
  const users = await txGetAll(db, "users");
  db.close();
  return users;
}

export async function saveUser(user) {
  const db = await openDB();
  await txPut(db, "users", user);
  db.close();
}

export async function deleteUser(userId) {
  const db = await openDB();
  await txDelete(db, "users", userId);
  db.close();
}

// ── Workspaces ────────────────────────────────────────────────────────────────

export async function getWorkspaces() {
  const db = await openDB();
  const workspaces = await txGetAll(db, "workspaces");
  db.close();
  return workspaces;
}

export async function saveWorkspace(workspace) {
  const db = await openDB();
  // Store workspace without the embedded processes/upcoming arrays
  const { processes: _p, upcoming: _u, ...row } = workspace;
  await txPut(db, "workspaces", row);
  db.close();
}

export async function deleteWorkspace(workspaceId) {
  const db = await openDB();
  await txDelete(db, "workspaces", workspaceId);
  db.close();
}

// ── Processes ─────────────────────────────────────────────────────────────────

export async function getProcesses(workspaceId) {
  const db = await openDB();
  const processes = await txGetByIndex(db, "processes", "workspaceId", workspaceId);
  db.close();
  return processes;
}

export async function saveProcess(process, workspaceId) {
  const db = await openDB();
  const { entries: _e, ...row } = process;
  await txPut(db, "processes", { ...row, workspaceId });
  db.close();
}

export async function deleteProcess(processId) {
  const db = await openDB();
  await txDelete(db, "processes", processId);
  await txDeleteByIndex(db, "entries", "processId", processId);
  db.close();
}

// ── Entries ───────────────────────────────────────────────────────────────────

export async function getEntries(processId) {
  const db = await openDB();
  const entries = await txGetByIndex(db, "entries", "processId", processId);
  db.close();
  return entries;
}

export async function saveEntry(entry, processId) {
  const db = await openDB();
  await txPut(db, "entries", { ...entry, processId });
  db.close();
}

export async function deleteEntry(entryId) {
  const db = await openDB();
  await txDelete(db, "entries", entryId);
  db.close();
}

// ── Upcoming ──────────────────────────────────────────────────────────────────

export async function getUpcoming(workspaceId) {
  const db = await openDB();
  const upcoming = await txGetByIndex(db, "upcoming", "workspaceId", workspaceId);
  db.close();
  return upcoming;
}

export async function saveUpcoming(meeting, workspaceId) {
  const db = await openDB();
  await txPut(db, "upcoming", { ...meeting, workspaceId });
  db.close();
}

export async function deleteUpcoming(meetingId) {
  const db = await openDB();
  await txDelete(db, "upcoming", meetingId);
  db.close();
}

// ── Bulk import (migration + restore) ────────────────────────────────────────

export async function importAll(snapshot) {
  const db = await openDB();
  const stores = ["workspaces", "processes", "entries", "upcoming", "users", "meta"];
  await Promise.all(stores.map((s) => txClear(db, s)));

  for (const user of (snapshot.users || [])) {
    await txPut(db, "users", user);
  }

  await txPut(db, "meta", { key: "activeWorkspaceId", value: snapshot.activeWorkspaceId });

  for (const workspace of (snapshot.workspaces || [])) {
    const { processes: _p, upcoming: _u, ...wRow } = workspace;
    await txPut(db, "workspaces", wRow);
    for (const process of (workspace.processes || [])) {
      const { entries: _e, ...pRow } = process;
      await txPut(db, "processes", { ...pRow, workspaceId: workspace.id });
      for (const entry of (process.entries || [])) {
        await txPut(db, "entries", { ...entry, processId: process.id });
      }
    }
    for (const meeting of (workspace.upcoming || [])) {
      await txPut(db, "upcoming", { ...meeting, workspaceId: workspace.id });
    }
  }

  db.close();
}

// ── Bulk export (backup) ──────────────────────────────────────────────────────

export async function exportAll() {
  const db = await openDB();
  const [users, workspaces, processes, entries, upcoming] = await Promise.all([
    txGetAll(db, "users"),
    txGetAll(db, "workspaces"),
    txGetAll(db, "processes"),
    txGetAll(db, "entries"),
    txGetAll(db, "upcoming"),
  ]);
  const activeWorkspaceId = (await txGet(db, "meta", "activeWorkspaceId"))?.value ?? workspaces[0]?.id;
  db.close();

  // Reassemble nested structure for backup compatibility
  const assembled = workspaces.map((workspace) => {
    const wsProcesses = processes
      .filter((p) => p.workspaceId === workspace.id)
      .map((p) => {
        const { workspaceId: _w, ...pClean } = p;
        return { ...pClean, entries: entries.filter((e) => e.processId === p.id).map(({ processId: _pid, ...e }) => e) };
      });
    const wsUpcoming = upcoming
      .filter((u) => u.workspaceId === workspace.id)
      .map(({ workspaceId: _w, ...u }) => u);
    return { ...workspace, processes: wsProcesses, upcoming: wsUpcoming };
  });

  const activeWorkspace = assembled.find((w) => w.id === activeWorkspaceId) || assembled[0];
  return {
    users,
    activeWorkspaceId,
    workspaces: assembled,
    processes: activeWorkspace?.processes || [],
    upcoming: activeWorkspace?.upcoming || [],
  };
}

// ── Load full app state ───────────────────────────────────────────────────────

export async function loadAppState() {
  const db = await openDB();
  const [users, workspaces, processes, entries, upcoming] = await Promise.all([
    txGetAll(db, "users"),
    txGetAll(db, "workspaces"),
    txGetAll(db, "processes"),
    txGetAll(db, "entries"),
    txGetAll(db, "upcoming"),
  ]);
  const activeWorkspaceId = (await txGet(db, "meta", "activeWorkspaceId"))?.value ?? workspaces[0]?.id;
  db.close();

  if (!workspaces.length) return null;

  const assembled = workspaces.map((workspace) => {
    const wsProcesses = processes
      .filter((p) => p.workspaceId === workspace.id)
      .map((p) => {
        const { workspaceId: _w, ...pClean } = p;
        return {
          ...pClean,
          entries: entries
            .filter((e) => e.processId === p.id)
            .map(({ processId: _pid, ...e }) => e)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
        };
      });
    const wsUpcoming = upcoming
      .filter((u) => u.workspaceId === workspace.id)
      .map(({ workspaceId: _w, ...u }) => u);
    return { ...workspace, processes: wsProcesses, upcoming: wsUpcoming };
  });

  const activeWorkspace = assembled.find((w) => w.id === activeWorkspaceId) || assembled[0];
  return {
    users,
    activeWorkspaceId: activeWorkspace.id,
    workspaces: assembled,
    processes: activeWorkspace.processes,
    upcoming: activeWorkspace.upcoming,
  };
}

// ── Check if DB has data ──────────────────────────────────────────────────────

export async function hasData() {
  const db = await openDB();
  const count = await new Promise((resolve, reject) => {
    const req = db.transaction("workspaces", "readonly").objectStore("workspaces").count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return count > 0;
}
