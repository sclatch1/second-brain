import "dotenv/config";
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import pgvector from "pgvector/pg";
import Groq from "groq-sdk";
import { embed } from "./embed.js";
import { retrieve } from "./retrieval.js";
import { runAgent } from "./agent.js";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });



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
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    const result = await runAgent(question);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Agent failed to respond" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));