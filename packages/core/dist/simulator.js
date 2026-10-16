import { PRIMITIVES } from "./primitives.js";
const MAX_ITERATIONS = 64;
export class Simulator {
    library;
    maxEvaluations;
    evaluations = 0;
    // Composite circuit ids on the current evaluation path, to reject circuits that contain themselves.
    active = new Set();
    constructor(extraDefs = [], options = {}) {
        this.maxEvaluations = options.maxEvaluations ?? Infinity;
        this.library = new Map(Object.entries(PRIMITIVES));
        for (const def of extraDefs) {
            this.library.set(def.id, def);
        }
    }
    register(def) {
        this.library.set(def.id, def);
    }
    /**
     * Simulate a circuit to a stable fixed point.
     * Pass the `state` from a previous result back as `initialState` to
     * preserve memory across calls (enables latch / flip-flop behaviour).
     *
     * State keys are hierarchical: "compId.pinName" for this level,
     * "compId/subCompId.pinName" for one level deeper, etc.
     */
    simulate(defId, inputs, initialState = {}) {
        const def = this.library.get(defId);
        if (!def)
            throw new Error(`Unknown circuit: ${defId}`);
        this.evaluations = 0;
        this.active.clear();
        return this.evalWithState(def, inputs, initialState);
    }
    evalWithState(def, circuitInputs, state) {
        if (++this.evaluations > this.maxEvaluations) {
            throw new Error(`Simulation too large: exceeded ${this.maxEvaluations} evaluations`);
        }
        if (def.components.length === 0) {
            return this.evalPrimitive(def.id, circuitInputs);
        }
        if (this.active.has(def.id)) {
            throw new Error(`Circuit "${def.name}" contains itself`);
        }
        this.active.add(def.id);
        try {
            return this.evalComposite(def, circuitInputs, state);
        }
        finally {
            this.active.delete(def.id);
        }
    }
    evalComposite(def, circuitInputs, state) {
        const inputSources = new Map();
        for (const wire of def.wires) {
            inputSources.set(`${wire.to.componentId}.${wire.to.pinName}`, wire.from);
        }
        // Extract per-component sub-states from the namespaced state
        const subStates = {};
        for (const comp of def.components) {
            subStates[comp.id] = {};
        }
        for (const [k, v] of Object.entries(state)) {
            const slash = k.indexOf("/");
            if (slash > 0) {
                const compId = k.slice(0, slash);
                if (subStates[compId] !== undefined) {
                    subStates[compId][k.slice(slash + 1)] = v;
                }
            }
        }
        // Seed prev with the flat part of the incoming state
        let prev = {};
        for (const [k, v] of Object.entries(state)) {
            if (!k.includes("/"))
                prev[k] = v;
        }
        let compOutputs = {};
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
            const newCompOutputs = {};
            for (const comp of def.components) {
                const compDef = this.library.get(comp.type);
                if (!compDef)
                    throw new Error(`Unknown component type: ${comp.type}`);
                // Resolve inputs for this component
                const compInputs = {};
                for (const pinName of compDef.inputs) {
                    const srcRef = inputSources.get(`${comp.id}.${pinName}`);
                    if (!srcRef) {
                        compInputs[pinName] = false;
                        continue;
                    }
                    if (srcRef.componentId === "input") {
                        compInputs[pinName] = circuitInputs[srcRef.pinName] ?? false;
                    }
                    else {
                        // Use previous iteration's signals — handles cycles at this level
                        compInputs[pinName] = prev[`${srcRef.componentId}.${srcRef.pinName}`] ?? false;
                    }
                }
                // Recurse: sub-circuits also converge to their own fixed point
                const result = this.evalWithState(compDef, compInputs, subStates[comp.id] ?? {});
                newCompOutputs[comp.id] = result.outputs;
                subStates[comp.id] = result.state;
            }
            // Flatten outputs to a signal map for convergence check
            const newSignals = {};
            for (const [compId, pins] of Object.entries(newCompOutputs)) {
                for (const [pin, val] of Object.entries(pins)) {
                    newSignals[`${compId}.${pin}`] = val;
                }
            }
            for (const [pin, val] of Object.entries(circuitInputs)) {
                newSignals[`input.${pin}`] = val;
            }
            compOutputs = newCompOutputs;
            if (signalsEqual(prev, newSignals))
                break;
            prev = newSignals;
        }
        // Resolve circuit boundary outputs
        const outputs = {};
        for (const outPin of def.outputs) {
            const srcRef = inputSources.get(`output.${outPin}`);
            if (!srcRef) {
                outputs[outPin] = false;
                continue;
            }
            outputs[outPin] = compOutputs[srcRef.componentId]?.[srcRef.pinName] ?? false;
        }
        // Build final state: flat signals + namespaced sub-states for next call
        const finalState = { ...prev };
        for (const [compId, subState] of Object.entries(subStates)) {
            for (const [k, v] of Object.entries(subState)) {
                finalState[`${compId}/${k}`] = v;
            }
        }
        return { signals: prev, outputs, state: finalState };
    }
    evalPrimitive(id, inputs) {
        let out;
        switch (id) {
            case "NAND":
                out = !(inputs["a"] && inputs["b"]);
                break;
            case "XOR":
                out = inputs["a"] !== inputs["b"];
                break;
            default: throw new Error(`Cannot evaluate primitive: ${id}`);
        }
        return { signals: {}, outputs: { out }, state: {} };
    }
}
function signalsEqual(a, b) {
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length)
        return false;
    return keysA.every((k) => a[k] === b[k]);
}
