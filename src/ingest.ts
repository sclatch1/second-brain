import "dotenv/config";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { Pool } from "pg";
import pgvector from "pgvector/pg";
import { embed } from "./embed.js";
import { PDFParse } from "pdf-parse";
import { chunkText } from "./retrieval.js";


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});




export async function extractText(filename: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  if (ext === ".pdf") {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return cleanPdfText(result.text);
  }

  return buffer.toString("utf-8");
}

function cleanPdfText(text: string): string {
  return text.replace(/-- \d+ of \d+ --/g, "").trim();
}

async function ingestFile(filePath: string) {
    const buffer = await readFile(filePath);          // read raw bytes
    const filename = path.basename(filePath);
    const content = await extractText(filename, buffer);

    const chunks = chunkText(content);
    for (const chunk of chunks) {
        const embedding = await embed(chunk);
        await pool.query(
          `INSERT INTO documents (content, embedding, source) VALUES ($1, $2, $3)`,
          [chunk, pgvector.toSql(embedding), filename]
        );
        console.log(`Inserted chunk from ${filename} (${chunk.length} characters) into database.`);
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