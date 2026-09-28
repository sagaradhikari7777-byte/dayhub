export type ProductResult = {
  name: string;
  price: number;
  currency: string;
  image: string;
  availability: "In stock" | "Out of stock" | "Unknown";
  retailer: string;
};
export function parseProduct(html: string, url: string): ProductResult | null {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const products: Record<string, unknown>[] = [];
  function walk(v: unknown) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const r = v as Record<string, unknown>;
      if ([r["@type"]].flat().includes("Product")) products.push(r);
      if (r["@graph"]) walk(r["@graph"]);
      if (r.mainEntity) walk(r.mainEntity);
    }
  }
  for (const s of scripts)
    try {
      walk(JSON.parse(s[1]));
    } catch {}
  for (const p of products) {
    const offers = (Array.isArray(p.offers) ? p.offers[0] : p.offers) as
      Record<string, unknown> | undefined;
    if (!offers) continue;
    const price = Number(offers.price ?? offers.lowPrice);
    if (!Number.isFinite(price) || price < 0) continue;
    const image = Array.isArray(p.image) ? p.image[0] : p.image;
    const imageString =
      typeof image === "string"
        ? image
        : typeof image === "object" && image
          ? (image as { url: string }).url
          : "";
    return {
      name: String(p.name || ""),
      price,
      currency: String(offers.priceCurrency || "AUD"),
      image: imageString?.startsWith("https://") ? imageString : "",
      availability: String(offers.availability).includes("OutOfStock")
        ? "Out of stock"
        : String(offers.availability).includes("InStock")
          ? "In stock"
          : "Unknown",
      retailer: new URL(url).hostname.replace(/^www\./, ""),
    };
  }
  return null;
}
