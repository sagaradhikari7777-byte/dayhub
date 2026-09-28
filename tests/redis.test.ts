import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRedisRepository,
  commitScript,
  readScript,
  type RedisCommand,
} from "../lib/db/redis";
import { applyMutation, emptyState } from "../lib/db/redis-state";
import { ConflictError } from "../lib/db/errors";
import { createEntry, uid } from "../lib/model";
import type { Entry, Mutation } from "../types";
import { sessionSecret } from "../lib/session-secret";

test("Upstash session signing is stable, domain-separated and refuses missing production secrets", () => {
  const env = {
    NODE_ENV: "test",
    VERCEL: "1",
    UPSTASH_REDIS_REST_TOKEN: "test-only-server-token",
  } as NodeJS.ProcessEnv;
  assert.equal(sessionSecret(env), sessionSecret(env));
  assert.notEqual(sessionSecret(env), env.UPSTASH_REDIS_REST_TOKEN);
  assert.notEqual(
    sessionSecret(env),
    sessionSecret({ ...env, UPSTASH_REDIS_REST_TOKEN: "other-test-token" }),
  );
  assert.equal(
    sessionSecret({ ...env, SESSION_SECRET: "explicit-test-secret" }),
    "explicit-test-secret",
  );
  assert.throws(() => sessionSecret({ NODE_ENV: "test", VERCEL: "1" }));
});

// A deterministic command transport exercises contention/retries without production credentials.
function storage() {
  const strings = new Map<string, string>([
    ["together:household", "keep Together data"],
  ]);
  const owners = new Set<string>();
  const command: RedisCommand = async (args) => {
    assert.equal(args[0], "EVAL");
    const key = String(args[3]);
    assert.ok(key.startsWith("dayhub:v1:{dayhub-v1}:"));
    if (args[1] === readScript) return strings.get(key) || null;
    if (args[1] === commitScript) {
      const previous = strings.get(key);
      if ((previous ? JSON.parse(previous).revision : 0) !== args[5]) return 0;
      strings.set(key, String(args[6]));
      owners.add(String(args[7]));
      return 1;
    }
    return [...owners];
  };
  return { repository: createRedisRepository(command), strings };
}
const write = (entry: Entry, version = 0): Mutation => ({
  opId: uid(),
  action: "upsert",
  entry,
  expectedVersion: version,
});

test("Redis persists every collection, isolates owners, and preserves Together keys after reset", async () => {
  const { repository: r, strings } = storage(),
    a = uid(),
    b = uid();
  for (const kind of [
    "tasks",
    "events",
    "bills",
    "expenses",
    "notes",
    "deliveries",
    "products",
    "wishlists",
  ] as const) {
    const e = createEntry(kind, {
      title: kind,
      date: "2026-09-28",
      amount: 69,
      price: 219,
    });
    await r.mutate(a, write(e));
    assert.ok((await r.entries(a)).some((x) => x.id === e.id));
  }
  assert.equal((await r.entries(b)).length, 0);
  await r.mutate(b, write(createEntry("notes", { title: "Other account" })));
  const before = (await r.read(a)).revision;
  await r.reset(a);
  assert.equal((await r.entries(a)).length, 0);
  assert.equal((await r.read(a)).revision, before + 1);
  assert.ok((await r.entries(b)).length > 0);
  assert.equal(strings.get("together:household"), "keep Together data");
});

test("Redis CAS retries concurrent different-item saves and rejects stale same-item edits", async () => {
  const { repository: r } = storage(),
    owner = uid();
  const e = createEntry("tasks", { title: "First" }),
    f = createEntry("notes", { title: "Second" });
  await Promise.all([r.mutate(owner, write(e)), r.mutate(owner, write(f))]);
  assert.ok((await r.entries(owner)).some((x) => x.id === e.id));
  assert.ok((await r.entries(owner)).some((x) => x.id === f.id));
  const result = await Promise.allSettled([
    r.mutate(owner, write({ ...e, title: "Edit A" }, 1)),
    r.mutate(owner, write({ ...e, title: "Edit B" }, 1)),
  ]);
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(result.filter((x) => x.status === "rejected").length, 1);
  await assert.rejects(() => r.mutate(owner, write(e, 1)), ConflictError);
});

test("Redis product history, alerts, recurrence and retry idempotency are atomic", async () => {
  const { repository: r } = storage(),
    owner = uid();
  let p = createEntry("products", {
    title: "Glasses",
    price: 219,
    targetPrice: 180,
    status: "Watching",
  });
  await r.mutate(owner, write(p));
  p = (await r.entries(owner)).find((x) => x.id === p.id)!;
  const drop = write({ ...p, price: 179 }, 1);
  await Promise.all([r.mutate(owner, drop), r.mutate(owner, drop)]);
  let entries = await r.entries(owner);
  assert.equal(entries.find((x) => x.id === p.id)?.history?.length, 2);
  assert.equal(entries.filter((x) => x.kind === "notifications").length, 1);
  for (const kind of ["tasks", "bills"] as const) {
    const task = createEntry(kind, {
      title: "Recurring",
      date: "2026-01-31",
      recurrence: "monthly",
      amount: 69,
    });
    await r.mutate(owner, write(task));
    const completed = write({ ...task, completed: true, paid: true }, 1);
    await r.mutate(owner, completed);
    await r.mutate(owner, completed);
    entries = await r.entries(owner);
    assert.equal(entries.filter((x) => x.kind === kind).length, 2);
    assert.equal(
      entries.find((x) => x.kind === kind && x.id !== task.id)?.date,
      "2026-02-28",
    );
  }
});

test("Redis preserves restored historical dates and supports notification clearing and wishlist deletion", () => {
  let state = emptyState();
  const list = createEntry("wishlists", { title: "Tech" });
  const product = createEntry("products", {
    title: "Watch",
    price: 150,
    wishlistId: list.id,
    history: [
      {
        id: uid(),
        price: 200,
        recorded_at: "2025-01-01T00:00:00.000Z",
        retailer: "Store",
        availability: "In stock",
      },
    ],
  });
  state = applyMutation(state, write(list));
  state = applyMutation(state, { ...write(product), restoreHistory: true });
  assert.equal(
    state.entries.find((x) => x.id === product.id)?.history?.[0].recorded_at,
    "2025-01-01T00:00:00.000Z",
  );
  state = applyMutation(state, { ...write(list, 1), action: "delete" });
  assert.equal(
    state.entries.find((x) => x.id === product.id)?.wishlistId,
    undefined,
  );
  const notification = createEntry("notifications", {
    title: "Reminder",
    dedupe: "same-reminder",
  });
  state = applyMutation(state, write(notification));
  state = applyMutation(state, { ...write(notification, 1), action: "delete" });
  state = applyMutation(state, write({ ...notification, id: uid() }));
  assert.equal(
    state.entries.filter((x) => x.kind === "notifications").length,
    0,
  );
});

test("Redis retains failed operations for callers to retry and never silently accepts contention", async () => {
  const owner = uid(),
    mutation = write(createEntry("tasks", { title: "Queued" }));
  const broken = createRedisRepository(async () => {
    throw new Error("Offline");
  });
  await assert.rejects(() => broken.mutate(owner, mutation), /Offline/);
  const contention = createRedisRepository(async (args) =>
    args[1] === readScript ? null : 0,
  );
  await assert.rejects(() => contention.mutate(owner, mutation), ConflictError);
});
