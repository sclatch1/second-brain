import "dotenv/config";
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import pgvector from "pgvector/pg";
import Groq from "groq-sdk";
import { embed } from "./embed.js";
import { retrieve, chunkText } from "./retrieval.js";
import { runAgent } from "./agent.js";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { extractText } from "./ingest.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const agentRequestSchema = z.object({
  question: z.string().min(1).max(200),
});

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,           // your deployed Vercel URL
  "http://localhost:5173",             // local Vite dev server
].filter((origin): origin is string => Boolean(origin));


app.use(cors({ origin: allowedOrigins }));


app.use(express.json());
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                  // limit each IP to 30 requests per window
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);


app.post("/api/query", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "question is required" });

    const chunks = await retrieve(question);
    const context = chunks
      .map((c, i) => `[${i + 1}] (source: ${c.source})\n${c.content}`)
      .join("\n\n");

    const prompt = `You are a helpful assistant answering questions based on the user's personal notes.
Use ONLY the context below to answer. If the answer isn't in the context, say so.

Context:
${context}

Question: ${question}

Answer:`;

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: prompt }],
    });
    const choice = completion.choices[0];
    if (!choice || !choice.message.content) {
      return res.status(502).json({ error: "No response from model" });
    }

    res.json({
      answer: choice.message.content,
      sources: chunks.map((c) => c.source),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/api/agent", async (req, res) => {

    const parseResult = agentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request body", details: parseResult.error });
    }
    
    const { question } = parseResult.data;
    try {
    const result = await runAgent(question);
    res.json(result);
    } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Groqer failed to respond" });
  }
});


function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB cap



app.post("/api/ingest", requireAuth, upload.single("file"), async (req, res) => {


  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }


  const content = await extractText(req.file.originalname, req.file.buffer);
  const source = req.file.originalname;

  try {
    const chunks = chunkText(content);
    let insertedCount = 0;

    for (const chunk of chunks) {
      const embedding = await embed(chunk);
      await pool.query(
        `INSERT INTO documents (content, embedding, source) VALUES ($1, $2, $3)`,
        [chunk, pgvector.toSql(embedding), source || "unknown"]
      );
      insertedCount++;
    }
   res.json({ status: "ok", chunksInserted: insertedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ingestion failed" });
  }
});


app.post("/api/login", async (req, res) => {
  const { password } = req.body;

  if (!password) return res.status(400).json({ error: "Password required" });

  const isValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH!);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET!, { expiresIn: "7d" });
  res.json({ token });
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));