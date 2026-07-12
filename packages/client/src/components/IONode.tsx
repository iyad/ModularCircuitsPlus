import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";

export interface IONodeData extends Record<string, unknown> {
  label: string;
  kind: "input" | "output";
  pins: string[];
}

const HANDLE_SIZE = 8;
const PIN_ROW_HEIGHT = 24;

type IONodeType = Node<IONodeData, "io">;

export function IONode({ data }: NodeProps<IONodeType>) {
  const isInput = data.kind === "input";
  const accent = isInput ? "#22c55e" : "#ef4444";
  const bg = isInput ? "#14532d" : "#7f1d1d";
  const textColor = isInput ? "#bbf7d0" : "#fecaca";

  return (
    <div
      style={{
        background: bg,
        border: `2px solid ${accent}`,
        borderRadius: 8,
        minWidth: 90,
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "5px 10px",
          borderBottom: `1px solid ${accent}44`,
          textAlign: "center",
          fontWeight: "bold",
          fontSize: 10,
          letterSpacing: "0.08em",
          color: accent,
        }}
      >
        {data.label}
      </div>

      {/* Pin rows */}
      <div style={{ position: "relative", height: data.pins.length * PIN_ROW_HEIGHT }}>
        {data.pins.map((pin, i) => (
          <div
            key={pin}
            style={{
              position: "absolute",
              top: i * PIN_ROW_HEIGHT,
              left: 0,
              right: 0,
              height: PIN_ROW_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: isInput ? "flex-end" : "flex-start",
              padding: isInput ? "0 14px 0 8px" : "0 8px 0 14px",
            }}
          >
            {isInput ? (
              <>
                <span style={{ color: textColor, fontSize: 11 }}>{pin}</span>
                <Handle
                  type="source"
                  id={pin}
                  position={Position.Right}
                  style={{
                    background: accent,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    top: PIN_ROW_HEIGHT / 2,
                  }}
                />
              </>
            ) : (
              <>
                <Handle
                  type="target"
                  id={pin}
                  position={Position.Left}
                  style={{
                    background: accent,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    top: PIN_ROW_HEIGHT / 2,
                  }}
                />
                <span style={{ color: textColor, fontSize: 11 }}>{pin}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
