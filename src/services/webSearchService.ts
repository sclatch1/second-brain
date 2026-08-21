import { tavily } from '@tavily/core';
import 'dotenv/config';

const tavilyApiKey = process.env.TAVILY_API_KEY;
if (!tavilyApiKey) {
  throw new Error('TAVILY_API_KEY environment variable is not set');
}

const tavilyClient = tavily({ apiKey: tavilyApiKey });

export async function searchWeb(query: string): Promise<string> {
  const response = await tavilyClient.search(query, {
    maxResults: 3,
  });

  if (!response.results || response.results.length === 0) {
    return 'No web results found.';
  }

  return response.results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`)
    .join('\n\n');
}
