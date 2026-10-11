"""Browser end-to-end check of the main clerk journey against a running server.

Usage:  python frontend/e2e/journey.py http://127.0.0.1:8000 [screenshot_dir]
Requires: pip install playwright && python -m playwright install chromium
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None
Q1 = "My house faces a 10 m wide street and will be 9 m tall. How much open space do I leave at the front?"


def shot(page, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def main() -> None:
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE + "/")
        expect(page.get_by_text("106 rules")).to_be_visible(timeout=15000)
        expect(page.get_by_text("No plot drawn yet")).to_be_visible()
        shot(page, "01-empty")

        # 1. Ask a sample question (English) -> verified 3.6 m with Rule 56 evidence.
        page.get_by_label("Question in English or Hindi").fill(Q1)
        page.get_by_role("button", name="Ask").click()
        insp = page.get_by_label("Regulation inspector")
        expect(insp.get_by_text("3.6 m").first).to_be_visible(timeout=15000)
        expect(insp.get_by_text("PDF p. 77").first).to_be_visible()
        expect(insp.locator("[data-status=VERIFIED]").first).to_be_visible()
        print("ok: question -> verified 3.6 m, Rule 56, PDF p.77")

        # 2. Example inputs + evaluate -> plot drawn with rule-linked zones.
        page.get_by_role("button", name="Example").click()
        page.get_by_role("button", name="Evaluate requirement").click()
        expect(insp.get_by_text("Rule-to-geometry results")).to_be_visible(timeout=15000)
        expect(insp.get_by_text("Minimum rear open space", exact=True)).to_be_visible()
        page.wait_for_timeout(2500)
        canvas = page.locator("canvas")
        print("ok: evaluation; 3D canvas present =", canvas.count() > 0)
        shot(page, "02-evaluated-3d")

        # 3. Select a zone in plan view -> inspector shows the linked rule.
        page.get_by_role("button", name="Plan").click()
        page.get_by_role("button", name="Front open space ≥ 3 m, rule 56(1)(a)").click()
        expect(insp.get_by_text("Front open space ≥ 3 m — Rule 56(1)(a)")).to_be_visible()
        print("ok: plan zone click -> inspector selection")
        shot(page, "03-plan-selected")

        # 4. Not-found question.
        page.get_by_label("Question in English or Hindi").fill("How do I pay my property tax online?")
        page.get_by_role("button", name="Ask").click()
        expect(insp.get_by_text("Not found in the supplied rules.", exact=False).first).to_be_visible(timeout=15000)
        print("ok: out-of-scope -> Not found")

        # 5. Hindi question and receipt.
        page.get_by_label("Question in English or Hindi").fill("बिल्डिंग परमिशन की फीस कितनी है और किस नियम में लिखी है?")
        page.get_by_role("button", name="Ask").click()
        # Example inputs (180 sq m built-up, residential, 7 m, 2 storeys) are still in the form -> slab fee Rs. 2,000.
        expect(insp.locator("[data-status=VERIFIED]").first).to_be_visible(timeout=15000)
        expect(insp.get_by_text("2,000", exact=False).first).to_be_visible()
        expect(insp.locator("p[lang=hi]").first).to_be_visible()
        print("ok: Hindi fee question uses form inputs -> Rs. 2,000 (Rule 21(3)(b))")
        shot(page, "04-hindi")
        page.get_by_role("button", name="Counter Receipt").click()
        expect(page.get_by_text("Informational regulatory reference. Not an official building approval or legal opinion.")).to_be_visible()
        expect(page.get_by_text("Rule 21(3)(b)", exact=False).first).to_be_visible()
        shot(page, "05-receipt")
        page.reload()  # SPA fallback on a client route
        expect(page.get_by_label("Counter Receipt")).to_be_visible()
        print("ok: receipt renders and survives reload (SPA fallback)")

        # 6. Mobile layout.
        m = browser.new_page(viewport={"width": 390, "height": 844})
        m.goto(BASE + "/")
        expect(m.get_by_role("tab", name="Inspector")).to_be_visible(timeout=15000)
        m.get_by_role("tab", name="Inputs").click()
        expect(m.get_by_label("Width / frontage")).to_be_visible()
        shot(m, "06-mobile")
        print("ok: mobile tabs")
        browser.close()
    if errors:
        print("PAGE ERRORS:", errors)
        sys.exit(1)
    print("E2E journey passed")


if __name__ == "__main__":
    main()
