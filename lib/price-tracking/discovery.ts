import { createHash } from "node:crypto";
import { redisCommand, redisConfigured } from "@/lib/db/redis";
import { ProductLookupError } from "./errors";
export type StoreSuggestion = {
  title: string;
  retailer: string;
  price: number;
  url: string;
  delivery: string;
  condition: string;
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

export async function discoverStores(query: string) {
  if (!discoveryConfigured())
    throw new ProductLookupError(
      "discovery_not_configured",
      "Automatic store discovery needs a search provider connection. You can add store links to compare prices now.",
    );
  const cacheKey = `dayhub:v1:{dayhub-v1}:shopping:${createHash("sha256").update(query.toLowerCase()).digest("hex")}`;
  const cached = await redisCommand(["GET", cacheKey]);
  if (typeof cached === "string")
    return JSON.parse(cached) as {
      suggestions: StoreSuggestion[];
      searchedAt: string;
    };
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
      "Today's store-search limit has been reached. Saved store comparisons still work.",
    );
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    gl: "au",
    hl: "en",
    api_key: process.env.SERPAPI_API_KEY!,
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok)
    throw new ProductLookupError(
      "discovery_unavailable",
      "Store search is temporarily unavailable. Your saved comparisons are unchanged.",
    );
  const raw = await response.json();
  if (raw.error)
    throw new ProductLookupError(
      "discovery_unavailable",
      "The search provider could not complete this search. Check its configuration or try again later.",
    );
  const result = {
    suggestions: parseSuggestions(raw),
    searchedAt: new Date().toISOString(),
  };
  await redisCommand(["SET", cacheKey, JSON.stringify(result), "EX", 21600]);
  return result;
}
