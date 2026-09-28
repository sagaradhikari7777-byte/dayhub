"use client";
import { useState } from "react";
import {
  Plus,
  RefreshCw,
  Sparkles,
  Heart,
  TrendingDown,
  Check,
  Search,
} from "lucide-react";
import { Entry, Kind, labels } from "@/types";
import { useStore } from "@/lib/store";
import { day, priceFacts, money } from "@/lib/model";
import { PageHeader, GlassCard, EmptyState } from "./ui";
import { GenericRow, PriceCard } from "./rows";
import { ExpenseSummary } from "./dashboard/spending";
import { ScheduleStatus } from "./price-watch/check-status";
export function Collection({
  kind,
  open,
  add,
  back,
}: {
  kind: Kind;
  open: (e: Entry) => void;
  add: (k: Kind) => void;
  back?: () => void;
}) {
  const { entries, settings, refresh, pending } = useStore();
  const [checkResults, setCheckResults] = useState<
    { id: string; title: string; status: string; message?: string }[]
  >([]);
  const [filter, setFilter] = useState("All"),
    [sort, setSort] = useState("Recently added"),
    [query, setQuery] = useState(""),
    [wishlist, setWishlist] = useState(""),
    [checking, setChecking] = useState(false),
    [message, setMessage] = useState("");
  const all = entries.filter((e) => e.kind === kind);
  let list = all.filter((e) =>
    `${e.title} ${e.retailer || ""} ${e.body || ""} ${e.merchant || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const filters =
    kind === "products"
      ? [
          "All",
          "Price Drops",
          "Target Reached",
          "Watching",
          "Out of Stock",
          "Purchased",
          "Deals",
        ]
      : kind === "tasks"
        ? ["All", "Today", "Upcoming", "Completed"]
        : kind === "bills"
          ? ["All", "Upcoming", "Overdue", "Paid"]
          : kind === "notes"
            ? ["All", "Pinned", "Archived"]
            : kind === "deliveries"
              ? ["All", "In progress", "Delivered"]
              : ["All"];
  list = list.filter((e) => {
    const f = priceFacts(e);
    if (wishlist && e.wishlistId !== wishlist) return false;
    if (filter === "Price Drops" || filter === "Deals")
      return f.drop > 0 || f.target || f.newLow;
    if (filter === "Target Reached") return f.target;
    if (filter === "Watching") return e.status === "Watching";
    if (filter === "Purchased") return e.status === "Purchased";
    if (filter === "Out of Stock") return e.availability === "Out of stock";
    if (filter === "Today") return !e.completed && (!e.date || e.date <= day());
    if (filter === "Upcoming")
      return !e.completed && !e.paid && !!e.date && e.date > day();
    if (filter === "Completed") return e.completed;
    if (filter === "Paid") return e.paid;
    if (filter === "Overdue") return !e.paid && !!e.date && e.date < day();
    if (filter === "Pinned") return e.pinned && !e.archived;
    if (filter === "Archived") return e.archived;
    if (filter === "In progress") return e.status !== "Delivered";
    if (filter === "Delivered") return e.status === "Delivered";
    if (kind === "notes") return !e.archived;
    return true;
  });
  list.sort((a, b) => {
    if (sort === "Biggest discount")
      return priceFacts(b).percent - priceFacts(a).percent;
    if (sort === "Lowest price") return (a.price || 0) - (b.price || 0);
    if (sort === "Recently changed")
      return b.updated_at.localeCompare(a.updated_at);
    if (sort === "Closest to target")
      return (
        (a.price || 0) -
        (a.targetPrice || 0) -
        ((b.price || 0) - (b.targetPrice || 0))
      );
    if (kind !== "products")
      return (a.date || a.created_at).localeCompare(b.date || b.created_at);
    return b.created_at.localeCompare(a.created_at);
  });
  const purchases = all.filter(
    (e) =>
      e.status === "Purchased" &&
      e.purchasedAt?.startsWith(String(new Date().getFullYear())),
  );
  const savings = purchases.reduce(
    (s, e) =>
      s +
      Math.max(
        0,
        (e.history?.[0]?.price ?? e.originalPrice ?? e.price ?? 0) -
          (e.purchasePrice || 0),
      ),
    0,
  );
  async function check() {
    setChecking(true);
    setMessage("");
    setCheckResults([]);
    try {
      if (!navigator.onLine)
        throw new Error("Connect to the internet to check stores.");
      const r = await fetch("/api/products/check-price", {
          method: "POST",
          signal: AbortSignal.timeout(60000),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage(
        `${d.checked} checked · ${d.failed} need attention${d.skipped ? ` · ${d.skipped} checked recently` : ""}.${d.limited ? " More products remain. Check again to continue." : ""}`,
      );
      setCheckResults(d.results || []);
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof Error &&
          e.name !== "TypeError" &&
          e.name !== "TimeoutError"
          ? e.message
          : "The connection timed out. Your saved prices are unchanged.",
      );
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <PageHeader
        back={back}
        eyebrow={
          kind === "products" ? "WORTH THE WAIT" : "YOUR EVERYDAY, ORGANISED"
        }
        title={labels[kind]}
        detail={
          kind === "products"
            ? "The things you love. At a price you’ll love."
            : `${all.length} ${all.length === 1 ? "item" : "items"} in your space`
        }
        action={
          <button className="primary" onClick={() => add(kind)}>
            <Plus size={18} />
            <span>
              Add{" "}
              {kind === "products"
                ? "product"
                : kind === "deliveries"
                  ? "delivery"
                  : kind.slice(0, -1)}
            </span>
          </button>
        }
      />
      {kind === "products" && (
        <div className="watch-summary">
          <GlassCard>
            <span className="eyebrow">SAVED BY WAITING</span>
            <strong>{money(savings, settings.currency)}</strong>
            <small>{purchases.length} purchases this year</small>
            <Sparkles />
          </GlassCard>
          <GlassCard>
            <span className="eyebrow">IN YOUR SIGHTS</span>
            <strong>{all.filter((e) => e.status === "Watching").length}</strong>
            <small>
              {
                all.filter(
                  (e) => e.status === "Watching" && priceFacts(e).target,
                ).length
              }{" "}
              targets reached
            </small>
            <Heart />
          </GlassCard>
        </div>
      )}
      {kind === "expenses" && (
        <GlassCard>
          <ExpenseSummary expanded />
        </GlassCard>
      )}
      <div className="collection-tools">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label={`Search ${labels[kind]}`}
            placeholder={`Search ${labels[kind].toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {kind === "products" && (
          <>
            <select
              aria-label="Sort products"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {[
                "Recently added",
                "Biggest discount",
                "Lowest price",
                "Recently changed",
                "Closest to target",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              className="secondary"
              disabled={checking || pending > 0}
              onClick={check}
            >
              <RefreshCw size={17} className={checking ? "spin" : ""} />
              Check prices
            </button>
          </>
        )}
      </div>
      {kind === "products" && (
        <>
          <ScheduleStatus />
          {pending > 0 && (
            <p className="hint">
              Waiting for changes to sync before checking prices.
            </p>
          )}
          {checkResults.some((r) => r.status === "failed") && (
            <details className="history-table" open>
              <summary>Products that need attention</summary>
              {checkResults
                .filter((r) => r.status === "failed")
                .map((r) => (
                  <div key={r.id}>
                    <button
                      className="text-button"
                      onClick={() => {
                        const e = entries.find((e) => e.id === r.id);
                        if (e) open(e);
                      }}
                    >
                      {r.title}
                    </button>
                    <p className="hint">{r.message}</p>
                  </div>
                ))}
            </details>
          )}
        </>
      )}
      <div className="filter-row">
        {filters.map((f) => (
          <button
            className={f === filter ? "active" : ""}
            key={f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      {kind === "products" && (
        <div className="wishlist-row">
          <select
            aria-label="Filter by wishlist"
            value={wishlist}
            onChange={(e) => setWishlist(e.target.value)}
          >
            <option value="">All wishlists</option>
            {entries
              .filter((e) => e.kind === "wishlists")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
          </select>
          <button className="text-button" onClick={() => add("wishlists")}>
            <Plus size={15} />
            New wishlist
          </button>
        </div>
      )}
      {message && (
        <p className="info" role="status">
          {message}
        </p>
      )}
      {list.length ? (
        <div
          className={kind === "products" ? "product-grid" : "list-card glass"}
        >
          {list.map((e) =>
            kind === "products" ? (
              <div className="glass product-wrapper" key={e.id}>
                {filter === "Deals" && (
                  <p className="eyebrow teal-text">
                    {priceFacts(e).target
                      ? "TARGET REACHED"
                      : priceFacts(e).newLow
                        ? "NEW LOWEST PRICE"
                        : "PRICE DROP"}
                  </p>
                )}
                <PriceCard entry={e} open={() => open(e)} />
              </div>
            ) : (
              <GenericRow key={e.id} entry={e} open={() => open(e)} />
            ),
          )}
        </div>
      ) : (
        <GlassCard>
          <EmptyState
            title={
              query || filter !== "All"
                ? "Nothing matches just yet"
                : kind === "products"
                  ? "Nothing tracked yet."
                  : `Your ${labels[kind].toLowerCase()} start here`
            }
            body={
              kind === "products"
                ? "Add something you’re thinking of buying and keep its price in view."
                : "Save something now. Find it here when you need it."
            }
            action={() => add(kind)}
            label={
              kind === "products" ? "Track your first product" : "Add an item"
            }
          />
        </GlassCard>
      )}
    </>
  );
}
