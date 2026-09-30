// Title evidence is not a verified GTIN/SKU. A compatible part can repeat
// every word of an appliance's name and still be a different product.
export type Match = "likely" | "possible" | "different";
export type MatchAssessment = { match: Match; reason: string };
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/eau de parfum/g, "edp")
    .replace(/eau de toilette/g, "edt")
    .replace(/(\d)\s+(ml|gb|tb|mm|cm|inch|oz|g|kg)\b/g, "$1$2")
    .replace(/([a-z]+)-(\d)/g, "$1$2")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const colours =
  /\b(black|white|silver|blue|red|green|pink|gold|purple|brown|beige|orange|yellow|grey|gray)\b/g;
const conditions =
  /\b(used|refurbished|renewed|preowned|pre owned|open box|second hand)\b/;
const qualifiers =
  /\b(pro|max|plus|ultra|mini|lite|extreme|intense|elixir|edp|edt|parfum|absolute|animal|origin|detect|complete|advanced|slim|extra|total clean|cyclone|polarised|polarized)\b/g;
// Separate types: tracking a filter cannot match a dustbin or the appliance.
const parts = [
  /\b(cases?|covers?|umbris|coque|housse|funda|etui|protector)\b/,
  /\b(filters?|hepa|post motor|pre motor)\b/,
  /\b(dustbins?|dust bins?|bin assembly|canister)\b/,
  /\b(main body|housing|chassis|motor assembly|body assembly|circuit board|pcb|trigger|switch|gasket|seal|mounting bracket)\b/,
  /\b(brush(?:es)?|brushbar|roller|motorhead|floor head|cleaner head|combination tool|crevice tool|hair screw tool|nozzle|attachment|wand|hose)\b/,
  /\b(batter(?:y|ies)|charger|charging dock|power supply)\b/,
  /\b(ear tips|earpads|strap|adapter|cable)\b/,
  /\b(sample|tester|decant|refill)\b/,
];
const partIntent =
  /\b(replacement|replaces|spare|repair|compatible|accessor(?:y|ies)|fits|suitable for)\b/;
const stop = new Set(["with", "and", "the", "for", "a", "of", "in"]);
const descriptors = new Set(
  words(
    "wireless bluetooth headphones earphones earbuds noise cancelling canceling cordless stick vacuum cleaner bagless upright robot sunglasses perfume fragrance spray smartphone phone unlocked new original genuine official australian australia au stock online retail packaging white black silver blue red green pink gold purple brown beige orange yellow grey gray",
  ),
);
const tokens = (s: string, re: RegExp) => [...s.matchAll(re)].map((x) => x[0]);
const result = (match: Match, reason: string): MatchAssessment => ({
  match,
  reason,
});

export function assessProduct(query: string, title: string): MatchAssessment {
  const q = normalize(query),
    t = normalize(title);
  if (!q || !t) return result("different", "Missing product identity");
  if (conditions.test(t) !== conditions.test(q))
    return result("different", "Different item condition");
  // Included accessories are secondary: 'AirPods with charging case' is fine;
  // 'charging case for AirPods' is a different product.
  const primary = (s: string) => s.split(/\b(?:with|includes|including)\b/)[0];
  const qp = primary(q),
    tp = primary(t);
  // Unknown parts often advertise compatibility as '... for <brand/model>'.
  // Detect that relationship instead of relying only on a list of part names.
  const compatibleWith = tp
    .split(/\bfor\b/)
    .slice(1)
    .join(" ");
  const targetIdentity = words(qp).filter(
    (x) => !stop.has(x) && !descriptors.has(x),
  );
  if (
    !/\bfor\b/.test(qp) &&
    targetIdentity.length >= 2 &&
    targetIdentity.every((x) => words(compatibleWith).includes(x))
  )
    return result(
      "different",
      "Compatible item for this product, not the product itself",
    );
  if (
    parts.some((re) => re.test(tp) !== re.test(qp)) ||
    (partIntent.test(tp) && !partIntent.test(qp))
  )
    return result(
      "different",
      "Accessory, replacement part or different product type",
    );
  if (
    /\b(?:bundle|kit|set|[2-9]\d* pack|pack of [2-9]\d*)\b/.test(t) &&
    !/\b(?:bundle|kit|set|[2-9]\d* pack|pack of [2-9]\d*)\b/.test(q)
  )
    return result(
      "different",
      "Bundle or multipack instead of the individual product",
    );
  const qq = tokens(q, qualifiers),
    tq = tokens(t, qualifiers);
  if (qq.some((x) => !tq.includes(x)) || tq.some((x) => !qq.includes(x)))
    return result("different", "Different model edition or formulation");
  const qt = words(q),
    tt = new Set(words(t));
  const ids = qt.filter((x) => /\d/.test(x));
  if (ids.some((x) => !tt.has(x)))
    return result("different", "Model number, size or capacity does not match");
  for (const id of ids) {
    const family = id.match(/^([a-z]+)\d/);
    if (
      family &&
      [...tt].some((x) => x !== id && x.match(/^([a-z]+)\d/)?.[1] === family[1])
    )
      return result("different", "Multiple or conflicting model numbers");
    const unit = id.match(/^\d+(?:\.\d+)?(ml|gb|tb|mm|cm|inch|oz|g|kg)$/)?.[1];
    if (
      unit &&
      [...tt].some(
        (x) =>
          x !== id &&
          x.match(/^\d+(?:\.\d+)?(ml|gb|tb|mm|cm|inch|oz|g|kg)$/)?.[1] === unit,
      )
    )
      return result("different", "Conflicting size or capacity");
  }
  const qc = tokens(q, colours),
    tc = tokens(t, colours);
  if (
    qc.length &&
    tc.length &&
    (!qc.every((x) => tc.includes(x)) || !tc.every((x) => qc.includes(x)))
  )
    return result("different", "Different colour");
  const meaningful = qt.filter((x) => !stop.has(x));
  const identity = meaningful.filter((x) => !descriptors.has(x));
  if (identity.length < 2)
    return result("possible", "Product name is too broad to confirm the model");
  if (identity.some((x) => !tt.has(x)))
    return result("different", "Brand or product identity does not match");
  if (/[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\s]/u.test(title))
    return result("possible", "Listing details could not be fully matched");
  if (qc.some((x) => !tc.includes(x)))
    return result("possible", "Colour is not specified by this store");
  const extra = words(tp).filter(
    (x) => !qt.includes(x) && !stop.has(x) && !descriptors.has(x),
  );
  if (extra.length)
    return result(
      "possible",
      "Additional model or variant details need checking",
    );
  return result(
    "likely",
    "Brand, model and specified variant agree in the listing title",
  );
}
export function matchProduct(query: string, title: string): Match {
  return assessProduct(query, title).match;
}
