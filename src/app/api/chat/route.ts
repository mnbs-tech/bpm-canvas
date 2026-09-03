import { NextResponse } from "next/server";
import { askWorkflowAssistant, type ChatMessage } from "@/lib/chatService";
import type { WorkflowDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ChatRequestBody {
  messages: ChatMessage[];
  workflow: WorkflowDocument;
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ChatRequestBody>;
  if (!Array.isArray(body.messages) || body.messages.length === 0 || !body.workflow) {
    return NextResponse.json({ detail: "messages and workflow are required" }, { status: 400 });
  }

  try {
    const reply = await askWorkflowAssistant(body.messages, body.workflow);
    return NextResponse.json({ reply });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail }, { status: 502 });
  }
}
