export interface AssembledProgram { bytes: number[]; labels: Record<string, number>; }
interface ParsedLine { line: number; mnemonic?: string; operand?: string; address: number; }

/** Assemble the deliberately small 6502-like instruction set supported by MicroCpu. */
export function assembleMicroCpu(source: string): AssembledProgram {
  const labels: Record<string, number> = {};
  const parsed: ParsedLine[] = [];
  let address = 0;
  source.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.replace(/;.*/, "").trim();
    if (!text) return;
    const match = text.match(/^(?:([A-Za-z_]\w*):)?\s*(?:([A-Za-z]{3})(?:\s+(.+))?)?$/);
    if (!match) fail(index + 1, "Cannot parse line");
    const [, label, rawMnemonic, rawOperand] = match!;
    if (label) {
      const key = label.toUpperCase();
      if (key in labels) fail(index + 1, `Duplicate label ${label}`);
      labels[key] = address;
    }
    const mnemonic = rawMnemonic?.toUpperCase();
    const operand = rawOperand?.trim();
    const start = address;
    if (mnemonic) address += instructionSize(mnemonic, operand, index + 1);
    parsed.push({ line: index + 1, mnemonic, operand, address: start });
    if (address > 256) fail(index + 1, "Program exceeds 256-byte memory");
  });
  const bytes: number[] = [];
  for (const item of parsed) {
    if (!item.mnemonic) continue;
    const { mnemonic, operand, line } = item;
    switch (mnemonic) {
      case "BRK": bytes.push(0x00); break;
      case "NOP": bytes.push(0xea); break;
      case "LDA":
        if (operand?.startsWith("#")) bytes.push(0xa9, valueOf(operand.slice(1), labels, line));
        else bytes.push(0xa5, valueOf(required(operand, line), labels, line));
        break;
      case "STA": bytes.push(0x85, valueOf(required(operand, line), labels, line)); break;
      case "ADC":
        if (!operand?.startsWith("#")) fail(line, "ADC currently supports immediate addressing only");
        bytes.push(0x69, valueOf(operand!.slice(1), labels, line)); break;
      case "JMP": bytes.push(0x4c, valueOf(required(operand, line), labels, line), 0x00); break;
      case "BNE": {
        const offset = valueOf(required(operand, line), labels, line) - (item.address + 2);
        if (offset < -128 || offset > 127) fail(line, "Branch target is out of range");
        bytes.push(0xd0, offset & 0xff); break;
      }
      default: fail(line, `Unsupported instruction ${mnemonic}`);
    }
  }
  return { bytes, labels };
}

function instructionSize(mnemonic: string, operand: string | undefined, line: number): number {
  switch (mnemonic) {
    case "BRK": case "NOP": if (operand) fail(line, `${mnemonic} takes no operand`); return 1;
    case "JMP": required(operand, line); return 3;
    case "LDA": case "STA": case "ADC": case "BNE": required(operand, line); return 2;
    default: fail(line, `Unsupported instruction ${mnemonic}`);
  }
}
function valueOf(token: string, labels: Record<string, number>, line: number): number {
  const clean = token.trim();
  let value: number | undefined;
  if (/^\$[0-9a-f]+$/i.test(clean)) value = Number.parseInt(clean.slice(1), 16);
  else if (/^\d+$/.test(clean)) value = Number.parseInt(clean, 10);
  else value = labels[clean.toUpperCase()];
  if (value === undefined) fail(line, `Unknown value or label ${clean}`);
  if (value! < 0 || value! > 255) fail(line, `Value ${clean} is outside the 8-bit address space`);
  return value!;
}
function required(value: string | undefined, line: number): string { if (!value) fail(line, "Missing operand"); return value!; }
function fail(line: number, message: string): never { throw new Error(`Line ${line}: ${message}`); }

export const DEMO_SOURCE = `; Adds 5 + 3 and stores the result in $11
        LDA #$05
        STA $10
        LDA #$03
        ADC #$05
        STA $11
        BRK`;
