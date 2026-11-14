import { UltraHonkBackend } from "@aztec/bb.js";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import { getZKHonkCallData, init as initGaraga } from "garaga";
import { generateInputs } from "noir-jwt";

// Same bound as MAX_DATA_LENGTH in the login circuit. A Google letter is about 658 bytes
const MAX_DATA_LENGTH = 768;

// Index of identity_hash among the circuit's public inputs
const IDENTITY_INPUT = 20;

export type ProofStep = "witness" | "proof" | "calldata";

// The compiled circuit and the verification key the on-chain verifier was generated from
export type Circuit = {
  program: CompiledCircuit;
  verificationKey: Uint8Array;
};

// Circuit inputs that are not derived from the letter
type SessionInputs = {
  publicKey: bigint;
  expiry: bigint;
  secret: bigint;
  salt: bigint;
};

// Garaga's calldata is span_len, count, (low, high) * count, so each input spans two felts
function publicInput(calldata: bigint[], i: number) {
  const count = calldata[1] ?? 0n;
  if (i >= count)
    throw new Error(`the proof has ${count} public inputs, not ${i + 1}`);
  return (calldata[3 + 2 * i]! << 128n) | calldata[2 + 2 * i]!;
}

// bb.js gives each public input as "0x" followed by 32 bytes of hex
const publicInputBytes = (inputs: string[]) =>
  Uint8Array.fromHex(inputs.map((input) => input.slice(2)).join(""));

export async function proveLogin(
  circuit: Circuit,
  letter: { jwt: string; providerKey: JsonWebKey },
  inputs: SessionInputs,
  onStep?: (step: ProofStep, ms: number) => void,
) {
  let since = performance.now();
  const lap = (step: ProofStep) => {
    onStep?.(step, performance.now() - since);
    since = performance.now();
  };

  // Garaga's WASM loads while the proof is made
  const garaga = initGaraga();

  const letterInputs = await generateInputs({
    jwt: letter.jwt,
    pubkey: letter.providerKey,
    maxSignedDataLength: MAX_DATA_LENGTH,
  });
  const { witness } = await new Noir(circuit.program).execute({
    ...letterInputs,
    session_pubkey: String(inputs.publicKey),
    expiry: String(inputs.expiry),
    secret: String(inputs.secret),
    salt: String(inputs.salt),
  });
  lap("witness");

  const backend = new UltraHonkBackend(circuit.program.bytecode, {
    // bb.js proves on several threads only in a cross-origin isolated page
    threads: crossOriginIsolated ? navigator.hardwareConcurrency : 1,
  });
  // keccakZK is the proof system the deployed verifier was generated for. The worker pool is
  // destroyed right after the proof, so its memory is free during the calldata step
  const proof = await backend
    .generateProof(witness, { keccakZK: true })
    .finally(() => backend.destroy());
  lap("proof");

  await garaga;
  const calldata = getZKHonkCallData(
    proof.proof,
    publicInputBytes(proof.publicInputs),
    circuit.verificationKey,
  );
  lap("calldata");

  return { calldata, identity: publicInput(calldata, IDENTITY_INPUT) };
}
