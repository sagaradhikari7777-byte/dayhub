import { safeFetch } from "./fetch";
import { parseProduct } from "./retailers/generic";
import { allEntries, mutate, owners } from "@/lib/db";
import { uid } from "@/lib/model";
// Retailer-specific adapters can replace the standards-based JSON-LD parser without changing callers.
const retailers = [
  { hosts: ["amazon.com.au"], name: "Amazon" },
  { hosts: ["theiconic.com.au"], name: "The Iconic" },
  { hosts: ["jbhifi.com.au"], name: "JB Hi-Fi" },
  { hosts: ["officeworks.com.au"], name: "Officeworks" },
];
export async function lookupProduct(url: string) {
  const html = await safeFetch(url);
  const result = parseProduct(html, url);
  if (!result)
    throw new Error(
      "This store does not expose a readable product price. Please enter it manually.",
    );
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const retailer = retailers.find((r) => r.hosts.includes(hostname));
  return { ...result, retailer: retailer?.name || result.retailer };
}
export async function checkTrackedProducts(ownerId?: string) {
  const ids = ownerId ? [ownerId] : await owners();
  let checked = 0,
    failed = 0;
  const deadline = Date.now() + 45000;
  for (const owner of ids) {
    const data = await allEntries(owner);
    const settings = data.find((e) => e.kind === "settings")?.profile;
    for (const e of data.filter(
      (e) =>
        e.kind === "products" &&
        e.url &&
        e.status !== "Stopped" &&
        e.status !== "Purchased",
    )) {
      if (
        e.lastChecked &&
        Date.now() - new Date(e.lastChecked).getTime() < 12 * 3600_000
      )
        continue;
      try {
        const p = await lookupProduct(e.url!);
        if (p.currency !== (settings?.currency || "AUD"))
          throw new Error("Currency mismatch");
        await mutate(owner, {
          opId: uid(),
          action: "upsert",
          entry: {
            ...e,
            price: p.price,
            availability: p.availability,
            lastChecked: new Date().toISOString(),
          },
          expectedVersion: e.version,
        });
        checked++;
      } catch {
        failed++;
      }
      if (checked + failed >= 30 || Date.now() > deadline)
        return { checked, failed, limited: true };
    }
  }
  return { checked, failed, limited: false };
}
