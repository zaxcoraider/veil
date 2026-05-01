// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Nox, euint256, externalEuint256, ebool} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import "encrypted-types/EncryptedTypes.sol";

interface IVeilToken {
    function confidentialTransferFrom(address from, address to, externalEuint256 encryptedAmount, bytes calldata inputProof) external returns (euint256);
    function confidentialTransfer(address to, euint256 amount) external returns (euint256);
    function rewardMint(address to) external;
    function setOperator(address operator, uint48 until) external;
}

/**
 * VeilDeal — Confidential escrow engine powered by iExec Nox + ERC-7984.
 *
 * Flow:
 *  1. Creator encrypts VEIL amount + price threshold via Nox Gateway (off-chain).
 *  2. Creator approves VeilDeal as ERC-7984 operator on VeilToken.
 *  3. Creator calls createDeal() — VEIL is locked, TEE comparison queued.
 *  4. SGX enclave evaluates price vs hidden threshold privately.
 *  5. Anyone calls settleDeal() after TEE result is available.
 *  6. Nox.select() routes funds: counterparty gets VEIL if condition met,
 *     creator gets refund otherwise — all amounts stay encrypted.
 *
 * Nothing is revealed: not the amount, not the threshold, not who wins
 * until the deal is settled and each party decrypts their own balance.
 */
contract VeilDeal {

    IVeilToken public veilToken;
    address    public owner;

    struct Deal {
        address  creator;
        address  counterparty;
        euint256 lockedAmount;
        bytes32  resultHandle;
        bool     settled;
        uint256  price;
        bool     checkLt;
        uint256  createdAt;
    }

    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;

    event DealCreated(
        uint256 indexed dealId,
        address indexed creator,
        address indexed counterparty,
        uint256 price,
        bool    checkLt
    );
    event DealSettled(uint256 indexed dealId);

    modifier onlyOwner() {
        require(msg.sender == owner, "VeilDeal: not owner");
        _;
    }

    constructor(address _veilToken) {
        veilToken = IVeilToken(_veilToken);
        owner     = msg.sender;
    }

    /**
     * Create a confidential deal.
     *
     * @param amountHandle     Encrypted VEIL amount (from Nox Gateway SDK)
     * @param amountProof      EIP-712 proof for amountHandle
     * @param thresholdHandle  Encrypted price threshold
     * @param thresholdProof   EIP-712 proof for thresholdHandle
     * @param counterparty     Who receives VEIL if condition is met
     * @param currentPrice     Live market price (public)
     * @param checkLt          true = execute if price < threshold (buy signal)
     */
    function createDeal(
        externalEuint256 amountHandle,
        bytes calldata   amountProof,
        externalEuint256 thresholdHandle,
        bytes calldata   thresholdProof,
        address          counterparty,
        uint256          currentPrice,
        bool             checkLt
    ) external returns (uint256 dealId) {
        require(counterparty != address(0),   "VeilDeal: zero counterparty");
        require(counterparty != msg.sender,   "VeilDeal: self-deal");

        // ── Lock VEIL ──────────────────────────────────────────────────────────
        // Transfer encrypted amount from creator → this contract.
        // Requires creator to have called veilToken.setOperator(address(this), expiry).
        euint256 locked = veilToken.confidentialTransferFrom(
            msg.sender, address(this), amountHandle, amountProof
        );
        Nox.allowThis(locked);
        Nox.allow(locked, msg.sender);
        Nox.allow(locked, counterparty);

        // ── Confidential comparison ────────────────────────────────────────────
        euint256 threshold  = Nox.fromExternal(thresholdHandle, thresholdProof);
        Nox.allowThis(threshold);

        euint256 encPrice = Nox.toEuint256(currentPrice);

        ebool result = checkLt
            ? Nox.lt(encPrice, threshold)
            : Nox.gt(encPrice, threshold);

        Nox.allowPublicDecryption(result);
        Nox.allowThis(result);

        // ── Store deal ─────────────────────────────────────────────────────────
        dealId = dealCount++;
        deals[dealId] = Deal({
            creator:      msg.sender,
            counterparty: counterparty,
            lockedAmount: locked,
            resultHandle: ebool.unwrap(result),
            settled:      false,
            price:        currentPrice,
            checkLt:      checkLt,
            createdAt:    block.timestamp
        });

        emit DealCreated(dealId, msg.sender, counterparty, currentPrice, checkLt);

        // Reward creator with 1 VEIL for using the protocol
        try veilToken.rewardMint(msg.sender) {} catch {}
    }

    /**
     * Settle a deal after the TEE has evaluated the condition.
     * Anyone can call this — the result is already determined by the TEE.
     * Funds route privately: counterparty or creator, no one knows until they decrypt.
     */
    function settleDeal(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(deal.creator != address(0), "VeilDeal: not found");
        require(!deal.settled,              "VeilDeal: already settled");

        deal.settled = true;

        ebool result = ebool.wrap(deal.resultHandle);

        // Condition met  → counterparty gets full amount, creator gets 0
        // Condition false → creator gets full amount, counterparty gets 0
        euint256 toCounterparty = Nox.select(result, deal.lockedAmount, Nox.toEuint256(0));
        euint256 toCreator      = Nox.select(result, Nox.toEuint256(0), deal.lockedAmount);

        Nox.allowThis(toCounterparty);
        Nox.allow(toCounterparty, deal.counterparty);

        Nox.allowThis(toCreator);
        Nox.allow(toCreator, deal.creator);

        veilToken.confidentialTransfer(deal.counterparty, toCounterparty);
        veilToken.confidentialTransfer(deal.creator,      toCreator);

        emit DealSettled(dealId);
    }

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function updateVeilToken(address _veilToken) external onlyOwner {
        veilToken = IVeilToken(_veilToken);
    }
}
