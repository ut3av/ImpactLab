import { useNavigate } from "react-router-dom"
import { CounterReceipt, loadReceipt } from "@/features/receipt/CounterReceipt"

export function ReceiptPage() {
  const navigate = useNavigate()
  const record = loadReceipt()
  if (!record)
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="max-w-sm text-center">
          <p className="font-medium">No receipt to show</p>
          <p className="mt-1 text-sm text-muted-foreground">Ask a question or evaluate a requirement, then choose “Counter Receipt”.</p>
          <button type="button" className="mt-3 text-sm text-cobalt hover:underline" onClick={() => navigate("/")}>
            Go to the workbench
          </button>
        </div>
      </div>
    )
  return <CounterReceipt record={record} onBack={() => navigate("/")} />
}
