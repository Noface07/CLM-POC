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
// other schema is discarded rather than repaired. Repairing it means guessing what the
// old shape meant; discarding it costs a demo session that can be replayed in a minute.
//
// Bump SCHEMA whenever the shape of anything in PERSISTED changes.

export const SCHEMA = 3;
export const PERSIST_KEY = "clm-demo-session-v1";

/**
 * @param {Storage} storage
 * @returns {object|null} the snapshot, or null if there is none, it is unreadable, or
 *   it was written under a different schema.
 */
export function readSnapshot(storage) {
  let raw;
  try {
    raw = storage?.getItem(PERSIST_KEY);
  } catch {
    return null;                       // storage blocked: there is nothing to restore
  }
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;                       // truncated or hand-edited
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.__schema !== SCHEMA) return null;
  return parsed;
}

export function writeSnapshot(storage, state) {
  try {
    storage?.setItem(PERSIST_KEY, JSON.stringify({ ...state, __schema: SCHEMA }));
    return true;
  } catch {
    // Blocked or full. The session will not survive a reload, which is acceptable.
    return false;
  }
}

export function clearSnapshot(storage) {
  try {
    storage?.removeItem(PERSIST_KEY);
    return true;
  } catch {
    return false;
  }
}
