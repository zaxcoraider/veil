// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Nox} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import "encrypted-types/EncryptedTypes.sol";

/**
 * VeilExecutor — Confidential intent execution on iExec Nox.
 *
 * Flow:
 *  1. Client encrypts threshold via Nox Gateway SDK (off-chain).
 *  2. Client calls submitIntent() with handle + proof + current market price.
 *  3. Contract validates the proof and calls Nox.lt/gt() → NoxCompute emits event.
 *  4. Real SGX TEE workers compute price OP threshold privately.
 *  5. Result handle is publicly decryptable via handleClient.publicDecrypt().
 *
 * The contract never sees the plaintext threshold.
 * Only a boolean result is ever made public, after TEE attestation.
 */
contract VeilExecutor {

    struct Intent {
        address  user;
        bytes32  resultHandle;
        uint256  price;
        bool     checkLt;
        bool     exists;
    }

    mapping(bytes32 => Intent) public intents;

    event IntentSubmitted(
        address indexed user,
        bytes32 indexed resultHandle,
        uint256 price,
        bool    checkLt
    );

    /**
     * Submit a confidential trading intent.
     *
     * @param thresholdHandle  externalEuint256 — encrypted threshold from Nox Gateway
     * @param handleProof      bytes — EIP-712 proof binding handle to this contract + caller
     * @param currentPrice     uint256 — current market price (caller-supplied, public)
     * @param checkLt          bool — true = execute if price < threshold; false = price > threshold
     */
    function submitIntent(
        externalEuint256 thresholdHandle,
        bytes calldata   handleProof,
        uint256          currentPrice,
        bool             checkLt
    ) external returns (bytes32 resultHandle) {
        // Validate handle proof — NoxCompute verifies the Gateway's EIP-712 signature.
        // This ensures the encrypted threshold was produced by the official Nox Gateway
        // and is authorized for use by THIS contract with THIS caller.
        euint256 threshold = Nox.fromExternal(thresholdHandle, handleProof);
        Nox.allowThis(threshold);

        // Wrap the public price as a "public handle" so NoxCompute can compare it
        // against the encrypted threshold inside the SGX enclave.
        euint256 encryptedPrice = Nox.toEuint256(currentPrice);

        // Confidential comparison: NoxCompute emits an event → SGX workers evaluate
        // price OP threshold without ever seeing the plaintext threshold.
        ebool result = checkLt
            ? Nox.lt(encryptedPrice, threshold)
            : Nox.gt(encryptedPrice, threshold);

        // Make the boolean result publicly decryptable so the frontend can retrieve it.
        Nox.allowPublicDecryption(result);
        Nox.allowThis(result);

        resultHandle = ebool.unwrap(result);

        require(!intents[resultHandle].exists, "VeilExecutor: intent already exists");

        intents[resultHandle] = Intent({
            user:         msg.sender,
            resultHandle: resultHandle,
            price:        currentPrice,
            checkLt:      checkLt,
            exists:       true
        });

        emit IntentSubmitted(msg.sender, resultHandle, currentPrice, checkLt);
    }

    function getIntent(bytes32 resultHandle) external view returns (Intent memory) {
        return intents[resultHandle];
    }
}
