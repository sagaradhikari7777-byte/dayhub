"use client";
import { useState } from "react";
import { Plus, ExternalLink, RefreshCw } from "lucide-react";
import type { Entry } from "@/types";
import {
  comparisonGroup,
  comparisonListings,
} from "@/lib/price-tracking/comparison";
import { money, uid } from "@/lib/model";
import { useStore } from "@/lib/store";
import { GlassCard } from "../ui";
import { AddStore } from "./add-store";

export function SavedStores({
  product,
  edit,
}: {
  product: Entry;
  edit: (entry: Entry) => void;
}) {
  const { entries, settings, save, refresh, pending } = useStore();
  const [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const listings = comparisonListings(product, entries);
  const available = listings.filter(
    (e) => e.availability !== "Out of stock" && e.price !== undefined,
  );
  const lowest = available[0]?.price;
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
          <h2>Saved store listings</h2>
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
