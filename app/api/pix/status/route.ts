import { type NextRequest, NextResponse } from "next/server"
import { getSlimpayTransaction, mapSlimpayStatus } from "@/lib/slimpay"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get("transactionId")
    const clientIdentifier = searchParams.get("clientIdentifier")

    if (!transactionId && !clientIdentifier) {
      return NextResponse.json(
        { error: "transactionId ou clientIdentifier e obrigatorio" },
        { status: 400 }
      )
    }

    console.log("[PIX Status] Consultando transacao:", { transactionId, clientIdentifier })

    const response = await getSlimpayTransaction(
      transactionId || undefined,
      clientIdentifier || undefined
    )

    if (!response.success || !response.data) {
      console.error("[PIX Status] Erro:", response)
      return NextResponse.json(
        { error: response.message || "Erro ao consultar status" },
        { status: 500 }
      )
    }

    const { id, clientIdentifier: identifier, status, payedAt, pixMetadata } = response.data
    const mappedStatus = mapSlimpayStatus(status)

    console.log("[PIX Status] Status:", status, "->", mappedStatus)

    return NextResponse.json({
      success: true,
      transactionId: id,
      clientIdentifier: identifier,
      status: mappedStatus,
      originalStatus: status,
      paidAt: payedAt || null,
      endToEndId: pixMetadata?.payerDocument || null,
    })
  } catch (error) {
    console.error("[PIX Status] Erro:", error)
    return NextResponse.json({ error: "Erro interno ao consultar status" }, { status: 500 })
  }
}
