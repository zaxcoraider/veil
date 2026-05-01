// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/token/ERC7984.sol";
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

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

    function rewardMint(address to) external {
        require(msg.sender == executor, "VeilToken: not executor");
        euint256 amount = Nox.toEuint256(REWARD_AMOUNT);
        Nox.allowThis(amount);
        Nox.allow(amount, to);
        _mint(to, amount);
    }

    function faucet() external {
        require(!hasClaimed[msg.sender], "VeilToken: already claimed");
        hasClaimed[msg.sender] = true;
        euint256 amount = Nox.toEuint256(FAUCET_AMOUNT);
        Nox.allowThis(amount);
        Nox.allow(amount, msg.sender);
        _mint(msg.sender, amount);
    }

    /**
     * Validate an external encrypted amount and grant ACL access to a beneficiary
     * contract (e.g. VeilDeal) so it can use the handle in confidentialTransferFrom.
     *
     * User calls this directly — msg.sender = user — so the Nox proof validates:
     *   appInProof  = address(this) = VeilToken  (NoxCompute caller)
     *   ownerInProof = msg.sender  = user         (SDK owner)
     */
    function prepareTransfer(
        externalEuint256 amount,
        bytes calldata   proof,
        address          beneficiary
    ) external returns (euint256 handle) {
        handle = Nox.fromExternal(amount, proof);
        Nox.allowThis(handle);
        Nox.allow(handle, msg.sender);
        Nox.allow(handle, beneficiary);
    }
}
