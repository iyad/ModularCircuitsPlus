export interface AssembledProgram {
    bytes: number[];
    labels: Record<string, number>;
}
/** Assemble the deliberately small 6502-like instruction set supported by MicroCpu. */
export declare function assembleMicroCpu(source: string): AssembledProgram;
export declare const DEMO_SOURCE = "; Adds 5 + 3 and stores the result in $11\n        LDA #$05\n        STA $10\n        LDA #$03\n        ADC #$05\n        STA $11\n        BRK";
//# sourceMappingURL=microAssembler.d.ts.map