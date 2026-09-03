import { z } from "zod";
import { CURRENT_FORMAT_VERSION, DEFAULT_LANE_COLOR, NODE_KINDS } from "./types";
import type { WorkflowDocument } from "./types";

// The messages are shown to users (in the load dialog and in the API's
// `detail`), and the rest of this app speaks Japanese, so zod should too.
z.config(z.locales.ja());

/**
 * The one definition of "is this a workflow document", shared by the API
 * (before anything reaches S3) and by local file loading. Anything that gets
 * past this is safe to render; anything rejected is reported by field so the
 * user can fix the file instead of guessing.
 *
 * Two rules shape it:
 *
 * 1. **Strict about structure, lenient about what has a documented default.**
 *    A missing `orientation` or `name` is not an error - the app has always
 *    filled those in (SPEC §4 互換性), and rejecting them would break both
 *    formatVersion-1 files and the hand-written/AI-generated JSON the user
 *    guide encourages. A node without a position, or with a type this app
 *    cannot render, *is* an error: it would break the canvas.
 * 2. **Unknown keys pass through untouched.** `public/workflow-format.md`
 *    promises that extra keys on `data` survive a round trip, and React Flow
 *    itself stores bookkeeping fields (measured, dragging, ...) on nodes and
 *    edges. Stripping them here would silently lose data on every save.
 */

const position = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const nodeData = z.looseObject({
  label: z.string().default(""),
  subflowId: z.string().optional(),
});

const workflowNode = z.looseObject({
  id: z.string().min(1),
  type: z.enum(NODE_KINDS),
  position,
  data: nodeData.optional().default({ label: "" }),
});

const workflowEdge = z.looseObject({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

const lane = z.looseObject({
  id: z.string().min(1).optional(),
  name: z.string().default(""),
  color: z.string().default(DEFAULT_LANE_COLOR),
});

/** Duplicate ids make React Flow render one node and silently drop the other,
 * and make an edge's endpoint ambiguous - worth catching at the door. */
function checkDuplicateIds(
  items: { id: string }[],
  what: string,
  path: (string | number)[],
  ctx: z.RefinementCtx
) {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, index, "id"],
        message: `${what}のidが重複しています: ${item.id}`,
      });
    }
    seen.add(item.id);
  }
}

const flowGraph = z
  .looseObject({
    nodes: z.array(workflowNode).default([]),
    edges: z.array(workflowEdge).default([]),
  })
  .superRefine((graph, ctx) => {
    checkDuplicateIds(graph.nodes, "ノード", ["nodes"], ctx);
    checkDuplicateIds(graph.edges, "エッジ", ["edges"], ctx);
  });

export const workflowDocumentSchema = z
  .looseObject({
    formatVersion: z.number().int().positive().default(CURRENT_FORMAT_VERSION),
    id: z.string().min(1).optional(),
    name: z.string().default("ワークフロー"),
    // Absent means a pre-orientation file, which was always vertical
    // (SPEC §4 互換性) - not an error.
    orientation: z.enum(["horizontal", "vertical"]).default("vertical"),
    lanes: z.array(lane).default([]),
    nodes: z.array(workflowNode),
    edges: z.array(workflowEdge),
    subflows: z.record(z.string(), flowGraph).optional(),
    updatedAt: z.string().default(() => new Date().toISOString()),
  })
  .superRefine((doc, ctx) => {
    checkDuplicateIds(doc.nodes, "ノード", ["nodes"], ctx);
    checkDuplicateIds(doc.edges, "エッジ", ["edges"], ctx);
  });

export interface SchemaIssue {
  /** Dotted path to the offending field, e.g. "nodes.3.position.x". */
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; doc: WorkflowDocument }
  | { ok: false; issues: SchemaIssue[] };

/** How many issues to report; a badly wrong file can produce hundreds, and a
 * few concrete ones are more useful than a wall of them. */
const MAX_ISSUES = 10;

export function parseWorkflowDocument(input: unknown): ParseResult {
  const result = workflowDocumentSchema.safeParse(input);
  if (result.success) {
    // Lanes may arrive without ids (hand-written or AI-generated files). Ids
    // only have to be unique within the document, so filling them in here is
    // safe and saves the user a round of "why is my file rejected".
    const lanes = result.data.lanes.map((l, i) => ({
      ...l,
      id: l.id ?? `lane-${i + 1}`,
      name: l.name || `レーン${i + 1}`,
    }));
    return { ok: true, doc: { ...result.data, lanes } as WorkflowDocument };
  }
  const issues = result.error.issues.slice(0, MAX_ISSUES).map((issue) => ({
    path: issue.path.join(".") || "(全体)",
    message: issue.message,
  }));
  return { ok: false, issues };
}

/** One-line-per-issue rendering, for an alert or an API `detail` string. */
export function describeIssues(issues: SchemaIssue[]): string {
  return issues.map((i) => `${i.path}: ${i.message}`).join("\n");
}
