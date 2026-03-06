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

export const MULTISIG_DID_MANAGER_ABI = [
  {
    name: 'configure',
    type: 'function',
    inputs: [
      { name: '_signers', type: 'address[]' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setAttributeWithMultiSig',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
      { name: 'sigs', type: 'bytes[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'updateDigest',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
      { name: '_nonce', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    name: 'getSigners',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    name: 'nonce',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'threshold',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const REVOCATION_DID_MANAGER_ABI = [
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
    name: 'revokeAttributeForIdentity',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'revokeCredential',
    type: 'function',
    inputs: [{ name: 'credentialId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'isRevoked',
    type: 'function',
    inputs: [{ name: 'credentialId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export const CROSS_CHAIN_DID_MANAGER_ABI = [
  {
    name: 'setAttributeCrossChain',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'updateDigest',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    name: 'crossChainNonce',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const META_TX_DID_MANAGER_ABI = [
  {
    name: 'setAttribute',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setBatchAttributes',
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
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getNonce',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'attributeDigest',
    type: 'function',
    inputs: [
      { name: 'registry', type: 'address' },
      { name: 'name', type: 'bytes32' },
      { name: 'value', type: 'bytes' },
      { name: 'validity', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    name: 'batchAttributeDigest',
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
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    name: 'nonce',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export const EXPIRING_DID_MANAGER_ABI = [
  {
    name: 'configure',
    type: 'function',
    inputs: [{ name: '_expiry', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
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
    name: 'expiry',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isActive',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const
