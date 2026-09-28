"use client";
import { useState } from "react";
import { Bell, Check, Trash2, ArrowDownRight, CheckCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { Entry } from "@/types";
import { PageHeader, GlassCard, EmptyState } from "./ui";
export function Activity({
  open,
  notificationsOnly = false,
  back,
}: {
  open: (e: Entry) => void;
  notificationsOnly?: boolean;
  back?: () => void;
}) {
  const { entries, save, remove } = useStore();
  const [tab, setTab] = useState(
      notificationsOnly ? "Notifications" : "All activity",
    ),
    [filter, setFilter] = useState("All");
  const notifications = tab === "Notifications";
  const rows = entries
    .filter(
      (e) =>
        e.kind === (notifications ? "notifications" : "activity_log") &&
        !e.archived &&
        (filter === "All" || e.category === filter),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unread = entries.filter((e) => e.kind === "notifications" && !e.read);
  return (
    <>
      <PageHeader
        back={back}
        eyebrow="THE LITTLE UPDATES"
        title={notificationsOnly ? "Your notifications" : "Activity"}
        detail={`${unread.length} unread notifications`}
        action={
          unread.length > 0 ? (
            <button
              className="text-button"
              onClick={async () => {
                for (const e of unread) await save({ ...e, read: true });
              }}
            >
              <CheckCheck size={18} />
              Mark all read
            </button>
          ) : undefined
        }
      />
      {!notificationsOnly && (
        <div className="segmented">
          <button
            className={tab === "All activity" ? "active" : ""}
            onClick={() => {
              setTab("All activity");
              setFilter("All");
            }}
          >
            All activity
          </button>
          <button
            className={notifications ? "active" : ""}
            onClick={() => {
              setTab("Notifications");
              setFilter("All");
            }}
          >
            Notifications {unread.length > 0 && `(${unread.length})`}
          </button>
        </div>
      )}
      {!notifications && (
        <div className="filter-row">
          {[
            "All",
            "products",
            "tasks",
            "bills",
            "expenses",
            "events",
            "deliveries",
            "notes",
          ].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <GlassCard>
        {rows.length ? (
          rows.map((e) => (
            <div
              className={`activity-row ${notifications && !e.read ? "unread" : ""}`}
              key={e.id}
            >
              <span className="icon-tile teal">
                {notifications ? <Bell size={19} /> : <Check size={19} />}
              </span>
              <button
                className="row-main"
                onClick={() => {
                  if (notifications) void save({ ...e, read: true });
                  const related = entries.find((x) => x.id === e.linkId);
                  open(related || e);
                }}
              >
                <strong>{e.title}</strong>
                {e.body && <span>{e.body}</span>}
                <small>
                  {new Date(e.created_at).toLocaleString("en-AU", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </small>
              </button>
              {notifications && (
                <>
                  {!e.read && (
                    <button
                      className="icon-button"
                      aria-label={`Mark ${e.title} read`}
                      onClick={() => void save({ ...e, read: true })}
                    >
                      <Check size={16} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Clear ${e.title}`}
                    onClick={() =>
                      void save({ ...e, read: true, archived: true })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          ))
        ) : (
          <EmptyState
            title={
              notifications ? "All quiet for now" : "Your story starts here"
            }
            body="Updates will appear as you use DayHub."
          />
        )}
      </GlassCard>
    </>
  );
}
