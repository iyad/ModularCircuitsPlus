import { useEffect, useMemo, useRef, useState } from "react";
import { assembleMicroCpu, BasicInterpreter, MicroCpu, type BasicEvent } from "@mcp/core";

type Machine = "C64" | "C128";
type Program = Record<number, string>;

const SCREEN_ROWS = 25;
const LINE_HEIGHT_PX = 20; // 16px font * 1.25 line-height

export function CommodorePanel() {
  const [machine, setMachine] = useState<Machine>("C64");
  const [columns, setColumns] = useState<40 | 80>(40);
  const [program, setProgram] = useState<Program>({});
  const [input, setInput] = useState("");
  const [monitor, setMonitor] = useState(false);
  const [output, setOutput] = useState<string[]>(() => banner("C64"));
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cpu = useRef(new MicroCpu());
  const interpreter = useRef(new BasicInterpreter(cpu.current));
  const pendingRun = useRef<Generator<BasicEvent, void, string[] | undefined> | null>(null);
  const partialLine = useRef("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [output]);

  const width = `${columns}ch`;
  const orderedProgram = useMemo(() => Object.entries(program).map(([line, text]) => [Number(line), text] as const).sort((a, b) => a[0] - b[0]), [program]);

  const selectMachine = (next: Machine) => {
    cpu.current = new MicroCpu();
    interpreter.current = new BasicInterpreter(cpu.current);
    pendingRun.current = null;
    partialLine.current = "";
    setMachine(next); setColumns(40); setMonitor(false); setProgram({}); setInput(""); setOutput(banner(next));
  };

  const flushPartialLine = () => {
    if (partialLine.current) { append(partialLine.current); partialLine.current = ""; }
  };

  /** Drive a BASIC generator until it needs input (pauses, stored in pendingRun) or finishes. */
  const driveBasic = (gen: Generator<BasicEvent, void, string[] | undefined>, resumeValue?: string[]) => {
    let result = gen.next(resumeValue);
    while (!result.done) {
      const event = result.value;
      if (event.type === "print") {
        partialLine.current += event.text;
        if (event.newline) flushPartialLine();
        result = gen.next();
        continue;
      }
      if (event.type === "input") {
        flushPartialLine();
        pendingRun.current = gen;
        return;
      }
      if (event.type === "error") {
        flushPartialLine();
        append(event.message, "", "READY.");
        return;
      }
      if (event.type === "done") break;
    }
    flushPartialLine();
    append("", "READY.");
  };

  const submit = () => {
    const entered = input.trim();
    setInput("");
    if (pendingRun.current) {
      const gen = pendingRun.current;
      pendingRun.current = null;
      append(entered.toUpperCase());
      driveBasic(gen, entered.split(","));
      return;
    }
    if (!entered) { append(""); return; }
    append(entered.toUpperCase());
    if (monitor) { runMonitorCommand(entered); return; }
    const numbered = entered.match(/^(\d+)\s*(.*)$/);
    if (numbered) {
      const line = Number(numbered[1]);
      if (line < 0 || line > 63999) { append("?SYNTAX  ERROR", "", "READY."); return; }
      setProgram(current => {
        const next = { ...current };
        if (numbered[2]) next[line] = numbered[2].toUpperCase(); else delete next[line];
        return next;
      });
      append("", "READY."); return;
    }
    runDirect(entered);
  };

  const runDirect = (command: string) => {
    const upper = command.trim().toUpperCase();
    if (upper === "LIST") { append(...orderedProgram.map(([n, text]) => `${n} ${text}`), "", "READY."); return; }
    if (upper === "NEW") { setProgram({}); interpreter.current.clearVariables(); append("", "READY."); return; }
    if (upper === "RUN") { runProgram(); return; }
    if (upper === "MONITOR" && machine === "C128") { setMonitor(true); append("", "MONITOR", ""); return; }
    driveBasic(interpreter.current.runDirect(command));
  };

  const runProgram = () => {
    const lines = Object.fromEntries(orderedProgram);
    driveBasic(interpreter.current.run(lines));
  };

  const runMonitorCommand = (command: string) => {
    const upper = command.trim().toUpperCase();
    if (upper === "X") { setMonitor(false); append("", "READY."); return; }
    if (upper === "R") {
      const r = cpu.current.registers;
      append("  PC   A  IR MAR TMP  N Z C", `.;00${hex(r.pc)} ${hex(r.a)} ${hex(r.ir)}  ${hex(r.mar)}  ${hex(r.tmp)}   ${+r.negative} ${+r.zero} ${+r.carry}`, ""); return;
    }
    const memory = upper.match(/^M\s+([0-9A-F]+)(?:\s+([0-9A-F]+))?$/);
    if (memory) { append(...memoryDump(cpu.current.memory, monitorAddress(memory[1]), monitorAddress(memory[2] ?? memory[1])), ""); return; }
    const disassemble = upper.match(/^D\s+([0-9A-F]+)(?:\s+([0-9A-F]+))?$/);
    if (disassemble) { append(...disassembly(cpu.current.memory, monitorAddress(disassemble[1]), monitorAddress(disassemble[2] ?? disassemble[1])), ""); return; }
    const assemble = command.match(/^A\s+([0-9A-F]+)\s+(.+)$/i);
    if (assemble) {
      try {
        const address = monitorAddress(assemble[1]); const bytes = assembleMicroCpu(assemble[2]).bytes;
        if (address + bytes.length > 256) throw new Error("ADDRESS OUT OF RANGE");
        cpu.current.memory.set(bytes, address); append(`.${hex(address)}  ${bytes.map(hex).join(" ")}`, "");
      } catch (reason) { append(`? ${reason instanceof Error ? reason.message : reason}`, ""); }
      return;
    }
    const go = upper.match(/^G\s+([0-9A-F]+)$/);
    if (go) {
      cpu.current.registers.pc = monitorAddress(go[1]); cpu.current.halted = false;
      for (let i = 0; i < 1000 && !cpu.current.halted; i++) cpu.current.tick();
      append(cpu.current.halted ? "BREAK" : "? RUN LIMIT REACHED", ""); return;
    }
    append("?  COMMANDS: A D G M R X", "");
  };

  const append = (...lines: string[]) => setOutput(current => [...current, ...lines].slice(-200));

  return <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#111827", boxSizing: "border-box" }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "20px 20px 14px", flexShrink: 0, fontFamily: "monospace" }}>
      <button onClick={() => selectMachine("C64")} style={button(machine === "C64")}>C64</button>
      <button onClick={() => selectMachine("C128")} style={button(machine === "C128")}>C128</button>
      {machine === "C128" && <button onClick={() => setColumns(columns === 40 ? 80 : 40)} style={button(false)}>{columns === 40 ? "80 columns" : "40 columns"}</button>}
      <span style={{ color: "#94a3b8", marginLeft: 8 }}>{machine} compatible shell · {columns} columns</span>
    </div>
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 20px 20px" }}>
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        style={{ width, maxWidth: "100%", height: SCREEN_ROWS * LINE_HEIGHT_PX, overflowY: "auto", overflowX: "hidden", margin: "0 auto", padding: "28px 34px", boxSizing: "content-box", background: machine === "C64" ? "#3b50b6" : "#233f9a", border: "16px solid #6c78d1", boxShadow: "0 12px 40px #000, inset 0 0 35px #172554", color: "#a8b6ff", fontFamily: "'Courier New', monospace", fontWeight: "bold", fontSize: 16, lineHeight: 1.25, textTransform: "uppercase" }}
      >
        {output.map((line, index) => <div key={index} style={{ minHeight: "1.25em", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{line.slice(0, columns)}</div>)}
        <div style={{ display: "flex" }}><span>{monitor ? "." : ""}</span><input ref={inputRef} autoFocus value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") submit(); }} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, padding: 0, background: "transparent", color: "inherit", caretColor: "#a8b6ff", font: "inherit", fontWeight: "inherit", textTransform: "uppercase" }} /></div>
      </div>
      <p style={{ color: "#64748b", fontFamily: "monospace", textAlign: "center" }}>Try: <code>10 FOR I=1 TO 5</code>, <code>20 PRINT I*I</code>, <code>30 NEXT I</code>, <code>RUN</code>{machine === "C128" && <>, <code>MONITOR</code>, <code>M 0020</code></>}</p>
    </div>
  </div>;
}

function banner(machine: Machine): string[] {
  return machine === "C64"
    ? ["", "    **** COMMODORE 64 BASIC V2 ****", "", " 64K RAM SYSTEM  38911 BASIC BYTES FREE", "", "READY."]
    : ["", " COMMODORE BASIC V7.0 122365 BYTES FREE", "", "       (C)1986 COMMODORE ELECTRONICS", "", "READY."];
}
function monitorAddress(value: string): number { const result = Number.parseInt(value, 16); if (!Number.isFinite(result) || result > 0xff) throw new Error("ADDRESS OUT OF RANGE"); return result; }
function hex(value: number): string { return (value & 0xff).toString(16).toUpperCase().padStart(2, "0"); }
function memoryDump(memory: Uint8Array, start: number, end: number): string[] { const lines: string[] = []; for (let at = start; at <= end; at += 8) { const bytes = Array.from(memory.slice(at, Math.min(end + 1, at + 8))); lines.push(`>${hex(at)} ${bytes.map(hex).join(" ")}`); } return lines; }
function disassembly(memory: Uint8Array, start: number, end: number): string[] { const lines: string[] = []; let at = start; while (at <= end) { const opcode = memory[at]; const operand = memory[(at + 1) & 0xff]; let text = `. ${hex(at)} ${hex(opcode)} `; let size = 1; switch (opcode) { case 0x00: text += "      BRK"; break; case 0xea: text += "      NOP"; break; case 0xa9: text += `${hex(operand)}    LDA #$${hex(operand)}`; size = 2; break; case 0xa5: text += `${hex(operand)}    LDA $${hex(operand)}`; size = 2; break; case 0x85: text += `${hex(operand)}    STA $${hex(operand)}`; size = 2; break; case 0x69: text += `${hex(operand)}    ADC #$${hex(operand)}`; size = 2; break; case 0xd0: text += `${hex(operand)}    BNE $${hex(at + 2 + (operand < 128 ? operand : operand - 256))}`; size = 2; break; case 0x4c: text += `${hex(operand)} ${hex(memory[(at + 2) & 0xff])} JMP $00${hex(operand)}`; size = 3; break; default: text += `      .BYTE $${hex(opcode)}`; } lines.push(text); at += size; } return lines; }
function button(active: boolean): React.CSSProperties { return { background: active ? "#4338ca" : "#1e293b", color: "white", border: `1px solid ${active ? "#818cf8" : "#475569"}`, borderRadius: 4, padding: "6px 14px", cursor: "pointer" }; }
