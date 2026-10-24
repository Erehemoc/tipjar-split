// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TipjarSplit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Jar {
        string name;
        address owner;
        address[] payees;
        uint16[] sharesBps;
        uint256 totalTipped;
    }

    error NotOwner();
    error ZeroAmount();
    error NoteTooLong();
    error JarNotFound();
    error InvalidShares();
    error ZeroAddress();
    error DuplicatePayee();
    error TooManyPayees();
    error InvalidArrayLengths();
    error NothingToWithdraw();

    event JarCreated(uint256 indexed jarId, string name, address indexed owner, address[] payees, uint16[] sharesBps);
    event PayeesUpdated(uint256 indexed jarId, address[] payees, uint16[] sharesBps);
    event Tipped(uint256 indexed jarId, address indexed tipper, uint256 amount, string note);
    event Withdrawn(address indexed payee, uint256 amount);

    IERC20 private immutable _usdc;

    mapping(uint256 => Jar) private _jars;
    uint256 private _nextJarId;
    mapping(address => uint256) private _balances;

    constructor(address _usdcAddress) {
        if (_usdcAddress == address(0)) revert ZeroAddress();
        _usdc = IERC20(_usdcAddress);
    }

    function createJar(
        string calldata name,
        address[] calldata payees,
        uint16[] calldata sharesBps
    ) external returns (uint256 jarId) {
        _validatePayeesAndShares(payees, sharesBps);

        jarId = _nextJarId;
        _nextJarId = jarId + 1;

        Jar storage jar = _jars[jarId];
        jar.name = name;
        jar.owner = msg.sender;
        jar.payees = payees;
        jar.sharesBps = sharesBps;

        emit JarCreated(jarId, name, msg.sender, payees, sharesBps);
    }

    function updatePayees(uint256 jarId, address[] calldata payees, uint16[] calldata sharesBps) external {
        Jar storage jar = _jars[jarId];
        if (jar.owner != msg.sender) revert NotOwner();

        _validatePayeesAndShares(payees, sharesBps);

        jar.payees = payees;
        jar.sharesBps = sharesBps;

        emit PayeesUpdated(jarId, payees, sharesBps);
    }

    function tip(uint256 jarId, uint256 amount, string calldata note) external {
        if (amount == 0) revert ZeroAmount();
        if (bytes(note).length > 80) revert NoteTooLong();

        Jar storage jar = _jars[jarId];
        if (jar.owner == address(0)) revert JarNotFound();

        _usdc.safeTransferFrom(msg.sender, address(this), amount);

        address[] storage payees = jar.payees;
        uint16[] storage sharesBps = jar.sharesBps;

        uint256 distributed = 0;
        uint256 payeeCount = payees.length;

        for (uint256 i = 1; i < payeeCount; ++i) {
            uint256 credit = (amount * uint256(sharesBps[i])) / 10_000;
            _balances[payees[i]] += credit;
            distributed += credit;
        }

        _balances[payees[0]] += amount - distributed;
        jar.totalTipped += amount;

        emit Tipped(jarId, msg.sender, amount, note);
    }

    function withdraw() external nonReentrant {
        uint256 balance = _balances[msg.sender];
        if (balance == 0) revert NothingToWithdraw();

        _balances[msg.sender] = 0;
        _usdc.safeTransfer(msg.sender, balance);

        emit Withdrawn(msg.sender, balance);
    }

    function getJar(
        uint256 jarId
    )
        external
        view
        returns (
            string memory name,
            address owner,
            address[] memory payees,
            uint16[] memory sharesBps,
            uint256 totalTippedAmount
        )
    {
        Jar storage jar = _jars[jarId];
        return (jar.name, jar.owner, jar.payees, jar.sharesBps, jar.totalTipped);
    }

    function balanceOf(address payee) external view returns (uint256) {
        return _balances[payee];
    }

    function totalTipped(uint256 jarId) external view returns (uint256) {
        return _jars[jarId].totalTipped;
    }

    function _validatePayeesAndShares(address[] calldata payees, uint16[] calldata sharesBps) private pure {
        uint256 length = payees.length;
        if (length != sharesBps.length) revert InvalidArrayLengths();
        if (length == 0 || length > 20) revert TooManyPayees();

        uint256 totalShares = 0;

        for (uint256 i = 0; i < length; ++i) {
            address payee = payees[i];
            if (payee == address(0)) revert ZeroAddress();

            for (uint256 j = i + 1; j < length; ++j) {
                if (payee == payees[j]) revert DuplicatePayee();
            }

            totalShares += sharesBps[i];
        }

        if (totalShares != 10_000) revert InvalidShares();
    }
}
