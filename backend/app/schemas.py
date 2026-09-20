from pydantic import BaseModel, Field

class ProjectCreate(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    ecosystem: str = Field(pattern="^(mangrove|seagrass|saltmarsh)$")
    country: str = ""
    bounds: list[float] = Field(min_length=4, max_length=4)
    owner: str | None = None

class QuantifyRequest(BaseModel):
    mode: str | None = None

class VerifyRequest(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    note: str = ""
    verifier: str | None = None

class MintRequest(BaseModel):
    owner: str | None = None

class ListForSaleRequest(BaseModel):
    project_id: int
    amount: int = Field(gt=0)
    price_per_credit_eth: float = Field(gt=0)
    seller: str | None = None

class BuyRequest(BaseModel):
    buyer: str | None = None

class RetireRequest(BaseModel):
    amount: int = Field(gt=0)
    reason: str = ""
    actor: str | None = None
