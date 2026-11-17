import { readFileSync } from "node:fs";

// The login the circuit's release proves: a letter signed by a test key, the session it names, and
// the values its proof makes public
export type Fixture = {
  jwt: string;
  jwk: { kty: string; n: string; e: string };
  aud: string;
  sub: string;
  session_privkey: string;
  session_pubkey: string;
  expiry: string;
  secret: string;
  salt: string;
  pubkey_modulus_limbs: string[];
  identity_hash: string;
};

export const fixture: Fixture = JSON.parse(
  readFileSync(
    new URL("../target/circuit/fixture.json", import.meta.url),
    "utf8",
  ),
);
