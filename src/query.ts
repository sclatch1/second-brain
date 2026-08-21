import "dotenv/config";
import { Pool } from "pg";
import pgvector from "pgvector/pg";
import Groq from "groq-sdk";
import { embed } from "./embed.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function retrieve(query: string, topK = 3) {
  const queryVector = await embed(query);

   const res = await pool.query(
    `SELECT content, source, embedding <=> $1 AS distance
     FROM documents
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [pgvector.toSql(queryVector), topK]
  );

  return res.rows;
}

async function ask(question: string) {
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
  throw new Error("No response from Groq");
  }

  return choice.message.content;
}

async function main() {
  const question = process.argv[2];
  if (!question) {
    console.error('Usage: tsx src/ask.ts "your question"');
    process.exit(1);
  }

  const answer = await ask(question);
  console.log("\nAnswer:\n", answer);

  await pool.end();
}

main().catch(console.error);