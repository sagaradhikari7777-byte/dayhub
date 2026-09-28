"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { openDB } from "idb";
import { Entry, Kind, Mutation, Settings, defaults } from "@/types";
import { createEntry, day, offset, uid } from "./model";
import { demoEntries } from "./demo";
type State = { entries: Entry[]; pending: Mutation[] };
type Store = {
  entries: Entry[];
  settings: Settings;
  ready: boolean;
  sync: string;
  error: string;
  pending: number;
  storage: string;
  save: (e: Entry) => Promise<void>;
  remove: (e: Entry) => Promise<void>;
  refresh: () => Promise<void>;
  configure: (s: Partial<Settings>) => Promise<void>;
  reset: () => Promise<void>;
  importData: (data: unknown) => Promise<void>;
  loadDemo: () => Promise<void>;
  dismissError: () => void;
  resolvePending: () => Promise<void>;
};
const Context = createContext<Store | null>(null);
const db = () =>
  openDB("dayhub", 1, {
    upgrade(d) {
      d.createObjectStore("state");
    },
  });
async function persist(s: State) {
  const d = await db();
  await d.put("state", s, "current");
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ entries: [], pending: [] }),
    [ready, setReady] = useState(false),
    [sync, setSync] = useState("Connecting"),
    [error, setError] = useState(""),
    [storage, setStorage] = useState("");
  const current = useRef(state),
    busy = useRef(false);
  const initialized = useRef(false);
  const mutationQueue = useRef(Promise.resolve());
  const stateQueue = useRef(Promise.resolve());
  const commit = (update: State | ((s: State) => State)) => {
    const job = stateQueue.current.then(async () => {
      const work = async () => {
        const d = await db();
        const latest = (await d.get("state", "current")) as State | undefined;
        const s =
          typeof update === "function"
            ? update(latest || current.current)
            : update;
        await persist(s);
        current.current = s;
        setState(s);
      };
      if (navigator.locks) await navigator.locks.request("dayhub-state", work);
      else await work();
    });
    stateQueue.current = job.catch(() => {});
    return job;
  };
  const refresh = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!navigator.onLine) {
        setSync("Offline · saved on device");
        return;
      }
      setSync("Syncing");
      while (current.current.pending.length) {
        const m = current.current.pending[0];
        const res = await fetch("/api/data", {
          signal: AbortSignal.timeout(12000),
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(m),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Sync unavailable");
        }
        await commit((s) => ({
          ...s,
          pending: s.pending.filter((x) => x.opId !== m.opId),
        }));
      }
      const res = await fetch("/api/data", {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok)
        throw new Error(
          "Server unavailable. Changes stay safely queued on this device.",
        );
      const data = await res.json();
      await commit((s) => {
        const remote = data.entries as Entry[];
        for (const m of s.pending) {
          const index = remote.findIndex((x) => x.id === m.entry.id);
          if (index >= 0) remote.splice(index, 1);
          if (m.action === "upsert") remote.push(m.entry);
        }
        return { entries: remote, pending: s.pending };
      });
      const pending = current.current.pending;
      setStorage(data.storage);
      setSync(pending.length ? "Changes queued" : "All changes saved");
      setError("");
    } catch (e) {
      setSync("Sync needs attention");
      setError(
        e instanceof Error &&
          e.name !== "TimeoutError" &&
          e.name !== "TypeError"
          ? e.message
          : "Connection unavailable. Your changes are saved on this device and will retry.",
      );
    } finally {
      busy.current = false;
    }
  };
  const change = (
    entry: Entry,
    action: "upsert" | "delete",
    restoreHistory = false,
  ) => {
    const next = mutationQueue.current.then(async () => {
      try {
        await commit((current) => {
          const previous = current.entries.find((e) => e.id === entry.id);
          const expectedVersion = previous?.version || 0;
          const updated = {
            ...entry,
            version: expectedVersion + 1,
            updated_at: new Date().toISOString(),
          };
          return {
            entries: current.entries
              .filter((e) => e.id !== entry.id)
              .concat(action === "upsert" ? [updated] : []),
            pending: [
              ...current.pending,
              {
                opId: uid(),
                action,
                entry: updated,
                expectedVersion,
                restoreHistory,
              },
            ],
          };
        });
        setSync(
          navigator.onLine ? "Changes queued" : "Offline · saved on device",
        );
      } catch {
        setError(
          "Device storage is full or unavailable. This change was not saved.",
        );
        throw new Error("Device storage unavailable");
      }
      void refresh();
    });
    mutationQueue.current = next.catch(() => {});
    return next;
  };
  const save = (e: Entry) => change(e, "upsert"),
    remove = (e: Entry) => change(e, "delete");
  const profile = state.entries.find((e) => e.kind === "settings");
  const settings = { ...defaults, ...profile?.profile };
  const configure = async (s: Partial<Settings>) => {
    const e =
      current.current.entries.find((e) => e.kind === "settings") ||
      createEntry("settings", { title: "Preferences", profile: defaults });
    await save({ ...e, profile: { ...defaults, ...e.profile, ...s } });
  };
  const loadDemo = async () => {
    for (const e of demoEntries()) await save(e);
    await refresh();
    for (const e of current.current.entries.filter(
      (e) =>
        e.kind === "products" &&
        ["Ray-Ban Wayfarer", "Sony WH-1000XM6"].includes(e.title),
    ))
      await save({ ...e, price: e.title.startsWith("Ray") ? 179 : 399 });
    await refresh();
  };
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      (async () => {
        try {
          const d = await db();
          const saved = await d.get("state", "current");
          if (saved) {
            current.current = saved;
            setState(saved);
          }
          setReady(true);
          void refresh();
          if ("storage" in navigator)
            void navigator.storage.persist().catch(() => {});
          if ("serviceWorker" in navigator)
            void navigator.serviceWorker.register("/sw.js").catch(() => {});
        } catch {
          setError(
            "Unable to access local storage. Please allow website storage in Safari.",
          );
          setReady(true);
        }
      })();
    }
    const online = () => void refresh();
    window.addEventListener("online", online);
    const timer = setInterval(online, 30000);
    return () => {
      window.removeEventListener("online", online);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : settings.theme;
    };
    apply();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);
  // Time-sensitive reminders are deduplicated by item, due date and notification type.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(async () => {
      const list = current.current.entries;
      for (const e of list) {
        if (!settings.notifications[e.kind]) continue;
        let title = "";
        if (e.kind === "bills" && !e.paid && e.date && e.date <= offset(1))
          title = `${e.title} ${e.date < day() ? "is overdue" : e.date === day() ? "is due today" : "is due tomorrow"}`;
        if (
          e.kind === "tasks" &&
          !e.completed &&
          e.reminder &&
          e.date &&
          e.date <= day()
        )
          title = `${e.date < day() ? "Overdue task" : "Reminder"}: ${e.title}`;
        if (
          e.kind === "deliveries" &&
          e.date === day() &&
          e.status !== "Delivered"
        )
          title = `${e.title} is expected today`;
        if (e.kind === "events" && e.date === day())
          title = `Today: ${e.title}${e.time ? " at " + e.time : ""}`;
        const key = `${e.id}:${e.date}:${title}`;
        if (title && !current.current.entries.some((n) => n.dedupe === key))
          await save(
            createEntry("notifications", {
              title,
              read: false,
              linkKind: e.kind,
              linkId: e.id,
              dedupe: key,
            }),
          );
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [ready, state.entries.length]);
  const reset = async () => {
    await mutationQueue.current;
    if (busy.current)
      throw new Error("Please wait for sync to finish, then retry.");
    const r = await fetch("/api/data", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "RESET" }),
    });
    if (!r.ok) throw new Error("Reset failed. Please reconnect and try again.");
    await commit({ entries: [], pending: [] });
    await refresh();
  };
  const importData = async (data: unknown) => {
    const { entrySchema } = await import("./validation");
    if (
      !data ||
      typeof data !== "object" ||
      !("entries" in data) ||
      !Array.isArray(data.entries)
    )
      throw new Error("Choose a valid DayHub backup.");
    const entries = data.entries.map((e) => entrySchema.parse(e));
    if (entries.length > 10000) throw new Error("This backup is too large.");
    const remap = new Map(entries.map((e) => [e.id, uid()]));
    for (const e of entries) {
      if (e.kind === "activity_log") continue;
      const existingSettings = current.current.entries.find(
        (x) => x.kind === "settings",
      );
      const imported = {
        ...e,
        id:
          e.kind === "settings" && existingSettings
            ? existingSettings.id
            : remap.get(e.id)!,
        version: 0,
        wishlistId: e.wishlistId ? remap.get(e.wishlistId) : undefined,
        linkId: e.linkId ? remap.get(e.linkId) : undefined,
      };
      await change(imported, "upsert", e.kind === "products");
    }
    await refresh();
  };
  const resolvePending = async () => {
    if (busy.current)
      throw new Error("Please wait for the current sync to finish.");
    const res = await fetch("/api/data", {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error("Reconnect before resolving changes.");
    const data = await res.json();
    await commit((s) => {
      const versions = new Map<string, number>(
        data.entries.map((e: Entry) => [e.id, e.version]),
      );
      const pending = s.pending.map((m) => {
        const version = versions.get(m.entry.id) || 0;
        versions.set(m.entry.id, version + 1);
        return {
          ...m,
          opId: uid(),
          expectedVersion: version,
          entry: { ...m.entry, version: version + 1 },
        };
      });
      return {
        ...s,
        pending,
        entries: s.entries.map((e) => ({
          ...e,
          version: versions.get(e.id) || e.version,
        })),
      };
    });
    await refresh();
  };
  return (
    <Context.Provider
      value={{
        entries: state.entries,
        settings,
        ready,
        sync,
        error,
        pending: state.pending.length,
        storage,
        save,
        remove,
        refresh,
        configure,
        reset,
        importData,
        loadDemo,
        resolvePending,
        dismissError: () => setError(""),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const s = useContext(Context);
  if (!s) throw new Error("Missing store");
  return s;
}
