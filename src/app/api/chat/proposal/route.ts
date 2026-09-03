import { NextResponse } from "next/server";
import { proposeWorkflowEdit, type ChatMessage } from "@/lib/chatService";
import type { WorkflowDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ProposalRequestBody {
  messages: ChatMessage[];
  workflow: WorkflowDocument;
}

/**
 * Same input as /api/chat, but the answer comes back as a structured diff
 * (proposalSchema.ts) instead of prose - what the editor previews and applies.
 * Split from /api/chat because it is a separate, opt-in turn: the user only
 * pays for it when they press 「図に反映」 on an answer they liked.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ProposalRequestBody>;
  if (!Array.isArray(body.messages) || body.messages.length === 0 || !body.workflow) {
    return NextResponse.json({ detail: "messages and workflow are required" }, { status: 400 });
  }

  try {
    const proposal = await proposeWorkflowEdit(body.messages, body.workflow);
    return NextResponse.json({ proposal });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail }, { status: 502 });
  }
}
