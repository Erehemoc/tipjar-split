// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TipjarSplitBase} from "./TipjarSplit.Base.t.sol";
import {TipjarSplit}     from "../TipjarSplit.sol";

/// @dev Fuzz and invariant tests for TipjarSplit.
contract TipjarSplitFuzzTest is TipjarSplitBase {

    // =========================================================================
    // Fuzz: tip arbitrary amounts — sum of credited balances == amount
    // =========================================================================

    /// @dev Fuzz tip amounts on the 3-payee jar (5000/3000/2000 bps).
    ///      Property: sum of all payee balance deltas == amount tipped.
    function testFuzz_Tip_SumOfCreditsEqualsAmount(uint96 rawAmount) public {
        // Use uint96 to stay comfortably within mint/approve limits.
        uint256 amount = bound(uint256(rawAmount), 1, 1_000_000e6);

        uint256 id = _createThreePayeeJar();

        // Mint and approve exact amount for a fresh tipper to avoid carry-over.
        address t = makeAddr("fuzzTipper");
        usdc.mint(t, amount);
        vm.prank(t);
        usdc.approve(address(jar), amount);

        uint256 aliceBefore = jar.balanceOf(alice);
        uint256 bobBefore   = jar.balanceOf(bob);
        uint256 carolBefore = jar.balanceOf(carol);

        vm.prank(t);
        jar.tip(id, amount, "fuzz");

        uint256 credited =
            (jar.balanceOf(alice) - aliceBefore) +
            (jar.balanceOf(bob)   - bobBefore)   +
            (jar.balanceOf(carol) - carolBefore);

        assertEq(credited, amount, "sum of credits != tip amount");
    }

    /// @dev Fuzz with a single-payee jar — trivially exact, but confirms no rounding leaks.
    function testFuzz_Tip_SinglePayee_ExactCredit(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000_000e6);

        address[] memory payees = new address[](1);
        payees[0] = alice;
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10000;
        vm.prank(alice);
        uint256 id = jar.createJar("Single", payees, shares);

        address t = makeAddr("fuzzTipper2");
        usdc.mint(t, amount);
        vm.prank(t);
        usdc.approve(address(jar), amount);

        uint256 before = jar.balanceOf(alice);
        vm.prank(t);
        jar.tip(id, amount, "");

        assertEq(jar.balanceOf(alice) - before, amount, "single payee credit != amount");
    }

    /// @dev Fuzz with two equal payees (5000/5000) — remainder always lands on payees[0].
    function testFuzz_Tip_TwoEqualPayees_SumExact(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000_000e6);

        address[] memory payees = new address[](2);
        payees[0] = alice; payees[1] = bob;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5000; shares[1] = 5000;
        vm.prank(alice);
        uint256 id = jar.createJar("TwoEqual", payees, shares);

        address t = makeAddr("fuzzTipper3");
        usdc.mint(t, amount);
        vm.prank(t);
        usdc.approve(address(jar), amount);

        uint256 aliceBefore = jar.balanceOf(alice);
        uint256 bobBefore   = jar.balanceOf(bob);

        vm.prank(t);
        jar.tip(id, amount, "");

        uint256 credited =
            (jar.balanceOf(alice) - aliceBefore) +
            (jar.balanceOf(bob)   - bobBefore);

        assertEq(credited, amount, "two-payee sum mismatch");
    }

    // =========================================================================
    // Fuzz: createJar always reverts when shares != 10000
    // =========================================================================

    function testFuzz_CreateJar_InvalidSharesAlwaysReverts(uint16 a, uint16 b) public {
        // Ensure a + b != 10000 and neither is zero address.
        uint32 sum = uint32(a) + uint32(b);
        vm.assume(sum != 10_000);

        address[] memory payees = new address[](2);
        payees[0] = alice; payees[1] = bob;
        uint16[] memory shares = new uint16[](2);
        shares[0] = a; shares[1] = b;

        vm.expectRevert(TipjarSplit.InvalidShares.selector);
        jar.createJar("Bad", payees, shares);
    }

    // =========================================================================
    // Fuzz: withdraw delivers exactly what was credited
    // =========================================================================

    function testFuzz_Withdraw_DeliversExactBalance(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000_000e6);

        address[] memory payees = new address[](1);
        payees[0] = alice;
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10000;
        vm.prank(alice);
        uint256 id = jar.createJar("WithdrawFuzz", payees, shares);

        address t = makeAddr("fuzzTipper4");
        usdc.mint(t, amount);
        vm.prank(t);
        usdc.approve(address(jar), amount);

        vm.prank(t);
        jar.tip(id, amount, "");

        uint256 credited = jar.balanceOf(alice);
        uint256 usdcBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        jar.withdraw();

        assertEq(usdc.balanceOf(alice) - usdcBefore, credited, "withdraw amount mismatch");
        assertEq(jar.balanceOf(alice), 0, "balance not zeroed");
    }
}
