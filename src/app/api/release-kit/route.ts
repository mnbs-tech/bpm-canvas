import { NextResponse } from "next/server";
import { findReleaseKit } from "@/lib/releaseKit";

export const dynamic = "force-dynamic";

/** Whether a kit exists, so the ⚙️ menu can say "built on <date>, N MB"
 * instead of offering a link that 404s. */
export async function GET() {
  const kit = await findReleaseKit();
  if (!kit) return NextResponse.json({ available: false });
  return NextResponse.json({
    available: true,
    filename: kit.filename,
    size: kit.size,
    builtAt: kit.builtAt,
  });
}
