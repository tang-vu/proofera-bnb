// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

interface IERC8004IdentityRegistry {
    function ownerOf(uint256 agentId) external view returns (address owner);
}

/// @title ProofEra Testnet Hire Receipt
/// @notice Produces paid, task-bound hire receipts for registered ERC-8004 agents on BSC testnet.
/// @dev This contract is not escrow, execution authority, reputation, or proof of performance.
/// It retains no payment and has no administrator. Successful hire value is delivered atomically
/// to the agent owner observed from the immutable identity registry.
contract ProofEraTestnetHireReceipt {
    uint256 public constant BSC_TESTNET_CHAIN_ID = 97;
    uint256 public constant MAX_PAYMENT_WEI = 0.01 ether;
    uint64 public constant MAX_HIRE_DURATION_SECONDS = 7 days;

    IERC8004IdentityRegistry public immutable identityRegistry;

    mapping(bytes32 engagementId => bytes32 receiptHash)
        public receiptByEngagement;

    event AgentHired(
        bytes32 indexed engagementId,
        uint256 indexed agentId,
        address indexed hirer,
        address agentOwner,
        bytes32 taskHash,
        uint64 expiresAt,
        uint256 paymentWei,
        bytes32 receiptHash
    );

    error UnsupportedChain(uint256 chainId);
    error InvalidIdentityRegistry();
    error InvalidEngagementId();
    error InvalidTaskHash();
    error InvalidPayment(uint256 paymentWei);
    error InvalidExpiry(uint64 expiresAt, uint256 observedAt);
    error EngagementAlreadyUsed(bytes32 engagementId);
    error AgentOwnerPaymentFailed(address agentOwner, uint256 paymentWei);

    constructor(address identityRegistryAddress) {
        if (block.chainid != BSC_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }
        if (
            identityRegistryAddress == address(0) ||
            identityRegistryAddress.code.length == 0
        ) {
            revert InvalidIdentityRegistry();
        }
        identityRegistry = IERC8004IdentityRegistry(identityRegistryAddress);
    }

    function hire(
        uint256 agentId,
        bytes32 engagementId,
        bytes32 taskHash,
        uint64 expiresAt
    ) external payable returns (bytes32 receiptHash) {
        if (engagementId == bytes32(0)) revert InvalidEngagementId();
        if (taskHash == bytes32(0)) revert InvalidTaskHash();
        if (msg.value == 0 || msg.value > MAX_PAYMENT_WEI) {
            revert InvalidPayment(msg.value);
        }
        if (
            expiresAt <= block.timestamp ||
            uint256(expiresAt) > block.timestamp + MAX_HIRE_DURATION_SECONDS
        ) {
            revert InvalidExpiry(expiresAt, block.timestamp);
        }
        if (receiptByEngagement[engagementId] != bytes32(0)) {
            revert EngagementAlreadyUsed(engagementId);
        }

        address agentOwner = identityRegistry.ownerOf(agentId);
        receiptHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                engagementId,
                agentId,
                msg.sender,
                agentOwner,
                taskHash,
                expiresAt,
                msg.value
            )
        );
        receiptByEngagement[engagementId] = receiptHash;

        (bool paid, ) = payable(agentOwner).call{value: msg.value}("");
        if (!paid) revert AgentOwnerPaymentFailed(agentOwner, msg.value);

        emit AgentHired(
            engagementId,
            agentId,
            msg.sender,
            agentOwner,
            taskHash,
            expiresAt,
            msg.value,
            receiptHash
        );
    }
}
