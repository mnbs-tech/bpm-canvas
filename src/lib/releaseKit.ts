// Server-only: locates the release kit archive that `npm run kit` builds
// (scripts/build-release-kit.sh) so the ⚙️ menu can hand it to the user.
import { promises as fs } from "node:fs";
import path from "node:path";

const KIT_DIR = path.resolve(process.env.WORKFLOW_KIT_DIR || "dist");
const KIT_NAME = /^workflow-builder-kit-.+\.zip$/;

export interface ReleaseKit {
  filename: string;
  path: string;
  size: number;
  builtAt: string;
}

/** The newest built kit, or `null` when there is none. Kits are built only
 * when someone asks for one, so "no kit" is an ordinary state, not a fault. */
export async function findReleaseKit(): Promise<ReleaseKit | null> {
  let names: string[];
  try {
    names = await fs.readdir(KIT_DIR);
  } catch {
    return null;
  }

  const kits: ReleaseKit[] = [];
  for (const filename of names.filter((n) => KIT_NAME.test(n))) {
    const full = path.join(KIT_DIR, filename);
    const stat = await fs.stat(full);
    kits.push({ filename, path: full, size: stat.size, builtAt: stat.mtime.toISOString() });
  }
  kits.sort((a, b) => b.builtAt.localeCompare(a.builtAt));
  return kits[0] ?? null;
}
