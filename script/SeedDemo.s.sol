// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockMezoVault} from "../src/mocks/MockMezoVault.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {RemittanceVault} from "../src/RemittanceVault.sol";

/// @title SeedDemo
/// @notice Creates sample remittance orders in varied states for demo purposes.
contract SeedDemo is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address btcAddr   = vm.envAddress("BTC_ADDR");
        address musdAddr  = vm.envAddress("MUSD_ADDR");
        address mezoAddr  = vm.envAddress("MEZO_ADDR");
        address vaultAddr = vm.envAddress("VAULT_ADDR");
        address recipientA = vm.envAddress("RECIPIENT_A");

        MockERC20 btc = MockERC20(btcAddr);
        MockERC20 musd = MockERC20(musdAddr);
        MockMezoVault mezo = MockMezoVault(mezoAddr);
        RemittanceVault vault = RemittanceVault(vaultAddr);

        vm.startBroadcast(pk);

        // make sure deployer has BTC
        btc.mint(deployer, 1 ether);
        btc.approve(address(vault), type(uint256).max);

        // Order A: healthy (180% CR → use 0.03 BTC for 1000 MUSD at $60k)
        bytes32 pinA = keccak256(abi.encodePacked(uint256(111111)));
        bytes32 idA = vault.createRemittance(recipientA, 1_000 ether, 0.03 ether, pinA, 3 days);

        // Order B: warning (create with same params then drop price)
        bytes32 pinB = keccak256(abi.encodePacked(uint256(222222)));
        bytes32 idB = vault.createRemittance(recipientA, 500 ether, 0.015 ether, pinB, 3 days);
        mezo.setBtcPrice(50_000 ether); // small price drop

        // Order C: claimed
        bytes32 pinC = keccak256(abi.encodePacked(uint256(333333)));
        bytes32 idC = vault.createRemittance(recipientA, 200 ether, 0.01 ether, pinC, 3 days);

        vm.stopBroadcast();

        // Recipient claims order C via separate broadcast key if available
        // (left manual for the demo operator)

        console2.log("Seeded orders:");
        console2.logBytes32(idA);
        console2.logBytes32(idB);
        console2.logBytes32(idC);
        console2.log("PINs (int): 111111 / 222222 / 333333");
    }
}
