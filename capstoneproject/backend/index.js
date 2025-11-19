// backend/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { generateReport } from "./prediction.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/predict", async (req, res) => {
  try {
    console.log("🔍 POST /predict request received");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    const report = await generateReport(req.body);
    res.json({ report });
  } catch (err) {
    console.error("Error in /predict:", err);
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
