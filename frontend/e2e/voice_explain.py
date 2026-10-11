"""Browser end-to-end check of the Voice Guide, Explain with AI and Read Aloud against a running server.

Usage:  python frontend/e2e/voice_explain.py http://127.0.0.1:8000 [screenshot_dir]
Requires: pip install playwright && python -m playwright install chromium

Speech output is captured by an injected SpeechSynthesis double (headless browsers have no audio), so
the test can assert what was narrated, in which language, and that stale narration was cancelled.
getUserMedia is replaced by a tripwire: the journey fails if anything asks for the microphone.
Run without CEREBRAS_API_KEY to exercise the basic (deterministic) explanation path.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None
Q1 = "My house faces a 10 m wide street and will be 9 m tall. How much open space do I leave at the front?"
DEVANAGARI = re.compile(r"[ऀ-ॿ]")

FAKE_SPEECH = """
(() => {
  const queue = [];
  const state = { log: [], cancels: 0 };
  window.__speech = state;
  class FakeUtterance {
    constructor(text) { this.text = text || ""; this.lang = ""; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1;
      this.onstart = null; this.onend = null; this.onerror = null; }
    addEventListener() {} removeEventListener() {}
  }
  const voices = [
    { lang: "en-IN", name: "Test English (India)", voiceURI: "t-en", localService: true, default: true },
    { lang: "hi-IN", name: "Test Hindi (India)", voiceURI: "t-hi", localService: true, default: false },
  ];
  const synth = {
    get speaking() { return queue.length > 0; },
    get pending() { return queue.length > 1; },
    paused: false,
    speak(u) { state.log.push({ text: u.text, lang: u.lang, voice: u.voice ? u.voice.name : null }); queue.push(u); },
    cancel() { state.cancels++; const d = queue.splice(0); d.forEach((u, i) => u.onerror && u.onerror({ error: i === 0 ? "interrupted" : "canceled" })); },
    pause() {}, resume() {},
    getVoices() { return voices; },
    addEventListener() {}, removeEventListener() {},
  };
  window.__speechFinishAll = () => { for (let i = 0; i < 50 && queue.length; i++) { const u = queue.shift(); u.onend && u.onend({}); } };
  window.__speechQueued = () => queue.length;
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = FakeUtterance;
  window.__gum = 0;
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = () => { window.__gum++; return Promise.reject(new Error("microphone blocked by test")); };
  }
})();
"""


def shot(page, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def speech(page) -> dict:
    return page.evaluate("() => ({ log: window.__speech.log, cancels: window.__speech.cancels, queued: window.__speechQueued() })")


def main() -> None:
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        ctx.add_init_script(FAKE_SPEECH)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE + "/")
        expect(page.get_by_text("106 rules")).to_be_visible(timeout=15000)
        assert speech(page)["log"] == [], "nothing may be spoken on page load"

        # 1-3. Voice Guide: open, start, navigate.
        page.get_by_role("button", name="Voice Guide").click()
        guide = page.get_by_role("dialog", name=re.compile("Voice Guide"))
        expect(guide).to_be_visible()
        assert speech(page)["log"] == [], "opening the guide must not speak"
        guide.get_by_role("button", name="Start Guide").click()
        expect(guide.get_by_text("Step 1 of 7", exact=True)).to_be_visible()
        s = speech(page)
        assert s["log"] and s["log"][-1]["lang"].startswith("en"), s
        print("ok: guide started; narration in English")
        shot(page, "10-guide-step1")

        before = speech(page)
        guide.get_by_role("button", name="Next").click()
        expect(guide.get_by_text("Step 2 of 7", exact=True)).to_be_visible()
        after = speech(page)
        assert after["cancels"] > before["cancels"], "moving to the next step must cancel the previous narration"
        guide.get_by_role("button", name="Next").click()
        guide.get_by_role("button", name="Next").click()
        expect(guide.get_by_text("Step 4 of 7", exact=True)).to_be_visible()
        shot(page, "11-guide-step4-viewport")
        guide.get_by_role("button", name="Pause Voice").click()
        expect(guide.get_by_role("button", name="Resume Voice")).to_be_visible()
        guide.get_by_role("button", name="Resume Voice").click()
        guide.get_by_role("button", name="Stop Voice").click()
        assert speech(page)["queued"] == 0, "Stop Voice must silence narration"
        guide.get_by_role("button", name="Previous").click()
        expect(guide.get_by_text("Step 3 of 7", exact=True)).to_be_visible()
        guide.get_by_role("button", name="Previous").focus()
        page.keyboard.press("ArrowRight")
        expect(guide.get_by_text("Step 4 of 7", exact=True)).to_be_visible()
        guide.get_by_role("button", name="Play Voice").click()
        guide.get_by_role("button", name="Close Guide").click()
        expect(guide).to_be_hidden()
        assert speech(page)["queued"] == 0, "closing the guide must stop narration"
        expect(page.get_by_role("button", name="Voice Guide")).to_be_focused()
        print("ok: guide navigation, pause/resume/stop, keyboard, close stops speech, focus restored")

        # 4-5. Ask a supported question and inspect the rule.
        page.get_by_label("Question in English or Hindi").fill(Q1)
        page.get_by_role("button", name="Ask").click()
        insp = page.get_by_label("Regulation inspector")
        expect(insp.get_by_text("3.6 m").first).to_be_visible(timeout=15000)
        insp.get_by_role("button", name=re.compile(r"R56\(1\)\(a\)")).first.click()
        expect(page.get_by_text("Full rule text")).to_be_visible(timeout=10000)
        page.keyboard.press("Escape")
        print("ok: answer 3.6 m; rule drawer opened")

        # 6-7. Explain with AI (no key on the server -> labelled basic explanation).
        insp.get_by_role("button", name="Explain with AI: this result").click()
        expect(insp.get_by_text(re.compile(r"Basic explanation|AI explanation")).first).to_be_visible(timeout=20000)
        expect(insp.get_by_text(re.compile(r"Official source text")).first).to_be_visible()
        expect(insp.get_by_text(re.compile(r"PDF p\. 77")).first).to_be_visible()
        print("ok: explanation shown with official source text")
        shot(page, "12-explain-result")

        # 8-9. Read aloud, then stop.
        n = len(speech(page)["log"])
        insp.get_by_role("button", name="Read Aloud").click()
        s = speech(page)
        assert len(s["log"]) > n and s["log"][-1]["lang"].startswith("en"), s
        insp.get_by_role("group", name="Read aloud controls").get_by_role("button", name="Stop").click()
        assert speech(page)["queued"] == 0
        print("ok: read aloud spoke the explanation and stopped")

        # 10-11. Select a visual constraint and explain it.
        page.get_by_role("button", name="Example").click()
        page.get_by_role("button", name="Evaluate requirement").click()
        expect(insp.get_by_text("Rule-to-geometry results")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="Plan", exact=True).click()
        page.get_by_role("button", name="Front open space ≥ 3 m, rule 56(1)(a)").click()
        insp.get_by_role("button", name="Explain with AI: selected constraint").click()
        expect(insp.get_by_text(re.compile(r"Front open space")).first).to_be_visible(timeout=20000)
        print("ok: selected constraint explained")
        shot(page, "13-explain-constraint")

        # 12-13. Change language -> Hindi explanation and Hindi narration; the guide follows the choice.
        insp.get_by_role("group", name="Explanation language").get_by_role("button", name=re.compile("Hindi")).click()
        expect(insp.locator("[lang=hi]").first).to_be_visible(timeout=20000)
        assert DEVANAGARI.search(insp.locator("[lang=hi]").first.inner_text())
        n = len(speech(page)["log"])
        insp.get_by_role("button", name="Read Aloud").click()
        s = speech(page)
        assert len(s["log"]) > n and s["log"][-1]["lang"].startswith("hi"), s
        insp.get_by_role("group", name="Read aloud controls").get_by_role("button", name="Stop").click()
        shot(page, "14-explain-hindi")
        page.get_by_role("button", name="Voice Guide").click()
        guide = page.get_by_role("dialog")
        expect(guide).to_be_visible()
        assert DEVANAGARI.search(guide.inner_text()), "guide should follow the chosen Hindi language"
        shot(page, "15-guide-hindi")
        page.keyboard.press("Escape")
        print("ok: Hindi explanation + narration; guide in Hindi")

        # Mobile: guide as a bottom sheet; app still usable.
        m = ctx.new_page()
        m.set_viewport_size({"width": 390, "height": 844})
        m.goto(BASE + "/")
        expect(m.get_by_role("tab", name="Inspector")).to_be_visible(timeout=15000)
        m.get_by_role("button", name="Voice Guide").click()
        expect(m.get_by_role("dialog")).to_be_visible()
        shot(m, "16-mobile-guide")
        m.get_by_role("tab", name="Inputs").click()
        expect(m.get_by_label("Width / frontage")).to_be_visible()
        print("ok: mobile guide sheet; tabs still usable")

        gum = page.evaluate("() => window.__gum") + m.evaluate("() => window.__gum")
        assert gum == 0, "microphone must never be requested"
        browser.close()
    if errors:
        print("PAGE ERRORS:", errors)
        sys.exit(1)
    print("Voice Guide / Explain with AI journey passed")


if __name__ == "__main__":
    main()
