import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tournament } from "./types";

// The whole tournament is one small JSON document. Production uses Upstash
// Redis (the existing Vercel integration); local development uses a file.

const KEY = "clancup:v1:tournament";
export const DEFAULT_CLAN = "#U0Y0R2GC";
const FILE = path.join(process.cwd(), ".data", "clancup.json");

export function emptyTournament(): Tournament {
  return {
    revision: 0,
    name: "Clan Cup",
    format: 3,
    registrationOpen: true,
    maxPlayers: 64,
    clanTag: DEFAULT_CLAN,
    players: [],
    bracket: null,
    results: {},
    updatedAt: new Date().toISOString(),
  };
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

function parse(raw: unknown): Tournament {
  if (raw === null || raw === undefined) return emptyTournament();
  if (typeof raw !== "string") throw new StorageError("Invalid stored data");
  return { ...emptyTournament(), ...(JSON.parse(raw) as Tournament) };
}

export async function readTournament(): Promise<Tournament> {
  if (redisEnv()) return parse(await redis(["GET", KEY]));
  if (process.env.VERCEL)
    throw new StorageError(
      "No database connected. Connect Upstash Redis to this Vercel project.",
    );
  try {
    return parse(await readFile(FILE, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyTournament();
    throw error;
  }
}

let fileQueue: Promise<unknown> = Promise.resolve();

async function write(previous: number, next: Tournament) {
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
  const current = await readTournament();
  if (current.revision !== previous)
    throw new ConflictError("Changed by someone else");
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE + ".tmp", JSON.stringify(next, null, 2));
  await rename(FILE + ".tmp", FILE);
}

// Applies `change` to the latest state and saves it, retrying on a conflict.
export async function updateTournament(
  change: (t: Tournament) => Tournament,
): Promise<Tournament> {
  const run = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await readTournament();
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
