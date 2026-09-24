/**
 * POST /api/decide — the only place the TypeSafe API key is used.
 *
 * The browser sends the observation it built; this route turns the legal
 * directions into a Choice question, asks Jev, and returns the answer with the
 * model that produced it. When JEV_MOCK=true it answers without network access
 * so the whole pipeline can be exercised with no key at all.
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

import type { CandidateAnalysis } from "@/lib/games/pacman/analysis";
import { DIRECTION_ORDER } from "@/lib/games/pacman/types";
import type { Direction } from "@/lib/games/pacman/types";
import { isDirection } from "@/lib/jev/validation";
import { DECISION_INSTRUCTIONS, QUESTION_ID, buildCriteria } from "@/lib/jev/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let client: TypeSafeClient | null = null;

function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY,
    baseURL: process.env.TYPESAFE_BASE_URL || undefined,
    defaultModel: process.env.TYPESAFE_DEFAULT_MODEL || undefined,
    timeout: Number(process.env.JEV_TIMEOUT_MS) || 2000,
    // A retried decision is a stale decision: fail fast and let the game ask again.
    retry: { maxRetries: 0 },
  });
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
  const legalDirections = Array.isArray(body?.legalDirections)
    ? (body.legalDirections as unknown[]).filter(isDirection)
    : [];
  const observation = body?.observation;

  if (!decisionId) return fail(400, "bad_request", "缺少 decisionId");
  if (legalDirections.length === 0) return fail(400, "bad_request", "没有任何合法方向");
  if (typeof observation !== "object" || observation === null) return fail(400, "bad_request", "缺少 observation");

  if (process.env.JEV_MOCK === "true") {
    const direction = mockChoice(decisionId, legalDirections);
    return NextResponse.json({
      decisionId,
      direction,
      confidence: null,
      probabilities: { [direction]: 1 },
      latencyMs: 0,
      model: "mock",
    });
  }

  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    return fail(503, "no_api_key", "未设置 TYPESAFE_API_KEY（参见 .env.example）");
  }

  const candidates = (observation.candidates ?? {}) as Partial<Record<Direction, CandidateAnalysis>>;
  const criteria = buildCriteria(candidates, legalDirections);
  if (Object.keys(criteria).length === 0) {
    return fail(400, "bad_request", "observation 未携带任何候选事实");
  }

  const started = performance.now();
  try {
    const { data, requestId } = await getClient()
      .systemOne({
        state: observation as EntryType,
        questions: { [QUESTION_ID]: choice(DECISION_INSTRUCTIONS, criteria) },
      })
      .withResponse();

    const answer = (data.answers as Record<string, any>)[QUESTION_ID];
    const direction = answer?.choice;

    if (!isDirection(direction)) {
      return fail(502, "invalid", `Jev 给出的答案是 ${String(direction)}，不是一个方向`);
    }

    return NextResponse.json({
      decisionId,
      direction,
      confidence: typeof answer.confidence === "number" ? answer.confidence : null,
      probabilities: answer.probabilities ?? {},
      latencyMs: performance.now() - started,
      model: data.model ?? null,
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

/** Deterministic stand-in answer: exercises the pipeline, plays no game. */
function mockChoice(decisionId: string, legalDirections: Direction[]): Direction {
  let hash = 2166136261;
  for (let index = 0; index < decisionId.length; index += 1) {
    hash ^= decisionId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const ordered = DIRECTION_ORDER.filter((direction) => legalDirections.includes(direction));
  const pool = ordered.length > 0 ? ordered : legalDirections;
  return pool[Math.abs(hash) % pool.length];
}
