import type { Node, Edge } from "@xyflow/react";

export interface GateNodeData extends Record<string, unknown> {
  label: string;
  componentType: string; // the actual id used for simulation (may be a UUID)
  typeLabel: string;     // human-readable type name shown in the node
  inputs: string[];
  outputs: string[];
}

export type GateNode = Node<GateNodeData, "gate">;
export type CircuitEdge = Edge;
