// Persisting the demo session, and refusing to restore one that no longer fits.
//
// The session is written to localStorage so a reload does not lose a negotiation
// halfway through. That is worth having and it carries a hazard: the snapshot is a
// serialised copy of this build's state shapes, and the next build's shapes are not
// promised to match. A stale `redlineDoc` restored into a renderer that now expects a
// field it does not carry throws during render, and a throw during render on a page
// whose state came out of storage reproduces itself on every reload.
//
// So the snapshot carries the schema it was written under, and a snapshot from any
// other schema is discarded rather than repaired — with one exception below, where the
// old shape is known well enough to carry a contract in progress across.
//
// Two kinds of snapshot.
//
// The GLOBAL snapshot, under PERSIST_KEY, holds what belongs to the estate rather than to
// any one contract: which contract is open, the role, the approval matrix, the audit
// trail, the Salesforce milestones, quick-added rows. One of these.
//
// A CONTRACT snapshot, under contractKey(id), holds one contract's whole lifecycle —
// draft, redline, decisions, signatures, obligations — plus a summary row so the list
// can show it without loading all of that. One per contract. Opening a different
// contract means reading a different one of these; the global snapshot is untouched.
//
// Bump SCHEMA whenever the shape of anything in either changes.

export const SCHEMA = 4;
export const PERSIST_KEY = "clm-demo-session-v1";
const CONTRACT_PREFIX = "clm-demo-contract-v1:";

function parse(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;                       // truncated or hand-edited
  }
}

function get(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }   // storage blocked
}

function set(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// ---------- the global snapshot ----------

/**
 * @returns {object|null} the snapshot, or null if there is none, it is unreadable, or
 *   it was written under a different schema.
 */
export function readSnapshot(storage) {
  const parsed = parse(get(storage, PERSIST_KEY));
  if (!parsed || parsed.__schema !== SCHEMA) return null;
  return parsed;
}

export function writeSnapshot(storage, state) {
  return set(storage, PERSIST_KEY, { ...state, __schema: SCHEMA });
}

export function clearSnapshot(storage) {
  try { storage?.removeItem(PERSIST_KEY); return true; } catch { return false; }
}

// ---------- contract snapshots ----------

export function contractKey(id) {
  return CONTRACT_PREFIX + id;
}

export function newSessionId() {
  return "c-" + Math.random().toString(36).slice(2, 8);
}

export function readContractSnapshot(storage, id) {
  if (!id) return null;
  const parsed = parse(get(storage, contractKey(id)));
  if (!parsed || parsed.__schema !== SCHEMA) return null;
  return parsed;
}

export function writeContractSnapshot(storage, id, state) {
  if (!id) return false;
  return set(storage, contractKey(id), { ...state, __schema: SCHEMA, savedAt: new Date().toISOString() });
}

export function removeContractSnapshot(storage, id) {
  try { storage?.removeItem(contractKey(id)); return true; } catch { return false; }
}

/**
 * Every contract with a snapshot, newest first. Only the summary is read out, which is
 * the point of keeping one: the list can show twenty contracts without deserialising
 * twenty redlines.
 *
 * @returns {Array<{ id, summary, savedAt }>}
 */
export function listContractSessions(storage) {
  const out = [];
  let n = 0;
  try { n = storage?.length ?? 0; } catch { return out; }
  for (let i = 0; i < n; i++) {
    let key = null;
    try { key = storage.key(i); } catch { continue; }
    if (!key || !key.startsWith(CONTRACT_PREFIX)) continue;
    const snap = parse(get(storage, key));
    if (!snap || snap.__schema !== SCHEMA) continue;
    out.push({ id: key.slice(CONTRACT_PREFIX.length), summary: snap.summary || null, savedAt: snap.savedAt || null });
  }
  return out.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
}

export function clearAllSessions(storage) {
  const keys = [];
  try {
    for (let i = 0; i < (storage?.length ?? 0); i++) {
      const k = storage.key(i);
      if (k && k.startsWith(CONTRACT_PREFIX)) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch { /* storage blocked: nothing to clear */ }
  clearSnapshot(storage);
}

// ---------- migration ----------

// Which keys of a v3 snapshot belonged to the estate rather than to the one contract it
// could hold. Everything else was that contract's.
const V3_GLOBAL_KEYS = ["auditLog", "sfMilestones", "approvalMatrix", "extraContracts"];

/**
 * A v3 snapshot held exactly one contract, mixed in with the estate-wide state. That
 * contract may be halfway through a negotiation, and discarding it on upgrade would be
 * the rule applied where it does harm. The shape is known, so it is carried across: the
 * contract's keys become a contract snapshot, the estate's keys become the global one,
 * and the carried contract is the one open.
 *
 * @returns {string|null} the id of the migrated contract, if there was one
 */
export function migrate(storage) {
  const raw = parse(get(storage, PERSIST_KEY));
  if (!raw || raw.__schema !== 3) return null;

  const global = {};
  const local = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "__schema") continue;
    (V3_GLOBAL_KEYS.includes(k) ? global : local)[k] = v;
  }

  let id = null;
  if (local.draftRecord) {
    id = newSessionId();
    writeContractSnapshot(storage, id, { ...local, summary: null });
  }
  writeSnapshot(storage, { ...global, activeContractId: id });
  return id;
}
