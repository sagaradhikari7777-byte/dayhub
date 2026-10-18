import { cocConfigured, CocError, cocGet } from "./coc";
import {
  normalizeGroup,
  normalizeWar,
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

export function cwlCheckDue(hub: Hub, now = Date.now()) {
  if (!cocConfigured()) return false;
  const active = hub.events.some(
    (e) =>
      e.kind === "cwl" && e.cwl?.snapshot && e.cwl.snapshot.state !== "ended",
  );
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
    const snapshot = await fetchSnapshot(hub);
    return updateHub((h) => {
      h.cwlCheckedAt = new Date().toISOString();
      if (!snapshot) return h;
      let event = h.events.find(
        (e) => e.kind === "cwl" && e.cwl?.season === snapshot.season,
      );
      if (!event) {
        event = newCwlEvent(snapshot.season);
        h.events.push(event);
      }
      event.cwl = {
        season: snapshot.season,
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
    // Not in CWL right now.
    if (error instanceof CocError && error.status === 404) return null;
    throw error;
  }

  // Wars that have ended never change, so reuse the saved copies.
  const saved = new Map<string, CwlWar>();
  for (const e of hub.events)
    if (e.cwl?.snapshot?.season === group.season)
      for (const w of e.cwl.snapshot.rounds.flat())
        if (w.state === "warEnded") saved.set(w.warTag, w);

  const tags = group.rounds
    .flatMap((r) => r.warTags)
    .filter((t) => t && t !== "#0" && !saved.has(t));
  const wars = new Map(saved);
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
  return normalizeGroup(group, wars);
}
