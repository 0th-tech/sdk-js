import {
  Account,
  type RpcProvider,
  Signer,
  cairo,
  hash,
  stark,
} from "starknet";
import { type OnStep, registerSession } from "./register.ts";

// What an account's address is computed from, with the identity
export type Deployment = {
  registry: string;
  verifier: string;
  accountClassHash: string;
};

// Salt 0 and no deployer, so the address is the same whoever deploys the account
export function accountAddress(deployment: Deployment, identity: bigint) {
  return hash.calculateContractAddressFromHash(
    0,
    deployment.accountClassHash,
    [deployment.registry, deployment.verifier, cairo.uint256(identity)],
    0,
  );
}

// The session key leads the signature, since an account holds several
class SessionSigner extends Signer {
  async signRaw(msgHash: string) {
    return [
      await this.getPubKey(),
      ...stark.signatureToHexArray(await super.signRaw(msgHash)),
    ];
  }
}

// The account exists on chain and knows the session key only once a transaction needs it
class SessionAccount extends Account {
  #register: () => Promise<void>;

  constructor(
    options: ConstructorParameters<typeof Account>[0],
    register: () => Promise<void>,
  ) {
    super(options);
    this.#register = register;
  }

  override async execute(...args: Parameters<Account["execute"]>) {
    await this.#register();
    return super.execute(...args);
  }
}

export const sessionAccount = (
  provider: RpcProvider,
  { address, privateKey }: { address: string; privateKey: string },
  { serverUrl, onStep }: { serverUrl: string; onStep?: OnStep },
) =>
  new SessionAccount(
    { provider, address, signer: new SessionSigner(privateKey) },
    () => registerSession(provider, address, serverUrl, onStep),
  );
