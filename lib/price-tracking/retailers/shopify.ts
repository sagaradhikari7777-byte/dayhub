import type { ProductResult } from "./generic";
import { array, object, jsonScripts, imageUrl, priceNumber } from "./html";
import { ProductLookupError } from "../errors";
export function parseShopify(html: string, url: string): ProductResult | null {
  const parsed = new URL(url);
  const handle = parsed.pathname.match(/\/products\/([^/]+)\/?$/)?.[1];
  if (!handle) return null;
  const currency = html.match(
    /Shopify\.currency\s*=\s*\{[^}]*["']active["']\s*:\s*["']([A-Z]{3})["']/,
  )?.[1];
  if (!currency) return null;
  for (const value of jsonScripts(html, "application/json")) {
    const root = object(value),
      p = object(root.product || root);
    if (p.handle !== handle || typeof p.title !== "string" || !p.title.trim())
      continue;
    const variants = array(p.variants).map(object);
    const selectedId = parsed.searchParams.get("variant");
    const selected = selectedId
      ? variants.filter((v) => String(v.id) === selectedId)
      : variants;
    if (selectedId && !selected.length)
      throw new ProductLookupError(
        "variant_required",
        "The selected product variant is no longer available. Check the store link.",
      );
    const prices = selected.map((v) => priceNumber(v.price));
    if (!prices.length || prices.some((p) => p === null)) continue;
    if (new Set(prices).size > 1)
      throw new ProductLookupError(
        "variant_required",
        "Choose a specific size or colour before tracking this product's price.",
      );
    const chosen = selected.find((v) => v.available === true) || selected[0];
    return {
      name: p.title,
      price: prices[0]! / 100,
      currency,
      image: imageUrl(
        chosen.featured_image || p.featured_image || p.images,
        url,
      ),
      availability:
        chosen.available === true
          ? "In stock"
          : chosen.available === false
            ? "Out of stock"
            : "Unknown",
      retailer: parsed.hostname.replace(/^www\./, ""),
      source: "Shopify product data",
    };
  }
  return null;
}
