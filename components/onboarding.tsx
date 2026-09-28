"use client";
import { useState } from "react";
import {
  Sun,
  ArrowRight,
  Check,
  CalendarDays,
  CheckCheck,
  Receipt,
  Wallet,
  Package,
  TrendingDown,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Sheet } from "./ui";
export function Onboarding() {
  const { settings, configure, loadDemo, entries } = useStore();
  const [step, setStep] = useState(0),
    [name, setName] = useState(settings.name),
    [currency, setCurrency] = useState(settings.currency),
    [location, setLocation] = useState(settings.location),
    [selected, setSelected] = useState([
      "tasks",
      "bills",
      "spending",
      "deliveries",
      "prices",
      "events",
    ]),
    [demo, setDemo] = useState(
      process.env.NODE_ENV === "development" ||
        process.env.NEXT_PUBLIC_DEMO_MODE === "true",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (settings.onboarded) return null;
  const finish = async (skip = false) => {
    setBusy(true);
    try {
      let coords = {
        latitude: settings.latitude,
        longitude: settings.longitude,
      };
      if (!skip && location !== settings.location) {
        const r = await fetch(`/api/weather?q=${encodeURIComponent(location)}`),
          d = await r.json();
        if (!r.ok || !d.results?.length) {
          setStep(3);
          throw new Error("Choose a city we can find, or skip to use Sydney.");
        }
        coords = {
          latitude: d.results[0].latitude,
          longitude: d.results[0].longitude,
        };
      }
      await configure({
        name: name.trim() || "Sagar",
        currency,
        location: skip ? "Sydney" : location,
        ...coords,
        onboarded: true,
        hiddenWidgets: skip
          ? []
          : [
              "tasks",
              "bills",
              "spending",
              "deliveries",
              "prices",
              "events",
            ].filter((w) => !selected.includes(w)),
      });
      if (demo && !entries.some((e) => e.kind !== "settings")) await loadDemo();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={() => {
        if (!busy) void finish(true);
      }}
      title={
        [
          "Welcome to DayHub",
          "What fills your day?",
          "Make it feel local",
          "A little forecast",
          "You’re right at home",
        ][step]
      }
    >
      <div className="onboarding">
        <div className="onboard-icon">
          <Sun size={38} />
        </div>
        <p>
          {
            [
              "Everything important today, in one place.",
              "Choose what you’d like to keep close. You can change this any time.",
              "Choose the currency you use every day.",
              "Where should we check the skies?",
              "Your day. A little clearer.",
            ][step]
          }
        </p>
        {step === 0 && (
          <label>
            What should we call you?
            <input
              aria-label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </label>
        )}
        {step === 1 && (
          <div className="onboard-options">
            {(
              [
                ["tasks", "Tasks", CheckCheck],
                ["bills", "Bills", Receipt],
                ["spending", "Expenses", Wallet],
                ["deliveries", "Deliveries", Package],
                ["prices", "Prices", TrendingDown],
                ["events", "Calendar", CalendarDays],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                className={selected.includes(id) ? "selected" : ""}
                key={id}
                onClick={() =>
                  setSelected(
                    selected.includes(id)
                      ? selected.filter((x) => x !== id)
                      : [...selected, id],
                  )
                }
              >
                <Icon size={21} />
                {label}
                {selected.includes(id) && <Check size={16} />}
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <select
            aria-label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {["AUD", "USD", "NZD", "GBP", "EUR", "NPR", "INR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
        {step === 3 && (
          <label>
            Weather city
            <input
              aria-label="Weather city"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        )}
        {step === 4 && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={demo}
              onChange={(e) => setDemo(e.target.checked)}
            />
            Start with editable demo data
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button
          className="primary full"
          disabled={busy}
          onClick={() => (step < 4 ? setStep(step + 1) : void finish())}
        >
          {busy
            ? "Preparing your space…"
            : step === 4
              ? "Open my DayHub"
              : "Continue"}
          <ArrowRight size={18} />
        </button>
        <div className="onboarding-footer">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => (step > 0 ? setStep(step - 1) : void finish(true))}
          >
            {step > 0 ? "Back" : "Skip setup"}
          </button>
          <div className="step-dots">
            {[0, 1, 2, 3, 4].map((i) => (
              <i className={i === step ? "active" : ""} key={i} />
            ))}
          </div>
          <span>{step + 1} of 5</span>
        </div>
      </div>
    </Sheet>
  );
}
