// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ProofEraTestAsset} from "../src/ProofEraTestAsset.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface Vm {
    function chainId(uint256 newChainId) external;
}

contract AllowanceSpender {
    function spend(
        ProofEraTestAsset asset,
        address owner,
        address recipient,
        uint256 amount
    ) external returns (bool) {
        return asset.transferFrom(owner, recipient, amount);
    }
}

contract ProofEraTestAssetTest {
    Vm private constant vm = Vm(
        address(uint160(uint256(keccak256("hevm cheat code"))))
    );

    uint256 private constant FIXED_SUPPLY = 1_000_000 ether;
    address private constant RECIPIENT = address(0xBEEF);

    ProofEraTestAsset private asset;
    AllowanceSpender private spender;

    function setUp() public {
        vm.chainId(97);
        asset = new ProofEraTestAsset(address(this));
        spender = new AllowanceSpender();
    }

    function testMetadataAndFixedSupplyAreExact() public view {
        require(
            keccak256(bytes(asset.name())) ==
                keccak256(bytes("ProofEra Test Asset")),
            "unexpected name"
        );
        require(
            keccak256(bytes(asset.symbol())) == keccak256(bytes("PTA")),
            "unexpected symbol"
        );
        require(asset.decimals() == 18, "unexpected decimals");
        require(asset.totalSupply() == FIXED_SUPPLY, "unexpected total supply");
        require(
            asset.balanceOf(address(this)) == FIXED_SUPPLY,
            "recipient did not receive supply"
        );
    }

    function testSupplyGoesOnlyToExplicitRecipient() public {
        address explicitRecipient = address(0xCAFE);
        ProofEraTestAsset recipientBoundAsset = new ProofEraTestAsset(
            explicitRecipient
        );

        require(
            recipientBoundAsset.balanceOf(explicitRecipient) == FIXED_SUPPLY,
            "explicit recipient did not receive supply"
        );
        require(
            recipientBoundAsset.balanceOf(address(this)) == 0,
            "deployer unexpectedly received supply"
        );
        require(
            recipientBoundAsset.totalSupply() == FIXED_SUPPLY,
            "unexpected total supply"
        );
    }

    function testZeroDeploymentRecipientIsRejected() public {
        try new ProofEraTestAsset(address(0)) returns (ProofEraTestAsset) {
            revert("zero deployment recipient unexpectedly succeeded");
        } catch (bytes memory reason) {
            require(
                keccak256(reason) ==
                    keccak256(
                        abi.encodeWithSelector(
                            ProofEraTestAsset.ZeroDeploymentRecipient.selector
                        )
                    ),
                "unexpected zero-recipient error"
            );
        }
    }

    function testDeploymentOutsideBscTestnetIsRejected() public {
        vm.chainId(56);

        try new ProofEraTestAsset(address(this)) returns (ProofEraTestAsset) {
            revert("non-97 deployment unexpectedly succeeded");
        } catch (bytes memory reason) {
            require(
                keccak256(reason) ==
                    keccak256(
                        abi.encodeWithSelector(
                            ProofEraTestAsset.UnsupportedChain.selector,
                            uint256(56)
                        )
                    ),
                "unexpected unsupported-chain error"
            );
        }
    }

    function testTransferHasNoFeeAndCannotChangeSupply() public {
        uint256 amount = 12_345 ether;

        require(asset.transfer(RECIPIENT, amount), "transfer failed");
        require(
            asset.balanceOf(RECIPIENT) == amount,
            "recipient must receive exact amount"
        );
        require(
            asset.balanceOf(address(this)) == FIXED_SUPPLY - amount,
            "sender debit mismatch"
        );
        require(asset.totalSupply() == FIXED_SUPPLY, "transfer changed supply");
    }

    function testFuzzTransferHasNoFee(uint256 seed) public {
        uint256 amount = seed % (FIXED_SUPPLY + 1);

        require(asset.transfer(RECIPIENT, amount), "transfer failed");
        require(
            asset.balanceOf(RECIPIENT) == amount,
            "recipient must receive exact amount"
        );
        require(
            asset.balanceOf(address(this)) == FIXED_SUPPLY - amount,
            "sender debit mismatch"
        );
        require(asset.totalSupply() == FIXED_SUPPLY, "transfer changed supply");
    }

    function testAllowanceSpendDebitsExactAmount() public {
        uint256 allowanceAmount = 500 ether;
        uint256 spendAmount = 125 ether;

        require(
            asset.approve(address(spender), allowanceAmount),
            "approval failed"
        );
        require(
            spender.spend(asset, address(this), RECIPIENT, spendAmount),
            "transferFrom failed"
        );
        require(
            asset.balanceOf(RECIPIENT) == spendAmount,
            "recipient credit mismatch"
        );
        require(
            asset.balanceOf(address(this)) == FIXED_SUPPLY - spendAmount,
            "owner debit mismatch"
        );
        require(
            asset.allowance(address(this), address(spender)) ==
                allowanceAmount - spendAmount,
            "allowance debit mismatch"
        );
        require(
            asset.totalSupply() == FIXED_SUPPLY,
            "transferFrom changed supply"
        );
    }

    function testMaximumAllowanceIsNotDecremented() public {
        require(
            asset.approve(address(spender), type(uint256).max),
            "approval failed"
        );
        require(
            spender.spend(asset, address(this), RECIPIENT, 1 ether),
            "transferFrom failed"
        );
        require(
            asset.allowance(address(this), address(spender)) ==
                type(uint256).max,
            "maximum allowance changed"
        );
    }

    function testApprovalCanBeOverwrittenAndCleared() public {
        require(
            asset.approve(address(spender), 10 ether),
            "initial approval failed"
        );
        require(
            asset.approve(address(spender), 3 ether),
            "replacement approval failed"
        );
        require(
            asset.allowance(address(this), address(spender)) == 3 ether,
            "overwrite failed"
        );
        require(asset.approve(address(spender), 0), "clear approval failed");
        require(
            asset.allowance(address(this), address(spender)) == 0,
            "allowance not cleared"
        );
    }

    function testInsufficientAllowanceRevertsWithoutStateChange() public {
        require(asset.approve(address(spender), 1 ether), "approval failed");

        (bool succeeded, ) = address(spender).call(
            abi.encodeCall(
                AllowanceSpender.spend,
                (asset, address(this), RECIPIENT, 2 ether)
            )
        );

        require(!succeeded, "overspend must revert");
        require(asset.balanceOf(RECIPIENT) == 0, "recipient balance changed");
        require(
            asset.balanceOf(address(this)) == FIXED_SUPPLY,
            "owner balance changed"
        );
        require(
            asset.allowance(address(this), address(spender)) == 1 ether,
            "allowance changed"
        );
    }

    function testTransferToZeroAddressRevertsWithoutBurning() public {
        (bool succeeded, ) = address(asset).call(
            abi.encodeCall(IERC20.transfer, (address(0), 1 ether))
        );

        require(!succeeded, "zero-address transfer must revert");
        require(asset.totalSupply() == FIXED_SUPPLY, "supply changed");
        require(
            asset.balanceOf(address(this)) == FIXED_SUPPLY,
            "balance changed"
        );
    }
}
