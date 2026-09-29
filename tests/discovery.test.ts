import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProduct } from "../lib/price-tracking/matching";
import {
  collectStoreOffers,
  parseStores,
} from "../lib/price-tracking/discovery";

test("matching excludes accessories, wrong generation, perfume size and condition", () => {
  assert.equal(
    matchProduct("Apple AirPods 3", "Apple AirPods Pro 3"),
    "different",
  );
  assert.equal(
    matchProduct("Apple AirPods Pro 3", "Apple AirPods Pro 3 White"),
    "likely",
  );
  for (const name of [
    "Apple AirPods Pro 2",
    "Case for Apple AirPods Pro 3",
    "Apple AirPods Pro 3 refurbished",
  ])
    assert.equal(matchProduct("Apple AirPods Pro 3", name), "different");
  assert.equal(
    matchProduct("Tom Ford Noir 35 ml", "Tom Ford Noir 50ml"),
    "different",
  );
  assert.equal(
    matchProduct("Sony WH-1000XM6 Black", "Sony WH1000XM6 Silver"),
    "different",
  );
  assert.equal(
    matchProduct("Sony WH-1000XM6 Black", "Sony WH1000XM6"),
    "possible",
  );
});
const query = "Apple AirPods Pro 3";
const search = {
  shopping_results: [
    {
      title: "Apple AirPods Pro 2",
      source: "Wrong model",
      price: "$99",
      extracted_price: 99,
      link: "https://wrong.example/item",
      immersive_product_page_token: "wrong",
    },
    {
      title: query,
      source: "Shop A",
      price: "$429",
      extracted_price: 429,
      link: "https://a.example/item",
      immersive_product_page_token: "right",
    },
  ],
};
test("one product discovers additional sellers without user-supplied store links", async () => {
  const calls: Record<string, string>[] = [];
  const result = await collectStoreOffers(query, async (params) => {
    calls.push(params);
    if (params.engine === "google_shopping") return search;
    assert.equal(params.page_token, "right");
    assert.equal(params.more_stores, "true");
    return {
      product_results: {
        stores: [
          {
            title: query,
            name: "Shop B",
            price: "$399",
            extracted_price: 399,
            link: "https://b.example/item",
            details_and_offers: ["In stock online", "Free delivery"],
          },
          {
            title: "Apple AirPods Pro 3 case",
            name: "Accessory",
            price: "$9",
            extracted_price: 9,
            link: "https://c.example/item",
          },
          {
            title: query,
            name: "Bad URL",
            price: "$1",
            extracted_price: 1,
            link: "javascript:alert(1)",
          },
        ],
      },
    };
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].gl, "au");
  assert.deepEqual(
    result.suggestions.map((s) => s.retailer),
    ["Shop B", "Shop A"],
  );
  assert.equal(result.suggestions[0].availability, "In stock");
  assert.equal(result.suggestions[0].match, "likely");
});
test("seller API failure retains available matching search offers with a warning", async () => {
  const result = await collectStoreOffers(query, async (params) => {
    if (params.engine === "google_shopping") return search;
    throw new Error("quota");
  });
  assert.equal(result.suggestions.length, 1);
  assert.ok(result.warning);
});
test("ambiguous matches do not trigger seller expansion", async () => {
  let calls = 0;
  await collectStoreOffers("Sony WH1000XM6 Black", async () => {
    calls++;
    return {
      shopping_results: [
        {
          title: "Sony WH1000XM6",
          source: "Shop",
          price: "$499",
          extracted_price: 499,
          link: "https://a.example/item",
          immersive_product_page_token: "ambiguous",
        },
      ],
    };
  });
  assert.equal(calls, 1);
});

test("live-result regressions: foreign storefronts and accessories cannot win comparison", async () => {
  assert.equal(
    matchProduct(query, "Apple AirPods Pro 3 ümbris Lamano Panther"),
    "different",
  );
  assert.equal(
    matchProduct(query, "さかべ 美品 Apple AirPods Pro 3"),
    "possible",
  );
  const store = {
    title: query,
    name: "Apple",
    price: "$376.40",
    extracted_price: 376.4,
  };
  assert.equal(
    parseStores({
      product_results: {
        stores: [
          {
            ...store,
            link: "https://www.apple.com/ph/shop/go/product/MFHP4ZA/A",
          },
          { ...store, link: "https://store.example/item?currency=USD" },
        ],
      },
    }).length,
    0,
  );
  const result = await collectStoreOffers(query, async (params) =>
    params.engine === "google_shopping"
      ? {
          shopping_results: [
            {
              title: query,
              source: "Unverified search hit",
              price: "$22",
              extracted_price: 22,
              product_link: "https://www.google.com/search?q=airpods",
            },
          ],
        }
      : {},
  );
  assert.equal(result.suggestions[0].match, "possible");
});
