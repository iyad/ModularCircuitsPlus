import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Override with DB_PATH in production so deploys never overwrite the live database in the repo checkout.
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../../circuits.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS circuits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    definition TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// owner_id NULL marks a circuit as part of the shared, read-only starter library.
const columns = db.prepare("PRAGMA table_info(circuits)").all() as { name: string }[];
if (!columns.some((c) => c.name === "owner_id")) {
  db.exec("ALTER TABLE circuits ADD COLUMN owner_id TEXT");
}
db.exec("CREATE INDEX IF NOT EXISTS circuits_owner ON circuits(owner_id)");

export default db;
