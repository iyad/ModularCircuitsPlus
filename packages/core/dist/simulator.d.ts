import type { CircuitDefinition, Signal, SimulationResult } from "./types.js";
export declare class Simulator {
    private library;
    constructor(extraDefs?: CircuitDefinition[]);
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
    private evalPrimitive;
}
//# sourceMappingURL=simulator.d.ts.map