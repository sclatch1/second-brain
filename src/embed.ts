import 'dotenv/config';

export async function embed(text: string) : Promise<number[]> {
    const response = await fetch(`${process.env.OLLAMA_URL}/api/embed`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },  
        body: JSON.stringify({ model: 'nomic-embed-text', input: text }),
    });
    const data = await response.json();
    return data.embeddings[0];
}