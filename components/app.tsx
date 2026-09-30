"use client";
import { useEffect, useState } from "react";
import {
  Home as HomeIcon,
  CalendarDays,
  TrendingDown,
  Activity as ActivityIcon,
  Grid2X2,
  Search,
  Bell,
  Plus,
  Command,
  RefreshCw,
  CloudOff,
} from "lucide-react";
import { StoreProvider, useStore } from "@/lib/store";
import { Entry, Kind, labels } from "@/types";
import { Home } from "./dashboard/home";
import { Today } from "./today";
import { Collection } from "./collections";
import { Detail } from "./detail";
import { Activity } from "./activity";
import { More, Settings, Widgets, DataSettings } from "./settings";
import { Editor, QuickAdd } from "./editor";
import { Onboarding } from "./onboarding";
import { DayMark, DayOrbit } from "./brand";
import { Sheet, SkeletonCard, EmptyState } from "./ui";
import { GenericRow } from "./rows";
const tabs = [
  ["home", "Home", HomeIcon],
  ["today", "Today", CalendarDays],
  ["products", "Price Watch", TrendingDown],
  ["activity", "Activity", ActivityIcon],
  ["more", "More", Grid2X2],
] as const;
const collections: Kind[] = [
  "tasks",
  "events",
  "bills",
  "expenses",
  "notes",
  "deliveries",
  "products",
  "wishlists",
];
function AppContent() {
  const { entries, settings, ready, sync, error, pending, refresh } =
    useStore();
  const [page, setPage] = useState("home"),
    [quick, setQuick] = useState(false),
    [editor, setEditor] = useState<{ kind: Kind; entry?: Entry } | null>(null),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState("");
  const top = tabs.some((t) => t[0] === page);
  const unread = entries.filter(
    (e) => e.kind === "notifications" && !e.read,
  ).length;
  useEffect(() => {
    const read = () => {
      setPage(decodeURIComponent(location.hash.slice(1)) || "home");
      window.scrollTo({ top: 0 });
    };
    read();
    window.addEventListener("popstate", read);
    window.addEventListener("hashchange", read);
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("hashchange", read);
      window.removeEventListener("keydown", keyboard);
    };
  }, []);
  const navigate = (p: string) => {
    if (page === p) return;
    history.pushState({ dayhub: true }, "", `#${encodeURIComponent(p)}`);
    setPage(p);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const back = () => {
    if (history.state?.dayhub) history.back();
    else navigate("home");
  };
  const open = (e: Entry) => {
    if (e.kind === "notifications") {
      const target = entries.find((x) => x.id === e.linkId);
      navigate(`detail/${target?.id || e.id}`);
    } else navigate(`detail/${e.id}`);
  };
  const add = (kind: Kind) => {
    setQuick(false);
    setEditor({ kind });
  };
  let touchX = 0,
    touchY = 0;
  const results = entries
    .filter(
      (e) =>
        collections.includes(e.kind) &&
        `${e.title} ${e.notes || ""} ${e.body || ""} ${e.merchant || ""} ${e.retailer || ""} ${e.trackingNumber || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice(0, 40);
  return (
    <div
      className="app-shell"
      onTouchStart={(e) => {
        touchX = e.touches[0].clientX;
        touchY = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (
          !top &&
          touchX < 25 &&
          t.clientX - touchX > 100 &&
          Math.abs(t.clientY - touchY) < 60
        )
          back();
      }}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-logo">
            <DayMark />
          </span>
          <span>
            DayHub<span className="brand-dot">.</span>
            <small>YOUR DAY. ONE PLACE.</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={21} />
              {label}
              {id === "activity" && unread > 0 && (
                <span className="count">{unread}</span>
              )}
            </button>
          ))}
        </nav>
        <button className="sidebar-add primary" onClick={() => setQuick(true)}>
          <Plus size={19} />
          Quick add
        </button>
        <div className="sidebar-bottom">
          <span className="sidebar-motif">
            <SunMark />
          </span>
          <p>
            A little more clarity.
            <br />A little more you.
          </p>
          <button
            className="profile-button"
            onClick={() => navigate("settings")}
          >
            <span className="avatar">{settings.name.slice(0, 1)}</span>
            <span>
              {settings.name}
              <small>Your personal space</small>
            </span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="mobile-brand">
            <span className="brand-logo small">
              <DayMark size={19} />
            </span>
            DayHub<span className="brand-dot">.</span>
          </span>
          <div className="breadcrumb">
            Your personal space <span>/</span>{" "}
            {page.startsWith("detail/")
              ? "Details"
              : page === "home"
                ? "Overview"
                : labels[page as Kind] ||
                  page.charAt(0).toUpperCase() + page.slice(1)}
          </div>
          <div className="topbar-actions">
            <button
              className="search-button"
              onClick={() => setSearch(true)}
              aria-label="Search everything"
            >
              <Search size={19} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="notification-button icon-button"
              aria-label={`Notifications, ${unread} unread`}
              onClick={() => navigate("notifications")}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </button>
            <button
              className="avatar"
              aria-label="Profile"
              onClick={() => navigate("settings")}
            >
              {settings.name.slice(0, 1)}
            </button>
          </div>
        </header>
        <main id="main-content" key={page} className="main-content">
          {!ready ? (
            <div className="dashboard-grid">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : page === "home" ? (
            <Home navigate={navigate} open={open} add={add} />
          ) : page === "today" ? (
            <Today open={open} />
          ) : page === "more" ? (
            <More navigate={navigate} />
          ) : page === "settings" ? (
            <Settings back={back} />
          ) : page === "widgets" ? (
            <Widgets back={back} />
          ) : page === "data" ? (
            <DataSettings back={back} />
          ) : page === "activity" || page === "notifications" ? (
            <Activity
              open={open}
              notificationsOnly={page === "notifications"}
              back={page === "notifications" ? back : undefined}
            />
          ) : page.startsWith("detail/") ? (
            <Detail
              id={page.split("/")[1]}
              back={back}
              edit={(entry) => setEditor({ kind: entry.kind, entry })}
            />
          ) : collections.includes(page as Kind) ? (
            <Collection
              kind={page as Kind}
              open={open}
              add={add}
              back={page === "products" ? undefined : back}
            />
          ) : (
            <EmptyState
              title="Let’s head home"
              action={() => navigate("home")}
              label="Open Home"
            />
          )}
          <footer className={`sync-status ${error ? "needs-attention" : ""}`}>
            <button onClick={() => void refresh()}>
              {error ? <CloudOff size={13} /> : <span className="tiny-dot" />}
              {sync}
              {pending > 0 ? ` · ${pending} queued` : ""}
              {error && <RefreshCw size={13} />}
            </button>
            {error && <p role="alert">{error}</p>}
          </footer>
        </main>
      </div>
      <button
        className="fab"
        aria-label="Quick add"
        onClick={() => setQuick(true)}
      >
        <Plus size={27} />
      </button>
      <nav className="bottom-nav" aria-label="Bottom navigation">
        {tabs.map(([id, label, Icon]) => (
          <button
            aria-current={page === id ? "page" : undefined}
            className={page === id ? "active" : ""}
            key={id}
            onClick={() => navigate(id)}
          >
            <Icon size={21} />
            <span>{label}</span>
            {id === "activity" && unread > 0 && <i />}
          </button>
        ))}
      </nav>
      {quick && <QuickAdd onClose={() => setQuick(false)} onSelect={add} />}{" "}
      {editor && (
        <Editor
          key={editor.entry?.id || editor.kind}
          kind={editor.kind}
          entry={editor.entry}
          onSaved={(entry) => {
            if (entry.kind === "products") navigate(`detail/${entry.id}`);
          }}
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {search && (
        <Sheet
          open
          onClose={() => setSearch(false)}
          title="Find something in your day"
        >
          <div className="search-field global-search">
            <Search size={20} />
            <input
              autoFocus
              placeholder="Tasks, products, notes, deliveries…"
              aria-label="Global search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="search-results">
            {query ? (
              results.length ? (
                results.map((e) => (
                  <div key={e.id}>
                    <span className="eyebrow">{labels[e.kind]}</span>
                    <GenericRow
                      entry={e}
                      open={() => {
                        setSearch(false);
                        open(e);
                      }}
                    />
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No matches yet"
                  body="Try another word or a shorter search."
                />
              )
            ) : (
              <p className="muted">
                Everything in your space, one search away.
              </p>
            )}
          </div>
        </Sheet>
      )}
      {ready && <Onboarding />}
    </div>
  );
}
function SunMark() {
  return <DayOrbit />;
}
export default function DayHub() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
