# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The public product name is **Bits & Gates**, hosted at <https://bitsandgates.com>. "ModularCircuits+" / `modularcircuits` / `@mcp/*` remain the internal repo, package, and service names; don't rename those, because the deploy setup (`deploy/`) depends on them.

## Dev commands

```bash
# Install dependencies (requires pnpm)
pnpm install

# Build core once, then run core (tsc --watch), server, and client concurrently
pnpm dev

# Build all packages in dependency order (core → server → client); this is also the type-check
pnpm build

# Run individual packages
pnpm --filter @mcp/server dev    # Express API on :3001 (uses tsx watch)
pnpm --filter @mcp/client dev    # Vite dev server on :5173
pnpm --filter @mcp/core dev      # tsc --watch (library only, no server)
```

### Windows SDK note
`better-sqlite3` ships prebuilt binaries for Node 22 on Windows x64 (v11+). If `pnpm install` fails on the native build, ensure you're using `better-sqlite3@^11.0.0` — older versions (v9.x) have no prebuilt binary for Node 22 and require Windows SDK 10.0.22621.0 to compile from source.

### Testing and verification
There is no test framework, linter, or formatter configured. Verify changes by:
1. `pnpm build`: strict `tsc` across all three packages, plus `vite build` for the client.
2. Running a standalone Node harness against the built core (for example `node -e "import('./packages/core/dist/index.js').then(m => ...)"`) to exercise `Simulator`, `MicroCpu`, `assembleMicroCpu`, or `BasicInterpreter` directly. Earlier milestones were verified this way.

### Build gotchas
- `client` and `server` import `@mcp/core` from its **compiled `dist/`** (see `packages/core/package.json` `exports`), not from `src/`. After you change core, rebuild it (`pnpm --filter @mcp/core build`), or keep `pnpm dev` running so `tsc --watch` rebuilds it. Otherwise the other packages see stale code.
- `packages/core/dist/` is **committed to git** (only client/server `dist/` are gitignored). When you change core source, rebuild and commit the updated `dist/` together with it.
- Core uses `"module": "NodeNext"`, so relative imports inside `packages/core/src` must use the `.js` extension (`import { Simulator } from "./simulator.js"`).
- `circuits.db` at the repo root is also committed. It is the **starter library** seed (`owner_id` NULL), so don't delete or reset it casually. Production uses a separate database at `DB_PATH`.
- Server env vars: `PORT` (default 3001; the Vite proxy is hard-coded to `:3001`), `DB_PATH`, `NODE_ENV`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `ADMIN_USER_IDS`. The server reads `process.env` directly and has no dotenv. In production these come from `deploy/compose.yml` and its `.env` (`deploy/app.env.example`).
- To run locally *with* sign-in, create `packages/client/.env` from `.env.example` and start the server with the two `AUTH0_*` vars set. Leave them all unset for the no-auth dev mode.

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

**Primitives** (`primitives.ts`): NAND and XOR are the only hardware primitives (empty `components` + `wires`). NOT, AND, and OR are pre-built composite circuits implemented from NAND gates. All five are exported in the `PRIMITIVES` record and automatically seeded into every `Simulator`. Their IDs are the uppercase names (`"NAND"`, `"NOT"`, …). Pin names are lowercase: inputs `a`, `b` (NOT has only `a`), output `out`.

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

Single SQLite database (WAL mode). It lives at `circuits.db` in the repo root by default, or at `DB_PATH` if set. The `definition` column stores the full `CircuitDefinition` as a JSON blob — the DB is a store, not a relational model. `db.ts` runs idempotent migrations on startup; currently that adds the `owner_id` column.

**Auth and ownership** (`src/auth.ts`):
- Auth0 access tokens (RS256 JWTs) are verified by `express-oauth2-jwt-bearer`. Auth is enabled when `AUTH0_DOMAIN` and `AUTH0_AUDIENCE` are set. With `NODE_ENV=production` the server refuses to start without them.
- When auth is **disabled** (local dev), every request acts as the admin user `local-dev`, and new circuits go straight into the starter library.
- `optionalAuth` runs on every route. With no token the request is anonymous. A valid token sets `res.locals.user` (`{ id: sub, isAdmin }`). A present but invalid token gets a 401: it is deliberately not downgraded to anonymous, so misconfiguration shows up as an error.
- `owner_id IS NULL` marks a **starter library** circuit: readable by everyone, writable only by admins (`ADMIN_USER_IDS`, a comma-separated list of Auth0 `sub`s). Any other circuit is visible to, and editable by, its owner only.
- Every query filters by visibility (`VISIBLE` in `routes/circuits.ts`). Circuits a user can't see come back as 404 rather than 403, so their existence isn't leaked.

**REST endpoints** (`/api/circuits`):
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | optional | List visible circuits (id, name, description, timestamps, `library`, `editable`) |
| GET | `/:id` | optional | Full row + parsed definition, if visible |
| POST | `/` | required | Create — generates UUID (overrides any `id` in the body), owned by the caller |
| PUT | `/:id` | required + editable | Replace definition blob |
| DELETE | `/:id` | required + editable | Delete |
| POST | `/:id/simulate` | optional | Load visible defs, instantiate Simulator, run |

`POST /:id/simulate` accepts `{ inputs, state? }` and returns `{ outputs, signals, state }`. `:id` may also be a primitive ID such as `NAND`. Simulation errors return 400. The caller is responsible for threading `state` back on subsequent calls. On each request the server loads every circuit **visible to the caller**, so composite circuits can resolve their sub-circuits. The Simulator is constructed with `maxEvaluations: 500_000`. Nested oscillating circuits cost up to 64^depth evaluations, and the server is single-threaded, so this cap stops one user from blocking everyone. The largest starter circuit needs ~22k. The simulator also rejects circuits that contain themselves.

**Production serving**: if `packages/client/dist` exists, Express serves it, with an SPA fallback for non-`/api` paths. Production is one process on one origin, so CORS is enabled only outside production. `GET /api/health` returns `{ ok: true }`; the container healthcheck uses it.

**Deployment** (`deploy/DEPLOY.md`): a multi-stage `Dockerfile` builds the image. The `VITE_AUTH0_*` values are build args, and the starter `circuits.db` is copied into `/data` on first start only. The container runs on the Hetzner VPS with a read-only filesystem and no published ports, behind the server's shared `site-caddy` container, which handles HTTPS. `deploy/compose.yml` joins Caddy's network, `site-deploy_default`, and `deploy/bitsandgates.caddy` is the site file. That VPS also hosts other sites, so never change anything outside `~/site-deploy/bits-and-gates/` and `~/site-deploy/sites/bitsandgates.caddy` on it. If you change dependencies, check that the image still builds: `docker build .` installs with `--frozen-lockfile`, and the root `packageManager` pins pnpm.

### `@mcp/client` — React + Vite + React Flow

Vite proxies `/api` to `:3001` so no CORS issues in dev. All HTTP calls go through `request()` in `src/api.ts`. It attaches the bearer token and throws on non-2xx responses, using the server's `{ error }` message.

**Auth** (`src/auth.tsx`): `AppAuthProvider` wraps `Auth0Provider` (refresh tokens, localStorage cache) when `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID` and `VITE_AUTH0_AUDIENCE` are set; see `packages/client/.env.example`. Vite bakes these into the bundle at build time. When they're unset it provides a fixed "Local dev" signed-in state, and `AccountButton` renders nothing. Components read auth through `useAppAuth()`, never `useAuth0()` directly, so the app also works without Auth0. The bridge calls `setTokenGetter` **during render**, not in an effect, because child effects (App's data loading) run before parent effects.

**Guest vs. signed-in**: guests can browse and simulate the starter library and use the CPU Lab and Commodore UI. Creating or saving prompts sign-in. Saving a non-editable circuit (a library circuit, for a non-admin) creates a "(copy)" owned by the user. With auth enabled, the sidebar splits circuits into MY CIRCUITS and LIBRARY.

**Views**: `App.tsx` switches on a `view` state (`"home" | "circuits" | "cpu" | "commodore"`). There is no router. `home` is a launcher. `circuits` is the circuit designer, with an `editor`/`simulator` tab pair. `cpu` renders `MicroCpuPanel`, and `commodore` renders `CommodorePanel`. The CPU and Commodore views are purely client-side: they use `@mcp/core` directly and never call the server.

**Data flow**: `App.tsx` owns all circuit state. It fetches the visible list + all definitions once auth has finished loading, again whenever the signed-in state changes, and after every mutation, then passes `allDefinitions` (a `Record<string, CircuitDefinition>` seeded with PRIMITIVES) down to child components.

**React Flow integration**: `CircuitEditor` maintains two parallel representations:
- React Flow `nodes`/`edges` for the visual canvas
- Conversion functions `defToFlow` / `flowToDefinition` that translate between `CircuitDefinition` (the canonical data model) and React Flow's node/edge format on load and save.

Node types: `gate` (rendered by `GateNode`) for component instances, `io` (rendered by `IONode`) for the circuit boundary. The `input` and `output` React Flow node IDs must match the reserved `PinRef.componentId` values used by the core engine.

**`GateNodeData`** (`flowTypes.ts`): `{ label, componentType, typeLabel, inputs, outputs }`. `componentType` is the actual circuit ID (may be a UUID for saved circuits); `typeLabel` is the human-readable name shown as a subtitle. Double-clicking the node header opens an inline rename field.

**`SimulatorPanel`**: Holds `circuitState` in React state and passes it to `api.simulate()` on each Run, then stores the returned `state` back. Shows a `STATEFUL` badge when state is non-empty and a `Reset State` button to clear it. The internal state section is visible for debugging latches and flip-flops.

**Saved circuits as components**: The toolbar lists all PRIMITIVES plus all saved circuits (excluding the one being edited). Clicking one adds a gate node whose `componentType` is the circuit's DB id. If a saved circuit is updated, delete and re-add existing instances so their pin lists refresh.

## Microcoded CPU development

All CPU-related development must be recorded here. Keep the architecture, supported instruction set, deliberate limitations, verification, and dated development log current whenever CPU functionality changes.

### Architecture

`packages/core/src/microCpu.ts` implements a separate educational CPU engine; it does not use the boolean fixed-point `Simulator`. The CPU has 256 bytes of memory, an 8-bit datapath, registers A/PC/IR/MAR/TMP, N/Z/C flags, and a queued microinstruction control unit. `tick()` executes one microinstruction and exposes its active microcommands. `stepInstruction()` completes one programmer-visible instruction.

`packages/core/src/microAssembler.ts` is a two-pass assembler for the supported 6502-like subset. It accepts `;` comments, labels, `$` hexadecimal literals, decimal literals, and immediate operands prefixed by `#`.

`packages/client/src/components/MicroCpuPanel.tsx` provides the CPU Lab, including micro-step, instruction-step, run, reset, assembly source editing, register/control-state display, and selected zero-page memory values.

### Supported instruction subset

| Assembly | Opcode | Addressing |
|----------|--------|------------|
| `BRK` | `$00` | implied |
| `ADC #value` | `$69` | immediate |
| `STA address` | `$85` | zero page |
| `LDA address` | `$A5` | zero page |
| `LDA #value` | `$A9` | immediate |
| `BNE label` | `$D0` | relative |
| `JMP address` | `$4C` | absolute, page zero only |
| `NOP` | `$EA` | implied |

### Deliberate milestone limitations

- This is 6502-flavoured, not a cycle-accurate 6502 implementation.
- Memory and the program counter are currently 8-bit; all addressing is page zero.
- Only N, Z, and C flags exist. Decimal mode, overflow, interrupts, stack behavior, X/Y registers, and page-cross timing are not implemented.
- Unsupported opcodes halt the CPU rather than emulating undocumented behavior.

### Development log

- **2026-07-11 - Initial CPU Lab:** Added the microcoded engine, visible microcommands, 6502-compatible opcode values for the initial subset, a fixed demo program, and the React CPU Lab. Corrected pre-existing React Flow v12 generic typings so the workspace production build passes. Verified the demo executes in 31 microcycles, leaves A=`$08`, stores `$08` at memory `$11`, and halts.
- **2026-07-11 - Programmable milestone:** Added the two-pass subset assembler, labels and relative branch calculation, editable assembly source, assemble/load behavior, and programmer-visible instruction stepping. Verified the production build and a branch/label program that skips an instruction, loads `$2A`, stores it at `$20`, and halts.

## Commodore-compatible environment

The product direction is a clean-room, C64/C128-inspired user environment layered over the educational CPU and circuit tools. Do not describe it as a complete C64/C128 emulator until it provides compatible CPU execution, memory maps, ROM behavior, video, sound, and peripherals. Do not add copyrighted Commodore ROM images to the repository.

Compatibility is tracked at four distinct levels:

1. **UI-compatible:** Commodore-style screen, keyboard interaction, prompts, and monitor workflow.
2. **Language-compatible:** useful Commodore BASIC V2/V7 program behavior.
3. **Machine-compatible:** execution of 6502/8502 binaries and compatible memory maps.
4. **Hardware-compatible:** video, sound, CIA, timing, banking, and peripherals.

`packages/client/src/components/CommodorePanel.tsx` implements the first UI shell. It offers C64 and C128 startup modes, C64-style 40-column display, a C128 40/80-column toggle, numbered program entry/deletion, `LIST`, `NEW`, `RUN`, and C128 `MONITOR`. It owns a `MicroCpu` instance shared by BASIC and monitor commands. The current memory remains limited to 256 bytes.

`packages/core/src/basicInterpreter.ts` implements `BasicInterpreter`, a real tokenizer/parser/evaluator for a BASIC V2-flavoured subset — this is the "Language-compatible" engine, distinct from the UI shell. It follows the same no-I/O, pure-engine style as `MicroCpu`: `run(lines)` and `runDirect(text)` are generator functions that yield `{ type: "print" | "input" | "error" | "done" }` events rather than touching the DOM, so the caller drives output rendering and INPUT prompting. Supported statements: `LET` (with or without the keyword), `PRINT`/`?` (with `,`/`;` separators and print zones), `IF...THEN` (line number or statement list), `GOTO`, `GOSUB`/`RETURN`, `FOR`/`NEXT` (with `STEP`), `INPUT`, `POKE`, `SYS`, `REM`, `END`/`STOP`. Expressions support numeric and string variables, `+ - * / ^`, comparisons, `AND`/`OR`/`NOT`, and functions `INT`, `ABS`, `SQR`, `RND`, `LEN`, `CHR$`, `ASC`, `STR$`, `VAL`, `LEFT$`, `RIGHT$`, `MID$`, `PEEK`. It shares memory with the panel's `MicroCpu` instance so `PEEK`/`POKE`/`SYS` see the same 256 bytes as the monitor. Known limitations: no arrays/`DIM`, no `DATA`/`READ`, no multi-variable `NEXT`, `AND`/`OR`/`NOT` are logical rather than the real machine's bitwise operators, and `FOR`/`NEXT` nested inside an `IF...THEN` on the same line is unsupported (`FOR` must be its own statement on its own line for `NEXT` to jump back to it correctly).

### Commodore environment development log

- **2026-07-11 - UI shell milestone:** Added the Commodore UI entry point and terminal-style C64/C128 modes. Added numbered BASIC program storage, a deliberately small command executor, 40/80-column rendering, and initial monitor entry/exit. This is UI-compatible scaffolding, not BASIC V2/V7 or machine compatibility.
- **2026-07-12 - Shared machine-state milestone:** Connected the Commodore shell to `MicroCpu`. Added BASIC `PEEK`, `POKE`, and `SYS`; monitor memory dump (`M`), disassembly (`D`), single-line assembly (`A`), register display (`R`), execution (`G`), and BASIC exit (`X`). BASIC, monitor, and machine-code execution now operate on the same 256-byte memory. This remains a subset implementation rather than a C128 monitor clone.
- **2026-07-12 - Real BASIC interpreter milestone:** Replaced the regex-matched `PRINT`/`POKE`/`SYS` command dispatch with `BasicInterpreter` (`packages/core/src/basicInterpreter.ts`) — a tokenizer, recursive-descent parser, and generator-based evaluator supporting variables, expressions, `IF`/`GOTO`/`GOSUB`/`RETURN`, `FOR`/`NEXT`, `INPUT`, and string functions, advancing this environment's "Language-compatible" level. `CommodorePanel` now drives the interpreter's event generator (`print`/`input`/`error`/`done`) instead of parsing statements itself, buffering `print` events (honoring trailing `,`/`;` to suppress the newline) and pausing on `input` events until the next line the user submits. Verified via a standalone Node harness: `FOR I=1 TO 5: PRINT I*I: NEXT I` produces 1/4/9/16/25; a `GOSUB`/`RETURN` loop driven by `IF X<3 THEN 20` increments correctly; `LEFT$`/`MID$`/`LEN` on strings; `INPUT` pausing and resuming with a supplied value; `POKE`/`PEEK` sharing memory with the shared `MicroCpu`; and a malformed expression reporting `?SYNTAX  ERROR` with the offending line number instead of crashing. Also fixed a caller-side hang: the interpreter's generators `yield { type: "done" }` before returning (the yield itself doesn't set the generator's `done` flag), so callers must check `event.type === "done"` rather than relying on the generator protocol's `done` flag.

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
