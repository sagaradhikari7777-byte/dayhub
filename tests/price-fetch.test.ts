import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, createConnection, type AddressInfo } from "node:net";
import { once } from "node:events";
import { pinnedLookup } from "../lib/price-tracking/fetch";
import { storeResponseError } from "../lib/price-tracking/errors";

test("store rejections distinguish blocked access, throttling and missing pages", () => {
  assert.equal(storeResponseError(403).code, "store_access_denied");
  assert.equal(storeResponseError(401).code, "store_access_denied");
  assert.equal(storeResponseError(429).code, "store_rate_limited");
  assert.equal(storeResponseError(404).code, "product_not_found");
  assert.equal(storeResponseError(503).code, "store_unavailable");
});

test("pinned DNS supports both Node callback shapes without resolving again", () => {
  const address = { address: "93.184.216.34", family: 4 };
  const lookup = pinnedLookup(address);
  lookup("example.com", { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [address]);
  });
  lookup("example.com", { all: false }, (error, ip, family) => {
    assert.equal(error, null);
    assert.equal(ip, address.address);
    assert.equal(family, 4);
  });
});

test("Node automatic family selection connects using the pinned lookup", async () => {
  // Loopback is intentional in this isolated transport test. safeFetch itself
  // continues to reject private addresses before constructing this callback.
  const server = createServer((socket) => socket.end());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = createConnection({
    host: "does-not-resolve.invalid",
    port: (server.address() as AddressInfo).port,
    autoSelectFamily: true,
    lookup: pinnedLookup({ address: "127.0.0.1", family: 4 }),
  });
  try {
    await once(client, "connect");
  } finally {
    client.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
