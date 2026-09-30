import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amazonAsin,
  amazonShareRedirect,
  parseAmazon,
} from "../lib/price-tracking/retailers/amazon";
const url = "https://www.amazon.com.au/Example/dp/B0ABC12345?th=1&psc=1";
const title = `<input id="ASIN" value="B0ABC12345"><span id="productTitle">Example headphones &amp; case</span>`;
const page = `${title}<div id="corePriceDisplay_desktop_feature_div"><span class="a-price a-text-price"><span class="a-offscreen">$299.00</span></span><span class="a-price priceToPay"><span class="a-offscreen">$179.95</span><span>$179</span></span></div><div id="availability"><span>In stock</span></div><img id="landingImage" src="https://m.media-amazon.com/images/example.jpg"><div id="recommendations"><span class="a-price"><span class="a-offscreen">$9.99</span></span></div>`;
test("Amazon AU parses selected payable price, name, image and stock", () => {
  assert.deepEqual(parseAmazon(page, url), {
    name: "Example headphones & case",
    price: 179.95,
    currency: "AUD",
    retailer: "Amazon",
    image: "https://m.media-amazon.com/images/example.jpg",
    availability: "In stock",
    source: "Amazon selected product price",
  });
});
test("Amazon never imports recommendations, list price or coupon savings as current price", () => {
  assert.equal(
    parseAmazon(
      `${title}<div id="recommendations"><span class="a-price"><span class="a-offscreen">$9.99</span></span></div>`,
      url,
    ),
    null,
  );
  assert.equal(
    parseAmazon(
      `${title}<div id="corePriceDisplay_desktop_feature_div"><span class="a-price a-text-price"><span class="a-offscreen">$299.00</span></span></div>`,
      url,
    ),
    null,
  );
});
test("Amazon variants, regions and fake Amazon hostnames cannot be confused", () => {
  assert.throws(
    () =>
      parseAmazon(
        page.replace('value="B0ABC12345"', 'value="B0OTHER123"'),
        url,
      ),
    /different product variant/,
  );
  assert.equal(
    parseAmazon(page, url.replace("amazon.com.au", "amazon.com")),
    null,
  );
  assert.equal(
    amazonAsin(url.replace("amazon.com.au", "amazon.com.au.evil.example")),
    null,
  );
  assert.equal(
    amazonAsin("https://www.amazon.com.au/gp/product/B0ABC12345"),
    "B0ABC12345",
  );
});
test("Amazon supports legacy prices and thousands without importing ambiguous currency", () => {
  assert.equal(
    parseAmazon(`${title}<span id="priceblock_ourprice">$1,299.50</span>`, url)
      ?.price,
    1299.5,
  );
  assert.equal(
    parseAmazon(`${title}<span id="priceblock_ourprice">US$129.95</span>`, url),
    null,
  );
  assert.equal(parseAmazon(`<title>Robot Check</title>`, url), null);
});
test("Amazon HTML share redirects are constrained to public AU product HTTPS links", () => {
  const short = "https://amzn.asia/d/0aZoMdvk";
  assert.equal(
    amazonShareRedirect(
      `<meta http-equiv="refresh" content="0;url=${url.replaceAll("&", "&amp;")}">`,
      short,
    ),
    url,
  );
  for (const bad of [
    "https://localhost/dp/B0ABC12345",
    "https://evil.example/dp/B0ABC12345",
    "http://www.amazon.com.au/dp/B0ABC12345",
    "https://user:pass@www.amazon.com.au/dp/B0ABC12345",
  ])
    assert.equal(
      amazonShareRedirect(
        `<meta http-equiv="refresh" content="0;url=${bad}">`,
        short,
      ),
      null,
    );
  assert.equal(
    amazonShareRedirect(
      `<meta http-equiv="refresh" content="0;url=${url}">`,
      "https://store.example",
    ),
    null,
  );
});
