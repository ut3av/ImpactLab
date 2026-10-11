import { BrowserRouter, Route, Routes } from "react-router-dom"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ReceiptPage } from "@/pages/ReceiptPage"
import { Workbench } from "@/pages/Workbench"

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Workbench />} />
      <Route path="/receipt" element={<ReceiptPage />} />
      <Route path="*" element={<Workbench />} />
    </Routes>
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
