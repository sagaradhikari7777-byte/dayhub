"use client";

import { ArrowLeft, CalendarDays, Crown, Gift, Users } from "lucide-react";
import {
  eventStatus,
  eventWinner,
  formatDate,
  pastEvents,
  statusLabel,
  upcomingEvents,
} from "@/lib/events";
import type { Tournament } from "@/lib/types";
import type { Actions, EventActions } from "./app";
import { Bracket } from "./bracket";
import { Players } from "./players";

export function StatusPill({ event }: { event: Tournament }) {
  const status = eventStatus(event);
  return (
    <span className={`pill ${status}`}>
      <span className="dot" />
      {statusLabel[status]}
    </span>
  );
}

export function EventCard({ event }: { event: Tournament }) {
  const status = eventStatus(event);
  const winner = eventWinner(event);
  const winnerName = event.players.find((p) => p.tag === winner)?.name;
  const date = formatDate(event.startsAt);
  const fill = Math.min(100, (event.players.length / event.maxPlayers) * 100);
  return (
    <a className={`event-card ${status}`} href={`#event/${event.id}`}>
      <div className="event-card-top">
        <StatusPill event={event} />
        <span className="muted small">Best of {event.format}</span>
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
      {winnerName ? (
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
            <EventCard key={e.id} event={e} />
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
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function EventPage(
  props: EventActions & { tab: "bracket" | "players" },
) {
  const { event, tab } = props;
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
          <span className="muted small">Best of {event.format}</span>
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
          <span>
            <Users size={15} /> {event.players.length} of {event.maxPlayers}{" "}
            players
          </span>
        </div>
        {canRegister && (
          <a className="btn primary" href={`#register/${event.id}`}>
            Register for this event
          </a>
        )}
      </section>
      <div className="segmented wide" role="tablist">
        <a
          role="tab"
          aria-selected={tab === "bracket"}
          className={tab === "bracket" ? "active" : ""}
          href={`#event/${event.id}`}
        >
          Bracket
        </a>
        <a
          role="tab"
          aria-selected={tab === "players"}
          className={tab === "players" ? "active" : ""}
          href={`#event/${event.id}/players`}
        >
          Players · {event.players.length}
        </a>
      </div>
      {tab === "bracket" ? <Bracket {...props} /> : <Players {...props} />}
    </div>
  );
}
