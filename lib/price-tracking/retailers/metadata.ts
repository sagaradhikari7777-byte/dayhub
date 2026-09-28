import type { ProductResult } from "./generic";
import { attributes, availability, imageUrl, priceNumber } from "./html";
export function parseMetadata(html: string, url: string): ProductResult | null {
  const meta = new Map<string, string[]>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(match[0]);
    const key = (a.property || a.name || a.itemprop || "").toLowerCase();
    if (key && a.content) meta.set(key, [...(meta.get(key) || []), a.content]);
  }
  const first = (key: string) => meta.get(key)?.[0] || "";
  const name = first("og:title") || first("twitter:title");
  const amounts =
    meta.get("product:price:amount") || meta.get("og:price:amount");
  const currencies =
    meta.get("product:price:currency") || meta.get("og:price:currency");
  if (
    !name ||
    !amounts?.length ||
    !currencies?.length ||
    new Set(amounts).size !== 1 ||
    new Set(currencies).size !== 1
  )
    return null;
  const price = priceNumber(amounts[0]),
    currency = currencies[0].toUpperCase();
  if (price === null || !/^[A-Z]{3}$/.test(currency)) return null;
  return {
    name,
    price,
    currency,
    image: imageUrl(first("og:image"), url),
    availability: availability(first("product:availability")),
    retailer: new URL(url).hostname.replace(/^www\./, ""),
    source: "Product metadata",
  };
}
