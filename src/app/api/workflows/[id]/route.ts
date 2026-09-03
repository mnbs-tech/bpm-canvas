import { NextResponse } from "next/server";
import { deleteWorkflow, getWorkflow, saveWorkflow } from "@/lib/workflowStore";
import { describeIssues, parseWorkflowDocument } from "@/lib/workflowSchema";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const doc = await getWorkflow(id);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.json().catch(() => undefined);
  const parsed = parseWorkflowDocument(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { detail: `ワークフローの形式が不正です:\n${describeIssues(parsed.issues)}`, issues: parsed.issues },
      { status: 400 }
    );
  }
  const saved = await saveWorkflow(id, parsed.doc);
  return NextResponse.json(saved);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  await deleteWorkflow(id);
  return NextResponse.json({ ok: true });
}
