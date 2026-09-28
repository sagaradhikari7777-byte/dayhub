import { databaseQuery, initialize } from "./index";
import { redisRepository, usesRedis } from "./redis";
import type { PushRecord } from "./redis-state";

export async function putSubscription(owner: string, record: PushRecord) {
  if (usesRedis())
    return redisRepository.update(owner, (state) => ({
      ...state,
      subscriptions: state.subscriptions
        .filter((s) => s.id !== record.id)
        .concat(record),
    }));
  await initialize();
  await databaseQuery(
    "INSERT INTO push_subscriptions(id,owner_id,data,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,owner_id=excluded.owner_id",
    [record.id, owner, record.data, record.created_at],
  );
}
export async function deleteSubscription(owner: string, id: string) {
  if (usesRedis())
    return redisRepository.update(owner, (state) => {
      const receipts = { ...state.receipts };
      delete receipts[id];
      return {
        ...state,
        receipts,
        subscriptions: state.subscriptions.filter((s) => s.id !== id),
      };
    });
  await initialize();
  await databaseQuery(
    "DELETE FROM push_subscriptions WHERE owner_id=? AND id=?",
    [owner, id],
  );
}
export async function subscriptions(owner: string): Promise<PushRecord[]> {
  if (usesRedis()) return (await redisRepository.read(owner)).subscriptions;
  await initialize();
  return (await databaseQuery(
    "SELECT * FROM push_subscriptions WHERE owner_id=?",
    [owner],
  )) as PushRecord[];
}
export async function pushReceipts(
  owner: string,
  id: string,
): Promise<string[]> {
  if (usesRedis())
    return (await redisRepository.read(owner)).receipts[id] || [];
  await initialize();
  return (
    await databaseQuery(
      "SELECT notification_id FROM push_receipts WHERE subscription_id=?",
      [id],
    )
  ).map((r) => String(r.notification_id));
}
export async function recordPush(
  owner: string,
  id: string,
  notification: string,
) {
  if (usesRedis())
    return redisRepository.update(owner, (state) => ({
      ...state,
      receipts: {
        ...state.receipts,
        [id]: Array.from(
          new Set([...(state.receipts[id] || []), notification]),
        ),
      },
    }));
  await initialize();
  await databaseQuery(
    "INSERT INTO push_receipts(subscription_id,notification_id) VALUES(?,?) ON CONFLICT DO NOTHING",
    [id, notification],
  );
}
