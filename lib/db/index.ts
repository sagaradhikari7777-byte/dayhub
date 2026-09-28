import postgres from "postgres";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Entry, Kind, Mutation, kinds } from "@/types";
import { alertReason, createEntry, nextDate, point } from "@/lib/model";
import { redisRepository, usesRedis } from "./redis";
import { ConflictError } from "./errors";
export { ConflictError } from "./errors";
type Row = { id: string; owner_id: string; data: string; version: number };
type Query = (
  sql: string,
  args?: unknown[],
) => Promise<Record<string, unknown>[]>;
const query: Query = (sql, args) => databaseQuery(sql, args);
let sqlite: Database.Database | undefined;
let pg: ReturnType<typeof postgres> | undefined;
let ready: Promise<void> | undefined;
function driver() {
  if (process.env.DATABASE_URL) {
    pg ??= postgres(process.env.DATABASE_URL, {
      max: 3,
      prepare: false,
      connect_timeout: 10,
    });
    return pg;
  }
  if (process.env.VERCEL)
    throw new Error("Database connection has not been configured");
  const path = process.env.DAYHUB_DATA_DIR || join(process.cwd(), ".data");
  mkdirSync(path, { recursive: true });
  sqlite ??= new Database(join(path, "dayhub.sqlite"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}
export async function databaseQuery(
  sql: string,
  args: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const db = driver();
  if (typeof db === "function")
    return (await db.unsafe(
      sql.replace(
        /\?/g,
        (() => {
          let i = 0;
          return () => `$${++i}`;
        })(),
      ),
      args as never[],
    )) as unknown as Record<string, unknown>[];
  const stmt = db.prepare(sql);
  return stmt.reader
    ? (stmt.all(...args) as Record<string, unknown>[])
    : (stmt.run(...args), []);
}
export async function initialize() {
  if (usesRedis()) return;
  ready ??= (async () => {
    await query(
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, created_at TEXT NOT NULL)",
    );
    for (const kind of kinds) {
      await query(
        `CREATE TABLE IF NOT EXISTS ${kind} (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`,
      );
      await query(
        `CREATE INDEX IF NOT EXISTS ${kind}_owner ON ${kind}(owner_id)`,
      );
    }
    await query(
      "CREATE TABLE IF NOT EXISTS product_price_history (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, price REAL NOT NULL, availability TEXT NOT NULL, retailer TEXT NOT NULL, recorded_at TEXT NOT NULL)",
    );
    await query(
      "CREATE INDEX IF NOT EXISTS price_history_product ON product_price_history(product_id, recorded_at)",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS notification_dedupes (owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, dedupe_key TEXT NOT NULL, notification_id TEXT NOT NULL, PRIMARY KEY(owner_id,dedupe_key))",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS push_receipts (subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE, notification_id TEXT NOT NULL, PRIMARY KEY(subscription_id,notification_id))",
    );
    await query(
      "CREATE TABLE IF NOT EXISTS mutations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  return ready;
}
async function ensureUser(owner: string, q: Query = query) {
  await q(
    "INSERT INTO users (id,created_at) VALUES (?,?) ON CONFLICT(id) DO NOTHING",
    [owner, new Date().toISOString()],
  );
}
export async function allEntries(owner: string) {
  if (usesRedis()) return redisRepository.entries(owner);
  await initialize();
  await ensureUser(owner);
  const results = await Promise.all(
    kinds.map((k) => query(`SELECT * FROM ${k} WHERE owner_id=?`, [owner])),
  );
  const entries = results.flat().map((r) => ({
    ...JSON.parse(r.data as string),
    version: r.version,
  })) as Entry[];
  const history = await query(
    "SELECT * FROM product_price_history WHERE owner_id=? ORDER BY recorded_at,id",
    [owner],
  );
  for (const e of entries)
    if (e.kind === "products")
      e.history = history
        .filter((p) => p.product_id === e.id)
        .map((p) => ({
          id: p.id as string,
          price: Number(p.price),
          availability: p.availability as string,
          retailer: p.retailer as string,
          recorded_at: p.recorded_at as string,
        }));
  return entries;
}
// Serialize SQLite transactions in one process; PostgreSQL locks the owner's row across instances.
let queue = Promise.resolve();
export async function mutate(owner: string, m: Mutation) {
  if (usesRedis()) return redisRepository.mutate(owner, m);
  await initialize();
  const run = async (q: Query) => {
    await ensureUser(owner, q);
    if (pg) await q("SELECT id FROM users WHERE id=? FOR UPDATE", [owner]);
    if (
      (
        await q("SELECT id FROM mutations WHERE id=? AND owner_id=?", [
          m.opId,
          owner,
        ])
      ).length
    )
      return;
    const collision = (
      await q(`SELECT owner_id FROM ${m.entry.kind} WHERE id=?`, [m.entry.id])
    )[0];
    if (collision && collision.owner_id !== owner)
      throw new ConflictError(
        "This identifier is unavailable. Create a new item.",
      );
    const existing = (
      await q(`SELECT * FROM ${m.entry.kind} WHERE id=? AND owner_id=?`, [
        m.entry.id,
        owner,
      ])
    )[0] as Row | undefined;
    if ((existing?.version || 0) !== m.expectedVersion)
      throw new ConflictError(
        "This item changed elsewhere. Your pending change is kept on this device.",
      );
    if (m.action === "delete") {
      await q(`DELETE FROM ${m.entry.kind} WHERE id=? AND owner_id=?`, [
        m.entry.id,
        owner,
      ]);
      if (m.entry.kind === "wishlists") {
        const products = await q("SELECT * FROM products WHERE owner_id=?", [
          owner,
        ]);
        for (const p of products) {
          const e = JSON.parse(p.data as string);
          if (e.wishlistId === m.entry.id) {
            delete e.wishlistId;
            await q(
              "UPDATE products SET data=?,version=version+1 WHERE id=? AND owner_id=?",
              [JSON.stringify(e), p.id, owner],
            );
          }
        }
      }
    } else {
      const before = existing
        ? (JSON.parse(existing.data) as Entry)
        : undefined;
      const entry = {
        ...m.entry,
        version: (existing?.version || 0) + 1,
        updated_at: new Date().toISOString(),
      };
      delete entry.history;
      await save(q, owner, entry);
      if (
        entry.kind === "products" &&
        m.restoreHistory &&
        m.entry.history?.length
      ) {
        await q(
          "DELETE FROM product_price_history WHERE product_id=? AND owner_id=?",
          [entry.id, owner],
        );
        for (const p of m.entry.history) {
          await q(
            "INSERT INTO product_price_history(id,product_id,owner_id,price,availability,retailer,recorded_at) VALUES (?,?,?,?,?,?,?)",
            [
              crypto.randomUUID(),
              entry.id,
              owner,
              p.price,
              p.availability,
              p.retailer,
              p.recorded_at,
            ],
          );
        }
      }
      if (entry.kind === "products" && !m.restoreHistory) {
        const h = await q(
          "SELECT * FROM product_price_history WHERE product_id=? AND owner_id=? ORDER BY recorded_at,id",
          [entry.id, owner],
        );
        if (
          !before ||
          before.price !== entry.price ||
          before.availability !== entry.availability ||
          before.lastChecked !== entry.lastChecked
        ) {
          const p = point(entry);
          if (h.length && String(h[h.length - 1].recorded_at) >= p.recorded_at)
            p.recorded_at = new Date(
              Date.parse(String(h[h.length - 1].recorded_at)) + 1,
            ).toISOString();
          await q(
            "INSERT INTO product_price_history(id,product_id,owner_id,price,availability,retailer,recorded_at) VALUES (?,?,?,?,?,?,?)",
            [
              p.id,
              entry.id,
              owner,
              p.price,
              p.availability,
              p.retailer,
              p.recorded_at,
            ],
          );
          if (before && entry.status !== "Stopped") {
            const reason = alertReason(
              { ...before, history: h as never },
              entry,
            );
            const settings = (
              await q("SELECT data FROM settings WHERE owner_id=?", [owner])
            )[0];
            const enabled =
              !settings ||
              JSON.parse(settings.data as string).profile?.notifications
                ?.products !== false;
            if (reason && enabled) {
              await save(
                q,
                owner,
                createEntry("notifications", {
                  title: `${reason}: ${entry.title}`,
                  body: `${before.price} → ${entry.price}`,
                  linkKind: "products",
                  linkId: entry.id,
                  read: false,
                  dedupe: `${entry.id}:${entry.version}`,
                }),
              );
              await save(
                q,
                owner,
                createEntry("activity_log", {
                  title: `${reason}: ${entry.title}`,
                  category: "products",
                  linkKind: "products",
                  linkId: entry.id,
                }),
              );
            }
          }
        }
      }
      if (
        before &&
        entry.recurrence &&
        entry.recurrence !== "none" &&
        ((entry.kind === "tasks" && entry.completed && !before.completed) ||
          (entry.kind === "bills" && entry.paid && !before.paid))
      ) {
        await save(
          q,
          owner,
          createEntry(entry.kind, {
            ...entry,
            id: crypto.randomUUID(),
            version: 1,
            completed: false,
            paid: false,
            date: nextDate(
              entry.date || new Date().toISOString().slice(0, 10),
              entry.recurrence,
              entry.customDays,
            ),
          }),
        );
      }
      if (!["activity_log", "notifications", "settings"].includes(entry.kind)) {
        const action =
          entry.kind === "tasks" && entry.completed
            ? "Completed"
            : entry.kind === "bills" && entry.paid
              ? "Paid"
              : entry.kind === "products" && entry.status === "Purchased"
                ? "Purchased"
                : before
                  ? "Updated"
                  : "Added";
        await save(
          q,
          owner,
          createEntry("activity_log", {
            title: `${action} ${entry.title}`,
            category: entry.kind,
            linkKind: entry.kind,
            linkId: entry.id,
          }),
        );
      }
    }
    await q("INSERT INTO mutations(id,owner_id,created_at) VALUES(?,?,?)", [
      m.opId,
      owner,
      new Date().toISOString(),
    ]);
  };
  if (pg) {
    await pg.begin(async (tx) => {
      const q: Query = async (s, a = []) =>
        (await tx.unsafe(
          s.replace(
            /\?/g,
            (() => {
              let i = 0;
              return () => `$${++i}`;
            })(),
          ),
          a as never[],
        )) as unknown as Record<string, unknown>[];
      await run(q);
    });
    return;
  }
  const task = queue.then(async () => {
    await query("BEGIN IMMEDIATE");
    try {
      await run(query);
      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }
  });
  queue = task.catch(() => {});
  await task;
}
async function save(q: Query, owner: string, e: Entry) {
  if (e.kind === "notifications" && e.dedupe) {
    const prior = (
      await q(
        "SELECT notification_id FROM notification_dedupes WHERE owner_id=? AND dedupe_key=?",
        [owner, e.dedupe],
      )
    )[0];
    if (prior && prior.notification_id !== e.id) return;
    await q(
      "INSERT INTO notification_dedupes(owner_id,dedupe_key,notification_id) VALUES (?,?,?) ON CONFLICT DO NOTHING",
      [owner, e.dedupe, e.id],
    );
  }
  await q(
    `INSERT INTO ${e.kind}(id,owner_id,data,version,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at WHERE ${e.kind}.owner_id=excluded.owner_id`,
    [e.id, owner, JSON.stringify(e), e.version || 1, e.updated_at],
  );
}
export async function owners() {
  if (usesRedis()) return redisRepository.owners();
  await initialize();
  return (await query("SELECT id FROM users")).map((r) => r.id as string);
}
export async function resetOwner(owner: string) {
  if (usesRedis()) return redisRepository.reset(owner);
  await initialize();
  await query("DELETE FROM users WHERE id=?", [owner]);
  await query("DELETE FROM mutations WHERE owner_id=?", [owner]);
}
