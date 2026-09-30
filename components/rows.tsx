"use client";
import { useRef, useState } from "react";
import { Entry } from "@/types";
import { useStore } from "@/lib/store";
import {
  billStatus,
  formatTime,
  money,
  priceFacts,
  relativeDate,
} from "@/lib/model";
import {
  Check,
  ChevronRight,
  Package,
  CalendarDays,
  Receipt,
  Pin,
  StickyNote,
  ShoppingBag,
  ArrowDownRight,
  Headphones,
  Glasses,
  Wallet,
} from "lucide-react";
export function TaskRow({
  entry: e,
  open,
}: {
  entry: Entry;
  open: () => void;
}) {
  const { save, settings } = useStore();
  const start = useRef(0);
  return (
    <div
      className={`task-row ${e.completed ? "completed" : ""}`}
      onTouchStart={(v) => {
        start.current = v.touches[0].clientX;
      }}
      onTouchEnd={(v) => {
        if (v.changedTouches[0].clientX - start.current > 90)
          void save({ ...e, completed: true });
      }}
    >
      <button
        aria-label={`${e.completed ? "Reopen" : "Complete"} ${e.title}`}
        aria-pressed={!!e.completed}
        className={`task-check ${e.completed ? "checked" : ""}`}
        onClick={() => void save({ ...e, completed: !e.completed })}
      >
        {e.completed && <Check size={15} />}
      </button>
      <button className="row-main" onClick={open}>
        <strong>{e.title}</strong>
        <small>
          {e.time ? `${formatTime(e.time, settings)} · ` : ""}
          {e.category || relativeDate(e.date, settings)}
        </small>
      </button>
      {e.priority === "High" && <span className="badge orange">Priority</span>}
    </div>
  );
}
export function EventRow({
  entry: e,
  open,
}: {
  entry: Entry;
  open: () => void;
}) {
  const { settings } = useStore();
  return (
    <button className="event-row" onClick={open}>
      <span className="event-time">
        {e.time ? formatTime(e.time, settings).split(" ")[0] : "All day"}
        <small>
          {e.time && settings.timeFormat === "12"
            ? formatTime(e.time, settings).split(" ")[1]
            : relativeDate(e.date, settings)}
        </small>
      </span>
      <span className={`event-line ${e.colour || "blue"}`} />
      <span className="row-main">
        <strong>{e.title}</strong>
        <small>
          {e.location || e.category || relativeDate(e.date, settings)}
        </small>
      </span>
      <ChevronRight size={16} />
    </button>
  );
}
export function BillRow({
  entry: e,
  open,
}: {
  entry: Entry;
  open: () => void;
}) {
  const { settings } = useStore();
  return (
    <button className="data-row" onClick={open}>
      <span className="icon-tile purple">
        <Receipt size={19} />
      </span>
      <span className="row-main">
        <strong>{e.title}</strong>
        <small className={billStatus(e) === "Overdue" ? "red-text" : ""}>
          {e.paid ? "Paid" : relativeDate(e.date, settings)}
        </small>
      </span>
      <strong>{money(e.amount, settings.currency)}</strong>
    </button>
  );
}
export function DeliveryCard({
  entry: e,
  open,
}: {
  entry: Entry;
  open: () => void;
}) {
  const { settings } = useStore();
  return (
    <button className="delivery-row" onClick={open}>
      <span className="icon-tile orange">
        <Package size={21} />
      </span>
      <span className="row-main">
        <strong>{e.title}</strong>
        <small>
          {e.courier || e.retailer} · {relativeDate(e.date, settings)}
        </small>
        <span className="delivery-steps">
          {Array.from({ length: 6 }, (_, i) => (
            <i
              key={i}
              className={
                i <=
                [
                  "Ordered",
                  "Processing",
                  "Shipped",
                  "In transit",
                  "Out for delivery",
                  "Delivered",
                ].indexOf(e.status || "Ordered")
                  ? "active"
                  : ""
              }
            />
          ))}
        </span>
      </span>
      <span className="badge teal">{e.status}</span>
    </button>
  );
}
export function ProductImage({ entry: e }: { entry: Entry }) {
  const [failedImage, setFailedImage] = useState("");
  return (
    <span className="product-image">
      {e.image && failedImage !== e.image ? (
        <img
          src={e.image}
          alt={e.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(e.image || "")}
        />
      ) : e.title.toLowerCase().includes("sony") ? (
        <Headphones />
      ) : e.title.toLowerCase().includes("ray") ? (
        <Glasses />
      ) : (
        <ShoppingBag />
      )}
    </span>
  );
}
export function PriceCard({
  entry: e,
  open,
  compact = false,
}: {
  entry: Entry;
  open: () => void;
  compact?: boolean;
}) {
  const { settings } = useStore(),
    f = priceFacts(e);
  return (
    <button className={`price-card ${compact ? "compact" : ""}`} onClick={open}>
      <ProductImage entry={e} />
      <span className="price-content">
        <small>{e.retailer || "Your wishlist"}</small>
        <strong>{e.title}</strong>
        <span className="price-line">
          <b>{money(e.price, settings.currency)}</b>
          {f.previous !== (e.price || 0) && (
            <s>{money(f.previous, settings.currency)}</s>
          )}
          {f.drop !== 0 && (
            <span className={`badge ${f.drop > 0 ? "teal" : "red"}`}>
              {f.drop > 0 ? "↓" : "↑"} {Math.abs(f.percent)}%
            </span>
          )}
        </span>
        {!compact &&
          e.targetPrice !== undefined &&
          e.targetPrice > 0 &&
          e.status !== "Purchased" && (
            <span
              className="target-progress"
              aria-label={`Target price ${money(e.targetPrice, settings.currency)}`}
            >
              <span
                style={{
                  width: `${Math.min(100, e.price ? (e.targetPrice / e.price) * 100 : 0)}%`,
                }}
              />
            </span>
          )}
        {!compact && (
          <span className="target-line">
            {e.status === "Purchased"
              ? "Purchased"
              : f.target
                ? "✓ Target reached"
                : e.targetPrice && e.targetPrice > 0
                  ? `Target ${money(e.targetPrice, settings.currency)}`
                  : "No target set"}
            {e.availability === "Out of stock" ? " · Out of stock" : ""}
            {e.checkStatus === "failed"
              ? " · Check needs attention"
              : !e.lastChecked
                ? " · Manual price"
                : ""}
          </span>
        )}
      </span>
      {compact && <ChevronRight size={17} />}
    </button>
  );
}
export function GenericRow({
  entry: e,
  open,
}: {
  entry: Entry;
  open: () => void;
}) {
  const { settings } = useStore();
  if (e.kind === "tasks") return <TaskRow entry={e} open={open} />;
  if (e.kind === "events") return <EventRow entry={e} open={open} />;
  if (e.kind === "bills") return <BillRow entry={e} open={open} />;
  if (e.kind === "deliveries") return <DeliveryCard entry={e} open={open} />;
  if (e.kind === "products") return <PriceCard entry={e} open={open} />;
  return (
    <button className="data-row" onClick={open}>
      <span className="icon-tile">
        {e.kind === "expenses" ? (
          <Wallet size={20} />
        ) : e.pinned ? (
          <Pin size={19} />
        ) : (
          <StickyNote size={20} />
        )}
      </span>
      <span className="row-main">
        <strong>{e.title}</strong>
        <small>
          {e.body?.slice(0, 90) || e.category || relativeDate(e.date, settings)}
        </small>
      </span>
      {e.kind === "expenses" ? (
        <strong>{money(e.amount, settings.currency)}</strong>
      ) : (
        <ChevronRight size={18} />
      )}
    </button>
  );
}
