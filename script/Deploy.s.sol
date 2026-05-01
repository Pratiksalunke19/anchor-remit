// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockMezoVault} from "../src/mocks/MockMezoVault.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {RemittanceVault} from "../src/RemittanceVault.sol";

/// @title Deploy
/// @notice Deploys the full stack (testnet: including mocks) and writes
///         the addresses to `deployments/matsnet.json`.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // 1. Mock BTC + MUSD tokens (testnet only)
        MockERC20 btc = new MockERC20("Test BTC", "tBTC", 18);
        MockERC20 musd = new MockERC20("Mezo USD", "MUSD", 18);

        // 2. Mock Mezo Vault
        MockMezoVault mezo = new MockMezoVault(address(musd), address(btc));

        // 3. Insurance Pool
        InsurancePool pool = new InsurancePool(address(musd));

        // 4. Remittance Vault
        RemittanceVault vault = new RemittanceVault(address(mezo), address(pool));
        pool.setVault(address(vault));

        // 5. Seed InsurancePool with 10,000 test MUSD
        musd.mint(deployer, 10_000 ether);
        musd.approve(address(pool), 10_000 ether);
        pool.deposit(10_000 ether);

        // 6. Give deployer 10 tBTC to play with
        btc.mint(deployer, 10 ether);

        vm.stopBroadcast();

        _writeDeployments(
            address(btc),
            address(musd),
            address(mezo),
            address(pool),
            address(vault)
        );

        console2.log("== Deployment Complete ==");
        console2.log("tBTC         :", address(btc));
        console2.log("MUSD         :", address(musd));
        console2.log("MockMezoVault:", address(mezo));
        console2.log("InsurancePool:", address(pool));
        console2.log("RemittanceVault:", address(vault));
    }

    function _writeDeployments(
        address btc,
        address musd,
        address mezo,
        address pool,
        address vault
    ) internal {
        string memory json = string.concat(
            "{\n",
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "btc": "', vm.toString(btc), '",\n',
            '  "musd": "', vm.toString(musd), '",\n',
            '  "mezoVault": "', vm.toString(mezo), '",\n',
            '  "insurancePool": "', vm.toString(pool), '",\n',
            '  "remittanceVault": "', vm.toString(vault), '"\n',
            "}\n"
        );
        vm.writeFile("deployments/matsnet.json", json);
    }
}
