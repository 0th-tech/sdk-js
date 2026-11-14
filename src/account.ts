import {
  Account,
  type RpcProvider,
  Signer,
  cairo,
  hash,
  stark,
} from "starknet";

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

export const sessionAccount = (
  provider: RpcProvider,
  { address, privateKey }: { address: string; privateKey: string },
) => new Account({ provider, address, signer: new SessionSigner(privateKey) });
