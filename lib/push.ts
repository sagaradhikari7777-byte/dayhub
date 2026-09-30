import webpush from "web-push";
import { createHash } from "node:crypto";
import { allEntries } from "./db";
import { getPushConfig } from "./push-config";
import {
  putSubscription,
  deleteSubscription,
  subscriptions,
  pushReceipts,
  recordPush,
} from "./db/push-repository";
export type Subscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
export async function saveSubscription(
  owner: string,
  subscription: Subscription,
) {
  const id = createHash("sha256").update(subscription.endpoint).digest("hex");
  await putSubscription(owner, {
    id,
    data: JSON.stringify(subscription),
    created_at: new Date().toISOString(),
  });
}
export async function removeSubscription(owner: string, endpoint: string) {
  await deleteSubscription(
    owner,
    createHash("sha256").update(endpoint).digest("hex"),
  );
}
export async function dispatchPush(owner: string) {
  const config = await getPushConfig();
  if (!config) return;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const data = await allEntries(owner),
    settings = data.find((e) => e.kind === "settings")?.profile;
  const subs = await subscriptions(owner);
  for (const sub of subs) {
    const seen = new Set(await pushReceipts(owner, sub.id));
    const pending = data.filter(
      (e) =>
        e.kind === "notifications" &&
        !e.read &&
        !seen.has(e.id) &&
        e.created_at >= String(sub.created_at) &&
        Date.now() - Date.parse(e.created_at) < 86400000 &&
        (!e.linkKind || settings?.notifications[e.linkKind] !== false),
    );
    for (const n of pending.slice(0, 10)) {
      try {
        await webpush.sendNotification(
          JSON.parse(String(sub.data)),
          JSON.stringify({
            id: n.id,
            title: n.title,
            body: n.body || "Open DayHub for details.",
            url: n.linkId ? `/#detail%2F${n.linkId}` : "/#activity",
          }),
          { TTL: 3600, timeout: 6000 },
        );
        await recordPush(owner, sub.id, n.id);
      } catch (e) {
        if ([404, 410].includes((e as { statusCode: number }).statusCode))
          await deleteSubscription(owner, sub.id);
        break;
      }
    }
  }
}
export async function sendTestPush(owner: string) {
  const config = await getPushConfig();
  if (!config) throw new Error("Notifications are not configured.");
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const subs = await subscriptions(owner);
  let sent = 0;
  for (const sub of subs.slice(0, 3)) {
    try {
      await webpush.sendNotification(
        JSON.parse(String(sub.data)),
        JSON.stringify({
          id: `test-${Date.now()}`,
          title: "DayHub notifications are ready",
          body: "Verified price-drop alerts can reach you while DayHub is closed.",
          url: "/#prices",
        }),
        { TTL: 300, timeout: 6000 },
      );
      sent++;
    } catch (e) {
      if ([404, 410].includes((e as { statusCode: number }).statusCode))
        await deleteSubscription(owner, sub.id);
    }
  }
  return sent;
}
