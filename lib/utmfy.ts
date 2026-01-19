// UTMFY Tracking API Integration
// Docs: https://api.utmify.com.br

export interface UtmfyCustomer {
  name: string
  email: string
  phone: string | null
  document: string | null
  country?: string // ISO 3166-1 alfa-2
  ip?: string
}

export interface UtmfyProduct {
  id: string
  name: string
  planId: string | null
  planName: string | null
  quantity: number
  priceInCents: number
}

export interface UtmfyTrackingParameters {
  src: string | null
  sck: string | null
  utm_source: string | null
  utm_campaign: string | null
  utm_medium: string | null
  utm_content: string | null
  utm_term: string | null
}

export interface UtmfyCommission {
  totalPriceInCents: number
  gatewayFeeInCents: number
  userCommissionInCents: number
  currency?: "BRL" | "USD" | "EUR" | "GBP" | "ARS" | "CAD" | "COP" | "MXN" | "PYG" | "CLP" | "PEN" | "PLN"
}

export interface UtmfyOrderRequest {
  orderId: string
  platform: string
  paymentMethod: "credit_card" | "boleto" | "pix" | "paypal" | "free_price"
  status: "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback"
  createdAt: string // YYYY-MM-DD HH:MM:SS (UTC)
  approvedDate: string | null // YYYY-MM-DD HH:MM:SS (UTC)
  refundedAt: string | null // YYYY-MM-DD HH:MM:SS (UTC)
  customer: UtmfyCustomer
  products: UtmfyProduct[]
  trackingParameters: UtmfyTrackingParameters
  commission: UtmfyCommission
  isTest?: boolean
}

// Format date to UTMFY format (YYYY-MM-DD HH:MM:SS in UTC)
export function formatUtmfyDate(date: Date | string | null): string | null {
  if (!date) return null
  const d = typeof date === "string" ? new Date(date) : date
  return d.toISOString().replace("T", " ").substring(0, 19)
}

const UTMFY_API_URL = "https://api.utmify.com.br/api-credentials/orders"

// Send order to UTMFY
export async function sendOrderToUtmfy(
  order: UtmfyOrderRequest,
): Promise<{ success: boolean; error?: string; response?: string }> {
  // Buscar token no momento da execucao (nao no momento do import)
  const UTMFY_API_TOKEN = process.env.UTMFY_API_TOKEN || ""

  console.log("===========================================")
  console.log("[v0] [UTMFY] INICIANDO ENVIO DO PEDIDO")
  console.log("===========================================")
  console.log("[v0] [UTMFY] API URL:", UTMFY_API_URL)
  console.log("[v0] [UTMFY] Token existe:", !!UTMFY_API_TOKEN)
  console.log("[v0] [UTMFY] Token length:", UTMFY_API_TOKEN.length)
  console.log("[v0] [UTMFY] Token preview:", UTMFY_API_TOKEN ? UTMFY_API_TOKEN.substring(0, 10) + "..." : "VAZIO")
  
  // Verificar se o token esta configurado
  if (!UTMFY_API_TOKEN || UTMFY_API_TOKEN.trim() === "") {
    console.error("[v0] [UTMFY] ERRO: Token UTMFY_API_TOKEN nao configurado!")
    return { 
      success: false, 
      error: "UTMFY_API_TOKEN nao configurado. Configure a variavel de ambiente." 
    }
  }

  console.log("[v0] [UTMFY] Order ID:", order.orderId)
  console.log("[v0] [UTMFY] Status:", order.status)
  console.log("[v0] [UTMFY] Customer:", order.customer.name, "-", order.customer.email)
  console.log("[v0] [UTMFY] Phone:", order.customer.phone)
  console.log("[v0] [UTMFY] Document:", order.customer.document)
  console.log("[v0] [UTMFY] Products:", order.products.length)
  console.log("[v0] [UTMFY] Total (cents):", order.commission.totalPriceInCents)
  console.log("[v0] [UTMFY] Total (R$):", order.commission.totalPriceInCents / 100)
  console.log("[v0] [UTMFY] Tracking params:", JSON.stringify(order.trackingParameters))

  try {
    const requestBody = JSON.stringify(order)
    console.log("[v0] [UTMFY] Request body:", requestBody)

    const response = await fetch(UTMFY_API_URL, {
      method: "POST",
      headers: {
        "x-api-token": UTMFY_API_TOKEN,
        "Content-Type": "application/json",
      },
      body: requestBody,
    })

    console.log("[v0] [UTMFY] Response status:", response.status)
    console.log("[v0] [UTMFY] Response ok:", response.ok)

    const responseText = await response.text()
    console.log("[v0] [UTMFY] Response body:", responseText)

    if (!response.ok) {
      console.error("[v0] [UTMFY] ERRO! Status:", response.status)
      console.error("[v0] [UTMFY] Erro body:", responseText)
      
      // Tentar parsear erro para dar mais detalhes
      try {
        const errorJson = JSON.parse(responseText)
        console.error("[v0] [UTMFY] Erro detalhado:", JSON.stringify(errorJson, null, 2))
      } catch {
        // Ignorar se nao for JSON
      }
      
      return { success: false, error: responseText, response: responseText }
    }

    console.log("===========================================")
    console.log("[v0] [UTMFY] PEDIDO ENVIADO COM SUCESSO!")
    console.log("[v0] [UTMFY] Order:", order.orderId)
    console.log("[v0] [UTMFY] Status:", order.status)
    console.log("[v0] [UTMFY] Response:", responseText)
    console.log("===========================================")
    return { success: true, response: responseText }
  } catch (error) {
    console.error("===========================================")
    console.error("[v0] [UTMFY] ERRO DE CONEXAO/EXECUCAO!")
    console.error("[v0] [UTMFY] Error:", error)
    console.error("===========================================")
    return { success: false, error: String(error) }
  }
}

// Map payment status to UTMFY status
export function mapStatusToUtmfy(
  status: string,
): "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback" {
  switch (status) {
    case "waiting_payment":
    case "pending":
      return "waiting_payment"
    case "approved":
    case "paid":
      return "paid"
    case "refused":
    case "cancelled":
      return "refused"
    case "refunded":
      return "refunded"
    case "chargeback":
      return "chargedback"
    default:
      return "waiting_payment"
  }
}
