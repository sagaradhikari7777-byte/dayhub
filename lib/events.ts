import { buildBracket, champion } from "./bracket";
import type { Hub, Tournament } from "./types";

export type EventStatus = "open" | "closed" | "live" | "finished";

export function eventStatus(event: Tournament): EventStatus {
  if (event.kind === "cwl" && event.cwl?.snapshot)
    return event.cwl.snapshot.state === "ended" ? "finished" : "live";
  if (event.bracket) {
    const rounds = buildBracket(
      event.bracket.order,
      event.results,
      event.format,
    );
    return champion(rounds) ? "finished" : "live";
  }
  return event.registrationOpen ? "open" : "closed";
}

export const statusLabel: Record<EventStatus, string> = {
  open: "Registration open",
  closed: "Registration closed",
  live: "In progress",
  finished: "Finished",
};

export function eventWinner(event: Tournament) {
  if (!event.bracket) return null;
  return champion(
    buildBracket(event.bracket.order, event.results, event.format),
  );
}

// Events that can still take sign-ups, soonest first.
export function openEvents(hub: Hub) {
  return sortByDate(
    hub.events.filter(
      (e) => eventStatus(e) === "open" && e.players.length < e.maxPlayers,
    ),
  );
}

export function upcomingEvents(hub: Hub) {
  return sortByDate(hub.events.filter((e) => eventStatus(e) !== "finished"));
}

export function pastEvents(hub: Hub) {
  return hub.events.filter((e) => eventStatus(e) === "finished").reverse();
}

function sortByDate(events: Tournament[]) {
  return [...events].sort((a, b) =>
    (a.startsAt ?? "9999").localeCompare(b.startsAt ?? "9999"),
  );
}

export function formatDate(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
