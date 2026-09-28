import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProduct } from "../lib/price-tracking/retailers/generic";
import { applyMutation, emptyState } from "../lib/db/redis-state";
import { createEntry, uid } from "../lib/model";
const url = "https://store.example/products/headphones";
const html = (value: unknown) =>
  `<script TYPE = 'application/ld+json'>${JSON.stringify(value)}</script>`;
const product = (offers: unknown) => ({
  "@type": "Product",
  name: "Headphones",
  url,
  image: "//cdn.example/image.jpg",
  offers,
});
const offer = (price: unknown) => ({
  "@type": "Offer",
  price,
  priceCurrency: "AUD",
  availability: "https://schema.org/InStock",
});

test("structured data supports graph, nested offers, schema type URLs and relative images", () => {
  const p = {
    ...product({ "@type": "AggregateOffer", offers: [offer("1,299.50")] }),
    "@type": ["https://schema.org/Product"],
  };
  const result = parseProduct(html({ "@graph": [{ mainEntity: p }] }), url);
  assert.equal(result?.price, 1299.5);
  assert.equal(result?.image, "https://cdn.example/image.jpg");
  assert.equal(result?.availability, "In stock");
});
test("empty, null, boolean and malformed prices never become a fake free price", () => {
  for (const value of [null, "", " ", false, true, "12.50 AUD", "1,2,3", -1])
    assert.equal(parseProduct(html(product(offer(value))), url), null);
  assert.equal(parseProduct(html(product(offer(0))), url)?.price, 0);
  assert.equal(parseProduct(html(product({ price: 50 })), url), null);
});
test("selected offer variant is used and ambiguous ranges are refused", () => {
  const p = product([
    { ...offer(100), url: url + "?variant=1" },
    { ...offer(150), url: url + "?variant=2" },
  ]);
  assert.equal(parseProduct(html(p), url + "?variant=2")?.price, 150);
  assert.throws(() => parseProduct(html(p), url), /several different prices/);
  assert.throws(
    () => parseProduct(html(p), url + "?variant=3"),
    /selected size or colour/,
  );
  assert.throws(
    () =>
      parseProduct(
        html(product({ lowPrice: 10, highPrice: 100, priceCurrency: "AUD" })),
        url,
      ),
    /different prices/,
  );
});
test("related product prices are never mistaken for the requested product", () => {
  const related = {
    ...product(offer(5)),
    url: "https://store.example/products/other",
  };
  assert.equal(parseProduct(html(related), url), null);
  assert.equal(
    parseProduct(html([related, product(offer(100))]), url)?.price,
    100,
  );
});
test("unit price specifications use the current price and ignore crossed out prices", () => {
  const result = parseProduct(
    html(
      product({
        priceSpecification: [
          {
            price: 200,
            priceCurrency: "AUD",
            priceType: "https://schema.org/StrikethroughPrice",
          },
          { price: 150, priceCurrency: "AUD" },
        ],
      }),
    ),
    url,
  );
  assert.equal(result?.price, 150);
});
test("product metadata provides a currency-qualified fallback without scraping arbitrary currency text", () => {
  const page = `<meta content="Headphones &amp; case" property="og:title"><meta property='product:price:amount' content='99.95'><meta content='AUD' property='product:price:currency'><meta property='og:image' content='/image.jpg'>`;
  assert.equal(parseProduct(page, url)?.price, 99.95);
  assert.equal(parseProduct(page, url)?.name, "Headphones & case");
  assert.equal(
    parseProduct(page, url)?.image,
    "https://store.example/image.jpg",
  );
  assert.equal(
    parseProduct(
      "<h1>Headphones</h1><p>$99.95 or 4 payments of $24.99</p>",
      url,
    ),
    null,
  );
});
test("Shopify adapter uses variant minor units and a known currency", () => {
  const p = {
    handle: "headphones",
    title: "Headphones",
    variants: [
      { id: 1, price: 10000, available: false },
      { id: 2, price: 14995, available: true },
    ],
    featured_image: "//cdn.example/headphones.jpg",
  };
  const page = `<script>Shopify.currency = {"active":"AUD"};</script><script type="application/json">${JSON.stringify(p)}</script>`;
  const result = parseProduct(page, url + "?variant=2");
  assert.equal(result?.price, 149.95);
  assert.equal(result?.availability, "In stock");
  assert.equal(result?.source, "Shopify product data");
  assert.throws(() => parseProduct(page, url), /specific size or colour/);
  assert.throws(
    () => parseProduct(page, url + "?variant=3"),
    /no longer available/,
  );
});
test("failed checks persist their reason without adding price history or price alerts", () => {
  const e = createEntry("products", {
    title: "Headphones",
    price: 100,
    targetPrice: 90,
    status: "Watching",
    lastChecked: "2026-09-01T00:00:00.000Z",
  });
  let state = applyMutation(emptyState(), {
    opId: uid(),
    action: "upsert",
    entry: e,
    expectedVersion: 0,
  });
  const saved = state.entries.find((r) => r.id === e.id)!;
  state = applyMutation(state, {
    opId: uid(),
    action: "upsert",
    entry: {
      ...saved,
      checkStatus: "failed",
      checkError: "Store denied access",
      lastCheckAttempt: new Date().toISOString(),
    },
    expectedVersion: saved.version,
  });
  const failed = state.entries.find((r) => r.id === e.id)!;
  assert.equal(failed.price, 100);
  assert.equal(failed.lastChecked, e.lastChecked);
  assert.deepEqual(failed.history, saved.history);
  assert.equal(failed.checkStatus, "failed");
  assert.equal(
    state.entries.filter((r) => r.kind === "notifications").length,
    0,
  );
});
