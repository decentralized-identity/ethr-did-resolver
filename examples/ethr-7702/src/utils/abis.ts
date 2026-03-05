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

export const POLICY_DID_MANAGER_ABI = [
  {
    name: 'configure',
    type: 'function',
    inputs: [
      { name: '_sessionKey', type: 'address' },
      { name: '_maxValidity', type: 'uint256' },
      { name: '_allowedPrefix', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setAttributeViaSessionKey',
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
    name: 'sessionKey',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'maxValidity',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'allowedPrefix',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
] as const
