// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * VeilExecutor — on-chain trust anchor for TEE evaluation results.
 *
 * Flow:
 *  1. Client encrypts price threshold with TEE's public key (off-chain).
 *  2. TEE decrypts privately, evaluates price OP threshold, signs result.
 *  3. Client calls recordResult() with the TEE's signed result.
 *  4. Contract verifies: ecrecover(signature) == TEE_ADDRESS.
 *  5. If valid, result is stored and Evaluated event emitted.
 *
 * The contract NEVER sees the plaintext threshold — only the handle (a hash
 * of the encrypted blob) and the boolean result.
 *
 * In iExec Nox production:
 *  - Step 2-3 happen automatically via Nox workers (SGX enclaves).
 *  - Nox.lt(price, threshold) replaces this manual pattern.
 *  - TEE_ADDRESS is the Nox network's attested signing key.
 *
 * For hackathon:
 *  - TEE is /api/tee-evaluate (a trusted server).
 *  - TEE_ADDRESS is set at deploy time from NEXT_PUBLIC_TEE_ADDRESS env var.
 *  - The cryptographic trust model (ECDSA verify) is identical to production.
 */
contract VeilExecutor {

    // ── State ─────────────────────────────────────────────────────────────────

    // The TEE's Ethereum address — only results signed by this key are accepted.
    // In iExec Nox: this is the network's attestation key, rotatable via governance.
    address public immutable TEE_ADDRESS;

    struct TEEResult {
        bool     execute;  // true = execute the trade
        uint256  price;    // market price used in the evaluation
        bool     exists;   // false = result not yet recorded
    }

    // handle (bytes32) → result
    // handle = keccak256(ciphertext || iv || ephemeralPubKey) — computed client-side
    mapping(bytes32 => TEEResult) public results;

    // ── Events ────────────────────────────────────────────────────────────────

    event Evaluated(bytes32 indexed handle, bool execute, uint256 price);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address teeAddress) {
        require(teeAddress != address(0), "VeilExecutor: zero TEE address");
        TEE_ADDRESS = teeAddress;
    }

    // ── Core ──────────────────────────────────────────────────────────────────

    /**
     * Record a TEE evaluation result.
     *
     * @param handle        bytes32 — on-chain identifier for the encrypted threshold
     * @param execute       bool    — true if price met the condition
     * @param price         uint256 — market price the TEE used
     * @param teeSignature  bytes   — TEE's ECDSA signature over keccak256(handle || execute || price)
     *
     * The TEE signs: keccak256(abi.encodePacked(handle, execute, price))
     * We verify using Ethereum's personal_sign prefix ("\x19Ethereum Signed Message:\n32").
     */
    function recordResult(
        bytes32 handle,
        bool    execute,
        uint256 price,
        bytes calldata teeSignature
    ) external {
        require(!results[handle].exists, "VeilExecutor: already recorded");

        // Reconstruct the message the TEE signed (must match tee-evaluate/route.ts exactly)
        bytes32 msgHash = keccak256(abi.encodePacked(handle, execute, price));

        // Apply Ethereum signed message prefix (matches viem's signMessage with raw bytes)
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash)
        );

        // Recover signer — must be the trusted TEE
        address signer = _recover(ethHash, teeSignature);
        require(signer == TEE_ADDRESS, "VeilExecutor: signature not from TEE");

        results[handle] = TEEResult(execute, price, true);
        emit Evaluated(handle, execute, price);
    }

    // ── View ──────────────────────────────────────────────────────────────────

    function getResult(bytes32 handle)
        external view
        returns (bool execute, uint256 price, bool exists)
    {
        TEEResult memory r = results[handle];
        return (r.execute, r.price, r.exists);
    }

    // ── Internal: ECDSA recovery (no OpenZeppelin dependency) ─────────────────

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "VeilExecutor: bad sig length");
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        address recovered = ecrecover(hash, v, r, s);
        require(recovered != address(0), "VeilExecutor: ecrecover failed");
        return recovered;
    }
}
