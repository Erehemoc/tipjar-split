// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TipjarSplit} from "../TipjarSplit.sol";
import {MockERC20}   from "../test-helpers/MockERC20.sol";

/// @dev Shared fixtures for all TipjarSplit test categories.
abstract contract TipjarSplitBase is Test {

    // ── actors ───────────────────────────────────────────────────────────────
    address internal alice   = makeAddr("alice");
    address internal bob     = makeAddr("bob");
    address internal carol   = makeAddr("carol");
    address internal dave    = makeAddr("dave");
    address internal tipper  = makeAddr("tipper");
    address internal stranger = makeAddr("stranger");

    // ── contracts ────────────────────────────────────────────────────────────
    MockERC20    internal usdc;
    TipjarSplit  internal jar;

    // ── helpers ──────────────────────────────────────────────────────────────
    uint256 internal constant MINT_AMOUNT = 1_000_000e6; // 1 M USDC

    function setUp() public virtual {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        jar  = new TipjarSplit(address(usdc));

        // Give tipper a large balance and approve the contract.
        usdc.mint(tipper, MINT_AMOUNT);
        vm.prank(tipper);
        usdc.approve(address(jar), type(uint256).max);
    }

    // ── shared helpers ───────────────────────────────────────────────────────

    /// Build a simple 3-payee jar (alice/bob/carol at 5000/3000/2000 bps).
    function _createThreePayeeJar() internal returns (uint256 jarId) {
        address[] memory payees = new address[](3);
        payees[0] = alice; payees[1] = bob; payees[2] = carol;

        uint16[] memory shares = new uint16[](3);
        shares[0] = 5000; shares[1] = 3000; shares[2] = 2000;

        vm.prank(alice); // alice owns this jar
        jarId = jar.createJar("Alpha", payees, shares);
    }

    /// Build an equal 3-payee jar (3333/3333/3334 bps).
    function _createOddSplitJar() internal returns (uint256 jarId) {
        address[] memory payees = new address[](3);
        payees[0] = alice; payees[1] = bob; payees[2] = carol;

        uint16[] memory shares = new uint16[](3);
        shares[0] = 3334; shares[1] = 3333; shares[2] = 3333;

        vm.prank(alice);
        jarId = jar.createJar("OddSplit", payees, shares);
    }
}
