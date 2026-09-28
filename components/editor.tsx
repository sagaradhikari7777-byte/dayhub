"use client";
import { FormEvent, useState } from "react";
import { Entry, Kind, labels } from "@/types";
import { createEntry, day } from "@/lib/model";
import { useStore } from "@/lib/store";
import { entrySchema } from "@/lib/validation";
import { Sheet } from "./ui";
import { Link, LoaderCircle, Plus } from "lucide-react";
const categories: Partial<Record<Kind, string[]>> = {
  tasks: ["Personal", "Work", "Health", "Shopping", "Other"],
  events: ["Work", "Personal", "Appointment", "Birthday", "Travel", "Other"],
  bills: [
    "Rent",
    "Electricity",
    "Gas",
    "Internet",
    "Phone",
    "Insurance",
    "Subscription",
    "Loan",
    "Credit card",
    "Other",
  ],
  expenses: [
    "Food",
    "Groceries",
    "Shopping",
    "Transport",
    "Bills",
    "Entertainment",
    "Travel",
    "Health",
    "Other",
  ],
  products: ["Tech", "Clothing", "Perfume", "Home", "Gifts", "Travel", "Other"],
};
const singular: Partial<Record<Kind, string>> = {
  tasks: "task",
  events: "event",
  bills: "bill",
  expenses: "expense",
  notes: "note",
  products: "product",
  deliveries: "delivery",
  wishlists: "wishlist",
};
export function Editor({
  kind,
  entry,
  onClose,
  onSaved,
}: {
  kind: Kind;
  entry?: Entry;
  onClose: () => void;
  onSaved?: (entry: Entry) => void;
}) {
  const { save, entries, settings } = useStore();
  const [form, setForm] = useState<Entry>(
    () =>
      entry ||
      createEntry(kind, {
        category: categories[kind]?.[0],
        recurrence: ["tasks", "events", "bills"].includes(kind)
          ? "none"
          : undefined,
        colour: kind === "events" ? "blue" : undefined,
        date: ["tasks", "events", "bills", "expenses", "deliveries"].includes(
          kind,
        )
          ? day()
          : undefined,
        ...(kind === "tasks" ? { priority: "Normal", recurrence: "none" } : {}),
        ...(kind === "products"
          ? {
              availability: "In stock",
              status: "Watching",
              alert: "Any price drop",
            }
          : {}),
        ...(kind === "deliveries" ? { status: "Ordered" } : {}),
      }),
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [looking, setLooking] = useState(false);
  const put = (key: string, value: unknown) =>
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(kind === "products" && ["price", "url"].includes(key)
        ? {
            lastChecked: undefined,
            lastCheckAttempt: undefined,
            checkStatus: undefined,
            checkError: undefined,
            checkCode: undefined,
            priceSource: "Manual entry",
          }
        : {}),
    }));
  const input = (
    key: keyof Entry,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label key={key}>
      {label}
      <input
        name={key}
        aria-label={label}
        type={type}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "0.01" : undefined}
        maxLength={type === "text" ? 240 : undefined}
        value={String(form[key] ?? "")}
        onChange={(e) =>
          put(
            key,
            type === "number"
              ? e.target.value === ""
                ? undefined
                : Number(e.target.value)
              : e.target.value || undefined,
          )
        }
      />
    </label>
  );
  const select = (key: keyof Entry, label: string, options: string[]) => (
    <label key={key}>
      {label}
      <select
        name={key}
        aria-label={label}
        value={String(form[key] ?? options[0])}
        onChange={(e) => put(key, e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "none" ? "Does not repeat" : o}
          </option>
        ))}
      </select>
    </label>
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    const submitted = new FormData(e.currentTarget as HTMLFormElement);
    setBusy(true);
    setError("");
    try {
      const cleaned = { ...form };
      for (const [key, value] of submitted.entries()) {
        if (typeof value === "string")
          (cleaned as Record<string, unknown>)[key] =
            value === ""
              ? undefined
              : [
                    "amount",
                    "price",
                    "originalPrice",
                    "targetPrice",
                    "customDays",
                  ].includes(key)
                ? Number(value)
                : value;
      }
      for (const [k, v] of Object.entries(cleaned))
        if (v === "") delete (cleaned as Record<string, unknown>)[k];
      const result = entrySchema.safeParse(cleaned);
      if (!result.success) {
        setError(result.error.issues[0]?.message || "Please check the form.");
        return;
      }
      await save(result.data);
      onClose();
      onSaved?.(result.data);
    } catch (e) {
      setError(
        "This could not be saved on your device. Please check available storage and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function lookup() {
    setLooking(true);
    setError("");
    try {
      const r = await fetch("/api/products/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.url }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error);
      if (p.currency !== settings.currency)
        throw new Error(
          `Store price is in ${p.currency}. Enter the equivalent ${settings.currency} price manually.`,
        );
      setForm((f) => ({
        ...f,
        title: p.name,
        retailer: p.retailer,
        price: p.price,
        image: p.image,
        availability: p.availability,
        url: p.url || f.url,
        lastChecked: p.checkedAt || new Date().toISOString(),
        lastCheckAttempt: p.checkedAt || new Date().toISOString(),
        checkStatus: "success",
        checkError: "",
        checkCode: "",
        priceSource: p.source || "Store page",
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLooking(false);
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${entry ? "Edit" : "Add"} ${singular[kind] || labels[kind]}`}
    >
      <form onSubmit={submit} className="editor">
        {kind === "products" && (
          <>
            <label>
              Product URL
              <div className="input-action">
                <input
                  aria-label="Product URL"
                  type="url"
                  placeholder="https://store.com/product"
                  value={form.url || ""}
                  onChange={(e) => put("url", e.target.value)}
                />
                <button
                  className="secondary"
                  type="button"
                  disabled={!form.url || looking}
                  onClick={lookup}
                >
                  {looking ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Link size={18} />
                  )}{" "}
                  Look up
                </button>
              </div>
            </label>
            <p className="hint">
              Some stores restrict checks. Manual prices always work.
            </p>
          </>
        )}
        {input(
          "title",
          kind === "products"
            ? "Product name"
            : kind === "expenses"
              ? "Expense name"
              : "Title",
          "text",
          true,
        )}
        {kind === "tasks" && (
          <div className="form-grid">
            {select("priority", "Priority", ["Normal", "Low", "High"])}
            {input("date", "Due date", "date")}
            {input("time", "Due time", "time")}
          </div>
        )}
        {kind === "events" && (
          <>
            <div className="form-grid">
              {input("date", "Date", "date", true)}
              {input("time", "Start time", "time", true)}
              {input("endTime", "End time", "time", true)}
              {select("colour", "Colour", ["blue", "teal", "purple", "orange"])}
            </div>
            {input("location", "Location")}
          </>
        )}
        {kind === "bills" && (
          <>
            {input("company", "Company")}
            <div className="form-grid">
              {input("amount", `Amount (${settings.currency})`, "number", true)}
              {input("date", "Due date", "date", true)}
            </div>
          </>
        )}
        {kind === "expenses" && (
          <>
            <div className="form-grid">
              {input("amount", `Amount (${settings.currency})`, "number", true)}
              {input("date", "Date", "date", true)}
              {input("time", "Time", "time")}
            </div>
            {input("merchant", "Merchant")}
          </>
        )}
        {kind === "notes" && (
          <>
            <label>
              Note
              <textarea
                aria-label="Note"
                rows={6}
                value={form.body || ""}
                onChange={(e) => put("body", e.target.value)}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.pinned || false}
                onChange={(e) => put("pinned", e.target.checked)}
              />
              Pin to Home
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.archived || false}
                onChange={(e) => put("archived", e.target.checked)}
              />
              Archive
            </label>
          </>
        )}
        {kind === "deliveries" && (
          <>
            {input("retailer", "Retailer")}
            <div className="form-grid">
              {input("courier", "Courier")}
              {input("trackingNumber", "Tracking number")}
              {input("date", "Expected delivery", "date")}
              {select("status", "Delivery status", [
                "Ordered",
                "Processing",
                "Shipped",
                "In transit",
                "Out for delivery",
                "Delivered",
              ])}
            </div>
            {input("url", "Tracking URL", "url")}
          </>
        )}
        {kind === "products" && (
          <>
            {input("retailer", "Retailer", "text", true)}
            <div className="form-grid">
              {input(
                "price",
                `Current price (${settings.currency})`,
                "number",
                true,
              )}
              {input("targetPrice", "Target price", "number")}
              {input("originalPrice", "Original / RRP", "number")}
              {select("availability", "Availability", [
                "In stock",
                "Out of stock",
                "Unknown",
              ])}
            </div>
            {input("image", "Image URL", "url")}
            {select("alert", "Notify me when", [
              "Any price drop",
              "10% price drop",
              "20% price drop",
              "New lowest price",
              "Back in stock",
              "Target only",
            ])}
            <label>
              Wishlist
              <select
                value={form.wishlistId || ""}
                onChange={(e) => put("wishlistId", e.target.value || undefined)}
              >
                <option value="">No wishlist</option>
                {entries
                  .filter((e) => e.kind === "wishlists")
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {categories[kind] &&
          select("category", "Category", [
            ...categories[kind]!,
            ...settings.categories,
          ])}
        {["tasks", "events", "bills"].includes(kind) && (
          <>
            {select("recurrence", "Repeat", [
              "none",
              ...(kind !== "bills" ? ["daily"] : []),
              "weekly",
              "fortnightly",
              "monthly",
              "quarterly",
              "yearly",
              "custom",
            ])}
            {form.recurrence === "custom" &&
              input("customDays", "Repeat every (days)", "number", true)}
          </>
        )}
        {kind === "tasks" && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.reminder || false}
              onChange={(e) => put("reminder", e.target.checked)}
            />
            Show due reminder
          </label>
        )}
        {kind !== "notes" && kind !== "wishlists" && (
          <label>
            Notes
            <textarea
              aria-label="Notes"
              rows={3}
              value={form.notes || ""}
              onChange={(e) => put("notes", e.target.value)}
            />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy} type="submit">
          {busy
            ? "Saving…"
            : entry
              ? "Save changes"
              : `Add ${singular[kind] || "item"}`}
        </button>
      </form>
    </Sheet>
  );
}
export function QuickAdd({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (k: Kind) => void;
}) {
  return (
    <Sheet
      open
      onClose={onClose}
      title="Make a little space in your mind"
      description="Save it here. Get on with your day."
    >
      <div className="quick-grid">
        {(
          [
            "tasks",
            "expenses",
            "bills",
            "events",
            "notes",
            "products",
            "deliveries",
          ] as Kind[]
        ).map((k, i) => (
          <button key={k} onClick={() => onSelect(k)}>
            <span className={`quick-icon tone-${i}`}>
              <Plus size={22} />
            </span>
            {k === "products" ? "Track product" : `Add ${singular[k]}`}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
