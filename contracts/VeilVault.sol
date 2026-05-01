// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * VeilVault — custody and execution layer for confidential intents.
 *
 * Flow:
 *  1. User calls deposit() to lock ETH.
 *  2. An approved executor (e.g. VeilExecutor TEE contract) calls
 *     executeTrade() once the Nox TEE resolves the condition as true.
 *  3. User calls withdraw() to reclaim any remaining balance.
 *
 * "Approved executor" is the on-chain trust boundary replacing
 * a centralized order engine — only the TEE result contract can trigger trades.
 */
contract VeilVault {

    // ── State ─────────────────────────────────────────────────────────────────

    address public owner;

    // User ETH balances (wei)
    mapping(address => uint256) public balances;

    // Addresses authorised to call executeTrade()
    // In production: only the deployed VeilExecutor contract.
    mapping(address => bool) public approvedExecutors;

    // ── Events ────────────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount);
    event TradeExecuted(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event ExecutorUpdated(address indexed executor, bool approved);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "VeilVault: not owner");
        _;
    }

    modifier onlyApprovedExecutor() {
        require(approvedExecutors[msg.sender], "VeilVault: executor not approved");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /**
     * Approve or revoke an executor.
     * Call this after deploying VeilExecutor to whitelist its address.
     */
    function setExecutor(address executor, bool approved) external onlyOwner {
        approvedExecutors[executor] = approved;
        emit ExecutorUpdated(executor, approved);
    }

    // ── Core functions ────────────────────────────────────────────────────────

    /**
     * Lock ETH in the vault. Mapped to msg.sender.
     */
    function deposit() external payable {
        require(msg.value > 0, "VeilVault: zero deposit");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * Execute a trade on behalf of a user.
     * Only callable by an approved executor (the TEE result contract).
     * Deducts `amount` from `user`'s balance — representing funds
     * committed to the trade.
     *
     * In production: this would forward `amount` to a DEX router.
     * For MVP: the deduction is the execution record.
     */
    function executeTrade(address user, uint256 amount) external onlyApprovedExecutor {
        require(balances[user] >= amount, "VeilVault: insufficient balance");
        balances[user] -= amount;
        emit TradeExecuted(user, amount);
    }

    /**
     * Withdraw full remaining balance to caller.
     * Uses checks-effects-interactions pattern to prevent re-entrancy.
     */
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "VeilVault: nothing to withdraw");
        balances[msg.sender] = 0;                          // effect before interaction
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "VeilVault: transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function balanceOf(address user) external view returns (uint256) {
        return balances[user];
    }
}
