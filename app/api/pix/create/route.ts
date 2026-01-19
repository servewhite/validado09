import { type NextRequest, NextResponse } from "next/server"
import { sendOrderToUtmfy, formatUtmfyDate, type UtmfyOrderRequest } from "@/lib/utmfy"
import { saveUtmParams } from "@/lib/server-utm-store"
import {
  createSlimpayPixCharge,
  generateSlimpayIdentifier,
  type SlimpayPixRequest,
  type SlimpayProduct,
} from "@/lib/slimpay"

// Gera ID unico para o pedido
function generateOrderId(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PED-${timestamp}-${random}`
}

// Converte valor em reais para centavos
function toCents(value: number): number {
  return Math.round(value * 100)
}

// Formata telefone para o padrao esperado pela Slimpay
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

export async function POST(request: NextRequest) {
  try {
    // Verificar variaveis de ambiente logo no inicio
    if (!process.env.SLIMPAY_PUBLIC_KEY || !process.env.SLIMPAY_SECRET_KEY) {
      console.error("[PIX Create] ERRO: Variaveis SLIMPAY_PUBLIC_KEY e/ou SLIMPAY_SECRET_KEY nao configuradas")
      return NextResponse.json(
        { 
          error: "Configuracao incompleta: SLIMPAY_PUBLIC_KEY e SLIMPAY_SECRET_KEY devem estar configuradas nas variaveis de ambiente",
          details: "Configure as variaveis na aba 'Vars' do v0 ou no painel da Netlify/Vercel"
        }, 
        { status: 500 }
      )
    }

    const body = await request.json()
    console.log("[v0] [PIX Create] Recebendo requisicao:", JSON.stringify(body))

    const { customer, address, items, total, shipping, trackingParams } = body

    // Validacoes basicas
    if (!customer || !customer.name || !customer.email || !customer.cpf || !customer.phone) {
      return NextResponse.json({ error: "Dados do cliente incompletos" }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Nenhum item no pedido" }, { status: 400 })
    }

    if (!total || total <= 0) {
      return NextResponse.json({ error: "Valor total invalido" }, { status: 400 })
    }

    const orderId = generateOrderId()
    const slimpayIdentifier = generateSlimpayIdentifier(orderId)

    // Salvar UTMs no servidor
    if (trackingParams) {
      saveUtmParams(orderId, {
        src: trackingParams.src || null,
        sck: trackingParams.sck || null,
        utm_source: trackingParams.utm_source || null,
        utm_campaign: trackingParams.utm_campaign || null,
        utm_medium: trackingParams.utm_medium || null,
        utm_content: trackingParams.utm_content || null,
        utm_term: trackingParams.utm_term || null,
      })
      console.log("[PIX Create] UTMs salvos no servidor para orderId:", orderId)
    }

    const amountInCents = toCents(total)

    // Montar produtos para Slimpay
    const slimpayProducts: SlimpayProduct[] = items.map(
      (item: { id: string; name: string; price: number; quantity: number }) => ({
        id: item.id || `product-${Math.random().toString(36).substring(2, 8)}`,
        name: item.name,
        quantity: item.quantity,
        price: item.price, // Slimpay espera valor em reais
        physical: true,
      })
    )

    // Calcular valor dos produtos (sem frete)
    const productsTotal = items.reduce(
      (sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity,
      0
    )

    // Montar requisicao para Slimpay
    const slimpayRequest: SlimpayPixRequest = {
      identifier: slimpayIdentifier,
      amount: productsTotal, // Valor dos produtos em reais
      shippingFee: shipping?.price || 0, // Frete em reais
      client: {
        name: customer.name,
        email: customer.email,
        phone: formatPhone(customer.phone),
        document: customer.cpf.replace(/\D/g, ""),
      },
      products: slimpayProducts,
      metadata: {
        orderId: orderId,
        ...(trackingParams?.utm_source && { utm_source: trackingParams.utm_source }),
        ...(trackingParams?.utm_campaign && { utm_campaign: trackingParams.utm_campaign }),
        ...(trackingParams?.utm_medium && { utm_medium: trackingParams.utm_medium }),
        ...(trackingParams?.src && { src: trackingParams.src }),
        ...(trackingParams?.sck && { sck: trackingParams.sck }),
      },
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://seu-dominio.com"}/api/webhook/slimpay`,
    }

    console.log("[PIX Create] Enviando para Slimpay:", JSON.stringify(slimpayRequest))

    // Criar cobranca na Slimpay
    const slimpayResponse = await createSlimpayPixCharge(slimpayRequest)

    if (!slimpayResponse.success || !slimpayResponse.data) {
      console.error("[PIX Create] Erro Slimpay:", slimpayResponse)
      return NextResponse.json(
        { error: slimpayResponse.message || "Erro ao criar pagamento PIX" },
        { status: 500 }
      )
    }

    const { transactionId, pix, fee } = slimpayResponse.data

    // Enviar para UTMify
    try {
      const utmfyOrder: UtmfyOrderRequest = {
        orderId: orderId,
        platform: "papelaria-site",
        paymentMethod: "pix",
        status: "waiting_payment",
        createdAt: formatUtmfyDate(new Date()) || "",
        approvedDate: null,
        refundedAt: null,
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone?.replace(/\D/g, "") || null,
          document: customer.cpf?.replace(/\D/g, "") || null,
          country: "BR",
        },
        products: items.map((item: { id: string; name: string; price: number; quantity: number }) => ({
          id: item.id || "product",
          name: item.name,
          planId: null,
          planName: null,
          quantity: item.quantity,
          priceInCents: toCents(item.price),
        })),
        trackingParameters: {
          src: trackingParams?.src || null,
          sck: trackingParams?.sck || null,
          utm_source: trackingParams?.utm_source || null,
          utm_campaign: trackingParams?.utm_campaign || null,
          utm_medium: trackingParams?.utm_medium || null,
          utm_content: trackingParams?.utm_content || null,
          utm_term: trackingParams?.utm_term || null,
        },
        commission: {
          totalPriceInCents: amountInCents,
          gatewayFeeInCents: fee ? toCents(fee) : 0,
          userCommissionInCents: fee ? amountInCents - toCents(fee) : amountInCents,
          currency: "BRL",
        },
      }

      console.log("[PIX Create] Enviando evento waiting_payment para UTMify:", JSON.stringify(utmfyOrder))
      const utmfyResult = await sendOrderToUtmfy(utmfyOrder)
      console.log("[PIX Create] Resultado UTMify:", utmfyResult)
    } catch (utmfyError) {
      console.error("[PIX Create] Erro ao enviar para UTMify:", utmfyError)
      // Nao falha a requisicao se UTMify falhar
    }

    // Retornar dados do PIX
    return NextResponse.json({
      success: true,
      orderId,
      transactionId,
      slimpayIdentifier,
      pix: {
        qrcode: pix.code,
        qrCodeBase64: pix.base64 || "",
        qrCodeImage: pix.image || "",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    })
  } catch (error) {
    console.error("[PIX Create] Erro:", error)
    return NextResponse.json({ error: "Erro interno ao processar pagamento" }, { status: 500 })
  }
}
