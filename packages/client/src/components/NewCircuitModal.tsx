import { useState } from "react";

interface Props {
  onConfirm: (
    name: string,
    description: string,
    inputs: string[],
    outputs: string[]
  ) => void;
  onCancel: () => void;
}

export function NewCircuitModal({ onConfirm, onCancel }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inputsStr, setInputsStr] = useState("a, b");
  const [outputsStr, setOutputsStr] = useState("out");

  const handle = () => {
    const inputs = inputsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const outputs = outputsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (name && inputs.length && outputs.length) {
      onConfirm(name, description, inputs, outputs);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#e2e8f0",
    borderRadius: 4,
    padding: "6px 10px",
    width: "100%",
    fontSize: 13,
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: 24,
          width: 400,
        }}
      >
        <h2 style={{ color: "#e2e8f0", margin: "0 0 16px", fontSize: 16 }}>
          New Circuit
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Inputs (comma-separated, e.g. a, b)"
            value={inputsStr}
            onChange={(e) => setInputsStr(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Outputs (comma-separated, e.g. out)"
            value={outputsStr}
            onChange={(e) => setOutputsStr(e.target.value)}
            style={inputStyle}
          />
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button
              onClick={onCancel}
              style={{
                background: "#1e293b",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: 4,
                padding: "6px 16px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handle}
              style={{
                background: "#1d4ed8",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 16px",
                cursor: "pointer",
              }}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
