// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolSeeder} from "../test/utils/PoolSeeder.sol";

contract RecoverSeed is Script {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address seederAddr = vm.envAddress("SEEDER_ADDRESS");

        PoolSeeder seeder = PoolSeeder(payable(seederAddr));

        console.log("Seeder:", seederAddr);
        console.log("Seeded:", seeder.seeded());

        vm.startBroadcast(deployerPrivateKey);

        if (seeder.seeded()) {
            seeder.removeSeed();
            console.log("Seed liquidity removed");
        }

        seeder.withdraw(address(0)); // ETH
        seeder.withdraw(USDC);       // USDC
        console.log("Funds recovered");

        vm.stopBroadcast();
    }
}
