import type { CircuitDefinition, PinRef, Signal, SimulationResult } from "./types.js";
import { PRIMITIVES } from "./primitives.js";

const MAX_ITERATIONS = 64;

export class Simulator {
  private library: Map<string, CircuitDefinition>;

  constructor(extraDefs: CircuitDefinition[] = []) {
    this.library = new Map(Object.entries(PRIMITIVES));
    for (const def of extraDefs) {
      this.library.set(def.id, def);
    }
  }

  register(def: CircuitDefinition): void {
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
  simulate(
    defId: string,
    inputs: Record<string, Signal>,
    initialState: Record<string, Signal> = {}
  ): SimulationResult {
    const def = this.library.get(defId);
    if (!def) throw new Error(`Unknown circuit: ${defId}`);
    return this.evalWithState(def, inputs, initialState);
  }

  private evalWithState(
    def: CircuitDefinition,
    circuitInputs: Record<string, Signal>,
    state: Record<string, Signal>
  ): SimulationResult {
    if (def.components.length === 0) {
      return this.evalPrimitive(def.id, circuitInputs);
    }

    const inputSources = new Map<string, PinRef>();
    for (const wire of def.wires) {
      inputSources.set(`${wire.to.componentId}.${wire.to.pinName}`, wire.from);
    }

    // Extract per-component sub-states from the namespaced state
    const subStates: Record<string, Record<string, Signal>> = {};
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
    let prev: Record<string, Signal> = {};
    for (const [k, v] of Object.entries(state)) {
      if (!k.includes("/")) prev[k] = v;
    }

    let compOutputs: Record<string, Record<string, Signal>> = {};

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const newCompOutputs: Record<string, Record<string, Signal>> = {};

      for (const comp of def.components) {
        const compDef = this.library.get(comp.type);
        if (!compDef) throw new Error(`Unknown component type: ${comp.type}`);

        // Resolve inputs for this component
        const compInputs: Record<string, Signal> = {};
        for (const pinName of compDef.inputs) {
          const srcRef = inputSources.get(`${comp.id}.${pinName}`);
          if (!srcRef) { compInputs[pinName] = false; continue; }
          if (srcRef.componentId === "input") {
            compInputs[pinName] = circuitInputs[srcRef.pinName] ?? false;
          } else {
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
      const newSignals: Record<string, Signal> = {};
      for (const [compId, pins] of Object.entries(newCompOutputs)) {
        for (const [pin, val] of Object.entries(pins)) {
          newSignals[`${compId}.${pin}`] = val;
        }
      }
      for (const [pin, val] of Object.entries(circuitInputs)) {
        newSignals[`input.${pin}`] = val;
      }

      compOutputs = newCompOutputs;
      if (signalsEqual(prev, newSignals)) break;
      prev = newSignals;
    }

    // Resolve circuit boundary outputs
    const outputs: Record<string, Signal> = {};
    for (const outPin of def.outputs) {
      const srcRef = inputSources.get(`output.${outPin}`);
      if (!srcRef) { outputs[outPin] = false; continue; }
      outputs[outPin] = compOutputs[srcRef.componentId]?.[srcRef.pinName] ?? false;
    }

    // Build final state: flat signals + namespaced sub-states for next call
    const finalState: Record<string, Signal> = { ...prev };
    for (const [compId, subState] of Object.entries(subStates)) {
      for (const [k, v] of Object.entries(subState)) {
        finalState[`${compId}/${k}`] = v;
      }
    }

    return { signals: prev, outputs, state: finalState };
  }

  private evalPrimitive(id: string, inputs: Record<string, Signal>): SimulationResult {
    let out: Signal;
    switch (id) {
      case "NAND": out = !(inputs["a"] && inputs["b"]); break;
      case "XOR":  out = inputs["a"] !== inputs["b"];   break;
      default: throw new Error(`Cannot evaluate primitive: ${id}`);
    }
    return { signals: {}, outputs: { out }, state: {} };
  }
}

function signalsEqual(a: Record<string, Signal>, b: Record<string, Signal>): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => a[k] === b[k]);
}
