import type { MicroCpu } from "./microCpu.js";

/** Events yielded while a BASIC program (or a direct-mode statement) runs. */
export type BasicEvent =
  | { type: "print"; text: string; newline: boolean }
  | { type: "input"; vars: string[] }
  | { type: "error"; message: string; line: number | null }
  | { type: "done" };

type Value = number | string;

// ---------- Tokenizer ----------

type Token =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "eof" };

const OPERATOR_CHARS = "+-*/^=<>(),;:?";

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      let value = "";
      while (j < line.length && line[j] !== '"') { value += line[j]; j++; }
      tokens.push({ type: "str", value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(line[i + 1] ?? ""))) {
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      tokens.push({ type: "num", value: Number.parseFloat(line.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < line.length && /[A-Za-z0-9]/.test(line[j])) j++;
      let name = line.slice(i, j);
      if (line[j] === "$") { name += "$"; j++; }
      tokens.push({ type: "ident", value: name.toUpperCase() });
      i = j;
      continue;
    }
    const two = line.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") { tokens.push({ type: "op", value: two }); i += 2; continue; }
    if (OPERATOR_CHARS.includes(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    throw new Error("?SYNTAX  ERROR");
  }
  tokens.push({ type: "eof" });
  return tokens;
}

// ---------- AST ----------

type Expr =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "var"; name: string }
  | { kind: "call"; name: string; args: Expr[] }
  | { kind: "unary"; op: "-" | "NOT"; expr: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr };

type PrintPart = { type: "expr"; expr: Expr } | { type: "sep"; sep: "," | ";" };

type Stmt =
  | { kind: "rem" }
  | { kind: "end" }
  | { kind: "let"; name: string; expr: Expr }
  | { kind: "print"; parts: PrintPart[] }
  | { kind: "goto"; line: Expr }
  | { kind: "gosub"; line: Expr }
  | { kind: "return" }
  | { kind: "if"; condition: Expr; then: Stmt[] }
  | { kind: "for"; variable: string; from: Expr; to: Expr; step: Expr | null }
  | { kind: "next"; variable: string | null }
  | { kind: "input"; prompt: string | null; vars: string[] }
  | { kind: "poke"; address: Expr; value: Expr }
  | { kind: "sys"; address: Expr };

// ---------- Parser ----------

const COMPARISON_OPS = ["=", "<>", "<", ">", "<=", ">="];

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token { return this.tokens[this.pos]; }
  private next(): Token { return this.tokens[this.pos++]; }
  private identIs(keyword: string): boolean { const t = this.peek(); return t.type === "ident" && t.value === keyword; }
  private opIs(op: string): boolean { const t = this.peek(); return t.type === "op" && t.value === op; }
  private expectOp(op: string): void { if (!this.opIs(op)) throw new Error("?SYNTAX  ERROR"); this.next(); }
  private expectIdentKeyword(keyword: string): void { if (!this.identIs(keyword)) throw new Error("?SYNTAX  ERROR"); this.next(); }
  private expectIdentAny(): string { const t = this.next(); if (t.type !== "ident") throw new Error("?SYNTAX  ERROR"); return t.value; }

  parseStatementList(): Stmt[] {
    const stmts: Stmt[] = [];
    if (this.peek().type === "eof") return stmts;
    while (true) {
      stmts.push(this.parseStatement());
      if (this.opIs(":")) {
        this.next();
        if (this.peek().type === "eof") break;
        continue;
      }
      break;
    }
    if (this.peek().type !== "eof") throw new Error("?SYNTAX  ERROR");
    return stmts;
  }

  private parseStatement(): Stmt {
    const tok = this.peek();
    if (this.opIs("?")) return this.parsePrint();
    if (tok.type === "ident") {
      switch (tok.value) {
        case "PRINT": return this.parsePrint();
        case "LET": return this.parseLet();
        case "IF": return this.parseIf();
        case "GOTO": return this.parseGoto();
        case "GOSUB": return this.parseGosub();
        case "RETURN": this.next(); return { kind: "return" };
        case "FOR": return this.parseFor();
        case "NEXT": return this.parseNext();
        case "INPUT": return this.parseInput();
        case "POKE": return this.parsePoke();
        case "SYS": this.next(); return { kind: "sys", address: this.parseExpr() };
        case "END": case "STOP": this.next(); return { kind: "end" };
        case "REM": this.next(); return { kind: "rem" };
        default: return this.parseImplicitLet();
      }
    }
    throw new Error("?SYNTAX  ERROR");
  }

  private parseImplicitLet(): Stmt {
    const name = this.expectIdentAny();
    this.expectOp("=");
    const expr = this.parseExpr();
    return { kind: "let", name, expr };
  }

  private parseLet(): Stmt {
    this.next();
    const name = this.expectIdentAny();
    this.expectOp("=");
    const expr = this.parseExpr();
    return { kind: "let", name, expr };
  }

  private parsePrint(): Stmt {
    this.next();
    const parts: PrintPart[] = [];
    while (true) {
      const tok = this.peek();
      if (tok.type === "eof" || this.opIs(":")) break;
      if (this.opIs(",") || this.opIs(";")) {
        parts.push({ type: "sep", sep: (this.next() as Extract<Token, { type: "op" }>).value as "," | ";" });
        continue;
      }
      parts.push({ type: "expr", expr: this.parseExpr() });
    }
    return { kind: "print", parts };
  }

  private parseIf(): Stmt {
    this.next();
    const condition = this.parseExpr();
    // Real BASIC V2 requires THEN, but plenty of BASIC dialects (and programs written
    // against them) accept a bare "IF cond GOTO line" — support both forms.
    if (this.identIs("GOTO")) {
      const then: Stmt[] = [this.parseGoto()];
      if (this.opIs(":")) { this.next(); then.push(...this.parseStatementList()); }
      return { kind: "if", condition, then };
    }
    this.expectIdentKeyword("THEN");
    if (this.peek().type === "num") {
      const lineTok = this.next() as Extract<Token, { type: "num" }>;
      const then: Stmt[] = [{ kind: "goto", line: { kind: "num", value: lineTok.value } }];
      if (this.opIs(":")) { this.next(); then.push(...this.parseStatementList()); }
      return { kind: "if", condition, then };
    }
    return { kind: "if", condition, then: this.parseStatementList() };
  }

  private parseGoto(): Stmt { this.next(); return { kind: "goto", line: this.parseExpr() }; }
  private parseGosub(): Stmt { this.next(); return { kind: "gosub", line: this.parseExpr() }; }

  private parseFor(): Stmt {
    this.next();
    const variable = this.expectIdentAny();
    this.expectOp("=");
    const from = this.parseExpr();
    this.expectIdentKeyword("TO");
    const to = this.parseExpr();
    let step: Expr | null = null;
    if (this.identIs("STEP")) { this.next(); step = this.parseExpr(); }
    return { kind: "for", variable, from, to, step };
  }

  private parseNext(): Stmt {
    this.next();
    let variable: string | null = null;
    if (this.peek().type === "ident") variable = this.expectIdentAny();
    return { kind: "next", variable };
  }

  private parseInput(): Stmt {
    this.next();
    let prompt: string | null = null;
    if (this.peek().type === "str") {
      prompt = (this.next() as Extract<Token, { type: "str" }>).value;
      this.expectOp(";");
    }
    const vars: string[] = [];
    while (true) {
      if (this.peek().type !== "ident") break;
      vars.push(this.expectIdentAny());
      if (this.opIs(",")) { this.next(); continue; }
      break;
    }
    if (vars.length === 0) throw new Error("?SYNTAX  ERROR");
    return { kind: "input", prompt, vars };
  }

  private parsePoke(): Stmt {
    this.next();
    const address = this.parseExpr();
    this.expectOp(",");
    const value = this.parseExpr();
    return { kind: "poke", address, value };
  }

  private parseExpr(): Expr { return this.parseOr(); }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.identIs("OR")) { this.next(); left = { kind: "binary", op: "OR", left, right: this.parseAnd() }; }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.identIs("AND")) { this.next(); left = { kind: "binary", op: "AND", left, right: this.parseNot() }; }
    return left;
  }
  private parseNot(): Expr {
    if (this.identIs("NOT")) { this.next(); return { kind: "unary", op: "NOT", expr: this.parseNot() }; }
    return this.parseComparison();
  }
  private parseComparison(): Expr {
    let left = this.parseAdditive();
    while (true) {
      const tok = this.peek();
      if (tok.type === "op" && COMPARISON_OPS.includes(tok.value)) { this.next(); left = { kind: "binary", op: tok.value, left, right: this.parseAdditive() }; }
      else break;
    }
    return left;
  }
  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.opIs("+") || this.opIs("-")) {
      const op = (this.next() as Extract<Token, { type: "op" }>).value;
      left = { kind: "binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }
  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (this.opIs("*") || this.opIs("/")) {
      const op = (this.next() as Extract<Token, { type: "op" }>).value;
      left = { kind: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }
  private parseUnary(): Expr {
    if (this.opIs("-")) { this.next(); return { kind: "unary", op: "-", expr: this.parseUnary() }; }
    return this.parsePower();
  }
  private parsePower(): Expr {
    let left = this.parsePrimary();
    if (this.opIs("^")) { this.next(); left = { kind: "binary", op: "^", left, right: this.parseUnary() }; }
    return left;
  }
  private parsePrimary(): Expr {
    const tok = this.peek();
    if (tok.type === "num") { this.next(); return { kind: "num", value: tok.value }; }
    if (tok.type === "str") { this.next(); return { kind: "str", value: tok.value }; }
    if (this.opIs("(")) { this.next(); const e = this.parseExpr(); this.expectOp(")"); return e; }
    if (tok.type === "ident") {
      this.next();
      if (this.opIs("(")) {
        this.next();
        const args: Expr[] = [];
        if (!this.opIs(")")) {
          args.push(this.parseExpr());
          while (this.opIs(",")) { this.next(); args.push(this.parseExpr()); }
        }
        this.expectOp(")");
        return { kind: "call", name: tok.value, args };
      }
      return { kind: "var", name: tok.value };
    }
    throw new Error("?SYNTAX  ERROR");
  }
}

function parseProgramLine(text: string): Stmt[] {
  const trimmed = text.trim();
  if (/^REM\b/i.test(trimmed) || /^REM$/i.test(trimmed)) return [{ kind: "rem" }];
  return new Parser(tokenize(text)).parseStatementList();
}

// ---------- Runtime ----------

interface Cursor { lineIndex: number; statementIndex: number; }
interface ForFrame { variable: string; limit: number; step: number; returnLineIndex: number; returnStatementIndex: number; }
interface GosubFrame { lineIndex: number; statementIndex: number; }

type Control =
  | { type: "next" }
  | { type: "end" }
  | { type: "goto"; line: number }
  | { type: "gosub"; line: number }
  | { type: "jump"; lineIndex: number; statementIndex: number };

const MAX_STEPS = 200_000;

/** A BASIC V2-flavoured interpreter: variables, expressions, IF/GOTO/GOSUB/FOR/NEXT/INPUT. Shares memory with a MicroCpu for PEEK/POKE/SYS. */
export class BasicInterpreter {
  private variables = new Map<string, Value>();
  private forStack: ForFrame[] = [];
  private gosubStack: GosubFrame[] = [];

  constructor(private readonly machine: MicroCpu) {}

  clearVariables(): void {
    this.variables.clear();
    this.forStack = [];
    this.gosubStack = [];
  }

  /** Run a full stored program (line number -> source text), from its lowest line. Resets variables first, like a real RUN. */
  *run(lines: Record<number, string>): Generator<BasicEvent, void, string[] | undefined> {
    this.clearVariables();
    const sorted = Object.keys(lines).map(Number).sort((a, b) => a - b);
    const cache = new Map<number, Stmt[]>();
    const parsed = (lineNumber: number): Stmt[] => {
      let stmts = cache.get(lineNumber);
      if (!stmts) { stmts = parseProgramLine(lines[lineNumber]); cache.set(lineNumber, stmts); }
      return stmts;
    };

    let lineIndex = 0;
    let statementIndex = 0;
    let steps = 0;
    while (lineIndex < sorted.length) {
      const lineNumber = sorted[lineIndex];
      let stmts: Stmt[];
      try { stmts = parsed(lineNumber); }
      catch (reason) { yield errorEvent(reason, lineNumber); return; }
      if (statementIndex >= stmts.length) { lineIndex++; statementIndex = 0; continue; }
      if (++steps > MAX_STEPS) { yield { type: "error", message: "?RUN LIMIT REACHED  ERROR", line: lineNumber }; return; }
      let control: Control;
      try { control = yield* this.execStatement(stmts[statementIndex], { lineIndex, statementIndex }); }
      catch (reason) { yield errorEvent(reason, lineNumber); return; }
      switch (control.type) {
        case "next": statementIndex++; break;
        case "end": yield { type: "done" }; return;
        case "jump": lineIndex = control.lineIndex; statementIndex = control.statementIndex; break;
        case "goto": {
          const idx = sorted.indexOf(control.line);
          if (idx === -1) { yield { type: "error", message: "?UNDEF'D STATEMENT  ERROR", line: lineNumber }; return; }
          lineIndex = idx; statementIndex = 0;
          break;
        }
        case "gosub": {
          const idx = sorted.indexOf(control.line);
          if (idx === -1) { yield { type: "error", message: "?UNDEF'D STATEMENT  ERROR", line: lineNumber }; return; }
          this.gosubStack.push({ lineIndex, statementIndex: statementIndex + 1 });
          lineIndex = idx; statementIndex = 0;
          break;
        }
      }
    }
    yield { type: "done" };
  }

  /** Execute one line of immediate-mode text (shares variables with any stored program). GOTO/GOSUB/FOR/NEXT are not meaningful without a program and are rejected. */
  *runDirect(text: string): Generator<BasicEvent, void, string[] | undefined> {
    let stmts: Stmt[];
    try { stmts = parseProgramLine(text); }
    catch (reason) { yield errorEvent(reason, null); return; }
    for (const stmt of stmts) {
      let control: Control;
      try { control = yield* this.execStatement(stmt, { lineIndex: -1, statementIndex: 0 }); }
      catch (reason) { yield errorEvent(reason, null); return; }
      if (control.type === "goto" || control.type === "gosub" || control.type === "jump") { yield errorEvent(new Error("?SYNTAX  ERROR"), null); return; }
      if (control.type === "end") break;
    }
    yield { type: "done" };
  }

  private *execStatements(stmts: Stmt[], cursor: Cursor): Generator<BasicEvent, Control, string[] | undefined> {
    for (const stmt of stmts) {
      const control = yield* this.execStatement(stmt, cursor);
      if (control.type !== "next") return control;
    }
    return { type: "next" };
  }

  private *execStatement(stmt: Stmt, cursor: Cursor): Generator<BasicEvent, Control, string[] | undefined> {
    switch (stmt.kind) {
      case "rem": return { type: "next" };
      case "end": return { type: "end" };
      case "let": this.setVariable(stmt.name, this.evaluate(stmt.expr)); return { type: "next" };
      case "goto": return { type: "goto", line: this.toLineNumber(this.evaluate(stmt.line)) };
      case "gosub": return { type: "gosub", line: this.toLineNumber(this.evaluate(stmt.line)) };
      case "return": {
        const frame = this.gosubStack.pop();
        if (!frame) throw new Error("?RETURN WITHOUT GOSUB  ERROR");
        return { type: "jump", lineIndex: frame.lineIndex, statementIndex: frame.statementIndex };
      }
      case "if": {
        const truthy = this.num(this.evaluate(stmt.condition)) !== 0;
        if (truthy) return yield* this.execStatements(stmt.then, cursor);
        return { type: "next" };
      }
      case "for": {
        const from = this.num(this.evaluate(stmt.from));
        const to = this.num(this.evaluate(stmt.to));
        const step = stmt.step ? this.num(this.evaluate(stmt.step)) : 1;
        this.setVariable(stmt.variable, from);
        this.forStack.push({ variable: stmt.variable, limit: to, step, returnLineIndex: cursor.lineIndex, returnStatementIndex: cursor.statementIndex + 1 });
        return { type: "next" };
      }
      case "next": {
        if (this.forStack.length === 0) throw new Error("?NEXT WITHOUT FOR  ERROR");
        let index = this.forStack.length - 1;
        if (stmt.variable) {
          index = -1;
          for (let k = this.forStack.length - 1; k >= 0; k--) if (this.forStack[k].variable === stmt.variable) { index = k; break; }
          if (index === -1) throw new Error("?NEXT WITHOUT FOR  ERROR");
        }
        this.forStack.length = index + 1;
        const frame = this.forStack[index];
        const current = this.num(this.getVariable(frame.variable)) + frame.step;
        const continues = frame.step >= 0 ? current <= frame.limit : current >= frame.limit;
        if (continues) {
          this.setVariable(frame.variable, current);
          return { type: "jump", lineIndex: frame.returnLineIndex, statementIndex: frame.returnStatementIndex };
        }
        this.forStack.pop();
        return { type: "next" };
      }
      case "print": {
        let text = "";
        for (const part of stmt.parts) {
          if (part.type === "expr") text += this.formatValue(this.evaluate(part.expr));
          else if (part.sep === ",") text += tabTo(text.length);
        }
        const last = stmt.parts[stmt.parts.length - 1];
        const suppressNewline = last !== undefined && last.type === "sep";
        yield { type: "print", text, newline: !suppressNewline };
        return { type: "next" };
      }
      case "input": {
        if (stmt.prompt) yield { type: "print", text: stmt.prompt, newline: false };
        const values = yield { type: "input", vars: stmt.vars };
        (values ?? []).forEach((raw, i) => {
          const name = stmt.vars[i];
          if (!name) return;
          if (name.endsWith("$")) this.setVariable(name, raw);
          else { const n = Number(raw); this.setVariable(name, Number.isFinite(n) ? n : 0); }
        });
        return { type: "next" };
      }
      case "poke": {
        const address = this.num(this.evaluate(stmt.address));
        const value = this.num(this.evaluate(stmt.value));
        if (address < 0 || address > 255 || value < 0 || value > 255) throw new Error("?ILLEGAL QUANTITY  ERROR");
        this.machine.memory[address] = value;
        return { type: "next" };
      }
      case "sys": {
        const address = this.num(this.evaluate(stmt.address));
        if (address < 0 || address > 255) throw new Error("?ILLEGAL QUANTITY  ERROR");
        this.machine.registers.pc = address;
        this.machine.halted = false;
        for (let i = 0; i < 1000 && !this.machine.halted; i++) this.machine.tick();
        return { type: "next" };
      }
    }
  }

  private evaluate(expr: Expr): Value {
    switch (expr.kind) {
      case "num": return expr.value;
      case "str": return expr.value;
      case "var": return this.getVariable(expr.name);
      case "unary": {
        if (expr.op === "-") { const v = this.evaluate(expr.expr); return -this.num(v); }
        return this.num(this.evaluate(expr.expr)) === 0 ? -1 : 0;
      }
      case "binary": return this.evaluateBinary(expr.op, expr.left, expr.right);
      case "call": return this.evaluateCall(expr.name, expr.args);
    }
  }

  private evaluateBinary(op: string, leftExpr: Expr, rightExpr: Expr): Value {
    if (op === "AND" || op === "OR") {
      const l = this.num(this.evaluate(leftExpr)) !== 0;
      const r = this.num(this.evaluate(rightExpr)) !== 0;
      return (op === "AND" ? l && r : l || r) ? -1 : 0;
    }
    const left = this.evaluate(leftExpr);
    const right = this.evaluate(rightExpr);
    if (op === "+") {
      if (typeof left === "string" || typeof right === "string") {
        if (typeof left !== typeof right) throw new Error("?TYPE MISMATCH  ERROR");
        return (left as string) + (right as string);
      }
      return left + right;
    }
    if (op === "-" || op === "*" || op === "/" || op === "^") {
      const l = this.num(left), r = this.num(right);
      switch (op) {
        case "-": return l - r;
        case "*": return l * r;
        case "/": if (r === 0) throw new Error("?DIVISION BY ZERO  ERROR"); return l / r;
        case "^": return Math.pow(l, r);
      }
    }
    if (typeof left !== typeof right) throw new Error("?TYPE MISMATCH  ERROR");
    let result: boolean;
    switch (op) {
      case "=": result = left === right; break;
      case "<>": result = left !== right; break;
      case "<": result = left < right; break;
      case ">": result = left > right; break;
      case "<=": result = left <= right; break;
      case ">=": result = left >= right; break;
      default: throw new Error("?SYNTAX  ERROR");
    }
    return result ? -1 : 0;
  }

  private evaluateCall(name: string, argExprs: Expr[]): Value {
    const args = argExprs.map(a => this.evaluate(a));
    switch (name) {
      case "INT": return Math.floor(this.num(args[0]));
      case "ABS": return Math.abs(this.num(args[0]));
      case "SQR": { const v = this.num(args[0]); if (v < 0) throw new Error("?ILLEGAL QUANTITY  ERROR"); return Math.sqrt(v); }
      case "RND": return Math.random();
      case "LEN": return this.str(args[0]).length;
      case "CHR$": return String.fromCharCode(this.num(args[0]) & 0xff);
      case "ASC": { const s = this.str(args[0]); if (!s) throw new Error("?ILLEGAL QUANTITY  ERROR"); return s.charCodeAt(0); }
      case "STR$": return formatNumber(this.num(args[0]));
      case "VAL": { const match = this.str(args[0]).match(/^\s*[-+]?\d*\.?\d+/); return match ? Number.parseFloat(match[0]) : 0; }
      case "LEFT$": return this.str(args[0]).slice(0, this.num(args[1]));
      case "RIGHT$": { const s = this.str(args[0]); const n = this.num(args[1]); return s.slice(Math.max(0, s.length - n)); }
      case "MID$": {
        const s = this.str(args[0]); const start = this.num(args[1]);
        const len = args[2] !== undefined ? this.num(args[2]) : undefined;
        return len !== undefined ? s.slice(start - 1, start - 1 + len) : s.slice(start - 1);
      }
      case "PEEK": { const addr = this.num(args[0]); if (addr < 0 || addr > 255) throw new Error("?ILLEGAL QUANTITY  ERROR"); return this.machine.memory[addr]; }
      default: throw new Error("?UNDEF'D FUNCTION  ERROR");
    }
  }

  private getVariable(name: string): Value {
    if (this.variables.has(name)) return this.variables.get(name)!;
    return name.endsWith("$") ? "" : 0;
  }
  private setVariable(name: string, value: Value): void {
    const isString = name.endsWith("$");
    if (isString !== (typeof value === "string")) throw new Error("?TYPE MISMATCH  ERROR");
    this.variables.set(name, value);
  }
  private num(value: Value): number { if (typeof value !== "number") throw new Error("?TYPE MISMATCH  ERROR"); return value; }
  private str(value: Value): string { if (typeof value !== "string") throw new Error("?TYPE MISMATCH  ERROR"); return value; }
  private toLineNumber(value: Value): number {
    const n = this.num(value);
    if (!Number.isInteger(n) || n < 0) throw new Error("?UNDEF'D STATEMENT  ERROR");
    return n;
  }
  private formatValue(value: Value): string { return typeof value === "string" ? value : formatNumber(value); }
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1e9) / 1e9;
  return (rounded >= 0 ? " " : "") + String(rounded);
}
function tabTo(column: number): string {
  const width = 10;
  const remainder = column % width;
  return " ".repeat(remainder === 0 ? width : width - remainder);
}
function errorEvent(reason: unknown, line: number | null): BasicEvent {
  return { type: "error", message: reason instanceof Error ? reason.message : String(reason), line };
}
