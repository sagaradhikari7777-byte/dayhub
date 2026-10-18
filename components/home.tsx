"use client";

import {
  ArrowRight,
  ScrollText,
  Shield,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { openEvents, pastEvents, upcomingEvents } from "@/lib/events";
import type { Actions } from "./app";
import { useClan } from "./clan";
import { EventCard } from "./events";

export function Home(actions: Actions) {
  const { state } = actions;
  const hub = state.hub;
  const { data } = useClan(hub.clanTag, state.apiConfigured);
  const clan = data?.clan;
  const upcoming = upcomingEvents(hub);
  const past = pastEvents(hub);
  const open = openEvents(hub);
  const registered = new Set(
    upcoming.flatMap((e) => e.players.map((p) => p.tag)),
  ).size;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-glow" aria-hidden />
        <div className="hero-body">
          {clan?.badgeLarge ? (
            <img
              className="hero-badge"
              src={clan.badgeLarge}
              alt=""
              width={112}
              height={112}
            />
          ) : (
            <span className="hero-badge placeholder">
              <Shield size={48} />
            </span>
          )}
          <div className="hero-text">
            <span className="eyebrow">Clan tournaments</span>
            <h1 className="display">{clan?.name ?? "Clan Cup"}</h1>
            <p className="muted">
              {clan
                ? [clan.tag, clan.level && `Level ${clan.level}`, clan.location]
                    .filter(Boolean)
                    .join(" · ")
                : "Register, follow the brackets and see every result."}
            </p>
          </div>
        </div>
        <div className="hero-stats">
          <Stat
            icon={Users}
            value={data?.members.length ?? "–"}
            label="Members"
          />
          <Stat icon={Swords} value={registered} label="Registered" />
          <Stat icon={Trophy} value={upcoming.length} label="Events" />
        </div>
        <div className="hero-actions">
          <a className="btn primary lg" href="#register">
            Register now <ArrowRight size={18} />
          </a>
          <a className="btn ghost lg" href="#events">
            View brackets
          </a>
        </div>
        {!open.length && (
          <p className="hero-note muted small">
            No event is taking sign-ups right now. Check back soon.
          </p>
        )}
      </section>

      <section className="section">
        <div className="section-title">
          <h2 className="display">Upcoming events</h2>
          {upcoming.length > 0 && (
            <a className="link" href="#events">
              See all
            </a>
          )}
        </div>
        {upcoming.length ? (
          <div className="event-grid">
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} clanTag={hub.clanTag} />
            ))}
          </div>
        ) : (
          <div className="panel empty">
            <Trophy size={28} />
            <p>No events scheduled yet.</p>
          </div>
        )}
      </section>

      <section className="section" id="rules">
        <div className="section-title">
          <h2 className="display">
            <ScrollText size={22} /> Clan rules
          </h2>
        </div>
        <ol className="rules panel">
          {hub.rules.map((rule, i) => (
            <li key={i}>
              <span className="rule-num">{i + 1}</span>
              <p>{rule}</p>
            </li>
          ))}
        </ol>
      </section>

      {past.length > 0 && (
        <section className="section">
          <div className="section-title">
            <h2 className="display">Past events</h2>
          </div>
          <div className="event-grid">
            {past.map((e) => (
              <EventCard key={e.id} event={e} clanTag={hub.clanTag} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: number | string;
  label: string;
}) {
  return (
    <div className="hero-stat">
      <Icon size={16} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
