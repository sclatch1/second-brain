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


export function chunkText(text: string, maxLength: number = 500): string[] {
    const paragrpaphs = text.split(/\n\s*\n/); // split on blank lines    
    const chunks: string[] = [];
    let currentChunk = "";

    for (const paragraph of paragrpaphs) {
        if ((currentChunk + paragraph).length > maxLength && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph + '\n\n';
        } else {
            currentChunk += paragraph + '\n\n';
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
}
