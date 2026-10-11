"""Known regulatory-version gaps in the supplied consolidated rulebook.

The amendment text itself is NOT loaded or merged: the supplied data does not contain it.
"""
from __future__ import annotations

import re

from app.models.schemas import ProjectInputs, Warning

CONSOLIDATION_DATE = "6 March 2025"

AMENDMENT_2026 = Warning(
    code="AMENDMENT_2026_RULE_2_5_C",
    title="Version review needed: 28 Aug 2026 amendment to Rule 2(5)(c)",
    detail=(
        "The supplied rulebook is consolidated only up to 6 March 2025. On 28 August 2026 Rule 2(5)(c), "
        "concerning plots up to 500 sq m, was amended. That amendment is not in the supplied data and has not "
        "been verified by NIYAMLENS, so this answer may not reflect the current law for such plots. Verify "
        "against the official notification before relying on it."
    ),
    source_url="https://teamleaseregtech.com/updates/article/59469/government-of-madhya-pradesh-amendment-to-land-development-rules",
    affected_rules=["2"],
)

HINDI_PREVAILS = Warning(
    code="HINDI_TEXT_PREVAILS",
    title="English text is a translation",
    detail=(
        "Quotations are from the English consolidated copy. A court comment printed under Rule 4 (PDF p. 15, "
        "Kurban Hussain v. Indore Municipal Corporation) records that the English version is a translation and the "
        "Hindi version prevails. Hindi explanations shown here are not quotations from the official Hindi PDF."
    ),
)

PERMISSION_TERMS = re.compile(
    r"development permission|separate permission|need (?:a |any )?permission|permission (?:is )?(?:needed|required)|"
    r"who (?:grants|gives|issues)|विकास अनुज्ञा|विकास अनुमति|अनुमति (?:चाहिए|लेनी|जरूरी)",
    re.I,
)
EXPLICIT_TERMS = re.compile(r"2\s*\(\s*5\s*\)|500\s*(?:sq|वर्ग)|august\s*2026|अगस्त\s*2026|28\.?0?8\.?2026", re.I)


def warnings_for(question: str, rules: list[str], inputs: ProjectInputs) -> list[Warning]:
    """Flag answers that may be affected by the 28 Aug 2026 amendment to Rule 2(5)(c)."""
    area = inputs.effective_plot_area()
    explicit = bool(EXPLICIT_TERMS.search(question))
    permission_q = bool(PERMISSION_TERMS.search(question))
    if explicit or (permission_q and area is not None and area <= 500):
        return [AMENDMENT_2026]
    return []
