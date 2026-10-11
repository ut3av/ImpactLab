import { BrowserRouter, Route, Routes } from "react-router-dom"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SpeechController } from "@/lib/speech/engine"
import { SpeechProvider } from "@/lib/speech/SpeechProvider"
import { ReceiptPage } from "@/pages/ReceiptPage"
import { Workbench } from "@/pages/Workbench"

/** `speech` lets tests inject a controller bound to a fake engine; the app uses the browser's. */
export function AppRoutes({ speech }: { speech?: SpeechController } = {}) {
  return (
    <SpeechProvider controller={speech}>
      <Routes>
        <Route path="/" element={<Workbench />} />
        <Route path="/receipt" element={<ReceiptPage />} />
        <Route path="*" element={<Workbench />} />
      </Routes>
    </SpeechProvider>
  )
}

export default function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  )
}
