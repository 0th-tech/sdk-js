import assert from "node:assert/strict";
import { test } from "node:test";
import { accountAddress } from "../src/account.ts";

test("accountAddress gives the address the relayer deploys to", () => {
  const address = accountAddress(
    { registry: "0x1", verifier: "0x2", accountClassHash: "0x3" },
    5n,
  );

  // A change of this value moves every account to another address
  assert.equal(
    BigInt(address),
    0x04d5411beda5b726c154579638df1d3d42e96eff2cf2dd09d0a94b4565450a57n,
  );
});
