import { describe, expect, it } from "vitest";

import { controllerStatus, decideErrorLabel, formatLatency, formatMs, formatPercent, formatValue } from "@/lib/ui";

/**
 * The failure vocabulary.
 *
 * /api/decide reports an HTTP failure as `http_<status>` and a rate limit as
 * `rate_limited`; neither was in the label map, so both used to reach the pill as
 * a bare "离线". Naming the failure is the pill's whole job, so it is pinned here.
 */
describe("decideErrorLabel", () => {
  it("names the kinds /api/decide actually emits", () => {
    expect(decideErrorLabel("no_api_key")).toBe("未配置 API Key");
    expect(decideErrorLabel("timeout")).toBe("请求超时");
    expect(decideErrorLabel("connection")).toBe("连接失败");
    expect(decideErrorLabel("rate_limited")).toBe("被限流");
    expect(decideErrorLabel("bad_request")).toBe("请求体不合法");
    expect(decideErrorLabel("invalid")).toBe("答案不可用");
  });

  it("keeps the status code for the open-ended http_<status> kinds", () => {
    expect(decideErrorLabel("http_429")).toBe("Jev 返回 429");
    expect(decideErrorLabel("http_500")).toBe("Jev 返回 500");
    expect(decideErrorLabel("http_502")).toBe("Jev 返回 502");
  });

  it("returns null for nothing known, so the caller can pick its own word", () => {
    expect(decideErrorLabel(null)).toBeNull();
    expect(decideErrorLabel(undefined)).toBeNull();
    expect(decideErrorLabel("a_kind_from_the_future")).toBeNull();
  });
});

describe("controllerStatus", () => {
  it("does not lose the reason when the failure is a server error", () => {
    // The regression this pins: a 500 used to render as the generic "离线".
    expect(controllerStatus({ status: "OFFLINE", lastError: { kind: "http_500" } })).toEqual({
      label: "Jev 返回 500",
      tone: "bad",
    });
    expect(controllerStatus({ status: "OFFLINE", lastError: { kind: "rate_limited" } }).label).toBe("被限流");
  });

  it("still falls back to 离线 when there is no kind to name", () => {
    expect(controllerStatus({ status: "OFFLINE", lastError: null }).label).toBe("离线");
    expect(controllerStatus({ status: "OFFLINE", lastError: { kind: "mystery" } }).label).toBe("离线");
  });

  it("names the healthy states too", () => {
    expect(controllerStatus({ status: "REQUESTING", lastError: null }).label).toBe("正在询问 Jev");
    expect(controllerStatus({ status: "READY", lastError: null })).toEqual({ label: "答案已到手", tone: "live" });
    expect(controllerStatus({ status: "MANUAL", lastError: null }).label).toBe("手动驾驶");
  });
});

/**
 * The empty state is the first thing anyone sees. The panel passes NaN in on
 * purpose — `formatLatency(metrics.meanLatencyMs ?? Number.NaN)` — so "no
 * measurements yet" has to render as an em dash and never as "NaN ms".
 */
describe("formatters degrade to an em dash, never to NaN", () => {
  it("absorbs every flavour of nothing", () => {
    for (const missing of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatLatency(missing)).toBe("—");
      expect(formatPercent(missing)).toBe("—");
      expect(formatValue(missing)).toBe("—");
    }
    // formatMs takes a plain `number`: it is only ever handed a real duration
    // (playTimeMs), so its guard covers non-finite values rather than nullish
    // ones. It is the odd one out among the four, and tsc enforces that.
    expect(formatMs(Number.NaN)).toBe("—");
    expect(formatMs(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatMs(0)).toBe("0 ms");
  });

  it("keeps latency in milliseconds until a second, then changes unit", () => {
    expect(formatLatency(0)).toBe("0 ms");
    expect(formatLatency(499.6)).toBe("500 ms");
    expect(formatLatency(999)).toBe("999 ms");
    expect(formatLatency(1000)).toBe("1.0 s");
    expect(formatLatency(1489)).toBe("1.5 s"); // the real model's own latency, measured live
  });

  it("renders a fraction as a percentage", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.756, 1)).toBe("75.6%");
  });
});
