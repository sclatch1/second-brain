import "dotenv/config";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { Pool } from "pg";
import pgvector from "pgvector/pg";
import { embed } from "./embed.js";
import { PDFParse } from "pdf-parse";


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});




async function extractText(filepath: string): Promise<string> {
  const extension = path.extname(filepath).toLowerCase();

  if (extension === ".pdf") {
    const buffer = await readFile(filepath);
    const data = new PDFParse({ data: buffer });
    const result = await data.getText();
    return cleanPdfText(result.text);
  }

  // fallback: treat as plain text (md, txt, etc.)
  return readFile(filepath, "utf-8");
}

function cleanPdfText(text: string): string {
  return text.replace(/-- \d+ of \d+ --/g, "").trim();
}


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
    const content = await extractText(filePath);
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