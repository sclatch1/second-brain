import { runAgent } from "../services/agentService.js";
import { z } from "zod";
import express from "express";


const agentRequestSchema = z.object({
  question: z.string().min(1).max(200),
});


export const agentRoutes: express.Router = express.Router();

agentRoutes.post("/", async (req, res) => {

    const parseResult = agentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid request body", details: parseResult.error });
    }
    
    const { question } = parseResult.data;
    try {
    const result = await runAgent(question);
    res.json(result);
    } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Groqer failed to respond" });
  }
});