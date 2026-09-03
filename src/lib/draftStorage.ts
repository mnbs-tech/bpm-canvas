import { parseWorkflowDocument } from "./workflowSchema";
import type { WorkflowDocument } from "./types";

/**
 * A single slot in this browser holding the *unsaved* state of whatever was
 * last edited. It exists for one failure: the tab dies (crash, an accidental
 * reload, a "leave site?" dismissed too fast) with work that never reached S3.
 *
 * It is deliberately not a sync mechanism. It never leaves the browser, holds
 * one document (not one per workflow), and is dropped the moment the real
 * save succeeds - at which point S3 is the truth again.
 */
const DRAFT_KEY = "workflow-builder:draft";

export interface StoredDraft {
  savedAt: string;
  doc: WorkflowDocument;
}

/** Storage can be unavailable (private windows, site data blocked) and can
 * throw on write (quota). Callers get false rather than an exception, and the
 * editor keeps working without a draft. */
export function writeDraft(doc: WorkflowDocument): boolean {
  try {
    const payload: StoredDraft = { savedAt: new Date().toISOString(), doc };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do: an unremovable draft is at worst one stale restore offer.
  }
}

/**
 * Returns the stored draft, or null if there is none, storage is unreadable,
 * or the content no longer parses. Running it through the same schema as a
 * file load means a draft written by an older version - or corrupted in
 * storage - offers nothing rather than restoring a document the canvas can't
 * render.
 */
export function readDraft(): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; doc?: unknown };
    const result = parseWorkflowDocument(parsed?.doc);
    if (!result.ok) {
      clearDraft();
      return null;
    }
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString();
    return { savedAt, doc: result.doc };
  } catch {
    return null;
  }
}
