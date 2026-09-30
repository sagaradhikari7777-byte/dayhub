"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useStore } from "@/lib/store";
import { day, occurs, formatTime } from "@/lib/model";
import { Entry } from "@/types";
import { GenericRow } from "./rows";
import { PageHeader, EmptyState, GlassCard } from "./ui";
export function Today({ open }: { open: (e: Entry) => void }) {
  const { entries, settings } = useStore();
  const [selected, setSelected] = useState(day());
  const date = new Date(selected + "T12:00:00");
  const list = entries
    .filter(
      (e) =>
        (["tasks", "events", "bills", "expenses", "deliveries"].includes(
          e.kind,
        ) &&
          occurs(e, selected) &&
          !e.completed) ||
        (e.kind === "notifications" &&
          e.linkKind === "products" &&
          day(new Date(e.created_at)) === selected),
    )
    .sort((a, b) => (a.time || "23:59").localeCompare(b.time || "23:59"));
  const move = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setSelected(day(d));
  };
  const weekStart = new Date(date);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  return (
    <>
      <PageHeader
        eyebrow="EVERYTHING, IN ORDER"
        title={
          selected === day()
            ? "Today, in order"
            : date.toLocaleDateString("en-AU", { weekday: "long" })
        }
        detail={date.toLocaleDateString("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />
      <div className="date-picker">
        <button
          className="icon-button"
          aria-label="Previous day"
          onClick={() => move(-1)}
        >
          <ChevronLeft />
        </button>
        <input
          aria-label="Timeline date"
          type="date"
          value={selected}
          onChange={(e) => e.target.value && setSelected(e.target.value)}
        />
        <button
          className="icon-button"
          aria-label="Next day"
          onClick={() => move(1)}
        >
          <ChevronRight />
        </button>
        <button className="text-button" onClick={() => setSelected(day())}>
          Today
        </button>
      </div>
      <div className="week-strip" aria-label="Choose a day">
        {weekDays.map((d) => (
          <button
            key={day(d)}
            className={day(d) === selected ? "active" : ""}
            aria-pressed={day(d) === selected}
            aria-label={d.toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            onClick={() => setSelected(day(d))}
          >
            <small>{d.toLocaleDateString("en-AU", { weekday: "short" })}</small>
            <strong>{d.getDate()}</strong>
          </button>
        ))}
      </div>
      <div className="timeline">
        {list.length ? (
          list.map((e) => (
            <div className="timeline-item" key={e.id}>
              <div className="timeline-stamp">
                <span>{e.time ? formatTime(e.time, settings) : "Anytime"}</span>
                <i />
              </div>
              <GlassCard>
                <span className="eyebrow">
                  {e.kind === "notifications" ? "PRICE ALERT" : e.kind}
                </span>
                <GenericRow entry={e} open={() => open(e)} />
              </GlassCard>
            </div>
          ))
        ) : (
          <GlassCard>
            <EmptyState
              title="A clear day ahead"
              body="Events, tasks, bills and deliveries appear here as you add them."
            />
          </GlassCard>
        )}
      </div>
    </>
  );
}
