import express from "express";
import cors from "cors";
import circuitsRouter from "./routes/circuits.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());
app.use("/api/circuits", circuitsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
