"""Registry of supported, source-verified calculations."""
from app.calculations.electric import electric_line_clearance
from app.calculations.fees import building_permission_fee
from app.calculations.setbacks import front_open_space, rear_open_space, side_open_space, site_open_spaces
from app.models.schemas import CalcResult, ProjectInputs

SINGLE = {
    "front_open_space": front_open_space,
    "rear_open_space": rear_open_space,
    "side_open_space": side_open_space,
    "building_permission_fee": building_permission_fee,
    "electric_line_clearance": electric_line_clearance,
}


def run(calc_type: str, inputs: ProjectInputs) -> list[CalcResult]:
    if calc_type == "site_open_spaces":
        return site_open_spaces(inputs)
    return [SINGLE[calc_type](inputs)]
