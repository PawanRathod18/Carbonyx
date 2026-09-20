pragma solidity ^0.8.24;

contract CarbonyxProjectRegistry {
    enum Status { Pending, Verified, Rejected }

    struct Project {
        uint256 id;
        string name;
        string ecosystem;
        string country;
        string bounds;
        uint256 areaHa;
        address owner;
        Status status;
        string reportHash;
        uint256 verifiedAt;
        uint256 creditsMinted;
    }

    address public admin;
    address public creditContract;
    uint256 public projectCount;

    mapping(uint256 => Project) private _projects;
    mapping(address => bool) public verifiers;

    event ProjectRegistered(uint256 indexed id, string name, address indexed owner);
    event ProjectVerified(uint256 indexed id, address indexed verifier, string reportHash);
    event ProjectRejected(uint256 indexed id, address indexed verifier, string reason);

    modifier onlyAdmin() {
        require(msg.sender == admin, "registry: admin only");
        _;
    }

    modifier onlyVerifier() {
        require(verifiers[msg.sender], "registry: verifier only");
        _;
    }

    modifier onlyCredit() {
        require(msg.sender == creditContract, "registry: credit contract only");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setCreditContract(address credit) external onlyAdmin {
        creditContract = credit;
    }

    function grantVerifier(address verifier) external onlyAdmin {
        verifiers[verifier] = true;
    }

    function revokeVerifier(address verifier) external onlyAdmin {
        verifiers[verifier] = false;
    }

    function registerProject(
        string calldata name,
        string calldata ecosystem,
        string calldata country,
        string calldata bounds,
        uint256 areaHa
    ) external returns (uint256) {
        projectCount += 1;
        _projects[projectCount] = Project({
            id: projectCount,
            name: name,
            ecosystem: ecosystem,
            country: country,
            bounds: bounds,
            areaHa: areaHa,
            owner: msg.sender,
            status: Status.Pending,
            reportHash: "",
            verifiedAt: 0,
            creditsMinted: 0
        });
        emit ProjectRegistered(projectCount, name, msg.sender);
        return projectCount;
    }

    function verifyProject(uint256 id, string calldata reportHash)
        external onlyVerifier
    {
        Project storage p = _requireProject(id);
        require(
            p.status == Status.Pending || p.status == Status.Rejected,
            "registry: project not in a verifiable state"
        );
        p.status = Status.Verified;
        p.reportHash = reportHash;
        p.verifiedAt = block.timestamp;
        emit ProjectVerified(id, msg.sender, reportHash);
    }

    function rejectProject(uint256 id, string calldata reason)
        external onlyVerifier
    {
        Project storage p = _requireProject(id);
        require(
            p.status == Status.Pending || p.status == Status.Rejected,
            "registry: project not in a verifiable state"
        );
        p.status = Status.Rejected;
        emit ProjectRejected(id, msg.sender, reason);
    }

    /
    function recordMint(uint256 id, uint256 amount) external onlyCredit {
        Project storage p = _requireProject(id);
        require(p.status == Status.Verified, "registry: project not verified");
        p.creditsMinted += amount;
    }

    function projects(uint256 id)
        external view
        returns (Project memory)
    {
        return _projects[id];
    }

    function isVerified(uint256 id) external view returns (bool) {
        return _projects[id].status == Status.Verified;
    }

    function _requireProject(uint256 id)
        internal view returns (Project storage p)
    {
        require(id != 0 && id <= projectCount, "registry: project not found");
        return _projects[id];
    }
}
