// src/utils/abis.ts
// Shared ABI definitions reused across patterns

export const DID_MANAGER_ABI = [
  {
    name: 'setAttributeForIdentity',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setBatchAttributesForIdentity',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      {
        name: 'updates',
        type: 'tuple[]',
        components: [
          { name: 'name', type: 'bytes32' },
          { name: 'value', type: 'bytes' },
          { name: 'validity', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const
