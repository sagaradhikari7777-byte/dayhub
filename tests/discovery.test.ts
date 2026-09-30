import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProduct } from "../lib/price-tracking/matching";
import {
  collectStoreOffers,
  parseStores,
  revalidateOffers,
  comparisonCachePolicy,
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

const dysonParts = [
  "Main Body Assembly Housing For Dyson V8 Vacuum Cleaner Central Chassis Structure With Motor And Component Mounting",
  "Turbo gizmo for Dyson V8",
  "Dyson Sv55 Filter V8 Cyclone Sv55-a Replaces Black Rear Motor Hepa",
  "Hepa filter for Dyson V7 and V8 cordless stick Vacuum cleaners",
  "Dustbin Spare Part for Dyson V8 V7 SV11 SV10 Series Vacuum Cleaners",
  "Dyson V8 Absolute Combination Tool for Animal & Motorhead Series",
  "Dyson V8 battery",
  "Dyson V8 charger",
  "Dyson V8 brush roller",
  "Dyson V8 wand",
  "Dyson V8 compatible vacuum cleaner",
];
test("screenshot regression: Dyson parts never match the complete vacuum", () => {
  for (const title of dysonParts) {
    assert.equal(matchProduct("Dyson V8", title), "different", title);
    assert.equal(
      matchProduct("Dyson V8 Cyclone SV55", title),
      "different",
      title,
    );
  }
  assert.equal(
    matchProduct("Dyson V8", "Dyson V8 Cordless Stick Vacuum Cleaner"),
    "likely",
  );
  assert.equal(
    matchProduct("Dyson V8", "Dyson V8 Vacuum Cleaner with HEPA filter"),
    "likely",
  );
  assert.equal(matchProduct("Dyson V8 filter", "Dyson V8 filter"), "likely");
  assert.equal(
    matchProduct("Dyson V8 filter", "Dyson V8 dustbin"),
    "different",
  );
});
test("identity checks reject sibling products and conflicting variants", () => {
  for (const [tracked, listing] of [
    ["Dyson V8", "Dyson V7 V8 Vacuum Cleaner"],
    ["Dyson V8 Absolute", "Dyson V8 Animal"],
    ["Dyson V8", "Dyson V8 Origin"],
    ["Dyson V8", "Dyson V8 Cyclone"],
    ["Tom Ford Noir 50ml", "Tom Ford Noir Extreme 50ml"],
    ["Tom Ford Noir EDP 50ml", "Tom Ford Noir EDT 50ml"],
    ["Tom Ford Noir 35ml", "Tom Ford Noir 35ml 50ml"],
    ["Sony WH1000XM6 Black", "Sony WH1000XM6 Silver"],
    ["Apple iPhone 17 256GB", "Apple iPhone 17 128GB"],
    ["Apple iPhone 17 256GB", "Apple iPhone 17 Pro 256GB"],
    ["Ray Ban Wayfarer", "Ray Ban Aviator"],
    ["Tom Ford Noir", "Tom Ford Oud Wood"],
    ["Apple AirPods Pro 3", "Apple AirPods Pro 3 2 pack"],
  ])
    assert.equal(
      matchProduct(tracked, listing),
      "different",
      `${tracked} vs ${listing}`,
    );
  assert.equal(
    matchProduct("Tom Ford Noir EDP 50 ml", "Tom Ford Noir Eau de Parfum 50ml"),
    "likely",
  );
  assert.equal(
    matchProduct(
      "Apple AirPods Pro 3",
      "Apple AirPods Pro 3 with MagSafe Charging Case",
    ),
    "likely",
  );
  assert.equal(matchProduct("Dyson V8", "Dyson V8 UnknownEdition"), "possible");
  assert.equal(
    matchProduct("Vacuum cleaner", "Cheap Vacuum Cleaner"),
    "possible",
  );
});
test("bad Dyson search hits are skipped before expansion and never returned", async () => {
  const calls: string[] = [];
  const row = (title: string, index: number) => ({
    title,
    source: `Store ${index}`,
    name: `Store ${index}`,
    price: "$32.10",
    extracted_price: 32.1,
    link: `https://shop.example/${index}`,
    immersive_product_page_token: String(index),
  });
  const correct = row("Dyson V8 Cordless Stick Vacuum Cleaner", 99);
  const result = await collectStoreOffers("Dyson V8", async (params) => {
    calls.push(params.engine);
    if (params.engine === "google_shopping")
      return { shopping_results: [...dysonParts.map(row), correct] };
    assert.equal(params.page_token, "99");
    return {
      product_results: {
        title: "Dyson V8",
        stores: [
          ...dysonParts.map(row),
          { ...correct, price: "$399", extracted_price: 399 },
          {
            name: "Missing seller title",
            price: "$9",
            extracted_price: 9,
            link: "https://shop.example/no-title",
          },
        ],
      },
    };
  });
  assert.equal(calls.length, 2);
  assert.equal(
    result.suggestions.some((s) => dysonParts.includes(s.title)),
    false,
  );
  assert.deepEqual(
    result.suggestions.filter((s) => s.match === "likely").map((s) => s.price),
    [399],
  );
  assert.equal(
    result.suggestions.find((s) => s.retailer === "Missing seller title")
      ?.match,
    "possible",
  );
  assert.ok(
    result.suggestions.find((s) => s.retailer === "Missing seller title")
      ?.matchReason,
  );
});
test("only accessory search hits produce an honest empty comparison", async () => {
  let calls = 0;
  const result = await collectStoreOffers("Dyson V8", async () => {
    calls++;
    return {
      shopping_results: dysonParts.map((title, i) => ({
        title,
        source: "Parts store",
        price: "$12",
        extracted_price: 12,
        link: `https://parts.example/${i}`,
        immersive_product_page_token: String(i),
      })),
    };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.suggestions, []);
});

test("cached offers are rechecked after matcher changes without provider calls", () => {
  const base = {
    retailer: "Store",
    price: 10,
    url: "https://shop.example/item",
    condition: "Condition not confirmed",
    delivery: "Unknown",
    match: "likely" as const,
  };
  const result = revalidateOffers("Dyson V8", {
    searchedAt: "2026-09-29T00:00:00Z",
    suggestions: [
      { ...base, title: dysonParts[0] },
      { ...base, title: "Dyson V8 Cyclone" },
      { ...base, title: "Dyson V8 Cordless Vacuum Cleaner", price: 399 },
      { ...base, title: "Dyson V8 UnknownEdition" },
    ],
  });
  assert.deepEqual(
    result.suggestions.map((s) => [s.title, s.match]),
    [
      ["Dyson V8 Cordless Vacuum Cleaner", "likely"],
      ["Dyson V8 UnknownEdition", "possible"],
    ],
  );
});

test("equivalent retailer spelling matches without accepting different variants", () => {
  assert.equal(
    matchProduct(
      "Ray-Ban Justin Polarised 55 mm Havana Dark Grey",
      "RayBan Justin Polarized 55mm Havana Dark Gray",
    ),
    "likely",
  );
  assert.equal(
    matchProduct(
      "Ray Ban Justin Polarised 55mm Havana",
      "RayBan Justin Polarized 54mm Havana",
    ),
    "different",
  );
  assert.equal(
    matchProduct(
      "Ray-Ban Justin Polarised 55mm Havana",
      "RayBan Wayfarer Polarized 55mm Havana",
    ),
    "different",
  );
  assert.equal(
    matchProduct(
      "Ray-Ban Justin Polarised",
      "Case for RayBan Justin Polarized",
    ),
    "different",
  );
});

test("empty verbose searches retry compact identity and retain strict matching", async () => {
  const calls: Record<string, string>[] = [];
  const title = "Ray-Ban Justin Polarised Sunglasses 55 mm Havana Dark Grey";
  const result = await collectStoreOffers(
    title,
    async (params) => {
      calls.push(params);
      if (calls.length === 1) return { shopping_results: [] };
      if (params.engine === "google_shopping")
        return {
          shopping_results: [
            {
              title: "RayBan Justin Polarized 55mm Havana Dark Gray",
              source: "Store",
              price: "A$176",
              extracted_price: 176,
              link: "https://store.example/justin",
              immersive_product_page_token: "justin",
            },
          ],
        };
      return {
        product_results: {
          stores: [
            {
              title: "RayBan Justin Polarized 55mm Havana Dark Gray",
              name: "Store",
              price: "A$176",
              extracted_price: 176,
              link: "https://store.example/justin",
            },
            {
              title: "RayBan Justin Polarized 54mm Havana Dark Gray",
              name: "Wrong size",
              price: "A$150",
              extracted_price: 150,
              link: "https://store.example/wrong",
            },
          ],
        },
      };
    },
    true,
  );
  assert.equal(calls.length, 3);
  assert.equal(calls[1].q, "rayban justin polarised 55mm havana dark grey");
  assert.ok(calls.every((p) => p.no_cache === "true"));
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].match, "likely");
});

test("refresh bypasses old empty caches while repeated taps are throttled", () => {
  const result = { suggestions: [], searchedAt: "2026-09-30T10:00:00Z" };
  assert.equal(
    comparisonCachePolicy(result, false, Date.parse("2026-09-30T11:00:00Z"))
      .reuse,
    true,
  );
  assert.equal(
    comparisonCachePolicy(result, true, Date.parse("2026-09-30T11:00:00Z"))
      .reuse,
    false,
  );
  assert.equal(
    comparisonCachePolicy(result, true, Date.parse("2026-09-30T10:00:30Z"))
      .reuse,
    true,
  );
  assert.equal(comparisonCachePolicy(result, false).ttl, 300);
  assert.equal(
    comparisonCachePolicy(
      { ...result, suggestions: [{ title: "Product" } as never] },
      false,
    ).ttl,
    21600,
  );
});

test("incomplete sizes remain unverified while explicit conflicts are rejected", () => {
  assert.equal(
    matchProduct(
      "Ray-Ban Justin Polarised 55mm Havana",
      "RayBan Justin Havana Sunglasses",
    ),
    "possible",
  );
  assert.equal(
    matchProduct("Tom Ford Noir EDP 50ml", "Tom Ford Noir EDP"),
    "possible",
  );
  assert.equal(
    matchProduct("Tom Ford Noir EDP 50ml", "Tom Ford Noir EDP 100ml"),
    "different",
  );
  assert.equal(
    matchProduct("Apple iPhone 17 256GB", "Apple iPhone 17"),
    "possible",
  );
  assert.equal(
    matchProduct("Apple AirPods Pro 3", "Apple AirPods Pro"),
    "different",
  );
});
