"""Typed request/response models shared by the API, services and calculations."""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SOURCE_DOCUMENT = "M.P. Bhumi Vikas Rules, 2012 (English, consolidated up to 06-03-2025)"
SOURCE_PDF = "MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf"


class Status(str, Enum):
    VERIFIED = "VERIFIED"
    CALCULATION_COMPLETED = "CALCULATION_COMPLETED"
    SOURCE_FOUND = "SOURCE_FOUND"
    MORE_INFORMATION_NEEDED = "MORE_INFORMATION_NEEDED"
    NOT_FOUND = "NOT_FOUND"
    VERSION_REVIEW_NEEDED = "VERSION_REVIEW_NEEDED"
    ILLUSTRATIVE_ONLY = "ILLUSTRATIVE_ONLY"


BuildingUse = Literal[
    "residential",
    "commercial",
    "shop_cum_residence",
    "industrial_admin",
    "social_educational",
    "cinema",
]
BuildingType = Literal["detached", "semi_detached", "row"]
VoltageClass = Literal["low_medium", "high_upto_33kv", "extra_high"]


class ProjectInputs(BaseModel):
    """Inputs supplied by the clerk (form) or extracted from a question. All lengths in metres."""

    model_config = ConfigDict(extra="forbid")

    plot_width_m: float | None = Field(default=None, gt=0, le=1000, description="Plot frontage along the road")
    plot_depth_m: float | None = Field(default=None, gt=0, le=1000)
    plot_area_sqm: float | None = Field(default=None, gt=0, le=1_000_000)
    road_width_m: float | None = Field(default=None, gt=0, le=200)
    building_height_m: float | None = Field(default=None, gt=0, le=500)
    storeys: int | None = Field(default=None, ge=1, le=200)
    building_use: BuildingUse | None = None
    building_type: BuildingType | None = None
    built_up_area_sqm: float | None = Field(default=None, gt=0, le=10_000_000)
    seating_capacity: int | None = Field(default=None, ge=1, le=100_000)
    voltage_class: VoltageClass | None = None
    # Proposed building footprint (user design geometry; illustrative).
    building_width_m: float | None = Field(default=None, gt=0, le=1000)
    building_depth_m: float | None = Field(default=None, gt=0, le=1000)
    front_gap_m: float | None = Field(default=None, ge=0, le=1000)
    left_gap_m: float | None = Field(default=None, ge=0, le=1000)

    @model_validator(mode="after")
    def _check_geometry(self) -> "ProjectInputs":
        w, d, a = self.plot_width_m, self.plot_depth_m, self.plot_area_sqm
        if w and d and a and abs(w * d - a) > max(0.5, 0.02 * a):
            raise ValueError(
                f"plot_area_sqm ({a}) does not match plot_width_m x plot_depth_m ({w * d:.2f}). "
                "Correct one of the values; the area is not adjusted automatically."
            )
        if w and self.building_width_m and self.building_width_m + (self.left_gap_m or 0) > w + 1e-9:
            raise ValueError("The proposed building (with its left gap) is wider than the plot.")
        if d and self.building_depth_m and self.building_depth_m + (self.front_gap_m or 0) > d + 1e-9:
            raise ValueError("The proposed building (with its front gap) is deeper than the plot.")
        return self

    def effective_plot_area(self) -> float | None:
        if self.plot_area_sqm:
            return self.plot_area_sqm
        if self.plot_width_m and self.plot_depth_m:
            return round(self.plot_width_m * self.plot_depth_m, 4)
        return None

    def effective_frontage(self) -> float | None:
        return self.plot_width_m


class Citation(BaseModel):
    rule: str
    sub_rule: str | None = None
    title: str
    page: int
    passage: str
    document: str = SOURCE_DOCUMENT
    chunk_id: str | None = None
    verified_table: bool = False
    score: float | None = None


class MissingInput(BaseModel):
    field: str
    label: str
    reason: str


class Warning(BaseModel):
    code: str
    title: str
    detail: str
    source_url: str | None = None
    affected_rules: list[str] = []


class ConditionalResult(BaseModel):
    condition: str
    result: str
    rule: str


class GeometryZone(BaseModel):
    """A verified restriction zone the 3D scene may draw."""

    side: Literal["front", "rear", "left", "right"]
    depth_m: float
    rule: str
    label: str
    proposed_gap_m: float | None = None
    check: Literal["meets_minimum", "below_minimum", "not_checked"] = "not_checked"


class CalcResult(BaseModel):
    calc_type: str
    label: str
    status: Status
    value: float | None = None
    unit: str | None = None
    display_value: str | None = None
    inputs_used: dict[str, float | int | str] = {}
    steps: list[str] = []
    conditions: list[str] = []
    notes: list[str] = []
    citations: list[Citation] = []
    missing_inputs: list[MissingInput] = []
    conditional_results: list[ConditionalResult] = []
    zones: list[GeometryZone] = []
    breakdown: dict[str, float | str] = {}
    # Deterministic one-line summaries of the governing table when no single value can be given yet.
    summary_en: str | None = None
    summary_hi: str | None = None


CalcType = Literal[
    "front_open_space",
    "rear_open_space",
    "side_open_space",
    "site_open_spaces",
    "building_permission_fee",
    "electric_line_clearance",
]


class CalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    calc_type: CalcType
    inputs: ProjectInputs


class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=1000)
    inputs: ProjectInputs | None = None
    use_ai: bool = True

    @model_validator(mode="after")
    def _strip(self) -> "AnswerRequest":
        self.question = self.question.strip()
        if not self.question:
            raise ValueError("question must not be blank")
        return self


class AnswerText(BaseModel):
    text: str
    source: Literal["ai", "template"]
    model: str | None = None
    note: str | None = None


class SearchTrace(BaseModel):
    query_terms: list[str]
    top_score: float
    rules_considered: list[str]


class AnswerResponse(BaseModel):
    question: str
    language: Literal["en", "hi"]
    answer: AnswerText
    primary_status: Status
    statuses: list[Status]
    citations: list[Citation]
    calculations: list[CalcResult]
    missing_inputs: list[MissingInput]
    warnings: list[Warning]
    extracted_inputs: dict[str, float | int | str]
    search: SearchTrace
    ai_available: bool
    generated_at: str
