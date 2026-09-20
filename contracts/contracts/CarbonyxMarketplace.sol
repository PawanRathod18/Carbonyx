pragma solidity ^0.8.24;

import "./CarbonyxCredit.sol";

contract CarbonyxMarketplace {
    struct Listing {
        uint256 id;
        uint256 projectId;
        address seller;
        uint256 amount;
        uint256 pricePerCredit;
        bool active;
    }

    CarbonyxCredit public immutable credit;
    address public feeCollector;
    uint256 public feeBps = 100;

    uint256 public listingCount;
    mapping(uint256 => Listing) private _listings;

    event Listed(
        uint256 indexed id,
        uint256 indexed projectId,
        address indexed seller,
        uint256 amount,
        uint256 pricePerCredit
    );
    event PriceUpdated(uint256 indexed id, uint256 newPrice);
    event Cancelled(uint256 indexed id);
    event Purchased(
        uint256 indexed id,
        address indexed buyer,
        uint256 amount,
        uint256 pricePerCredit,
        uint256 fee
    );

    constructor(address credit_, address feeCollector_) {
        credit = CarbonyxCredit(credit_);
        feeCollector = feeCollector_;
    }

    modifier onlySeller(uint256 id) {
        require(_listings[id].seller == msg.sender, "market: not the seller");
        _;
    }

    modifier onlyActive(uint256 id) {
        require(_listings[id].active, "market: listing not active");
        _;
    }

    /
    /
    /
    function list(uint256 projectId, uint256 amount, uint256 pricePerCredit)
        external returns (uint256)
    {
        require(amount > 0, "market: zero amount");
        require(pricePerCredit > 0, "market: zero price");

        credit.transferFrom(msg.sender, address(this), amount);

        listingCount += 1;
        _listings[listingCount] = Listing({
            id: listingCount,
            projectId: projectId,
            seller: msg.sender,
            amount: amount,
            pricePerCredit: pricePerCredit,
            active: true
        });
        emit Listed(listingCount, projectId, msg.sender, amount, pricePerCredit);
        return listingCount;
    }

    /
    /
    function buy(uint256 id) external payable onlyActive(id) {
        Listing storage l = _listings[id];
        uint256 cost = l.amount * l.pricePerCredit;
        require(msg.value >= cost, "market: insufficient payment");

        uint256 fee = (cost * feeBps) / 10_000;
        uint256 netToSeller = cost - fee;

        l.active = false;

        credit.transfer(msg.sender, l.amount);
        (bool okSeller, ) = payable(l.seller).call{value: netToSeller}("");
        require(okSeller, "market: seller transfer failed");
        if (fee > 0) {
            (bool okFee, ) = payable(feeCollector).call{value: fee}("");
            require(okFee, "market: fee transfer failed");
        }

        if (msg.value > cost) {
            (bool okRefund, ) = payable(msg.sender).call{value: msg.value - cost}("");
            require(okRefund, "market: refund failed");
        }

        emit Purchased(id, msg.sender, l.amount, l.pricePerCredit, fee);
    }

    function cancel(uint256 id) external onlyActive(id) onlySeller(id) {
        Listing storage l = _listings[id];
        l.active = false;
        credit.transfer(l.seller, l.amount);
        emit Cancelled(id);
    }

    function updatePrice(uint256 id, uint256 newPrice)
        external onlyActive(id) onlySeller(id)
    {
        require(newPrice > 0, "market: zero price");
        _listings[id].pricePerCredit = newPrice;
        emit PriceUpdated(id, newPrice);
    }

    function listing(uint256 id) external view returns (Listing memory) {
        return _listings[id];
    }
}
