// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DocumentIntegrityRegistry
 * @notice Immutable evidentiary anchor registry for NyayaVault.
 *
 * Core Architectural Mandates:
 * 1. Proof Metadata Only: Stores cryptographic digests and minimal lifecycle metadata.
 * 2. Zero Content Storage: Never stores files, OCR, plaintext, PII, or encryption keys.
 * 3. Strict Immutability: Once an anchor is recorded for a (documentId, versionId) pair,
 *    it CANNOT be overwritten, updated, replaced, or deleted.
 * 4. EVM Block Timestamp: Timestamps are derived authoritatively from block.timestamp.
 */
contract DocumentIntegrityRegistry {
    // Standard Lifecycle Event Identifiers
    bytes32 public constant EVENT_DOCUMENT_SEALED = keccak256("DOCUMENT_SEALED");

    struct DocumentAnchor {
        bytes32 documentId;
        uint256 versionId;
        bytes32 documentHash;
        bytes32 eventType;
        address actor;
        uint256 timestamp;
    }

    // documentId => versionId => DocumentAnchor
    mapping(bytes32 => mapping(uint256 => DocumentAnchor)) private _anchors;

    // Minimal Access Control: Authorized backend signers
    address public owner;
    mapping(address => bool) public authorizedSigners;

    // Custom Errors
    error UnauthorizedCaller(address caller);
    error DocumentAlreadyAnchored(bytes32 documentId, uint256 versionId);
    error InvalidDocumentId();
    error InvalidDocumentHash();
    error AnchorNotFound(bytes32 documentId, uint256 versionId);
    error InvalidAddress();

    // Events
    event DocumentAnchored(
        bytes32 indexed documentId,
        uint256 indexed versionId,
        bytes32 documentHash,
        bytes32 eventType,
        address indexed actor,
        uint256 timestamp
    );

    event SignerAuthorizationUpdated(address indexed signer, bool authorized);

    modifier onlyAuthorized() {
        if (msg.sender != owner && !authorizedSigners[msg.sender]) {
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedSigners[msg.sender] = true;
        emit SignerAuthorizationUpdated(msg.sender, true);
    }

    /**
     * @notice Grants or revokes anchor signing permissions for a backend signer address.
     */
    function setAuthorizedSigner(address signer, bool authorized) external onlyOwner {
        if (signer == address(0)) {
            revert InvalidAddress();
        }
        authorizedSigners[signer] = authorized;
        emit SignerAuthorizationUpdated(signer, authorized);
    }

    /**
     * @notice Records an immutable cryptographic fingerprint and lifecycle anchor for a document version.
     *
     * Immutability Rule:
     * Re-anchoring an already anchored (documentId, versionId) strictly reverts.
     *
     * @param documentId Compact 32-byte identifier for the document.
     * @param versionId Monotonically increasing revision number (e.g. 1, 2...).
     * @param documentHash Authoritative 32-byte SHA-256 digest of original plaintext bytes.
     * @param eventType Compact 32-byte event type identifier (e.g. EVENT_DOCUMENT_SEALED).
     * @param actor Address representing the recording legal authority / backend signer.
     */
    function anchorDocument(
        bytes32 documentId,
        uint256 versionId,
        bytes32 documentHash,
        bytes32 eventType,
        address actor
    ) external onlyAuthorized {
        if (documentId == bytes32(0)) {
            revert InvalidDocumentId();
        }
        if (documentHash == bytes32(0)) {
            revert InvalidDocumentHash();
        }

        // Duplicate anchor check: existing anchors cannot be overwritten
        if (_anchors[documentId][versionId].timestamp != 0) {
            revert DocumentAlreadyAnchored(documentId, versionId);
        }

        uint256 blockTime = block.timestamp;
        address recordingActor = actor == address(0) ? msg.sender : actor;

        _anchors[documentId][versionId] = DocumentAnchor({
            documentId: documentId,
            versionId: versionId,
            documentHash: documentHash,
            eventType: eventType,
            actor: recordingActor,
            timestamp: blockTime
        });

        emit DocumentAnchored(
            documentId,
            versionId,
            documentHash,
            eventType,
            recordingActor,
            blockTime
        );
    }

    /**
     * @notice Retrieves the immutable anchor proof for a document version.
     */
    function getAnchor(bytes32 documentId, uint256 versionId)
        external
        view
        returns (DocumentAnchor memory)
    {
        DocumentAnchor memory anchor = _anchors[documentId][versionId];
        if (anchor.timestamp == 0) {
            revert AnchorNotFound(documentId, versionId);
        }
        return anchor;
    }

    /**
     * @notice Checks whether an anchor exists for a specific document version.
     */
    function hasAnchor(bytes32 documentId, uint256 versionId) external view returns (bool) {
        return _anchors[documentId][versionId].timestamp != 0;
    }

    /**
     * @notice Cryptographically verifies whether a candidate document hash matches the recorded anchor.
     */
    function verifyAnchorHash(
        bytes32 documentId,
        uint256 versionId,
        bytes32 candidateHash
    ) external view returns (bool) {
        DocumentAnchor memory anchor = _anchors[documentId][versionId];
        if (anchor.timestamp == 0) {
            return false;
        }
        return anchor.documentHash == candidateHash;
    }
}
