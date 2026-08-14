// src/patterns/delegation.ts
// Delegation lifecycle helpers used by Patterns 8 (revocation), 9 (re-delegation)
// and 11 (EXTCODESIZE pitfall).
//
// Gasless: the EOA signs the 7702 authorization off-chain; a broadcaster sends
// the type-4 tx (empty calldata) and pays gas. EIP-7702 sets the delegation even
// when the accompanying empty call reverts, so no write calldata is needed.

import { type WalletClient, type PublicClient, type Hash, zeroAddress } from 'viem'

/** Delegate the EOA to `contractAddress` via a broadcaster-sent type-4 tx. */
export async function setDelegation(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient,
  contractAddress: `0x${string}`
): Promise<Hash> {
  const eoaAddress = signerWallet.account!.address
  const broadcasterAddress = broadcasterWallet.account!.address

  const authorization = await signerWallet.signAuthorization({
    contractAddress,
    executor: broadcasterAddress,
    account: signerWallet.account!,
  })

  const hash = await broadcasterWallet.sendTransaction({
    to: eoaAddress,
    data: '0x',
    gas: 50_000n,
    chain: broadcasterWallet.chain,
    account: broadcasterWallet.account!,
    authorizationList: [authorization],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

/** Revoke delegation by re-authorizing to address(0) via a broadcaster-sent tx. */
export async function revokeDelegation(
  signerWallet: WalletClient,
  broadcasterWallet: WalletClient,
  publicClient: PublicClient
): Promise<Hash> {
  return setDelegation(signerWallet, broadcasterWallet, publicClient, zeroAddress)
}
