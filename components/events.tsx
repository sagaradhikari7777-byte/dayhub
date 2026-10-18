"use client";

import {
  ArrowLeft,
  CalendarDays,
  Crown,
  Gift,
  Trophy,
  Users,
} from "lucide-react";
import {
  eventStatus,
  eventWinner,
  formatDate,
  pastEvents,
  statusLabel,
  upcomingEvents,
} from "@/lib/events";
import type { Tournament } from "@/lib/types";
import type { Actions, EventActions, EventTab } from "./app";
import { Bracket } from "./bracket";
import { Players } from "./players";
import { CwlView, EventRules } from "./cwl";
import { EventStats } from "./stats";
import { placement } from "@/lib/cwl";

export function StatusPill({ event }: { event: Tournament }) {
  const status = eventStatus(event);
  return (
    <span className={`pill ${status}`}>
      <span className="dot" />
      {statusLabel[status]}
    </span>
  );
}

function cwlPlaceText(event: Tournament, clanTag: string) {
  const snap = event.cwl!.snapshot!;
  const place = placement(snap, clanTag);
  if (!place) return "In the league";
  return snap.state === "ended"
    ? `Finished #${place} of ${snap.clans.length}`
    : `Currently #${place} of ${snap.clans.length}`;
}

export function EventCard({
  event,
  clanTag,
}: {
  event: Tournament;
  clanTag: string;
}) {
  const status = eventStatus(event);
  const winner = eventWinner(event);
  const winnerName = event.players.find((p) => p.tag === winner)?.name;
  const date = formatDate(event.startsAt);
  const fill = Math.min(100, (event.players.length / event.maxPlayers) * 100);
  return (
    <a className={`event-card ${status}`} href={`#event/${event.id}`}>
      <div className="event-card-top">
        <StatusPill event={event} />
        <span className="muted small">{formatLabel(event)}</span>
      </div>
      <h3 className="display">{event.name}</h3>
      {event.description && (
        <p className="event-desc muted small">{event.description}</p>
      )}
      <div className="event-meta">
        {date && (
          <span>
            <CalendarDays size={15} /> {date}
          </span>
        )}
        {event.prize && (
          <span>
            <Gift size={15} /> {event.prize}
          </span>
        )}
        <span>
          <Users size={15} /> {event.players.length}/{event.maxPlayers}
        </span>
      </div>
      {event.cwl?.snapshot ? (
        <div className="event-winner">
          <Trophy size={16} /> {cwlPlaceText(event, clanTag)}
        </div>
      ) : winnerName ? (
        <div className="event-winner">
          <Crown size={16} /> {winnerName}
        </div>
      ) : (
        <div className="meter" aria-hidden>
          <span style={{ width: `${fill}%` }} />
        </div>
      )}
      <span className="event-cta">
        {status === "open"
          ? "Register →"
          : status === "live"
            ? "Follow bracket →"
            : "View →"}
      </span>
    </a>
  );
}

export function EventsList({ state }: Actions) {
  const upcoming = upcomingEvents(state.hub);
  const past = pastEvents(state.hub);
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="display">Events</h1>
        <p className="muted">Tap an event to see its bracket and players.</p>
      </div>
      {upcoming.length ? (
        <div className="event-grid">
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} clanTag={state.hub.clanTag} />
          ))}
        </div>
      ) : (
        <div className="panel empty">
          <p>No upcoming events.</p>
        </div>
      )}
      {past.length > 0 && (
        <>
          <h2 className="display sub-head">Past events</h2>
          <div className="event-grid">
            {past.map((e) => (
              <EventCard key={e.id} event={e} clanTag={state.hub.clanTag} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatLabel(event: Tournament) {
  return event.kind === "cwl" ? "Clan War League" : `Best of ${event.format}`;
}

export function EventPage(props: EventActions & { tab: EventTab | null }) {
  const { event, state } = props;
  const cwl = event.kind === "cwl";
  const tabs: [EventTab, string][] = cwl
    ? [
        ["overview", "Overview"],
        ["rounds", "Rounds"],
        ["players", "Players"],
        ["rules", "Rules"],
      ]
    : [
        ["bracket", "Bracket"],
        ["players", `Players · ${event.players.length}`],
        ["stats", "Stats"],
        ["rules", "Rules"],
      ];
  const tab = tabs.find(([id]) => id === props.tab)?.[0] ?? tabs[0][0];
  const status = eventStatus(event);
  const date = formatDate(event.startsAt);
  const canRegister =
    status === "open" && event.players.length < event.maxPlayers;
  return (
    <div className="page">
      <a className="back" href="#events">
        <ArrowLeft size={16} /> Events
      </a>
      <section className="event-hero panel">
        <div className="event-hero-top">
          <StatusPill event={event} />
          <span className="muted small">{formatLabel(event)}</span>
        </div>
        <h1 className="display">{event.name}</h1>
        {event.description && <p className="muted">{event.description}</p>}
        <div className="event-meta">
          {date && (
            <span>
              <CalendarDays size={15} /> {date}
            </span>
          )}
          {event.prize && (
            <span>
              <Gift size={15} /> {event.prize}
            </span>
          )}
          {cwl && event.cwl?.snapshot ? (
            <span>
              <Trophy size={15} /> {cwlPlaceText(event, state.hub.clanTag)}
            </span>
          ) : (
            <span>
              <Users size={15} /> {event.players.length} of {event.maxPlayers}{" "}
              {cwl ? "signed up" : "players"}
            </span>
          )}
        </div>
        {canRegister && (
          <a className="btn primary" href={`#register/${event.id}`}>
            Register for this event
          </a>
        )}
      </section>
      <div className="segmented wide" role="tablist">
        {tabs.map(([id, label], n) => (
          <a
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            href={`#event/${event.id}${n ? `/${id}` : ""}`}
          >
            {label}
          </a>
        ))}
      </div>
      {cwl ? (
        <CwlView
          event={event}
          clanTag={state.hub.clanTag}
          tab={tab === "bracket" || tab === "stats" ? "overview" : tab}
        />
      ) : tab === "bracket" ? (
        <Bracket {...props} />
      ) : tab === "players" ? (
        <Players {...props} />
      ) : tab === "rules" ? (
        <EventRules rules={event.rules} />
      ) : (
        <EventStats event={event} />
      )}
    </div>
  );
}
