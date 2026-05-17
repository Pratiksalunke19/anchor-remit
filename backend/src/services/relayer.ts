/**
 * Relayer for wallet-free recipients.
 *
 * The KEEPER account (KEEPER_PRIVATE_KEY) acts as a meta-tx submitter:
 *
 *  - claim:     keeper calls `claimRemittance` -> MUSD lands in keeper ->
 *               keeper ERC20-transfers MUSD to the recipient's embedded wallet.
 *               (This is the wallet-free equivalent of an ERC-4337 paymaster
 *                sponsoring the userOp; no recipient signing, no recipient gas.)
 *
 *  - transfer / cashout from embedded wallet:
 *               server signs with the embedded wallet's encrypted privkey.
 *               Keeper pre-funds a tiny BTC drip (for gas) on first claim so
 *               outgoing txs don't require the user to ever hold native gas.
 *
 *  - PIN check: recompute keccak256(orderId || keccak256(pin)) and compare
 *               with the on-chain `claimCode`. Plaintext PIN is never stored.
 */
import { keccak256, toBytes, encodePacked, parseEther, getAddress, formatEther } from "viem";
import { publicClient, walletClient as keeperClient, keeperAccount, addresses } from "../config";
import { remittanceVaultAbi, erc20Abi } from "../abi";
import { walletProvider } from "./walletProvider";
import { recipientTxRepo, RecipientWalletRow } from "../db";

// extra ABI fragment — backend abi.ts didn't include `transfer`.
const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const GAS_DRIP_WEI = parseEther(process.env.RELAYER_GAS_DRIP_BTC || "0.00005"); // ~enough for a couple of txs on Mezo

export type ClaimResult = {
  walletAddress: `0x${string}`;
  claimTxHash: `0x${string}`;
  payoutTxHash: `0x${string}`;
  netMusd: string;
};

export async function readOrder(orderId: `0x${string}`) {
  return (await publicClient.readContract({
    address: addresses.remittanceVault,
    abi: remittanceVaultAbi,
    functionName: "getOrder",
    args: [orderId],
  })) as any;
}

export function pinMatchesOnChainCommitment(orderId: `0x${string}`, pin: string, claimCode: `0x${string}`): boolean {
  const claimCodeHash = keccak256(toBytes(pin));
  const derived = keccak256(encodePacked(["bytes32", "bytes32"], [orderId, claimCodeHash]));
  return derived.toLowerCase() === claimCode.toLowerCase();
}

export async function relayClaim(orderId: `0x${string}`, pin: string, phone?: string | null): Promise<ClaimResult> {
  if (!keeperClient || !keeperAccount) {
    throw new Error("relayer-not-configured: set KEEPER_PRIVATE_KEY in backend/.env");
  }

  const order = await readOrder(orderId);
  const status = Number(order.status);
  if (status !== 0) throw new Error("order-not-pending");
  if (Math.floor(Date.now() / 1000) > Number(order.expiryTimestamp)) throw new Error("order-expired");

  // For wallet-free flow we require either an open recipient or one bound to our keeper.
  const lockedRecipient: string = order.recipient;
  const keeperAddr = keeperAccount.address.toLowerCase();
  const isOpen = lockedRecipient === "0x0000000000000000000000000000000000000000";
  const lockedToKeeper = lockedRecipient.toLowerCase() === keeperAddr;
  if (!isOpen && !lockedToKeeper) {
    throw new Error("locked-to-other-recipient: this order requires a self-custody wallet");
  }

  if (!pinMatchesOnChainCommitment(orderId, pin, order.claimCode)) {
    throw new Error("bad-pin");
  }

  const claimCodeHash = keccak256(toBytes(pin));

  // 1. keeper executes claim — MUSD (net of fee) lands in keeper account.
  const balBefore = await getMusdBalance(keeperAccount.address as `0x${string}`);
  const claimTxHash = await keeperClient.writeContract({
    address: addresses.remittanceVault,
    abi: remittanceVaultAbi,
    functionName: "claimRemittance",
    args: [orderId, claimCodeHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: claimTxHash });
  const balAfter = await getMusdBalance(keeperAccount.address as `0x${string}`);
  const netMusd = balAfter - balBefore;
  if (netMusd <= 0n) throw new Error("relayer-no-payout-received");

  // 2. mint embedded wallet (idempotent) and forward MUSD.
  const wallet = await walletProvider.getOrCreateForOrder(orderId, phone);
  const payoutTxHash = await keeperClient.writeContract({
    address: addresses.musd,
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [getAddress(wallet.address), netMusd],
  });
  await publicClient.waitForTransactionReceipt({ hash: payoutTxHash });

  // 3. tiny BTC drip for future gasless-feeling outbound txs.
  try {
    await keeperClient.sendTransaction({
      to: getAddress(wallet.address),
      value: GAS_DRIP_WEI,
    });
  } catch (e) {
    console.warn("[relayer] gas drip failed (non-fatal)", e);
  }

  recipientTxRepo.insert({
    wallet: wallet.address,
    kind: "claim",
    amount: netMusd.toString(),
    counterparty: order.sender,
    tx_hash: payoutTxHash,
    note: `order ${orderId.slice(0, 10)}…`,
  });

  return {
    walletAddress: getAddress(wallet.address),
    claimTxHash,
    payoutTxHash,
    netMusd: netMusd.toString(),
  };
}

export async function getMusdBalance(address: `0x${string}`): Promise<bigint> {
  return (await publicClient.readContract({
    address: addresses.musd,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  })) as bigint;
}

export async function relayTransferOut(
  wallet: RecipientWalletRow,
  to: `0x${string}`,
  amount: bigint
): Promise<`0x${string}`> {
  const client = walletProvider.walletClientFor(wallet);
  const account = client.account!;
  const txHash = await client.writeContract({
    chain: client.chain,
    account,
    address: addresses.musd,
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [to, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  recipientTxRepo.insert({
    wallet: wallet.address,
    kind: "transfer",
    amount: amount.toString(),
    counterparty: to,
    tx_hash: txHash,
    note: `${formatEther(amount)} MUSD sent`,
  });
  return txHash;
}
