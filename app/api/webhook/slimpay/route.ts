import { type NextRequest, NextResponse } from "next/server"
import { sendOrderToUtmfy, formatUtmfyDate, type UtmfyOrderRequest } from "@/lib/utmfy"
import { getUtmParams } from "@/lib/server-utm-store"
import { mapSlimpayEventToUtmfy, extractOrderIdFromIdentifier, type SlimpayWebhookPayload } from "@/lib/slimpay"

// Converte valor em reais para centavos
function toCents(value: number): number {
  return Math.round(value * 100)
}

export async function POST(request: NextRequest) {
  try {
    const body: SlimpayWebhookPayload = await request.json()

    console.log("===========================================")
    console.log("[Slimpay Webhook] RECEBIDO")
    console.log("[Slimpay Webhook] Evento:", body.event)
    console.log("[Slimpay Webhook] Transaction ID:", body.transaction?.id)
    console.log("[Slimpay Webhook] Identifier:", body.transaction?.identifier)
    console.log("[Slimpay Webhook] Status:", body.transaction?.status)
    console.log("[Slimpay Webhook] Payload:", JSON.stringify(body))
    console.log("===========================================")

    // Validar payload
    if (!body.event || !body.transaction) {
      console.error("[Slimpay Webhook] Payload invalido")
      return NextResponse.json({ error: "Payload invalido" }, { status: 400 })
    }

    const { event, transaction, client, orderItems, trackProps } = body

    // Extrair orderId do identifier usando a funcao helper
    const orderId = extractOrderIdFromIdentifier(transaction.identifier)

    // Buscar UTMs salvos no servidor
    const savedUtmParams = getUtmParams(orderId)
    console.log("[Slimpay Webhook] UTMs salvos para", orderId, ":", savedUtmParams)

    // Mapear evento para status UTMify
    const utmfyStatus = mapSlimpayEventToUtmfy(event)
    console.log("[Slimpay Webhook] Status UTMify:", utmfyStatus)

    // Determinar datas
    const now = new Date()
    let approvedDate: string | null = null
    let refundedAt: string | null = null

    if (event === "TRANSACTION_PAID" && transaction.payedAt) {
      approvedDate = formatUtmfyDate(transaction.payedAt)
    } else if (event === "TRANSACTION_PAID") {
      approvedDate = formatUtmfyDate(now)
    }

    if (event === "TRANSACTION_REFUNDED") {
      refundedAt = formatUtmfyDate(now)
    }

    // Montar produtos para UTMify
    const products = orderItems?.map((item) => ({
      id: item.product.externalId || item.product.id,
      name: item.product.name,
      planId: null,
      planName: null,
      quantity: 1,
      priceInCents: toCents(item.price),
    })) || [
      {
        id: "product",
        name: "Produto",
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: toCents(transaction.amount),
      },
    ]

    // Montar tracking parameters (priorizar trackProps do webhook, depois UTMs salvos)
    const trackingParameters = {
      src: trackProps?.src || savedUtmParams?.src || null,
      sck: trackProps?.sck || savedUtmParams?.sck || null,
      utm_source: trackProps?.utm_source || savedUtmParams?.utm_source || null,
      utm_campaign: trackProps?.utm_campaign || savedUtmParams?.utm_campaign || null,
      utm_medium: trackProps?.utm_medium || savedUtmParams?.utm_medium || null,
      utm_content: trackProps?.utm_content || savedUtmParams?.utm_content || null,
      utm_term: trackProps?.utm_term || savedUtmParams?.utm_term || null,
    }

    // Montar pedido para UTMify
    const utmfyOrder: UtmfyOrderRequest = {
      orderId: orderId,
      platform: "papelaria-site",
      paymentMethod: "pix",
      status: utmfyStatus,
      createdAt: formatUtmfyDate(transaction.createdAt) || formatUtmfyDate(now) || "",
      approvedDate,
      refundedAt,
      customer: {
        name: client.name,
        email: client.email,
        phone: client.phone?.replace(/\D/g, "") || null,
        document: client.cpf?.replace(/\D/g, "") || client.cnpj?.replace(/\D/g, "") || null,
        country: "BR",
        ip: trackProps?.ip || undefined,
      },
      products,
      trackingParameters,
      commission: {
        totalPriceInCents: toCents(transaction.amount),
        gatewayFeeInCents: 0, // Slimpay nao envia taxa no webhook
        userCommissionInCents: toCents(transaction.amount),
        currency: "BRL",
      },
    }

    console.log("[Slimpay Webhook] Enviando para UTMify:", JSON.stringify(utmfyOrder))

    // Enviar para UTMify
    const utmfyResult = await sendOrderToUtmfy(utmfyOrder)
    console.log("[Slimpay Webhook] Resultado UTMify:", utmfyResult)

    // Responder 200 para confirmar recebimento (Slimpay espera 2XX)
    return NextResponse.json({
      success: true,
      message: "Webhook processado com sucesso",
      event,
      orderId,
      utmfyStatus,
      utmfySent: utmfyResult.success,
    })
  } catch (error) {
    console.error("[Slimpay Webhook] Erro ao processar:", error)
    // Retornar 200 mesmo com erro para nao reenviar webhook
    return NextResponse.json({
      success: false,
      error: String(error),
    })
  }
}

// Slimpay pode enviar GET para verificar se endpoint existe
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Slimpay webhook endpoint ativo",
  })
}
