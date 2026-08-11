// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.36;

// These imports compile the exact retained official interface bytes. Their
// artifacts independently cross-check the parser/encoder used by the offline plan.
import {IPoolInitializer} from "../vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-periphery/contracts/interfaces/IPoolInitializer.sol";
import {IPancakeV3Factory} from "../vendor/pancake-v3/ffa4fb2cef38cf4769ff88e1cc5551c4af4f6c57/projects/v3-core/contracts/interfaces/IPancakeV3Factory.sol";

/// @dev Narrow pool reads required after resolving the pool from the factory.
interface IPancakeV3PoolPreparation {
    function factory() external view returns (address);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function fee() external view returns (uint24);

    function tickSpacing() external view returns (int24);

    function liquidity() external view returns (uint128);

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint32 feeProtocol,
            bool unlocked
        );
}
