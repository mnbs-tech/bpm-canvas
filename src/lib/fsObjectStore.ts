// Server-only: the local-folder backend of ObjectStore, for running this app
// on a PC with no AWS account (see docs/LOCAL_RUNBOOK.md). Object keys become
// paths under WORKFLOW_DATA_DIR, so the folder mirrors the S3 key layout.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ObjectStore, StoredObject } from "./objectStore";

const ROOT = path.resolve(process.env.WORKFLOW_DATA_DIR || "data");

/** Half-written saves are named `<file>.<pid>.tmp` and must never be listed
 * as if they were a flow or a version. */
const TMP_SUFFIX = ".tmp";

function pathFor(key: string): string {
  // Keys are assembled from ids isSafeId() already vetted, but this backend
  // writes to the operator's own filesystem rather than a bucket prefix, so a
  // key that escapes ROOT must not be able to become a real path.
  const full = path.resolve(ROOT, key);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    throw new Error(`invalid storage key: ${key}`);
  }
  return full;
}

function isNotFound(err: unknown): boolean {
  return (err as { code?: string })?.code === "ENOENT";
}

/** Keys always use "/" regardless of the host's path separator, so the same
 * keys work here and on S3. */
function joinKey(dirKey: string, name: string): string {
  return dirKey.endsWith("/") ? `${dirKey}${name}` : `${dirKey}/${name}`;
}

async function walk(absDir: string, dirKey: string, out: StoredObject[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch (err) {
    // A prefix nobody has written to yet is an empty listing, not a failure.
    if (isNotFound(err)) return;
    throw err;
  }
  for (const entry of entries) {
    const key = joinKey(dirKey, entry.name);
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, `${key}/`, out);
    } else if (!entry.name.endsWith(TMP_SUFFIX)) {
      out.push({ key, size: (await fs.stat(abs)).size });
    }
  }
}

export function createFsObjectStore(): ObjectStore {
  return {
    async get(key) {
      try {
        return await fs.readFile(pathFor(key), "utf8");
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async put(key, body) {
      const file = pathFor(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}${TMP_SUFFIX}`;
      await fs.writeFile(tmp, body, "utf8");
      // Rename is atomic within a filesystem: losing power mid-save leaves
      // either the previous file or the new one, never a truncated
      // _index.json (which would read as "no saved flows at all").
      await fs.rename(tmp, file);
    },

    async remove(keys) {
      for (const key of keys) {
        try {
          await fs.unlink(pathFor(key));
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }
      }
      // A deleted flow's version directory would otherwise stay behind as an
      // empty folder named after an id nothing can open. Fails harmlessly
      // while the directory still holds anything.
      for (const dir of new Set(keys.map((key) => path.dirname(pathFor(key))))) {
        if (dir !== ROOT) await fs.rmdir(dir).catch(() => {});
      }
    },

    async list(prefix) {
      const dirKey = prefix.endsWith("/") ? prefix : `${prefix.replace(/[^/]*$/, "")}`;
      const found: StoredObject[] = [];
      await walk(pathFor(dirKey), dirKey, found);
      return found.filter((o) => o.key.startsWith(prefix));
    },
  };
}
