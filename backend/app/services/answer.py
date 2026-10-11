"""Question -> inputs -> retrieval -> calculations -> warnings -> explanation -> structured answer."""
from __future__ import annotations

from datetime import datetime, timezone

from app import calculations
from app.calculations.common import SourceUnavailable, fmt_m
from app.models.schemas import (
    AnswerRequest,
    AnswerResponse,
    AnswerText,
    CalcResult,
    Citation,
    MissingInput,
    ProjectInputs,
    SearchTrace,
    Status,
    Warning,
)
from app.rules.loader import RuleStore
from app.rules.version_warnings import HINDI_PREVAILS, warnings_for
from app.services.extraction import extract
from app.services.llm import LLMClient
from app.services.retrieval import Retriever

NOT_FOUND_EN = "Not found in the supplied rules."
NOT_FOUND_HI = "दिए गए नियमों में नहीं मिला।"
MIN_SCORE = 9.0
STATUS_PRIORITY = [
    Status.NOT_FOUND,
    Status.MORE_INFORMATION_NEEDED,
    Status.VERSION_REVIEW_NEEDED,
    Status.SOURCE_FOUND,
    Status.CALCULATION_COMPLETED,
    Status.VERIFIED,
]
HI_LABELS = {
    "front_open_space": "न्यूनतम सामने की खुली जगह",
    "rear_open_space": "न्यूनतम पीछे की खुली जगह",
    "side_open_space": "न्यूनतम बगल की खुली जगह",
    "building_permission_fee": "भवन अनुज्ञा शुल्क",
    "electric_line_clearance": "ओवरहेड बिजली लाइन से न्यूनतम दूरी",
}
HI_FIELDS = {
    "road_width_m": "सामने की सड़क की चौड़ाई (मीटर)",
    "building_height_m": "भवन की ऊंचाई (मीटर)",
    "storeys": "मंजिलों की संख्या",
    "building_use": "भवन का उपयोग (आवासीय/वाणिज्यिक आदि)",
    "building_type": "भवन का प्रकार (पृथक/अर्ध-पृथक/पंक्ति)",
    "plot_area_sqm": "प्लॉट का क्षेत्रफल (वर्ग मीटर)",
    "plot_width_m": "प्लॉट की सामने की चौड़ाई (मीटर)",
    "built_up_area_sqm": "प्रस्तावित निर्मित क्षेत्र (वर्ग मीटर)",
    "seating_capacity": "बैठने की क्षमता",
    "voltage_class": "लाइन का प्रकार (लो/मीडियम, हाई ≤33kV, एक्स्ट्रा हाई)",
}


HI_CONDITIONS = {
    "If the building is residential and up to 12.5 m high": "यदि भवन आवासीय है और ऊंचाई 12.5 मीटर तक है",
    "If the building is higher than 12.5 m": "यदि भवन 12.5 मीटर से ऊंचा है",
    "If the building is exclusively residential and not a high rise building": "यदि भवन केवल आवासीय है और बहुमंजिला (हाई राइज) नहीं है",
    "If it is a residential high rise building": "यदि यह आवासीय हाई राइज भवन है",
    "If the plot frontage is less than 12 m (height ≤ 7 m)": "यदि प्लॉट की सामने की चौड़ाई 12 मीटर से कम है (ऊंचाई ≤ 7 मीटर)",
    "If the plot frontage is up to 10 m (height ≤ 10 m)": "यदि प्लॉट की सामने की चौड़ाई 10 मीटर तक है (ऊंचाई ≤ 10 मीटर)",
    "If the plot is in an existing developed area (street narrower than 6.0 m)": "यदि प्लॉट मौजूदा विकसित क्षेत्र में है (सड़क 6.0 मीटर से कम चौड़ी)",
}
HI_RESULT_WORDS = [
    ("street width row", "सड़क चौड़ाई पंक्ति"),
    ("plot area row", "प्लॉट क्षेत्रफल पंक्ति"),
    ("Up to 9.0 meters", "9.0 मीटर तक"),
    ("Permission fee", "अनुज्ञा शुल्क"),
    ("slab", "स्लैब"),
    ("Rule 42 Table 4/5 applies (needs height, storeys, plot area and frontage)",
     "नियम 42 की तालिका 4/5 लागू (ऊंचाई, मंजिलें, प्लॉट क्षेत्रफल और सामने की चौड़ाई आवश्यक)"),
    (" m (", " मीटर ("),
    (" m ", " मीटर "),
    (" m)", " मीटर)"),
    ("Rs.", "रु."),
]


def rule_label(c: Citation) -> str:
    return f"Rule {c.rule}{c.sub_rule or ''}"


def derive_statuses(not_found: bool, calcs: list[CalcResult], missing: list[MissingInput], warnings: list[Warning]) -> list[Status]:
    """Case statuses, most severe first. Shared by /api/answer and /api/explain."""
    statuses: list[Status] = []
    if not_found:
        statuses.append(Status.NOT_FOUND)
    else:
        for calc in calcs:
            if calc.status == Status.VERIFIED:
                statuses += [Status.VERIFIED, Status.CALCULATION_COMPLETED]
            else:
                statuses.append(calc.status)
        if missing:
            statuses.append(Status.MORE_INFORMATION_NEEDED)
        if not calcs or any(c.status == Status.SOURCE_FOUND for c in calcs):
            statuses.append(Status.SOURCE_FOUND)
        if any(w.code.startswith("AMENDMENT") for w in warnings):
            statuses.append(Status.VERSION_REVIEW_NEEDED)
    return sorted(set(statuses), key=STATUS_PRIORITY.index)


class AnswerService:
    def __init__(self, store: RuleStore, retriever: Retriever, llm: LLMClient):
        self.store, self.retriever, self.llm = store, retriever, llm

    # ------------------------------------------------------------------ helpers
    def _rule_citation(self, rule_id: str) -> Citation | None:
        emb = self.store.find_embedded(rule_id)
        if emb:
            _, chunk = emb
            return Citation(rule=rule_id, title=f"(printed inside Rule {chunk.rule}) {chunk.title}", page=chunk.page,
                            passage=chunk.text.strip(), chunk_id=chunk.chunk_id)
        chunks = self.store.chunks_for(rule_id)
        if not chunks:
            return None
        c = chunks[0]
        text = c.text.strip()
        if len(text) < 300 and len(chunks) > 1 and chunks[1].page == c.page:
            text += "\n" + chunks[1].text.strip()
        return Citation(rule=c.rule, sub_rule=c.sub_rule, title=c.title, page=c.page, passage=text, chunk_id=c.chunk_id)

    @staticmethod
    def _merge_inputs(form: ProjectInputs | None, extracted: dict) -> ProjectInputs:
        base = form.model_dump(exclude_none=True) if form else {}
        base.update(extracted)  # values stated in the question are the most specific statement of the case
        return ProjectInputs.model_validate(base)

    # ------------------------------------------------------------------ main
    def answer(self, req: AnswerRequest) -> AnswerResponse:
        ex = extract(req.question)
        lang = ex.language
        inputs = self._merge_inputs(req.inputs, ex.values)
        use_ai = req.use_ai and self.llm.available

        direct = self.retriever.direct_rules(req.question)
        hits, terms = self.retriever.search(req.question, k=8)
        top = hits[0].score if hits else 0.0
        if use_ai and not ex.out_of_scope_topic and (lang == "hi" or top < 2 * MIN_SCORE) and not direct:
            extra = self.llm.search_terms(req.question)
            if extra:
                hits2, terms2 = self.retriever.search(req.question, k=8, extra_terms=extra)
                if hits2 and hits2[0].score > top:
                    hits, terms, top = hits2, terms2, hits2[0].score

        calcs: list[CalcResult] = []
        if not ex.out_of_scope_topic:
            for intent in dict.fromkeys(ex.intents):
                try:
                    calcs += calculations.run(intent, inputs)
                except SourceUnavailable:
                    pass

        not_found = bool(ex.out_of_scope_topic) or (not direct and not calcs and top < MIN_SCORE)

        citations: list[Citation] = []
        seen: set[str] = set()

        def add(c: Citation | None):
            if c and (c.chunk_id or c.passage[:80]) not in seen:
                seen.add(c.chunk_id or c.passage[:80])
                citations.append(c)

        if not not_found:
            for calc in calcs:
                for c in calc.citations:
                    add(c)
                if calc.status == Status.SOURCE_FOUND and any("Rule 57" in n for n in calc.notes):
                    add(self._rule_citation("57"))
            for rid in direct:
                add(self._rule_citation(rid))
            rule_order: list[str] = []
            for h in hits:
                if h.score < MIN_SCORE * 0.6 or len(citations) >= 6:
                    break
                if calcs and h.chunk.rule not in {c.rule for c in citations} and len(rule_order) >= 1:
                    continue
                rule_order.append(h.chunk.rule)
                add(Citation(rule=h.chunk.rule, sub_rule=h.chunk.sub_rule, title=h.chunk.title, page=h.chunk.page,
                             passage=h.chunk.text.strip(), chunk_id=h.chunk.chunk_id, score=h.score))

        missing: list[MissingInput] = []
        for calc in calcs:
            for m in calc.missing_inputs:
                if m.field not in {x.field for x in missing}:
                    missing.append(m)

        warnings = [] if not_found else warnings_for(req.question, [c.rule for c in citations], inputs)
        if lang == "hi" and not not_found:
            warnings.append(HINDI_PREVAILS)

        statuses = derive_statuses(not_found, calcs, missing, warnings)
        primary = statuses[0]

        summary = self._template(lang, req.question, not_found, ex.out_of_scope_topic, calcs, citations, missing, terms)
        answer = AnswerText(text=summary, source="template",
                            note=None if self.llm.available else "Live AI explanation is not configured; showing a deterministic summary.")
        if use_ai and not not_found:
            evidence = [{"id": f"E{i + 1}", "rule": rule_label(c), "page": c.page, "text": c.passage[:1400]}
                        for i, c in enumerate(citations[:6])]
            facts = self._facts(calcs, missing)
            out = self.llm.explain(req.question, lang, evidence, facts)
            if out:
                answer = AnswerText(text=out.answer, source="ai", model=self.llm.model,
                                    note="AI explanation of the quoted sources. Check against the quoted rule text.")
            else:
                answer.note = "AI explanation unavailable or rejected by validation; showing a deterministic summary."
        elif use_ai and not_found:
            answer.note = None

        extracted = {k: v for k, v in ex.values.items()}
        return AnswerResponse(
            question=req.question,
            language=lang,
            answer=answer,
            primary_status=primary,
            statuses=statuses,
            citations=citations,
            calculations=calcs,
            missing_inputs=missing,
            warnings=warnings,
            extracted_inputs=extracted,
            search=SearchTrace(query_terms=terms[:24], top_score=round(top, 3),
                               rules_considered=list(dict.fromkeys(h.chunk.rule for h in hits))[:8]),
            ai_available=self.llm.available,
            generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )

    # ------------------------------------------------------------------ text
    @staticmethod
    def _facts(calcs: list[CalcResult], missing: list[MissingInput]) -> list[str]:
        facts = []
        for c in calcs:
            if c.display_value:
                facts.append(f"{c.label}: {c.display_value} [{c.status.value}]")
            facts += c.steps + c.notes
            facts += [f"{r.condition}: {r.result} (Rule {r.rule})" for r in c.conditional_results]
        facts += [f"Missing input: {m.label} — {m.reason}" for m in missing]
        return facts

    def _template(self, lang, question, not_found, oos_topic, calcs, citations, missing, terms) -> str:
        hi = lang == "hi"
        if not_found:
            if hi:
                why = f" ({oos_topic} — यह विषय भूमि विकास नियम 2012 में शामिल नहीं है।)" if oos_topic else ""
                return f"{NOT_FOUND_HI}{why} खोजे गए शब्द: {', '.join(terms[:8])}."
            why = f" The topic ({oos_topic}) is outside the M.P. Bhumi Vikas Rules, 2012." if oos_topic else ""
            return f"{NOT_FOUND_EN}{why} Searched the 106 supplied rule records for: {', '.join(terms[:8])}."
        lines: list[str] = []
        for c in calcs:
            ref = citations and next((x for x in c.citations), None)
            refs = f"Rule {ref.rule}{ref.sub_rule or ''}, PDF p. {ref.page}" if ref else ""
            label = HI_LABELS.get(c.calc_type, c.label) if hi else c.label
            if c.display_value and c.status in (Status.VERIFIED, Status.CALCULATION_COMPLETED):
                val = c.display_value
                if hi:
                    val = val.replace(" m", " मीटर").replace("Rs.", "रु.").replace("Left", "बाएं").replace("Right", "दाएं").replace("Vertically", "ऊर्ध्वाधर").replace("Horizontally", "क्षैतिज")
                    lines.append(f"{label}: {val} ({refs.replace('Rule', 'नियम').replace('PDF p.', 'PDF पृष्ठ')}).")
                else:
                    lines.append(f"{label}: {val} ({refs}).")
            elif c.display_value:
                lines.append(f"{label}: {c.display_value} ({refs}) — {'पूरी जानकारी आवश्यक' if hi else 'needs more information'}.")
            elif c.status == Status.SOURCE_FOUND:
                lines.append(" ".join(c.notes))
            else:
                if hi:
                    hrefs = refs.replace("Rule", "नियम").replace("PDF p.", "PDF पृष्ठ")
                    lines.append(f"{label} ({hrefs}): अभी तय नहीं किया जा सकता।")
                    if c.summary_hi:
                        lines.append(c.summary_hi)
                else:
                    lines.append(f"{label} ({refs}): cannot be determined yet.")
                    if c.summary_en:
                        lines.append(c.summary_en)
            for r in c.conditional_results:
                if hi:
                    cond = HI_CONDITIONS.get(r.condition, r.condition)
                    result = r.result
                    for en, hn in HI_RESULT_WORDS:
                        result = result.replace(en, hn)
                    lines.append(f"• {cond}: {result} (नियम {r.rule}).")
                else:
                    lines.append(f"• {r.condition}: {r.result} (Rule {r.rule}).")
        if missing:
            names = [HI_FIELDS.get(m.field, m.label) if hi else m.label for m in missing]
            lines.append(("आवश्यक जानकारी: " if hi else "Information needed: ") + "; ".join(names) + ".")
        if not calcs and citations:
            c = citations[0]
            others = sorted({x.rule for x in citations[1:4] if x.rule != c.rule}, key=lambda r: (len(r), r))
            if hi:
                lines.append(f"सबसे प्रासंगिक नियम: नियम {c.rule} — {c.title} (PDF पृष्ठ {c.page})। नीचे दिया गया मूल अंश पढ़ें।")
                if others:
                    lines.append("संबंधित नियम: " + ", ".join(others) + "।")
                lines.append("MIRA ने इस नियम को आपके मामले पर लागू करके कोई निष्कर्ष नहीं निकाला है।")
            else:
                lines.append(f"Most relevant supplied rule: Rule {c.rule} — {c.title} (PDF p. {c.page}). Read the quoted passage below.")
                if others:
                    lines.append("Also see Rule " + ", ".join(others) + ".")
                lines.append("MIRA has located the source text but has not applied it to your case.")
        return " ".join(lines)


__all__ = ["AnswerService", "NOT_FOUND_EN", "derive_statuses", "fmt_m"]
