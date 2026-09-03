import { NextResponse } from "next/server";
import { isSafeId, listVersions } from "@/lib/workflowStore";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Past saves of one workflow, newest first. Empty for a workflow that has
 * never been saved, or that only has saves from before history existed. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  if (!isSafeId(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  return NextResponse.json(await listVersions(id));
}
