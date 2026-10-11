import { useCallback, useEffect, useMemo, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { buildScene } from "@/lib/geometry"
import { applyExtracted, EMPTY_FORM, parseInputs, type FormState } from "@/lib/inputs"
import { fromAnswer, fromEvaluation, type InspectionRecord } from "@/lib/record"
import type { Health, ProjectInputs, Requirement } from "@/types/api"

/** Example values for demonstrating the interface. Clearly labelled; not a real case or an answer. */
export const EXAMPLE_FORM: FormState = {
  ...EMPTY_FORM,
  plot_width_m: "10",
  plot_depth_m: "15",
  road_width_m: "9",
  building_height_m: "7",
  storeys: "2",
  building_use: "residential",
  building_type: "detached",
  built_up_area_sqm: "180",
  building_width_m: "6",
  building_depth_m: "10",
  front_gap_m: "3",
  left_gap_m: "3",
}

export function useWorkbench() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [requirement, setRequirement] = useState<Requirement>("site_open_spaces")
  const [record, setRecord] = useState<InspectionRecord | null>(null)
  const [extracted, setExtracted] = useState<Record<string, string | number>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState(false)
  const [useAi, setUseAi] = useState(true)

  useEffect(() => {
    api.health().then(setHealth, () => setHealthError(true))
  }, [])

  const { inputs, errors } = useMemo(() => parseInputs(form), [form])

  const sceneInputs: ProjectInputs = useMemo(() => {
    if (record?.kind !== "answer") return inputs
    const merged: Record<string, unknown> = { ...inputs }
    for (const [k, v] of Object.entries(record.inputs)) if (merged[k] === undefined) merged[k] = v
    return merged as ProjectInputs
  }, [inputs, record])

  const scene = useMemo(() => buildScene(sceneInputs, record?.calcs ?? []), [sceneInputs, record])

  const run = useCallback(async (fn: () => Promise<InspectionRecord>) => {
    setBusy(true)
    setError(null)
    setSelected(null)
    try {
      setRecord(await fn())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.")
      setRecord(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const evaluate = useCallback(() => {
    if (Object.keys(errors).length) return
    setExtracted({})
    void run(async () => fromEvaluation(requirement, await api.calculate(requirement, inputs), inputs))
  }, [errors, inputs, requirement, run])

  const ask = useCallback(
    (q: string) => {
      void run(async () => {
        const a = await api.answer(q, inputs, useAi)
        const newVals = Object.fromEntries(
          Object.entries(a.extracted_inputs).filter(([k, v]) => k in form && form[k as keyof FormState] !== String(v)),
        )
        setExtracted(newVals)
        return fromAnswer(a, inputs)
      })
    },
    [form, inputs, run, useAi],
  )

  return {
    form,
    setField: (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v })),
    clear: () => {
      setForm(EMPTY_FORM)
      setRecord(null)
      setExtracted({})
      setSelected(null)
      setError(null)
    },
    loadExample: () => setForm(EXAMPLE_FORM),
    applyExtracted: () => {
      setForm((f) => applyExtracted(f, extracted))
      setExtracted({})
    },
    extracted,
    inputs,
    errors,
    requirement,
    setRequirement,
    record,
    scene,
    selected,
    setSelected,
    busy,
    error,
    health,
    healthError,
    useAi,
    setUseAi,
    evaluate,
    ask,
  }
}
