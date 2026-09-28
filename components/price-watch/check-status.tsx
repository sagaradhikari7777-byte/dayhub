"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Entry } from "@/types";
import { useStore } from "@/lib/store";

export function ScheduleStatus() {
  const [scheduled, setScheduled] = useState<boolean | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/products/check-price", {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (r.ok) setScheduled(Boolean((await r.json()).scheduled));
      })
      .catch(() => {});
    return () => abort.abort();
  }, []);
  return (
    <p className="hint">
      {scheduled === true
        ? "Daily background checks are configured. Store coverage varies; check each product's last result."
        : scheduled === false
          ? "Background checks need to be enabled on the server. Use Check prices to update supported stores now."
          : "Check prices to refresh supported stores. Some retailers require manual updates."}
    </p>
  );
}

export function ProductCheckStatus({ entry }: { entry: Entry }) {
  const { refresh, pending } = useStore();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const active = entry.status !== "Stopped" && entry.status !== "Purchased";
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      if (!navigator.onLine)
        throw new Error("Connect to the internet to check this store.");
      const res = await fetch("/api/products/check-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: entry.id }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "This check could not be completed.");
      const result = data.results?.find(
        (r: { id: string }) => r.id === entry.id,
      );
      setMessage(
        result?.status === "checked"
          ? "Price and availability checked successfully."
          : result?.message ||
              "This product was not checked. Sync your changes and try again.",
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error &&
          error.name !== "TimeoutError" &&
          error.name !== "TypeError"
          ? error.message
          : "The connection timed out. Your saved price is unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="product-check-status">
      <div className="button-row">
        <span
          className={`badge ${entry.checkStatus === "failed" ? "subtle" : entry.lastChecked ? "teal" : "subtle"}`}
        >
          {entry.checkStatus === "failed"
            ? "Check needs attention"
            : entry.lastChecked
              ? "Automatically checked"
              : "Manual price · not verified"}
        </span>
        {entry.url && active && (
          <button
            className="secondary"
            onClick={check}
            disabled={busy || pending > 0}
          >
            <RefreshCw size={17} className={busy ? "spin" : ""} />
            {busy ? "Checking…" : "Check now"}
          </button>
        )}
      </div>
      <p className="hint">
        Last successful check:{" "}
        {entry.lastChecked
          ? new Date(entry.lastChecked).toLocaleString()
          : "Not yet"}
        {entry.priceSource ? ` · ${entry.priceSource}` : ""}
      </p>
      {entry.checkStatus === "failed" && (
        <p className="info">
          {entry.checkError || "This store could not be checked."} Your saved
          price has been kept.
        </p>
      )}
      {entry.checkStatus === "failed" && entry.lastCheckAttempt && (
        <p className="hint">
          Last attempt: {new Date(entry.lastCheckAttempt).toLocaleString()}
        </p>
      )}
      {pending > 0 && (
        <p className="hint">
          Waiting for your changes to sync before checking prices.
        </p>
      )}
      {message && (
        <p className="info" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
