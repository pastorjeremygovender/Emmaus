import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

// ─── POST /bible/ask-emmaus ──────────────────────────────────────────────────
// Body: { bookId, chapter, chapterHeading, messages: [{role, content}] }
// Streams back SSE events: data: {"content":"..."}\n\n or data: {"done":true}\n\n

router.post("/bible/ask-emmaus", async (req, res) => {
  const apiKey = process.env["OPENAI_API_KEY"];
  const baseUrl = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];

  if (!apiKey) {
    res.status(503).json({
      error: "AI_NOT_CONFIGURED",
      message: "Ask Emmaus requires an OpenAI API key. Add OPENAI_API_KEY to your Replit Secrets.",
    });
    return;
  }

  const { bookId, chapter, chapterHeading, messages } = req.body as {
    bookId?: string;
    chapter?: number;
    chapterHeading?: string;
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const systemPrompt = [
    "You are Emmaus — a warm, Bible-grounded guide that walks alongside people as they read Scripture.",
    "Your role is like a trusted friend who knows the Bible well: you help people understand what they're reading, connect it to their lives, and encounter Jesus more deeply.",
    "Keep your answers brief, warm, and grounded in the text. Avoid jargon. Never lecture.",
    chapterHeading && bookId && chapter
      ? `The user is reading ${capitalize(bookId)} ${chapter}: "${chapterHeading}".`
      : "",
    "When you quote Scripture, cite it. When you have no answer, say so honestly.",
    "Do not generate lengthy essays. Aim for 2–4 short paragraphs at most.",
  ].filter(Boolean).join(" ");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Use fetch to call OpenAI (no SDK dependency required)
    const openAiBaseUrl = baseUrl ?? "https://api.openai.com/v1";
    const response = await fetch(`${openAiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error({ status: response.status, errorText }, "OpenAI request failed");
      res.write(`data: ${JSON.stringify({ error: "AI request failed", status: response.status })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "Ask Emmaus error");
    res.write(`data: ${JSON.stringify({ error: "Internal error" })}\n\n`);
    res.end();
  }
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default router;
