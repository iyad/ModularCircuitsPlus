import type { CircuitDefinition, Signal, SimulationResult } from "./types.js";
export interface SimulatorOptions {
    /**
     * Upper bound on circuit evaluations (primitive + composite) per simulate() call.
     * Nested oscillating circuits cost up to 64^depth evaluations, so untrusted
     * callers (e.g. a public server) should set this to keep requests bounded.
     */
    maxEvaluations?: number;
}
export declare class Simulator {
    private library;
    private maxEvaluations;
    private evaluations;
    private active;
    constructor(extraDefs?: CircuitDefinition[], options?: SimulatorOptions);
    register(def: CircuitDefinition): void;
    /**
     * Simulate a circuit to a stable fixed point.
     * Pass the `state` from a previous result back as `initialState` to
     * preserve memory across calls (enables latch / flip-flop behaviour).
     *
     * State keys are hierarchical: "compId.pinName" for this level,
     * "compId/subCompId.pinName" for one level deeper, etc.
     */
    simulate(defId: string, inputs: Record<string, Signal>, initialState?: Record<string, Signal>): SimulationResult;
    private evalWithState;
    private evalComposite;
    private evalPrimitive;
}
//# sourceMappingURL=simulator.d.ts.map