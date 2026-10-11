"""Numeric tables used by deterministic calculations.

Every value below was checked by hand against the text layer of the supplied English PDF
(MP_Bhumi_Vikas_Rules_2012_upto_2025-03-06_EN.pdf) on the stated PDF page, and against the
supplied page text file. ``source_quote`` is an exact excerpt of the supplied rule text; at
startup :func:`verify_against_store` confirms each quote still exists in the loaded JSONL rule
and on the stated page, so a changed or mismatched data file disables the calculation instead of
silently producing numbers.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.rules.loader import RuleStore, squash


@dataclass(frozen=True)
class VerifiedSource:
    key: str
    rule: str
    sub_rule: str
    title: str
    page: int
    source_quote: str


SOURCES: dict[str, VerifiedSource] = {
    s.key: s
    for s in [
        VerifiedSource(
            key="56_1_front",
            rule="56",
            sub_rule="(1)(a)",
            title="Residential Buildings — Front open spaces",
            page=77,
            source_quote=(
                "Every Residential Building having height up to 12.5 meters, facing street\n"
                "shall have a front open space mentioned below and such open space shall\n"
                "form an integral part of the site :-\n"
                "S.No. Width of street facing the plot Front open space Min.\n"
                "(1) (2) (3)\n"
                "1. Up to 9.0 meters 3.0 meters\n"
                "2. More than 9.0 meters and up to 12 meters 3.6 meters\n"
                "3. More than 12.0 meters and up to 18 meters 4.5 meters\n"
                "4. Above 18 meters 6.0 meters"
            ),
        ),
        VerifiedSource(
            key="56_1_b_narrow",
            rule="56",
            sub_rule="(1)(b)",
            title="Residential Buildings — Building line on narrow streets",
            page=77,
            source_quote=(
                "In existing developed areas with streets less than 6.0 meters in width, the\n"
                "distances of the building (building line) shall be at 6.0 meters from the\n"
                "center line of the street."
            ),
        ),
        VerifiedSource(
            key="56_2_rear",
            rule="56",
            sub_rule="(2)(a)",
            title="Residential Buildings — Rear open space",
            page=78,
            source_quote=(
                "Every Residential Building, having height up to 12.5 meters, shall have\n"
                "a Rear Open Space, as below:-\n"
                "S.No. Plot area in Square meters Minimum Rear Open space in meters\n"
                "(1) (2) (3)\n"
                "1. Up to 40.00 Nil\n"
                "2. Above 40.00 and up to 150.00 1.50\n"
                "3. Above 150 and up to 225.00 2.50\n"
                "4. Above 225.00 3.00"
            ),
        ),
        VerifiedSource(
            key="56_3_side",
            rule="56",
            sub_rule="(3)",
            title="Residential Buildings — Side open space",
            page=78,
            source_quote=(
                "(i) For detached buildings there shall be minimum side open spaces of 3\n"
                "meters on both the sides :\n"
                "Provided that for detached residential building up to 7 meters in\n"
                "height on plots with a frontage less than 12 meters, one of the sides open\n"
                "space may be reduced to 1.5 meters.\n"
                "(ii) For semi-detached building there shall be a minimum side open space of\n"
                "3.0 meters on one side. For Semi-detached building up to 10 meters in\n"
                "height on plots with a frontage up to 10 meters, the side open space may\n"
                "be reduced to 2.5 meters.\n"
                "(iii) For row-type buildings, no side open space is required."
            ),
        ),
        VerifiedSource(
            key="56_5_above_12_5",
            rule="56",
            sub_rule="(5)",
            title="Residential Buildings — Buildings above 12.5 m",
            page=78,
            source_quote=(
                "Open space for building of more than 12.5 meters height - For building of\n"
                "height above 12.5 meters the open spaces around building shall be as given in\n"
                "Table 4 and 5 of Rule 42."
            ),
        ),
        VerifiedSource(
            key="21_2_application_fee",
            rule="21",
            sub_rule="(2)(ii)",
            title="Fees — Application fee for building permission",
            page=35,
            source_quote=(
                "(ii) for the Building Permission Rs 1.00 per Square meter of the proposed built-\n"
                "up area."
            ),
        ),
        VerifiedSource(
            key="21_3_b_fee",
            rule="21",
            sub_rule="(3)(b)",
            title="Fees — Building permission fee (other than high rise buildings)",
            page=36,
            source_quote=(
                "(b) In case of a building permission (other than high rise buildings)\n"
                "Item Type of construction Built up area Fees\n"
                "No. Sq.m. To Chargeable\n"
                "Sq.m. in Rs.\n"
                "(1) (2) (3) (4) (5)\n"
                "1. A building intended to be used 0 75 750\n"
                "exclusively as residence 76 125 1,250\n"
                "126 200 2,000\n"
                "201 300 3,000\n"
                "301 400 4,000\n"
                "401 600 6,000\n"
                "601 750 7,500\n"
                "751 1,000 10,000\n"
                "1,001 1,250 12,500\n"
                "1,251 1,500 15,000\n"
                "1,501 2,000 20,000\n"
                "2,001 2,500 25,000\n"
                "above 2500 50,000"
            ),
        ),
        VerifiedSource(
            key="21_3_b_other_uses",
            rule="21",
            sub_rule="(3)(b)",
            title="Fees — Other building uses (items 2–6)",
            page=36,
            source_quote=(
                "2. A building intended to be used as shops, Fees as prescribed in item No. 1\n"
                "store house, factory or carrying on trade together with additional charge of\n"
                "or business or any other commercial or 50% of such amount of fees.\n"
                "industrial purpose.\n"
                "3. A building intended to be used as Fees as prescribed in item No. 1.\n"
                "administrative block in a factory.\n"
                "4. A building intended to be used for shops Fees as prescribed in item No. 1\n"
                "cum residence purpose. together with an additional charge of\n"
                "50% of such amount of fees.\n"
                "5. A building intended to be used as Upto 800 seating capacity Rs.\n"
                "Cinema Theatres. 15,000.00 above 800 seating\n"
                "capacity Rs. 25,000.00\n"
                "6. A building intended to be used for any Same as in item No. 1."
            ),
        ),
        VerifiedSource(
            key="21_3_c_high_rise_fee",
            rule="21",
            sub_rule="(3)(c)",
            title="Fees — Building permission fee for high rise buildings",
            page=37,
            source_quote=(
                "1. A building intended to be used Rs. 10.00 per square meter of the\n"
                "exclusively for residence. built up area.\n"
                "2. A building intended to be used as Fees as prescribed in item No. 1\n"
                "shops, storehouse, factory or for with additional charges of 100% of\n"
                "carrying on trade or business or any amount of fees."
            ),
        ),
        VerifiedSource(
            key="2_38_high_rise",
            rule="2",
            sub_rule="(38)",
            title="Definitions — high rise building",
            page=8,
            source_quote=(
                "(38) \"high rise building\" means a building,—\n"
                "(a) which consists of more than ten stories; or\n"
                "(b) which has a height of more than 30 meters;"
            ),
        ),
        VerifiedSource(
            key="52_1_electric",
            rule="52",
            sub_rule="(1)",
            title="Distance from electric lines",
            page=69,
            source_quote=(
                "S.No. Particulars Vertically meters Horizontally meters\n"
                "(1) (2) (3) (4)\n"
                "(a) Low and Medium voltage 2.5 1.2\n"
                "lines and service lines\n"
                "(b) High voltage lines up to and 3.7 1.2\n"
                "including 33000 volts\n"
                "(c) Extra high voltage lines (see note)\n"
                "beyond 33000 volts\n"
                "Note: For building close to extra high voltage lines beyond 33000 volts, clear\n"
                "horizontal corridor of 15 meters (7.5 meter open both side of centre line), or as specified\n"
                "in the applicable Electricity Rules, whichever is more, shall be provided."
            ),
        ),
        VerifiedSource(
            key="42_table4",
            rule="42",
            sub_rule="(1) Table 4",
            title="Buildings with height above 12.5 m and up to 30 m — Table 4",
            page=58,
            source_quote=(
                "1. 12.0 m. 1000 sq. 18 m. 1:1.50 - Up to 18 7.5 6.0\n"
                "and m. meters\n"
                "above\n"
                "2. 18 m. & 1500 sq. 21 m. 1:1.75 - Up to 24 9.0 6.0\n"
                "above m. meters\n"
                "3. 24 m. & 2000 sq. 30 m. 1:2.0 -] Up to 30 12.00 7.5 m."
            ),
        ),
        VerifiedSource(
            key="42_table5",
            rule="42",
            sub_rule="(2) Table 5",
            title="High rise buildings — Table 5",
            page=59,
            source_quote=(
                "1. 30 m. 2500 30 m. 1:2.25 30 Up to 45 15.00 m. 7.5 m.\n"
                "and meters\n"
                "above\n"
                "2. 36 m. 3000 40 m. 1:2.50 30 Up to 60 18.00 m. 9.0 m.\n"
                "and meters\n"
                "above\n"
                "3. 45 m. 3500 45 m. 1:2.75 30 Up to 75 21 m. 9 m.\n"
                "and meters\n"
                "above\n"
                "4. 60 m. 4000 50 m. 1:3.0 30 Up to 90 24.00 10 m.\n"
                "and meters\n"
                "above\n"
                "5. 75 m. 4500 60 m. 1:3.0 30 Above 30.00 12 m."
            ),
        ),
    ]
}

# --- Rule 56(1)(a): (upper bound of street width in m, inclusive; None = no upper bound) -> front open space m
FRONT_OPEN_SPACE_56 = [(9.0, 3.0), (12.0, 3.6), (18.0, 4.5), (None, 6.0)]

# --- Rule 56(2)(a): (upper bound of plot area in sq m, inclusive) -> rear open space m (0 = "Nil")
REAR_OPEN_SPACE_56 = [(40.0, 0.0), (150.0, 1.5), (225.0, 2.5), (None, 3.0)]

# --- Rule 21(3)(b) item 1: printed slabs (from sq m, to sq m, fee Rs). Last slab is "above 2500".
FEE_SLABS_21_3_B = [
    (0, 75, 750),
    (76, 125, 1250),
    (126, 200, 2000),
    (201, 300, 3000),
    (301, 400, 4000),
    (401, 600, 6000),
    (601, 750, 7500),
    (751, 1000, 10000),
    (1001, 1250, 12500),
    (1251, 1500, 15000),
    (1501, 2000, 20000),
    (2001, 2500, 25000),
]
FEE_ABOVE_2500 = 50000
APPLICATION_FEE_PER_SQM = 1.00  # Rule 21(2)(ii)
HIGH_RISE_RESIDENTIAL_FEE_PER_SQM = 10.00  # Rule 21(3)(c) item 1

# Multipliers on item 1, keyed by building use: (multiplier for 21(3)(b), multiplier for 21(3)(c), item label)
USE_FEE_RULES = {
    "residential": (1.0, 1.0, "item 1 (exclusively residence)"),
    "commercial": (1.5, 2.0, "item 2 (shops/store house/factory/trade/commercial/industrial)"),
    "industrial_admin": (1.0, 1.0, "item 3 (administrative block in a factory)"),
    "shop_cum_residence": (1.5, 1.5, "item 4 (shop-cum-residence)"),
    "social_educational": (1.0, 1.0, "item 6 / 21(3)(c) item 5 (social, charitable, educational, other)"),
}
CINEMA_FEES = {"upto_800": 15000, "above_800": 25000}

# --- Rule 52(1): voltage class -> (vertical m, horizontal m)
ELECTRIC_CLEARANCE_52 = {
    "low_medium": (2.5, 1.2),
    "high_upto_33kv": (3.7, 1.2),
}
EXTRA_HIGH_CORRIDOR_EACH_SIDE = 7.5

# --- Rule 42 Table 4 (12.5 < h <= 30) and Table 5 (high rise):
# (max height m or None, min road m, min plot sqm, min frontage m, FAR, front MOS m, side/rear MOS m)
TABLE_4 = [
    (18.0, 12.0, 1000, 18.0, "1:1.50", 7.5, 6.0),
    (24.0, 18.0, 1500, 21.0, "1:1.75", 9.0, 6.0),
    (30.0, 24.0, 2000, 30.0, "1:2.0", 12.0, 7.5),
]
TABLE_5 = [
    (45.0, 30.0, 2500, 30.0, "1:2.25", 15.0, 7.5),
    (60.0, 36.0, 3000, 40.0, "1:2.50", 18.0, 9.0),
    (75.0, 45.0, 3500, 45.0, "1:2.75", 21.0, 9.0),
    (90.0, 60.0, 4000, 50.0, "1:3.0", 24.0, 10.0),
    (None, 75.0, 4500, 60.0, "1:3.0", 30.0, 12.0),
]


def verify_against_store(store: RuleStore) -> dict[str, bool]:
    """Return {source_key: ok}. A source is ok only if its quote is in the rule text and on its page."""
    result: dict[str, bool] = {}
    for key, src in SOURCES.items():
        rec = store.records.get(src.rule)
        in_rule = bool(rec) and squash(src.source_quote) in squash(rec.text)
        on_page = store.page_contains(src.page, src.source_quote) if store.pages else in_rule
        result[key] = in_rule and on_page
    return result
