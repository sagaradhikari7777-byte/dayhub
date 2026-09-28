"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import {
  Edit3,
  Trash2,
  ExternalLink,
  Check,
  ShoppingBag,
  Pause,
  Play,
  TrendingDown,
  Pin,
} from "lucide-react";
import { Entry, labels } from "@/types";
import { useStore } from "@/lib/store";
import {
  money,
  priceFacts,
  relativeDate,
  formatTime,
  billStatus,
} from "@/lib/model";
import { PageHeader, GlassCard, Confirm, Sheet, SkeletonCard } from "./ui";
import { ProductImage } from "./rows";
const History = dynamic(() => import("./price-watch/history"), {
  loading: () => <SkeletonCard />,
});
export function Detail({
  id,
  back,
  edit,
}: {
  id: string;
  back: () => void;
  edit: (e: Entry) => void;
}) {
  const { entries, save, remove, settings } = useStore();
  const e = entries.find((x) => x.id === id);
  const [purchase, setPurchase] = useState(false),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  if (!e)
    return (
      <>
        <PageHeader title="This item is no longer here" back={back} />
        <p className="muted">It may have been deleted on this device.</p>
      </>
    );
  const f = priceFacts(e),
    currency = settings.currency;
  const destroy = async () => {
    try {
      await remove(e);
      back();
    } catch {
      setError("Unable to delete. Please try again.");
    }
  };
  const fields: [string, string | undefined][] = [
    ["Date", e.date ? `${relativeDate(e.date)} · ${e.date}` : undefined],
    [
      "Time",
      e.time
        ? `${formatTime(e.time, settings)}${e.endTime ? " – " + formatTime(e.endTime, settings) : ""}`
        : undefined,
    ],
    ["Location", e.location],
    ["Category", e.category],
    ["Priority", e.priority],
    [
      "Repeat",
      e.recurrence && e.recurrence !== "none" ? e.recurrence : undefined,
    ],
    ["Company", e.company],
    ["Merchant", e.merchant],
    ["Courier", e.courier],
    ["Tracking number", e.trackingNumber],
    ["Status", e.kind === "bills" ? billStatus(e) : e.status],
    ["Availability", e.availability],
  ];
  return (
    <>
      <PageHeader
        back={back}
        eyebrow={labels[e.kind].toUpperCase()}
        title={e.title}
        detail={e.retailer || e.category}
        action={
          <button className="secondary" onClick={() => edit(e)}>
            <Edit3 size={17} />
            Edit
          </button>
        }
      />
      {e.kind === "products" ? (
        <>
          <GlassCard className="product-hero">
            <ProductImage entry={e} />
            <div>
              <span className="eyebrow">CURRENT PRICE</span>
              <h2>{money(e.price, currency)}</h2>
              {e.originalPrice !== undefined && (
                <p className="muted">
                  RRP <s>{money(e.originalPrice, currency)}</s> · Save{" "}
                  {money(
                    Math.max(0, e.originalPrice - (e.price || 0)),
                    currency,
                  )}{" "}
                  (
                  {e.originalPrice
                    ? Math.round((1 - (e.price || 0) / e.originalPrice) * 100)
                    : 0}
                  %)
                </p>
              )}
              <span className={`badge ${f.target ? "teal" : "subtle"}`}>
                {f.target
                  ? "✓ Target reached"
                  : `Target ${money(e.targetPrice, currency)}`}
              </span>
            </div>
          </GlassCard>
          <GlassCard>
            <History entry={e} />
          </GlassCard>
          <div className="button-row">
            {e.url && (
              <a
                className="primary"
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit store
                <ExternalLink size={17} />
              </a>
            )}
            <button className="secondary" onClick={() => edit(e)}>
              <TrendingDown size={17} />
              Update price / alert
            </button>
            <button
              className="secondary"
              onClick={() => {
                setValue(String(e.price || ""));
                setPurchase(true);
              }}
            >
              <ShoppingBag size={17} />
              {e.status === "Purchased" ? "Edit purchase" : "Mark purchased"}
            </button>
            <button
              className="secondary"
              onClick={() =>
                void save({
                  ...e,
                  status: e.status === "Stopped" ? "Watching" : "Stopped",
                })
              }
            >
              {e.status === "Stopped" ? (
                <Play size={17} />
              ) : (
                <Pause size={17} />
              )}{" "}
              {e.status === "Stopped" ? "Resume tracking" : "Stop tracking"}
            </button>
          </div>
          {e.status === "Purchased" && (
            <div className="info">
              Purchased for {money(e.purchasePrice, currency)} · Saved{" "}
              {money(
                Math.max(
                  0,
                  (e.history?.[0]?.price || e.originalPrice || 0) -
                    (e.purchasePrice || 0),
                ),
                currency,
              )}{" "}
              by waiting.
            </div>
          )}
          <p className="hint">
            Last automatic check:{" "}
            {e.lastChecked
              ? new Date(e.lastChecked).toLocaleString()
              : "Not checked yet. Add a store URL for automatic checks."}
          </p>
        </>
      ) : e.amount !== undefined ? (
        <GlassCard className="amount-card">
          <small>{e.kind === "bills" ? "AMOUNT DUE" : "EXPENSE"}</small>
          <strong>{money(e.amount, currency)}</strong>
        </GlassCard>
      ) : null}
      <GlassCard>
        <dl className="detail-fields">
          {fields
            .filter(([, v]) => v)
            .map(([label, v]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        {e.body && <p className="note-body">{e.body}</p>}
        {e.notes && <p className="note-body">{e.notes}</p>}
        <p className="hint">
          Added {new Date(e.created_at).toLocaleDateString()} · Edited{" "}
          {new Date(e.updated_at).toLocaleDateString()}
        </p>
      </GlassCard>
      <div className="button-row">
        {e.kind === "tasks" && (
          <button
            className="primary"
            onClick={() => void save({ ...e, completed: !e.completed })}
          >
            <Check size={18} />
            {e.completed ? "Reopen task" : "Mark complete"}
          </button>
        )}
        {e.kind === "bills" && (
          <button
            className="primary"
            onClick={() => void save({ ...e, paid: !e.paid })}
          >
            <Check size={18} />
            {e.paid ? "Mark unpaid" : "Mark paid"}
          </button>
        )}
        {e.kind === "deliveries" && (
          <>
            <button
              className="primary"
              onClick={() =>
                void save({
                  ...e,
                  status: e.status === "Delivered" ? "In transit" : "Delivered",
                })
              }
            >
              <Check size={18} />
              {e.status === "Delivered" ? "Reopen delivery" : "Mark delivered"}
            </button>
            {e.url && (
              <a
                className="secondary"
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Track package <ExternalLink size={17} />
              </a>
            )}
          </>
        )}
        {e.kind === "notes" && (
          <>
            <button
              className="secondary"
              onClick={() => void save({ ...e, pinned: !e.pinned })}
            >
              <Pin size={17} />
              {e.pinned ? "Unpin note" : "Pin to Home"}
            </button>
            <button
              className="secondary"
              onClick={() => void save({ ...e, archived: !e.archived })}
            >
              {e.archived ? "Unarchive" : "Archive"}
            </button>
          </>
        )}
        <Confirm
          title={`Delete ${e.title}?`}
          body="This removes the item from your DayHub account."
          onConfirm={() => void destroy()}
        >
          <button className="danger-button">
            <Trash2 size={17} />
            Delete
          </button>
        </Confirm>
      </div>
      {error && <p className="error">{error}</p>}
      {purchase && (
        <Sheet
          open
          onClose={() => setPurchase(false)}
          title="A little patience paid off"
        >
          <form
            className="editor"
            onSubmit={async (v) => {
              v.preventDefault();
              try {
                await save({
                  ...e,
                  status: "Purchased",
                  purchasePrice: Number(value),
                  purchasedAt: e.purchasedAt || new Date().toISOString(),
                });
                setPurchase(false);
              } catch {
                setError("Purchase could not be saved.");
              }
            }}
          >
            <label>
              Final purchase price ({currency})
              <input
                aria-label="Final purchase price"
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                required
                value={value}
                onChange={(v) => setValue(v.target.value)}
              />
            </label>
            <button className="primary full">Save purchase</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
