export const NAND = {
    id: "NAND",
    name: "NAND",
    inputs: ["a", "b"],
    outputs: ["out"],
    components: [],
    wires: [],
};
export const XOR = {
    id: "XOR",
    name: "XOR",
    inputs: ["a", "b"],
    outputs: ["out"],
    components: [],
    wires: [],
};
export const NOT = {
    id: "NOT",
    name: "NOT",
    inputs: ["a"],
    outputs: ["out"],
    components: [{ id: "g1", type: "NAND" }],
    wires: [
        { from: { componentId: "input", pinName: "a" }, to: { componentId: "g1", pinName: "a" } },
        { from: { componentId: "input", pinName: "a" }, to: { componentId: "g1", pinName: "b" } },
        { from: { componentId: "g1", pinName: "out" }, to: { componentId: "output", pinName: "out" } },
    ],
};
export const AND = {
    id: "AND",
    name: "AND",
    inputs: ["a", "b"],
    outputs: ["out"],
    components: [
        { id: "g1", type: "NAND" },
        { id: "g2", type: "NAND" },
    ],
    wires: [
        { from: { componentId: "input", pinName: "a" }, to: { componentId: "g1", pinName: "a" } },
        { from: { componentId: "input", pinName: "b" }, to: { componentId: "g1", pinName: "b" } },
        { from: { componentId: "g1", pinName: "out" }, to: { componentId: "g2", pinName: "a" } },
        { from: { componentId: "g1", pinName: "out" }, to: { componentId: "g2", pinName: "b" } },
        { from: { componentId: "g2", pinName: "out" }, to: { componentId: "output", pinName: "out" } },
    ],
};
export const OR = {
    id: "OR",
    name: "OR",
    inputs: ["a", "b"],
    outputs: ["out"],
    components: [
        { id: "na", type: "NAND" },
        { id: "nb", type: "NAND" },
        { id: "g1", type: "NAND" },
    ],
    wires: [
        { from: { componentId: "input", pinName: "a" }, to: { componentId: "na", pinName: "a" } },
        { from: { componentId: "input", pinName: "a" }, to: { componentId: "na", pinName: "b" } },
        { from: { componentId: "input", pinName: "b" }, to: { componentId: "nb", pinName: "a" } },
        { from: { componentId: "input", pinName: "b" }, to: { componentId: "nb", pinName: "b" } },
        { from: { componentId: "na", pinName: "out" }, to: { componentId: "g1", pinName: "a" } },
        { from: { componentId: "nb", pinName: "out" }, to: { componentId: "g1", pinName: "b" } },
        { from: { componentId: "g1", pinName: "out" }, to: { componentId: "output", pinName: "out" } },
    ],
};
export const PRIMITIVES = {
    NAND,
    XOR,
    NOT,
    AND,
    OR,
};
