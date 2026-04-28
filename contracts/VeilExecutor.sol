// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Nox, euint256, ebool, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/**
 * VeilExecutor — confidential intent execution via iExec Nox TEE.
 *
 * Flow:
 *  1. User encrypts their price threshold client-side (via JS SDK).
 *  2. Calls evaluate() with the encrypted handle + public current price.
 *  3. Nox.lt() triggers TEE Runner to privately compute: price < threshold.
 *  4. Result (ebool) is marked publicly decryptable.
 *  5. Client calls publicDecrypt(resultHandle) to learn: execute or hold.
 *
 * The threshold never appears in plaintext on-chain — only the Runner sees it.
 */
contract VeilExecutor {
    ebool public resultHandle;

    event Evaluated(bytes32 indexed resultHandle, uint256 currentPrice);

    /**
     * @param thresholdHandle  Encrypted price threshold from user (via JS SDK encryptInput).
     * @param thresholdProof   EIP-712 proof that handle was encrypted for this contract.
     * @param currentPrice     Public market price (oracle or hardcoded for MVP).
     */
    function evaluate(
        externalEuint256 thresholdHandle,
        bytes calldata thresholdProof,
        uint256 currentPrice
    ) external {
        // Validate and unwrap the encrypted threshold
        euint256 threshold = Nox.fromExternal(thresholdHandle, thresholdProof);
        Nox.allowThis(threshold);

        // Wrap public price as encrypted type for TEE comparison
        euint256 price = Nox.toEuint256(currentPrice);

        // TEE Runner evaluates: price < threshold (privately)
        resultHandle = Nox.lt(price, threshold);

        // Allow public decryption — the boolean decision is public,
        // the threshold value remains confidential
        Nox.allowPublicDecryption(resultHandle);

        emit Evaluated(ebool.unwrap(resultHandle), currentPrice);
    }

    function getResultHandle() external view returns (bytes32) {
        return ebool.unwrap(resultHandle);
    }
}
