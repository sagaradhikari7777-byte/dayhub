"use client";
import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import type { Entry } from "@/types";
import type {
  DiscoveryResult,
  StoreSuggestion,
} from "@/lib/price-tracking/discovery";
import { useStore } from "@/lib/store";
import { money } from "@/lib/model";
import { GlassCard, SkeletonCard } from "../ui";
import { SavedStores } from "./saved-stores";

type SearchState = {
  key: string;
  status: "loading" | "ready" | "setup" | "error";
  data?: DiscoveryResult;
  message?: string;
};
export function StoreComparison({
  product,
  edit,
}: {
  product: Entry;
  edit: (entry: Entry) => void;
}) {
  const { pending, settings } = useStore();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({
    key: "",
    status: "loading",
  });
  const key = `${product.id}:${product.title}:${settings.currency}`;
  const canSearch = pending === 0;
  useEffect(() => {
    if (!canSearch) return;
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]);
    setState((previous) => ({
      key,
      status: "loading",
      data: previous.key === key ? previous.data : undefined,
    }));
    async function run() {
      try {
        if (settings.currency !== "AUD") {
          setState({
            key,
            status: "error",
            message:
              "Automatic comparison currently supports Australian prices in AUD.",
          });
          return;
        }
        const config = await fetch("/api/products/compare", {
          signal,
          cache: "no-store",
        });
        if (!config.ok)
          throw new Error("Comparison service could not be reached.");
        if (!(await config.json()).configured) {
          setState({ key, status: "setup" });
          return;
        }
        const response = await fetch("/api/products/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id, refresh: attempt > 0 }),
          signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Comparison is temporarily unavailable.",
          );
        if (!abort.signal.aborted) setState({ key, status: "ready", data });
      } catch (error) {
        if (abort.signal.aborted) return;
        setState((previous) => ({
          key,
          status: "error",
          data: previous.key === key ? previous.data : undefined,
          message:
            error instanceof Error &&
            !["TypeError", "TimeoutError", "SyntaxError"].includes(error.name)
              ? error.message
              : "Could not load store prices. Your saved product is safe. Try again when connected.",
        }));
      }
    }
    void run();
    return () => abort.abort();
  }, [key, product.id, settings.currency, canSearch, attempt]);
  const current =
    state.key === key ? state : { key, status: "loading" as const };
  const offers = current.data?.suggestions || [];
  const likely = offers.filter((s) => s.match === "likely");
  const possible = offers.filter((s) => s.match !== "likely");
  const lowest = likely.find((s) => s.availability !== "Out of stock");
  function offerRow(offer: StoreSuggestion, best = false) {
    return (
      <article className="store-offer" key={`${offer.retailer}:${offer.url}`}>
        <div className="store-offer-heading">
          <div>
            <strong>{offer.retailer}</strong>
            <small>{offer.title}</small>
          </div>
          <div className="store-offer-price">
            <strong>{money(offer.price, "AUD")}</strong>
            {best && <span className="badge teal">Lowest matching offer</span>}
          </div>
        </div>
        <p className="hint">
          {offer.availability || "Stock not confirmed"} · {offer.delivery} ·{" "}
          {offer.condition}
        </p>
        {offer.matchReason && <p className="hint">{offer.matchReason}</p>}
        <a
          className="secondary"
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View offer <ExternalLink size={15} />
        </a>
      </article>
    );
  }
  return (
    <>
      <GlassCard className="store-comparison">
        <div className="section-title">
          <div>
            <span className="eyebrow">SHOP AROUND</span>
            <h2>Compare store prices</h2>
          </div>
          <Search size={20} aria-hidden="true" />
        </div>
        <p className="hint">
          Add a product once. DayHub searches other Australian stores
          automatically.
        </p>
        {!canSearch && (
          <p role="status" className="info">
            Your product is saved on this device. Comparison starts once it has
            synced.
          </p>
        )}
        {canSearch && current.status === "loading" && (
          <div role="status" aria-label="Finding store prices">
            <p>Finding matching products and store prices…</p>
            <SkeletonCard />
          </div>
        )}
        {current.status === "setup" && (
          <div className="info" role="status">
            <strong>Automatic comparison isn’t connected yet</strong>
            <p>
              Your product is saved. Once the comparison service is connected,
              offers appear here automatically. You do not need to add store
              links.
            </p>
          </div>
        )}
        {current.message && (
          <p className="info" role="status">
            {current.message}
          </p>
        )}
        {current.data && (
          <>
            <p className="hint">
              {offers.length} offers found · Updated{" "}
              {new Date(current.data.searchedAt).toLocaleString()}. Refresh
              searches again after one minute.
            </p>
            <p className="hint">
              Delivery and checkout discounts may vary. Confirm the variant at
              the store.
            </p>
            {current.data.warning && (
              <p className="info">{current.data.warning}</p>
            )}
            {likely.length > 0 && (
              <>
                <h3>Same model · title matches</h3>
                <div className="store-offers">
                  {likely.map((s) => offerRow(s, s === lowest))}
                </div>
              </>
            )}
            {possible.length > 0 && (
              <details className="comparison-options">
                <summary>Unverified listings ({possible.length})</summary>
                <p className="hint">
                  These listings have incomplete product details. They are not
                  included in the price comparison. Check the model and variant
                  before buying.
                </p>
                <div className="store-offers">
                  {possible.map((s) => offerRow(s))}
                </div>
              </details>
            )}
            {!likely.length && (
              <p className="info">
                {possible.length
                  ? "Listings found, but the exact variant is not confirmed. Review unverified listings below."
                  : "No matching offers found. Refresh to search again, or check the product’s model and variant."}
              </p>
            )}
          </>
        )}
        {current.status !== "loading" && (
          <button
            className="secondary"
            disabled={!canSearch}
            onClick={() => setAttempt((n) => n + 1)}
          >
            <RefreshCw size={17} />
            {current.status === "setup"
              ? "Check connection"
              : "Refresh comparison"}
          </button>
        )}
      </GlassCard>
      <details className="comparison-options">
        <summary>Saved listings & optional manual controls</summary>
        <SavedStores product={product} edit={edit} />
      </details>
    </>
  );
}
