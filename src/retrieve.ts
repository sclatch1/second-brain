import "dotenv/config";
import { Pool } from "pg";
import pgvector from "pgvector/pg";
import { embed } from "./embed.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function retrieve(query: string, topK = 3) {
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
