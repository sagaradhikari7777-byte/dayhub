// Conservative title matching: price alone must never make an accessory or a
// different size/model appear to be the best offer for the tracked product.
export type Match = "likely" | "possible" | "different";
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/(\d)\s+(ml|gb|tb|mm|cm|inch)\b/g, "$1$2")
    .replace(/([a-z]+)-(\d)/g, "$1$2")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
const colours =
  /\b(black|white|silver|blue|red|green|pink|gold|purple|brown|beige)\b/g;
const conditions = /\b(used|refurbished|renewed|preowned|pre owned|open box)\b/;
const accessories =
  /\b(case|cover|protector|replacement|ear tips|earpads|strap|adapter|cable|sample|tester|decant|bundle)\b/;
export function matchProduct(query: string, title: string): Match {
  const q = normalize(query),
    t = normalize(title);
  if (!q || !t) return "different";
  if (conditions.test(t) !== conditions.test(q)) return "different";
  const accessory = t.match(accessories)?.[0];
  if (accessory && !q.includes(accessory)) return "different";
  const qualifiers = /\b(pro|max|plus|ultra|mini|lite)\b/g;
  const qQualifiers = [...q.matchAll(qualifiers)].map(x => x[0]);
  const tQualifiers = [...t.matchAll(qualifiers)].map(x => x[0]);
  if (qQualifiers.some(x => !tQualifiers.includes(x)) || tQualifiers.some(x => !qQualifiers.includes(x))) return "different";
  const qt = q.split(/\s+/),
    tt = new Set(t.split(/\s+/));
  const identifiers = qt.filter((x) => /\d/.test(x));
  if (identifiers.some((x) => !tt.has(x))) return "different";
  const qc = [...q.matchAll(colours)].map((x) => x[0]);
  const tc = [...t.matchAll(colours)].map((x) => x[0]);
  if (qc.length && tc.length && !qc.every((x) => tc.includes(x)))
    return "different";
  const words = qt.filter(
    (x) => !["with", "and", "the", "for", "a", "of", "in"].includes(x),
  );
  if (words.length < 2) return "possible";
  const overlap = words.filter((x) => tt.has(x)).length / words.length;
  // Require all words for an automatic likely match. Missing colour/variant
  // attributes stay possible, even when a model identifier agrees.
  if (overlap === 1) return "likely";
  return overlap >= 0.55 ? "possible" : "different";
}
