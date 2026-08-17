// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ProofEraTestnetHireReceipt} from "../src/ProofEraTestnetHireReceipt.sol";

interface Vm {
    function chainId(uint256 newChainId) external;
    function deal(address account, uint256 newBalance) external;
    function warp(uint256 newTimestamp) external;
}

contract MockIdentityRegistry {
    mapping(uint256 agentId => address owner) private owners;

    function setOwner(uint256 agentId, address owner) external {
        owners[agentId] = owner;
    }

    function ownerOf(uint256 agentId) external view returns (address owner) {
        owner = owners[agentId];
        require(owner != address(0), "missing agent");
    }
}

contract RejectingOwner {
    receive() external payable {
        revert("reject payment");
    }
}

contract ProofEraTestnetHireReceiptTest {
    Vm private constant vm = Vm(
        address(uint160(uint256(keccak256("hevm cheat code"))))
    );

    uint256 private constant AGENT_ID = 1825;
    bytes32 private constant ENGAGEMENT_ID = keccak256("lp-run");
    bytes32 private constant TASK_HASH = keccak256("lp-range-decision");
    address private constant AGENT_OWNER = address(0xA11CE);

    MockIdentityRegistry private registry;
    ProofEraTestnetHireReceipt private receipts;

    function setUp() public {
        vm.chainId(97);
        vm.warp(2_000_000_000);
        vm.deal(address(this), 1 ether);
        registry = new MockIdentityRegistry();
        registry.setOwner(AGENT_ID, AGENT_OWNER);
        receipts = new ProofEraTestnetHireReceipt(address(registry));
    }

    function testHirePaysCurrentRegistryOwnerAndRetainsNoValue() public {
        uint256 ownerBefore = AGENT_OWNER.balance;
        uint64 expiry = uint64(block.timestamp + 1 days);

        bytes32 receiptHash = receipts.hire{value: 0.0001 ether}(
            AGENT_ID,
            ENGAGEMENT_ID,
            TASK_HASH,
            expiry
        );

        require(receiptHash != bytes32(0), "missing receipt hash");
        require(
            receipts.receiptByEngagement(ENGAGEMENT_ID) == receiptHash,
            "receipt not retained"
        );
        require(
            AGENT_OWNER.balance == ownerBefore + 0.0001 ether,
            "owner not paid exactly"
        );
        require(address(receipts).balance == 0, "contract retained payment");
    }

    function testDuplicateEngagementRevertsWithoutSecondPayment() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        receipts.hire{value: 1 wei}(
            AGENT_ID,
            ENGAGEMENT_ID,
            TASK_HASH,
            expiry
        );
        uint256 ownerAfterFirst = AGENT_OWNER.balance;

        (bool succeeded, ) = address(receipts).call{value: 1 wei}(
            abi.encodeCall(
                ProofEraTestnetHireReceipt.hire,
                (AGENT_ID, ENGAGEMENT_ID, TASK_HASH, expiry)
            )
        );

        require(!succeeded, "duplicate engagement unexpectedly succeeded");
        require(AGENT_OWNER.balance == ownerAfterFirst, "owner paid twice");
    }

    function testMissingAgentReverts() public {
        (bool succeeded, ) = address(receipts).call{value: 1 wei}(
            abi.encodeCall(
                ProofEraTestnetHireReceipt.hire,
                (9999, ENGAGEMENT_ID, TASK_HASH, uint64(block.timestamp + 1))
            )
        );

        require(!succeeded, "missing agent unexpectedly hired");
        require(
            receipts.receiptByEngagement(ENGAGEMENT_ID) == bytes32(0),
            "failed hire retained state"
        );
    }

    function testRejectedOwnerPaymentRevertsReceiptState() public {
        RejectingOwner rejectingOwner = new RejectingOwner();
        registry.setOwner(AGENT_ID, address(rejectingOwner));

        (bool succeeded, ) = address(receipts).call{value: 1 wei}(
            abi.encodeCall(
                ProofEraTestnetHireReceipt.hire,
                (
                    AGENT_ID,
                    ENGAGEMENT_ID,
                    TASK_HASH,
                    uint64(block.timestamp + 1)
                )
            )
        );

        require(!succeeded, "rejected payment unexpectedly succeeded");
        require(
            receipts.receiptByEngagement(ENGAGEMENT_ID) == bytes32(0),
            "failed payment retained state"
        );
    }

    function testInvalidPaymentAndExpiryAreRejected() public {
        uint64 validExpiry = uint64(block.timestamp + 1 days);
        (bool zeroPayment, ) = address(receipts).call(
            abi.encodeCall(
                ProofEraTestnetHireReceipt.hire,
                (AGENT_ID, ENGAGEMENT_ID, TASK_HASH, validExpiry)
            )
        );
        require(!zeroPayment, "zero payment unexpectedly succeeded");

        (bool excessivePayment, ) = address(receipts).call{
            value: receipts.MAX_PAYMENT_WEI() + 1
        }(
            abi.encodeCall(
                ProofEraTestnetHireReceipt.hire,
                (AGENT_ID, ENGAGEMENT_ID, TASK_HASH, validExpiry)
            )
        );
        require(!excessivePayment, "excessive payment unexpectedly succeeded");

        (bool staleExpiry, ) = address(receipts).call{value: 1 wei}(
            abi.encodeCall(
                ProofEraTestnetHireReceipt.hire,
                (AGENT_ID, ENGAGEMENT_ID, TASK_HASH, uint64(block.timestamp))
            )
        );
        require(!staleExpiry, "stale expiry unexpectedly succeeded");

        (bool longExpiry, ) = address(receipts).call{value: 1 wei}(
            abi.encodeCall(
                ProofEraTestnetHireReceipt.hire,
                (
                    AGENT_ID,
                    ENGAGEMENT_ID,
                    TASK_HASH,
                    uint64(
                        block.timestamp +
                            receipts.MAX_HIRE_DURATION_SECONDS() +
                            1
                    )
                )
            )
        );
        require(!longExpiry, "long expiry unexpectedly succeeded");
    }

    function testDeploymentOutsideBscTestnetIsRejected() public {
        vm.chainId(56);

        try new ProofEraTestnetHireReceipt(address(registry)) returns (
            ProofEraTestnetHireReceipt
        ) {
            revert("non-97 deployment unexpectedly succeeded");
        } catch (bytes memory reason) {
            require(
                keccak256(reason) ==
                    keccak256(
                        abi.encodeWithSelector(
                            ProofEraTestnetHireReceipt.UnsupportedChain.selector,
                            uint256(56)
                        )
                    ),
                "unexpected unsupported-chain error"
            );
        }
    }
}
