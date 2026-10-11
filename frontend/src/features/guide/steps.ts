import { PRODUCT_NAME, PRODUCT_NAME_HI } from "@/lib/brand"
import type { SceneModel } from "@/lib/geometry"
import { INPUT_LABELS, type InspectionRecord } from "@/lib/record"
import { STATUS_META } from "@/lib/status"
import { BUILDING_TYPES, BUILDING_USES, VOLTAGE_CLASSES, type CalcResult, type Citation, type Side, type Status, type UiLanguage } from "@/types/api"

/**
 * Voice Guide content. Every step is a pure function of app state and language, so the text shown
 * and the text narrated are always the same and always come from state (never from DOM text).
 * Values (dimensions, rules, pages, statuses) are copied from server data; nothing is computed here.
 */

/** Regions the guide can point at. Workbench and the Regulation Inspector mark them with data-guide="…". */
export type GuideTarget =
  | "ask"
  | "inputs"
  | "viewport"
  | "inspector"
  | "guide-button"
  | "status"
  | "answer"
  | "explain"
  | "selection"
  | "warnings"
  | "missing"
  | "calculations"
  | "evidence"
  | "receipt"

export type GuideContext = {
  record: InspectionRecord | null
  selected: string | null
  scene: SceneModel
  aiConfigured: boolean
  /** Desktop three-panel layout (>= 1024px); otherwise the Inputs / Plot / Inspector tabs. */
  wide: boolean
  /** False when the browser cannot draw 3D and the Plan view is shown instead (default true). */
  webgl?: boolean
}

export type GuideStep = {
  id: string
  title: string
  paragraphs: string[]
  example?: string
  /** Regions to highlight, best first; the first one present and visible on screen is used. */
  highlight?: GuideTarget[]
}

export type StepBuilder = (ctx: GuideContext, lang: UiLanguage) => GuideStep

export const GUIDE_PANEL_ID = "voice-guide"
export const HI_ENGLISH_DISCLOSURE = "कुछ विवरण केवल अंग्रेज़ी में उपलब्ध हैं।"

export const EXAMPLE_QUESTION: Record<UiLanguage, string> = {
  en: "My house faces a 10 m wide street and will be 9 m tall. How much open space do I leave at the front?",
  hi: "मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है। आगे कितनी जगह खाली छोड़नी होगी?",
}

/** Panel chrome. Control names on the main screen stay in English because the screen is in English. */
export const GUIDE_TEXT = {
  en: {
    title: "Voice Guide",
    intro: `A short walkthrough of ${PRODUCT_NAME} in seven steps. Read along, listen, pause or stop at any time.`,
    language: "Guide language",
    start: "Start Guide",
    explainScreen: "Explain current screen",
    previous: "Previous",
    next: "Next",
    close: "Close Guide",
    currentScreen: "Current screen",
    tryThis: "Try this",
    progress: (n: number, total: number) => `Step ${n} of ${total}`,
    stepAnnouncement: (n: number, total: number, title: string) => `Step ${n} of ${total}: ${title}`,
    contextAnnouncement: (title: string) => `Current screen: ${title}`,
    playback: { group: "Voice playback", play: "Play Voice", pause: "Pause Voice", resume: "Resume Voice", stop: "Stop Voice", replay: "Replay" },
    unsupported:
      "Audio narration is not available in this browser. The written guide works fully. To hear narration, use a current version of Microsoft Edge, Google Chrome or Safari.",
    noVoiceHi:
      "No Hindi voice is installed on this device, so Hindi narration cannot play. The Hindi text remains available. To enable it, add a Hindi (India) voice in your operating system's speech or language settings, or use Microsoft Edge or Google Chrome, which usually include one.",
    noVoiceEn: "No English voice is available on this device, so narration cannot play. The written guide works fully.",
    blocked: "The browser did not allow audio to play. Press Play Voice to try again.",
    failed: "Narration stopped because of a speech engine error. Press Play Voice to try again.",
  },
  hi: {
    title: "वॉइस गाइड",
    intro: `${PRODUCT_NAME_HI} को सात चरणों में समझाने वाली छोटी गाइड। साथ में पढ़ें, सुनें, और जब चाहें रोकें या बंद करें।`,
    language: "गाइड की भाषा",
    hindiScope: "हिन्दी केवल वॉइस गाइड और व्याख्या पर लागू है; बाकी स्क्रीन और मूल नियम पाठ अंग्रेज़ी में हैं।",
    start: "गाइड शुरू करें",
    explainScreen: "इस स्क्रीन को समझाएँ",
    previous: "पिछला",
    next: "अगला",
    close: "गाइड बंद करें",
    currentScreen: "मौजूदा स्क्रीन",
    tryThis: "इसे आज़माएँ",
    progress: (n: number, total: number) => `चरण ${n} / ${total}`,
    stepAnnouncement: (n: number, total: number, title: string) => `चरण ${n} / ${total}: ${title}`,
    contextAnnouncement: (title: string) => `मौजूदा स्क्रीन: ${title}`,
    playback: { group: "आवाज़ नियंत्रण", play: "आवाज़ चलाएँ", pause: "आवाज़ रोकें", resume: "आवाज़ फिर शुरू करें", stop: "आवाज़ बंद करें", replay: "दोबारा सुनें" },
    unsupported:
      "इस ब्राउज़र में आवाज़ में सुनने की सुविधा उपलब्ध नहीं है। लिखित गाइड पूरी तरह काम करती है। सुनने के लिए Microsoft Edge, Google Chrome या Safari का नया संस्करण इस्तेमाल करें।",
    noVoiceHi:
      "इस डिवाइस पर कोई हिन्दी आवाज़ इंस्टॉल नहीं है, इसलिए हिन्दी में सुनाया नहीं जा सकता। हिन्दी पाठ उपलब्ध रहेगा। इसे चालू करने के लिए ऑपरेटिंग सिस्टम की स्पीच या भाषा सेटिंग में Hindi (India) आवाज़ जोड़ें, या Microsoft Edge या Google Chrome इस्तेमाल करें, जिनमें यह आम तौर पर शामिल होती है।",
    noVoiceEn: "इस डिवाइस पर कोई अंग्रेज़ी आवाज़ उपलब्ध नहीं है, इसलिए सुनाया नहीं जा सकता। लिखित गाइड पूरी तरह काम करती है।",
    blocked: "ब्राउज़र ने आवाज़ चलाने की अनुमति नहीं दी। दोबारा कोशिश करने के लिए “आवाज़ चलाएँ” दबाएँ।",
    failed: "स्पीच इंजन में गड़बड़ी के कारण आवाज़ रुक गई। दोबारा कोशिश करने के लिए “आवाज़ चलाएँ” दबाएँ।",
  },
} as const

// ---------------------------------------------------------------------- formatting

const num = (v: number) => String(Math.round(v * 100) / 100)
const metres = (v: number, lang: UiLanguage) => `${num(v)} ${lang === "hi" ? "मीटर" : "m"}`
const sqm = (v: number, lang: UiLanguage) => `${num(v)} ${lang === "hi" ? "वर्ग मीटर" : "sq m"}`
const quote = (s: string) => `“${s}”`
const stop = (lang: UiLanguage) => (lang === "hi" ? "।" : ".")
const ruleId = (c: { rule: string; sub_rule?: string | null }) => `${c.rule}${c.sub_rule ?? ""}`
/** The rule chip exactly as the Inspector prints it. */
const chip = (c: Citation) => `R${ruleId(c)} · p.${c.page}`
const citeRef = (c: Citation, lang: UiLanguage) => (lang === "hi" ? `नियम ${ruleId(c)}, पीडीएफ पृष्ठ ${c.page}` : `Rule ${ruleId(c)}, PDF page ${c.page}`)
const countEn = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Collects whether an English-only server string had to be used in Hindi text. */
type EnglishUse = { used: boolean }
const disclose = (paragraphs: string[], lang: UiLanguage, en: EnglishUse) => {
  if (lang === "hi" && en.used) paragraphs.push(HI_ENGLISH_DISCLOSURE)
  return paragraphs
}

const FIELDS: Record<string, { en: string; hi: string; unit?: "m" | "sqm" }> = {
  plot_width_m: { en: "plot width", hi: "प्लॉट की चौड़ाई", unit: "m" },
  plot_depth_m: { en: "plot depth", hi: "प्लॉट की गहराई", unit: "m" },
  plot_area_sqm: { en: "plot area", hi: "प्लॉट का क्षेत्रफल", unit: "sqm" },
  road_width_m: { en: "street width", hi: "सामने की सड़क की चौड़ाई", unit: "m" },
  building_height_m: { en: "building height", hi: "भवन की ऊँचाई", unit: "m" },
  storeys: { en: "storeys", hi: "मंज़िलें" },
  building_use: { en: "building use", hi: "भवन का उपयोग" },
  building_type: { en: "building type", hi: "भवन का प्रकार" },
  built_up_area_sqm: { en: "built-up area", hi: "निर्मित क्षेत्रफल", unit: "sqm" },
  seating_capacity: { en: "seating capacity", hi: "बैठने की क्षमता" },
  voltage_class: { en: "overhead line type", hi: "ऊपरी बिजली लाइन का प्रकार" },
  building_width_m: { en: "building width", hi: "भवन की चौड़ाई", unit: "m" },
  building_depth_m: { en: "building depth", hi: "भवन की गहराई", unit: "m" },
  front_gap_m: { en: "gap from front", hi: "सामने से दूरी", unit: "m" },
  left_gap_m: { en: "gap from left", hi: "बाईं ओर से दूरी", unit: "m" },
}

const VALUE_EN: Record<string, string> = Object.fromEntries([...BUILDING_USES, ...BUILDING_TYPES, ...VOLTAGE_CLASSES].map(([k, v]) => [k, v.toLowerCase()]))
const VALUE_HI: Record<string, string> = {
  residential: "आवासीय",
  commercial: "वाणिज्यिक",
  shop_cum_residence: "दुकान-सह-आवास",
  industrial_admin: "कारखाने का प्रशासनिक भवन",
  social_educational: "सामाजिक, धर्मार्थ या शैक्षणिक",
  cinema: "सिनेमा थिएटर",
  detached: "पृथक (डिटैच्ड)",
  semi_detached: "अर्ध-पृथक (सेमी-डिटैच्ड)",
  row: "पंक्ति वाला (रो-टाइप)",
  low_medium: "निम्न या मध्यम वोल्टेज या सर्विस लाइन",
  high_upto_33kv: "33 किलोवोल्ट तक की उच्च वोल्टेज लाइन",
  extra_high: "33 किलोवोल्ट से ऊपर की अति उच्च वोल्टेज लाइन",
}

const CALC_HI: Record<string, string> = {
  front_open_space: "सामने की न्यूनतम खुली जगह",
  rear_open_space: "पीछे की न्यूनतम खुली जगह",
  side_open_space: "बगल की न्यूनतम खुली जगह",
  site_open_spaces: "प्लॉट की सभी खुली जगहें",
  building_permission_fee: "भवन अनुज्ञा शुल्क",
  electric_line_clearance: "ऊपरी बिजली लाइन से न्यूनतम दूरी",
}

const SIDE: Record<Side, { en: string; hi: string; hiShort: string }> = {
  front: { en: "front", hi: "सामने की", hiShort: "सामने" },
  rear: { en: "rear", hi: "पीछे की", hiShort: "पीछे" },
  left: { en: "left side", hi: "बाईं ओर की", hiShort: "बाईं ओर" },
  right: { en: "right side", hi: "दाईं ओर की", hiShort: "दाईं ओर" },
}

const WARNING_HI: Record<string, string> = {
  AMENDMENT_2026_RULE_2_5_C: "संस्करण जाँच आवश्यक: नियम 2(5)(c) में 28 अगस्त 2026 का संशोधन शामिल नहीं है",
  HINDI_TEXT_PREVAILS: "अंग्रेज़ी पाठ एक अनुवाद है; हिन्दी संस्करण मान्य है",
}

const STATUS_TEXT: Record<UiLanguage, Record<Status, string>> = {
  en: {
    VERIFIED: "the supplied rule and your inputs support the result.",
    CALCULATION_COMPLETED: "worked out by fixed code from a table checked against the PDF.",
    SOURCE_FOUND: "the relevant rule text was found but not applied to your case, so read it.",
    MORE_INFORMATION_NEEDED: "some inputs are missing, so the result cannot be settled yet.",
    NOT_FOUND: "the supplied rules do not answer this question.",
    VERSION_REVIEW_NEEDED: "a later amendment, not in the supplied rulebook, may affect the answer.",
    ILLUSTRATIVE_ONLY: "an explanatory drawing only, not a verified result.",
  },
  hi: {
    VERIFIED: "दिए गए नियम और आपकी जानकारी इस परिणाम का समर्थन करते हैं।",
    CALCULATION_COMPLETED: "पीडीएफ से जाँची गई तालिका से तय कोड द्वारा निकाला गया।",
    SOURCE_FOUND: "संबंधित नियम का पाठ मिला है, पर आपके मामले पर लागू नहीं किया गया; उसे पढ़ें।",
    MORE_INFORMATION_NEEDED: "कुछ जानकारी अभी नहीं दी गई है, इसलिए परिणाम अभी तय नहीं हो सकता।",
    NOT_FOUND: "दिए गए नियमों में इस सवाल का जवाब नहीं है।",
    VERSION_REVIEW_NEEDED: "बाद का कोई संशोधन, जो दी गई नियम-पुस्तिका में नहीं है, इस जवाब पर असर डाल सकता है।",
    ILLUSTRATIVE_ONLY: "केवल समझाने के लिए बना चित्र, सत्यापित परिणाम नहीं।",
  },
}

/** “Verified”: meaning — the badge text stays English (as on screen); Hindi adds its meaning. */
function statusLine(s: Status, lang: UiLanguage) {
  const meta = STATUS_META[s]
  return lang === "hi" ? `${quote(meta.label)} (${meta.hi}): ${STATUS_TEXT.hi[s]}` : `${quote(meta.label)}: ${STATUS_TEXT.en[s]}`
}

function inputPhrase(k: string, v: string | number, lang: UiLanguage, en: EnglishUse) {
  const f = FIELDS[k]
  let name = f?.[lang]
  if (!name) {
    name = INPUT_LABELS[k] ?? k
    if (lang === "hi") en.used = true
  }
  if (typeof v === "number") return `${name} ${f?.unit === "m" ? metres(v, lang) : f?.unit === "sqm" ? sqm(v, lang) : num(v)}`
  const label = lang === "hi" ? VALUE_HI[v] : VALUE_EN[v]
  if (!label && lang === "hi") en.used = true
  return `${name} ${label ?? v}`
}

function calcName(c: CalcResult, lang: UiLanguage, en: EnglishUse) {
  if (lang === "en") return c.label
  const hi = CALC_HI[c.calc_type]
  if (!hi) en.used = true
  return hi ?? c.label
}

/** The calculation's value as the Inspector shows it; Hindi is rebuilt from the numeric fields. */
function calcValue(c: CalcResult, lang: UiLanguage, en: EnglishUse) {
  const resolved = c.status === "VERIFIED" || c.status === "CALCULATION_COMPLETED"
  if (lang === "en") return c.display_value ? (resolved ? c.display_value : `${c.display_value} (provisional)`) : "unresolved"
  if (!c.display_value) return "अभी तय नहीं"
  let v: string
  if (c.zones.length) v = c.zones.map((z) => `${SIDE[z.side].hiShort} कम से कम ${metres(z.depth_m, "hi")}`).join(", ")
  else if (c.unit === "Rs" && c.value != null) v = `${c.value.toLocaleString("en-IN")} रुपये`
  else if (c.unit === "m" && c.value != null && /^[\d.]+ m$/.test(c.display_value)) v = metres(c.value, "hi")
  else {
    en.used = true
    v = c.display_value
  }
  return resolved ? v : `${v} (अस्थायी)`
}

function missingLabels(record: InspectionRecord, lang: UiLanguage, en: EnglishUse) {
  return record.missing.map((m) => {
    if (lang === "en") return m.label
    const hi = FIELDS[m.field]?.hi
    if (!hi) en.used = true
    return hi ?? m.label
  })
}

function warningTitles(record: InspectionRecord, lang: UiLanguage, en: EnglishUse) {
  return record.warnings.map((w) => {
    if (lang === "en") return w.title
    const hi = WARNING_HI[w.code]
    if (!hi) en.used = true
    return hi ?? w.title
  })
}

/** Sentences about missing inputs and warnings on the current result (empty when there are none). */
function missingAndWarnings(record: InspectionRecord, lang: UiLanguage, en: EnglishUse): string[] {
  const out: string[] = []
  const missing = missingLabels(record, lang, en)
  const warnings = warningTitles(record, lang, en)
  if (missing.length) out.push(lang === "hi" ? `अभी यह जानकारी चाहिए: ${missing.join("; ")}।` : `Missing now: ${missing.join("; ")}.`)
  if (warnings.length) out.push(lang === "hi" ? `मौजूदा चेतावनियाँ: ${warnings.join("; ")}।` : `Current warnings: ${warnings.join("; ")}.`)
  return out
}

/** Below 1024px the three panels become tabs; say which one to open. */
const TAB_HINT: Record<"plot" | "inspector", Record<UiLanguage, string>> = {
  plot: { en: "On this screen size, the plot is in the Plot tab.", hi: "इस स्क्रीन आकार पर प्लॉट Plot टैब में है।" },
  inspector: { en: "On this screen size, results are in the Inspector tab.", hi: "इस स्क्रीन आकार पर परिणाम Inspector टैब में हैं।" },
}
const withTab = (paragraphs: string[], ctx: GuideContext, tab: keyof typeof TAB_HINT, lang: UiLanguage) =>
  ctx.wide ? paragraphs : [...paragraphs, TAB_HINT[tab][lang]]

const plotSize = (p: { w: number; d: number }, lang: UiLanguage) =>
  lang === "hi" ? `${metres(p.w, lang)} चौड़ा और ${metres(p.d, lang)} गहरा` : `${metres(p.w, lang)} wide and ${metres(p.d, lang)} deep`

// ---------------------------------------------------------------------- the seven steps

const introStep: StepBuilder = (_ctx, lang) =>
  lang === "hi"
    ? {
        id: "intro",
        title: `${PRODUCT_NAME_HI} से क्या मदद मिलती है`,
        paragraphs: [
          `${PRODUCT_NAME_HI} की मदद से आप मध्य प्रदेश भूमि विकास नियम, 2012 से जुड़े सवालों के जवाब देख सकते हैं। यह 6 मार्च 2025 तक समेकित नियम-पुस्तिका पर आधारित है।`,
          "ये नियम 108 पन्नों में फैले हैं, और कई जवाब ऐसी तालिकाओं में हैं जिन्हें पढ़ने में आसानी से गलती हो सकती है। हर जवाब के साथ लागू नियम का मूल पाठ, नियम संख्या और पीडीएफ पृष्ठ दिखाया जाता है, ताकि आप खुद जाँच सकें।",
          "कुछ आवश्यकताओं के लिए मान की गणना भी की जाती है: नियम 56 और 42 के तहत भवन के चारों ओर की खुली जगह (सेटबैक), नियम 21 के तहत भवन अनुज्ञा शुल्क, और नियम 52 के तहत ऊपरी बिजली लाइनों से दूरी। ये मान केवल उन तालिकाओं से लिए जाते हैं जिन्हें आधिकारिक पीडीएफ से मिलाकर जाँचा गया है, और सत्यापित खुली जगहें प्लॉट के चित्र पर दिखाई जाती हैं।",
          "यहाँ दिखाई गई हर जानकारी केवल सूचना के लिए है। यह भवन अनुज्ञा या मंज़ूरी नहीं है।",
        ],
      }
    : {
        id: "intro",
        title: `What ${PRODUCT_NAME} does`,
        paragraphs: [
          `${PRODUCT_NAME} answers questions about the M.P. Bhumi Vikas Rules, 2012, using the rulebook consolidated up to 6 March 2025.`,
          "The rules run to 108 pages, and many answers sit in tables that are easy to misread. For every answer you see the exact text of the rule that applies, with its rule number and PDF page, so you can check it yourself.",
          "For some requirements the value is also worked out: open spaces around the building (setbacks) under Rules 56 and 42, the building permission fee under Rule 21, and the distance from overhead electric lines under Rule 52. These values come only from tables checked against the official PDF, and verified open spaces are drawn on the plot.",
          "Everything shown is for information only. It is not a building approval.",
        ],
      }

const askStep: StepBuilder = (ctx, lang) => {
  const hi = lang === "hi"
  const paragraphs = hi
    ? [
        "स्क्रीन के ऊपर वाले बॉक्स में अपना सवाल हिन्दी या अंग्रेज़ी में लिखें। भेजने के लिए Enter दबाएँ, या बॉक्स के दाईं ओर तीर वाला “Ask” बटन दबाएँ।",
        "तैयार उदाहरण देखने के लिए बॉक्स के नीचे “Sample questions” खोलें और कोई एक सवाल चुनें।",
        "अगर आपके सवाल से सड़क की चौड़ाई या भवन की ऊँचाई जैसे मान पढ़े जाते हैं, तो वे बॉक्स के नीचे छोटे लेबल के रूप में दिखते हैं। उन्हें फ़ॉर्म में भरने के लिए “Use in project inputs” दबाएँ।",
        ctx.wide
          ? "आप सवाल के बिना भी काम कर सकते हैं: बाईं ओर “Project inputs” भरें, “Requirement being examined” में आवश्यकता चुनें और “Evaluate requirement” दबाएँ।"
          : "आप सवाल के बिना भी काम कर सकते हैं: Inputs टैब खोलें, प्रोजेक्ट की जानकारी भरें, “Requirement being examined” में आवश्यकता चुनें और “Evaluate requirement” दबाएँ।",
        ctx.aiConfigured
          ? "“Sample questions” के पास वाला “AI explanation” स्विच जवाब के शब्द एआई मॉडल से लिखवाता है। मान और उद्धरण फिर भी नियमों और गणनाओं से ही आते हैं, एआई से कभी नहीं।"
          : "इस सर्वर पर एआई व्याख्या चालू नहीं है, इसलिए सारांश बिना लाइव एआई के, उन्हीं सत्यापित नियमों और गणनाओं से बनाया जाता है।",
      ]
    : [
        "Type your question in the box at the top of the screen, in English or Hindi. Press Enter, or the “Ask” button (the arrow at the right end of the box), to send it.",
        "To see ready-made examples, open “Sample questions” under the box and pick one.",
        "If values such as the street width or the building height are read from your question, they appear as small labels under the box. Press “Use in project inputs” to copy them into the form.",
        ctx.wide
          ? "You can also work without a question: fill in “Project inputs” on the left, choose the “Requirement being examined”, and press “Evaluate requirement”."
          : "You can also work without a question: open the Inputs tab, fill in the project inputs, choose the “Requirement being examined”, and press “Evaluate requirement”.",
        ctx.aiConfigured
          ? "The “AI explanation” switch next to “Sample questions” lets an AI model word the answer. The values and citations still come from the rules and the calculations, never from the AI."
          : "On this server the AI explanation is not configured, so the summary is produced without live AI, from the same verified rules and calculations.",
      ]
  return { id: "ask", title: hi ? "सवाल पूछें" : "Ask a question", paragraphs, example: EXAMPLE_QUESTION[lang], highlight: ["ask"] }
}

const answerStep: StepBuilder = (ctx, lang) => {
  const hi = lang === "hi"
  const r = ctx.record
  const where = hi
    ? ctx.wide
      ? "परिणाम दाईं ओर “Regulation inspector” में दिखते हैं। सबसे ऊपर रंगीन लेबल परिणाम की स्थिति बताते हैं:"
      : "परिणाम Inspector टैब में दिखते हैं। सबसे ऊपर रंगीन लेबल परिणाम की स्थिति बताते हैं:"
    : ctx.wide
      ? "Results appear in the “Regulation inspector” on the right. Coloured labels at the top give the status of the result:"
      : "Results appear in the Inspector tab. Coloured labels at the top give the status of the result:"
  const statuses = (["VERIFIED", "CALCULATION_COMPLETED", "SOURCE_FOUND", "MORE_INFORMATION_NEEDED", "NOT_FOUND", "VERSION_REVIEW_NEEDED"] as const).map((s) => statusLine(s, lang))
  const now = r
    ? hi
      ? `अभी परिणाम की स्थिति ${quote(STATUS_META[r.primary].label)} (${STATUS_META[r.primary].hi}) है; ${r.citations.length} ${r.citations.length === 1 ? "नियम-अंश उद्धृत है" : "नियम-अंश उद्धृत हैं"} और ${r.calcs.length} ${r.calcs.length === 1 ? "गणना है" : "गणनाएँ हैं"}।`
      : `Right now the status is ${quote(STATUS_META[r.primary].label)}, with ${countEn(r.citations.length, "cited passage", "cited passages")} and ${countEn(r.calcs.length, "calculation", "calculations")}.`
    : hi
      ? "अभी कोई परिणाम नहीं है। पहले सवाल पूछें या कोई आवश्यकता जाँचें, फिर इस चरण पर लौटें।"
      : "There is no result yet. Ask a question or evaluate a requirement first, then return to this step."
  const paragraphs = hi
    ? [
        where,
        ...statuses,
        "जवाब पर “AI explanation” लिखा होता है अगर उसके शब्द एआई मॉडल ने लिखे हों, या “Deterministic summary” अगर वह तय साँचों से बना हो। उसके नीचे परिणाम कार्ड में मान, इस्तेमाल हुई जानकारी, गणना के चरण और “R56(1)(a) · p.77” जैसे नियम लेबल होते हैं, जो नियम संख्या और पीडीएफ पृष्ठ बताते हैं।",
        "“Evidence from the supplied rules” में नियम का मूल पाठ, नियम संख्या और पीडीएफ पृष्ठ के साथ दिखाया जाता है। “Table checked against PDF” लेबल का मतलब है कि उस तालिका के अंक आधिकारिक पीडीएफ से मिलाए गए हैं।",
        now,
      ]
    : [
        where,
        ...statuses,
        "The answer is marked “AI explanation” when an AI model worded it, or “Deterministic summary” when it was produced from fixed templates. Result cards below it show the value, the inputs used, the calculation steps, and rule labels such as “R56(1)(a) · p.77”, which give the rule number and the PDF page.",
        "“Evidence from the supplied rules” shows the exact source text with its rule number and PDF page. The label “Table checked against PDF” means the numbers in that table were compared with the official PDF.",
        now,
      ]
  return { id: "answer", title: hi ? "जवाब कैसे पढ़ें" : "Read the answer", paragraphs, highlight: ["inspector", "answer"] }
}

const plotStep: StepBuilder = (ctx, lang) => {
  const hi = lang === "hi"
  const { plot, zones, unresolved, conflicts } = ctx.scene
  const views =
    ctx.webgl === false
      ? hi
        ? "यह ब्राउज़र 3D दृश्य नहीं दिखा सकता, इसलिए उसकी जगह “Plan” दृश्य दिखाया जाता है।"
        : "This browser cannot show the 3D view, so the “Plan” view is shown instead."
      : hi
        ? "दृश्य बदलने के लिए “3D” और “Plan” बटन इस्तेमाल करें। 3D में “Reset”, “Top” और “Street” बटन कैमरा बदलते हैं; घुमाने के लिए माउस से खींचें और ज़ूम के लिए स्क्रॉल करें।"
        : "Use the “3D” and “Plan” buttons to switch views. In 3D, the “Reset”, “Top” and “Street” buttons move the camera; drag to rotate and scroll to zoom."
  let now: string
  if (plot) {
    now = hi
      ? `अभी प्लॉट ${plotSize(plot, lang)} है। बनाई गई खुली जगहें: ${zones.length}।${unresolved.length ? ` अनसुलझे किनारे: ${unresolved.length}।` : ""}${conflicts.length ? ` न्यूनतम से कम प्रस्तावित दूरियाँ: ${conflicts.length}।` : ""}`
      : `Right now the plot is ${plotSize(plot, lang)}. Open space zones drawn: ${zones.length}.${unresolved.length ? ` Unresolved edges: ${unresolved.length}.` : ""}${conflicts.length ? ` Proposed gaps below a computed minimum: ${conflicts.length}.` : ""}`
  } else {
    now = hi
      ? `अभी कोई प्लॉट नहीं बना है। ${ctx.wide ? "Project inputs" : "Inputs टैब"} में प्लॉट की चौड़ाई और गहराई भरें, या नमूना मान भरने के लिए “Example” दबाएँ। खुली जगहें बनाने के लिए “Evaluate requirement” दबाएँ।`
      : `No plot is drawn yet. Enter the plot width and depth in ${ctx.wide ? "Project inputs" : "the Inputs tab"}, or press “Example” to fill in sample values. Press “Evaluate requirement” to draw the open spaces.`
  }
  const paragraphs = hi
    ? [
        "प्लॉट केवल आपकी दी गई चौड़ाई और गहराई से बनाया जाता है; क्षेत्रफल से उसका आकार कभी अनुमान नहीं लगाया जाता। सड़क प्लॉट के सामने की ओर दिखाई जाती है।",
        "नीली जगहें सत्यापित न्यूनतम खुली जगहें हैं, और हर एक किसी नियम से जुड़ी है। पीले (एम्बर) रंग की टूटी रेखा या धारियों वाली जगहें अनसुलझी हैं और उनके लिए और जानकारी चाहिए। लाल रंग बताता है कि प्रस्तावित दूरी गणना की गई न्यूनतम दूरी से कम है। धूसर डिब्बा आपका प्रस्तावित भवन है, जो केवल उदाहरण के लिए बनाया गया है।",
        views,
        "किसी जगह या उसके लेबल पर क्लिक करें, तो उसका नियम Inspector में दिखेगा। प्लॉट के ऊपर दाईं ओर की सूची (Legend) रंगों का मतलब बताती है।",
        now,
      ]
    : [
        `The plot is drawn only from the width and depth you enter; ${PRODUCT_NAME} never guesses its shape from the plot area. The street runs along the front of the plot.`,
        "Blue zones are verified minimum open spaces, each linked to a rule. Amber dashed or hatched areas are unresolved and need more information. Red marks a proposed gap that is below a computed minimum. The grey box is your proposed building, drawn for illustration only.",
        views,
        "Click a zone or its label to see its rule in the Inspector. The legend at the top right of the plot explains the colours.",
        now,
      ]
  return { id: "plot", title: hi ? "प्लॉट को देखें" : "Explore the plot", paragraphs: withTab(paragraphs, ctx, "plot", lang), highlight: ["viewport"] }
}

const ruleStep: StepBuilder = (ctx, lang) => {
  const hi = lang === "hi"
  const r = ctx.record
  const firstChip = r?.calcs.find((c) => c.citations.length)?.citations[0]
  const firstCite = r?.citations[0]
  const now = firstChip
    ? hi
      ? `उदाहरण के लिए, मौजूदा परिणाम में ${quote(chip(firstChip))} उद्धृत है।`
      : `For example, the current result cites ${quote(chip(firstChip))}.`
    : firstCite
      ? hi
        ? `उदाहरण के लिए, मौजूदा परिणाम में ${citeRef(firstCite, lang)} उद्धृत है।`
        : `For example, the current result cites ${citeRef(firstCite, lang)}.`
      : hi
        ? "परिणाम आने पर उसके नियम लेबल यहाँ दिखेंगे।"
        : "Rule labels appear here once you have a result."
  const paragraphs = hi
    ? [
        "पूरा नियम उसके पीडीएफ पृष्ठों के साथ पढ़ने के लिए परिणाम कार्ड पर नियम लेबल पर क्लिक करें, या किसी अंश के नीचे “Open whole rule” दबाएँ। नियम-पुस्तिका में छपी अदालती टिप्पणियों को नियम पाठ नहीं, टिप्पणी के रूप में चिह्नित किया जाता है।",
        "हर गणना कार्ड में इस्तेमाल हुई जानकारी और अपनाए गए चरण दिखते हैं। “Conditional — not applied until confirmed” शीर्षक वाला बॉक्स ऐसा परिणाम दिखाता है जो किसी शर्त पर निर्भर है; पहले उस शर्त की पुष्टि करनी होगी।",
        `“Explain with AI” मौजूदा परिणाम की, या प्लॉट पर आपकी चुनी गई जगह की, आसान भाषा में व्याख्या देता है। इसे व्याख्या के रूप में ही चिह्नित किया जाता है, और आधिकारिक मूल पाठ उसके साथ ही रहता है।${ctx.aiConfigured ? "" : " इस सर्वर पर एआई चालू नहीं है, इसलिए उसकी जगह उन्हीं सत्यापित आँकड़ों से बनी सामान्य व्याख्या दिखाई जाती है।"}`,
        now,
      ]
    : [
        "Click a rule label on a result card, or “Open whole rule” under a passage, to read the full rule with its PDF pages. Court comments printed in the rulebook are marked as comments, not rule text.",
        "Each calculation card lists the inputs used and the steps followed. A box headed “Conditional — not applied until confirmed” shows a result that depends on a condition you must confirm first.",
        `“Explain with AI” gives a plain-language explanation of the current result, or of the zone you selected on the plot. It is labelled as an explanation, and the official source text stays next to it.${ctx.aiConfigured ? "" : " On this server AI is not configured, so a basic explanation built from the same verified data is shown instead."}`,
        now,
      ]
  return {
    id: "rule",
    title: hi ? "नियम को समझें" : "Understand a regulation",
    paragraphs: withTab(paragraphs, ctx, "inspector", lang),
    highlight: ["calculations", "evidence", "inspector"],
  }
}

const warningsStep: StepBuilder = (ctx, lang) => {
  const hi = lang === "hi"
  const r = ctx.record
  const en: EnglishUse = { used: false }
  const now = r ? missingAndWarnings(r, lang, en) : []
  if (r && !now.length) now.push(hi ? "मौजूदा परिणाम में कोई चेतावनी या छूटी हुई जानकारी नहीं है।" : "The current result has no warnings and no missing inputs.")
  if (!r) now.push(hi ? "हर परिणाम के साथ उसकी चेतावनियाँ और छूटी हुई जानकारी Inspector में दिखती हैं।" : "Warnings and missing inputs appear in the Inspector with each result.")
  const paragraphs = hi
    ? [
        "“More information needed” (और जानकारी चाहिए) में वह जानकारी दिखाई जाती है जो अभी नहीं दी गई है। कोई भी छूटा हुआ मान अपने आप नहीं मान लिया जाता: उसे Project inputs में भरें और फिर से जाँचें।",
        "“Not found” (नहीं मिला) उन विषयों के लिए दिखता है जो इन नियमों से बाहर हैं, जैसे संपत्ति कर या ज़मीन के दाम। जब प्रमाण पर्याप्त न हो, तो अपनी ओर से कोई नियम-संबंधी जवाब नहीं बनाया जाता।",
        "“Version review needed” (संस्करण जाँच आवश्यक) याद दिलाता है कि नियम-पुस्तिका केवल 6 मार्च 2025 तक समेकित है। नियम 2(5)(c) में 28 अगस्त 2026 का संशोधन, जो 500 वर्ग मीटर तक के प्लॉट से जुड़ा है, यहाँ शामिल या सत्यापित नहीं है, इसलिए आधिकारिक अधिसूचना ज़रूर देखें।",
        "नियमों का अंग्रेज़ी पाठ एक अनुवाद है, और हिन्दी संस्करण ही मान्य है (नियम 4 के नीचे अदालती टिप्पणी)। हिन्दी व्याख्याएँ आधिकारिक हिन्दी पाठ के उद्धरण नहीं हैं।",
        ...now,
      ]
    : [
        `“More information needed” lists the inputs that are missing. ${PRODUCT_NAME} never assumes a missing value: add it in Project inputs and evaluate again.`,
        `“Not found” is shown for topics outside these rules, such as property tax or land rates. When the evidence is not enough, ${PRODUCT_NAME} does not invent a regulatory answer.`,
        "“Version review needed” is a reminder that the rulebook is consolidated only up to 6 March 2025. The amendment of 28 August 2026 to Rule 2(5)(c), on plots up to 500 sq m, is not included or verified here, so check the official notification.",
        "The English rule text is a translation, and the Hindi version prevails (court comment under Rule 4). Hindi explanations are not quotations from the official Hindi text.",
        ...now,
      ]
  const highlight: GuideTarget[] = [...(r?.warnings.length ? (["warnings"] as const) : []), ...(r?.missing.length ? (["missing"] as const) : []), "inspector"]
  return { id: "warnings", title: hi ? "चेतावनियाँ और सीमाएँ" : "Warnings and limits", paragraphs: withTab(disclose(paragraphs, lang, en), ctx, "inspector", lang), highlight }
}

const receiptStep: StepBuilder = (ctx, lang) => {
  const hi = lang === "hi"
  const r = ctx.record
  const now = r
    ? hi
      ? `“Counter Receipt” बटन अभी उपलब्ध है।${ctx.wide ? "" : " यह Inspector टैब में है।"}`
      : `The “Counter Receipt” button is available now.${ctx.wide ? "" : " It is in the Inspector tab."}`
    : hi
      ? "अभी कोई परिणाम नहीं है, इसलिए यह बटन नहीं दिख रहा। सवाल पूछने या कोई आवश्यकता जाँचने के बाद यह उपलब्ध होगा।"
      : "There is no result yet, so the button is not shown. It becomes available after you ask a question or evaluate a requirement."
  const paragraphs = hi
    ? [
        "परिणाम आने के बाद Inspector के ऊपर “Counter Receipt” बटन से प्रिंट करने लायक सारांश खुलता है, जिसमें सवाल, परिणाम, उद्धरण और अस्वीकरण होते हैं।",
        "उस पेज पर “Print / Save as PDF” से इसे प्रिंट करें या पीडीएफ फ़ाइल के रूप में सहेजें, और “Back to workbench” से यहाँ लौटें। यह रसीद केवल सूचना के लिए है, मंज़ूरी नहीं।",
        now,
      ]
    : [
        "After you have a result, the “Counter Receipt” button at the top of the Inspector opens a printable summary with the question, the result, the citations and a disclaimer.",
        "On that page, “Print / Save as PDF” prints it or saves it as a PDF file, and “Back to workbench” returns here. The receipt is informational and is not an approval.",
        now,
      ]
  return { id: "receipt", title: hi ? "काउंटर रसीद बनाएँ" : "Generate the Counter Receipt", paragraphs, highlight: r ? ["receipt", "inspector"] : [] }
}

export const GUIDE_STEPS: readonly StepBuilder[] = [introStep, askStep, answerStep, plotStep, ruleStep, warningsStep, receiptStep]

// ---------------------------------------------------------------------- "Explain current screen"

export function hasScreenState(ctx: GuideContext): boolean {
  return !!(ctx.record || ctx.selected || ctx.scene.plot)
}

function shortHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

type Draft = Omit<GuideStep, "id">

/** A selected open-space zone or unresolved edge ("calc_type:side"). */
function constraintDraft(ctx: GuideContext, calcType: string, side: Side, lang: UiLanguage): Draft | null {
  const hi = lang === "hi"
  const calc = ctx.record?.calcs.find((c) => c.calc_type === calcType)
  const zone = ctx.scene.zones.find((z) => z.calcType === calcType && z.side === side)
  const recZone = calc?.zones.find((z) => z.side === side)
  const edge = ctx.scene.unresolved.find((u) => u.calcType === calcType && u.side === side)
  const sideName = hi ? `${SIDE[side].hi} खुली जगह` : `${SIDE[side].en} open space`
  const title = hi ? `चुना गया: ${sideName}` : `Selected: ${sideName}`
  const en: EnglishUse = { used: false }
  const depth = zone?.depth ?? recZone?.depth_m
  const rule = zone?.rule ?? recZone?.rule
  if (depth !== undefined && rule) {
    const cite = calc?.citations.find((c) => ruleId(c) === rule) ?? calc?.citations[0]
    const page = cite ? (hi ? ` (पीडीएफ पृष्ठ ${cite.page})` : `, PDF page ${cite.page}`) : ""
    const state = zone?.state ?? (calc?.status === "VERIFIED" ? "verified" : calc?.status === "CALCULATION_COMPLETED" ? "computed" : "unresolved")
    const gap = zone?.proposedGap ?? recZone?.proposed_gap_m
    const check = zone?.check ?? recZone?.check
    const paragraphs = [
      hi
        ? `यह ${sideName} की न्यूनतम माप है: कम से कम ${metres(depth, lang)}, जो नियम ${rule}${page} से तय होती है।`
        : `This is the minimum ${sideName}: at least ${metres(depth, lang)}, set by Rule ${rule}${page}.`,
      (state === "verified"
        ? hi
          ? "स्थिति: “Verified” (सत्यापित)। दिया गया नियम और आपकी जानकारी इस न्यूनतम माप का समर्थन करते हैं।"
          : "Status: “Verified”. The supplied rule and your inputs support this minimum."
        : state === "computed"
          ? hi
            ? "स्थिति: “Calculation completed” (गणना पूर्ण)। इसे पीडीएफ से जाँची गई तालिका से निकाला गया है।"
            : "Status: “Calculation completed”. It was worked out from a table checked against the PDF."
          : hi
            ? "यह अभी अस्थायी है: पुष्टि से पहले और जानकारी चाहिए।"
            : "It is provisional: more information is needed before it can be confirmed.") +
        (zone
          ? hi
            ? ` प्लॉट पर इसे ${state === "unresolved" ? "पीले (एम्बर)" : "नीले"} रंग में दिखाया गया है।`
            : ` It is drawn in ${state === "unresolved" ? "amber" : "blue"} on the plot.`
          : hi
            ? " इसे प्लॉट पर नहीं बनाया गया, क्योंकि प्लॉट की चौड़ाई और गहराई दोनों नहीं भरी गईं।"
            : " It is not drawn, because the plot width and depth are not both entered."),
    ]
    if (gap != null && check === "below_minimum")
      paragraphs.push(
        hi
          ? `इस ओर आपकी प्रस्तावित दूरी ${metres(gap, lang)} है, जो इस न्यूनतम से कम है${zone ? ", इसलिए इसे लाल रंग में दिखाया गया है" : ""}। यह केवल इसी एक आवश्यकता की जाँच है, मंज़ूरी नहीं।`
          : `Your proposed gap on this side is ${metres(gap, lang)}, which is below this minimum${zone ? ", so it is drawn in red" : ""}. This is a single check of this one requirement, not an approval.`,
      )
    else if (gap != null && check === "meets_minimum")
      paragraphs.push(
        hi
          ? `इस ओर आपकी प्रस्तावित दूरी ${metres(gap, lang)} है, जो इस न्यूनतम को पूरा करती है। यह केवल इसी एक आवश्यकता की जाँच है, मंज़ूरी नहीं।`
          : `Your proposed gap on this side is ${metres(gap, lang)}, which meets this minimum. This is a single check of this one requirement, not an approval.`,
      )
    else paragraphs.push(hi ? "इस ओर कोई प्रस्तावित दूरी इस न्यूनतम से नहीं जाँची गई।" : "No proposed gap on this side has been checked against this minimum.")
    return { title, paragraphs: disclose(paragraphs, lang, en), highlight: ["selection", "calculations", "viewport"] }
  }
  if (edge || calc) {
    const missing = (calc?.missing_inputs ?? []).map((m) => {
      if (!hi) return m.label
      const f = FIELDS[m.field]?.hi
      if (!f) en.used = true
      return f ?? m.label
    })
    const paragraphs = [
      hi ? `${sideName} अभी प्लॉट पर नहीं बनाई जा सकती।` : `The ${sideName} cannot be drawn on the plot yet.`,
      missing.length
        ? hi
          ? `इसके लिए यह जानकारी चाहिए: ${missing.join("; ")}।`
          : `It needs: ${missing.join("; ")}.`
        : hi
          ? "दी गई जानकारी से लागू नियम तय नहीं हो सका।"
          : "The applicable rule could not be established from the inputs given.",
      hi
        ? "छूटी हुई जानकारी अपने आप नहीं मान ली जाती; उसे Project inputs में भरें और फिर से जाँचें।"
        : "Nothing is assumed for missing inputs; add them in Project inputs and evaluate again.",
    ]
    return { title, paragraphs: disclose(paragraphs, lang, en), highlight: ["selection", "calculations", "viewport"] }
  }
  return null
}

/** Selected building, plot or street (user geometry, not a regulatory result). */
function elementDraft(ctx: GuideContext, element: "building" | "plot" | "road", lang: UiLanguage): Draft | null {
  const hi = lang === "hi"
  const { plot, building, road } = ctx.scene
  const highlight: GuideTarget[] = ["selection", "viewport"]
  if (element === "building" && building) {
    const size = hi
      ? `${metres(building.w, lang)} चौड़ा और ${metres(building.d, lang)} गहरा${building.heightGiven ? `, ${metres(building.h, lang)} ऊँचा` : ""}`
      : `${metres(building.w, lang)} wide and ${metres(building.d, lang)} deep${building.heightGiven ? `, ${metres(building.h, lang)} high` : ""}`
    const paragraphs = [hi ? `इसे आपके दिए गए माप से बनाया गया है: ${size}।` : `It is drawn from the dimensions you entered: ${size}.`]
    if (!building.heightGiven) paragraphs.push(hi ? "ऊँचाई नहीं दी गई, इसलिए इसे केवल चित्र के लिए एक सांकेतिक ऊँचाई से बनाया गया है।" : "Its height was not entered, so it is drawn with a nominal height for the picture only.")
    if (!building.positionGiven)
      paragraphs.push(hi ? "सामने और बाईं ओर की दूरी दोनों नहीं दी गईं, इसलिए इसकी जगह केवल अनुमानित है।" : "The gaps from the front and from the left were not both entered, so its position is only approximate.")
    paragraphs.push(hi ? "यह केवल उदाहरण के लिए है: यह भवन का नक्शा, नियम-पालन का परिणाम या मंज़ूरी नहीं है।" : "It is illustrative only: it is not a building plan, a compliance result or an approval.")
    return { title: hi ? "चुना गया: प्रस्तावित भवन" : "Selected: proposed building", paragraphs, highlight }
  }
  if (element === "plot" && plot) {
    const area = sqm(plot.w * plot.d, lang)
    return {
      title: hi ? "चुना गया: प्लॉट की सीमा" : "Selected: plot boundary",
      paragraphs: hi
        ? [`प्लॉट ${plotSize(plot, lang)} है, जैसा आपने भरा है।`, `चौड़ाई गुणा गहराई ${area} है। अगर क्षेत्रफल अलग से न भरा जाए, तो पीछे की खुली जगह के लिए यही क्षेत्रफल इस्तेमाल होता है।`]
        : [`The plot is ${plotSize(plot, lang)}, as you entered.`, `Width times depth is ${area}. The rear open space uses this area unless a plot area is entered.`],
      highlight,
    }
  }
  if (element === "road" && plot) {
    const w = road?.width
    return {
      title: hi ? "चुना गया: सड़क" : "Selected: street",
      paragraphs: w
        ? hi
          ? [`प्लॉट के सामने की सड़क ${metres(w, lang)} चौड़ी है, जैसा आपने भरा है।`, "12.5 मीटर तक ऊँचे आवासीय भवनों के लिए नियम 56(1)(a) इसी चौड़ाई से सामने की खुली जगह तय करता है।"]
          : [`The street facing the plot is ${metres(w, lang)} wide, as you entered.`, "For residential buildings up to 12.5 m high, Rule 56(1)(a) uses this width to select the front open space."]
        : hi
          ? ["सड़क की चौड़ाई नहीं भरी गई है।", "इसके बिना सामने की खुली जगह तय नहीं की जा सकती।"]
          : ["The street width has not been entered.", "The front open space cannot be selected without it."],
      highlight,
    }
  }
  return null
}

function questionLine(r: InspectionRecord, lang: UiLanguage): string {
  if (r.kind === "evaluation") return lang === "hi" ? "आपने प्रोजेक्ट की जानकारी से एक आवश्यकता जाँची है।" : `${r.question}.`
  if (r.language === lang) return lang === "hi" ? `आपका सवाल: ${quote(r.question)}` : `Your question: ${quote(r.question)}`
  return lang === "hi" ? "आपका सवाल अंग्रेज़ी में पूछा गया था।" : "Your question was asked in Hindi."
}

function overallStatus(r: InspectionRecord, lang: UiLanguage) {
  const meta = STATUS_META[r.primary]
  return lang === "hi" ? `कुल स्थिति: ${quote(meta.label)} (${meta.hi}), यानी ${STATUS_TEXT.hi[r.primary]}` : `Overall status: ${quote(meta.label)}, meaning ${STATUS_TEXT.en[r.primary]}`
}

function plotLine(ctx: GuideContext, lang: UiLanguage): string | null {
  const { plot, zones, conflicts } = ctx.scene
  if (!plot) return null
  return lang === "hi"
    ? `प्लॉट ${plotSize(plot, lang)} बनाया गया है, जिस पर ${zones.length} ${zones.length === 1 ? "खुली जगह दिखाई गई है" : "खुली जगहें दिखाई गई हैं"}।${conflicts.length ? ` ${conflicts.length} ${conflicts.length === 1 ? "प्रस्तावित दूरी गणना की गई न्यूनतम से कम है" : "प्रस्तावित दूरियाँ गणना की गई न्यूनतम से कम हैं"}।` : ""}`
    : `The plot is drawn ${plotSize(plot, lang)}, with ${countEn(zones.length, "open space zone", "open space zones")}.${conflicts.length ? ` ${countEn(conflicts.length, "proposed gap is", "proposed gaps are")} below a computed minimum.` : ""}`
}

function resultDraft(ctx: GuideContext, r: InspectionRecord, lang: UiLanguage): Draft {
  const hi = lang === "hi"
  const en: EnglishUse = { used: false }
  const paragraphs = [questionLine(r, lang), overallStatus(r, lang)]
  const plot = plotLine(ctx, lang)
  if (plot) paragraphs.push(plot)
  for (const c of r.calcs) {
    const inputs = Object.entries(c.inputs_used).map(([k, v]) => inputPhrase(k, v, lang, en))
    const cite = c.citations[0]
    const meta = STATUS_META[c.status]
    paragraphs.push(
      hi
        ? `${calcName(c, lang, en)}: ${calcValue(c, lang, en)}। स्थिति: ${quote(meta.label)} (${meta.hi})।${inputs.length ? ` इस्तेमाल हुई जानकारी: ${inputs.join(", ")}।` : ""}${cite ? ` लागू नियम: ${citeRef(cite, lang)}।` : ""}`
        : `${calcName(c, lang, en)}: ${calcValue(c, lang, en)}. Status: ${quote(meta.label)}.${inputs.length ? ` Inputs used: ${inputs.join(", ")}.` : ""}${cite ? ` Rule applied: ${citeRef(cite, lang)}.` : ""}`,
    )
  }
  paragraphs.push(...missingAndWarnings(r, lang, en))
  return { title: hi ? "मौजूदा परिणाम" : "Current result", paragraphs: withTab(disclose(paragraphs, lang, en), ctx, "inspector", lang), highlight: ["calculations", "inspector"] }
}

function answerDraft(ctx: GuideContext, r: InspectionRecord, lang: UiLanguage): Draft {
  const hi = lang === "hi"
  const en: EnglishUse = { used: false }
  const paragraphs = [questionLine(r, lang), overallStatus(r, lang)]
  if (r.answerText) {
    const marked = quote(r.answerSource === "ai" ? "AI explanation" : "Deterministic summary")
    if (r.language === lang) paragraphs.push(hi ? `जवाब (${marked}): ${r.answerText}` : `Answer, marked ${marked}: ${r.answerText}`)
    else if (hi) {
      en.used = true
      paragraphs.push(`जवाब (${marked}): ${r.answerText}`)
    } else paragraphs.push(`The answer is shown in Hindi in the Inspector, marked ${marked}, because the question was asked in Hindi.`)
  }
  const seen = new Set<string>()
  const cites = r.citations.filter((c) => {
    const k = `${ruleId(c)}:${c.page}`
    return !seen.has(k) && !!seen.add(k)
  })
  const shown = cites.slice(0, 4).map((c) => citeRef(c, lang))
  const more = cites.length - shown.length
  paragraphs.push(
    cites.length
      ? hi
        ? `उद्धृत: ${shown.join("; ")}${more > 0 ? `; और ${more} अन्य` : ""}।`
        : `Cited: ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}.`
      : hi
        ? "कुछ भी उद्धृत नहीं है, क्योंकि कोई नियम-अंश इस जवाब का समर्थन नहीं करता।"
        : "Nothing is cited, because no rule passage supports an answer.",
  )
  paragraphs.push(...missingAndWarnings(r, lang, en))
  return { title: hi ? "मौजूदा जवाब" : "Current answer", paragraphs: withTab(disclose(paragraphs, lang, en), ctx, "inspector", lang), highlight: ["answer", "inspector"] }
}

function workspaceDraft(ctx: GuideContext, plot: { w: number; d: number }, lang: UiLanguage): Draft {
  const hi = lang === "hi"
  const { road, building } = ctx.scene
  const paragraphs = [
    hi
      ? `आपकी दी गई जानकारी से प्लॉट ${plotSize(plot, lang)} बनाया गया है${road?.width ? `, जिसके सामने ${metres(road.width, lang)} चौड़ी सड़क है` : "; सड़क की चौड़ाई नहीं भरी गई है"}।`
      : `The plot is drawn ${plotSize(plot, lang)} from your inputs${road?.width ? `, facing a street ${metres(road.width, lang)} wide` : "; the street width is not entered"}.`,
  ]
  if (building)
    paragraphs.push(
      hi
        ? `प्रस्तावित भवन, ${metres(building.w, lang)} चौड़ा और ${metres(building.d, lang)} गहरा, केवल उदाहरण के लिए बनाया गया है।`
        : `A proposed building, ${metres(building.w, lang)} wide and ${metres(building.d, lang)} deep, is drawn for illustration only.`,
    )
  paragraphs.push(
    hi
      ? "अभी कोई आवश्यकता नहीं जाँची गई है, इसलिए खुली जगहें नहीं बनी हैं। Project inputs में आवश्यकता चुनें और “Evaluate requirement” दबाएँ, या सवाल पूछें।"
      : "No requirement has been evaluated yet, so no open spaces are drawn. Choose a requirement in Project inputs and press “Evaluate requirement”, or ask a question.",
  )
  return { title: hi ? "आपका कार्यक्षेत्र" : "Your workspace", paragraphs: withTab(paragraphs, ctx, "plot", lang), highlight: ["viewport"] }
}

function startDraft(ctx: GuideContext, lang: UiLanguage): Draft {
  const hi = lang === "hi"
  return {
    title: hi ? "शुरुआत कैसे करें" : "Getting started",
    paragraphs: hi
      ? [
          "अभी कुछ भी नहीं भरा गया है।",
          `ऊपर वाले बॉक्स में सवाल पूछें, या ${ctx.wide ? "Project inputs" : "Inputs टैब"} भरकर “Evaluate requirement” दबाएँ।`,
          "नमूना मानों से आज़माने के लिए “Example” और फिर “Evaluate requirement” दबाएँ।",
        ]
      : [
          "Nothing has been entered yet.",
          `Ask a question in the box at the top, or fill in ${ctx.wide ? "Project inputs" : "the Inputs tab"} and press “Evaluate requirement”.`,
          "To try it with sample values, press “Example” and then “Evaluate requirement”.",
        ],
    highlight: ["ask"],
  }
}

/**
 * Explains what is on screen now, from state only. Priority: selected zone or unresolved edge,
 * selected building / plot / street, result with calculations, answer, drawn plot, nothing yet.
 * The id carries a hash of the text, so narration keys change whenever the explanation does.
 */
export function buildContextStep(ctx: GuideContext, lang: UiLanguage): GuideStep {
  let draft: Draft | null = null
  const sel = ctx.selected
  const m = sel?.match(/^([a-z_]+):(front|rear|left|right)$/)
  if (m) draft = constraintDraft(ctx, m[1], m[2] as Side, lang)
  else if (sel === "building" || sel === "plot" || sel === "road") draft = elementDraft(ctx, sel, lang)
  if (!draft && ctx.record) draft = ctx.record.calcs.length ? resultDraft(ctx, ctx.record, lang) : answerDraft(ctx, ctx.record, lang)
  if (!draft && ctx.scene.plot) draft = workspaceDraft(ctx, ctx.scene.plot, lang)
  draft ??= startDraft(ctx, lang)
  return { id: `context-${shortHash(`${draft.title}\n${draft.paragraphs.join("\n")}`)}`, ...draft }
}

// ---------------------------------------------------------------------- narration

export function stepKey(step: GuideStep, lang: UiLanguage) {
  return `guide:${step.id}:${lang}`
}

/** Exactly the text displayed for the step: title, body and the example (if any). */
export function narrationText(step: GuideStep, lang: UiLanguage): string {
  return [`${step.title}${stop(lang)}`, ...step.paragraphs, step.example ? `${GUIDE_TEXT[lang].tryThis}: ${step.example}` : ""].filter(Boolean).join("\n")
}
