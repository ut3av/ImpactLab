"""Building permission fee (Rule 21(3)(b)/(c)) and application fee (Rule 21(2)(ii))."""
from __future__ import annotations

from app.calculations.common import cite, fmt_rs, missing
from app.models.schemas import CalcResult, ConditionalResult, ProjectInputs, Status
from app.rules.verified_tables import (
    APPLICATION_FEE_PER_SQM,
    CINEMA_FEES,
    FEE_ABOVE_2500,
    FEE_SLABS_21_3_B,
    HIGH_RISE_RESIDENTIAL_FEE_PER_SQM,
    USE_FEE_RULES,
)


def slab_fee(area: float) -> tuple[int | None, str, str | None]:
    """Return (fee, slab label, interpretation note). fee is None when the printed slabs leave a gap."""
    if area > 2500:
        return FEE_ABOVE_2500, "above 2500 sq m", None
    for lo, hi, fee in FEE_SLABS_21_3_B:
        if lo <= area <= hi:
            return fee, f"{lo:,}–{hi:,} sq m", None
    # Area lies between two printed slabs, e.g. 75.5 sq m (slabs are printed 0–75, 76–125, ...).
    for (lo, hi, fee), (nlo, nhi, nfee) in zip(FEE_SLABS_21_3_B, FEE_SLABS_21_3_B[1:]):
        if hi < area < nlo:
            return None, f"between {hi} and {nlo} sq m", (
                f"The table prints slabs {lo}–{hi} (Rs. {fee:,}) and {nlo}–{nhi} (Rs. {nfee:,}); it does not say how "
                f"a fractional built-up area of {area} sq m is treated. Confirm the rounding practice with the authority."
            )
    return None, "outside printed slabs", "Built-up area is outside the printed slabs."


def is_high_rise(inp: ProjectInputs) -> bool | None:
    h, n = inp.building_height_m, inp.storeys
    if (h is not None and h > 30) or (n is not None and n > 10):
        return True
    if h is not None and n is not None:
        return False
    return None


def building_permission_fee(inp: ProjectInputs) -> CalcResult:
    res = CalcResult(calc_type="building_permission_fee", label="Building permission fee", status=Status.MORE_INFORMATION_NEEDED)
    res.citations += [cite("21_3_b_fee"), cite("21_2_application_fee")]
    area, use = inp.built_up_area_sqm, inp.building_use
    if area is not None:
        res.inputs_used["built_up_area_sqm"] = area
    if use is not None:
        res.inputs_used["building_use"] = use
    for k in ("building_height_m", "storeys"):
        v = getattr(inp, k)
        if v is not None:
            res.inputs_used[k] = v
    if area is None:
        res.missing_inputs.append(missing("built_up_area_sqm", "Rule 21 fees are charged on the proposed built-up area (not the plot area)."))
    if use is None:
        res.missing_inputs.append(missing("building_use", "Rule 21(3) charges different fees for residential, commercial, shop-cum-residence and other uses."))
    hr = is_high_rise(inp)
    if hr is None:
        res.missing_inputs.append(missing(
            "storeys" if inp.building_height_m is not None else "building_height_m",
            "High rise buildings (more than 10 storeys or more than 30 m, Rule 2(38)) use the Rule 21(3)(c) table instead of 21(3)(b)."))
        res.citations.append(cite("2_38_high_rise"))
    if use is not None and use != "residential":
        res.citations.append(cite("21_3_b_other_uses"))
    if hr:
        res.citations.insert(0, cite("21_3_c_high_rise_fee"))

    if area is not None:
        app_fee = round(area * APPLICATION_FEE_PER_SQM, 2)
        res.breakdown["application_fee_rs"] = app_fee
        res.steps.append(f"Application fee (Rule 21(2)(ii)) = Rs. 1.00 × {area} sq m = {fmt_rs(app_fee)} (paid with the application; not refundable).")

    if area is None:
        res.summary_en = (
            "Schedule: for buildings other than high rise, the residential fee is a flat amount by built-up area slab, "
            "from Rs. 750 (0–75 sq m) to Rs. 25,000 (2,001–2,500 sq m) and Rs. 50,000 above 2,500 sq m (Rule 21(3)(b) item 1); "
            "high rise residential is Rs. 10.00 per sq m of built-up area (Rule 21(3)(c)); the application fee is "
            "Rs. 1.00 per sq m of proposed built-up area (Rule 21(2)(ii))."
        )
        res.summary_hi = (
            "अनुसूची: हाई राइज के अलावा भवनों के लिए आवासीय शुल्क निर्मित क्षेत्र के स्लैब के अनुसार निश्चित है — "
            "रु. 750 (0–75 वर्ग मीटर) से रु. 25,000 (2,001–2,500 वर्ग मीटर) तक, और 2,500 वर्ग मीटर से अधिक पर रु. 50,000 "
            "(नियम 21(3)(b) मद 1); आवासीय हाई राइज भवन के लिए रु. 10.00 प्रति वर्ग मीटर निर्मित क्षेत्र (नियम 21(3)(c)); "
            "आवेदन शुल्क रु. 1.00 प्रति वर्ग मीटर प्रस्तावित निर्मित क्षेत्र (नियम 21(2)(ii))।"
        )
    if res.missing_inputs:
        if area is not None and (use in (None, "residential")) and hr is None:
            fee, slab, note = slab_fee(area)
            if fee is not None:
                res.conditional_results.append(ConditionalResult(
                    condition="If the building is exclusively residential and not a high rise building",
                    result=f"Permission fee {fmt_rs(fee)} (slab {slab})", rule="21(3)(b) item 1"))
            res.conditional_results.append(ConditionalResult(
                condition="If it is a residential high rise building",
                result=f"Rs. 10.00 per sq m × {area} = {fmt_rs(area * HIGH_RISE_RESIDENTIAL_FEE_PER_SQM)}", rule="21(3)(c) item 1"))
        return res

    assert area is not None and use is not None and hr is not None
    if use == "cinema":
        if hr:
            res.notes.append("Rule 21(3)(c) has no separate cinema item; item 5 ('any other purpose') may apply. Not calculated.")
            res.status = Status.SOURCE_FOUND
            return res
        if inp.seating_capacity is None:
            res.missing_inputs.append(missing("seating_capacity", "Rule 21(3)(b) item 5 fixes cinema fees by seating capacity (up to 800 / above 800)."))
            return res
        res.inputs_used["seating_capacity"] = inp.seating_capacity
        fee = CINEMA_FEES["upto_800" if inp.seating_capacity <= 800 else "above_800"]
        res.steps.append(f"Cinema with {inp.seating_capacity} seats → Rule 21(3)(b) item 5 → {fmt_rs(fee)}.")
    else:
        mult_b, mult_c, item = USE_FEE_RULES[use]
        if hr:
            base = round(area * HIGH_RISE_RESIDENTIAL_FEE_PER_SQM, 2)
            res.steps.append(f"High rise building (Rule 2(38)) → Rule 21(3)(c): item 1 rate Rs. 10.00 × {area} sq m = {fmt_rs(base)}.")
            mult = mult_c
        else:
            fee_b, slab, note = slab_fee(area)
            if fee_b is None:
                res.notes.append(note or "")
                res.status = Status.MORE_INFORMATION_NEEDED
                res.missing_inputs.append(missing("built_up_area_sqm", "The printed slabs leave a gap at this area; see note."))
                return res
            base = fee_b
            res.steps.append(f"Not a high rise building → Rule 21(3)(b) item 1: built-up area {area} sq m falls in slab {slab} → {fmt_rs(base)}.")
            mult = mult_b
        fee = round(base * mult, 2)
        if mult != 1.0:
            res.steps.append(f"Building use '{use}' → {item}: item 1 fee plus {int(round((mult - 1) * 100))}% = {fmt_rs(fee)}.")
        else:
            res.steps.append(f"Building use '{use}' → {item}: fee as item 1.")
    res.value, res.unit, res.display_value = fee, "Rs", fmt_rs(fee)
    res.breakdown["permission_fee_rs"] = fee
    res.status = Status.VERIFIED
    res.notes.append("Permission fee is paid before the permission is issued (Rule 21(3)); the authority may reject the application if it is not deposited within 15 days of intimation (Rule 21(3)(d)).")
    return res
