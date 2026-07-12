import { useRef, useState } from "react";
import { assembleMicroCpu, DEMO_PROGRAM, DEMO_SOURCE, MicroCpu, type CpuSnapshot } from "@mcp/core";

const h = (value: number) => `$${value.toString(16).toUpperCase().padStart(2, "0")}`;

export function MicroCpuPanel() {
  const cpu = useRef(new MicroCpu(DEMO_PROGRAM));
  const loadedProgram = useRef<readonly number[]>(DEMO_PROGRAM);
  const [state, setState] = useState<CpuSnapshot>(() => cpu.current.snapshot());
  const [source, setSource] = useState(DEMO_SOURCE);
  const [error, setError] = useState("");
  const [watches, setWatches] = useState<number[]>([0x10, 0x11]);

  const step = () => setState(cpu.current.tick());
  const stepInstruction = () => setState(cpu.current.stepInstruction());
  const reset = () => { cpu.current = new MicroCpu(loadedProgram.current); setState(cpu.current.snapshot()); };
  const run = () => {
    let next = cpu.current.snapshot();
    for (let i = 0; i < 100 && !next.halted; i++) next = cpu.current.tick();
    setState(next);
  };
  const assemble = () => {
    try {
      const program = assembleMicroCpu(source);
      loadedProgram.current = program.bytes;
      cpu.current = new MicroCpu(program.bytes);
      setState(cpu.current.snapshot());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const r = state.registers;

  return <div style={{ padding: 24, height: "100%", overflow: "auto", background: "#020617", color: "#e2e8f0" }}>
    <h2 style={{ color: "#60a5fa", marginTop: 0 }}>Microcoded 8-bit CPU</h2>
    <p style={{ color: "#94a3b8", maxWidth: 760 }}>A small 6502-flavoured teaching CPU. Step advances one microinstruction; Run executes the demo through BRK.</p>
    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
      <Button onClick={step}>Step microinstruction</Button><Button onClick={stepInstruction}>Step instruction</Button><Button onClick={run}>Run</Button><Button onClick={reset}>Reset</Button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
      <Card title="Registers">
        <Row name="A" value={h(r.a)} /><Row name="PC" value={h(r.pc)} /><Row name="IR" value={h(r.ir)} />
        <Row name="MAR" value={h(r.mar)} /><Row name="TMP" value={h(r.tmp)} />
        <Row name="Flags" value={`N=${+r.negative} Z=${+r.zero} C=${+r.carry}`} /><Row name="Cycles" value={String(state.cycles)} />
      </Card>
      <Card title="Control unit">
        <Row name="Instruction" value={state.instruction} /><Row name="Microstep" value={state.microinstruction} />
        <div style={{ marginTop: 12, color: "#64748b", fontSize: 11 }}>ACTIVE MICROCOMMANDS</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>{state.microcommands.map(c => <code key={c} style={{ background: "#1e3a8a", color: "#bfdbfe", padding: "3px 6px", borderRadius: 3 }}>{c}</code>)}</div>
        {state.halted && <div style={{ color: "#f59e0b", marginTop: 14 }}>Processor halted</div>}
      </Card>
      <Card title="Program editor">
        <textarea value={source} onChange={event => setSource(event.target.value)} spellCheck={false} style={{ boxSizing: "border-box", width: "100%", minHeight: 190, resize: "vertical", background: "#020617", color: "#a5f3fc", border: "1px solid #334155", borderRadius: 4, padding: 10, fontFamily: "monospace", lineHeight: 1.5 }} />
        <div style={{ marginTop: 8 }}><Button onClick={assemble}>Assemble &amp; load</Button></div>
        {error && <div style={{ color: "#f87171", marginTop: 8 }}>{error}</div>}
      </Card>
      <Card title="Zero-page memory">
        {watches.map((address, index) => (
          <WatchRow
            key={index}
            address={address}
            value={h(state.memory[address])}
            onChange={next => setWatches(current => current.map((a, i) => (i === index ? next : a)))}
            onRemove={() => setWatches(current => current.filter((_, i) => i !== index))}
          />
        ))}
        <div style={{ marginTop: 8 }}>
          <Button onClick={() => setWatches(current => [...current, 0x00])}>+ Watch address</Button>
        </div>
      </Card>
    </div>
  </div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 7, padding: 16 }}><h3 style={{ color: "#94a3b8", margin: "0 0 12px", fontSize: 13 }}>{title}</h3>{children}</section>; }
function Row({ name, value }: { name: string; value: string }) { return <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e293b", padding: "5px 0" }}><span style={{ color: "#64748b" }}>{name}</span><strong>{value}</strong></div>; }
function WatchRow({ address, value, onChange, onRemove }: { address: number; value: string; onChange: (address: number) => void; onRemove: () => void }) {
  const [text, setText] = useState(address.toString(16).toUpperCase().padStart(2, "0"));
  const commit = () => {
    const parsed = Number.parseInt(text, 16);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 0xff) onChange(parsed);
    else setText(address.toString(16).toUpperCase().padStart(2, "0"));
  };
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #1e293b", padding: "5px 0" }}>
    <span style={{ color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
      $
      <input
        value={text}
        onChange={event => setText(event.target.value.toUpperCase())}
        onBlur={commit}
        onKeyDown={event => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
        maxLength={2}
        style={{ width: 28, background: "#020617", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 3, padding: "2px 4px", fontFamily: "monospace" }}
      />
    </span>
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <strong>{value}</strong>
      <button onClick={onRemove} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
    </span>
  </div>;
}
function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} style={{ background: "#1d4ed8", color: "white", border: "1px solid #3b82f6", borderRadius: 4, padding: "6px 12px", cursor: "pointer" }}>{children}</button>; }
