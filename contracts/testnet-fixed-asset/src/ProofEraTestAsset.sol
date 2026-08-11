// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ProofEra Test Asset
/// @notice A non-economic, BSC-testnet-only fixed-supply ERC-20 test asset.
/// @dev The complete supply is minted exactly once during construction. The
/// contract intentionally exposes only the base OpenZeppelin ERC-20 surface.
contract ProofEraTestAsset is ERC20 {
    uint256 private constant BSC_TESTNET_CHAIN_ID = 97;

    /// @dev 1,000,000 PTA with the inherited 18 decimals.
    uint256 private constant FIXED_SUPPLY = 1_000_000 ether;

    error UnsupportedChain(uint256 chainId);
    error ZeroDeploymentRecipient();

    /// @param deploymentRecipient Explicit nonzero recipient of the complete supply.
    constructor(
        address deploymentRecipient
    ) ERC20("ProofEra Test Asset", "PTA") {
        if (block.chainid != BSC_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }
        if (deploymentRecipient == address(0)) {
            revert ZeroDeploymentRecipient();
        }

        _mint(deploymentRecipient, FIXED_SUPPLY);
    }
}
