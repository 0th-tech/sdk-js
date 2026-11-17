import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resumeSession, storeSession } from "../src/session.ts";

const DEPLOYMENT = {
  registry: "0x1",
  verifier: "0x2",
  accountClassHash: "0x3",
};
const HOUR = 3600n;
const now = () => BigInt(Math.floor(Date.now() / 1000));

const stored = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => void stored.set(key, value),
  removeItem: (key) => void stored.delete(key),
} as Storage;

const store = (expiry: bigint) =>
  storeSession({ address: "0x4", privateKey: "0x5", expiry }, DEPLOYMENT, {
    publicKey: "6",
    identity: "7",
    proof: [],
  });

beforeEach(() => stored.clear());

test("resumeSession returns the session stored under the same deployment", () => {
  const expiry = now() + HOUR;
  store(expiry);

  assert.deepEqual(resumeSession(DEPLOYMENT), {
    address: "0x4",
    privateKey: "0x5",
    expiry,
  });
});

test("resumeSession removes a session stored under another deployment", () => {
  store(now() + HOUR);

  // The same session under another registry belongs to another address
  assert.equal(resumeSession({ ...DEPLOYMENT, registry: "0x8" }), undefined);
  assert.equal(stored.size, 0);
});

test("resumeSession removes an expired session", () => {
  store(now() - HOUR);

  assert.equal(resumeSession(DEPLOYMENT), undefined);
  assert.equal(stored.size, 0);
});
