"use client";
import { useEffect, useState } from "react";
import { Plus, ExternalLink, Search, RefreshCw } from "lucide-react";
import type { Entry } from "@/types";
import type { StoreSuggestion } from "@/lib/price-tracking/discovery";
import {
  comparisonGroup,
  comparisonListings,
} from "@/lib/price-tracking/comparison";
import { money, uid } from "@/lib/model";
import { useStore } from "@/lib/store";
import { GlassCard } from "../ui";
import { AddStore } from "./add-store";

export function StoreComparison({
  product,
  edit,
}: {
  product: Entry;
  edit: (entry: Entry) => void;
}) {
  const { entries, settings, save, refresh, pending } = useStore();
  const [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [configured, setConfigured] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<StoreSuggestion[]>([]),
    [searchedAt, setSearchedAt] = useState("");
  const listings = comparisonListings(product, entries);
  const available = listings.filter(
    (e) => e.availability !== "Out of stock" && e.price !== undefined,
  );
  const lowest = available[0]?.price;
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/products/compare", { signal: abort.signal, cache: "no-store" })
      .then(async (r) => {
        if (r.ok) setConfigured(Boolean((await r.json()).configured));
      })
      .catch(() => {});
    return () => abort.abort();
  }, []);
  async function search() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/products/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSuggestions(data.suggestions || []);
      setSearchedAt(data.searchedAt);
      if (!data.suggestions?.length)
        setMessage(
          "No store matches found for this product. You can add a specific store link.",
        );
    } catch (e) {
      setMessage(
        e instanceof Error && !["TypeError", "TimeoutError"].includes(e.name)
          ? e.message
          : "Store search could not connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function checkAll() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/products/check-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: comparisonGroup(product) }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setMessage(
        `${data.checked} store prices checked · ${data.failed} need attention · ${data.skipped} checked recently.${data.limited ? " Check again to continue with remaining stores." : ""}`,
      );
      await refresh();
    } catch {
      setMessage(
        "The comparison could not be refreshed. Your saved prices have been kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function unlink(entry: Entry) {
    setBusy(true);
    setMessage("");
    try {
      await save({ ...entry, comparisonGroupId: uid() });
      setMessage(
        "Removed from this comparison. The store listing is still in Price Watch.",
      );
    } catch {
      setMessage("Could not remove this listing. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <GlassCard className="store-comparison">
      <div className="section-title">
        <div>
          <span className="eyebrow">SHOP AROUND</span>
          <h2>Prices across stores</h2>
        </div>
        <span className="badge subtle">
          {listings.length} {listings.length === 1 ? "store" : "stores"}
        </span>
      </div>
      <p className="hint">
        Same-product listings you have linked. Prices exclude delivery and
        checkout-only discounts.
      </p>
      <div className="store-offers">
        {listings.map((e) => (
          <article className="store-offer" key={e.id}>
            <div className="store-offer-heading">
              <div>
                <strong>{e.retailer || "Store"}</strong>
                <small>{e.title}</small>
              </div>
              <div className="store-offer-price">
                <strong>{money(e.price, settings.currency)}</strong>
                {listings.length > 1 &&
                  e.price === lowest &&
                  e.availability !== "Out of stock" && (
                    <span className="badge teal">Lowest listed</span>
                  )}
              </div>
            </div>
            <p className="hint">
              {e.availability || "Stock unknown"} ·{" "}
              {e.lastChecked
                ? `Checked ${new Date(e.lastChecked).toLocaleString()}`
                : "Manually entered · not verified"}
              {e.status === "Stopped" ? " · Tracking paused" : ""}
            </p>
            {e.checkStatus === "failed" && (
              <p className="hint">
                {e.checkError || "Last check failed. Saved price shown."}
              </p>
            )}
            <div className="button-row">
              {e.url && (
                <a
                  className="secondary"
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visit store <ExternalLink size={15} />
                </a>
              )}
              <button className="text-button" onClick={() => edit(e)}>
                Edit listing
              </button>
              {e.id !== product.id && e.comparisonGroupId && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => unlink(e)}
                >
                  Unlink
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="button-row">
        <button
          className="primary"
          onClick={() => setAdding(true)}
          disabled={busy}
        >
          <Plus size={17} />
          Add store
        </button>
        <button
          className="secondary"
          disabled={busy || pending > 0}
          onClick={checkAll}
        >
          <RefreshCw size={17} className={busy ? "spin" : ""} />
          Refresh stores
        </button>
      </div>
      <div className="comparison-discovery">
        <h3>Find other stores</h3>
        {configured ? (
          <>
            <p className="hint">
              Search Australian listings. Confirm the model, size and colour
              before adding a match.
            </p>
            <button
              className="secondary"
              disabled={busy || pending > 0}
              onClick={search}
            >
              <Search size={17} />
              Find store prices
            </button>
          </>
        ) : (
          <p className="hint">
            Automatic discovery{" "}
            {configured === false
              ? "needs a search provider connection"
              : "is being checked"}
            . You can add store URLs to compare their prices now.
          </p>
        )}
        <a
          className="text-button"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://www.google.com/search?tbm=shop&gl=au&q=${encodeURIComponent(product.title)}`}
        >
          Search Google Shopping <ExternalLink size={15} />
        </a>
        {suggestions.length > 0 && (
          <>
            <p className="hint">
              Possible matches · search results from{" "}
              {new Date(searchedAt).toLocaleString()}. These prices have not
              been verified directly with the stores.
            </p>
            {suggestions.map((s) => (
              <article className="store-offer" key={`${s.retailer}:${s.url}`}>
                <div className="store-offer-heading">
                  <div>
                    <strong>{s.retailer}</strong>
                    <small>{s.title}</small>
                  </div>
                  <strong>{money(s.price, "AUD")}</strong>
                </div>
                <p className="hint">
                  {s.delivery} · {s.condition}
                </p>
                <a
                  className="secondary"
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View offer <ExternalLink size={15} />
                </a>
              </article>
            ))}
          </>
        )}
      </div>
      {message && (
        <p className="info" role="status">
          {message}
        </p>
      )}
      {adding && (
        <AddStore product={product} onClose={() => setAdding(false)} />
      )}
    </GlassCard>
  );
}
