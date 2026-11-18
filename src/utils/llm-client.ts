import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const CACHE_PATH = path.join(__dirname, "../../data/cache/llm-replies.json");

interface CacheStore {
  [hash: string]: string;
}

let memoryCache: CacheStore | null = null;

function loadCache(): CacheStore {
  if (memoryCache !== null) return memoryCache;
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const raw = fs.readFileSync(CACHE_PATH, "utf-8");
      memoryCache = JSON.parse(raw);
      return memoryCache!;
    } catch {
      memoryCache = {};
    }
  } else {
    memoryCache = {};
  }
  return memoryCache!;
}

function saveToCache(hash: string, text: string): void {
  const cache = loadCache();
  cache[hash] = text;
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Creates a unique deterministic hash for caching.
 */
export function hashPrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt.trim()).digest("hex").slice(0, 16);
}

/**
 * Call Gemini API using native fetch.
 */
async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error [${response.status}]: ${errText}`);
  }

  const data = (await response.json()) as any;
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) {
    throw new Error("Gemini returned empty candidate response.");
  }

  return reply.trim();
}

/**
 * Call Groq API using native fetch.
 */
async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error [${response.status}]: ${errText}`);
  }

  const data = (await response.json()) as any;
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error("Groq returned empty completion response.");
  }

  return reply.trim();
}

/**
 * Main LLM invocation with multi-provider fallback and local response caching.
 */
export async function callLlmWithCache(
  prompt: string,
  cacheKey?: string,
  fallbackReply?: string
): Promise<{ text: string; source: "cache" | "gemini" | "groq" | "fallback" }> {
  const key = cacheKey || hashPrompt(prompt);
  const cache = loadCache();

  // 1. Check local cache first
  if (cache[key]) {
    return { text: cache[key]!, source: "cache" };
  }

  // 2. Try Gemini API
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const generated = await callGemini(geminiKey, prompt);
      saveToCache(key, generated);
      return { text: generated, source: "gemini" };
    } catch (err: any) {
      console.warn(`[Warning] Gemini API call failed: ${err.message}. Trying next provider...`);
    }
  }

  // 3. Try Groq API
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      const generated = await callGroq(groqKey, prompt);
      saveToCache(key, generated);
      return { text: generated, source: "groq" };
    } catch (err: any) {
      console.warn(`[Warning] Groq API call failed: ${err.message}. Falling back...`);
    }
  }

  // 4. Grounded Fallback (when running offline / without API keys)
  const defaultText =
    fallbackReply ||
    "Hi there! Thanks for reaching out. We're looking into this — check your settings and let us know if you need more help /Spotify";

  saveToCache(key, defaultText);
  return { text: defaultText, source: "fallback" };
}
