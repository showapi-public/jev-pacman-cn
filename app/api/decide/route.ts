/**
 * POST /api/decide — the only place a TypeSafe API key is used.
 *
 * The route knows no game. The browser sends a system prompt, a list of legal
 * actions and a fact table; this route turns the table into a Choice question,
 * asks the model the caller named (or the server's default), and returns the
 * answer with the model that produced it. When JEV_MOCK=true it answers without
 * network access so the whole pipeline can be exercised with no key at all.
 *
 * Which credentials an answer costs is decided by `lib/jev/models.ts`; this file
 * only wires the catalogue entry into the SDK call.
 */

import { NextResponse } from "next/server";
import {
  APIError,
  APIConnectionError,
  APITimeoutError,
  TypeSafeClient,
  choice,
  type EntryType,
} from "@typesafe-ai/sdk";

import type { FactRow } from "@/lib/agent/types";
import { buildCriteria, QUESTION_ID } from "@/lib/jev/prompt";
import { resolveModel } from "@/lib/jev/models";
import type { ModelEntry } from "@/lib/jev/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One client per credential set.
 *
 * The catalogue itself is re-read on every request; only the SDK handle is kept,
 * and only for as long as it still matches the configuration that produced it —
 * the fingerprint includes the key, so a rotation rebuilds rather than reusing a
 * client that would be silently pointing at the old account.
 */
let cached: { fingerprint: string; client: TypeSafeClient } | null = null;

function clientFor(entry: ModelEntry): TypeSafeClient {
  const fingerprint = [entry.apiKey, entry.baseURL, entry.model].join("\u0000");
  if (cached?.fingerprint === fingerprint) return cached.client;

  const client = new TypeSafeClient({
    apiKey: entry.apiKey ?? undefined,
    baseURL: entry.baseURL ?? undefined,
    defaultModel: entry.model ?? undefined,
    timeout: Number(process.env.JEV_TIMEOUT_MS) || 2000,
    // A retried decision is a stale decision: fail fast and let the game ask again.
    retry: { maxRetries: 0 },
  });
  cached = { fingerprint, client };
  return client;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "JSON 请求体无法解析");
  }

  const decisionId = typeof body?.decisionId === "string" ? body.decisionId : null;
  const modelId = typeof body?.modelId === "string" ? body.modelId : null;
  const actions = Array.isArray(body?.actions)
    ? (body.actions as unknown[]).filter((action): action is string => typeof action === "string" && action.length > 0)
    : [];
  const instructions = typeof body?.instructions === "string" ? body.instructions : null;
  const state = body?.state;
  const facts = parseFacts(body?.facts);

  if (!decisionId) return fail(400, "bad_request", "缺少 decisionId");
  if (actions.length === 0) return fail(400, "bad_request", "没有任何合法动作");
  if (typeof state !== "object" || state === null) return fail(400, "bad_request", "缺少 state");
  if (!instructions) return fail(400, "bad_request", "缺少 instructions");
  if (facts.length === 0) return fail(400, "bad_request", "缺少 facts");

  if (process.env.JEV_MOCK === "true") {
    const action = mockChoice(decisionId, actions);
    return NextResponse.json({
      decisionId,
      action,
      confidence: null,
      probabilities: { [action]: 1 },
      latencyMs: 0,
      model: "mock",
    });
  }

  const entry = resolveModel(modelId);
  // An id that names nothing is a configuration error, not a reason to quietly
  // ask some other model than the caller chose.
  if (!entry) return fail(400, "bad_request", `没有这个模型条目：${modelId ?? ""}`);
  if (!entry.apiKey) {
    return fail(503, "no_api_key", `模型条目「${entry.label}」没有可用的 API Key（TYPESAFE_API_KEY 与 JEV_MODELS 里都没有）`);
  }

  const criteria = buildCriteria(facts, actions);

  const started = performance.now();
  try {
    const { data, requestId } = await clientFor(entry)
      .systemOne({
        state: state as EntryType,
        questions: { [QUESTION_ID]: choice(instructions, criteria) },
      })
      .withResponse();

    const answer = (data.answers as Record<string, any>)[QUESTION_ID];
    const action = answer?.choice;

    if (typeof action !== "string" || !actions.includes(action)) {
      return fail(502, "invalid", `模型给出的答案是 ${String(action)}，不在合法动作之内`);
    }

    return NextResponse.json({
      decisionId,
      action,
      confidence: typeof answer.confidence === "number" ? answer.confidence : null,
      probabilities: answer.probabilities ?? {},
      latencyMs: performance.now() - started,
      model: data.model ?? entry.model ?? null,
      modelId: entry.id,
      requestId,
    });
  } catch (error) {
    const latencyMs = performance.now() - started;
    const kind =
      error instanceof APITimeoutError
        ? "timeout"
        : error instanceof APIConnectionError
          ? "connection"
          : error instanceof APIError
            ? error.status === 429
              ? "rate_limited"
              : `http_${error.status}`
            : "unknown";
    const status = error instanceof APIError ? error.status : undefined;
    return NextResponse.json(
      {
        error: {
          kind,
          status,
          message: error instanceof Error ? error.message : String(error),
        },
        latencyMs,
      },
      { status: 502 },
    );
  }
}

function fail(status: number, kind: string, message: string): NextResponse {
  return NextResponse.json({ error: { kind, message } }, { status });
}

/**
 * Keep the rows that carry a label, a model label and a value per action; drop
 * anything else. A malformed row must not become a half-rendered prompt.
 */
function parseFacts(value: unknown): FactRow[] {
  if (!Array.isArray(value)) return [];
  const rows: FactRow[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label : "";
    const modelLabel = typeof row.modelLabel === "string" ? row.modelLabel : "";
    if (!label.trim() || !modelLabel.trim()) continue;
    if (typeof row.values !== "object" || row.values === null) continue;

    const values: Record<string, string> = {};
    for (const [action, text] of Object.entries(row.values as Record<string, unknown>)) {
      if (typeof text === "string") values[action] = text;
    }
    rows.push({ label, modelLabel, values });
  }
  return rows;
}

/**
 * Deterministic stand-in answer: exercises the pipeline, plays no game.
 *
 * It hashes the actions in the order they arrived rather than reordering them by
 * any game's convention — the server has no convention of its own, and a mock
 * that needed one would break the moment a game offered a different set.
 */
function mockChoice(decisionId: string, actions: readonly string[]): string {
  let hash = 2166136261;
  for (let index = 0; index < decisionId.length; index += 1) {
    hash ^= decisionId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return actions[Math.abs(hash) % actions.length];
}
