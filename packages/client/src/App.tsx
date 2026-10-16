import { useEffect, useState } from "react";
import { api, type CircuitSummary } from "./api";
import { PRIMITIVES } from "@mcp/core";
import type { CircuitDefinition } from "@mcp/core";
import { CircuitEditor } from "./components/CircuitEditor";
import { SimulatorPanel } from "./components/SimulatorPanel";
import { NewCircuitModal } from "./components/NewCircuitModal";
import { MicroCpuPanel } from "./components/MicroCpuPanel";
import { CommodorePanel } from "./components/CommodorePanel";
import { AccountButton } from "./components/AccountButton";
import { useAppAuth } from "./auth";

function App() {
  const auth = useAppAuth();
  const [circuits, setCircuits] = useState<CircuitSummary[]>([]);
  const [selected, setSelected] = useState<
    (CircuitDefinition & { name: string }) | null
  >(null);
  const [allDefs, setAllDefs] = useState<Record<string, CircuitDefinition>>({
    ...PRIMITIVES,
  });
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<"editor" | "simulator">("editor");
  const [view, setView] = useState<"home" | "circuits" | "cpu" | "commodore">(
    "home"
  );

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

  // Reload whenever the signed-in user changes, since the visible circuits depend on who is asking.
  useEffect(() => {
    if (auth.isLoading) return;
    loadCircuits().catch((e) => alert(`Could not load circuits: ${e.message}`));
  }, [auth.isLoading, auth.isAuthenticated]);

  const selectedSummary = circuits.find((c) => c.id === selected?.id);

  const handleSelect = async (id: string) => {
    const full = await api.getCircuit(id);
    setSelected({ ...full.definition, name: full.name });
    setTab("editor");
    setView("circuits");
  };

  const handleSave = async (def: Omit<CircuitDefinition, "id">) => {
    if (!selected) return;
    if (!auth.isAuthenticated) return auth.login();
    try {
      if (selectedSummary?.editable) {
        await api.updateCircuit(selected.id, def.name ?? selected.name, def.description, {
          ...def,
          id: selected.id,
        });
      } else {
        // Read-only (e.g. starter library) circuits are saved as the user's own copy.
        const name = selectedSummary ? `${def.name ?? selected.name} (copy)` : def.name ?? "Untitled";
        const res = await api.createCircuit(name, def.description, def);
        const full = await api.getCircuit(res.id);
        setSelected({ ...full.definition, name: full.name });
      }
      await loadCircuits();
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    }
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
    try {
      const res = await api.createCircuit(name, description, newDef);
      await loadCircuits();
      await handleSelect(res.id);
    } catch (e: any) {
      alert(`Could not create circuit: ${e.message}`);
    }
  };

  const handleNewClick = () => {
    if (!auth.isAuthenticated) return auth.login();
    setShowNew(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this circuit?")) {
      try {
        await api.deleteCircuit(id);
        if (selected?.id === id) setSelected(null);
        await loadCircuits();
      } catch (e: any) {
        alert(`Delete failed: ${e.message}`);
      }
    }
  };

  const sectionHeading = (label: string) => (
    <div
      style={{
        fontSize: 11,
        color: "#64748b",
        margin: "10px 0 4px",
        paddingLeft: 4,
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </div>
  );

  const renderCircuitRow = (c: CircuitSummary) => (
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
      {c.editable && (
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
      )}
    </div>
  );

  const libraryCircuits = circuits.filter((c) => c.library);
  const myCircuits = circuits.filter((c) => !c.library);

  if (view === "home") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#020617",
          color: "#e2e8f0",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: "bold",
            color: "#60a5fa",
            marginBottom: 8,
          }}
        >
          Bits &amp; Gates
        </div>
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <AccountButton />
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 40 }}>
          Choose an application
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <button
            onClick={() => setView("circuits")}
            style={{
              width: 220,
              height: 140,
              background: "#0f172a",
              color: "#fff",
              border: "1px solid #1e3a8a",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: "bold",
            }}
          >
            Circuit Editor
            <div
              style={{
                fontSize: 11,
                fontWeight: "normal",
                color: "#94a3b8",
                marginTop: 8,
              }}
            >
              Design and simulate logic circuits
            </div>
          </button>
          <button
            onClick={() => setView("cpu")}
            style={{
              width: 220,
              height: 140,
              background: "#1e1b4b",
              color: "#fff",
              border: "1px solid #7c3aed",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: "bold",
            }}
          >
            8-bit CPU Lab
            <div
              style={{
                fontSize: 11,
                fontWeight: "normal",
                color: "#94a3b8",
                marginTop: 8,
              }}
            >
              Microcoded CPU, assembler and debugger
            </div>
          </button>
          <button
            onClick={() => setView("commodore")}
            style={{
              width: 220,
              height: 140,
              background: "#1e1b4b",
              color: "#fff",
              border: "1px solid #6366f1",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: "bold",
            }}
          >
            Commodore UI
            <div
              style={{
                fontSize: 11,
                fontWeight: "normal",
                color: "#94a3b8",
                marginTop: 8,
              }}
            >
              C64/C128-inspired terminal shell
            </div>
          </button>
        </div>
        <div style={{ position: "absolute", bottom: 16, fontSize: 11, display: "flex", gap: 16 }}>
          <a href="/privacy/" style={{ color: "#64748b" }}>Privacy</a>
          <a href="/terms/" style={{ color: "#64748b" }}>Terms</a>
        </div>
      </div>
    );
  }

  if (view === "cpu" || view === "commodore") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "#020617",
          color: "#e2e8f0",
          fontFamily: "monospace",
        }}
      >
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
          <button
            onClick={() => setView("home")}
            style={{
              background: "transparent",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: 4,
              padding: "2px 12px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            ← Home
          </button>
          <span style={{ fontWeight: "bold", color: "#60a5fa" }}>
            {view === "cpu" ? "8-bit CPU Lab" : "Commodore UI"}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {view === "cpu" ? <MicroCpuPanel /> : <CommodorePanel />}
        </div>
      </div>
    );
  }

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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: "bold", color: "#60a5fa" }}>
            Bits &amp; Gates
          </div>
          <button
            onClick={() => setView("home")}
            style={{
              background: "transparent",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: 4,
              padding: "1px 8px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            ← Home
          </button>
        </div>
        {auth.enabled && (
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #1e293b" }}>
            <AccountButton />
          </div>
        )}
        <div style={{ padding: 8, overflowY: "auto", flex: 1 }}>
          <button
            onClick={handleNewClick}
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
          {auth.enabled ? (
            <>
              {sectionHeading("MY CIRCUITS")}
              {myCircuits.map(renderCircuitRow)}
              {myCircuits.length === 0 && (
                <div style={{ padding: "3px 8px", fontSize: 11, color: "#475569" }}>
                  {auth.isAuthenticated ? "None yet" : "Sign in to save circuits"}
                </div>
              )}
              {sectionHeading("LIBRARY")}
              {libraryCircuits.map(renderCircuitRow)}
            </>
          ) : (
            <>
              {sectionHeading("SAVED")}
              {circuits.map(renderCircuitRow)}
            </>
          )}
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
        {selected ? (
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
                  saveLabel={
                    !auth.isAuthenticated
                      ? "Sign in to Save"
                      : selectedSummary && !selectedSummary.editable
                        ? "Save a Copy"
                        : "Save Circuit"
                  }
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
