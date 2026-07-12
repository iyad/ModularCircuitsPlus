import type { MicroCpu } from "./microCpu.js";
/** Events yielded while a BASIC program (or a direct-mode statement) runs. */
export type BasicEvent = {
    type: "print";
    text: string;
    newline: boolean;
} | {
    type: "input";
    vars: string[];
} | {
    type: "error";
    message: string;
    line: number | null;
} | {
    type: "done";
};
/** A BASIC V2-flavoured interpreter: variables, expressions, IF/GOTO/GOSUB/FOR/NEXT/INPUT. Shares memory with a MicroCpu for PEEK/POKE/SYS. */
export declare class BasicInterpreter {
    private readonly machine;
    private variables;
    private forStack;
    private gosubStack;
    constructor(machine: MicroCpu);
    clearVariables(): void;
    /** Run a full stored program (line number -> source text), from its lowest line. Resets variables first, like a real RUN. */
    run(lines: Record<number, string>): Generator<BasicEvent, void, string[] | undefined>;
    /** Execute one line of immediate-mode text (shares variables with any stored program). GOTO/GOSUB/FOR/NEXT are not meaningful without a program and are rejected. */
    runDirect(text: string): Generator<BasicEvent, void, string[] | undefined>;
    private execStatements;
    private execStatement;
    private evaluate;
    private evaluateBinary;
    private evaluateCall;
    private getVariable;
    private setVariable;
    private num;
    private str;
    private toLineNumber;
    private formatValue;
}
//# sourceMappingURL=basicInterpreter.d.ts.map