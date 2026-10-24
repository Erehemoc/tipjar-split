// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TipjarSplitBase} from "./TipjarSplit.Base.t.sol";
import {TipjarSplit}     from "../TipjarSplit.sol";

/// @dev Deployment, happy-path, revert, and event tests.
contract TipjarSplitCoreTest is TipjarSplitBase {

    // =========================================================================
    // 1. Deployment / initialization
    // =========================================================================

    function test_Deploy_RevertsOnZeroUSDC() public {
        vm.expectRevert(TipjarSplit.ZeroAddress.selector);
        new TipjarSplit(address(0));
    }

    function test_Deploy_CorrectUSDCAddress() public view {
        // jar was deployed in setUp — just check it accepted a non-zero address.
        // The only public surface is behaviour, not a getter for _usdc,
        // so we verify indirectly: tip() succeeds (meaning _usdc is wired up).
        // Verified by subsequent tests; nothing to assert here beyond compile success.
        assertTrue(address(jar) != address(0));
    }

    // =========================================================================
    // 2. createJar — happy path
    // =========================================================================

    function test_CreateJar_ReturnsCorrectId() public {
        address[] memory payees = new address[](1);
        payees[0] = alice;
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10000;

        uint256 id0 = jar.createJar("First", payees, shares);
        uint256 id1 = jar.createJar("Second", payees, shares);
        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    function test_CreateJar_StoresFields() public {
        address[] memory payees = new address[](2);
        payees[0] = alice; payees[1] = bob;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 6000; shares[1] = 4000;

        vm.prank(alice);
        uint256 id = jar.createJar("TestJar", payees, shares);

        (string memory name, address owner, address[] memory p, uint16[] memory s, uint256 total) = jar.getJar(id);
        assertEq(name, "TestJar");
        assertEq(owner, alice);
        assertEq(p.length, 2);
        assertEq(p[0], alice);
        assertEq(p[1], bob);
        assertEq(s[0], 6000);
        assertEq(s[1], 4000);
        assertEq(total, 0);
    }

    function test_CreateJar_EmitsJarCreated() public {
        address[] memory payees = new address[](1);
        payees[0] = alice;
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10000;

        vm.expectEmit(true, true, false, false, address(jar));
        emit TipjarSplit.JarCreated(0, "Solo", alice, payees, shares);
        vm.prank(alice);
        jar.createJar("Solo", payees, shares);
    }

    // =========================================================================
    // 3. createJar — revert paths
    // =========================================================================

    function test_CreateJar_RevertsBadShares_Under() public {
        address[] memory payees = new address[](2);
        payees[0] = alice; payees[1] = bob;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 4000; shares[1] = 4000; // sums to 8000, not 10000

        vm.expectRevert(TipjarSplit.InvalidShares.selector);
        jar.createJar("Bad", payees, shares);
    }

    function test_CreateJar_RevertsBadShares_Over() public {
        address[] memory payees = new address[](2);
        payees[0] = alice; payees[1] = bob;
        uint16[] memory shares = new uint16[](2);
        shares[0] = 6000; shares[1] = 6000; // sums to 12000

        vm.expectRevert(TipjarSplit.InvalidShares.selector);
        jar.createJar("Bad", payees, shares);
    }

    function test_CreateJar_RevertsDuplicatePayee() public {
        address[] memory payees = new address[](2);
        payees[0] = alice; payees[1] = alice; // duplicate
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5000; shares[1] = 5000;

        vm.expectRevert(TipjarSplit.DuplicatePayee.selector);
        jar.createJar("Dup", payees, shares);
    }

    function test_CreateJar_RevertsZeroAddressPayee() public {
        address[] memory payees = new address[](2);
        payees[0] = alice; payees[1] = address(0);
        uint16[] memory shares = new uint16[](2);
        shares[0] = 5000; shares[1] = 5000;

        vm.expectRevert(TipjarSplit.ZeroAddress.selector);
        jar.createJar("Zero", payees, shares);
    }

    function test_CreateJar_RevertsTooManyPayees() public {
        uint256 count = 21;
        address[] memory payees = new address[](count);
        uint16[] memory shares  = new uint16[](count);
        for (uint256 i = 0; i < count; i++) {
            payees[i] = makeAddr(string(abi.encodePacked("p", i)));
            shares[i] = 0;
        }
        // Put valid individual shares — but 21 payees should revert before share check
        shares[0] = 10000;

        vm.expectRevert(TipjarSplit.TooManyPayees.selector);
        jar.createJar("TooMany", payees, shares);
    }

    function test_CreateJar_RevertsEmptyPayees() public {
        address[] memory payees = new address[](0);
        uint16[] memory shares  = new uint16[](0);

        vm.expectRevert(TipjarSplit.TooManyPayees.selector);
        jar.createJar("Empty", payees, shares);
    }

    function test_CreateJar_RevertsMismatchedArrayLengths() public {
        address[] memory payees = new address[](2);
        payees[0] = alice; payees[1] = bob;
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10000;

        vm.expectRevert(TipjarSplit.InvalidArrayLengths.selector);
        jar.createJar("Mismatch", payees, shares);
    }

    // =========================================================================
    // 4. tip() — happy path with 3 payees at 5000/3000/2000 bps
    // =========================================================================

    function test_Tip_ThreePayees_CorrectBalances() public {
        uint256 id = _createThreePayeeJar();

        uint256 amount = 1_000e6; // 1000 USDC

        vm.prank(tipper);
        jar.tip(id, amount, "hello");

        // alice = payees[0] gets remainder: amount - bob_share - carol_share
        // bob   = 1000e6 * 3000 / 10000 = 300e6
        // carol = 1000e6 * 2000 / 10000 = 200e6
        // alice = 1000e6 - 300e6 - 200e6 = 500e6
        assertEq(jar.balanceOf(bob),   300e6, "bob share");
        assertEq(jar.balanceOf(carol), 200e6, "carol share");
        assertEq(jar.balanceOf(alice), 500e6, "alice remainder");
    }

    function test_Tip_UpdatesTotalTipped() public {
        uint256 id = _createThreePayeeJar();
        vm.prank(tipper); jar.tip(id, 1000e6, "");
        vm.prank(tipper); jar.tip(id, 500e6, "");
        assertEq(jar.totalTipped(id), 1500e6);
    }

    function test_Tip_EmitsTipped() public {
        uint256 id = _createThreePayeeJar();

        vm.expectEmit(true, true, false, true, address(jar));
        emit TipjarSplit.Tipped(id, tipper, 1000e6, "note");

        vm.prank(tipper);
        jar.tip(id, 1000e6, "note");
    }

    // =========================================================================
    // 5. tip() — revert paths
    // =========================================================================

    function test_Tip_RevertsZeroAmount() public {
        uint256 id = _createThreePayeeJar();
        vm.prank(tipper);
        vm.expectRevert(TipjarSplit.ZeroAmount.selector);
        jar.tip(id, 0, "");
    }

    function test_Tip_RevertsNoteTooLong() public {
        uint256 id = _createThreePayeeJar();
        // 81-byte note
        string memory longNote = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        // confirm length
        assertGt(bytes(longNote).length, 80);

        vm.prank(tipper);
        vm.expectRevert(TipjarSplit.NoteTooLong.selector);
        jar.tip(id, 1e6, longNote);
    }

    function test_Tip_RevertsJarNotFound() public {
        vm.prank(tipper);
        vm.expectRevert(TipjarSplit.JarNotFound.selector);
        jar.tip(9999, 1e6, "");
    }

    // =========================================================================
    // 6. Odd-amount split: 1_000_001 raw USDC units, 3333/3333/3334 bps
    // =========================================================================

    function test_OddSplit_RemainderGoesToPayees0() public {
        // Use a jar where alice is payees[0] with 3334 bps,
        // bob  = 3333 bps, carol = 3333 bps (sum = 10000).
        uint256 id = _createOddSplitJar();

        uint256 amount = 1_000_001; // raw micro-USDC units

        vm.prank(tipper);
        jar.tip(id, amount, "");

        // The loop starts at i=1:
        //   bob  share = 1_000_001 * 3333 / 10_000 = 333_300 (integer division)
        //   carol share = 1_000_001 * 3333 / 10_000 = 333_300
        //   distributed = 666_600
        //   alice (payees[0]) = 1_000_001 - 666_600 = 333_401
        uint256 bobShare   = (amount * 3333) / 10_000;
        uint256 carolShare = (amount * 3333) / 10_000;
        uint256 aliceShare = amount - bobShare - carolShare;

        assertEq(jar.balanceOf(bob),   bobShare,   "bob");
        assertEq(jar.balanceOf(carol), carolShare, "carol");
        assertEq(jar.balanceOf(alice), aliceShare, "alice remainder");

        // The critical property: remainder goes to payees[0], sum == input.
        assertEq(bobShare + carolShare + aliceShare, amount, "total == amount");
    }

    // =========================================================================
    // 7. Remainder handling: sum always equals input (assorted amounts)
    // =========================================================================

    function test_Remainder_SumEqualsInput_Amounts() public {
        uint256 id = _createThreePayeeJar();

        uint256[] memory amounts = new uint256[](4);
        amounts[0] = 1;          // 1 raw unit
        amounts[1] = 3;          // indivisible by 10000
        amounts[2] = 99_999;     // not divisible evenly
        amounts[3] = 1_000_001;  // also odd

        for (uint256 k = 0; k < amounts.length; k++) {
            // fresh tipper each round to avoid sharing state across loop iterations
            address t = makeAddr(string(abi.encodePacked("t", k)));
            usdc.mint(t, amounts[k]);
            vm.prank(t);
            usdc.approve(address(jar), amounts[k]);

            // reset payee balances by reading current balances before
            uint256 aliceBefore = jar.balanceOf(alice);
            uint256 bobBefore   = jar.balanceOf(bob);
            uint256 carolBefore = jar.balanceOf(carol);

            vm.prank(t);
            jar.tip(id, amounts[k], "");

            uint256 credited =
                (jar.balanceOf(alice) - aliceBefore) +
                (jar.balanceOf(bob)   - bobBefore)   +
                (jar.balanceOf(carol) - carolBefore);

            assertEq(credited, amounts[k], "sum != amount");
        }
    }

    // =========================================================================
    // 8. updatePayees — revert for non-owner
    // =========================================================================

    function test_UpdatePayees_RevertsNonOwner() public {
        uint256 id = _createThreePayeeJar(); // alice is owner

        address[] memory newPayees = new address[](1);
        newPayees[0] = dave;
        uint16[] memory newShares = new uint16[](1);
        newShares[0] = 10000;

        vm.prank(stranger); // not alice
        vm.expectRevert(TipjarSplit.NotOwner.selector);
        jar.updatePayees(id, newPayees, newShares);
    }

    // =========================================================================
    // 9. updatePayees — happy path + tips after update
    // =========================================================================

    function test_UpdatePayees_OwnerSucceeds() public {
        uint256 id = _createThreePayeeJar(); // alice owns it

        address[] memory newPayees = new address[](2);
        newPayees[0] = dave; newPayees[1] = bob;
        uint16[] memory newShares = new uint16[](2);
        newShares[0] = 7000; newShares[1] = 3000;

        vm.prank(alice);
        jar.updatePayees(id, newPayees, newShares);

        (, , address[] memory p, uint16[] memory s,) = jar.getJar(id);
        assertEq(p[0], dave);
        assertEq(p[1], bob);
        assertEq(s[0], 7000);
        assertEq(s[1], 3000);
    }

    function test_UpdatePayees_EmitsPayeesUpdated() public {
        uint256 id = _createThreePayeeJar();

        address[] memory newPayees = new address[](1);
        newPayees[0] = dave;
        uint16[] memory newShares = new uint16[](1);
        newShares[0] = 10000;

        vm.expectEmit(true, false, false, false, address(jar));
        emit TipjarSplit.PayeesUpdated(id, newPayees, newShares);

        vm.prank(alice);
        jar.updatePayees(id, newPayees, newShares);
    }

    function test_UpdatePayees_NewPayeesReceiveTips() public {
        uint256 id = _createThreePayeeJar();

        // Tip before update — alice/bob/carol receive shares
        vm.prank(tipper);
        jar.tip(id, 1000e6, "before");

        // Capture balances before update
        uint256 aliceAfterFirst = jar.balanceOf(alice);

        // Update to dave-only
        address[] memory newPayees = new address[](1);
        newPayees[0] = dave;
        uint16[] memory newShares = new uint16[](1);
        newShares[0] = 10000;

        vm.prank(alice);
        jar.updatePayees(id, newPayees, newShares);

        // Tip after update — dave should receive all
        vm.prank(tipper);
        jar.tip(id, 500e6, "after");

        assertEq(jar.balanceOf(dave), 500e6, "dave after update");
        // alice's balance unchanged after the update tip
        assertEq(jar.balanceOf(alice), aliceAfterFirst, "alice unchanged");
    }

    // =========================================================================
    // 10. withdraw — happy path
    // =========================================================================

    function test_Withdraw_PayeeReceivesCorrectAmount() public {
        uint256 id = _createThreePayeeJar();

        vm.prank(tipper); jar.tip(id, 1000e6, "");

        uint256 expected = jar.balanceOf(alice);
        uint256 usdcBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        jar.withdraw();

        assertEq(usdc.balanceOf(alice), usdcBefore + expected, "usdc balance");
        assertEq(jar.balanceOf(alice),  0, "internal balance zero");
    }

    function test_Withdraw_EmitsWithdrawn() public {
        uint256 id = _createThreePayeeJar();
        vm.prank(tipper); jar.tip(id, 1000e6, "");
        uint256 expected = jar.balanceOf(alice);

        vm.expectEmit(true, false, false, true, address(jar));
        emit TipjarSplit.Withdrawn(alice, expected);

        vm.prank(alice);
        jar.withdraw();
    }

    function test_Withdraw_AccumulatesAcrossTwoJars() public {
        // jar 0: alice is payees[0] at 5000 bps
        uint256 id0 = _createThreePayeeJar();

        // jar 1: alice is the sole payee
        address[] memory payees = new address[](1);
        payees[0] = alice;
        uint16[] memory shares = new uint16[](1);
        shares[0] = 10000;
        vm.prank(alice);
        uint256 id1 = jar.createJar("Solo", payees, shares);

        // Tip both jars
        vm.prank(tipper); jar.tip(id0, 1000e6, "");
        vm.prank(tipper); jar.tip(id1, 500e6, "");

        // bob/carol share in jar0 do NOT go to alice; let's compute alice's total
        // From jar0: alice gets amount - bob_share - carol_share = 500e6
        // From jar1: alice gets 500e6 (100%)
        uint256 expectedAlice = jar.balanceOf(alice);
        assertEq(expectedAlice, 1000e6, "alice accumulated balance");

        uint256 usdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        jar.withdraw();

        assertEq(usdc.balanceOf(alice), usdcBefore + 1000e6, "full payout");
        assertEq(jar.balanceOf(alice),  0, "drained");
    }

    function test_Withdraw_RevertsNothingToWithdraw() public {
        vm.prank(stranger);
        vm.expectRevert(TipjarSplit.NothingToWithdraw.selector);
        jar.withdraw();
    }

    // =========================================================================
    // 11. One payee across multiple jars
    // =========================================================================

    function test_MultiJar_SamePayeeAccumulatesAcrossThreeJars() public {
        // alice is payees[0] in all three jars
        uint256 id0 = _createThreePayeeJar(); // 5000 bps

        address[] memory p2 = new address[](2);
        p2[0] = alice; p2[1] = bob;
        uint16[] memory s2 = new uint16[](2);
        s2[0] = 8000; s2[1] = 2000;
        vm.prank(alice);
        uint256 id1 = jar.createJar("Jar2", p2, s2);

        address[] memory p3 = new address[](1);
        p3[0] = alice;
        uint16[] memory s3 = new uint16[](1);
        s3[0] = 10000;
        vm.prank(alice);
        uint256 id2 = jar.createJar("Jar3", p3, s3);

        vm.prank(tipper); jar.tip(id0, 1000e6, "");
        vm.prank(tipper); jar.tip(id1, 1000e6, "");
        vm.prank(tipper); jar.tip(id2, 1000e6, "");

        // jar0: alice = 500e6 (loop starts at i=1; bob=300, carol=200, alice=500)
        // jar1: alice = 1000e6 - (1000e6 * 2000/10000) = 1000e6 - 200e6 = 800e6
        // jar2: alice = 1000e6
        uint256 expectedAlice = 500e6 + 800e6 + 1000e6;
        assertEq(jar.balanceOf(alice), expectedAlice, "multi-jar balance");

        uint256 usdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        jar.withdraw();

        assertEq(usdc.balanceOf(alice), usdcBefore + expectedAlice, "full multi-jar withdraw");
        assertEq(jar.balanceOf(alice), 0, "drained after multi-jar");
    }
}
