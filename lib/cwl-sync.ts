import { cocConfigured, CocError, cocGet } from "./coc";
import {
  lastWarEnd,
  normalizeGroup,
  normalizeWar,
  openWarTags,
  sameSeason,
  scheduled,
  seasonFinal,
  withWars,
  type CwlSnapshot,
  type CwlWar,
  type RawLeagueGroup,
  type RawWar,
} from "./cwl";
import { newCwlEvent, readHub, updateHub } from "./storage";
import type { Hub } from "./types";

// How often to ask the API about CWL. Reads trigger the check (after the
// response is sent), so there's no scheduler to run.
const CHECK_ACTIVE_MS = 3 * 60_000;
const CHECK_IDLE_MS = 20 * 60_000;

// A season that can't be completed (the game no longer has its wars) stops
// counting as active a few days after its last war.
const STALE_MS = 3 * 24 * 60 * 60_000;

// The newest saved season that isn't final yet.
function openSeason(hub: Hub): CwlSnapshot | null {
  return (
    hub.events
      .flatMap((e) => (e.kind === "cwl" && e.cwl?.snapshot ? [e.cwl] : []))
      .filter((c) => !seasonFinal(c.snapshot!))
      .sort((a, b) => b.season.localeCompare(a.season))[0]?.snapshot ?? null
  );
}

export function cwlCheckDue(hub: Hub, now = Date.now()) {
  if (!cocConfigured()) return false;
  const open = openSeason(hub);
  const end = open ? lastWarEnd(open) : null;
  const active = Boolean(open) && (end === null || now - end < STALE_MS);
  const last = hub.cwlCheckedAt ? Date.parse(hub.cwlCheckedAt) : 0;
  return now - last > (active ? CHECK_ACTIVE_MS : CHECK_IDLE_MS);
}

let running: Promise<unknown> | null = null;

// Fetches the current league group and its wars, then saves them into the
// season's CWL event, creating the event if needed. Returns the hub.
export function syncCwl(force = false): Promise<Hub> {
  if (running) return running as Promise<Hub>;
  const job = (async () => {
    const hub = await readHub();
    if (!force && !cwlCheckDue(hub)) return hub;
    let snapshot: CwlSnapshot | null = null;
    let failure: unknown = null;
    try {
      snapshot = await fetchSnapshot(hub);
    } catch (error) {
      // Still record the check, so an API outage doesn't make every visit
      // retry straight away.
      failure = error;
    }
    const saved = await updateHub((h) => {
      h.cwlCheckedAt = new Date().toISOString();
      if (!snapshot) return h;
      let event = h.events.find(
        (e) =>
          e.kind === "cwl" &&
          e.cwl &&
          sameSeason(e.cwl.season, snapshot.season),
      );
      // A finished season is frozen: its final standings are never rewritten.
      if (event?.cwl?.snapshot && seasonFinal(event.cwl.snapshot)) return h;
      if (!event) {
        event = newCwlEvent(snapshot.season);
        h.events.push(event);
      }
      event.cwl = {
        season: event.cwl?.season ?? snapshot.season,
        snapshot,
        syncedAt: new Date().toISOString(),
      };
      // Sign-ups close once the league has started.
      event.registrationOpen = false;
      if (!event.startsAt) {
        const first = snapshot.rounds.flat().find((w) => w.startTime);
        event.startsAt = first?.startTime?.slice(0, 10) ?? null;
      }
      return h;
    });
    if (failure) throw failure;
    return saved;
  })();
  running = job.finally(() => (running = null));
  return job;
}

async function fetchSnapshot(hub: Hub): Promise<CwlSnapshot | null> {
  const clanTag = hub.clanTag;
  let group: RawLeagueGroup;
  try {
    group = await cocGet<RawLeagueGroup>(
      `/clans/${encodeURIComponent(clanTag)}/currentwar/leaguegroup`,
    );
  } catch (error) {
    if (!(error instanceof CocError && error.status === 404)) throw error;
    // No league group: either the clan isn't in CWL, or the season is over.
    // The game drops the group soon after the last round, sometimes before
    // that round's results were loaded here, but the wars themselves stay
    // available by tag. Finish the saved season from those.
    const open = openSeason(hub);
    if (!open) return null;
    return withWars(
      open,
      await fetchWars(openWarTags(open), new Map(), clanTag),
    );
  }

  // Wars that have ended never change, so reuse the saved copies.
  const saved = new Map<string, CwlWar>();
  for (const e of hub.events)
    if (e.cwl?.snapshot?.season === group.season)
      for (const w of e.cwl.snapshot.rounds.flat())
        if (w.state === "warEnded") saved.set(w.warTag, w);

  const tags = group.rounds
    .flatMap((r) => r.warTags)
    .filter((t) => scheduled(t) && !saved.has(t));
  return normalizeGroup(group, await fetchWars(tags, new Map(saved), clanTag));
}

// Loads wars by tag into `wars`. A war the API no longer has is left out.
async function fetchWars(
  tags: string[],
  wars: Map<string, CwlWar>,
  clanTag: string,
) {
  // A few at a time to stay well inside the API's rate limit.
  for (let i = 0; i < tags.length; i += 4)
    await Promise.all(
      tags.slice(i, i + 4).map(async (tag) => {
        try {
          const raw = await cocGet<RawWar>(
            `/clanwarleagues/wars/${encodeURIComponent(tag)}`,
          );
          wars.set(tag, normalizeWar(tag, raw, clanTag));
        } catch (error) {
          if (!(error instanceof CocError && error.status === 404)) throw error;
        }
      }),
    );
  return wars;
}
