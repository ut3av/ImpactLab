"""Minimum distance between a building and overhead electric lines (Rule 52(1))."""
from __future__ import annotations

from app.calculations.common import cite, fmt_m, missing
from app.models.schemas import CalcResult, ProjectInputs, Status
from app.rules.verified_tables import ELECTRIC_CLEARANCE_52, EXTRA_HIGH_CORRIDOR_EACH_SIDE

LABELS = {
    "low_medium": "Low and Medium voltage lines and service lines",
    "high_upto_33kv": "High voltage lines up to and including 33000 volts",
    "extra_high": "Extra high voltage lines beyond 33000 volts",
}


def electric_line_clearance(inp: ProjectInputs) -> CalcResult:
    res = CalcResult(calc_type="electric_line_clearance", label="Minimum distance from overhead electric line",
                     status=Status.MORE_INFORMATION_NEEDED)
    res.citations.append(cite("52_1_electric"))
    vc = inp.voltage_class
    if vc is None:
        res.missing_inputs.append(missing("voltage_class", "Rule 52(1) gives different distances for each line voltage."))
        return res
    res.inputs_used["voltage_class"] = vc
    if vc == "extra_high":
        res.value, res.unit = EXTRA_HIGH_CORRIDOR_EACH_SIDE, "m"
        res.display_value = "Clear horizontal corridor of 15 m (7.5 m each side of the centre line)"
        res.breakdown = {"corridor_total_m": 15.0, "each_side_m": EXTRA_HIGH_CORRIDOR_EACH_SIDE}
        res.steps.append(f"{LABELS[vc]} → Rule 52(1) note: 15 m corridor, 7.5 m each side of the centre line.")
    else:
        v, hz = ELECTRIC_CLEARANCE_52[vc]
        res.value, res.unit = v, "m"
        res.display_value = f"Vertically {fmt_m(v)} · Horizontally {fmt_m(hz)}"
        res.breakdown = {"vertical_m": v, "horizontal_m": hz}
        res.steps.append(f"{LABELS[vc]} → Rule 52(1) row: vertically {fmt_m(v)}, horizontally {fmt_m(hz)}.")
    res.notes += [
        "Or the distance in the applicable Electricity Rules, whichever is more (Rule 52(1)).",
        "No verandah, balcony or the like may be erected that violates this distance (Rule 52(1)).",
        "Vertical clearance is measured from maximum sag; horizontal from maximum deflection due to wind (Rule 52(2)).",
    ]
    res.status = Status.VERIFIED
    return res
