"use client";

import { Lock, Swords, Trophy, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Player, PublicState } from "@/lib/types";
import { Admin } from "./admin";
import { request } from "./api";
import { Bracket } from "./bracket";
import { Players } from "./players";
import { Register } from "./register";

type Tab = "bracket" | "register" | "players" | "admin";
const tabs: { id: Tab; label: string; icon: typeof Trophy }[] = [
  { id: "bracket", label: "Bracket", icon: Trophy },
  { id: "register", label: "Register", icon: UserPlus },
  { id: "players", label: "Players", icon: Users },
  { id: "admin", label: "Admin", icon: Lock },
];

export type Actions = {
  state: PublicState;
  players: Map<string, Player>;
  // Runs an admin action; resolves false and shows the error on failure.
  admin: (body: object) => Promise<boolean>;
  setState: (state: PublicState) => void;
  notify: (message: string, tone?: "error" | "ok") => void;
};

export function App() {
  const [state, setState] = useState<PublicState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
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
    const fromHash = () => {
      const id = window.location.hash.slice(1) as Tab;
      if (tabs.some((t) => t.id === id)) setTab(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    load();
    // Live updates while results are entered.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("hashchange", fromHash);
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

  const players = useMemo(
    () => new Map(state?.tournament.players.map((p) => [p.tag, p]) ?? []),
    [state],
  );

  if (!state)
    return (
      <main className="shell center" id="main-content">
        {loadError ? (
          <div className="card notice error">
            <p>{loadError}</p>
            <button className="btn" onClick={load}>
              Try again
            </button>
          </div>
        ) : (
          <p className="muted">Loading tournament…</p>
        )}
      </main>
    );

  const t = state.tournament;
  const active: Tab = tab ?? (t.bracket ? "bracket" : "register");
  const select = (id: Tab) => {
    setTab(id);
    history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  };
  const actions: Actions = { state, players, admin, setState, notify };
  const status = t.bracket
    ? "Tournament live"
    : t.registrationOpen
      ? "Registration open"
      : "Registration closed";

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <Swords size={18} />
            </span>
            <div>
              <h1>{t.name}</h1>
              <p className="muted small">
                {status} · {t.players.length} player
                {t.players.length === 1 ? "" : "s"} · Best of {t.format}
              </p>
            </div>
          </div>
          <nav className="tabs desktop-only" aria-label="Sections">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={id === active ? "tab active" : "tab"}
                onClick={() => select(id)}
                aria-current={id === active ? "page" : undefined}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="shell content" id="main-content">
        {active === "bracket" && <Bracket {...actions} />}
        {active === "register" && <Register {...actions} />}
        {active === "players" && <Players {...actions} />}
        {active === "admin" && <Admin {...actions} />}
      </main>
      <nav className="bottom-nav mobile-only" aria-label="Sections">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={id === active ? "active" : undefined}
            onClick={() => select(id)}
            aria-current={id === active ? "page" : undefined}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
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
