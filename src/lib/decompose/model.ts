import { ApiError } from "../errors";
import { planSchema, type PlanInput } from "../validation";

/**
 * Decomposition by a language model through any OpenAI-compatible
 * chat-completions endpoint (Ollama, LM Studio, OpenAI, Gemini's and
 * Anthropic's compatibility endpoints). Configured entirely by environment
 * variables; the key never leaves the server.
 */

export interface ModelConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function modelConfig(
  env: Record<string, string | undefined> = process.env
): ModelConfig | null {
  const baseUrl = (env.LLM_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const model = (env.LLM_MODEL ?? "").trim();
  if (!baseUrl || !model) return null;
  return { baseUrl, model, apiKey: (env.LLM_API_KEY ?? "").trim() };
}

const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#9333ea", "#0284c7", "#ca8a04", "#db2777"];
const MAX_TASKS = 30;

export const SYSTEM_PROMPT = `You break a project into tasks for a time-aware personal project tracker.

Reply with one JSON object and nothing else:
{
  "tasks": [
    {
      "key": "T1",
      "title": "short imperative title",
      "description": "one or two sentences",
      "baseDurationMinutes": 60,
      "setupMinutes": 15,
      "takedownMinutes": 10,
      "unattendedMinutes": 0,
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT"
    }
  ],
  "dependencies": [
    { "from": "T1", "to": "T2", "type": "FS" | "SS" | "FF" | "SF", "lagMinutes": 0 }
  ]
}

Rules:
- 3 to 15 tasks. Each is something one person does in one sitting.
- baseDurationMinutes is hands-on, focused time only.
- setupMinutes is the time to get ready (gather tools, load context); takedownMinutes is the time to stop cleanly (clean up, save state). Be realistic, not zero.
- unattendedMinutes is time after the hands-on work when nothing needs the person: baking, drying, curing, a long download. The person can do other tasks during it. Use 0 when there is none.
- "from" must finish (FS) before "to" starts unless another type fits better. Only add dependencies that are real; independent tasks should not be chained.
- No dependency cycles. Every key in dependencies must be a task key.`;

export function userPrompt(prompt: string, targetDays?: number): string {
  return targetDays
    ? `${prompt}\n\nThe whole thing should fit in about ${targetDays} working day(s).`
    : prompt;
}

/** Finds the JSON object in a model reply (tolerates code fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" || typeof v === "string" ? v : undefined);

/**
 * Turns a model reply into a validated plan. Only whitelisted fields are taken
 * from the model, and the result must pass the same schema as any other plan.
 */
export function parseModelPlan(text: string): PlanInput {
  let raw: { tasks?: unknown; dependencies?: unknown };
  try {
    raw = extractJson(text) as typeof raw;
  } catch {
    throw new ApiError(502, "The model did not return a usable plan (no JSON found). Try again.");
  }
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks.slice(0, MAX_TASKS) : [];
  const rawDeps = Array.isArray(raw.dependencies) ? raw.dependencies : [];

  const candidate = {
    tasks: rawTasks.map((t: Record<string, unknown>, i: number) => ({
      tempKey: str(t?.key) ?? str(t?.tempKey) ?? `T${i + 1}`,
      title: str(t?.title)?.slice(0, 200),
      description: str(t?.description)?.slice(0, 5000),
      baseDurationMinutes: num(t?.baseDurationMinutes),
      setupMinutes: num(t?.setupMinutes) ?? 15,
      takedownMinutes: num(t?.takedownMinutes) ?? 10,
      unattendedMinutes: num(t?.unattendedMinutes) ?? 0,
      priority: str(t?.priority)?.toUpperCase(),
      color: COLORS[i % COLORS.length],
    })),
    dependencies: rawDeps.map((d: Record<string, unknown>) => ({
      predecessorKey: str(d?.from) ?? str(d?.predecessorKey),
      successorKey: str(d?.to) ?? str(d?.successorKey),
      type: str(d?.type)?.toUpperCase(),
      lagMinutes: num(d?.lagMinutes) ?? 0,
    })),
  };

  const parsed = planSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(
      502,
      `The model returned a plan that could not be used (${first.path.join(".")}: ${first.message}). Try again or rephrase.`
    );
  }
  return parsed.data;
}

export async function requestPlan(
  config: ModelConfig,
  prompt: string,
  targetDays?: number
): Promise<PlanInput> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(prompt, targetDays) },
        ],
      }),
    });
  } catch {
    throw new ApiError(502, "Could not reach the model endpoint (LLM_BASE_URL). Is it running?");
  }
  if (!res.ok) {
    // The body can contain account details; report only the status.
    throw new ApiError(502, `The model endpoint answered ${res.status}. Check LLM_BASE_URL, LLM_MODEL and LLM_API_KEY.`);
  }
  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ApiError(502, "The model returned an empty reply. Try again.");
  }
  return parseModelPlan(content);
}
