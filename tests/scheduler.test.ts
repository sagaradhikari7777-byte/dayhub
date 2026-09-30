import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  verifySchedulerToken,
  schedulerAudience,
  schedulerRepository,
} from "../lib/scheduler-auth";
import { storedPushConfig } from "../lib/push-config";
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const keys = [
  {
    ...publicKey.export({ format: "jwk" }),
    kid: "test",
    alg: "RS256",
    use: "sig",
  },
];
const now = Date.now(),
  sec = Math.floor(now / 1000);
const claims = {
  iss: "https://token.actions.githubusercontent.com",
  aud: schedulerAudience,
  repository: schedulerRepository,
  repository_owner_id: "329097412",
  ref: "refs/heads/main",
  workflow_ref: `${schedulerRepository}/.github/workflows/price-check.yml@refs/heads/main`,
  event_name: "schedule",
  iat: sec,
  nbf: sec - 5,
  exp: sec + 300,
};
function token(changes: Record<string, unknown> = {}) {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...claims, ...changes })).toString(
    "base64url",
  );
  return `${header}.${body}.${sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url")}`;
}
test("only signed DayHub main-branch scheduler identities are accepted", () => {
  assert.equal(verifySchedulerToken(token(), keys, now), true);
  for (const change of [
    { aud: "another-app" },
    { repository: "other/repo" },
    { repository_owner_id: "other" },
    { ref: "refs/heads/feature" },
    { workflow_ref: "another-workflow" },
    { event_name: "pull_request" },
    { exp: sec - 1 },
    { nbf: sec + 120 },
    { iat: sec - 1000 },
    { iss: "https://evil.example" },
  ])
    assert.equal(verifySchedulerToken(token(change), keys, now), false);
  assert.equal(
    verifySchedulerToken(token().replace(/.$/, "!"), keys, now),
    false,
  );
  assert.equal(verifySchedulerToken("unsigned", keys, now), false);
});
test("push keys survive cold starts and concurrent initialization", async () => {
  const data = new Map<string, string>();
  const command = async (args: (string | number)[]) => {
    const key = String(args[1]);
    if (args[0] === "GET") return data.get(key) ?? null;
    if (args[0] === "SET" && !data.has(key)) {
      data.set(key, String(args[2]));
      return "OK";
    }
    return null;
  };
  const [a, b] = await Promise.all([
    storedPushConfig(command),
    storedPushConfig(command),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(await storedPushConfig(command), a);
  assert.equal(Buffer.from(a.publicKey, "base64url").length, 65);
  assert.equal(Buffer.from(a.privateKey, "base64url").length, 32);
  assert.equal(data.size, 1);
  assert.match([...data.keys()][0], /^dayhub:v1:/);
});
