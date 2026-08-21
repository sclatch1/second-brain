import 'dotenv/config';

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-embedding-001',
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );
  const data = await res.json();
  return data.embedding.values;
}
