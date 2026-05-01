"use client";

import { createViemHandleClient } from "@iexec-nox/handle";
import { decodeEventLog } from "viem";
import type { PublicClient, WalletClient } from "viem";

export const VEIL_DEAL_ABI = [
  {
    name: "createDeal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountHandle",    type: "bytes32" },
      { name: "amountProof",     type: "bytes"   },
      { name: "thresholdHandle", type: "bytes32" },
      { name: "thresholdProof",  type: "bytes"   },
      { name: "counterparty",    type: "address" },
      { name: "currentPrice",    type: "uint256" },
      { name: "checkLt",         type: "bool"    },
    ],
    outputs: [{ name: "dealId", type: "uint256" }],
  },
  {
    name: "settleDeal",
    type: "function",
    stateMutability: "nonpayable",
    inputs:  [{ name: "dealId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getDeal",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "dealId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "creator",      type: "address" },
        { name: "counterparty", type: "address" },
        { name: "lockedAmount", type: "bytes32" },
        { name: "resultHandle", type: "bytes32" },
        { name: "settled",      type: "bool"    },
        { name: "price",        type: "uint256" },
        { name: "checkLt",      type: "bool"    },
        { name: "createdAt",    type: "uint256" },
      ],
    }],
  },
  {
    name: "dealCount",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "DealCreated",
    type: "event",
    inputs: [
      { name: "dealId",       type: "uint256", indexed: true  },
      { name: "creator",      type: "address", indexed: true  },
      { name: "counterparty", type: "address", indexed: true  },
      { name: "price",        type: "uint256", indexed: false },
      { name: "checkLt",      type: "bool",    indexed: false },
    ],
  },
  {
    name: "DealSettled",
    type: "event",
    inputs: [{ name: "dealId", type: "uint256", indexed: true }],
  },
] as const;

const VEIL_TOKEN_OPERATOR_ABI = [
  {
    name: "setOperator",
    type: "function",
    stateMutability: "nonpayable",
    inputs:  [{ name: "operator", type: "address" }, { name: "until", type: "uint48" }],
    outputs: [],
  },
  {
    name: "isOperator",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "holder", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type DealParams = {
  amount:          number;
  counterparty:    `0x${string}`;
  condition:       string;
  contractAddress: `0x${string}`;
  tokenAddress:    `0x${string}`;
};

export type DealResult = {
  dealId:       bigint;
  resultHandle: `0x${string}`;
  txHash:       `0x${string}`;
  price:        number;
  execute:      boolean;
};

export async function checkIsOperator(
  publicClient:  PublicClient,
  tokenAddress:  `0x${string}`,
  holder:        `0x${string}`,
  operator:      `0x${string}`
): Promise<boolean> {
  return publicClient.readContract({
    address:      tokenAddress,
    abi:          VEIL_TOKEN_OPERATOR_ABI,
    functionName: "isOperator",
    args:         [holder, operator],
  }) as Promise<boolean>;
}

export async function approveOperator(
  walletClient:  WalletClient,
  publicClient:  PublicClient,
  tokenAddress:  `0x${string}`,
  dealAddress:   `0x${string}`
): Promise<`0x${string}`> {
  const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  const hash = await walletClient.writeContract({
    chain:        walletClient.chain   ?? null,
    account:      walletClient.account ?? null,
    address:      tokenAddress,
    abi:          VEIL_TOKEN_OPERATOR_ABI,
    functionName: "setOperator",
    args:         [dealAddress, expiry],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function createDeal(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params:       DealParams
): Promise<DealResult> {
  const handleClient = await createViemHandleClient(walletClient);

  // 1. Fetch live price
  const priceRes = await fetch("/api/price");
  if (!priceRes.ok) throw new Error("Failed to fetch ETH price");
  const { price: rawPrice } = await priceRes.json() as { price: number };
  const price = Math.round(rawPrice);

  // Nox.fromExternal validates proof against msg.sender at the point of the call:
  //   amountHandle  → passed through veilToken.confidentialTransferFrom (external call),
  //                   so inside VeilToken msg.sender = VeilDeal → bind to DEAL address.
  //   thresholdHandle → Nox.fromExternal called directly inside VeilDeal (internal lib),
  //                   so msg.sender = user's EOA → bind to user's wallet address.
  const [userAddress] = await walletClient.getAddresses();

  // 2. Encrypt amount — bound to VeilDeal (msg.sender seen by VeilToken = VeilDeal)
  const { handle: amountHandle, handleProof: amountProof } =
    await handleClient.encryptInput(BigInt(Math.round(params.amount * 1e18)), "uint256", params.contractAddress);

  // 3. Encrypt threshold — bound to user's EOA (msg.sender seen by Nox lib inside VeilDeal = user)
  const match = params.condition.match(/(\d+(?:\.\d+)?)/);
  const threshold = match ? parseFloat(match[1]) : 0;
  if (!threshold) throw new Error("Could not extract price threshold from condition");

  const { handle: thresholdHandle, handleProof: thresholdProof } =
    await handleClient.encryptInput(BigInt(Math.round(threshold)), "uint256", userAddress);

  const checkLt = params.condition.includes("<") || !params.condition.includes(">");

  const callArgs = [
    amountHandle    as `0x${string}`,
    amountProof     as `0x${string}`,
    thresholdHandle as `0x${string}`,
    thresholdProof  as `0x${string}`,
    params.counterparty,
    BigInt(price),
    checkLt,
  ] as const;

  // 4. Simulate first to surface the exact revert reason before paying gas
  try {
    await publicClient.simulateContract({
      address:      params.contractAddress,
      abi:          VEIL_DEAL_ABI,
      functionName: "createDeal",
      args:         callArgs,
      account:      walletClient.account ?? undefined,
    });
  } catch (simErr) {
    const msg = simErr instanceof Error ? simErr.message : String(simErr);
    throw new Error(`Simulation failed: ${msg}`);
  }

  // 5. Submit on-chain
  const txHash = await walletClient.writeContract({
    chain:        walletClient.chain   ?? null,
    account:      walletClient.account ?? null,
    address:      params.contractAddress,
    abi:          VEIL_DEAL_ABI,
    functionName: "createDeal",
    args:         callArgs,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "reverted") {
    throw new Error(
      "Transaction reverted on-chain after simulation passed — check Arbiscan for details."
    );
  }

  // 5. Get dealId from dealCount (most reliable — avoids event parsing issues)
  const dealCount = await publicClient.readContract({
    address:      params.contractAddress,
    abi:          VEIL_DEAL_ABI,
    functionName: "dealCount",
  }) as bigint;

  const dealId: bigint = dealCount - BigInt(1);

  // 6. Get resultHandle from getDeal
  const deal = await publicClient.readContract({
    address:      params.contractAddress,
    abi:          VEIL_DEAL_ABI,
    functionName: "getDeal",
    args:         [dealId],
  }) as { resultHandle: `0x${string}` };

  const resultHandle: `0x${string}` = deal.resultHandle;

  // 6. Poll TEE for result
  let execute: boolean | undefined;
  for (let i = 0; i < 30; i++) {
    try {
      const { value } = await handleClient.publicDecrypt(resultHandle);
      execute = value as boolean;
      break;
    } catch {
      if (i < 29) await new Promise<void>(r => setTimeout(r, 2000));
    }
  }

  if (execute === undefined) throw new Error("TEE result not available after 60s — check Arbiscan and retry settlement");

  return { dealId, resultHandle, txHash, price, execute };
}

export async function settleDeal(
  walletClient:    WalletClient,
  publicClient:    PublicClient,
  dealId:          bigint,
  contractAddress: `0x${string}`
): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({
    chain:        walletClient.chain   ?? null,
    account:      walletClient.account ?? null,
    address:      contractAddress,
    abi:          VEIL_DEAL_ABI,
    functionName: "settleDeal",
    args:         [dealId],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
