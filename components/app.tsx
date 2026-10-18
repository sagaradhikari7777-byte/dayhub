"use client";

import {
  BarChart3,
  CalendarDays,
  Home as HomeIcon,
  Lock,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Player, PublicState, Tournament } from "@/lib/types";
import { Admin } from "./admin";
import { request } from "./api";
import { EventPage, EventsList } from "./events";
import { Home } from "./home";
import { Logo } from "./logo";
import { Register } from "./register";
import { StatsPage } from "./stats";

// Hash routes: #/ · #register[/eventId] · #events · #event/id[/players|stats]
// · #stats · #admin
export type EventTab = "bracket" | "players" | "stats";

export type Route =
  | { page: "home" }
  | { page: "register"; eventId: string | null }
  | { page: "events" }
  | { page: "event"; id: string; tab: EventTab }
  | { page: "stats" }
  | { page: "admin" };

function parseRoute(hash: string): Route {
  const [page, id, tab] = hash.replace(/^#\/?/, "").split("/");
  switch (page) {
    case "register":
      return { page: "register", eventId: id || null };
    case "events":
      return { page: "events" };
    case "event":
      return id
        ? {
            page: "event",
            id,
            tab: tab === "players" || tab === "stats" ? tab : "bracket",
          }
        : { page: "events" };
    case "stats":
      return { page: "stats" };
    case "admin":
      return { page: "admin" };
    default:
      return { page: "home" };
  }
}

export type Actions = {
  state: PublicState;
  // Runs an admin action; resolves false and shows the error on failure.
  admin: (body: object) => Promise<boolean>;
  setState: (state: PublicState) => void;
  notify: (message: string, tone?: "error" | "ok") => void;
  go: (hash: string) => void;
};

export type EventActions = Actions & {
  event: Tournament;
  players: Map<string, Player>;
};

const nav = [
  { hash: "#/", page: "home", label: "Home", icon: HomeIcon },
  { hash: "#register", page: "register", label: "Register", icon: UserPlus },
  { hash: "#events", page: "events", label: "Events", icon: CalendarDays },
  { hash: "#stats", page: "stats", label: "Stats", icon: BarChart3 },
  { hash: "#admin", page: "admin", label: "Admin", icon: Lock },
] as const;

export function App() {
  const [state, setState] = useState<PublicState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ page: "home" });
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      setState(await request("/api/tournament"));
      setLoadError(null);
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    load();
    // Live updates while results are entered.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("hashchange", onHash);
    };
  }, [load]);

  const notify = useCallback((message: string, tone: "error" | "ok" = "ok") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const admin = useCallback(
    async (body: object) => {
      try {
        setState(await request("/api/admin", { body }));
        return true;
      } catch (error) {
        notify((error as Error).message, "error");
        load();
        return false;
      }
    },
    [load, notify],
  );

  const go = useCallback((hash: string) => {
    if (window.location.hash === hash) window.scrollTo({ top: 0 });
    else window.location.hash = hash;
  }, []);

  const event =
    route.page === "event" && state
      ? (state.hub.events.find((e) => e.id === route.id) ?? null)
      : null;
  const players = useMemo(
    () => new Map(event?.players.map((p) => [p.tag, p]) ?? []),
    [event],
  );

  const actions: Actions | null = state
    ? { state, admin, setState, notify, go }
    : null;
  const activeTab = route.page === "event" ? "events" : route.page;

  return (
    <>
      <div className="backdrop" aria-hidden />
      <header className="topbar">
        <div className="shell topbar-inner">
          <button
            className="brand"
            onClick={() => go("#/")}
            aria-label="Clan Cup home"
          >
            <Logo />
            <span className="brand-name">Clan Cup</span>
          </button>
          <nav className="tabs desktop-only" aria-label="Sections">
            {nav.map(({ hash, page, label, icon: Icon }) => (
              <a
                key={page}
                href={hash}
                className={page === activeTab ? "tab active" : "tab"}
                aria-current={page === activeTab ? "page" : undefined}
              >
                <Icon size={16} /> {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="shell content" id="main-content">
        {!actions ? (
          loadError ? (
            <div className="panel notice error">
              <p>{loadError}</p>
              <button className="btn" onClick={load}>
                Try again
              </button>
            </div>
          ) : (
            <div className="loading">
              <span className="spinner" /> Loading…
            </div>
          )
        ) : route.page === "home" ? (
          <Home {...actions} />
        ) : route.page === "register" ? (
          <Register {...actions} eventId={route.eventId} />
        ) : route.page === "stats" ? (
          <StatsPage {...actions} />
        ) : route.page === "events" ? (
          <EventsList {...actions} />
        ) : route.page === "event" ? (
          event ? (
            <EventPage
              {...actions}
              event={event}
              players={players}
              tab={route.tab}
              admin={(body) => admin({ ...body, eventId: event.id })}
            />
          ) : (
            <div className="panel notice">
              <h2>Event not found</h2>
              <p className="muted">It may have been deleted.</p>
              <a className="btn" href="#events">
                All events
              </a>
            </div>
          )
        ) : (
          <Admin {...actions} />
        )}
      </main>

      <nav className="bottom-nav mobile-only" aria-label="Sections">
        {nav.map(({ hash, page, label, icon: Icon }) => (
          <a
            key={page}
            href={hash}
            className={page === activeTab ? "active" : undefined}
            aria-current={page === activeTab ? "page" : undefined}
          >
            <Icon size={20} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </>
  );
}
