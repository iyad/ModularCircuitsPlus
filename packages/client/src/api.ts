import type { CircuitDefinition, SimulationResult } from "@mcp/core";

const BASE = "/api";

export interface CircuitSummary {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  updated_at: number;
}

export const api = {
  listCircuits: (): Promise<CircuitSummary[]> =>
    fetch(`${BASE}/circuits`).then((r) => r.json()),

  getCircuit: (id: string): Promise<CircuitSummary & { definition: CircuitDefinition }> =>
    fetch(`${BASE}/circuits/${id}`).then((r) => r.json()),

  createCircuit: (
    name: string,
    description: string | undefined,
    definition: Omit<CircuitDefinition, "id" | "name">
  ): Promise<{ id: string; name: string }> =>
    fetch(`${BASE}/circuits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, definition }),
    }).then((r) => r.json()),

  updateCircuit: (
    id: string,
    name: string,
    description: string | undefined,
    definition: CircuitDefinition
  ): Promise<{ id: string; name: string }> =>
    fetch(`${BASE}/circuits/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, definition }),
    }).then((r) => r.json()),

  deleteCircuit: (id: string): Promise<void> =>
    fetch(`${BASE}/circuits/${id}`, { method: "DELETE" }).then(() => {}),

  simulate: (
    id: string,
    inputs: Record<string, boolean>,
    state: Record<string, boolean> = {}
  ): Promise<SimulationResult> =>
    fetch(`${BASE}/circuits/${id}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs, state }),
    }).then((r) => r.json()),
};
