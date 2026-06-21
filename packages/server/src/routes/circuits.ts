import { Router } from "express";
import db from "../db.js";
import { Simulator, PRIMITIVES } from "@mcp/core";
import type { CircuitDefinition } from "@mcp/core";
import { randomUUID } from "crypto";

const router = Router();

router.get("/", (_req, res) => {
  const rows = db
    .prepare("SELECT id, name, description, created_at, updated_at FROM circuits ORDER BY updated_at DESC")
    .all();
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM circuits WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ ...row, definition: JSON.parse(row.definition) });
});

router.post("/", (req, res) => {
  const { name, description, definition } = req.body as {
    name: string;
    description?: string;
    definition: Omit<CircuitDefinition, "id" | "name">;
  };
  if (!name || !definition) return res.status(400).json({ error: "name and definition required" });

  const id = randomUUID();
  const fullDef: CircuitDefinition = { id, name, description, ...definition };

  db.prepare(
    "INSERT INTO circuits (id, name, description, definition) VALUES (?, ?, ?, ?)"
  ).run(id, name, description ?? null, JSON.stringify(fullDef));

  res.status(201).json({ id, name });
});

router.put("/:id", (req, res) => {
  const { name, description, definition } = req.body;
  const existing = db.prepare("SELECT id FROM circuits WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const fullDef: CircuitDefinition = { ...definition, id: req.params.id, name };
  db.prepare(
    "UPDATE circuits SET name = ?, description = ?, definition = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(name, description ?? null, JSON.stringify(fullDef), req.params.id);

  res.json({ id: req.params.id, name });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM circuits WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

router.post("/:id/simulate", (req, res) => {
  const row = db.prepare("SELECT definition FROM circuits WHERE id = ?").get(req.params.id) as any;
  if (!row && !PRIMITIVES[req.params.id]) {
    return res.status(404).json({ error: "Not found" });
  }

  const allDefs = (db.prepare("SELECT definition FROM circuits").all() as any[]).map(
    (r) => JSON.parse(r.definition) as CircuitDefinition
  );

  const sim = new Simulator(allDefs);
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
