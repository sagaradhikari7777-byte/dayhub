import { safeFetchDocument } from "./fetch";
import { parseProduct } from "./retailers/generic";
import { allEntries, mutate, owners } from "@/lib/db";
import { uid } from "@/lib/model";
import { ProductLookupError } from "./errors";
import { parseAmazon, amazonShareRedirect } from "./retailers/amazon";
// Retailer-specific adapters can replace the standards-based JSON-LD parser without changing callers.
const retailers = [
  { hosts: ["amazon.com.au"], name: "Amazon" },
  { hosts: ["theiconic.com.au"], name: "The Iconic" },
  { hosts: ["jbhifi.com.au"], name: "JB Hi-Fi" },
  { hosts: ["officeworks.com.au"], name: "Officeworks" },
];
export async function lookupProduct(url: string) {
  url = url.trim();
  if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(url)) url = `https://${url}`;
  let html: string;
  try {
    let document = await safeFetchDocument(url);
    const shareTarget = amazonShareRedirect(document.html, document.url);
    if (shareTarget) document = await safeFetchDocument(shareTarget);
    html = document.html;
    url = document.url;
  } catch (error) {
    if (error instanceof ProductLookupError) throw error;
    throw new ProductLookupError(
      "store_connection_failed",
      "DayHub could not connect to this store. Check the product link or enter the price manually.",
    );
  }
  const result = parseAmazon(html, url) || parseProduct(html, url);
  if (!result)
    throw new ProductLookupError(
      "price_not_readable",
      "This store does not expose a readable product price. Please enter it manually.",
    );
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const retailer = retailers.find((r) => r.hosts.includes(hostname));
  return {
    ...result,
    retailer: retailer?.name || result.retailer,
    url,
    checkedAt: new Date().toISOString(),
  };
}
export async function checkTrackedProducts(
  ownerId?: string,
  options: { productId?: string; groupId?: string; manual?: boolean } = {},
) {
  const ids = ownerId ? [ownerId] : await owners();
  let checked = 0,
    failed = 0,
    skipped = 0;
  const results: {
    id: string;
    title: string;
    status: "checked" | "failed" | "skipped";
    message?: string;
  }[] = [];
  const summary = (limited: boolean) => ({
    checked,
    failed,
    skipped,
    limited,
    results,
    scheduled: Boolean(process.env.CRON_SECRET),
  });
  const deadline = Date.now() + 45000;
  for (const owner of ids) {
    const data = await allEntries(owner);
    const settings = data.find((e) => e.kind === "settings")?.profile;
    for (const e of data.filter(
      (e) =>
        e.kind === "products" &&
        (!options.productId || e.id === options.productId) &&
        (!options.groupId ||
          (e.comparisonGroupId || e.id) === options.groupId) &&
        e.url &&
        e.status !== "Stopped" &&
        e.status !== "Purchased",
    )) {
      if (
        (e.lastCheckAttempt || e.lastChecked) &&
        Date.now() - new Date(e.lastCheckAttempt || e.lastChecked!).getTime() <
          (options.manual ? 60_000 : 12 * 3600_000)
      ) {
        skipped++;
        results.push({
          id: e.id,
          title: e.title,
          status: "skipped",
          message: options.manual
            ? "Checked recently. Wait a minute before checking again."
            : "Not due for another check yet.",
        });
        continue;
      }
      if (checked + failed >= 20 || Date.now() > deadline) return summary(true);
      const attemptedAt = new Date().toISOString();
      try {
        const p = await lookupProduct(e.url!);
        if (p.currency !== (settings?.currency || "AUD"))
          throw new ProductLookupError(
            "currency_mismatch",
            `This store returned ${p.currency}, but your dashboard uses ${settings?.currency || "AUD"}. Your saved price was kept.`,
          );
        await mutate(owner, {
          opId: uid(),
          action: "upsert",
          entry: {
            ...e,
            price: p.price,
            availability: p.availability,
            lastChecked: new Date().toISOString(),
            lastCheckAttempt: attemptedAt,
            checkStatus: "success",
            checkError: "",
            checkCode: "",
            priceSource: p.source || "Store page",
            image: e.image || p.image,
          },
          expectedVersion: e.version,
        });
        checked++;
        results.push({ id: e.id, title: e.title, status: "checked" });
      } catch (error) {
        failed++;
        const message =
          error instanceof ProductLookupError
            ? error.message
            : "The check could not be saved. Your existing price was kept.";
        const code =
          error instanceof ProductLookupError ? error.code : "check_failed";
        results.push({ id: e.id, title: e.title, status: "failed", message });
        // Store a failed attempt without changing the last successful price,
        // lastChecked timestamp, history, or any alert threshold.
        try {
          await mutate(owner, {
            opId: uid(),
            action: "upsert",
            entry: {
              ...e,
              lastCheckAttempt: attemptedAt,
              checkStatus: "failed",
              checkError: message,
              checkCode: code,
            },
            expectedVersion: e.version,
          });
        } catch {
          /* A concurrent edit wins; never overwrite it to record an error. */
        }
      }
    }
  }
  return summary(false);
}
