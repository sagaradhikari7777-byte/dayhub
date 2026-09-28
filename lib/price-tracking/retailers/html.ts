export type JsonObject = Record<string, unknown>;
export const object = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
export const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];
export function decode(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,
    (match, entity: string) => {
      const named: Record<string, string> = {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
      };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const code =
        entity[1]?.toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    },
  );
}
export function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
      (m) => [m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4])],
    ),
  );
}
export function jsonScripts(html: string, type: string): unknown[] {
  const values: unknown[] = [];
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    if (attributes(match[1]).type?.toLowerCase() !== type) continue;
    try {
      values.push(JSON.parse(match[2]));
    } catch {
      try {
        values.push(JSON.parse(decode(match[2])));
      } catch {
        /* Ignore invalid script blocks. */
      }
    }
  }
  return values;
}
export function priceNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
  const price = Number(text.replaceAll(",", ""));
  return Number.isFinite(price) && price >= 0 && price <= 1e9 ? price : null;
}
export function imageUrl(value: unknown, url: string): string {
  const first = array(value)[0];
  const raw =
    typeof first === "string" ? first : object(first).url || object(first).src;
  if (typeof raw !== "string" || !raw) return "";
  try {
    const parsed = new URL(decode(raw), url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}
export function availability(
  value: unknown,
): "In stock" | "Out of stock" | "Unknown" {
  const text = String(value)
    .replace(/[\s_-]/g, "")
    .toLowerCase();
  if (/outofstock|soldout|discontinued/.test(text)) return "Out of stock";
  if (/instock|limitedavailability/.test(text)) return "In stock";
  return "Unknown";
}
export function sameProduct(link: unknown, url: string): boolean {
  if (typeof link !== "string") return false;
  try {
    const a = new URL(link, url),
      b = new URL(url);
    return (
      a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "") &&
      a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}
