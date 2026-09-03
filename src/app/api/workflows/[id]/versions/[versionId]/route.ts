import { NextResponse } from "next/server";
import { getVersion, isSafeId } from "@/lib/workflowStore";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

/** One stored snapshot, as a plain WorkflowDocument. Restoring it is a normal
 * PUT of this document back to /api/workflows/{id} - which stores the state it
 * replaces as a version of its own, so a restore is itself undoable. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id, versionId } = await params;
  if (!isSafeId(id) || !isSafeId(versionId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const doc = await getVersion(id, versionId);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(doc);
}
