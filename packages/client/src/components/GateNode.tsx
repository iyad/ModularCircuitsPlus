import { useState, useRef, useEffect } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { GateNodeData } from "../flowTypes";

const HANDLE_SIZE = 8;

export function GateNode({ id, data, selected }: NodeProps<GateNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed) updateNodeData(id, { label: trimmed });
    else setDraft(data.label);
    setEditing(false);
  };

  const pinRowHeight = 22;
  const rows = Math.max(data.inputs.length, data.outputs.length);
  const bodyHeight = Math.max(rows * pinRowHeight, pinRowHeight);

  return (
    <div
      style={{
        background: selected ? "#1e40af" : "#1e3a8a",
        border: `2px solid ${selected ? "#60a5fa" : "#3b82f6"}`,
        borderRadius: 8,
        minWidth: 100,
        color: "#fff",
        fontSize: 11,
        fontFamily: "monospace",
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "6px 12px",
          borderBottom: "1px solid #2d4fa0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 38,
        }}
        onDoubleClick={() => { setDraft(data.label); setEditing(true); }}
        title="Double-click to rename"
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") { setDraft(data.label); setEditing(false); }
            }}
            style={{
              background: "#0f172a",
              border: "1px solid #60a5fa",
              borderRadius: 3,
              color: "#fff",
              fontFamily: "monospace",
              fontSize: 12,
              fontWeight: "bold",
              textAlign: "center",
              width: "100%",
              padding: "1px 4px",
              outline: "none",
            }}
            // Prevent React Flow from intercepting key events
            onKeyUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div style={{ fontWeight: "bold", fontSize: 13, cursor: "text" }}>{data.label}</div>
        )}
        {data.label !== data.typeLabel && !editing && (
          <div style={{ color: "#93c5fd", fontSize: 9, marginTop: 1 }}>{data.typeLabel}</div>
        )}
      </div>

      {/* Pin rows */}
      <div style={{ position: "relative", height: bodyHeight, padding: "0 10px" }}>
        {data.inputs.map((pin, i) => (
          <div
            key={`in-${pin}`}
            style={{
              position: "absolute",
              left: 0,
              top: i * pinRowHeight + (pinRowHeight - HANDLE_SIZE) / 2,
              width: "50%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              paddingLeft: 14,
            }}
          >
            <Handle
              type="target"
              id={pin}
              position={Position.Left}
              style={{ background: "#94a3b8", width: HANDLE_SIZE, height: HANDLE_SIZE, top: HANDLE_SIZE / 2 }}
            />
            <span style={{ color: "#cbd5e1", fontSize: 10 }}>{pin}</span>
          </div>
        ))}

        {data.outputs.map((pin, i) => (
          <div
            key={`out-${pin}`}
            style={{
              position: "absolute",
              right: 0,
              top: i * pinRowHeight + (pinRowHeight - HANDLE_SIZE) / 2,
              width: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
              paddingRight: 14,
            }}
          >
            <span style={{ color: "#6ee7b7", fontSize: 10 }}>{pin}</span>
            <Handle
              type="source"
              id={pin}
              position={Position.Right}
              style={{ background: "#34d399", width: HANDLE_SIZE, height: HANDLE_SIZE, top: HANDLE_SIZE / 2 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
