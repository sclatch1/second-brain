import "dotenv/config";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { Pool } from "pg";
import pgvector from "pgvector/pg";
import { embed } from "./embed.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function chunkText(text: string, maxLength: number = 500): string[] {
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

async function ingestFile(filePath: string) {
    const content = await readFile(filePath, "utf-8");
    const chunks = chunkText(content);
    for (const chunk of chunks) {
        const embedding = await embed(chunk);
        await pool.query(
        `INSERT INTO documents (content, embedding, source) VALUES ($1, $2, $3)`,
        [chunk, pgvector.toSql(embedding), path.basename(filePath)]
        );
        console.log(`Inserted chunk from ${filePath} (${chunk.length} characters) into database.`);
    }
}

async function main() {
  const dir = "data/notes";
  const files = await readdir(dir);

  for (const file of files) {
    await ingestFile(path.join(dir, file));
  }

  console.log("Ingestion complete.");
  await pool.end();
}

main().catch(err => {
  console.error("Error during ingestion:", err);
  process.exit(1);
});