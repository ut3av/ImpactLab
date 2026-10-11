"""Shared helpers for deterministic, source-linked calculations."""
from __future__ import annotations

from app.models.schemas import Citation, MissingInput
from app.rules.verified_tables import SOURCES

# Populated at startup by app.main via verify_against_store(); tests may set it directly.
SOURCE_STATUS: dict[str, bool] = {}

FIELD_LABELS = {
    "road_width_m": "Width of street facing the plot (m)",
    "building_height_m": "Proposed building height (m)",
    "storeys": "Number of storeys",
    "building_use": "Building use",
    "building_type": "Building type (detached / semi-detached / row)",
    "plot_area_sqm": "Plot area (sq m) — or plot width and depth",
    "plot_width_m": "Plot frontage / width along the road (m)",
    "built_up_area_sqm": "Proposed built-up area (sq m)",
    "seating_capacity": "Seating capacity",
    "voltage_class": "Type of overhead line (low/medium, high up to 33 kV, extra high)",
}


class SourceUnavailable(RuntimeError):
    pass


def cite(key: str) -> Citation:
    if not SOURCE_STATUS.get(key, False):
        raise SourceUnavailable(key)
    src = SOURCES[key]
    return Citation(
        rule=src.rule,
        sub_rule=src.sub_rule,
        title=src.title,
        page=src.page,
        passage=src.source_quote,
        verified_table=True,
        chunk_id=f"verified:{key}",
    )


def missing(field: str, reason: str) -> MissingInput:
    return MissingInput(field=field, label=FIELD_LABELS.get(field, field), reason=reason)


def fmt_m(v: float) -> str:
    return "Nil" if v == 0 else f"{v:.2f}".rstrip("0").rstrip(".") + " m"


def fmt_rs(v: float) -> str:
    whole = int(round(v))
    s = str(whole)
    # Indian digit grouping.
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    return f"Rs. {s}"
