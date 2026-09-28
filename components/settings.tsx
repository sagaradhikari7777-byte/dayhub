"use client";
import { useRef, useState } from "react";
import {
  User,
  Palette,
  LayoutGrid,
  Tags,
  Bell,
  Globe,
  MapPin,
  Download,
  Upload,
  Info,
  Shield,
  Trash2,
  CalendarDays,
  CheckCheck,
  Receipt,
  Wallet,
  StickyNote,
  Package,
  Heart,
  ArrowUp,
  ArrowDown,
  Sun,
  Moon,
  Monitor,
  LocateFixed,
  Check,
  Cloud,
  RefreshCw,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Kind, labels } from "@/types";
import { PageHeader, GlassCard, RowLink, Confirm, Sheet } from "./ui";
export function More({ navigate }: { navigate: (p: string) => void }) {
  const { settings, storage, sync } = useStore();
  return (
    <>
      <PageHeader
        eyebrow="YOUR SPACE"
        title="A little more DayHub"
        detail="Make every day feel a little more like you."
      />
      <GlassCard>
        <RowLink
          icon={<User />}
          title={settings.name}
          detail={`${settings.currency} · ${settings.location}`}
          onClick={() => navigate("settings")}
        />
      </GlassCard>
      <p className="group-label">YOUR EVERYDAY</p>
      <GlassCard>
        {(
          [
            ["tasks", CheckCheck],
            ["events", CalendarDays],
            ["bills", Receipt],
            ["expenses", Wallet],
            ["deliveries", Package],
            ["notes", StickyNote],
            ["wishlists", Heart],
          ] as const
        ).map(([k, Icon]) => (
          <RowLink
            key={k}
            icon={<Icon size={20} />}
            title={labels[k]}
            onClick={() => navigate(k)}
          />
        ))}
      </GlassCard>
      <p className="group-label">MAKE IT YOURS</p>
      <GlassCard>
        <RowLink
          icon={<Palette size={20} />}
          title="Profile & appearance"
          onClick={() => navigate("settings")}
        />
        <RowLink
          icon={<LayoutGrid size={20} />}
          title="Home widgets"
          onClick={() => navigate("widgets")}
        />
        <RowLink
          icon={<Bell size={20} />}
          title="Notification preferences"
          onClick={() => navigate("settings")}
        />
        <RowLink
          icon={<Download size={20} />}
          title="Data, backup & privacy"
          onClick={() => navigate("data")}
        />
      </GlassCard>
      <div className="app-info">
        <span className="brand-logo small">
          d<span>h</span>
        </span>
        <strong>DayHub</strong>
        <p>Your day. One place.</p>
        <small>
          Version 1.0 ·{" "}
          {storage === "cloud-upstash"
            ? "Upstash connected"
            : storage === "cloud"
              ? "Cloud connected"
              : "Local development server"}
          <br />
          {sync}
        </small>
      </div>
    </>
  );
}
export function Settings({ back }: { back: () => void }) {
  const { settings, configure } = useStore();
  const [form, setForm] = useState(settings),
    [message, setMessage] = useState(""),
    [results, setResults] = useState<
      {
        id: number;
        name: string;
        country: string;
        latitude: number;
        longitude: number;
      }[]
    >([]),
    [searching, setSearching] = useState(false),
    [newCategory, setNewCategory] = useState("");
  async function find() {
    setSearching(true);
    try {
      const r = await fetch(
          `/api/weather?q=${encodeURIComponent(form.location)}`,
        ),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResults(d.results || []);
      if (!d.results?.length)
        setMessage("No locations found. Try a nearby city.");
    } catch {
      setMessage("Location search is unavailable. Try again later.");
    } finally {
      setSearching(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setMessage(
        "Location access is not available. Search for a city instead.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setForm((f) => ({
          ...f,
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          location: "Current location",
        }));
        setMessage("Location selected. Save your preferences below.");
      },
      () =>
        setMessage(
          "Location access was not granted. You can search for a city instead.",
        ),
    );
  }
  return (
    <>
      <PageHeader
        back={back}
        title="Make yourself at home"
        eyebrow="PREFERENCES"
      />
      <form
        className="editor settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await configure(form);
            setMessage("Your preferences are saved.");
          } catch {
            setMessage("Unable to save preferences. Please try again.");
          }
        }}
      >
        <GlassCard>
          <h2>Profile & display</h2>
          <label>
            Your name
            <input
              required
              aria-label="Your name"
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Currency
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {["AUD", "USD", "NZD", "GBP", "EUR", "NPR", "INR"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Time format
              <select
                value={form.timeFormat}
                onChange={(e) =>
                  setForm({
                    ...form,
                    timeFormat: e.target.value as "12" | "24",
                  })
                }
              >
                <option value="12">12-hour</option>
                <option value="24">24-hour</option>
              </select>
            </label>
            <label>
              Date format
              <select
                value={form.dateFormat}
                onChange={(e) =>
                  setForm({
                    ...form,
                    dateFormat: e.target.value as typeof form.dateFormat,
                  })
                }
              >
                {["D MMM", "DD/MM/YYYY", "MM/DD/YYYY"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="hint">
            Currency changes display labels; existing amounts are not converted.
          </p>
          <label>Appearance</label>
          <div className="theme-picker">
            {(
              [
                ["light", Sun],
                ["dark", Moon],
                ["system", Monitor],
              ] as const
            ).map(([theme, Icon]) => (
              <button
                type="button"
                className={form.theme === theme ? "active" : ""}
                key={theme}
                onClick={() => {
                  setForm({ ...form, theme });
                  void configure({ theme });
                }}
              >
                <Icon />
                {theme}
              </button>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <h2>Weather location</h2>
          <label>
            City
            <div className="input-action">
              <input
                aria-label="City"
                required
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
              <button
                type="button"
                className="secondary"
                onClick={find}
                disabled={searching}
              >
                {searching ? "Searching…" : "Find"}
              </button>
            </div>
          </label>
          {results.map((r) => (
            <button
              className="location-result"
              type="button"
              key={r.id}
              onClick={() => {
                setForm({
                  ...form,
                  location: r.name,
                  latitude: r.latitude,
                  longitude: r.longitude,
                });
                setResults([]);
              }}
            >
              <MapPin size={16} />
              {r.name}, {r.country}
            </button>
          ))}
          <button className="text-button" type="button" onClick={locate}>
            <LocateFixed size={17} />
            Use current location
          </button>
          <small className="muted">
            Selected coordinates: {form.latitude.toFixed(3)},{" "}
            {form.longitude.toFixed(3)}
          </small>
          <p className="hint">
            Weather data by{" "}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open-Meteo
            </a>
            .
          </p>
        </GlassCard>
        <GlassCard>
          <h2>Notifications</h2>
          {["products", "bills", "tasks", "deliveries", "events"].map((k) => (
            <label className="toggle-row" key={k}>
              {k === "products" ? "Price alerts" : labels[k as Kind]}
              <input
                role="switch"
                type="checkbox"
                checked={form.notifications[k]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notifications: {
                      ...form.notifications,
                      [k]: e.target.checked,
                    },
                  })
                }
              />
            </label>
          ))}
          <p className="hint">
            Due reminders appear when you open DayHub. Automatic price alerts
            require the scheduled server check.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                try {
                  const { enablePush } = await import("@/lib/push-client");
                  setMessage(await enablePush());
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              <Bell size={17} />
              Enable background push
            </button>
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                try {
                  const { disablePush } = await import("@/lib/push-client");
                  setMessage(await disablePush());
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Disable push on this device
            </button>
          </div>
        </GlassCard>
        <GlassCard>
          <h2>Custom categories</h2>
          <div className="input-action">
            <input
              aria-label="New category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="A category of your own"
            />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (
                  newCategory.trim() &&
                  !form.categories.includes(newCategory.trim())
                )
                  setForm({
                    ...form,
                    categories: [...form.categories, newCategory.trim()],
                  });
                setNewCategory("");
              }}
            >
              Add
            </button>
          </div>
          <div className="filter-row">
            {form.categories.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={`Remove ${c}`}
                onClick={() =>
                  setForm({
                    ...form,
                    categories: form.categories.filter((x) => x !== c),
                  })
                }
              >
                {c} ×
              </button>
            ))}
          </div>
        </GlassCard>
        {message && (
          <p role="status" className="info">
            {message}
          </p>
        )}
        <button className="primary full">Save preferences</button>
      </form>
    </>
  );
}
export function Widgets({ back }: { back: () => void }) {
  const { settings, configure } = useStore();
  const names: Record<string, string> = {
    briefing: "Daily briefing",
    weather: "Weather",
    events: "Calendar",
    tasks: "Tasks",
    bills: "Bills",
    spending: "Spending",
    deliveries: "Deliveries",
    prices: "Price Watch",
    notes: "Notes",
  };
  const move = (i: number, delta: number) => {
    const widgets = [...settings.widgets];
    [widgets[i], widgets[i + delta]] = [widgets[i + delta], widgets[i]];
    void configure({ widgets });
  };
  return (
    <>
      <PageHeader
        back={back}
        eyebrow="YOUR HOME"
        title="What matters to you"
        detail="Choose your cards and arrange them. Overdue bills are always prioritised."
      />
      <GlassCard>
        {settings.widgets.map((w, i) => (
          <div className="widget-setting" key={w}>
            <label>
              <input
                type="checkbox"
                checked={!settings.hiddenWidgets.includes(w)}
                onChange={(e) =>
                  void configure({
                    hiddenWidgets: e.target.checked
                      ? settings.hiddenWidgets.filter((x) => x !== w)
                      : [...settings.hiddenWidgets, w],
                  })
                }
              />
              {names[w]}
            </label>
            <button
              className="icon-button"
              aria-label={`Move ${names[w]} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={`Move ${names[w]} down`}
              disabled={i === settings.widgets.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={18} />
            </button>
          </div>
        ))}
      </GlassCard>
    </>
  );
}
export function DataSettings({ back }: { back: () => void }) {
  const {
    entries,
    pending,
    storage,
    sync,
    loadDemo,
    reset,
    importData,
    refresh,
    resolvePending,
  } = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState(""),
    [resetText, setResetText] = useState(""),
    [busy, setBusy] = useState(false);
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            app: "DayHub",
            version: 1,
            exportedAt: new Date().toISOString(),
            entries,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `DayHub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    setMessage("Backup downloaded. Keep a copy in Files or iCloud Drive.");
  }
  return (
    <>
      <PageHeader
        back={back}
        title="Your data stays yours"
        eyebrow="DATA & PRIVACY"
      />
      <GlassCard>
        <h2>Connection & backup</h2>
        <p>
          {sync} · {pending} pending changes
        </p>
        <p className="muted">
          {storage === "cloud-upstash"
            ? "Your account is stored in Upstash Redis, separately from Together."
            : storage === "cloud"
              ? "Your account is stored in PostgreSQL."
              : "This development build saves to a persistent SQLite database on the local server. A PostgreSQL or Upstash connection is required on Vercel."}{" "}
          Offline changes are also held in this device’s IndexedDB storage.
        </p>
        <div className="button-row">
          <button className="primary" onClick={exportData}>
            <Download size={17} />
            Export backup
          </button>
          <button
            className="secondary"
            onClick={() => ref.current?.click()}
            disabled={busy}
          >
            <Upload size={17} />
            Restore backup
          </button>
          <button className="secondary" onClick={() => void refresh()}>
            <RefreshCw size={17} />
            Sync now
          </button>
        </div>
        {pending > 0 && (
          <Confirm
            title="Use this device’s pending changes?"
            body="Export a backup first. This retries your queued changes against the latest server versions and can replace edits from another tab."
            onConfirm={async () => {
              try {
                await resolvePending();
                setMessage("Your pending changes have been retried.");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <button className="secondary">Resolve a sync conflict</button>
          </Confirm>
        )}
        <input
          ref={ref}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              if (file.size > 10_000_000)
                throw new Error("Choose a backup smaller than 10 MB.");
              await importData(JSON.parse(await file.text()));
              setMessage("Backup restored.");
            } catch (err) {
              setMessage(
                err instanceof Error
                  ? err.message
                  : "Unable to restore this backup.",
              );
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
        <p className="hint">
          Back up regularly. Clearing website data removes the device’s session
          and unsynced changes. Each browser has a separate private account;
          restore a backup to move devices.
        </p>
      </GlassCard>
      <GlassCard>
        <h2>Privacy, simply</h2>
        <p className="muted">
          DayHub has no advertising or analytics trackers. Your account uses a
          private, secure browser cookie. Product links are sent to the relevant
          retailer only when checking prices. Weather coordinates are sent to
          Open-Meteo. Product images load from their original hosts.
        </p>
        <p className="muted">
          Automatic prices are best-effort. Confirm price, shipping and stock at
          the store before buying. No bank, email or calendar accounts are
          connected.
        </p>
        <p className="hint">DayHub 1.0 · Your day. One place.</p>
      </GlassCard>
      <GlassCard>
        <h2>A little help getting started</h2>
        <p className="muted">
          Add clearly labelled sample content to explore the app.
        </p>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await loadDemo();
              setMessage("Sample items added. You can edit or delete them.");
            } catch {
              setMessage("Some sample items could not be saved.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Load demo data
        </button>
      </GlassCard>
      <GlassCard>
        <h2>Reset your space</h2>
        <p className="muted">
          Permanently delete all records in this account. Export a backup first.
        </p>
        <label>
          Type RESET to continue
          <input
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            aria-label="Reset confirmation"
          />
        </label>
        <Confirm
          title="Reset all DayHub data?"
          body="All tasks, bills, notes, price history and settings in this account will be deleted."
          onConfirm={async () => {
            try {
              await reset();
              setResetText("");
              setMessage("Your space has been reset.");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <button disabled={resetText !== "RESET"} className="danger-button">
            <Trash2 size={17} />
            Reset all data
          </button>
        </Confirm>
      </GlassCard>
      {message && (
        <p role="status" className="info">
          {message}
        </p>
      )}
    </>
  );
}
