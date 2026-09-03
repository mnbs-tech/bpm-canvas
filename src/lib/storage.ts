import { BASE_PATH } from "./basePath";
import { describeIssues, parseWorkflowDocument } from "./workflowSchema";
import type { WorkflowDocument, WorkflowIndexEntry, WorkflowVersionEntry } from "./types";

const API_BASE = `${BASE_PATH}/api/workflows`;

async function unwrapJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // A 400 from the schema check carries a readable `detail`; show that
    // rather than the raw JSON envelope around it.
    let detail = "";
    try {
      detail = (JSON.parse(body) as { detail?: string }).detail ?? "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `API error ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function listS3Workflows(): Promise<WorkflowIndexEntry[]> {
  const res = await fetch(API_BASE, { cache: "no-store" });
  return unwrapJson(res);
}

export async function loadS3Workflow(id: string): Promise<WorkflowDocument> {
  const res = await fetch(`${API_BASE}/${id}`, { cache: "no-store" });
  return unwrapJson(res);
}

export async function createS3Workflow(doc: WorkflowDocument): Promise<WorkflowDocument> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  return unwrapJson(res);
}

export async function updateS3Workflow(id: string, doc: WorkflowDocument): Promise<WorkflowDocument> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  return unwrapJson(res);
}

export async function listS3Versions(id: string): Promise<WorkflowVersionEntry[]> {
  const res = await fetch(`${API_BASE}/${id}/versions`, { cache: "no-store" });
  return unwrapJson(res);
}

export async function loadS3Version(id: string, versionId: string): Promise<WorkflowDocument> {
  const res = await fetch(`${API_BASE}/${id}/versions/${versionId}`, { cache: "no-store" });
  return unwrapJson(res);
}

export async function deleteS3Workflow(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
  await unwrapJson(res);
}

export function downloadWorkflow(doc: WorkflowDocument) {
  const json = JSON.stringify(doc, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = doc.name.trim() ? doc.name.trim() : "workflow";
  a.href = url;
  a.download = `${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readWorkflowFile(file: File): Promise<WorkflowDocument> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        // Same schema the API enforces, so a file that loads here is a file
        // that will save, and the failure names the field either way.
        const result = parseWorkflowDocument(JSON.parse(String(reader.result)));
        if (!result.ok) {
          throw new Error(`不正なワークフローファイルです:\n${describeIssues(result.issues)}`);
        }
        resolve(result.doc);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("ファイルの読み込みに失敗しました"));
    reader.readAsText(file);
  });
}
