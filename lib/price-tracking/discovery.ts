import { createHash } from "node:crypto";
import { redisCommand, redisConfigured } from "@/lib/db/redis";
import { ProductLookupError } from "./errors";
import { matchProduct, type Match } from "./matching";
import { object, array, availability } from "./retailers/html";
export type StoreSuggestion = {
  title: string;
  retailer: string;
  price: number;
  url: string;
  delivery: string;
  condition: string;
  availability?: string;
  match?: Match;
};
export function discoveryConfigured() {
  return Boolean(process.env.SERPAPI_API_KEY && redisConfigured());
}
export function parseSuggestions(data: unknown): StoreSuggestion[] {
  const rows = (data as { shopping_results?: unknown[] })?.shopping_results;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows
    .flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const r = value as Record<string, unknown>;
      if (
        typeof r.title !== "string" ||
        typeof r.source !== "string" ||
        typeof r.extracted_price !== "number" ||
        !Number.isFinite(r.extracted_price) ||
        r.extracted_price < 0 ||
        r.extracted_price > 1e9
      )
        return [];
      // Search is fixed to Australia; discard results explicitly priced elsewhere.
      if (
        typeof r.price !== "string" ||
        !/^(?:A\$|AU\$|AUD\s*|\$)\s*[\d,.]+$/.test(r.price.trim())
      )
        return [];
      let url: URL;
      try {
        url = new URL(String(r.link || r.product_link));
      } catch {
        return [];
      }
      if (url.protocol !== "https:" || url.username || url.password) return [];
      const key = `${r.source}:${url.href}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          title: r.title.slice(0, 240),
          retailer: r.source.slice(0, 160),
          price: r.extracted_price,
          url: url.href,
          delivery:
            typeof r.delivery === "string"
              ? r.delivery.slice(0, 200)
              : "Delivery not confirmed",
          condition:
            typeof r.second_hand_condition === "string"
              ? r.second_hand_condition.slice(0, 80)
              : "Condition not confirmed",
        },
      ];
    })
    .sort((a, b) => a.price - b.price)
    .slice(0, 20);
}

export type DiscoveryResult = {
  suggestions: StoreSuggestion[];
  searchedAt: string;
  warning?: string;
};
type Provider = (params: Record<string, string>) => Promise<unknown>;

export function parseStores(data: unknown): StoreSuggestion[] {
  const product = object(object(data).product_results);
  return array(product.stores).flatMap((value) => {
    const row = object(value);
    const details = array(row.details_and_offers)
      .filter((x) => typeof x === "string")
      .join(" · ");
    const offers = parseSuggestions({
      shopping_results: [
        {
          ...row,
          source: row.name,
          title: row.title || product.title,
          delivery: row.shipping || details || "Delivery not confirmed",
          second_hand_condition: row.second_hand_condition,
        },
      ],
    });
    return offers.map((offer) => ({
      ...offer,
      availability: availability(details),
    }));
  });
}

// Pure provider orchestration is injectable for fixture tests. Credentials and
// request budgeting remain exclusively in the server wrapper below.
export async function collectStoreOffers(
  query: string,
  provider: Provider,
): Promise<DiscoveryResult> {
  const raw = await provider({
    engine: "google_shopping",
    q: query,
    gl: "au",
    hl: "en",
  });
  let suggestions = parseSuggestions(raw).map((s) => ({
    ...s,
    match: matchProduct(query, `${s.title} ${s.condition}`),
  }));
  const candidates = array(object(raw).shopping_results).map(object);
  const chosen = candidates.find(
    (row) =>
      typeof row.title === "string" &&
      matchProduct(query, `${row.title} ${row.second_hand_condition || ""}`) ===
        "likely" &&
      typeof row.immersive_product_page_token === "string",
  );
  let warning: string | undefined;
  if (chosen) {
    try {
      const details = await provider({
        engine: "google_immersive_product",
        page_token: String(chosen.immersive_product_page_token),
        more_stores: "true",
      });
      suggestions = [
        ...parseStores(details).map((s) => ({
          ...s,
          match: matchProduct(query, `${s.title} ${s.condition}`),
        })),
        ...suggestions,
      ];
    } catch {
      warning =
        "Some additional stores could not be loaded. Available search results are shown.";
    }
  }
  const seen = new Set<string>();
  suggestions = suggestions
    .filter((s) => s.match !== "different")
    .sort((a, b) => a.price - b.price)
    .filter((s) => {
      const key = `${s.retailer.toLowerCase()}:${s.title.toLowerCase()}:${s.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);
  return { suggestions, searchedAt: new Date().toISOString(), warning };
}

async function providerRequest(params: Record<string, string>) {
  const daily = Number(process.env.COMPARISON_DAILY_LIMIT || 10);
  const limit = Number.isInteger(daily)
    ? Math.max(1, Math.min(100, daily))
    : 10;
  const counterKey = `dayhub:v1:{dayhub-v1}:shopping-budget:${new Date().toISOString().slice(0, 10)}`;
  const accepted = await redisCommand([
    "EVAL",
    "local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],172800); return 1",
    1,
    counterKey,
    limit,
  ]);
  if (Number(accepted) !== 1)
    throw new ProductLookupError(
      "discovery_limit",
      "Today's store-search limit has been reached. Previously saved results are kept.",
    );
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    ...params,
    api_key: process.env.SERPAPI_API_KEY!,
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok)
    throw new ProductLookupError(
      "discovery_unavailable",
      "Store search is temporarily unavailable. Please try again later.",
    );
  const raw = await response.json();
  if (raw.error)
    throw new ProductLookupError(
      "discovery_unavailable",
      "The search provider could not complete this comparison.",
    );
  return raw;
}
const inFlight = new Map<string, Promise<DiscoveryResult>>();
export async function discoverStores(query: string): Promise<DiscoveryResult> {
  if (!discoveryConfigured())
    throw new ProductLookupError(
      "discovery_not_configured",
      "Automatic comparison is not connected yet. Your product is saved; there is no need to add other store links.",
    );
  const cacheKey = `dayhub:v1:{dayhub-v1}:shopping:v2:${createHash("sha256").update(query.toLowerCase()).digest("hex")}`;
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;
  const work = (async () => {
    const cached = await redisCommand(["GET", cacheKey]);
    if (typeof cached === "string")
      return JSON.parse(cached) as DiscoveryResult;
    const result = await collectStoreOffers(query, providerRequest);
    await redisCommand([
      "SET",
      cacheKey,
      JSON.stringify(result),
      "EX",
      result.warning ? 900 : 21600,
    ]);
    return result;
  })();
  inFlight.set(cacheKey, work);
  try {
    return await work;
  } finally {
    inFlight.delete(cacheKey);
  }
}
