export type Signal = boolean;

export interface PinRef {
  componentId: string;
  pinName: string;
}

export interface Wire {
  from: PinRef;
  to: PinRef;
}

export interface ComponentInstance {
  id: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
}

export interface CircuitDefinition {
  id: string;
  name: string;
  description?: string;
  inputs: string[];
  outputs: string[];
  components: ComponentInstance[];
  wires: Wire[];
  inputPosition?: { x: number; y: number };
  outputPosition?: { x: number; y: number };
}

export interface SimulationResult {
  signals: Record<string, Signal>;
  outputs: Record<string, Signal>;
  // Internal state to pass back on the next simulate() call — enables memory/latch behaviour
  state: Record<string, Signal>;
}
