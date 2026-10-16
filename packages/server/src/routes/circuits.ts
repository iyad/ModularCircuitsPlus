import { Router, type Response } from "express";
import db from "../db.js";
import { Simulator, PRIMITIVES } from "@mcp/core";
import type { CircuitDefinition } from "@mcp/core";
import { randomUUID } from "crypto";
import { authEnabled, currentUser, optionalAuth, requireAuth } from "../auth.js";

const router = Router();
router.use(optionalAuth);

interface CircuitRow {
  id: string;
  name: string;
  description: string | null;
  definition: string;
  owner_id: string | null;
  created_at: number;
  updated_at: number;
}

// A user sees the shared starter library (owner_id NULL) plus their own circuits.
const VISIBLE = "(owner_id IS NULL OR owner_id = ?)";

function viewerId(res: Response): string | null {
  return currentUser(res)?.id ?? null;
}

function canEdit(res: Response, row: Pick<CircuitRow, "owner_id">): boolean {
  const user = currentUser(res);
  if (!user) return false;
  return row.owner_id === null ? user.isAdmin : row.owner_id === user.id;
}

function findVisible(res: Response, id: string): CircuitRow | undefined {
  return db
    .prepare(`SELECT * FROM circuits WHERE id = ? AND ${VISIBLE}`)
    .get(id, viewerId(res)) as CircuitRow | undefined;
}

router.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, description, owner_id, created_at, updated_at FROM circuits WHERE ${VISIBLE} ORDER BY updated_at DESC`
    )
    .all(viewerId(res)) as Omit<CircuitRow, "definition">[];
  res.json(
    rows.map(({ owner_id, ...r }) => ({ ...r, library: owner_id === null, editable: canEdit(res, { owner_id }) }))
  );
});

router.get("/:id", (req, res) => {
  const row = findVisible(res, req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  const { owner_id, ...rest } = row;
  res.json({
    ...rest,
    library: owner_id === null,
    editable: canEdit(res, row),
    definition: JSON.parse(row.definition),
  });
});

router.post("/", requireAuth, (req, res) => {
  const { name, description, definition } = req.body as {
    name: string;
    description?: string;
    definition: Omit<CircuitDefinition, "id" | "name">;
  };
  if (!name || !definition) return res.status(400).json({ error: "name and definition required" });

  const id = randomUUID();
  const fullDef: CircuitDefinition = { ...definition, id, name, description };
  // Without Auth0 (local dev) new circuits go into the shared starter library that ships in circuits.db.
  const ownerId = authEnabled ? currentUser(res)!.id : null;

  db.prepare(
    "INSERT INTO circuits (id, name, description, definition, owner_id) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, description ?? null, JSON.stringify(fullDef), ownerId);

  res.status(201).json({ id, name });
});

router.put("/:id", requireAuth, (req, res) => {
  const { name, description, definition } = req.body;
  if (!name || !definition) return res.status(400).json({ error: "name and definition required" });
  const existing = findVisible(res, req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!canEdit(res, existing)) return res.status(403).json({ error: "This circuit is read-only" });

  const fullDef: CircuitDefinition = { ...definition, id: req.params.id, name };
  db.prepare(
    "UPDATE circuits SET name = ?, description = ?, definition = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(name, description ?? null, JSON.stringify(fullDef), req.params.id);

  res.json({ id: req.params.id, name });
});

router.delete("/:id", requireAuth, (req, res) => {
  const existing = findVisible(res, req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!canEdit(res, existing)) return res.status(403).json({ error: "This circuit is read-only" });
  db.prepare("DELETE FROM circuits WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

router.post("/:id/simulate", (req, res) => {
  if (!PRIMITIVES[req.params.id] && !findVisible(res, req.params.id)) {
    return res.status(404).json({ error: "Not found" });
  }

  // Load every circuit this viewer can see so composite circuits can resolve their sub-circuits.
  const visibleDefs = (
    db.prepare(`SELECT definition FROM circuits WHERE ${VISIBLE}`).all(viewerId(res)) as { definition: string }[]
  ).map((r) => JSON.parse(r.definition) as CircuitDefinition);

  // Bounded so one pathological circuit can't block the (single-threaded) server for everyone.
  // ~2s worst case; the largest starter circuit (32 bit counter) needs ~22k evaluations.
  const sim = new Simulator(visibleDefs, { maxEvaluations: 500_000 });
  try {
    const result = sim.simulate(
      req.params.id,
      req.body.inputs ?? {},
      req.body.state ?? {}
    );
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
