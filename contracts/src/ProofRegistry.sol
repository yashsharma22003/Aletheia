// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

/**
 * @title ProofRegistry
 * @notice Stores a keccak256 hash of each zkSNARK proof, keyed by chequeId.
 * @dev Rather than storing the full proof (~16KB, prohibitively expensive), we store
 *      only the 32-byte keccak256 hash. The Chainlink proof_oracle workflow is
 *      responsible for hashing the proof off-chain before writing the report.
 *      The verify_oracle redemption workflow re-hashes the proof from calldata to
 *      authenticate it against this registry before releasing funds.
 */
contract ProofRegistry is ReceiverTemplate {
    // Maps chequeId -> keccak256(proof bytes)
    mapping(bytes32 => bytes32) public proofHashes;

    // Events
    event ProofHashRegistered(bytes32 indexed chequeId, bytes32 proofHash);

    /**
     * @notice Constructor
     * @param _forwarderAddress The address of the CRE Forwarder mapped to the target chain.
     */
    constructor(
        address _forwarderAddress
    ) ReceiverTemplate(_forwarderAddress) {}

    /**
     * @notice Processes a validated CRE report, storing the keccak256 hash of the proof.
     * @dev Called by ReceiverTemplate.onReport after forwarder validation passes.
     *      The proof_oracle workflow hashes the proof off-chain and encodes:
     *      (bytes32 chequeId, bytes32 proofHash)
     * @param report ABI-encoded (bytes32 chequeId, bytes32 proofHash).
     */
    function _processReport(bytes calldata report) internal override {
        (bytes32 chequeId, bytes32 proofHash) = abi.decode(
            report,
            (bytes32, bytes32)
        );

        proofHashes[chequeId] = proofHash;

        emit ProofHashRegistered(chequeId, proofHash);
    }

    /**
     * @notice Verify that a given proof matches the registered hash for a chequeId.
     * @param chequeId The cheque to verify.
     * @param proof The raw proof bytes to check.
     * @return true if keccak256(proof) matches the stored hash.
     */
    function verifyProof(
        bytes32 chequeId,
        bytes calldata proof
    ) external view returns (bool) {
        return
            proofHashes[chequeId] != bytes32(0) &&
            proofHashes[chequeId] == keccak256(proof);
    }
}
