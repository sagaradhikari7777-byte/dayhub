"use client";
import { useState } from "react";
import type { Entry } from "@/types";
import { createEntry } from "@/lib/model";
import { entrySchema } from "@/lib/validation";
import { useStore } from "@/lib/store";
import {
  comparisonGroup,
  listingUrlKey,
} from "@/lib/price-tracking/comparison";
import { Sheet } from "../ui";

export function AddStore({
  product,
  onClose,
}: {
  product: Entry;
  onClose: () => void;
}) {
  const { entries, save, settings } = useStore();
  const [url, setUrl] = useState(""),
    [retailer, setRetailer] = useState(""),
    [price, setPrice] = useState(""),
    [stock, setStock] = useState("Unknown"),
    [title, setTitle] = useState(product.title),
    [image, setImage] = useState("");
  const [verified, setVerified] = useState<{
      at: string;
      source: string;
    } | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [existing, setExisting] = useState("");
  const others = entries.filter(
    (e) =>
      e.kind === "products" && comparisonGroup(e) !== comparisonGroup(product),
  );
  async function lookup() {
    setBusy(true);
    setError("");
    setVerified(null);
    try {
      const response = await fetch("/api/products/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.preview) {
          setUrl(data.preview.url);
          setRetailer(data.preview.retailer);
          setTitle(data.preview.name);
          setImage(data.preview.image);
        }
        throw new Error(data.error);
      }
      if (data.currency !== settings.currency)
        throw new Error(
          `This listing is in ${data.currency}; your comparison uses ${settings.currency}.`,
        );
      setUrl(data.url || url);
      setRetailer(data.retailer);
      setPrice(String(data.price));
      setStock(data.availability);
      setTitle(data.name);
      setImage(data.image);
      setVerified({
        at: data.checkedAt || new Date().toISOString(),
        source: data.source || "Store page",
      });
    } catch (e) {
      setError(
        e instanceof Error && !["TimeoutError", "TypeError"].includes(e.name)
          ? e.message
          : "The store could not be reached. You can enter its current price below.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!confirmed)
        throw new Error(
          "Confirm this is the same model, size and colour before adding it.",
        );
      const group = comparisonGroup(product);
      let listing = existing
        ? entries.find((e) => e.id === existing && e.kind === "products")
        : undefined;
      if (!existing) {
        const duplicate = entries.some(
          (e) =>
            e.kind === "products" &&
            e.url &&
            listingUrlKey(e.url) === listingUrlKey(url),
        );
        if (duplicate)
          throw new Error(
            "This store link is already tracked. Select it from Existing tracked product instead.",
          );
        listing = createEntry("products", {
          title,
          retailer,
          url: url.trim(),
          price: price === "" ? undefined : Number(price),
          availability: stock,
          image,
          status: "Watching",
          targetPrice: product.targetPrice,
          alert: product.alert,
          category: product.category,
          wishlistId: product.wishlistId,
          comparisonGroupId: group,
          lastChecked: verified?.at,
          lastCheckAttempt: verified?.at,
          checkStatus: verified ? "success" : undefined,
          priceSource: verified?.source || "Manual entry",
        });
      }
      if (!listing) throw new Error("Choose a store listing.");
      const valid = entrySchema.safeParse({
        ...listing,
        comparisonGroupId: group,
      });
      if (!valid.success)
        throw new Error(
          valid.error.issues[0]?.message || "Check the listing details.",
        );
      if (!product.comparisonGroupId)
        await save({ ...product, comparisonGroupId: group });
      await save(valid.data);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The store could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a store price"
      description="Compare the same product across stores. Each listing keeps its own price history and alerts."
    >
      <form className="editor" onSubmit={submit}>
        {others.length > 0 && (
          <label>
            Existing tracked product
            <select
              value={existing}
              onChange={(e) => {
                setExisting(e.target.value);
                setConfirmed(false);
              }}
              disabled={busy}
            >
              <option value="">Add a new store link</option>
              {others.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.retailer || "Store"} · {e.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!existing && (
          <>
            <label>
              Store product URL
              <input
                aria-label="Store product URL"
                required
                type="url"
                value={url}
                disabled={busy}
                placeholder="https://…"
                onChange={(e) => {
                  setUrl(e.target.value);
                  setVerified(null);
                  setConfirmed(false);
                }}
              />
            </label>
            <button
              className="secondary"
              type="button"
              disabled={busy || !url}
              onClick={lookup}
            >
              {busy ? "Please wait…" : "Read store price"}
            </button>
            {verified?.source.includes("new seller starting price") && (
              <p className="hint">
                Amazon's lowest listed new-seller price. Confirm delivery,
                seller and availability at the store.
              </p>
            )}
            <label>
              Product name
              <input
                required
                value={title}
                disabled={busy}
                maxLength={240}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Retailer
              <input
                required
                value={retailer}
                disabled={busy}
                maxLength={160}
                onChange={(e) => setRetailer(e.target.value)}
              />
            </label>
            <label>
              Price ({settings.currency})
              <input
                required
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                value={price}
                disabled={busy}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setVerified(null);
                }}
              />
            </label>
            <label>
              Stock status
              <select
                value={stock}
                disabled={busy}
                onChange={(e) => {
                  setStock(e.target.value);
                  setVerified(null);
                }}
              >
                {["Unknown", "In stock", "Out of stock"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <p className="hint">
              {verified
                ? "Price read from this store."
                : "Manually entered prices are labelled clearly and can be checked later."}
            </p>
          </>
        )}
        <label className="comparison-confirm">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={busy}
          />
          Same model, size, colour and condition as {product.title}
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="primary full"
          disabled={busy || !confirmed}
        >
          Add to comparison
        </button>
      </form>
    </Sheet>
  );
}
