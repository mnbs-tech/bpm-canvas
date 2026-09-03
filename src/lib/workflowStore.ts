import { v4 as uuidv4 } from "uuid";
import { objectStore } from "./objectStore";
import type { WorkflowDocument, WorkflowIndexEntry, WorkflowVersionEntry } from "./types";

/** The key layout, shared by both storage backends (see objectStore.ts). */
const PREFIX = "workflow-builder/flows/";
/** One object per save, under `<VERSIONS_PREFIX><flow id>/<version id>.json`.
 * App-managed rather than S3 bucket versioning: the bucket is shared with
 * claude-dashboard (turning versioning on would version its objects too, and
 * versioning can only be suspended afterwards, never removed), and this
 * instance's role is not allowed to read or set the bucket's versioning
 * configuration in the first place. The local-folder backend has no
 * equivalent feature to defer to at all. */
const VERSIONS_PREFIX = "workflow-builder/versions/";
const INDEX_KEY = `${PREFIX}_index.json`;

/** How many past saves to keep per workflow. Old ones are pruned on save, so
 * a flow that is saved constantly can't grow its history without bound. */
const MAX_VERSIONS = 30;

function docKey(id: string) {
  return `${PREFIX}${id}.json`;
}

/** Ids reach the store from URL path segments, so anything that isn't a plain
 * id is refused rather than being pasted into a storage key - "../" in a
 * segment would otherwise address objects outside the prefix. */
export function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function versionPrefix(id: string) {
  return `${VERSIONS_PREFIX}${id}/`;
}

function versionKey(id: string, versionId: string) {
  return `${versionPrefix(id)}${versionId}.json`;
}

/** Sorts lexically in save order, since the timestamp leads. The random tail
 * only separates two saves landing in the same millisecond. */
function newVersionId(savedAt: string): string {
  return `${savedAt.replace(/[-:.]/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
}

/** The timestamp back out of a version id, as ISO 8601. */
function savedAtOf(versionId: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z/.exec(versionId);
  if (!m) return "";
  const [, y, mo, d, h, mi, sec, ms] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${sec}.${ms}Z`;
}

/** Newest first. */
export async function listVersions(id: string): Promise<WorkflowVersionEntry[]> {
  const objects = await objectStore().list(versionPrefix(id));
  return objects
    .map((o) => {
      const versionId = o.key.slice(versionPrefix(id).length).replace(/\.json$/, "");
      return { versionId, savedAt: savedAtOf(versionId), size: o.size };
    })
    .sort((a, b) => b.versionId.localeCompare(a.versionId));
}

export async function getVersion(id: string, versionId: string): Promise<WorkflowDocument | null> {
  const text = await objectStore().get(versionKey(id, versionId));
  return text === null ? null : (JSON.parse(text) as WorkflowDocument);
}

/** Stores the just-saved document as a version and prunes the oldest beyond
 * MAX_VERSIONS. Failures here are swallowed by the caller: losing a history
 * entry must never fail the save itself. */
async function writeVersion(id: string, doc: WorkflowDocument): Promise<void> {
  const store = objectStore();
  await store.put(versionKey(id, newVersionId(doc.updatedAt as string)), JSON.stringify(doc));
  const objects = await store.list(versionPrefix(id));
  if (objects.length <= MAX_VERSIONS) return;
  const stale = objects
    .map((o) => o.key)
    .sort((a, b) => b.localeCompare(a))
    .slice(MAX_VERSIONS);
  await store.remove(stale);
}

async function deleteAllVersions(id: string): Promise<void> {
  const objects = await objectStore().list(versionPrefix(id));
  if (objects.length > 0) await objectStore().remove(objects.map((o) => o.key));
}

export async function listWorkflows(): Promise<WorkflowIndexEntry[]> {
  const text = await objectStore().get(INDEX_KEY);
  if (text === null) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [];
}

export async function getWorkflow(id: string): Promise<WorkflowDocument | null> {
  const text = await objectStore().get(docKey(id));
  return text === null ? null : (JSON.parse(text) as WorkflowDocument);
}

/** Saves the document under `id` and upserts it into the index manifest.
 * Note: the index read-modify-write is not locked, so two saves racing at
 * the exact same moment could clobber each other's index entry - acceptable
 * for this internal single-team tool. */
export async function saveWorkflow(id: string, doc: WorkflowDocument): Promise<WorkflowDocument> {
  const store = objectStore();
  const saved: WorkflowDocument = { ...doc, id, updatedAt: new Date().toISOString() };
  await store.put(docKey(id), JSON.stringify(saved));

  const index = await listWorkflows();
  const entry: WorkflowIndexEntry = {
    id,
    name: saved.name,
    orientation: saved.orientation,
    updatedAt: saved.updatedAt,
  };
  await store.put(INDEX_KEY, JSON.stringify([entry, ...index.filter((e) => e.id !== id)]));

  // History is a convenience, not the save: if snapshotting fails (permissions,
  // a transient storage error), the document is already stored and the user is
  // told the save succeeded, which it did.
  try {
    await writeVersion(id, saved);
  } catch (err) {
    console.error("failed to write version snapshot", err);
  }

  return saved;
}

export async function createWorkflow(doc: WorkflowDocument): Promise<WorkflowDocument> {
  return saveWorkflow(uuidv4(), doc);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const store = objectStore();
  await store.remove([docKey(id)]);
  // The history of a flow nobody can open again is unreachable storage.
  await deleteAllVersions(id);
  const index = await listWorkflows();
  await store.put(INDEX_KEY, JSON.stringify(index.filter((e) => e.id !== id)));
}
