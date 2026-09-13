import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { DocumentIntegrityRegistry } from '../typechain-types';
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('DocumentIntegrityRegistry Smart Contract', () => {
  let registry: DocumentIntegrityRegistry;
  let owner: SignerWithAddress;
  let authorizedSigner: SignerWithAddress;
  let unauthorizedCaller: SignerWithAddress;

  // Sample fixed-size test data
  const sampleDocId = ethers.encodeBytes32String('doc_test_case_001');
  const sampleVersionId = 1n;
  // Standard SHA-256 hash formatted as bytes32: "hello" -> 0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
  const sampleDocHash = '0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
  const sealedEventType = ethers.keccak256(ethers.toUtf8Bytes('DOCUMENT_SEALED'));

  beforeEach(async () => {
    [owner, authorizedSigner, unauthorizedCaller] = await ethers.getSigners();

    const factory = await ethers.getContractFactory('DocumentIntegrityRegistry');
    registry = (await factory.deploy()) as unknown as DocumentIntegrityRegistry;
    await registry.waitForDeployment();

    // Authorize secondary signer
    await registry.setAuthorizedSigner(authorizedSigner.address, true);
  });

  // Test 1: Deployment
  it('should deploy successfully with owner set and authorized', async () => {
    expect(await registry.getAddress()).to.be.properAddress;
    expect(await registry.owner()).to.equal(owner.address);
    expect(await registry.authorizedSigners(owner.address)).to.be.true;
    expect(await registry.authorizedSigners(authorizedSigner.address)).to.be.true;
  });

  // Test 2, 4, 5, 6, 8, 9, 10: Anchor execution and event emission
  it('should anchor document and emit DocumentAnchored event with exact parameters', async () => {
    const tx = await registry
      .connect(owner)
      .anchorDocument(sampleDocId, sampleVersionId, sampleDocHash, sealedEventType, owner.address);

    await expect(tx)
      .to.emit(registry, 'DocumentAnchored')
      .withArgs(
        sampleDocId,
        sampleVersionId,
        sampleDocHash,
        sealedEventType,
        owner.address,
        (timestamp: bigint) => timestamp > 0n
      );
  });

  // Test 3, 7, 8, 9, 10: Retrieval of stored anchor data
  it('should retrieve accurate stored anchor data', async () => {
    await registry
      .connect(owner)
      .anchorDocument(sampleDocId, sampleVersionId, sampleDocHash, sealedEventType, owner.address);

    const anchor = await registry.getAnchor(sampleDocId, sampleVersionId);

    expect(anchor.documentId).to.equal(sampleDocId);
    expect(anchor.versionId).to.equal(sampleVersionId);
    expect(anchor.documentHash).to.equal(sampleDocHash);
    expect(anchor.eventType).to.equal(sealedEventType);
    expect(anchor.actor).to.equal(owner.address);
    expect(anchor.timestamp).to.be.greaterThan(0n);
    expect(await registry.hasAnchor(sampleDocId, sampleVersionId)).to.be.true;
  });

  // Test 11: Duplicate anchor rejection (Immutability guarantee)
  it('should reject duplicate anchor attempts for the same document and version', async () => {
    await registry
      .connect(owner)
      .anchorDocument(sampleDocId, sampleVersionId, sampleDocHash, sealedEventType, owner.address);

    const differentHash = '0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    await expect(
      registry
        .connect(owner)
        .anchorDocument(sampleDocId, sampleVersionId, differentHash, sealedEventType, owner.address)
    )
      .to.be.revertedWithCustomError(registry, 'DocumentAlreadyAnchored')
      .withArgs(sampleDocId, sampleVersionId);

    // Stored hash must remain original
    const anchor = await registry.getAnchor(sampleDocId, sampleVersionId);
    expect(anchor.documentHash).to.equal(sampleDocHash);
  });

  // Test 12: Unauthorized caller rejection
  it('should reject anchor calls from unauthorized callers', async () => {
    await expect(
      registry
        .connect(unauthorizedCaller)
        .anchorDocument(sampleDocId, sampleVersionId, sampleDocHash, sealedEventType, unauthorizedCaller.address)
    )
      .to.be.revertedWithCustomError(registry, 'UnauthorizedCaller')
      .withArgs(unauthorizedCaller.address);
  });

  // Test 12b: Authorized secondary signer succeeds
  it('should allow an authorized secondary signer to record an anchor', async () => {
    const docId2 = ethers.encodeBytes32String('doc_case_secondary');
    await expect(
      registry
        .connect(authorizedSigner)
        .anchorDocument(docId2, 1n, sampleDocHash, sealedEventType, authorizedSigner.address)
    ).to.emit(registry, 'DocumentAnchored');
  });

  // Test 13: Hash verification test (Step 15)
  it('should verify matching document hash and reject non-matching hash', async () => {
    await registry
      .connect(owner)
      .anchorDocument(sampleDocId, sampleVersionId, sampleDocHash, sealedEventType, owner.address);

    // Matching hash returns true
    expect(await registry.verifyAnchorHash(sampleDocId, sampleVersionId, sampleDocHash)).to.be.true;

    // Non-matching hash returns false
    const tamperedHash = '0x1111111111111111111111111111111111111111111111111111111111111111';
    expect(await registry.verifyAnchorHash(sampleDocId, sampleVersionId, tamperedHash)).to.be.false;

    // Non-existent document returns false
    const nonExistentDocId = ethers.encodeBytes32String('doc_ghost');
    expect(await registry.verifyAnchorHash(nonExistentDocId, sampleVersionId, sampleDocHash)).to.be.false;
  });

  // Test 14: Non-existent anchor retrieval reverts with AnchorNotFound
  it('should revert with AnchorNotFound when querying unanchored document', async () => {
    const unanchoredDocId = ethers.encodeBytes32String('doc_unanchored');
    await expect(registry.getAnchor(unanchoredDocId, 1n))
      .to.be.revertedWithCustomError(registry, 'AnchorNotFound')
      .withArgs(unanchoredDocId, 1n);
  });

  // Test 15: Input validation - zero documentId or zero documentHash reverts
  it('should revert if documentId or documentHash is zero', async () => {
    await expect(
      registry.connect(owner).anchorDocument(ethers.ZeroHash, 1n, sampleDocHash, sealedEventType, owner.address)
    ).to.be.revertedWithCustomError(registry, 'InvalidDocumentId');

    await expect(
      registry.connect(owner).anchorDocument(sampleDocId, 1n, ethers.ZeroHash, sealedEventType, owner.address)
    ).to.be.revertedWithCustomError(registry, 'InvalidDocumentHash');
  });

  // Test 16: Multi-version support for same documentId
  it('should allow multiple distinct versions to be anchored for the same document ID', async () => {
    const version1Hash = sampleDocHash;
    const version2Hash = '0xd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592';

    await registry.connect(owner).anchorDocument(sampleDocId, 1n, version1Hash, sealedEventType, owner.address);
    await registry.connect(owner).anchorDocument(sampleDocId, 2n, version2Hash, sealedEventType, owner.address);

    const anchor1 = await registry.getAnchor(sampleDocId, 1n);
    const anchor2 = await registry.getAnchor(sampleDocId, 2n);

    expect(anchor1.documentHash).to.equal(version1Hash);
    expect(anchor2.documentHash).to.equal(version2Hash);
    expect(anchor1.versionId).to.equal(1n);
    expect(anchor2.versionId).to.equal(2n);
  });
});
