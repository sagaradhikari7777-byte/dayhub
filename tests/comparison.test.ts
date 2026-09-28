import { test } from "node:test";
import assert from "node:assert/strict";
import { createEntry, uid } from "../lib/model";
import {
  comparisonGroup,
  comparisonListings,
  listingUrlKey,
} from "../lib/price-tracking/comparison";
import { parseSuggestions } from "../lib/price-tracking/discovery";
import { entrySchema } from "../lib/validation";
test("store comparisons persist group membership and order available listings by price", () => {
  const first = createEntry("products", { title: "Headphones", price: 150 });
  first.comparisonGroupId = first.id;
  const second = createEntry("products", {
    title: "Headphones",
    price: 100,
    comparisonGroupId: first.id,
  });
  const unavailable = createEntry("products", {
    title: "Headphones",
    price: 50,
    availability: "Out of stock",
    comparisonGroupId: first.id,
  });
  const unrelated = createEntry("products", {
    title: "Different model",
    price: 1,
  });
  assert.equal(entrySchema.parse(second).comparisonGroupId, first.id);
  assert.deepEqual(
    comparisonListings(first, [first, second, unavailable, unrelated]).map(
      (e) => e.id,
    ),
    [second.id, first.id, unavailable.id],
  );
  assert.equal(comparisonGroup(second), comparisonGroup(first));
  const unlinked = { ...first, comparisonGroupId: uid() };
  assert.deepEqual(
    comparisonListings(second, [unlinked, second]).map((e) => e.id),
    [second.id],
  );
});
test("store URL deduplication removes tracking tags but preserves selected variants", () => {
  assert.equal(
    listingUrlKey("https://example.com/item?variant=2&utm_source=email#price"),
    listingUrlKey("https://example.com/item?variant=2"),
  );
  assert.notEqual(
    listingUrlKey("https://example.com/item?variant=1"),
    listingUrlKey("https://example.com/item?variant=2"),
  );
});
test("discovery normalisation rejects bad currencies and unsafe links, deduplicates, and sorts", () => {
  const offer = {
    title: "Headphones",
    source: "Shop",
    extracted_price: 149,
    price: "$149.00",
    product_link: "https://www.google.com/shopping/product/123",
  };
  const result = parseSuggestions({
    shopping_results: [
      offer,
      offer,
      { ...offer, source: "Other", extracted_price: 100, price: "A$100" },
      { ...offer, price: "US$149" },
      { ...offer, product_link: "javascript:alert(1)" },
      { ...offer, product_link: "https://secret:token@example.com" },
      { ...offer, extracted_price: null },
    ],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].price, 100);
  assert.equal(result[1].price, 149);
  assert.equal(result[0].condition, "Condition not confirmed");
});
