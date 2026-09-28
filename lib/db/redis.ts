import type { Mutation } from "@/types";
import { applyMutation, emptyState, type RedisState } from "./redis-state";
import { ConflictError } from "./errors";

// All keys live in a fixed, app-specific namespace. Never scan, reset or modify Together keys.
const prefix = "dayhub:v1:{dayhub-v1}";
const ownersKey = `${prefix}:owners`;
function ownerKey(owner: string) {
  if (!/^[a-f0-9-]{36}$/i.test(owner))
    throw new Error("Invalid account identifier");
  return `${prefix}:owner:${owner}`;
}
export function redisConfigured() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN) ||
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
  );
}
export function usesRedis() {
  return (
    process.env.DAYHUB_STORAGE === "upstash" ||
    (!process.env.DATABASE_URL && redisConfigured())
  );
}
export type RedisCommand = (command: (string | number)[]) => Promise<unknown>;
export const redisCommand: RedisCommand = async (command) => {
  const endpoint =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!endpoint || !token)
    throw new Error("Upstash connection is not configured");
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.endsWith(".upstash.io")
  )
    throw new Error("Invalid Upstash endpoint");
  const response = await fetch(url.origin, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error("Upstash storage is temporarily unavailable");
  const payload = await response.json();
  if (payload.error)
    throw new Error("Upstash could not complete the storage operation");
  return payload.result;
};

// EVAL reads from the primary. Revision comparison and both writes are indivisible.
export const readScript = "return redis.call('GET', KEYS[1])";
export const commitScript = `
local old = redis.call('GET', KEYS[1])
local revision = 0
if old then revision = cjson.decode(old).revision end
if revision ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SADD', KEYS[2], ARGV[3])
return 1`;

export function createRedisRepository(command: RedisCommand) {
  const read = async (owner: string): Promise<RedisState> => {
    const raw = await command(["EVAL", readScript, 1, ownerKey(owner)]);
    if (raw === null) return emptyState();
    if (typeof raw !== "string") throw new Error("Invalid stored account");
    const state = JSON.parse(raw) as RedisState;
    if (!Number.isSafeInteger(state.revision) || !Array.isArray(state.entries))
      throw new Error("Invalid stored account");
    return state;
  };
  const update = async (
    owner: string,
    transform: (state: RedisState) => RedisState,
  ) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const state = await read(owner);
      const next = transform(state);
      if (next === state) return;
      next.revision = state.revision + 1;
      const value = JSON.stringify(next);
      if (Buffer.byteLength(value) > 8_000_000)
        throw new Error(
          "This account is too large for this storage adapter. Export a backup before changing storage.",
        );
      if (
        Number(
          await command([
            "EVAL",
            commitScript,
            2,
            ownerKey(owner),
            ownersKey,
            state.revision,
            value,
            owner,
          ]),
        ) === 1
      )
        return;
    }
    throw new ConflictError(
      "Another save is still in progress. Your change remains queued; please retry.",
    );
  };
  return {
    read,
    update,
    entries: async (owner: string) => (await read(owner)).entries,
    mutate: async (owner: string, mutation: Mutation) =>
      update(owner, (state) => applyMutation(state, mutation)),
    owners: async () =>
      (await command([
        "EVAL",
        "return redis.call('SMEMBERS', KEYS[1])",
        1,
        ownersKey,
      ])) as string[],
    // Keep a revision tombstone so an in-flight pre-reset write cannot win an ABA race.
    reset: async (owner: string) => update(owner, () => emptyState()),
  };
}
export const redisRepository = createRedisRepository(redisCommand);
