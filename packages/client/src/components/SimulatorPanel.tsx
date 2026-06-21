import { useState } from "react";
import type { CircuitDefinition, SimulationResult } from "@mcp/core";
import { api } from "../api";

interface Props {
  circuit: CircuitDefinition;
}

export function SimulatorPanel({ circuit }: Props) {
  const [inputs, setInputs] = useState<Record<string, boolean>>(
    Object.fromEntries(circuit.inputs.map((p) => [p, false]))
  );
  const [circuitState, setCircuitState] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isStateful = result !== null && Object.keys(circuitState).length > 0;

  const runSim = async () => {
    setError(null);
    try {
      const r = await api.simulate(circuit.id, inputs, circuitState);
      setResult(r);
      setCircuitState(r.state);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const reset = () => {
    setCircuitState({});
    setResult(null);
    setError(null);
  };

  const btn = (label: string, onClick: () => void, color: string, border: string) => (
    <button
      onClick={onClick}
      style={{
        background: color,
        color: "#fff",
        border: `1px solid ${border}`,
        borderRadius: 4,
        padding: "6px 20px",
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: 24, background: "#0f172a", color: "#e2e8f0", fontFamily: "monospace", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>Simulate: {circuit.name}</h3>
        {isStateful && (
          <span style={{ fontSize: 10, color: "#f59e0b", border: "1px solid #f59e0b", borderRadius: 3, padding: "1px 6px" }}>
            STATEFUL
          </span>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, letterSpacing: "0.05em" }}>INPUTS</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {circuit.inputs.map((pin) => (
            <label key={pin} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={inputs[pin] ?? false}
                onChange={(e) => setInputs((prev) => ({ ...prev, [pin]: e.target.checked }))}
              />
              <span style={{ color: "#22c55e" }}>{pin}</span>
              <span style={{
                background: (inputs[pin] ?? false) ? "#15803d" : "#374151",
                color: "#fff", borderRadius: 3, padding: "0 6px", fontSize: 11,
              }}>
                {(inputs[pin] ?? false) ? "1" : "0"}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {btn("Run", runSim, "#1d4ed8", "#3b82f6")}
        {btn("Reset State", reset, "#7f1d1d", "#ef4444")}
      </div>

      {error && <div style={{ color: "#f87171", marginBottom: 12 }}>{error}</div>}

      {result && (
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, letterSpacing: "0.05em" }}>OUTPUTS</div>
          {Object.entries(result.outputs).map(([pin, val]) => (
            <div key={pin} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "#ef4444", minWidth: 80 }}>{pin}</span>
              <span style={{
                background: val ? "#15803d" : "#991b1b",
                color: "#fff", borderRadius: 3, padding: "2px 16px",
                fontSize: 16, fontWeight: "bold", letterSpacing: 2,
              }}>
                {val ? "1" : "0"}
              </span>
            </div>
          ))}
        </div>
      )}

      {isStateful && (
        <div style={{ marginTop: 24, padding: 12, background: "#0a0f1a", borderRadius: 6, border: "1px solid #1e293b" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, letterSpacing: "0.05em" }}>
            INTERNAL STATE (persists between runs)
          </div>
          {Object.entries(circuitState)
            .filter(([k]) => !k.startsWith("input."))
            .map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: "#475569", minWidth: 140 }}>{k}</span>
                <span style={{ color: v ? "#22c55e" : "#ef4444" }}>{v ? "1" : "0"}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
