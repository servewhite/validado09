/**
 * Slimpay API Integration
 * Documentacao: https://app.slimmpayy.com.br
 * URL Base: https://app.slimmpayy.com.br/api/v1
 */

const SLIMPAY_API_URL = "https://app.slimmpayy.com.br/api/v1"

// =============================================================================
// HEADERS DE AUTENTICACAO
// =============================================================================

function getAuthHeaders(): HeadersInit {
  const publicKey = process.env.SLIMPAY_PUBLIC_KEY
  const secretKey = process.env.SLIMPAY_SECRET_KEY

  if (!publicKey || !secretKey) {
    throw new Error("SLIMPAY_PUBLIC_KEY e SLIMPAY_SECRET_KEY devem estar configuradas")
  }

  return {
    "Content-Type": "application/json",
    "x-public-key": publicKey,
    "x-secret-key": secretKey,
  }
}

// =============================================================================
// TIPOS - REQUEST PIX
// =============================================================================

export interface SlimpayClient {
  name: string
  email: string
  phone: string // Formato: (11) 99999-9999
  document: string // CPF ou CNPJ
}

export interface SlimpayProduct {
  id: string
  name: string
  quantity: number
  price: number // Valor em reais
  physical?: boolean
}

export interface SlimpayPixRequest {
  identifier: string // ID unico da transacao (seu sistema)
  amount: number // Valor total em reais
  shippingFee?: number // Frete em reais
  extraFee?: number // Taxas extras em reais
  discount?: number // Desconto em reais
  client: SlimpayClient
  products?: SlimpayProduct[]
  dueDate?: string // Formato: YYYY-MM-DD
  metadata?: Record<string, string>
  callbackUrl?: string // URL para receber webhooks
}

// =============================================================================
// TIPOS - RESPONSE PIX
// =============================================================================

export interface SlimpayPixResponse {
  transactionId: string
  status: "OK" | "FAILED" | "PENDING" | "REJECTED" | "CANCELED"
  fee?: number
  order?: {
    id: string
    url?: string
    receiptUrl?: string
  }
  pix: {
    code: string // Codigo copia e cola
    base64?: string // Imagem QR Code em base64
    image?: string // URL da imagem do QR Code
  }
  details?: string
  errorDescription?: string
}

// =============================================================================
// TIPOS - CONSULTA TRANSACAO
// =============================================================================

export interface SlimpayTransactionResponse {
  id: string
  clientIdentifier: string
  currency: string
  amount: number
  chargeAmount: number
  exchangeRate: number
  producerExtraAmount: number
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED" | "CHARGED_BACK"
  statusDescription?: string
  purchaseType: "ONCE" | "RECURRING"
  paymentMethod: "PIX" | "CREDIT_CARD" | "BOLETO" | "TED" | "SPLIT" | "DYNAMIC" | "CRYPTO" | "CASH_ON_DELIVERY"
  details?: string
  errorDescription?: string
  webhookUrl?: string
  createdAt: string
  availableAt?: string
  payedAt?: string
  refundedAt?: string
  boletoInformation?: {
    barcode: string
    digitableLine: string
    pdfUrl?: string
  }
  pixInformation?: {
    qrCode: string
    image?: string
    base64?: string
  }
  pixMetadata?: {
    payerDocument?: string
    payerName?: string
    payerBankName?: string
    payerBankAccount?: string
    payerBankBranch?: string
    receiverDocument?: string
    receiverName?: string
    receiverPixKey?: string
    receiverBankName?: string
    receiverBankAccount?: string
    receiverBankBranch?: string
  }
}

// =============================================================================
// TIPOS - WEBHOOK
// =============================================================================

export interface SlimpayWebhookPayload {
  event: "TRANSACTION_CREATED" | "TRANSACTION_PAID" | "TRANSACTION_CANCELED" | "TRANSACTION_REFUNDED"
  token: string
  offerCode?: string
  client: {
    id: string
    name: string
    email: string
    phone: string
    cpf?: string
    cnpj?: string
    address?: {
      country: string
      zipCode: string
      state: string
      city: string
      neighborhood: string
      street: string
      number: string
      complement?: string
    }
  }
  transaction: {
    id: string
    identifier: string
    status: "COMPLETED" | "PENDING" | "FAILED" | "REFUNDED" | "CHARGED_BACK"
    paymentMethod: string
    originalCurrency: string
    originalAmount: number
    currency: string
    exchangeRate: number
    installments: number
    amount: number
    createdAt: string
    payedAt?: string
    pixInformation?: {
      qrCode: string
      endToEndId?: string
    }
    pixMetadata?: {
      payerDocument?: string
      payerName?: string
      payerBankName?: string
      payerBankAccount?: string
      payerBankBranch?: string
      receiverDocument?: string
      receiverName?: string
      receiverPixKey?: string
      receiverBankName?: string
      receiverBankAccount?: string
      receiverBankBranch?: string
    }
  }
  subscription?: {
    id: string
    identifier: string
    cycle: number
    startAt: string
    intervalType: "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
    intervalCount: number
  }
  orderItems: Array<{
    id: string
    price: number
    product: {
      id: string
      name: string
      externalId?: string
    }
  }>
  trackProps?: Record<string, string>
}

// =============================================================================
// TIPOS - API RESPONSE WRAPPER
// =============================================================================

export interface SlimpayApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
  message?: string
}

// =============================================================================
// VERIFICAR STATUS DA API (PING)
// =============================================================================

export async function pingSlimpay(): Promise<SlimpayApiResponse<{ message: string }>> {
  try {
    const response = await fetch(`${SLIMPAY_API_URL}/ping`, {
      method: "GET",
    })

    if (response.ok) {
      const data = await response.json()
      return { success: true, data }
    }

    return { success: false, error: "API Slimpay indisponivel" }
  } catch (error) {
    console.error("[Slimpay] Erro ao verificar status:", error)
    return { success: false, error: String(error) }
  }
}

// =============================================================================
// CRIAR COBRANCA PIX
// =============================================================================

export async function createSlimpayPixCharge(
  request: SlimpayPixRequest
): Promise<SlimpayApiResponse<SlimpayPixResponse>> {
  try {
    // Verificar se as chaves estao configuradas
    const publicKey = process.env.SLIMPAY_PUBLIC_KEY
    const secretKey = process.env.SLIMPAY_SECRET_KEY
    
    console.log("[v0] [Slimpay] Verificando configuracao...")
    console.log("[v0] [Slimpay] PUBLIC_KEY existe:", !!publicKey, "- Primeiros 10 chars:", publicKey?.substring(0, 10))
    console.log("[v0] [Slimpay] SECRET_KEY existe:", !!secretKey, "- Primeiros 10 chars:", secretKey?.substring(0, 10))
    
    if (!publicKey || !secretKey) {
      console.error("[v0] [Slimpay] ERRO: Chaves nao configuradas!")
      return { 
        success: false, 
        error: "CONFIG_ERROR", 
        message: "SLIMPAY_PUBLIC_KEY e SLIMPAY_SECRET_KEY devem estar configuradas" 
      }
    }

    console.log("[v0] [Slimpay] Criando cobranca PIX...")
    console.log("[v0] [Slimpay] Request:", JSON.stringify(request, null, 2))
    console.log("[v0] [Slimpay] URL:", `${SLIMPAY_API_URL}/gateway/pix/receive`)

    const headers = getAuthHeaders()
    console.log("[v0] [Slimpay] Headers (sem secrets):", { "Content-Type": headers["Content-Type"] })

    const response = await fetch(`${SLIMPAY_API_URL}/gateway/pix/receive`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(request),
    })

    console.log("[v0] [Slimpay] Response status:", response.status)
    console.log("[v0] [Slimpay] Response ok:", response.ok)
    
    const responseText = await response.text()
    console.log("[v0] [Slimpay] Response body (raw):", responseText)
    
    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error("[v0] [Slimpay] Erro ao parsear JSON:", parseError)
      return { 
        success: false, 
        error: "PARSE_ERROR", 
        message: `Resposta invalida da API: ${responseText.substring(0, 200)}` 
      }
    }

    if (response.ok && (response.status === 200 || response.status === 201)) {
      console.log("[v0] [Slimpay] Cobranca criada com sucesso!")
      console.log("[v0] [Slimpay] Data:", JSON.stringify(data, null, 2))
      return { success: true, data }
    }

    console.error("[v0] [Slimpay] Erro ao criar cobranca:")
    console.error("[v0] [Slimpay] Status:", response.status)
    console.error("[v0] [Slimpay] Data:", JSON.stringify(data, null, 2))
    
    return {
      success: false,
      error: data.errorCode || data.error || "UNKNOWN_ERROR",
      errorCode: data.errorCode || data.error,
      message: data.message || data.errorDescription || data.details || "Erro ao criar cobranca PIX",
    }
  } catch (error) {
    console.error("[v0] [Slimpay] Erro de conexao/execucao:", error)
    return { success: false, error: "CONNECTION_ERROR", message: String(error) }
  }
}

// =============================================================================
// BUSCAR TRANSACAO
// =============================================================================

export async function getSlimpayTransaction(
  transactionId?: string,
  clientIdentifier?: string
): Promise<SlimpayApiResponse<SlimpayTransactionResponse>> {
  try {
    const params = new URLSearchParams()
    if (transactionId) params.append("id", transactionId)
    if (clientIdentifier) params.append("clientIdentifier", clientIdentifier)

    const url = `${SLIMPAY_API_URL}/gateway/transactions?${params.toString()}`
    console.log("[Slimpay] Buscando transacao:", url)

    const response = await fetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    })

    const data = await response.json()

    if (response.ok) {
      console.log("[Slimpay] Transacao encontrada:", data)
      return { success: true, data }
    }

    console.error("[Slimpay] Erro ao buscar transacao:", data)
    return {
      success: false,
      error: data.errorCode || "TRANSACTION_NOT_FOUND",
      errorCode: data.errorCode,
      message: data.message || "Transacao nao encontrada",
    }
  } catch (error) {
    console.error("[Slimpay] Erro de conexao:", error)
    return { success: false, error: "CONNECTION_ERROR", message: String(error) }
  }
}

// =============================================================================
// MAPEAR STATUS SLIMPAY PARA STATUS INTERNO
// =============================================================================

export function mapSlimpayStatus(status: string): "pending" | "paid" | "failed" | "refunded" | "chargeback" {
  switch (status) {
    case "COMPLETED":
      return "paid"
    case "PENDING":
      return "pending"
    case "FAILED":
      return "failed"
    case "REFUNDED":
      return "refunded"
    case "CHARGED_BACK":
      return "chargeback"
    default:
      return "pending"
  }
}

// =============================================================================
// MAPEAR STATUS SLIMPAY PARA UTMFY
// =============================================================================

export function mapSlimpayStatusToUtmfy(
  status: string
): "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback" {
  switch (status) {
    case "COMPLETED":
      return "paid"
    case "PENDING":
      return "waiting_payment"
    case "FAILED":
      return "refused"
    case "REFUNDED":
      return "refunded"
    case "CHARGED_BACK":
      return "chargedback"
    default:
      return "waiting_payment"
  }
}

// =============================================================================
// MAPEAR EVENTO DE WEBHOOK SLIMPAY PARA STATUS UTMFY
// =============================================================================

export function mapSlimpayEventToUtmfy(
  event: string
): "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback" {
  switch (event) {
    case "TRANSACTION_PAID":
      return "paid"
    case "TRANSACTION_CREATED":
      return "waiting_payment"
    case "TRANSACTION_CANCELED":
      return "refused"
    case "TRANSACTION_REFUNDED":
      return "refunded"
    default:
      return "waiting_payment"
  }
}

// =============================================================================
// GERAR IDENTIFIER UNICO
// =============================================================================

export function generateSlimpayIdentifier(orderId: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  // Formato: ORDERID__timestamp-random (usamos __ como separador para facilitar extracao)
  return `${orderId}__${timestamp}${random}`.toLowerCase()
}

// =============================================================================
// EXTRAIR ORDER ID DO IDENTIFIER
// =============================================================================

export function extractOrderIdFromIdentifier(identifier: string): string {
  // Se o identifier contém __, extrai a parte antes
  if (identifier.includes("__")) {
    return identifier.split("__")[0].toUpperCase()
  }
  // Fallback: tenta extrair PED-XXX-XXX do inicio
  const match = identifier.match(/^(ped-[a-z0-9]+-[a-z0-9]+)/i)
  if (match) {
    return match[1].toUpperCase()
  }
  return identifier
}
