"""Open-space (setback) calculations: Rule 56 (residential, height <= 12.5 m) and Rule 42 tables.

Only the verified tables in app.rules.verified_tables are used. When an applicable condition
cannot be evaluated from the inputs, the result is MORE_INFORMATION_NEEDED, never a guess.
"""
from __future__ import annotations

from app.calculations.common import cite, fmt_m, missing
from app.models.schemas import CalcResult, ConditionalResult, GeometryZone, ProjectInputs, Status
from app.rules.verified_tables import FRONT_OPEN_SPACE_56, REAR_OPEN_SPACE_56, TABLE_4, TABLE_5

LOW_RISE_LIMIT_M = 12.5
NON_RESIDENTIAL_NOTE = (
    "Rule 56 applies to residential buildings. Open spaces for other occupancies up to 12.5 m are in "
    "Rule 57 (PDF pp. 80–81); MIRA has not verified Rule 57 for calculation, so no value is given."
)


def _lookup(table: list[tuple[float | None, float]], x: float) -> tuple[int, float]:
    for i, (upper, val) in enumerate(table):
        if upper is None or x <= upper:
            return i, val
    raise AssertionError("unreachable")


FRONT_ROW_LABELS = [
    "Up to 9.0 meters",
    "More than 9.0 meters and up to 12 meters",
    "More than 12.0 meters and up to 18 meters",
    "Above 18 meters",
]
REAR_ROW_LABELS = ["Up to 40.00", "Above 40.00 and up to 150.00", "Above 150 and up to 225.00", "Above 225.00"]


# ---------------------------------------------------------------- Rule 42 (height > 12.5 m)
def rule42_row(height: float, storeys: int | None):
    """Return (table_name, row_index, row, source_key) or None if storeys are needed to decide."""
    high_rise = height > 30 or (storeys is not None and storeys > 10)
    if not high_rise and storeys is None:
        return None
    table, key, name = (TABLE_5, "42_table5", "Table 5") if high_rise else (TABLE_4, "42_table4", "Table 4")
    for i, row in enumerate(table):
        if row[0] is None or height <= row[0]:
            return name, i, row, key
    return None  # Table 4 covers <= 30 m; a <=30 m building with >10 storeys falls into Table 5 row 1.


def rule42_result(calc_type: str, label: str, side: str, inp: ProjectInputs) -> CalcResult:
    h = inp.building_height_m
    assert h is not None and h > LOW_RISE_LIMIT_M
    res = CalcResult(calc_type=calc_type, label=label, status=Status.MORE_INFORMATION_NEEDED)
    res.inputs_used["building_height_m"] = h
    pick = rule42_row(h, inp.storeys)
    res.citations.append(cite("56_5_above_12_5"))
    if pick is None:
        res.missing_inputs.append(
            missing("storeys", "A building of 30 m or less is a high rise building if it has more than ten "
                               "storeys (Rule 2(38)); this decides whether Table 4 or Table 5 applies.")
        )
        res.citations.append(cite("2_38_high_rise"))
        return res
    name, idx, row, key = pick
    max_h, min_road, min_plot, min_front, far, front_mos, side_mos = row
    if inp.storeys is not None:
        res.inputs_used["storeys"] = inp.storeys
    value = front_mos if side == "front" else side_mos
    res.value = value
    res.unit = "m"
    res.display_value = fmt_m(value)
    res.status = Status.CALCULATION_COMPLETED
    res.citations.insert(0, cite(key))
    res.citations.append(cite("2_38_high_rise"))
    col = "Front M.O.S." if side == "front" else "Sides/rear M.O.S."
    res.steps += [
        f"Height {h} m is above 12.5 m, so Rule 56(5) refers to Rule 42.",
        f"Rule 42 {name}, row {idx + 1} (building height {'up to ' + str(max_h) + ' m' if max_h else 'above 90 m'}).",
        f"{col} in that row = {fmt_m(value)}.",
    ]
    res.notes.append(
        f"Row selected by proposed building height. The same row lists road width ≥ {min_road} m, plot ≥ "
        f"{min_plot} sq m, frontage ≥ {min_front} m and FAR {far}; the authority's reading of the table governs."
    )
    unmet = []
    for fld, have, need, unit in (
        ("road_width_m", inp.road_width_m, min_road, "m road width"),
        ("plot_area_sqm", inp.effective_plot_area(), min_plot, "sq m plot area"),
        ("plot_width_m", inp.effective_frontage(), min_front, "m frontage"),
    ):
        if have is None:
            res.conditions.append(f"Not checked: minimum {need} {unit} for this row (input not provided).")
        elif have + 1e-9 >= need:
            res.conditions.append(f"Meets row minimum: {have} ≥ {need} {unit}.")
        else:
            unmet.append(f"{have} < {need} {unit}")
            res.conditions.append(f"Below row minimum: {have} < {need} {unit}.")
    if unmet:
        res.notes.append("The site does not meet this row's listed minimums (" + "; ".join(unmet)
                         + "). Refer the case to the authority; no compliance conclusion is drawn.")
    else:
        if all(x is not None for x in (inp.road_width_m, inp.effective_plot_area(), inp.effective_frontage())):
            res.status = Status.VERIFIED
    return res


# ---------------------------------------------------------------- common gating for Rule 56
def _gate(res: CalcResult, inp: ProjectInputs, needs: list[tuple[str, object, str]]) -> bool:
    ok = True
    for fld, val, reason in needs:
        if val is None:
            res.missing_inputs.append(missing(fld, reason))
            ok = False
    return ok


def front_open_space(inp: ProjectInputs) -> CalcResult:
    label = "Minimum front open space"
    h, road, use = inp.building_height_m, inp.road_width_m, inp.building_use
    if h is not None and h > LOW_RISE_LIMIT_M:
        r = rule42_result("front_open_space", label, "front", inp)
        _attach_zone(r, inp, "front")
        return r
    res = CalcResult(calc_type="front_open_space", label=label, status=Status.MORE_INFORMATION_NEEDED)
    res.citations.append(cite("56_1_front"))
    if road is not None:
        res.inputs_used["road_width_m"] = road
    if use is not None:
        res.inputs_used["building_use"] = use
    if h is not None:
        res.inputs_used["building_height_m"] = h
    _gate(res, inp, [
        ("road_width_m", road, "The front open space depends on the width of the street facing the plot."),
        ("building_height_m", h, "Rule 56(1) table applies only to residential buildings up to 12.5 m; above that, Rule 42 applies."),
        ("building_use", use, "Rule 56 applies to residential buildings; other occupancies are covered by Rule 57."),
    ])
    if use is not None and use != "residential":
        res.notes.append(NON_RESIDENTIAL_NOTE)
        res.status = Status.SOURCE_FOUND
        return res
    if road is not None and road < 6.0:
        res.conditional_results.append(ConditionalResult(
            condition="If the plot is in an existing developed area (street narrower than 6.0 m)",
            result="Building line at 6.0 m from the centre line of the street", rule="56(1)(b)"))
        res.citations.append(cite("56_1_b_narrow"))
    if road is None:
        return res
    idx, val = _lookup(FRONT_OPEN_SPACE_56, road)
    if h is None or use is None:
        res.conditional_results.append(ConditionalResult(
            condition="If the building is residential and up to 12.5 m high",
            result=f"{fmt_m(val)} (street width row: {FRONT_ROW_LABELS[idx]})", rule="56(1)(a)"))
        res.conditional_results.append(ConditionalResult(
            condition="If the building is higher than 12.5 m",
            result="Rule 42 Table 4/5 applies (needs height, storeys, plot area and frontage)", rule="42"))
        return res
    res.value, res.unit, res.display_value = val, "m", fmt_m(val)
    res.status = Status.VERIFIED
    res.steps += [
        f"Residential building, height {h} m ≤ 12.5 m → Rule 56(1)(a) table applies.",
        f"Street width {road} m falls in row {idx + 1}: \"{FRONT_ROW_LABELS[idx]}\".",
        f"Minimum front open space = {fmt_m(val)}.",
    ]
    _attach_zone(res, inp, "front")
    return res


def rear_open_space(inp: ProjectInputs) -> CalcResult:
    label = "Minimum rear open space"
    h, use, area = inp.building_height_m, inp.building_use, inp.effective_plot_area()
    if h is not None and h > LOW_RISE_LIMIT_M:
        r = rule42_result("rear_open_space", label, "rear", inp)
        _attach_zone(r, inp, "rear")
        return r
    res = CalcResult(calc_type="rear_open_space", label=label, status=Status.MORE_INFORMATION_NEEDED)
    res.citations.append(cite("56_2_rear"))
    if area is not None:
        res.inputs_used["plot_area_sqm"] = area
        if not inp.plot_area_sqm:
            res.steps.append(f"Plot area = width {inp.plot_width_m} m × depth {inp.plot_depth_m} m = {area} sq m.")
    if use is not None:
        res.inputs_used["building_use"] = use
    if h is not None:
        res.inputs_used["building_height_m"] = h
    _gate(res, inp, [
        ("plot_area_sqm", area, "The rear open space depends on the plot area."),
        ("building_height_m", h, "Rule 56(2) table applies only to residential buildings up to 12.5 m; above that, Rule 42 applies."),
        ("building_use", use, "Rule 56 applies to residential buildings; other occupancies are covered by Rule 57."),
    ])
    if use is not None and use != "residential":
        res.notes.append(NON_RESIDENTIAL_NOTE)
        res.status = Status.SOURCE_FOUND
        return res
    if area is None:
        return res
    idx, val = _lookup(REAR_OPEN_SPACE_56, area)
    if h is None or use is None:
        res.conditional_results.append(ConditionalResult(
            condition="If the building is residential and up to 12.5 m high",
            result=f"{fmt_m(val)} (plot area row: {REAR_ROW_LABELS[idx]} sq m)", rule="56(2)(a)"))
        res.conditional_results.append(ConditionalResult(
            condition="If the building is higher than 12.5 m",
            result="Rule 42 Table 4/5 applies (needs height, storeys, plot area and frontage)", rule="42"))
        return res
    res.value, res.unit, res.display_value = val, "m", fmt_m(val)
    res.status = Status.VERIFIED
    res.steps += [
        f"Residential building, height {h} m ≤ 12.5 m → Rule 56(2)(a) table applies.",
        f"Plot area {area} sq m falls in row {idx + 1}: \"{REAR_ROW_LABELS[idx]}\".",
        f"Minimum rear open space = {fmt_m(val)}.",
    ]
    _attach_zone(res, inp, "rear")
    return res


def side_open_space(inp: ProjectInputs) -> CalcResult:
    label = "Minimum side open space"
    h, use, btype, frontage = inp.building_height_m, inp.building_use, inp.building_type, inp.effective_frontage()
    if h is not None and h > LOW_RISE_LIMIT_M:
        r = rule42_result("side_open_space", label, "side", inp)
        if r.value is not None:
            r.breakdown = {"left_m": r.value, "right_m": r.value}
            _attach_zone(r, inp, "left", r.value)
            _attach_zone(r, inp, "right", r.value)
        return r
    res = CalcResult(calc_type="side_open_space", label=label, status=Status.MORE_INFORMATION_NEEDED)
    res.citations.append(cite("56_3_side"))
    for k, v in (("building_type", btype), ("building_height_m", h), ("building_use", use), ("plot_width_m", frontage)):
        if v is not None:
            res.inputs_used[k] = v
    ok = _gate(res, inp, [
        ("building_type", btype, "Rule 56(3) differs for detached, semi-detached and row-type buildings."),
        ("building_height_m", h, "Rule 56(3) reductions depend on height, and Rule 42 applies above 12.5 m."),
        ("building_use", use, "Rule 56 applies to residential buildings; other occupancies are covered by Rule 57."),
    ])
    if use is not None and use != "residential":
        res.notes.append(NON_RESIDENTIAL_NOTE)
        res.status = Status.SOURCE_FOUND
        return res
    if not ok:
        return res
    if btype == "row":
        left = right = 0.0
        res.steps.append("Row-type building → Rule 56(3)(iii): no side open space is required.")
    elif btype == "detached":
        left = right = 3.0
        res.steps.append("Detached building → Rule 56(3)(i): minimum 3 m on both sides.")
        if h <= 7.0:
            if frontage is None:
                res.missing_inputs.append(missing("plot_width_m", "The proviso (one side may be 1.5 m) applies only when the frontage is less than 12 m."))
                res.conditional_results.append(ConditionalResult(
                    condition="If the plot frontage is less than 12 m (height ≤ 7 m)",
                    result="One side open space may be reduced to 1.5 m", rule="56(3)(i) proviso"))
            elif frontage < 12.0:
                right = 1.5
                res.steps.append(f"Height {h} m ≤ 7 m and frontage {frontage} m < 12 m → proviso: one side may be reduced to 1.5 m.")
            else:
                res.steps.append(f"Frontage {frontage} m is not less than 12 m → proviso does not apply.")
        else:
            res.steps.append(f"Height {h} m > 7 m → the 1.5 m proviso does not apply.")
    else:  # semi_detached
        left, right = 0.0, 3.0
        res.steps.append("Semi-detached building → Rule 56(3)(ii): minimum 3.0 m on one side.")
        if h <= 10.0:
            if frontage is None:
                res.missing_inputs.append(missing("plot_width_m", "The 2.5 m reduction applies only when the frontage is up to 10 m."))
                res.conditional_results.append(ConditionalResult(
                    condition="If the plot frontage is up to 10 m (height ≤ 10 m)",
                    result="Side open space may be reduced to 2.5 m", rule="56(3)(ii)"))
            elif frontage <= 10.0:
                right = 2.5
                res.steps.append(f"Height {h} m ≤ 10 m and frontage {frontage} m ≤ 10 m → may be reduced to 2.5 m.")
        res.notes.append("The open side is drawn on the right for display; the rule does not fix which side.")
    res.breakdown = {"left_m": left, "right_m": right}
    res.value, res.unit = max(left, right), "m"
    res.display_value = f"Left {fmt_m(left)} · Right {fmt_m(right)}"
    res.status = Status.MORE_INFORMATION_NEEDED if res.missing_inputs else Status.VERIFIED
    _attach_zone(res, inp, "left", left)
    _attach_zone(res, inp, "right", right)
    return res


# ---------------------------------------------------------------- geometry linkage
def _proposed_gap(inp: ProjectInputs, side: str) -> float | None:
    if side == "front":
        return inp.front_gap_m if inp.building_depth_m else None
    if side == "left":
        return inp.left_gap_m if inp.building_width_m else None
    if side == "rear" and inp.plot_depth_m and inp.building_depth_m and inp.front_gap_m is not None:
        return round(inp.plot_depth_m - inp.front_gap_m - inp.building_depth_m, 4)
    if side == "right" and inp.plot_width_m and inp.building_width_m and inp.left_gap_m is not None:
        return round(inp.plot_width_m - inp.left_gap_m - inp.building_width_m, 4)
    return None


def _attach_zone(res: CalcResult, inp: ProjectInputs, side: str, depth: float | None = None) -> None:
    depth = res.value if depth is None else depth
    if depth is None or res.status not in (Status.VERIFIED, Status.CALCULATION_COMPLETED, Status.MORE_INFORMATION_NEEDED):
        return
    rule = res.citations[0].rule + (res.citations[0].sub_rule or "")
    gap = _proposed_gap(inp, side)
    check = "not_checked"
    if gap is not None:
        check = "meets_minimum" if gap + 1e-9 >= depth else "below_minimum"
    res.zones.append(GeometryZone(side=side, depth_m=depth, rule=rule, label=f"{side.title()} open space ≥ {fmt_m(depth)}",
                                  proposed_gap_m=gap, check=check))


def site_open_spaces(inp: ProjectInputs) -> list[CalcResult]:
    return [front_open_space(inp), rear_open_space(inp), side_open_space(inp)]
