import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { findReleaseKit } from "@/lib/releaseKit";

export const dynamic = "force-dynamic";

export async function GET() {
  const kit = await findReleaseKit();
  if (!kit) {
    return NextResponse.json(
      { detail: "リリースキットがまだ作成されていません。" },
      { status: 404 }
    );
  }
  // Read whole rather than streamed: a kit is source only (a few MB), and the
  // filename comes from a directory listing, never from the request.
  return new NextResponse(new Uint8Array(await fs.readFile(kit.path)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${kit.filename}"`,
      "Content-Length": String(kit.size),
    },
  });
}
