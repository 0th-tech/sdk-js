import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { identityHash } from "../src/identity.ts";

const fixture: {
  aud: string;
  sub: string;
  salt: string;
  identity_hash: string;
} = JSON.parse(
  readFileSync(
    new URL("../target/circuit/fixture.json", import.meta.url),
    "utf8",
  ),
);

test("identityHash gives the circuit's identity_hash", () => {
  const hash = identityHash(fixture.aud, fixture.sub, BigInt(fixture.salt));

  assert.equal(hash, BigInt(fixture.identity_hash));
});
