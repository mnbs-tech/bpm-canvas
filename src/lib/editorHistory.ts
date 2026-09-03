"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Edge } from "@xyflow/react";
import type { FlowGraph, LaneData, LaneOrientation, WorkflowNode } from "./types";

/**
 * Everything the undo stack restores. This is the *whole* editor state, not
 * just the visible flow: `flows` holds every other subflow, and `s3Id` rides
 * along so that undoing across an "開く" can't leave the editor pointed at
 * one document while showing another's contents (which would make the next
 * 保存 overwrite the wrong workflow).
 */
export interface EditorSnapshot {
  name: string;
  orientation: LaneOrientation;
  lanes: LaneData[];
  nodes: WorkflowNode[];
  edges: Edge[];
  flows: Record<string, FlowGraph>;
  currentFlowId: string;
  breadcrumb: { id: string; label: string }[];
  s3Id: string | undefined;
}

/** Dragging a node fires a change per frame; this collapses a continuous
 * gesture into one undo step. Long enough to swallow a drag, short enough
 * that Ctrl+Z right after a click still has something to undo. */
const DEBOUNCE_MS = 300;

/** Snapshots are shallow copies of arrays that React Flow already keeps
 * around, so the cost is references, not nodes. 50 is far past what anyone
 * reaches for in practice. */
const HISTORY_LIMIT = 50;

interface Options {
  /** Current editor state. Must be memoized on its parts, not rebuilt on every render. */
  snapshot: EditorSnapshot;
  /** Writes a snapshot back into the editor's useState setters. */
  apply: (snapshot: EditorSnapshot) => void;
  /**
   * Shared with WorkflowEditor's dirty tracking: React Flow measures node
   * sizes shortly after mount and pushes that back through onNodesChange,
   * which looks exactly like an edit. Changes inside this window are folded
   * into the baseline instead of becoming undo steps.
   */
  suppressUntilRef: RefObject<number>;
}

export interface EditorHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /**
   * Pushes a state as an undo step *before* a discrete destructive action
   * (クリア, テンプレート読み込み, 開く). Those all reset the suppress window,
   * so without this their "before" state would be folded into the baseline and
   * lost.
   *
   * Pass a snapshot explicitly when what is on screen right now is not what
   * undo should return to - the AI proposal preview replaces the canvas with a
   * marked-up copy first, so it records the state from before the preview.
   */
  recordNow: (state?: EditorSnapshot) => void;
}

export function useEditorHistory({ snapshot, apply, suppressUntilRef }: Options): EditorHistory {
  const pastRef = useRef<EditorSnapshot[]>([]);
  const futureRef = useRef<EditorSnapshot[]>([]);
  /** The state the next undo step would return to - i.e. the last one recorded. */
  const baselineRef = useRef(snapshot);
  /** The newest state seen, recorded or not. Read by handlers, which run
   * outside render and so can't use `snapshot` from a stale closure. */
  const currentRef = useRef(snapshot);
  /** Set while writing a snapshot back, so the resulting state change isn't
   * mistaken for a fresh edit and re-recorded. */
  const applyingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [counts, setCounts] = useState({ past: 0, future: 0 });

  const syncCounts = useCallback(() => {
    setCounts({ past: pastRef.current.length, future: futureRef.current.length });
  }, []);

  /** Moves the baseline forward, making the state it held an undo step. */
  const commit = useCallback(
    (next: EditorSnapshot) => {
      pastRef.current = [...pastRef.current, baselineRef.current].slice(-HISTORY_LIMIT);
      futureRef.current = [];
      baselineRef.current = next;
      syncCounts();
    },
    [syncCounts]
  );

  /** Records a debounced edit early, so an undo issued mid-gesture doesn't
   * skip past it. No-op when nothing is pending. */
  const flushPending = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    commit(currentRef.current);
  }, [commit]);

  useEffect(() => {
    currentRef.current = snapshot;

    if (applyingRef.current) {
      applyingRef.current = false;
      baselineRef.current = snapshot;
      return;
    }
    if (Date.now() < suppressUntilRef.current) {
      baselineRef.current = snapshot;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commit(snapshot);
    }, DEBOUNCE_MS);
  }, [snapshot, commit, suppressUntilRef]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const undo = useCallback(() => {
    flushPending();
    const past = pastRef.current;
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [currentRef.current, ...futureRef.current];
    applyingRef.current = true;
    baselineRef.current = previous;
    apply(previous);
    syncCounts();
  }, [apply, flushPending, syncCounts]);

  const redo = useCallback(() => {
    // An unrecorded edit means the redo branch is stale; committing it drops
    // the future, which is the correct outcome rather than a surprise jump.
    flushPending();
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, currentRef.current].slice(-HISTORY_LIMIT);
    applyingRef.current = true;
    baselineRef.current = next;
    apply(next);
    syncCounts();
  }, [apply, flushPending, syncCounts]);

  const recordNow = useCallback((state?: EditorSnapshot) => {
    flushPending();
    pastRef.current = [...pastRef.current, state ?? currentRef.current].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    syncCounts();
  }, [flushPending, syncCounts]);

  return { canUndo: counts.past > 0, canRedo: counts.future > 0, undo, redo, recordNow };
}
