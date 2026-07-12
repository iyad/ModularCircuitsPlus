export interface CpuRegisters {
    a: number;
    pc: number;
    ir: number;
    mar: number;
    tmp: number;
    zero: boolean;
    negative: boolean;
    carry: boolean;
}
export interface CpuSnapshot {
    registers: CpuRegisters;
    memory: number[];
    halted: boolean;
    cycles: number;
    instruction: string;
    microinstruction: string;
    microcommands: string[];
}
/** A small, educational, 6502-flavoured microcoded accumulator CPU. */
export declare class MicroCpu {
    readonly memory: Uint8Array<ArrayBuffer>;
    readonly registers: CpuRegisters;
    halted: boolean;
    cycles: number;
    private queue;
    private currentInstruction;
    private lastStep;
    constructor(program?: readonly number[], startAddress?: number);
    load(program: readonly number[], startAddress?: number): void;
    reset(startAddress?: number): void;
    tick(): CpuSnapshot;
    /** Execute the fetch sequence and one complete programmer-visible instruction. */
    stepInstruction(): CpuSnapshot;
    snapshot(): CpuSnapshot;
    private enqueueFetch;
    private decode;
    private immediate;
    private zeroPageAddress;
    private zeroPageRead;
    private absoluteJump;
    private relativeBranch;
    private finish;
    private setNZ;
    private step;
}
export declare const DEMO_PROGRAM: readonly [169, 5, 133, 16, 169, 3, 105, 5, 133, 17, 0];
//# sourceMappingURL=microCpu.d.ts.map