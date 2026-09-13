/**
 * Authoritative ABI definition for DocumentIntegrityRegistry.sol.
 * Extracted directly from compiled artifacts in blockchain/artifacts/contracts/DocumentIntegrityRegistry.sol/DocumentIntegrityRegistry.json.
 */

export const DOCUMENT_INTEGRITY_REGISTRY_ABI = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'documentId', type: 'bytes32' },
      { internalType: 'uint256', name: 'versionId', type: 'uint256' },
    ],
    name: 'AnchorNotFound',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'documentId', type: 'bytes32' },
      { internalType: 'uint256', name: 'versionId', type: 'uint256' },
    ],
    name: 'DocumentAlreadyAnchored',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidAddress',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidDocumentHash',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidDocumentId',
    type: 'error',
  },
  {
    inputs: [{ internalType: 'address', name: 'caller', type: 'address' }],
    name: 'UnauthorizedCaller',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'bytes32', name: 'documentId', type: 'bytes32' },
      { indexed: true, internalType: 'uint256', name: 'versionId', type: 'uint256' },
      { indexed: false, internalType: 'bytes32', name: 'documentHash', type: 'bytes32' },
      { indexed: false, internalType: 'bytes32', name: 'eventType', type: 'bytes32' },
      { indexed: true, internalType: 'address', name: 'actor', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'DocumentAnchored',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'signer', type: 'address' },
      { indexed: false, internalType: 'bool', name: 'authorized', type: 'bool' },
    ],
    name: 'SignerAuthorizationUpdated',
    type: 'event',
  },
  {
    inputs: [],
    name: 'EVENT_DOCUMENT_SEALED',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'documentId', type: 'bytes32' },
      { internalType: 'uint256', name: 'versionId', type: 'uint256' },
      { internalType: 'bytes32', name: 'documentHash', type: 'bytes32' },
      { internalType: 'bytes32', name: 'eventType', type: 'bytes32' },
      { internalType: 'address', name: 'actor', type: 'address' },
    ],
    name: 'anchorDocument',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'authorizedSigners',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'documentId', type: 'bytes32' },
      { internalType: 'uint256', name: 'versionId', type: 'uint256' },
    ],
    name: 'getAnchor',
    outputs: [
      {
        components: [
          { internalType: 'bytes32', name: 'documentId', type: 'bytes32' },
          { internalType: 'uint256', name: 'versionId', type: 'uint256' },
          { internalType: 'bytes32', name: 'documentHash', type: 'bytes32' },
          { internalType: 'bytes32', name: 'eventType', type: 'bytes32' },
          { internalType: 'address', name: 'actor', type: 'address' },
          { internalType: 'uint256', name: 'timestamp', type: 'uint256' },
        ],
        internalType: 'struct DocumentIntegrityRegistry.DocumentAnchor',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'documentId', type: 'bytes32' },
      { internalType: 'uint256', name: 'versionId', type: 'uint256' },
    ],
    name: 'hasAnchor',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'signer', type: 'address' },
      { internalType: 'bool', name: 'authorized', type: 'bool' },
    ],
    name: 'setAuthorizedSigner',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'documentId', type: 'bytes32' },
      { internalType: 'uint256', name: 'versionId', type: 'uint256' },
      { internalType: 'bytes32', name: 'candidateHash', type: 'bytes32' },
    ],
    name: 'verifyAnchorHash',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
