import { useEffect, useState } from "react";
import { api, type CircuitSummary } from "./api";
import { PRIMITIVES } from "@mcp/core";
import type { CircuitDefinition } from "@mcp/core";
import { CircuitEditor } from "./components/CircuitEditor";
import { SimulatorPanel } from "./components/SimulatorPanel";
import { NewCircuitModal } from "./components/NewCircuitModal";
import { MicroCpuPanel } from "./components/MicroCpuPanel";
import { CommodorePanel } from "./components/CommodorePanel";

function App() {
  const [circuits, setCircuits] = useState<CircuitSummary[]>([]);
  const [selected, setSelected] = useState<
    (CircuitDefinition & { name: string }) | null
  >(null);
  const [allDefs, setAllDefs] = useState<Record<string, CircuitDefinition>>({
    ...PRIMITIVES,
  });
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<"editor" | "simulator">("editor");
  const [showCpu, setShowCpu] = useState(false);
  const [showCommodore, setShowCommodore] = useState(false);

  const loadCircuits = async () => {
    const list = await api.listCircuits();
    setCircuits(list);
    const defs: Record<string, CircuitDefinition> = { ...PRIMITIVES };
    await Promise.all(
      list.map(async (c) => {
        const full = await api.getCircuit(c.id);
        defs[c.id] = full.definition;
      })
    );
    setAllDefs(defs);
  };

  useEffect(() => {
    loadCircuits();
  }, []);

  const handleSelect = async (id: string) => {
    const full = await api.getCircuit(id);
    setSelected({ ...full.definition, name: full.name });
    setTab("editor");
    setShowCpu(false);
    setShowCommodore(false);
  };

  const handleSave = async (def: Omit<CircuitDefinition, "id">) => {
    if (!selected) return;
    if (circuits.find((c) => c.id === selected.id)) {
      await api.updateCircuit(selected.id, def.name ?? selected.name, def.description, {
        ...def,
        id: selected.id,
      });
    } else {
      const res = await api.createCircuit(
        def.name ?? "Untitled",
        def.description,
        def
      );
      const full = await api.getCircuit(res.id);
      setSelected({ ...full.definition, name: full.name });
    }
    await loadCircuits();
  };

  const handleNew = async (
    name: string,
    description: string,
    inputs: string[],
    outputs: string[]
  ) => {
    setShowNew(false);
    const newDef: Omit<CircuitDefinition, "id"> = {
      name,
      description,
      inputs,
      outputs,
      components: [],
      wires: [],
    };
    const res = await api.createCircuit(name, description, newDef);
    await loadCircuits();
    await handleSelect(res.id);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this circuit?")) {
      await api.deleteCircuit(id);
      if (selected?.id === id) setSelected(null);
      await loadCircuits();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#020617",
        color: "#e2e8f0",
        fontFamily: "monospace",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 220,
          background: "#0f172a",
          borderRight: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "16px 12px",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: "bold", color: "#60a5fa" }}>
            ModularCircuits+
          </div>
        </div>
        <div style={{ padding: 8, overflowY: "auto", flex: 1 }}>
          <button
            onClick={() => setShowNew(true)}
            style={{
              width: "100%",
              background: "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "6px 0",
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            + New Circuit
          </button>
          <button
            onClick={() => { setShowCpu(true); setShowCommodore(false); }}
            style={{ width: "100%", background: showCpu ? "#6d28d9" : "#312e81", color: "#fff", border: "1px solid #7c3aed", borderRadius: 4, padding: "6px 0", cursor: "pointer", marginBottom: 12 }}
          >
            8-bit CPU Lab
          </button>
          <button
            onClick={() => { setShowCommodore(true); setShowCpu(false); }}
            style={{ width: "100%", background: showCommodore ? "#4338ca" : "#1e1b4b", color: "#fff", border: "1px solid #6366f1", borderRadius: 4, padding: "6px 0", cursor: "pointer", marginBottom: 12 }}
          >
            Commodore UI
          </button>
          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              marginBottom: 4,
              paddingLeft: 4,
              letterSpacing: "0.05em",
            }}
          >
            PRIMITIVES
          </div>
          {Object.keys(PRIMITIVES).map((id) => (
            <div
              key={id}
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 12,
                color: "#475569",
              }}
            >
              {id}
            </div>
          ))}
          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              margin: "10px 0 4px",
              paddingLeft: 4,
              letterSpacing: "0.05em",
            }}
          >
            SAVED
          </div>
          {circuits.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                fontSize: 12,
                background:
                  selected?.id === c.id ? "#1e3a8a" : "transparent",
                color: selected?.id === c.id ? "#fff" : "#94a3b8",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onClick={() => handleSelect(c.id)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(c.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: "0 2px",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {showCommodore ? <CommodorePanel /> : showCpu ? <MicroCpuPanel /> : selected ? (
          <>
            <div
              style={{
                padding: "8px 16px",
                background: "#0f172a",
                borderBottom: "1px solid #1e293b",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span style={{ fontWeight: "bold", color: "#60a5fa" }}>
                {selected.name}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {(["editor", "simulator"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      background:
                        tab === t ? "#1e3a8a" : "transparent",
                      color: tab === t ? "#fff" : "#94a3b8",
                      border:
                        "1px solid " +
                        (tab === t ? "#3b82f6" : "#334155"),
                      borderRadius: 4,
                      padding: "2px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              {tab === "editor" ? (
                <CircuitEditor
                  key={selected.id}
                  circuit={selected}
                  savedCircuits={circuits}
                  allDefinitions={allDefs}
                  onSave={handleSave}
                />
              ) : (
                <SimulatorPanel circuit={selected} />
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "#334155",
              fontSize: 14,
            }}
          >
            Select or create a circuit to get started
          </div>
        )}
      </div>

      {showNew && (
        <NewCircuitModal
          onConfirm={handleNew}
          onCancel={() => setShowNew(false)}
        />
      )}
    </div>
  );
}

export default App;
