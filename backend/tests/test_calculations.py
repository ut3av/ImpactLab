import pytest
from pydantic import ValidationError

from app.calculations import common
from app.calculations.common import SourceUnavailable
from app.calculations.electric import electric_line_clearance
from app.calculations.fees import building_permission_fee, slab_fee
from app.calculations.setbacks import front_open_space, rear_open_space, side_open_space
from app.models.schemas import ProjectInputs, Status

RES = dict(building_use="residential")


@pytest.fixture(autouse=True)
def _sources(store):
    yield


@pytest.mark.parametrize("road,expected", [(6, 3.0), (9.0, 3.0), (9.01, 3.6), (10, 3.6), (12, 3.6), (12.5, 4.5), (18, 4.5), (18.1, 6.0), (30, 6.0)])
def test_front_open_space_table_boundaries(road, expected):
    r = front_open_space(ProjectInputs(road_width_m=road, building_height_m=9, **RES))
    assert r.status == Status.VERIFIED
    assert r.value == expected
    assert r.citations[0].rule == "56" and r.citations[0].page == 77 and r.citations[0].verified_table


@pytest.mark.parametrize("area,expected", [(30, 0.0), (40, 0.0), (40.5, 1.5), (150, 1.5), (151, 2.5), (225, 2.5), (226, 3.0), (1000, 3.0)])
def test_rear_open_space_table_boundaries(area, expected):
    r = rear_open_space(ProjectInputs(plot_area_sqm=area, building_height_m=7, **RES))
    assert r.status == Status.VERIFIED and r.value == expected
    assert r.citations[0].page == 78


def test_rear_uses_width_times_depth():
    r = rear_open_space(ProjectInputs(plot_width_m=10, plot_depth_m=20, building_height_m=7, **RES))
    assert r.inputs_used["plot_area_sqm"] == 200 and r.value == 2.5


def test_front_needs_height_and_gives_conditional_only():
    r = front_open_space(ProjectInputs(road_width_m=9))
    assert r.status == Status.MORE_INFORMATION_NEEDED
    assert r.value is None
    fields = {m.field for m in r.missing_inputs}
    assert {"building_height_m", "building_use"} <= fields
    assert any("3 m" in c.result for c in r.conditional_results)


def test_non_residential_not_calculated():
    r = front_open_space(ProjectInputs(road_width_m=9, building_height_m=9, building_use="commercial"))
    assert r.value is None and r.status == Status.SOURCE_FOUND
    assert any("Rule 57" in n for n in r.notes)


def test_narrow_street_condition():
    r = front_open_space(ProjectInputs(road_width_m=5, building_height_m=9, **RES))
    assert r.value == 3.0
    assert any(c.rule == "56(1)(b)" for c in r.conditional_results)


def test_above_12_5_uses_rule_42_and_needs_storeys():
    r = front_open_space(ProjectInputs(road_width_m=12, building_height_m=15, **RES))
    assert r.status == Status.MORE_INFORMATION_NEEDED
    assert r.missing_inputs[0].field == "storeys"


def test_rule_42_table_4_row():
    inp = ProjectInputs(road_width_m=12, building_height_m=15, storeys=4, plot_area_sqm=1200, plot_width_m=20, **RES)
    f, rr = front_open_space(inp), rear_open_space(inp)
    assert f.value == 7.5 and rr.value == 6.0
    assert f.citations[0].rule == "42" and f.citations[0].page == 58
    assert f.status == Status.VERIFIED


def test_rule_42_unmet_minimum_is_flagged_not_verified():
    inp = ProjectInputs(road_width_m=9, building_height_m=15, storeys=4, plot_area_sqm=300, plot_width_m=12, **RES)
    f = front_open_space(inp)
    assert f.value == 7.5 and f.status == Status.CALCULATION_COMPLETED
    assert any("Below row minimum" in c for c in f.conditions)


def test_high_rise_by_storeys_uses_table_5():
    inp = ProjectInputs(building_height_m=29, storeys=11, **RES)
    f = front_open_space(inp)
    assert f.citations[0].rule == "42" and f.citations[0].page == 59 and f.value == 15.0


def test_side_detached_proviso():
    r = side_open_space(ProjectInputs(building_type="detached", building_height_m=7, plot_width_m=10, **RES))
    assert r.breakdown == {"left_m": 3.0, "right_m": 1.5} and r.status == Status.VERIFIED
    r = side_open_space(ProjectInputs(building_type="detached", building_height_m=7.5, plot_width_m=10, **RES))
    assert r.breakdown == {"left_m": 3.0, "right_m": 3.0}


def test_side_semi_detached_and_row():
    r = side_open_space(ProjectInputs(building_type="semi_detached", building_height_m=9, plot_width_m=10, **RES))
    assert r.breakdown == {"left_m": 0.0, "right_m": 2.5}
    r = side_open_space(ProjectInputs(building_type="row", building_height_m=9, **RES))
    assert r.breakdown == {"left_m": 0.0, "right_m": 0.0}


def test_side_proviso_needs_frontage():
    r = side_open_space(ProjectInputs(building_type="detached", building_height_m=6, **RES))
    assert r.status == Status.MORE_INFORMATION_NEEDED
    assert any(m.field == "plot_width_m" for m in r.missing_inputs)


def test_geometry_check_against_proposed_gaps():
    inp = ProjectInputs(plot_width_m=10, plot_depth_m=20, road_width_m=10, building_height_m=9,
                        building_width_m=8, building_depth_m=14, front_gap_m=3.0, left_gap_m=1.0, **RES)
    f = front_open_space(inp)
    assert f.zones[0].check == "below_minimum" and f.zones[0].proposed_gap_m == 3.0  # needs 3.6
    rr = rear_open_space(inp)
    assert rr.zones[0].proposed_gap_m == 3.0 and rr.zones[0].check == "meets_minimum"  # 200 sq m -> 2.5


@pytest.mark.parametrize("area,fee", [(50, 750), (75, 750), (76, 1250), (200, 2000), (201, 3000), (2500, 25000), (2501, 50000)])
def test_fee_slabs(area, fee):
    assert slab_fee(area)[0] == fee


def test_fee_slab_gap_is_not_guessed():
    fee, _, note = slab_fee(75.5)
    assert fee is None and "75" in note and "76" in note


def test_residential_fee_verified():
    r = building_permission_fee(ProjectInputs(built_up_area_sqm=180, building_height_m=9, storeys=2, **RES))
    assert r.status == Status.VERIFIED and r.value == 2000
    assert r.breakdown["application_fee_rs"] == 180.0
    assert r.citations[0].rule == "21" and r.citations[0].page == 36


def test_commercial_fee_adds_50_percent():
    r = building_permission_fee(ProjectInputs(built_up_area_sqm=180, building_height_m=9, storeys=2, building_use="commercial"))
    assert r.value == 3000


def test_high_rise_fee():
    r = building_permission_fee(ProjectInputs(built_up_area_sqm=5000, building_height_m=40, **RES))
    assert r.value == 50000.0 and r.citations[0].sub_rule == "(3)(c)"
    r = building_permission_fee(ProjectInputs(built_up_area_sqm=5000, building_height_m=40, building_use="commercial"))
    assert r.value == 100000.0


def test_fee_needs_area_use_and_high_rise_status():
    r = building_permission_fee(ProjectInputs())
    fields = {m.field for m in r.missing_inputs}
    assert {"built_up_area_sqm", "building_use", "building_height_m"} <= fields
    assert r.value is None and r.summary_en


def test_cinema_fee():
    r = building_permission_fee(ProjectInputs(built_up_area_sqm=3000, building_height_m=12, storeys=3, building_use="cinema", seating_capacity=900))
    assert r.value == 25000


@pytest.mark.parametrize("vc,v,h", [("low_medium", 2.5, 1.2), ("high_upto_33kv", 3.7, 1.2)])
def test_electric_clearance(vc, v, h):
    r = electric_line_clearance(ProjectInputs(voltage_class=vc))
    assert r.breakdown == {"vertical_m": v, "horizontal_m": h} and r.status == Status.VERIFIED


def test_electric_extra_high_and_missing():
    assert electric_line_clearance(ProjectInputs(voltage_class="extra_high")).breakdown["each_side_m"] == 7.5
    assert electric_line_clearance(ProjectInputs()).status == Status.MORE_INFORMATION_NEEDED


@pytest.mark.parametrize("bad", [dict(road_width_m=-1), dict(plot_area_sqm=0), dict(building_height_m=1e6),
                                 dict(building_use="palace"), dict(storeys=1.5), dict(road_width_m="ten")])
def test_invalid_inputs_rejected(bad):
    with pytest.raises(ValidationError):
        ProjectInputs(**bad)


def test_inconsistent_area_rejected():
    with pytest.raises(ValidationError):
        ProjectInputs(plot_width_m=10, plot_depth_m=20, plot_area_sqm=150)


def test_building_larger_than_plot_rejected():
    with pytest.raises(ValidationError):
        ProjectInputs(plot_width_m=10, building_width_m=9, left_gap_m=2)


def test_calculation_disabled_when_source_unverified(store):
    saved = dict(common.SOURCE_STATUS)
    try:
        common.SOURCE_STATUS["56_1_front"] = False
        with pytest.raises(SourceUnavailable):
            front_open_space(ProjectInputs(road_width_m=9, building_height_m=9, **RES))
    finally:
        common.SOURCE_STATUS.clear()
        common.SOURCE_STATUS.update(saved)
