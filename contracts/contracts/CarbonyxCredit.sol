pragma solidity ^0.8.24;

import "./CarbonyxProjectRegistry.sol";

contract CarbonyxCredit {
    string public constant name = "Carbonyx Blue Carbon Credit";
    string public constant symbol = "CBX";
    uint8 public constant decimals = 0;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    CarbonyxProjectRegistry public immutable registry;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event CreditsMinted(
        uint256 indexed projectId,
        address indexed to,
        uint256 amount,
        string reportHash
    );
    event CreditsRetired(address indexed account, uint256 amount, string reason);

    constructor(address registry_) {
        registry = CarbonyxProjectRegistry(registry_);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        public returns (bool)
    {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "credit: allowance exceeded");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function mintProjectCredits(
        uint256 projectId,
        uint256 amount,
        string calldata reportHash
    ) external {
        CarbonyxProjectRegistry.Project memory p = registry.projects(projectId);
        require(p.id != 0, "credit: unknown project");
        require(
            p.status == CarbonyxProjectRegistry.Status.Verified,
            "credit: project not verified"
        );
        require(p.creditsMinted == 0, "credit: credits already minted");
        require(msg.sender == p.owner, "credit: only the project owner");
        require(amount > 0, "credit: zero amount");

        registry.recordMint(projectId, amount);
        _mint(p.owner, amount);
        emit CreditsMinted(projectId, p.owner, amount, reportHash);
    }

    /
    function retire(uint256 amount, string calldata reason) external {
        require(balanceOf[msg.sender] >= amount, "credit: insufficient balance");
        totalSupply -= amount;
        balanceOf[msg.sender] -= amount;
        emit Transfer(msg.sender, address(0), amount);
        emit CreditsRetired(msg.sender, amount, reason);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "credit: zero address");
        require(balanceOf[from] >= amount, "credit: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "credit: zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
