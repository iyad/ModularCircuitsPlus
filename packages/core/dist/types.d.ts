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
}
export interface CircuitDefinition {
    id: string;
    name: string;
    description?: string;
    inputs: string[];
    outputs: string[];
    components: ComponentInstance[];
    wires: Wire[];
}
export interface SimulationResult {
    signals: Record<string, Signal>;
    outputs: Record<string, Signal>;
    state: Record<string, Signal>;
}
//# sourceMappingURL=types.d.ts.map