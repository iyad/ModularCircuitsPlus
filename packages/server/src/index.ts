import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import circuitsRouter from "./routes/circuits.js";
import { authEnabled } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3001;
const isProduction = process.env.NODE_ENV === "production";

// In production the client is served from this same origin, so cross-origin access isn't needed.
if (!isProduction) app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api/circuits", circuitsRouter);

// Serve the built client (pnpm build) with SPA fallback.
const clientDist = path.join(__dirname, "../../client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const status = typeof err.status === "number" ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (auth ${authEnabled ? "enabled" : "disabled — local dev user"})`);
});
