import 'dotenv/config';

async function embed(text: string) : Promise<number[]> {
    const response = await fetch(`${process.env.OLLAMA_URL}/api/embed`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },  
        body: JSON.stringify({ model: 'nomic-embed-text', input: text }),
    });
    const data = await response.json();
    console.log("Raw response:", JSON.stringify(data)); 
    return data.embedding;
}


try {
  const embedding = await embed("Hello, world!");
  console.log("Embedding:", embedding);
} catch (err) {
  console.error("Error generating embedding:", err);
}