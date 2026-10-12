from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Register(Input):
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=12, max_length=128)
    name: str = Field(min_length=2, max_length=80)
    workspace: str = Field(min_length=2, max_length=100)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.lower()


class Login(Input):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class IncidentCreate(Input):
    title: str = Field(min_length=5, max_length=160)
    summary: str = Field(min_length=20, max_length=10000)
    service: str = Field(min_length=2, max_length=60)
    severity: Literal["SEV1", "SEV2", "SEV3"] = "SEV2"


class StatusUpdate(Input):
    status: Literal["investigating", "monitoring", "resolved"]
    version: int = Field(ge=1)


class DocumentCreate(Input):
    title: str = Field(min_length=3, max_length=140)
    service: str = Field(min_length=2, max_length=60)
    kind: Literal["runbook", "postmortem", "architecture"] = "runbook"
    content: str = Field(min_length=30, max_length=80000)


class AnalysisCreate(Input):
    idempotency_key: str = Field(min_length=8, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")


class DecisionCreate(Input):
    action_index: int = Field(ge=0)
    verdict: Literal["approved", "rejected"]
    note: str = Field(min_length=3, max_length=1000)


class Hypothesis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claim: str
    evidence_ids: list[str]


class Action(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    rationale: str
    evidence_ids: list[str]
    risk: Literal["low", "medium", "high"]


class Brief(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    hypotheses: list[Hypothesis]
    actions: list[Action]
    unknowns: list[str]
    abstained: bool
