/* @refresh reload */

import { Show, createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";
import { CallData, RpcProvider, cairo, type Call } from "starknet";
import {
  clearSession,
  finishLogin,
  pendingLogin,
  resumeSession,
  sessionAccount,
  startLogin,
  type CompiledCircuit,
  type LoginConfig,
  type StoredSession,
} from "sdk";

import program from "../../../target/circuit/login.json";
// Inlined as a data URL, so the key costs no request
import vkUrl from "../../../target/circuit/vk?inline";

// Vite inlines import.meta.env at build time, so an unset variable is undefined in the bundle
function need(name: string) {
  const value = import.meta.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const RPC_URL = need("VITE_RPC_URL");

const config: LoginConfig = {
  clientId: need("VITE_GOOGLE_CLIENT_ID"),
  // Must match the client id's registered URI, trailing slash included
  // Not location.pathname, so a deep link still sends this value
  redirectUri: `${location.origin}/`,
  deployment: {
    registry: need("VITE_REGISTRY"),
    verifier: need("VITE_VERIFIER"),
    accountClassHash: need("VITE_ACCOUNT_CLASS_HASH"),
  },
  serverUrl: need("VITE_SERVER_URL"),
  circuit: {
    program: program as CompiledCircuit,
    verificationKey: Uint8Array.fromBase64(vkUrl.split(",")[1]!),
  },
};

const TRANSFER = 1000n;
// Starknet's fee token, same address on every network
const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const transfer = (to: string, amount: bigint): Call => ({
  contractAddress: STRK,
  entrypoint: "transfer",
  calldata: CallData.compile([to, cairo.uint256(amount)]),
});

function App() {
  const [log, setLog] = createSignal("");
  const say = (line: string) => setLog((l) => l + line + "\n");
  const [session, setSession] = createSignal<StoredSession>();
  const provider = new RpcProvider({ nodeUrl: RPC_URL });

  function signIn() {
    setLog("");
    say(`redirect_uri: ${config.redirectUri}`);
    startLogin(config);
  }

  function signedIn(stored: StoredSession) {
    setSession(stored);
    say(`address: ${stored.address}`);
    say(
      `session until: ${new Date(Number(stored.expiry) * 1000).toISOString()}`,
    );
  }

  async function spend(stored: StoredSession) {
    try {
      const balance = await provider.callContract({
        contractAddress: STRK,
        entrypoint: "balance_of",
        calldata: [stored.address],
      });
      // The relayer pays for the login only, so a new account cannot pay for a transfer
      if (balance.every((half) => BigInt(half) === 0n)) {
        say(`the account holds no STRK: send some to ${stored.address}`);
        return;
      }

      const { transaction_hash } = await sessionAccount(
        provider,
        stored,
      ).execute([transfer(stored.address, TRANSFER)]);
      say(`transfer signed by the session key: ${transaction_hash}`);
    } catch (e) {
      say(`error: ${e}`);
      console.error(e);
    }
  }

  function signOut() {
    clearSession();
    setSession();
    setLog("");
    say("signed out");
  }

  // Runs at mount: the user is back from Google, or already has a session
  async function resume() {
    try {
      const kept = resumeSession(config.deployment);
      if (kept) {
        signedIn(kept);
        return;
      }

      const answer = pendingLogin();
      if (!answer) return;
      say("back from Google");
      say(
        `threads: ${crossOriginIsolated ? navigator.hardwareConcurrency : 1}`,
      );

      signedIn(
        await finishLogin(answer, config, (step, ms) =>
          say(`${step}: ${(ms / 1000).toFixed(1)}s`),
        ),
      );
    } catch (e) {
      say(`error: ${e}`);
      console.error(e);
    }
  }
  onMount(resume);

  return (
    <main>
      <h1>0th</h1>
      <button onClick={signIn}>Sign in with Google</button>
      <button onClick={signOut}>Sign out</button>
      <Show when={session()}>
        {(stored) => <button onClick={() => spend(stored())}>Transfer</button>}
      </Show>
      <pre>{log()}</pre>
    </main>
  );
}

render(() => <App />, document.getElementById("root")!);
