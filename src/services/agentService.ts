import "dotenv/config";
import Groq from "groq-sdk";
import { retrieve } from "../retrieval.js";
import { searchWeb } from "./webSearchService.js";


const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });



const tools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "Search the user's personal notes for information relevant to a query. Use this whenever the question might be answered by the user's own notes.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the live web for current information. Use this when the user's notes don't cover the topic, or when the question needs up-to-date information not likely to be in personal notes (news, current events, recent facts).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
];

async function executeToolCall(name: string, args: any): Promise<{ result: string; resultSources: string[] }> {
    if (name === "search_notes") {
        const results = await retrieve(args.query);
        if (results.length === 0) {
        return { result: "No relevant notes found.", resultSources: [] };
        }
        const result = results
        .map((r, i) => `[${i + 1}] (source: ${r.source})\n${r.content}`)
        .join("\n\n");
        const resultSources = results.map((r) => r.source);
        return { result, resultSources };
    }

    if (name === "search_web") {
        const result = await searchWeb(args.query);
        return { result, resultSources: [] }; // web results have URLs already inline in the text
    }

    return { result: `Unknown tool: ${name}`, resultSources: [] };
}

export async function runAgent(userQuestion: string): Promise<{
  answer: string;
  toolCallsUsed: { name: string; args: any }[];
  sources: string[];
}> {
    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content:
                "You are a helpful assistant with access to the user's personal notes (search_notes) and live web search (search_web). Prefer the user's notes when relevant, and use web search for anything current or not covered in their notes. If neither source has the answer, say so honestly rather than making things up. \
                CRITICAL: for ALL mathematical notation, you MUST use dollar-sign delimiters only: $...$ for inline math (e.g. $x^2$) and $$...$$ for block/display math (e.g. $$\\sum_i p_i$$). Never use \\(...\\), \\[...\\], or plain brackets/parentheses for math. Never use \\boxed{}.",
        },
        { role: "user", content: userQuestion },
    ];

    const toolCallsUsed: { name: string; args: any }[] = [];
    const sources: Set<string> = new Set(); // Set avoids duplicate filenames
    const MAX_ITERATIONS = 5;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages,
        tools,
        tool_choice: "auto",
        });

        const choice = completion.choices[0];
        if (!choice) throw new Error("No response from model");

        const responseMessage = choice.message;
        messages.push(responseMessage);

        if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        return {
            answer: responseMessage.content || "No answer generated.",
            toolCallsUsed,
            sources: Array.from(sources),
        };
        }

        for (const toolCall of responseMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        toolCallsUsed.push({ name: toolCall.function.name, args });

        const { result, resultSources } = await executeToolCall(toolCall.function.name, args);
        resultSources.forEach((s) => sources.add(s));

        messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
        });
        }
    }

    throw new Error("Agent exceeded max iterations without a final answer");
}
