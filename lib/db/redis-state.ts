import type { Entry, Mutation } from "@/types";
import { alertReason, createEntry, nextDate, point, uid } from "@/lib/model";
import { ConflictError } from "./errors";

export type PushRecord = { id: string; data: string; created_at: string };
export type RedisState = {
  revision: number;
  entries: Entry[];
  operations: Record<string, true>;
  dedupes: Record<string, string>;
  subscriptions: PushRecord[];
  receipts: Record<string, string[]>;
};
export function emptyState(): RedisState {
  return {
    revision: 0,
    entries: [],
    operations: {},
    dedupes: {},
    subscriptions: [],
    receipts: {},
  };
}

// Pure transaction preparation. Redis commits this entire state with a version check.
export function applyMutation(
  state: RedisState,
  mutation: Mutation,
): RedisState {
  if (state.operations[mutation.opId]) return state;
  const next = structuredClone(state);
  const before = next.entries.find(
    (e) => e.id === mutation.entry.id && e.kind === mutation.entry.kind,
  );
  if ((before?.version || 0) !== mutation.expectedVersion) {
    throw new ConflictError(
      "This item changed elsewhere. Your pending change is kept on this device.",
    );
  }
  const save = (entry: Entry) => {
    if (entry.kind === "notifications" && entry.dedupe) {
      const prior = next.dedupes[entry.dedupe];
      if (prior && prior !== entry.id) return;
      next.dedupes[entry.dedupe] = entry.id;
    }
    next.entries = next.entries.filter((e) => e.id !== entry.id).concat(entry);
  };
  if (mutation.action === "delete") {
    next.entries = next.entries.filter(
      (e) => !(e.id === mutation.entry.id && e.kind === mutation.entry.kind),
    );
    if (mutation.entry.kind === "wishlists") {
      next.entries = next.entries.map((e) =>
        e.kind === "products" && e.wishlistId === mutation.entry.id
          ? {
              ...e,
              wishlistId: undefined,
              version: e.version + 1,
              updated_at: new Date().toISOString(),
            }
          : e,
      );
    }
  } else {
    const entry: Entry = {
      ...mutation.entry,
      version: (before?.version || 0) + 1,
      updated_at: new Date().toISOString(),
    };
    // Client-supplied history is accepted only by the explicit backup restore path.
    delete entry.history;
    if (entry.kind === "products") {
      const history = before?.history || [];
      entry.history =
        mutation.restoreHistory && mutation.entry.history?.length
          ? mutation.entry.history
              .map((p) => ({ ...p, id: uid() }))
              .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
          : [...history];
      if (
        !mutation.restoreHistory &&
        (!before ||
          before.price !== entry.price ||
          before.availability !== entry.availability ||
          before.lastChecked !== entry.lastChecked)
      ) {
        const p = point(entry);
        const last = history.at(-1);
        if (last && last.recorded_at >= p.recorded_at)
          p.recorded_at = new Date(
            Date.parse(last.recorded_at) + 1,
          ).toISOString();
        entry.history.push(p);
        const reason =
          before && entry.status !== "Stopped"
            ? alertReason(before, entry)
            : null;
        const settings = next.entries.find(
          (e) => e.kind === "settings",
        )?.profile;
        if (reason && settings?.notifications.products !== false) {
          save(
            createEntry("notifications", {
              title: `${reason}: ${entry.title}`,
              body: `${before!.price} → ${entry.price}`,
              linkKind: "products",
              linkId: entry.id,
              read: false,
              dedupe: `${entry.id}:${entry.version}`,
            }),
          );
          save(
            createEntry("activity_log", {
              title: `${reason}: ${entry.title}`,
              category: "products",
              linkKind: "products",
              linkId: entry.id,
            }),
          );
        }
      }
    }
    save(entry);
    if (
      before &&
      entry.recurrence &&
      entry.recurrence !== "none" &&
      ((entry.kind === "tasks" && entry.completed && !before.completed) ||
        (entry.kind === "bills" && entry.paid && !before.paid))
    ) {
      save(
        createEntry(entry.kind, {
          ...entry,
          id: uid(),
          version: 1,
          completed: false,
          paid: false,
          date: nextDate(
            entry.date || new Date().toISOString().slice(0, 10),
            entry.recurrence,
            entry.customDays,
          ),
        }),
      );
    }
    if (!["activity_log", "notifications", "settings"].includes(entry.kind)) {
      const action =
        entry.kind === "tasks" && entry.completed
          ? "Completed"
          : entry.kind === "bills" && entry.paid
            ? "Paid"
            : entry.kind === "products" && entry.status === "Purchased"
              ? "Purchased"
              : before
                ? "Updated"
                : "Added";
      save(
        createEntry("activity_log", {
          title: `${action} ${entry.title}`,
          category: entry.kind,
          linkKind: entry.kind,
          linkId: entry.id,
        }),
      );
    }
  }
  next.operations[mutation.opId] = true;
  return next;
}
