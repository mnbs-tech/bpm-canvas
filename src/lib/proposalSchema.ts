import { z } from "zod";
import { NODE_KINDS } from "./types";

// Same reason as workflowSchema.ts: these messages reach the user.
z.config(z.locales.ja());

/**
 * The shape of an AI proposal: a list of edits to the document currently open,
 * not a rewritten document. A diff is what makes a preview possible (this node
 * is new, that edge goes away) and what keeps the AI from silently dropping
 * everything it did not mention - which is exactly what handing back a whole
 * regenerated JSON would do.
 *
 * Ids in a proposal are *references*, not final ids:
 * - an id that already exists in the document names that element
 * - an id introduced by `addNode` is a name the model invents so its own
 *   `addEdge` operations can point at it; applyProposal.ts swaps it for a
 *   fresh uuid, so it can never collide with anything already saved.
 *
 * Unknown keys are stripped (unlike the document schema, which preserves
 * them): nothing here is stored, so there is nothing to round-trip, and a
 * model that invents a field should not have it silently accepted.
 */

/** Node details the model may fill in - mirrors NODE_DETAIL_FIELDS in types.ts. */
const nodeDetails = z.object({
  description: z.string().optional(),
  assignee: z.string().optional(),
  duration: z.string().optional(),
  system: z.string().optional(),
  documents: z.string().optional(),
});

/** "root" or a subflow id. Absent means the root flow. */
const flowId = z.string().min(1).optional();

/** A subflow node cannot be added by a proposal: it would arrive with an
 * empty inside, and there is no way in one diff to say what goes in it.
 * Removing one (and its contents) is fine. */
const addableKind = z.enum(NODE_KINDS).exclude(["subflow"]);

const addNode = z.object({
  op: z.literal("addNode"),
  flowId,
  id: z.string().min(1),
  kind: addableKind,
  label: z.string().min(1),
  /** Index into the document's `lanes`. Out of range is clamped; absent means
   * "the lane the node it connects to is in". */
  lane: z.number().int().nonnegative().optional(),
  details: nodeDetails.optional(),
});

const updateNode = z.object({
  op: z.literal("updateNode"),
  flowId,
  id: z.string().min(1),
  label: z.string().optional(),
  /** An empty string clears a field, matching the details panel: absent and
   * blank are the same thing in the document. */
  details: nodeDetails.optional(),
});

const removeNode = z.object({
  op: z.literal("removeNode"),
  flowId,
  id: z.string().min(1),
});

const addEdge = z.object({
  op: z.literal("addEdge"),
  flowId,
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  /** Only meaningful out of a branch node: "yes" / "no" / "default". Seeds the
   * label the same way drawing that edge by hand would. */
  sourceHandle: z.string().optional(),
});

const removeEdge = z.object({
  op: z.literal("removeEdge"),
  flowId,
  id: z.string().min(1),
});

export const proposalOperationSchema = z.discriminatedUnion("op", [
  addNode,
  updateNode,
  removeNode,
  addEdge,
  removeEdge,
]);

/** How many operations one proposal may carry. A model that answers with a
 * hundred edits has misunderstood the request; applying it blind would be a
 * rewrite, not a suggestion. */
const MAX_OPERATIONS = 60;

export const workflowProposalSchema = z.object({
  /** One or two sentences, shown at the top of the preview banner. */
  summary: z.string().default(""),
  operations: z.array(proposalOperationSchema).min(1).max(MAX_OPERATIONS),
});

export type ProposalOperation = z.infer<typeof proposalOperationSchema>;
export type WorkflowProposal = z.infer<typeof workflowProposalSchema>;
export type NodeDetailPatch = z.infer<typeof nodeDetails>;

/**
 * Pulls the proposal out of whatever `claude -p` actually printed. Asking for
 * "JSON only" mostly works, but a stray ```json fence or a line of preamble is
 * common enough that failing the whole turn over it would be needlessly
 * brittle - so take the outermost {...} and parse that.
 */
export function parseProposalText(raw: string): WorkflowProposal {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("AIの応答からJSONを取り出せませんでした");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new Error("AIの応答がJSONとして読めませんでした");
  }

  const result = workflowProposalSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(全体)"}: ${i.message}`)
      .join(" / ");
    throw new Error(`AIの提案が想定の形式ではありませんでした: ${detail}`);
  }
  return result.data;
}
