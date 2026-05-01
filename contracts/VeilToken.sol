// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/token/ERC7984.sol";
import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/**
 * VeilToken — ERC-7984 confidential reward token for the Veil protocol.
 *
 * Every time a user submits a confidential trading intent via VeilExecutor,
 * they earn 1 VEIL. Balances are encrypted on-chain; only the holder can
 * decrypt their own balance via the Nox Gateway SDK.
 *
 * Faucet: any testnet user can claim 10 VEIL once for demo purposes.
 */
contract VeilToken is ERC7984 {

    address public owner;
    address public executor;
    mapping(address => bool) public hasClaimed;

    uint256 public constant REWARD_AMOUNT  = 1e18;
    uint256 public constant FAUCET_AMOUNT  = 10e18;

    event ExecutorUpdated(address indexed executor);

    modifier onlyOwner() {
        require(msg.sender == owner, "VeilToken: not owner");
        _;
    }

    constructor() ERC7984("Veil Token", "VEIL", "") {
        owner = msg.sender;
    }

    function setExecutor(address _executor) external onlyOwner {
        executor = _executor;
        emit ExecutorUpdated(_executor);
    }

    /**
     * Mint 1 VEIL reward to a user. Only callable by the approved VeilExecutor.
     * Called automatically on every successful intent submission.
     */
    function rewardMint(address to) external {
        require(msg.sender == executor, "VeilToken: not executor");
        euint256 amount = Nox.toEuint256(REWARD_AMOUNT);
        Nox.allowThis(amount);
        Nox.allow(amount, to);
        _mint(to, amount);
    }

    /**
     * Testnet faucet — claim 10 VEIL once per address to try the protocol.
     */
    function faucet() external {
        require(!hasClaimed[msg.sender], "VeilToken: already claimed");
        hasClaimed[msg.sender] = true;
        euint256 amount = Nox.toEuint256(FAUCET_AMOUNT);
        Nox.allowThis(amount);
        Nox.allow(amount, msg.sender);
        _mint(msg.sender, amount);
    }
}
