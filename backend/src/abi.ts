// Minimal ABIs needed by the backend. The frontend keeps its own copies
// alongside the generated Foundry artefacts.

export const remittanceVaultAbi = [
  {
    type: "function",
    name: "createRemittance",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "musdAmount", type: "uint256" },
      { name: "collateralBTC", type: "uint256" },
      { name: "claimCodeHash", type: "bytes32" },
      { name: "expirySeconds", type: "uint256" },
    ],
    outputs: [{ name: "orderId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "claimRemittance",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "bytes32" },
      { name: "claimCodeHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelRemittance",
    stateMutability: "nonpayable",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "topUpCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "bytes32" },
      { name: "extraBTC", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayAndUnlock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "bytes32" },
      { name: "musdRepay", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "liquidationGuard",
    stateMutability: "nonpayable",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "vaultCollateralRatio",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getOrder",
    stateMutability: "view",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [
      {
        components: [
          { name: "sender", type: "address" },
          { name: "recipient", type: "address" },
          { name: "musdAmount", type: "uint256" },
          { name: "collateralBTC", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "expiryTimestamp", type: "uint256" },
          { name: "claimCode", type: "bytes32" },
          { name: "status", type: "uint8" },
          { name: "musdRepaid", type: "uint256" },
          { name: "btcUnlocked", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
  },
  {
    type: "event",
    name: "RemittanceCreated",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "musdAmount", type: "uint256", indexed: false },
      { name: "collateralBTC", type: "uint256", indexed: false },
      { name: "expiryTimestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RemittanceClaimed",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CollateralWarning",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      { name: "currentRatio", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CollateralUnlocked",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "musdRepaid", type: "uint256", indexed: false },
      { name: "btcOut", type: "uint256", indexed: false },
      { name: "musdRemaining", type: "uint256", indexed: false },
      { name: "btcRemaining", type: "uint256", indexed: false },
    ],
  },
] as const;

export const insurancePoolAbi = [
  {
    type: "function",
    name: "totalReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalShares",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sharesOf",
    stateMutability: "view",
    inputs: [{ name: "lp", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getPoolHealth",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
