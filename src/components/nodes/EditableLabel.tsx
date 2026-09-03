"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { useReactFlow } from "@xyflow/react";

interface EditableLabelProps {
  nodeId: string;
  value: string;
  className?: string;
  inputClassName?: string;
  style?: CSSProperties;
  multiline?: boolean;
}

export default function EditableLabel({
  nodeId,
  value,
  className,
  inputClassName,
  style,
  multiline = false,
}: EditableLabelProps) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim() || value;
    setNodes((nodes) =>
      nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label: next } } : n
      )
    );
  };

  if (editing) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <Tag
        ref={ref as never}
        className={`nodrag bg-white/80 outline-none ${inputClassName ?? ""}`}
        style={style}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !multiline) commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`nodrag cursor-text select-none ${className ?? ""}`}
      style={style}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
      title="ダブルクリックで編集"
    >
      {value}
    </div>
  );
}
