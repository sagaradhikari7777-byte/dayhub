import {
  array,
  object,
  jsonScripts,
  priceNumber,
  imageUrl,
  availability,
  sameProduct,
  type JsonObject,
} from "./html";
import { parseMetadata } from "./metadata";
import { parseShopify } from "./shopify";
import { ProductLookupError } from "../errors";
export type ProductResult = {
  name: string;
  price: number;
  currency: string;
  image: string;
  availability: "In stock" | "Out of stock" | "Unknown";
  retailer: string;
  source?: string;
  priceType?: "exact" | "seller-from";
};
const typeIs = (value: unknown, type: string) =>
  array(value).some((v) => String(v).split(/[\/#]/).at(-1) === type);
function offers(value: unknown, depth = 0): JsonObject[] {
  if (depth > 12) return [];
  return array(value).flatMap((v) => {
    const row = object(v);
    return row.offers ? offers(row.offers, depth + 1) : [row];
  });
}
export function parseProduct(html: string, url: string): ProductResult | null {
  const shopify = parseShopify(html, url);
  if (shopify) return shopify;
  const products: JsonObject[] = [];
  function walk(value: unknown, depth = 0) {
    if (depth > 12) return;
    for (const item of array(value)) {
      const row = object(item);
      if (typeIs(row["@type"], "Product")) products.push(row);
      if (row["@graph"]) walk(row["@graph"], depth + 1);
      if (row.mainEntity) walk(row.mainEntity, depth + 1);
      if (row.hasVariant) walk(row.hasVariant, depth + 1);
    }
  }
  jsonScripts(html, "application/ld+json").forEach((v) => walk(v));
  const matching = products.filter((p) =>
    sameProduct(p.url || p["@id"] || p.mainEntityOfPage, url),
  );
  // Never select an unrelated recommendation just because it has a price.
  const candidates = matching.length
    ? matching
    : products.length === 1 && !products[0].url
      ? products
      : [];
  const results: ProductResult[] = [];
  for (const product of candidates) {
    const name = typeof product.name === "string" ? product.name.trim() : "";
    if (!name) continue;
    let rows = offers(product.offers);
    const variant = new URL(url).searchParams.get("variant");
    if (variant) {
      const selected = rows.filter((offer) => {
        try {
          return (
            new URL(String(offer.url), url).searchParams.get("variant") ===
            variant
          );
        } catch {
          return false;
        }
      });
      if (selected.length) rows = selected;
      else if (rows.length > 1)
        throw new ProductLookupError(
          "variant_required",
          "We could not confirm the selected size or colour. Please enter its price manually.",
        );
    }
    for (const offer of rows) {
      const specs = array(offer.priceSpecification)
        .map(object)
        .filter(
          (s) => !/strikethrough|listprice|msrp/i.test(String(s.priceType)),
        );
      const spec = specs.length === 1 ? specs[0] : {};
      // A range is not an exact price for the user's selected variant.
      if (
        offer.price == null &&
        offer.lowPrice != null &&
        offer.highPrice != null &&
        priceNumber(offer.lowPrice) !== priceNumber(offer.highPrice)
      )
        throw new ProductLookupError(
          "variant_required",
          "This product has different prices by size or colour. Choose a specific variant or enter its price manually.",
        );
      const price = priceNumber(offer.price ?? spec.price ?? offer.lowPrice);
      const currency = String(
        offer.priceCurrency || spec.priceCurrency || "",
      ).toUpperCase();
      if (price === null || !/^[A-Z]{3}$/.test(currency)) continue;
      results.push({
        name,
        price,
        currency,
        image: imageUrl(product.image, url),
        availability: availability(offer.availability),
        retailer: new URL(url).hostname.replace(/^www\./, ""),
        source: "Structured product data",
      });
    }
  }
  if (results.length) {
    if (new Set(results.map((r) => `${r.currency}:${r.price}`)).size > 1)
      throw new ProductLookupError(
        "variant_required",
        "This page has several different prices. Select a specific product variant or enter its price manually.",
      );
    return results.find((r) => r.availability === "In stock") || results[0];
  }
  return parseMetadata(html, url);
}
