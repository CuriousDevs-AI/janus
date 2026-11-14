from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

WorkspaceType = Literal[
    "crm_sales",
    "hr_people",
    "finance_accounting",
    "projects_delivery",
    "customer_support",
    "operations_inventory",
    "it_infrastructure",
]
WorkspaceStatus = Literal["active", "archived"]
WorkflowStatus = Literal["draft", "active", "paused", "needs_attention", "archived"]
AgentStatus = Literal["draft", "active", "paused", "needs_attention", "archived"]


class SetupOut(BaseModel):
    businessName: str
    industry: str
    companySize: str
    timezone: str
    setupCompleted: bool
    completedSteps: list[str]
    nextStep: str | None


class SetupUpdate(BaseModel):
    businessName: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
    ] = None
    industry: str | None = Field(default=None, max_length=120)
    companySize: str | None = Field(default=None, max_length=80)
    timezone: str | None = Field(default=None, max_length=80)
    businessHoursStart: str | None = Field(default=None, max_length=5)
    businessHoursEnd: str | None = Field(default=None, max_length=5)
    defaultChannel: str | None = Field(default=None, max_length=40)
    completedSteps: list[str] | None = Field(default=None, max_length=20)


class WorkspaceCreate(BaseModel):
    type: WorkspaceType
    name: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
    ] = None
    description: str = Field(default="", max_length=1000)


class WorkspaceUpdate(BaseModel):
    name: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
    ] = None
    description: str | None = Field(default=None, max_length=1000)
    status: WorkspaceStatus | None = None


class WorkspaceOut(BaseModel):
    id: str
    type: str
    name: str
    description: str
    status: str
    accessLevel: str
    createdAt: datetime


class WorkspaceMemberOut(BaseModel):
    membershipId: str
    userId: str
    name: str
    email: str
    accessLevel: str
    permissions: list[str]


class WorkspaceMemberUpdate(BaseModel):
    accessLevel: Literal["owner", "manager", "member"]
    permissions: list[str] = Field(default_factory=list, max_length=50)


class AgentOut(BaseModel):
    id: str
    key: str
    name: str
    department: str
    status: str
    workspaceId: str | None
    configuration: dict[str, Any]


class AgentCreate(BaseModel):
    key: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    department: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)
    ]
    workspaceId: int | None = None
    configuration: dict[str, Any] = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    name: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
    ] = None
    department: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)
    ] = None
    status: AgentStatus | None = None
    configuration: dict[str, Any] | None = None


class WorkflowOut(BaseModel):
    id: str
    name: str
    description: str
    status: str
    trigger: dict[str, Any]
    actions: list[Any]
    requiresApproval: bool
    workspaceId: str | None
    folderId: str | None = None
    updatedAt: datetime | None = None
    # Why it would not run as it stands, in words for the person; empty when it is ready.
    problems: list[str] = Field(default_factory=list)


class FolderIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class FolderOut(BaseModel):
    id: str
    name: str
    count: int


class MoveToFolder(BaseModel):
    """The folder to file a workflow in, or null to unfile it."""

    model_config = ConfigDict(extra="forbid")
    folderId: int | None = None


class TemplateOut(BaseModel):
    id: str
    name: str
    description: str
    trigger: dict[str, Any]
    steps: list[Any]
    modules: list[str]
    # What the person chooses before it runs: "channel" for a Team Chat post, "project" for a task.
    needs: list[str] = Field(default_factory=list)


class WorkflowCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    description: str = Field(default="", max_length=1000)
    trigger: dict[str, Any] = Field(default_factory=dict)
    actions: list[Any] = Field(default_factory=list, max_length=100)
    workspaceId: int | None = None
    folderId: int | None = None
    requiresApproval: bool = True


class WorkflowUpdate(BaseModel):
    name: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
    ] = None
    description: str | None = Field(default=None, max_length=1000)
    status: WorkflowStatus | None = None
    trigger: dict[str, Any] | None = None
    actions: list[Any] | None = Field(default=None, max_length=100)
    requiresApproval: bool | None = None


class ExecutionOut(BaseModel):
    id: str
    workflowId: str
    status: str
    event: dict[str, Any]
    result: dict[str, Any]
    approvedBy: str | None
    createdAt: datetime
    completedAt: datetime | None
    # What the Runs tab shows: the record the run is about, and each step's outcome.
    recordRef: dict[str, Any] | None = None
    steps: list[dict[str, Any]] = Field(default_factory=list)
    startedAt: datetime | None = None
    endedAt: datetime | None = None


class ReportSummary(BaseModel):
    leads: int
    openDeals: int
    wonDeals: int
    pipelineValue: str
    dataSources: list[str]
    unavailable: list[str]


class IntelligenceAsk(BaseModel):
    question: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]
    workspaceId: str | None = None


class IntelligenceAnswer(BaseModel):
    answer: str
    sources: list[str]
    unavailable: list[str]
    requiresApproval: bool = False
