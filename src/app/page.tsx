"use client";

import { ReactFlowProvider } from "@xyflow/react";
import WorkflowEditor from "@/components/WorkflowEditor";
import { ToastProvider } from "@/lib/toast";
import { DialogProvider } from "@/lib/dialog";

export default function Home() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Toasts outermost: a dialog can raise one (a save started from it
          failing), and its stack must sit above the dialog's backdrop. */}
      <ToastProvider>
        <DialogProvider>
          <ReactFlowProvider>
            <WorkflowEditor />
          </ReactFlowProvider>
        </DialogProvider>
      </ToastProvider>
    </div>
  );
}
