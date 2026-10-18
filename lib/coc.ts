// Clash of Clans API client. Keys from developer.clashofclans.com are locked to
// IP addresses, which serverless hosts don't have fixed. By default requests go
// through RoyaleAPI's free proxy: create the key with its IP (45.79.218.79).

const TAG_CHARS = /^[0289PYLQGRJCUV]{3,12}$/;

export function normalizeTag(input: string) {
  const tag = input.trim().toUpperCase().replace(/^#/, "").replace(/O/g, "0");
  return TAG_CHARS.test(tag) ? `#${tag}` : null;
}

export function looksLikeTag(input: string) {
  return input.trim().startsWith("#") || normalizeTag(input) !== null;
}

export function cocConfigured() {
  return Boolean(process.env.COC_API_TOKEN);
}

export class CocError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 60_000;

async function get<T>(path: string): Promise<T> {
  const token = process.env.COC_API_TOKEN;
  if (!token)
    throw new CocError("The Clash of Clans API is not configured yet", 503);
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const base = (
    process.env.COC_API_BASE || "https://cocproxy.royaleapi.dev/v1"
  ).replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(base + path, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new CocError("Couldn't reach the Clash of Clans API", 502);
  }
  if (response.status === 404) throw new CocError("Not found", 404);
  if (response.status === 403)
    throw new CocError(
      "The Clash of Clans API rejected the key (check its allowed IP)",
      502,
    );
  if (response.status === 429)
    throw new CocError("Too many requests, try again in a moment", 429);
  if (!response.ok)
    throw new CocError("The Clash of Clans API is unavailable", 502);
  const value = (await response.json()) as T;
  cache.set(path, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

const enc = (tag: string) => encodeURIComponent(tag);

type RawBadge = { small?: string; medium?: string };
type RawClan = {
  tag: string;
  name: string;
  clanLevel?: number;
  members?: number;
  badgeUrls?: RawBadge;
  location?: { name?: string };
  description?: string;
  warWins?: number;
  isWarLogPublic?: boolean;
  warLeague?: { name?: string };
};
type RawMember = {
  tag: string;
  name: string;
  role?: string;
  townHallLevel?: number;
  expLevel?: number;
  trophies?: number;
};
type RawPlayer = RawMember & { clan?: { tag: string; name: string } };

export type ClanSummary = {
  tag: string;
  name: string;
  level: number | null;
  members: number | null;
  badge: string | null;
  location: string | null;
  description: string | null;
  warWins: number | null;
  warLeague: string | null;
};
export type MemberSummary = {
  tag: string;
  name: string;
  role: string | null;
  townHallLevel: number | null;
  trophies: number | null;
};
export type PlayerSummary = MemberSummary & {
  clanTag: string | null;
  clanName: string | null;
};

const clanSummary = (c: RawClan): ClanSummary => ({
  tag: c.tag,
  name: c.name,
  level: c.clanLevel ?? null,
  members: c.members ?? null,
  badge: c.badgeUrls?.small ?? null,
  location: c.location?.name ?? null,
  description: c.description?.trim() || null,
  warWins: c.isWarLogPublic === false ? null : (c.warWins ?? null),
  warLeague: c.warLeague?.name ?? null,
});

const memberSummary = (m: RawMember): MemberSummary => ({
  tag: m.tag,
  name: m.name,
  role: m.role ?? null,
  townHallLevel: m.townHallLevel ?? null,
  trophies: m.trophies ?? null,
});

export async function findClans(query: string): Promise<ClanSummary[]> {
  const tag = normalizeTag(query);
  if (tag && looksLikeTag(query)) {
    try {
      return [clanSummary(await get<RawClan>(`/clans/${enc(tag)}`))];
    } catch (error) {
      if (!(error instanceof CocError) || error.status !== 404) throw error;
      if (query.trim().startsWith("#")) return [];
    }
  }
  const name = query.trim();
  if (name.length < 3) return [];
  const data = await get<{ items: RawClan[] }>(
    `/clans?name=${encodeURIComponent(name)}&limit=15`,
  );
  return data.items.map(clanSummary);
}

export async function clanMembers(tag: string) {
  const clan = await get<RawClan & { memberList?: RawMember[] }>(
    `/clans/${enc(tag)}`,
  );
  return {
    clan: clanSummary(clan),
    members: (clan.memberList ?? []).map(memberSummary),
  };
}

export async function player(tag: string): Promise<PlayerSummary> {
  const p = await get<RawPlayer>(`/players/${enc(tag)}`);
  return {
    ...memberSummary(p),
    clanTag: p.clan?.tag ?? null,
    clanName: p.clan?.name ?? null,
  };
}
