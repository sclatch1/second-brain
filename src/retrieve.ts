import "dotenv/config";
import { Pool } from "pg";
import pgvector from "pgvector/pg";
import { embed } from "./embed.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function retrieve(query: string, topK = 3) {
  const queryVector = await embed(query);

  const res = await pool.query(
    `SELECT id, content, source, embedding <=> $1 AS distance
     FROM documents
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [pgvector.toSql(queryVector), topK]
  );

  return res.rows;
}


async function main() {
  const question = process.argv[2];
  if (!question) {
    console.error("Usage: tsx src/retrieve.ts \"your question\"");
    process.exit(1);
  }

  const results = await retrieve(question);
   console.log("Number of results:", results.length); // add this temporarily
  for (const row of results) {
    console.log(`\n[${row.source}] (distance: ${row.distance.toFixed(4)})`);
    console.log(row.content);
  }

  await pool.end();
}

main().catch(console.error);