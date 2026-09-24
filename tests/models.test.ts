import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_MODEL_ID, listModels, resolveModel } from "@/lib/jev/models";

/**
 * The catalogue is the one place in the app that holds credentials, so it is
 * tested twice over: once for what it parses, and once — the half that actually
 * matters — for what it refuses to hand back.
 */

const MANAGED = [
  "JEV_MODELS",
  "JEV_DEFAULT_MODEL",
  "TYPESAFE_BASE_URL",
  "TYPESAFE_API_KEY",
  "TYPESAFE_DEFAULT_MODEL",
] as const;

type Managed = (typeof MANAGED)[number];

const saved = new Map<Managed, string | undefined>();

beforeEach(() => {
  for (const key of MANAGED) saved.set(key, process.env[key]);
});

afterEach(() => {
  for (const key of MANAGED) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Replace the whole environment the catalogue reads, so no test inherits another's. */
function setEnv(values: Partial<Record<Managed, string>>): void {
  for (const key of MANAGED) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key as Managed] = value;
}

const KEY = "sk-live-abcdef123456";
const BASE = "https://gateway.internal.example/v1";

describe("没有 JEV_MODELS 时", () => {
  it("就是今天这份 .env.local 描述的那一条", () => {
    setEnv({
      TYPESAFE_API_KEY: KEY,
      TYPESAFE_BASE_URL: BASE,
      TYPESAFE_DEFAULT_MODEL: "jev-latest",
    });

    const catalogue = listModels();
    expect(catalogue.default).toBe(DEFAULT_MODEL_ID);
    expect(catalogue.models).toEqual([
      { id: DEFAULT_MODEL_ID, label: "jev-latest", note: "jev-latest", configured: true },
    ]);
    expect(resolveModel(null)).toEqual({
      id: DEFAULT_MODEL_ID,
      label: "jev-latest",
      baseURL: BASE,
      apiKey: KEY,
      model: "jev-latest",
    });
  });

  it("连模型名都没有时，条目叫「默认模型」", () => {
    setEnv({ TYPESAFE_API_KEY: KEY });
    expect(listModels().models[0]).toEqual({
      id: DEFAULT_MODEL_ID,
      label: "默认模型",
      note: "",
      configured: true,
    });
  });

  it("找不到 key 时标记为未配置，而不是把它藏起来", () => {
    setEnv({ TYPESAFE_DEFAULT_MODEL: "jev-latest" });
    expect(listModels().models[0]).toEqual({
      id: DEFAULT_MODEL_ID,
      label: "jev-latest",
      note: "未配置 API Key，选中它会全部走兜底",
      configured: false,
    });
  });
});

describe("JEV_MODELS 的解析", () => {
  it("按 id|显示名|baseURL|apiKey|模型名 逐项读出", () => {
    setEnv({ JEV_MODELS: `fast|快|${BASE}|${KEY}|jev-fast;cheap|省钱` });

    const catalogue = listModels();
    expect(catalogue.default).toBe("fast");
    expect(catalogue.models).toEqual([
      { id: "fast", label: "快", note: "jev-fast", configured: true },
      { id: "cheap", label: "省钱", note: "未配置 API Key，选中它会全部走兜底", configured: false },
    ]);
  });

  it("空字段继承 TYPESAFE_*，写了的那一项自己覆盖", () => {
    setEnv({
      TYPESAFE_API_KEY: KEY,
      TYPESAFE_BASE_URL: BASE,
      TYPESAFE_DEFAULT_MODEL: "jev-latest",
      JEV_MODELS: "inherited|继承;own|自带|https://own.example/v1|sk-own|jev-own",
    });

    expect(resolveModel("inherited")).toEqual({
      id: "inherited",
      label: "继承",
      baseURL: BASE,
      apiKey: KEY,
      model: "jev-latest",
    });
    expect(resolveModel("own")).toEqual({
      id: "own",
      label: "自带",
      baseURL: "https://own.example/v1",
      apiKey: "sk-own",
      model: "jev-own",
    });
    // The inherited one is therefore configured, and the switcher can say so.
    expect(listModels().models.map((entry) => entry.configured)).toEqual([true, true]);
  });

  it("容忍脏行：没名没姓的丢掉，重名的只留第一条，多余的分隔符不算一条", () => {
    setEnv({ TYPESAFE_API_KEY: KEY, JEV_MODELS: "a|一;;||;a|重复|" });

    const entries = listModels().models;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "a", label: "一" });
  });

  it("只写模型名也能成为一条：id 就用那个名字", () => {
    setEnv({ TYPESAFE_API_KEY: KEY, TYPESAFE_DEFAULT_MODEL: "inherited-model", JEV_MODELS: "jev-bare" });

    expect(resolveModel("jev-bare")).toEqual({
      id: "jev-bare",
      label: "jev-bare",
      baseURL: null,
      apiKey: KEY,
      model: "inherited-model",
    });
  });

  it("全是坏行时退回继承的那一条，绝不给出空目录", () => {
    setEnv({ TYPESAFE_API_KEY: KEY, TYPESAFE_DEFAULT_MODEL: "jev-latest", JEV_MODELS: ";;||" });

    const catalogue = listModels();
    expect(catalogue.models).toHaveLength(1);
    expect(catalogue.models[0].id).toBe(DEFAULT_MODEL_ID);
  });
});

describe("默认条目", () => {
  it("听 JEV_DEFAULT_MODEL 的；点了不存在的名字就退回第一条", () => {
    setEnv({ TYPESAFE_API_KEY: KEY, JEV_MODELS: "a|一;b|二", JEV_DEFAULT_MODEL: "b" });
    expect(listModels().default).toBe("b");
    expect(resolveModel(null)?.id).toBe("b");

    setEnv({ TYPESAFE_API_KEY: KEY, JEV_MODELS: "a|一;b|二", JEV_DEFAULT_MODEL: "幽灵" });
    expect(listModels().default).toBe("a");
  });

  it("缺省、null、空串都落到默认条目上", () => {
    setEnv({ TYPESAFE_API_KEY: KEY, JEV_MODELS: "a|一;b|二" });
    expect(resolveModel(undefined)?.id).toBe("a");
    expect(resolveModel(null)?.id).toBe("a");
    expect(resolveModel("")?.id).toBe("a");
  });

  it("点名一个不存在的条目时返回 null，而不是替它挑一个", () => {
    setEnv({ TYPESAFE_API_KEY: KEY, JEV_MODELS: "a|一" });
    expect(resolveModel("幽灵")).toBeNull();
  });
});

describe("每次调用都重读环境", () => {
  it("没有模块级缓存可以让密钥轮换失效", () => {
    setEnv({ TYPESAFE_API_KEY: KEY, JEV_MODELS: "a|一" });
    expect(resolveModel("a")?.apiKey).toBe(KEY);

    process.env.TYPESAFE_API_KEY = "sk-rotated-999";
    expect(resolveModel("a")?.apiKey).toBe("sk-rotated-999");

    process.env.JEV_MODELS = "a|一;b|二";
    expect(listModels().models).toHaveLength(2);
  });
});

describe("对外那半边不可能泄密", () => {
  it("无论怎么序列化都找不到 key 与 baseURL 的碎片", () => {
    setEnv({
      TYPESAFE_API_KEY: KEY,
      TYPESAFE_BASE_URL: BASE,
      TYPESAFE_DEFAULT_MODEL: "jev-latest",
      JEV_MODELS: `fast|快|${BASE}|${KEY}|jev-fast;other|另一家|https://secret.internal.example|sk-other-999|jev-other`,
    });

    const json = JSON.stringify(listModels());
    const secrets = [
      KEY,
      BASE,
      "sk-other-999",
      "https://secret.internal.example",
      "TYPESAFE_API_KEY",
      "apiKey",
      "baseURL",
    ];
    for (const secret of secrets) {
      expect(json, `public catalogue leaked ${secret}`).not.toContain(secret);
    }

    // And the shape has nowhere to put one in the first place: four keys, none
    // of them a credential.
    for (const entry of listModels().models) {
      expect(Object.keys(entry).sort()).toEqual(["configured", "id", "label", "note"]);
    }
  });
});
