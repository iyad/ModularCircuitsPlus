import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PRIMITIVES } from "@mcp/core";
import type { CircuitDefinition, ComponentInstance, Wire } from "@mcp/core";
import type { GateNode } from "../flowTypes";
import { GateNode as GateNodeComponent } from "./GateNode";
import { IONode, type IONodeData } from "./IONode";
import type { CircuitSummary } from "../api";

const nodeTypes = { gate: GateNodeComponent, io: IONode };

interface Props {
  circuit: CircuitDefinition & { name: string };
  savedCircuits: CircuitSummary[];
  allDefinitions: Record<string, CircuitDefinition>;
  onSave: (def: Omit<CircuitDefinition, "id">) => void;
}

function defToFlow(def: CircuitDefinition, allDefs: Record<string, CircuitDefinition>) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const cols = 3;
  const gateSpacingX = 160;
  const gateSpacingY = 110;
  const gateStartX = 240;
  const gateStartY = 80;
  const totalCols = Math.min(def.components.length || 1, cols);
  const totalWidth = (totalCols - 1) * gateSpacingX;
  const centerY = gateStartY + Math.floor((def.components.length - 1) / cols / 2) * gateSpacingY;

  nodes.push({
    id: "input",
    type: "io",
    position: { x: 40, y: centerY },
    data: { label: "INPUTS", kind: "input", pins: def.inputs } satisfies IONodeData,
  });

  nodes.push({
    id: "output",
    type: "io",
    position: { x: gateStartX + totalWidth + 160, y: centerY },
    data: { label: "OUTPUTS", kind: "output", pins: def.outputs } satisfies IONodeData,
  });

  def.components.forEach((comp, i) => {
    const compDef = allDefs[comp.type];
    const typeLabel = compDef?.name ?? comp.type;
    nodes.push({
      id: comp.id,
      type: "gate",
      position:
        comp.position ??
        ({ x: gateStartX + (i % cols) * gateSpacingX, y: gateStartY + Math.floor(i / cols) * gateSpacingY } as const),
      data: {
        label: comp.label ?? typeLabel,
        componentType: comp.type,
        typeLabel,
        inputs: compDef?.inputs ?? [],
        outputs: compDef?.outputs ?? [],
      },
    });
  });

  def.wires.forEach((wire, i) => {
    edges.push({
      id: `e${i}`,
      source: wire.from.componentId,
      sourceHandle: wire.from.pinName,
      target: wire.to.componentId,
      targetHandle: wire.to.pinName,
      style: { stroke: "#60a5fa" },
    });
  });

  return { nodes, edges };
}

function flowToDefinition(
  nodes: Node[],
  edges: Edge[],
  inputs: string[],
  outputs: string[]
): Pick<CircuitDefinition, "components" | "wires" | "inputs" | "outputs"> {
  const components: ComponentInstance[] = nodes
    .filter((n) => n.type === "gate")
    .map((n) => ({
      id: n.id,
      type: (n.data as any).componentType as string,
      label: (n.data as any).label as string,
      position: n.position as { x: number; y: number },
    }));

  const wires: Wire[] = edges.map((e) => ({
    from: { componentId: e.source, pinName: e.sourceHandle ?? "out" },
    to: { componentId: e.target, pinName: e.targetHandle ?? "in" },
  }));

  return { components, wires, inputs, outputs };
}

export function CircuitEditor({ circuit, savedCircuits, allDefinitions, onSave }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [inputs] = useState<string[]>(circuit.inputs);
  const [outputs] = useState<string[]>(circuit.outputs);

  useEffect(() => {
    const { nodes: n, edges: e } = defToFlow(circuit, allDefinitions);
    setNodes(n);
    setEdges(e);
  }, [circuit.id]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, style: { stroke: "#60a5fa" } }, eds)),
    [setEdges]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) =>
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds)),
    [setEdges]
  );

  const allGateEntries: { id: string; label: string }[] = [
    ...Object.keys(PRIMITIVES).map((id) => ({ id, label: id })),
    ...savedCircuits
      .filter((c) => c.id !== circuit.id)
      .map((c) => ({ id: c.id, label: c.name })),
  ];

  const addGate = (type: string) => {
    const entry = allGateEntries.find((e) => e.id === type);
    const typeLabel = entry?.label ?? type;
    const instanceId = `${typeLabel.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const def = allDefinitions[type];
    const newNode: GateNode = {
      id: instanceId,
      type: "gate",
      position: { x: 300, y: 200 },
      data: {
        label: typeLabel,
        componentType: type,
        typeLabel,
        inputs: def?.inputs ?? [],
        outputs: def?.outputs ?? [],
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleSave = () => {
    const def = flowToDefinition(nodes, edges, inputs, outputs);
    onSave({ ...def, name: circuit.name, description: circuit.description });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "8px 16px",
          background: "#0f172a",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <span style={{ color: "#94a3b8", fontSize: 12, marginRight: 8 }}>Add gate:</span>
        {allGateEntries.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => addGate(id)}
            style={{
              background: "#1e3a8a",
              color: "#fff",
              border: "1px solid #3b82f6",
              borderRadius: 4,
              padding: "2px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSave}
          style={{
            background: "#166534",
            color: "#fff",
            border: "1px solid #22c55e",
            borderRadius: 4,
            padding: "4px 16px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Save Circuit
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          nodeTypes={nodeTypes}
          deleteKeyCode="Delete"
          fitView
          style={{ background: "#020617" }}
        >
          <Background variant={BackgroundVariant.Dots} color="#1e293b" />
          <Controls style={{ background: "#1e293b" }} />
          <MiniMap style={{ background: "#0f172a" }} nodeColor="#1e3a8a" />
        </ReactFlow>
      </div>
    </div>
  );
}
