import { NextResponse } from "next/server";
import { createWorkflow, listWorkflows } from "@/lib/workflowStore";
import { describeIssues, parseWorkflowDocument } from "@/lib/workflowSchema";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await listWorkflows();
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  const parsed = parseWorkflowDocument(body);
  if (!parsed.ok) {
    // Rejected here rather than in S3: a malformed document that gets stored
    // is a workflow nobody can open again.
    return NextResponse.json(
      { detail: `ワークフローの形式が不正です:\n${describeIssues(parsed.issues)}`, issues: parsed.issues },
      { status: 400 }
    );
  }
  const saved = await createWorkflow(parsed.doc);
  return NextResponse.json(saved);
}
