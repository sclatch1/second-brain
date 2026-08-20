import "dotenv/config";
import Groq from "groq-sdk";
import { retrieve } from "./retrieval.js";


const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const tools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_notes",
      description:
        "Search the user's personal notes for information relevant to a query. Use this whenever the question might be answered by the user's own notes.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query — can be a rephrased or focused version of the user's question",
          },
        },
        required: ["query"],
      },
    },
  },
];

async function executeToolCall(name: string, args: any): Promise<string> {
    if (name === "search_notes") {
        const results = await retrieve(args.query);
        if (results.length === 0) {
            return "No relevant notes found.";
        }
        const context = results
            .map((c, i) => `[${i + 1}] (source: ${c.source})\n${c.content}`)
            .join("\n\n");
        return `Found the following relevant notes:\n\n${context}`;
    } else {
        throw new Error(`Unknown tool: ${name}`);
    }
}

export async function runAgent(question: string): Promise<{ answer: string; toolsUsed: {name: string, args: any}[]}> {
    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: "You are a helpful assistant that answers questions based on the user's personal notes." },
        { role: "user", content: question },
    ];

    const toolsUsed: {name: string, args: any}[] = [];
    const MAX_ITERATIONS = 5;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const completion = await groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages,
            tools,
        });

        const choice = completion.choices[0];
        if (!choice || !choice.message) {
            throw new Error("No response from model");
        }

        const message = choice.message;
        messages.push(message);

        if (!message.tool_calls || message.tool_calls.length === 0) {
            // Final answer — no more tools requested
            return {
                answer: message.content || "No answer generated.",
                toolsUsed,
            };
         }

        // Execute the tool calls
        for (const toolCall of message.tool_calls) {
            const args = JSON.parse(toolCall.function.arguments);
            toolsUsed.push({ name: toolCall.function.name, args });

            console.log(`[agent] calling tool: ${toolCall.function.name}(${JSON.stringify(args)})`);

            const result = await executeToolCall(toolCall.function.name, args);

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
            });
        }
    // loop continues — model sees tool results, decides next step
    }
    throw new Error("Agent exceeded max iterations without a final answer");

}
