/**
 * The model catalogue: which backends this console is allowed to ask.
 *
 * **Server-only, by construction.** An entry carries an API key, so nothing
 * under `components/` and nothing in the browser bundle may import this module.
 * The browser reads `GET /api/models`, which returns `PublicModelEntry[]` — id,
 * label, note, configured — and nothing else. The two types exist separately for
 * exactly that reason, and `tests/models.test.ts` pins that no fragment of a key
 * or a base URL survives the trip.
 *
 * Configuration comes entirely from the environment and is re-read on every
 * call: a rotated key or an edited `JEV_MODELS` takes effect on the next
 * decision, with no restart and no module-level cache to go stale.
 *
 *   JEV_MODELS="id|显示名|baseURL|apiKey|模型名;id2|显示名2"
 *   JEV_DEFAULT_MODEL=id
 *
 * Fields are separated by `|` and entries by `;` — so neither character may
 * appear inside a value. An empty field inherits its `TYPESAFE_*` counterpart,
 * which is what keeps a single-model `.env.local` working untouched: with
 * `JEV_MODELS` unset the catalogue is one entry called `default`, built from the
 * three variables the app has always used.
 */

/** The id of the synthesized entry, and what `JEV_DEFAULT_MODEL` defaults to. */
export const DEFAULT_MODEL_ID = "default";

/** One configured backend. Holds the credentials; never leaves the server. */
export interface ModelEntry {
  id: string;
  /** What the switcher shows. */
  label: string;
  /** API root, or null to let the SDK fall back to its own default. */
  baseURL: string | null;
  apiKey: string | null;
  /** Upstream model name. */
  model: string | null;
}

/** What `/api/models` is allowed to say. Deliberately has nowhere to put a key. */
export interface PublicModelEntry {
  id: string;
  label: string;
  /** One short sentence: the upstream model, or why this entry is unusable. */
  note: string;
  /** False when no API key could be found for it — choosing it would fall back every time. */
  configured: boolean;
}

export interface ModelCatalogue {
  /** The id the switcher preselects. */
  default: string;
  models: PublicModelEntry[];
}

/** Trim, and treat an empty string as absent so `||` and `|` mean the same thing. */
function clean(value: string | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * The catalogue as the environment describes it. Never cached: the whole point
 * of reading it per call is that the running server can be reconfigured.
 */
function readEntries(): ModelEntry[] {
  const inherited: Inherited = {
    baseURL: clean(process.env.TYPESAFE_BASE_URL),
    apiKey: clean(process.env.TYPESAFE_API_KEY),
    model: clean(process.env.TYPESAFE_DEFAULT_MODEL),
  };

  const raw = process.env.JEV_MODELS?.trim();
  if (!raw) return [inheritedEntry(inherited)];

  const entries = parseEntries(raw, inherited);
  // A catalogue whose every row was too damaged to use still has to answer, or
  // the switcher would come up empty and the page would have nothing to ask.
  return entries.length > 0 ? entries : [inheritedEntry(inherited)];
}

/** What an empty field in `JEV_MODELS` inherits from. */
interface Inherited {
  baseURL: string | null;
  apiKey: string | null;
  model: string | null;
}

/** The single entry every existing `.env.local` describes, with no `JEV_MODELS` at all. */
function inheritedEntry(inherited: Inherited): ModelEntry {
  return {
    id: DEFAULT_MODEL_ID,
    label: inherited.model ?? "默认模型",
    ...inherited,
  };
}

function parseEntries(raw: string, inherited: Inherited): ModelEntry[] {
  const entries: ModelEntry[] = [];
  const seen = new Set<string>();

  for (const chunk of raw.split(";")) {
    const [rawId, rawLabel, rawBaseURL, rawApiKey, rawModel] = chunk.split("|").map(clean);
    // An entry has to name itself: an explicit id, or the upstream model it
    // runs. Without one of the two there is nothing to show in the switcher, and
    // falling back to an *inherited* model name would invent a phantom row out
    // of a stray separator.
    if (!rawId && !rawModel) continue;

    // The id is the lookup key, so it is the one field that cannot be inherited:
    // an entry named only by its model uses that name.
    const id = rawId ?? rawModel;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      label: rawLabel ?? id,
      baseURL: rawBaseURL ?? inherited.baseURL,
      apiKey: rawApiKey ?? inherited.apiKey,
      model: rawModel ?? inherited.model,
    });
  }

  return entries;
}

/** The id to preselect. A `JEV_DEFAULT_MODEL` that names nothing falls back to the first entry. */
export function defaultModelId(entries: ModelEntry[] = readEntries()): string {
  const wanted = clean(process.env.JEV_DEFAULT_MODEL);
  if (wanted && entries.some((entry) => entry.id === wanted)) return wanted;
  return entries[0].id;
}

/** The catalogue, sanitized: what `/api/models` returns and the switcher renders. */
export function listModels(): ModelCatalogue {
  const entries = readEntries();
  return {
    default: defaultModelId(entries),
    models: entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      note: entry.apiKey ? (entry.model ?? "") : "未配置 API Key，选中它会全部走兜底",
      configured: Boolean(entry.apiKey),
    })),
  };
}

/**
 * The credentials for one entry — **secrets included**, so server-side only.
 *
 * A null or unknown-with-no-default `id` means "whatever the server prefers";
 * an id that names nothing returns null, and the route answers 400 rather than
 * quietly asking a different model than the caller chose.
 */
export function resolveModel(id: string | null | undefined): ModelEntry | null {
  const entries = readEntries();
  const wanted = clean(id ?? undefined) ?? defaultModelId(entries);
  return entries.find((entry) => entry.id === wanted) ?? null;
}
