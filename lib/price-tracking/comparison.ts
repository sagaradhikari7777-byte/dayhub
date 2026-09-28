import type { Entry } from "@/types";

export function comparisonGroup(entry: Entry): string {
  return entry.comparisonGroupId || entry.id;
}
export function comparisonListings(entry: Entry, entries: Entry[]): Entry[] {
  const group = comparisonGroup(entry);
  return entries
    .filter((e) => e.kind === "products" && comparisonGroup(e) === group)
    .sort(
      (a, b) =>
        Number(a.availability === "Out of stock") -
          Number(b.availability === "Out of stock") ||
        (a.price ?? Infinity) - (b.price ?? Infinity),
    );
}
export function listingUrlKey(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch {
    return raw.trim();
  }
}
