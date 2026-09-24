/**
 * GET /api/models — the switcher's options.
 *
 * The browser's only view of the catalogue, and a deliberately narrow one:
 * `listModels()` returns ids, labels, a note and a `configured` flag, and the
 * public entry type has nowhere to put a key or a base URL. Those stay in
 * `lib/jev/models.ts`, on the server, where the decide route reads them.
 *
 * `force-dynamic` because the answer depends on the process environment, which
 * may be edited between two requests.
 */

import { NextResponse } from "next/server";

import { listModels } from "@/lib/jev/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(listModels());
}
