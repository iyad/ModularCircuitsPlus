import type { CircuitDefinition, SimulationResult } from "@mcp/core";

const BASE = "/api";

export interface CircuitSummary {
  id: string;
  name: string;
  description?: string;
  /** Part of the shared starter library rather than owned by the current user. */
  library: boolean;
  /** Whether the current user may save over or delete this circuit. */
  editable: boolean;
  created_at: number;
  updated_at: number;
}

type TokenGetter = () => Promise<string | undefined>;
let getToken: TokenGetter | null = null;

/** Set by the auth layer; when present, every request carries the user's access token. */
export function setTokenGetter(getter: TokenGetter | null) {
  getToken = getter;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const token = getToken ? await getToken() : undefined;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  listCircuits: () => request<CircuitSummary[]>("/circuits"),

  getCircuit: (id: string) =>
    request<CircuitSummary & { definition: CircuitDefinition }>(`/circuits/${id}`),

  createCircuit: (
    name: string,
    description: string | undefined,
    definition: Omit<CircuitDefinition, "id" | "name">
  ) =>
    request<{ id: string; name: string }>("/circuits", {
      method: "POST",
      body: JSON.stringify({ name, description, definition }),
    }),

  updateCircuit: (
    id: string,
    name: string,
    description: string | undefined,
    definition: CircuitDefinition
  ) =>
    request<{ id: string; name: string }>(`/circuits/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, description, definition }),
    }),

  deleteCircuit: (id: string) => request<void>(`/circuits/${id}`, { method: "DELETE" }),

  simulate: (
    id: string,
    inputs: Record<string, boolean>,
    state: Record<string, boolean> = {}
  ) =>
    request<SimulationResult>(`/circuits/${id}/simulate`, {
      method: "POST",
      body: JSON.stringify({ inputs, state }),
    }),
};
