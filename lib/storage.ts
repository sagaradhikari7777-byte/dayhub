import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Hub, Tournament } from "./types";

// Everything (clan, rules, events) is one small JSON document. Production uses
// Upstash Redis (the existing Vercel integration); development uses a file.

const KEY = "clancup:v2:hub";
// The single-tournament document from before events existed.
const LEGACY_KEY = "clancup:v1:tournament";
export const DEFAULT_CLAN = "#U0Y0R2GC";
const FILE = path.join(process.cwd(), ".data", "clancup-hub.json");
const LEGACY_FILE = path.join(process.cwd(), ".data", "clancup.json");

export const DEFAULT_RULES = [
  "Stay in the clan for the whole event. Leaving the clan means you forfeit.",
  "Each game, both players attack each other's base once in a friendly challenge.",
  "A game is won on stars, then destruction %, then the faster attack time.",
  "Win the majority of games to take the match (2 in a best of 3, 3 in a best of 5).",
  "Play your match before the round deadline. A no-show loses by walkover.",
  "Send a screenshot of every attack result to an admin.",
  "Admin decisions are final.",
];

export function newEvent(name: string, id?: string): Tournament {
  return {
    id: id ?? randomUUID().slice(0, 8),
    name,
    description: "",
    startsAt: null,
    prize: "",
    format: 3,
    registrationOpen: true,
    maxPlayers: 64,
    players: [],
    bracket: null,
    results: {},
    createdAt: new Date().toISOString(),
  };
}

export function emptyHub(): Hub {
  return {
    revision: 0,
    clanTag: DEFAULT_CLAN,
    rules: DEFAULT_RULES,
    // A fixed id: until the first save this event is rebuilt on every read,
    // and pages and registrations refer to it by id in between.
    events: [newEvent("Clan Cup", "clan-cup")],
    updatedAt: new Date().toISOString(),
  };
}

// Turns the old single tournament into the first event, keeping its players
// and results.
export function migrateLegacy(raw: string): Hub {
  const old = JSON.parse(raw) as Partial<Tournament> & { clanTag?: string };
  const hub = emptyHub();
  const event = hub.events[0];
  for (const key of [
    "name",
    "format",
    "registrationOpen",
    "maxPlayers",
    "players",
    "bracket",
    "results",
  ] as const)
    if (old[key] !== undefined) Object.assign(event, { [key]: old[key] });
  if (old.clanTag) hub.clanTag = old.clanTag;
  return hub;
}

function redisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function storageKind(): "upstash" | "file" {
  return redisEnv() ? "upstash" : "file";
}

export class StorageError extends Error {}
export class ConflictError extends Error {}

async function redis(command: (string | number)[]) {
  const env = redisEnv()!;
  const url = new URL(env.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io"))
    throw new StorageError("Invalid Upstash endpoint");
  const response = await fetch(url.origin, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new StorageError("Storage is temporarily unavailable");
  const payload = (await response.json()) as {
    result?: unknown;
    error?: string;
  };
  if (payload.error) throw new StorageError("Storage operation failed");
  return payload.result;
}

// Writes only if the stored revision still matches, so two admins saving at
// the same moment can't overwrite each other.
const casScript = `
local old = redis.call('GET', KEYS[1])
local revision = 0
if old then revision = cjson.decode(old).revision end
if revision ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

function parse(raw: unknown, legacy: unknown): Hub {
  if (typeof raw === "string")
    return { ...emptyHub(), ...(JSON.parse(raw) as Hub) };
  if (raw !== null && raw !== undefined)
    throw new StorageError("Invalid stored data");
  // Not saved since events were added: start from the old tournament if any.
  return typeof legacy === "string" ? migrateLegacy(legacy) : emptyHub();
}

async function readFileOrNull(file: string) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readHub(): Promise<Hub> {
  if (redisEnv()) {
    const raw = await redis(["GET", KEY]);
    return parse(raw, raw === null ? await redis(["GET", LEGACY_KEY]) : null);
  }
  if (process.env.VERCEL)
    throw new StorageError(
      "No database connected. Connect Upstash Redis to this Vercel project.",
    );
  const raw = await readFileOrNull(FILE);
  return parse(raw, raw === null ? await readFileOrNull(LEGACY_FILE) : null);
}

let fileQueue: Promise<unknown> = Promise.resolve();

async function write(previous: number, next: Hub) {
  if (redisEnv()) {
    const ok = await redis([
      "EVAL",
      casScript,
      1,
      KEY,
      previous,
      JSON.stringify(next),
    ]);
    if (ok !== 1) throw new ConflictError("Changed by someone else");
    return;
  }
  const current = await readHub();
  if (current.revision !== previous)
    throw new ConflictError("Changed by someone else");
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE + ".tmp", JSON.stringify(next, null, 2));
  await rename(FILE + ".tmp", FILE);
}

// Applies `change` to the latest state and saves it, retrying on a conflict.
export async function updateHub(change: (hub: Hub) => Hub): Promise<Hub> {
  const run = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await readHub();
      const next = change(structuredClone(current));
      next.revision = current.revision + 1;
      next.updatedAt = new Date().toISOString();
      try {
        await write(current.revision, next);
        return next;
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
      }
    }
    throw new ConflictError("Busy, please try again");
  };
  if (redisEnv()) return run();
  const result = fileQueue.then(run, run);
  fileQueue = result.catch(() => undefined);
  return result;
}
