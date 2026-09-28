import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEntry,
  nextDate,
  occurs,
  alertReason,
  priceFacts,
  uid,
} from "../lib/model";
import { entrySchema } from "../lib/validation";
import { allEntries, mutate, ConflictError } from "../lib/db";
import { parseProduct } from "../lib/price-tracking/retailers/generic";
process.env.DAYHUB_DATA_DIR = mkdtempSync(join(tmpdir(), "dayhub-test-"));
// Tests always use an isolated SQLite directory, never a deployment database.
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.DAYHUB_STORAGE;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
test("month-end recurrence and yearly leap dates are clamped", () => {
  assert.equal(nextDate("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextDate("2024-02-29", "yearly"), "2025-02-28");
  assert.equal(nextDate("2026-09-27", "fortnightly"), "2026-10-11");
});
test("recurring events occur on correct days", () => {
  const e = createEntry("events", {
    title: "Weekly",
    date: "2026-09-27",
    recurrence: "weekly",
  });
  assert.equal(occurs(e, "2026-10-04"), true);
  assert.equal(occurs(e, "2026-10-05"), false);
});
test("validation rejects unsafe URLs, invalid dates, negative amounts and reversed times", () => {
  for (const patch of [
    { url: "javascript:alert(1)" },
    { url: "https://" },
    { url: "https://user:password@example.com" },
    { amount: -1 },
    { date: "2026-02-30" },
    { date: "2026-99-99" },
  ])
    assert.equal(
      entrySchema.safeParse(
        createEntry("bills", {
          title: "Bill",
          amount: 1,
          date: "2026-09-27",
          ...patch,
        }),
      ).success,
      false,
    );
  assert.equal(
    entrySchema.safeParse(
      createEntry("events", {
        title: "Meeting",
        date: "2026-09-27",
        time: "12:00",
        endTime: "11:00",
      }),
    ).success,
    false,
  );
});
test("price parser uses structured product offers", () => {
  const p = parseProduct(
    '<script type="application/ld+json">{"@type":"Product","name":"Headphones","offers":{"price":"199.50","priceCurrency":"AUD","availability":"https://schema.org/InStock"}}</script>',
    "https://example.com/item",
  );
  assert.equal(p?.price, 199.5);
  assert.equal(p?.availability, "In stock");
  assert.equal(
    parseProduct("<html>no price</html>", "https://example.com"),
    null,
  );
});
test("threshold alerts, restock, new low and summary math", () => {
  const before = createEntry("products", {
    title: "Watch",
    price: 200,
    targetPrice: 150,
    history: [
      {
        id: uid(),
        price: 200,
        retailer: "Store",
        availability: "In stock",
        recorded_at: new Date().toISOString(),
      },
    ],
  });
  assert.equal(
    alertReason(before, { ...before, price: 149 }),
    "Target reached",
  );
  assert.equal(
    alertReason(before, { ...before, price: 190, alert: "20% price drop" }),
    null,
  );
  assert.equal(
    alertReason(before, { ...before, price: 190, alert: "New lowest price" }),
    "New lowest price",
  );
  assert.equal(
    alertReason(
      { ...before, availability: "Out of stock" },
      { ...before, availability: "In stock", alert: "Back in stock" },
    ),
    "Back in stock",
  );
  assert.equal(
    priceFacts({
      ...before,
      history: [
        ...before.history!,
        { ...before.history![0], id: uid(), price: 150 },
      ],
    }).average,
    175,
  );
});
test("CRUD persists, is private, rejects stale writes, and retries are idempotent", async () => {
  const owner = uid(),
    other = uid();
  const e = createEntry("tasks", {
    title: "Call the test store",
    date: "2026-09-27",
  });
  const m = {
    opId: uid(),
    action: "upsert" as const,
    entry: e,
    expectedVersion: 0,
  };
  await mutate(owner, m);
  await mutate(owner, m);
  let data = await allEntries(owner);
  assert.equal(data.filter((x) => x.kind === "tasks").length, 1);
  assert.equal((await allEntries(other)).length, 0);
  const saved = data.find((x) => x.id === e.id)!;
  assert.equal(saved.version, 1);
  await mutate(owner, {
    ...m,
    opId: uid(),
    entry: { ...saved, title: "Edited task" },
    expectedVersion: 1,
  });
  await assert.rejects(
    () =>
      mutate(owner, {
        ...m,
        opId: uid(),
        entry: { ...saved, title: "Stale write" },
        expectedVersion: 1,
      }),
    ConflictError,
  );
  data = await allEntries(owner);
  assert.equal(data.find((x) => x.id === e.id)?.title, "Edited task");
  await mutate(owner, {
    opId: uid(),
    action: "delete",
    entry: data.find((x) => x.id === e.id)!,
    expectedVersion: 2,
  });
  assert.equal(
    (await allEntries(owner)).some((x) => x.id === e.id),
    false,
  );
});
test("price history and deduplicated target notifications are transactional", async () => {
  const owner = uid(),
    e = createEntry("products", {
      title: "Test glasses",
      price: 219,
      targetPrice: 180,
      retailer: "Store",
      availability: "In stock",
      status: "Watching",
    });
  await mutate(owner, {
    opId: uid(),
    action: "upsert",
    entry: e,
    expectedVersion: 0,
  });
  let product = (await allEntries(owner)).find((x) => x.id === e.id)!;
  const m = {
    opId: uid(),
    action: "upsert" as const,
    entry: { ...product, price: 179 },
    expectedVersion: 1,
  };
  await mutate(owner, m);
  await mutate(owner, m);
  let data = await allEntries(owner);
  product = data.find((x) => x.id === e.id)!;
  assert.equal(product.history?.length, 2);
  assert.equal(data.filter((x) => x.kind === "notifications").length, 1);
  assert.match(
    data.find((x) => x.kind === "notifications")!.title,
    /Target reached/,
  );
  await mutate(owner, {
    opId: uid(),
    action: "upsert",
    entry: { ...product, notes: "No price change" },
    expectedVersion: product.version,
  });
  data = await allEntries(owner);
  assert.equal(data.find((x) => x.id === e.id)?.history?.length, 2);
  assert.equal(data.filter((x) => x.kind === "notifications").length, 1);
});
test("completing a recurring task and paying a bill each creates exactly one successor", async () => {
  for (const kind of ["tasks", "bills"] as const) {
    const owner = uid(),
      e = createEntry(kind, {
        title: "Monthly item",
        date: "2026-01-31",
        recurrence: "monthly",
        amount: 69,
      });
    await mutate(owner, {
      opId: uid(),
      action: "upsert",
      entry: e,
      expectedVersion: 0,
    });
    let saved = (await allEntries(owner)).find((x) => x.id === e.id)!;
    await mutate(owner, {
      opId: uid(),
      action: "upsert",
      entry: {
        ...saved,
        ...(kind === "tasks" ? { completed: true } : { paid: true }),
      },
      expectedVersion: 1,
    });
    const data = (await allEntries(owner)).filter((x) => x.kind === kind);
    assert.equal(data.length, 2);
    assert.equal(data.find((x) => x.id !== e.id)?.date, "2026-02-28");
  }
});
test("backup restore keeps historical timestamps and values", async () => {
  const owner = uid(),
    e = createEntry("products", {
      title: "Imported price history",
      price: 150,
      history: [
        {
          id: uid(),
          price: 200,
          availability: "In stock",
          retailer: "Store",
          recorded_at: "2025-01-01T00:00:00.000Z",
        },
        {
          id: uid(),
          price: 150,
          availability: "In stock",
          retailer: "Store",
          recorded_at: "2025-03-01T00:00:00.000Z",
        },
      ],
    });
  await mutate(owner, {
    opId: uid(),
    action: "upsert",
    entry: e,
    expectedVersion: 0,
    restoreHistory: true,
  });
  const saved = (await allEntries(owner)).find((x) => x.id === e.id)!;
  assert.equal(saved.history?.[0].recorded_at, "2025-01-01T00:00:00.000Z");
  assert.equal(saved.history?.length, 2);
});
