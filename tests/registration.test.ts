import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { NotVerifiedError, resolvePlayer } from "../lib/registration";

// A stand-in for Supercell's API: the token "good123" belongs to #2PQGRJ.
let server: Server;
before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const url = decodeURIComponent(req.url ?? "");
      if (url.endsWith("/verifytoken")) {
        const ok = JSON.parse(body).token === "good123";
        return res.end(JSON.stringify({ status: ok ? "ok" : "invalid" }));
      }
      if (url.startsWith("/v1/players/#2PQGRJ"))
        return res.end(
          JSON.stringify({
            tag: "#2PQGRJ",
            name: "Real One",
            townHallLevel: 17,
          }),
        );
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(4123, r));
  process.env.COC_API_TOKEN = "test";
  process.env.COC_API_BASE = "http://localhost:4123/v1";
});
after(() => server.close());

const input = (token?: string) => ({ tag: "#2PQGRJ", eventId: "e", token });

test("registering needs the owner's token when verification is on", async () => {
  await assert.rejects(resolvePlayer(input(), false), NotVerifiedError);
  await assert.rejects(resolvePlayer(input("wrong"), false), NotVerifiedError);
  const p = await resolvePlayer(input("good123"), false);
  assert.equal(p.name, "Real One");
  assert.equal(p.verified, true);
});

test("admins (or the check switched off) can add without a token", async () => {
  const p = await resolvePlayer(input(), true);
  assert.equal(p.verified, false);
  assert.equal(p.name, "Real One");
});
