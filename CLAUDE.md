# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dev commands

```bash
# Install dependencies (requires pnpm)
pnpm install

# Start both server and client in watch mode
pnpm dev

# Build all packages in dependency order
pnpm build

# Run individual packages
pnpm --filter @mcp/server dev    # Express API on :3001 (uses tsx watch)
pnpm --filter @mcp/client dev    # Vite dev server on :5173
pnpm --filter @mcp/core dev      # tsc --watch (library only, no server)
```

### Windows SDK note
`better-sqlite3` ships prebuilt binaries for Node 22 on Windows x64 (v11+). If `pnpm install` fails on the native build, ensure you're using `better-sqlite3@^11.0.0` — older versions (v9.x) have no prebuilt binary for Node 22 and require Windows SDK 10.0.22621.0 to compile from source.

## Architecture

Three pnpm workspace packages with a strict dependency direction: `client` and `server` both depend on `core`; they never depend on each other.

### `@mcp/core` — circuit engine (no I/O, no framework)

The heart of the system. Everything is expressed as a `CircuitDefinition`:

```
CircuitDefinition {
  id, name, inputs[], outputs[],
  components: ComponentInstance[],  // references to other CircuitDefinitions by id
  wires: Wire[]                     // PinRef(from) → PinRef(to)
}
```

`PinRef` uses two reserved `componentId` values: `"input"` (the circuit's own input boundary) and `"output"` (the circuit's own output boundary). All other component IDs are user-assigned instance IDs within the circuit.

**Primitives** (`primitives.ts`): NAND and XOR are the only hardware primitives (empty `components` + `wires`). NOT, AND, and OR are pre-built composite circuits implemented from NAND gates. All five are exported in the `PRIMITIVES` record and automatically seeded into every `Simulator`.

**`Simulator`** (`simulator.ts`): Stateful, recursive, fixed-point evaluation.
- `new Simulator(extraDefs[])` — loads all saved circuits on top of PRIMITIVES
- `simulator.simulate(defId, inputs, initialState?)` — returns `{ outputs, signals, state }`:
  - `outputs` — final pin values at the circuit boundary
  - `signals` — flat `"componentId.pinName" → boolean` map of all intermediate values
  - `state` — opaque record to pass back as `initialState` on the next call (enables latches/flip-flops)
- Evaluation uses `evalWithState` which recurses into sub-circuits and runs up to `MAX_ITERATIONS=64` fixed-point passes per level. Unconnected pins default to `false`.
- State keys are hierarchically namespaced: `"compId.pinName"` for this level, `"compId/subCompId.pinName"` for one level deeper. This allows arbitrarily deep sequential circuits to persist memory across calls.
- Primitives bottom out in `evalPrimitive` which directly computes NAND/XOR boolean logic.

**Important simulation behaviour:**
- Level-triggered feedback circuits (e.g. a raw T flip-flop) will oscillate when their enable input is high; after 64 iterations they settle at an arbitrary value. Use master-slave configurations to avoid this.
- A circuit that hasn't been run before has no saved state. The first simulation of a latch in hold mode is indeterminate — always seed with a write cycle before relying on hold behaviour.
- Pin names are case-sensitive. A wire targeting `sr_latch.S` will not match an input pin named `s`.

### `@mcp/server` — Express REST API

Single SQLite database at repo root `circuits.db`. The `definition` column stores the full `CircuitDefinition` as a JSON blob — the DB is a store, not a relational model.

**REST endpoints** (`/api/circuits`):
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all (id, name, description, timestamps) |
| GET | `/:id` | Full row + parsed definition |
| POST | `/` | Create — generates UUID, merges id+name into definition blob |
| PUT | `/:id` | Replace definition blob |
| DELETE | `/:id` | Delete |
| POST | `/:id/simulate` | Load all saved defs, instantiate Simulator, run |

`POST /:id/simulate` accepts `{ inputs, state? }` and returns `{ outputs, signals, state }`. The caller is responsible for threading `state` back on subsequent calls. The server loads **all** circuits from the DB on each request so composite circuits can resolve sub-circuit dependencies.

### `@mcp/client` — React + Vite + React Flow

Vite proxies `/api` to `:3001` so no CORS issues in dev.

**Data flow**: `App.tsx` owns all circuit state. It fetches the full list + all definitions on mount and after every mutation, then passes `allDefinitions` (a `Record<string, CircuitDefinition>` seeded with PRIMITIVES) down to child components.

**React Flow integration**: `CircuitEditor` maintains two parallel representations:
- React Flow `nodes`/`edges` for the visual canvas
- Conversion functions `defToFlow` / `flowToDefinition` that translate between `CircuitDefinition` (the canonical data model) and React Flow's node/edge format on load and save.

Node types: `gate` (rendered by `GateNode`) for component instances, `io` (rendered by `IONode`) for the circuit boundary. The `input` and `output` React Flow node IDs must match the reserved `PinRef.componentId` values used by the core engine.

**`GateNodeData`** (`flowTypes.ts`): `{ label, componentType, typeLabel, inputs, outputs }`. `componentType` is the actual circuit ID (may be a UUID for saved circuits); `typeLabel` is the human-readable name shown as a subtitle. Double-clicking the node header opens an inline rename field.

**`SimulatorPanel`**: Holds `circuitState` in React state and passes it to `api.simulate()` on each Run, then stores the returned `state` back. Shows a `STATEFUL` badge when state is non-empty and a `Reset State` button to clear it. The internal state section is visible for debugging latches and flip-flops.

**Saved circuits as components**: The toolbar lists all PRIMITIVES plus all saved circuits (excluding the one being edited). Clicking one adds a gate node whose `componentType` is the circuit's DB id. If a saved circuit is updated, delete and re-add existing instances so their pin lists refresh.

## Sequential circuit design guide

Building blocks in dependency order — each level reuses the one below as a component:

| Circuit | Components | Key wires |
|---------|-----------|-----------|
| **SR NAND Latch** | 2 × NAND | Cross-coupled: nand_q.out→nand_qbar.b, nand_qbar.out→nand_q.b |
| **D Latch** | SR Latch + 2 × NAND (steer_s, steer_r) | steer_s=NAND(D,CLK); steer_r=NAND(steer_s.out,CLK); steer_s.out→SR.s; steer_r.out→SR.r |
| **D Flip-Flop** | 2 × D Latch (master, slave) + NOT | master.CLK=CLK; NOT(CLK)→slave.CLK; master.Q→slave.D; outputs from slave |
| **T Flip-Flop** | D Flip-Flop | Wire slave.Qbar back to master.D — no extra gates needed |
| **2-bit Counter** | 2 × T Flip-Flop | ff0.CLK=CLK; ff1.CLK=ff0.Q (ripple); outputs Q0=ff0.Q, Q1=ff1.Q |

**D Flip-Flop is falling-edge triggered**: output Q updates when CLK goes 1→0 (slave becomes transparent). Each test cycle = Run(CLK=1) then Run(CLK=0). Always start with a CLK=1 run before reading outputs — the first run with no saved state is indeterminate.

**Counter operation**: one full count = Run(CLK=1) + Run(CLK=0). Binary sequence 00→01→10→11→00.
