import {
  attributes,
  decode,
  imageUrl,
  priceNumber,
  jsonScripts,
  object,
  array,
} from "./html";
import type { ProductResult } from "./generic";
import { ProductLookupError } from "../errors";

export function amazonAsin(url: string): string | null {
  const u = new URL(url);
  if (!/^(?:www\.)?amazon\.com\.au$/.test(u.hostname)) return null;
  return (
    u.pathname
      .match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]
      .toUpperCase() || null
  );
}

// Read only a bounded element's content, including nested elements of its tag.
function element(
  html: string,
  predicate: (a: Record<string, string>) => boolean,
): string {
  const tags = /<([a-z][\w-]*)\b[^>]*>/gi;
  for (const match of html.matchAll(tags)) {
    if (!predicate(attributes(match[0]))) continue;
    const start = match.index! + match[0].length;
    const tail = html.slice(start);
    const tag = match[1];
    const boundaries = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    let depth = 1;
    for (const boundary of tail.matchAll(boundaries)) {
      depth += boundary[0].startsWith("</")
        ? -1
        : /\/\s*>$/.test(boundary[0])
          ? 0
          : 1;
      if (!depth) return tail.slice(0, boundary.index);
    }
    return "";
  }
  return "";
}
const byId = (html: string, id: string) => element(html, (a) => a.id === id);
const text = (html: string) =>
  decode(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
function amount(value: string): number | null {
  const match = text(value).match(
    /^(?:A\$|AU\$|\$)\s*((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?)$/,
  );
  return match ? priceNumber(match[1]) : null;
}

export function parseAmazon(html: string, url: string): ProductResult | null {
  const asin = amazonAsin(url);
  if (!asin) return null;
  let name = text(byId(html, "productTitle"));
  if (!name) return null;
  const selected = [...html.matchAll(/<input\b[^>]*>/gi)]
    .map((m) => attributes(m[0]))
    .find((a) => a.id === "ASIN" || a.name === "ASIN")?.value;
  if (selected && selected.toUpperCase() !== asin)
    throw new ProductLookupError(
      "variant_required",
      "Amazon returned a different product variant. Please open the selected variant and copy its product link.",
    );
  let price: number | null = null;
  let source = "Amazon selected product price";
  // Scope to Amazon's main price panels. Never read recommendations, list
  // prices, savings, instalments, coupons or other sellers' offers.
  for (const id of [
    "corePriceDisplay_desktop_feature_div",
    "corePrice_feature_div",
    "apex_desktop",
    "apex_mobile",
  ]) {
    const panel = byId(html, id);
    const payable =
      element(panel, (a) =>
        /(?:^|\s)(?:priceToPay|apexPriceToPay)(?:\s|$)/.test(a.class || ""),
      ) ||
      element(
        panel,
        (a) =>
          /(?:^|\s)a-price(?:\s|$)/.test(a.class || "") &&
          !/(?:^|\s)a-text-price(?:\s|$)/.test(a.class || ""),
      );
    const offscreen = element(payable, (a) =>
      /(?:^|\s)a-offscreen(?:\s|$)/.test(a.class || ""),
    );
    price = amount(offscreen);
    if (price !== null) break;
  }
  if (price === null)
    for (const id of [
      "priceblock_dealprice",
      "priceblock_ourprice",
      "priceblock_saleprice",
    ]) {
      price = amount(byId(html, id));
      if (price !== null) break;
    }
  if (price === null) {
    const newOffers = element(html, (a) => {
      if (a.id !== "aod-ingress-link" || !a.href) return false;
      try {
        const link = new URL(a.href, url);
        return (
          link.hostname === new URL(url).hostname &&
          link.pathname.includes(`/offer-listing/${asin}/`) &&
          link.searchParams.get("condition") === "NEW"
        );
      } catch {
        return false;
      }
    });
    if (/\bNew\s*\(\d+\)\s*from\b/i.test(text(newOffers))) {
      price = amount(
        element(newOffers, (a) =>
          /(?:^|\s)a-offscreen(?:\s|$)/.test(a.class || ""),
        ),
      );
      source = "Amazon new seller starting price (delivery at store)";
    }
  }
  if (price === null) return null;
  // Keep the selected colour/size in the imported identity. Other swatches
  // may contain cheaper prices and must not become the tracked variant.
  for (const script of jsonScripts(html, "a-state")) {
    const dimensions = object(object(script).sortedDimValuesForAllDims);
    for (const values of Object.values(dimensions)) {
      const selectedVariant = array(values)
        .map(object)
        .find(
          (v) => v.dimensionValueState === "SELECTED" && v.defaultAsin === asin,
        );
      const label = selectedVariant?.dimensionValueDisplayText;
      if (
        typeof label === "string" &&
        !name.toLowerCase().includes(label.toLowerCase())
      )
        name += ` · ${label}`;
    }
  }
  const stock = text(byId(html, "availability"));
  const image = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((m) => attributes(m[0]))
    .find((a) => a.id === "landingImage" || a.id === "imgBlkFront");
  return {
    name,
    price,
    currency: "AUD",
    retailer: "Amazon",
    image: imageUrl(image?.["data-old-hires"] || image?.src, url),
    availability: /currently unavailable|out of stock/i.test(stock)
      ? "Out of stock"
      : /in stock|only \d+ left in stock/i.test(stock)
        ? "In stock"
        : "Unknown",
    source,
    priceType: source.includes("new seller starting price")
      ? "seller-from"
      : "exact",
  };
}

export function requireExactAmazonPrice(result: ProductResult, url: string) {
  if (result.priceType === "seller-from")
    throw new ProductLookupError(
      "amazon_offer_unconfirmed",
      `Amazon only exposed a new-seller summary from $${result.price.toFixed(2)}, which may differ from the offer you see. Enter your displayed price; DayHub will keep it until an exact offer can be verified.`,
      {
        name: result.name,
        retailer: result.retailer,
        image: result.image,
        currency: result.currency,
        url,
        suggestedPrice: result.price,
      },
    );
  return result;
}

// Some Amazon share links return an HTML redirect instead of a Location
// header. Only follow an explicit refresh to Amazon AU, never arbitrary JS.
export function amazonShareRedirect(html: string, url: string): string | null {
  if (!["amzn.asia", "amzn.to"].includes(new URL(url).hostname)) return null;
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(match[0]);
    if (a["http-equiv"]?.toLowerCase() !== "refresh") continue;
    const target = a.content?.match(/\burl\s*=\s*["']?([^"']+)/i)?.[1]?.trim();
    if (!target) continue;
    try {
      const next = new URL(target, url);
      if (
        next.protocol === "https:" &&
        !next.username &&
        !next.password &&
        amazonAsin(next.href)
      )
        return next.href;
    } catch {
      /* Ignore malformed redirects. */
    }
  }
  return null;
}
