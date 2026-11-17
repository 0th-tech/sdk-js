import assert from "node:assert/strict";
import { test } from "node:test";
import { identityHash } from "../src/identity.ts";
import { fixture } from "./fixture.ts";

test("identityHash gives the circuit's identity_hash", () => {
  const hash = identityHash(fixture.aud, fixture.sub, BigInt(fixture.salt));

  assert.equal(hash, BigInt(fixture.identity_hash));
});
