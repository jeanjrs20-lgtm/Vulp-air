import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { renderServiceOrderDocumentHtml } from "@vulp/pdf-templates";
import type { PrismaClient } from "@prisma/client";
import { getStorageAbsolutePath, saveLocalFile } from "../lib/storage.js";
import { AppError } from "../lib/app-error.js";

type ServiceOrderForPdf = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  status: string;
  serviceDate?: Date | null;
  scheduledStartAt?: Date | null;
  completedAt?: Date | null;
  customer?: {
    id: string;
    name: string;
  } | null;
  siteLocation?: {
    id: string;
    name: string;
    address: string;
    city?: string | null;
    state?: string | null;
  } | null;
  equipment?: {
    id: string;
    brand?: string | null;
    model?: string | null;
    serial?: string | null;
    btu?: number | null;
    equipmentType?: string | null;
  } | null;
  assignedTechnician?: {
    id: string;
    name: string;
  } | null;
};

const toDataUri = async (fullPath: string, mimeType: string) => {
  const buffer = await readFile(fullPath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
};

const resolveDefaultBrandLogoPath = async () => {
  const candidates = [
    path.resolve(process.cwd(), "Logo da Vulp Air by Claudiatech.png"),
    path.resolve(process.cwd(), "../Logo da Vulp Air by Claudiatech.png"),
    path.resolve(process.cwd(), "../../Logo da Vulp Air by Claudiatech.png")
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next path
    }
  }

  return null;
};

const serviceOrderStatusLabel: Record<string, string> = {
  OPEN: "Aberta",
  SCHEDULED: "Agendada",
  DISPATCHED: "Despachada",
  IN_PROGRESS: "Em execucao",
  ON_HOLD: "Em espera",
  COMPLETED: "Concluida",
  CANCELLED: "Cancelada"
};

const formatDateLabel = (value?: Date | null) => {
  if (!value) {
    return "Nao informado";
  }

  return value.toLocaleString("pt-BR");
};

const parseCompanyName = (smtpFrom?: string | null) => {
  if (!smtpFrom) {
    return "VULP AIR";
  }

  const beforeEmail = smtpFrom.split("<")[0]?.trim();
  return beforeEmail || smtpFrom;
};

export const generateServiceOrderPdfAsset = async (params: {
  prisma: PrismaClient;
  serviceOrder: ServiceOrderForPdf;
  actorId?: string;
}) => {
  const settings = await params.prisma.settings.findUnique({
    where: { id: "app" },
    include: { logoAsset: true }
  });

  let logoUrl: string | null = null;
  if (settings?.logoAsset?.storageKey) {
    const fullPath = path.resolve(getStorageAbsolutePath(), settings.logoAsset.storageKey);
    logoUrl = await toDataUri(fullPath, settings.logoAsset.mimeType);
  }

  let brandLockupImageUrl: string | null = null;
  const defaultBrandPath = await resolveDefaultBrandLogoPath();
  if (defaultBrandPath) {
    brandLockupImageUrl = await toDataUri(defaultBrandPath, "image/png");
  }

  const equipmentTitle = [params.serviceOrder.equipment?.brand, params.serviceOrder.equipment?.model]
    .filter(Boolean)
    .join(" ");

  const unitAddressParts = [
    params.serviceOrder.siteLocation?.address,
    params.serviceOrder.siteLocation?.city,
    params.serviceOrder.siteLocation?.state
  ].filter(Boolean);

  const html = renderServiceOrderDocumentHtml({
    logoUrl,
    brandLockupImageUrl,
    useBrandLockup: settings?.useBrandLockup ?? true,
    company: {
      displayName: parseCompanyName(settings?.smtpFrom),
      legalName: parseCompanyName(settings?.smtpFrom),
      phone: "Nao informado",
      document: "Nao informado",
      email: settings?.smtpFrom ? settings.smtpFrom.replace(/.*<|>.*/g, "") : "Nao informado",
      address: "Nao informado"
    },
    client: {
      name: params.serviceOrder.customer?.name ?? "Cliente nao informado",
      address: unitAddressParts.length ? unitAddressParts.join(" - ") : "Nao informado",
      observation: params.serviceOrder.description ?? "Os horarios de atendimento podem variar"
    },
    serviceOrder: {
      code: params.serviceOrder.code,
      datetimeLabel: formatDateLabel(
        params.serviceOrder.scheduledStartAt ?? params.serviceOrder.serviceDate ?? new Date()
      ),
      statusLabel: serviceOrderStatusLabel[params.serviceOrder.status] ?? params.serviceOrder.status,
      orientation: params.serviceOrder.description ?? params.serviceOrder.title
    },
    equipment: {
      title: equipmentTitle || params.serviceOrder.equipment?.equipmentType || "Nao informado",
      identifier: params.serviceOrder.equipment?.serial ?? "Nao informado",
      specs: [
        {
          label: "Unidade",
          value: params.serviceOrder.siteLocation?.name ?? "Nao informado"
        },
        {
          label: "Tipo",
          value: params.serviceOrder.equipment?.equipmentType ?? "Nao informado"
        },
        {
          label: "Capacidade BTU",
          value:
            params.serviceOrder.equipment?.btu != null
              ? `${params.serviceOrder.equipment.btu}`
              : "Nao informado"
        },
        {
          label: "Tecnico responsavel",
          value: params.serviceOrder.assignedTechnician?.name ?? "Nao informado"
        }
      ]
    }
  });

  const browser = await chromium.launch({ headless: true }).catch(() => null);
  if (!browser) {
    throw new AppError(
      500,
      "PDF_ENGINE_ERROR",
      "Nao foi possivel iniciar o Playwright. Execute: pnpm --filter @vulp/api exec playwright install chromium"
    );
  }

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "10mm",
      right: "10mm",
      bottom: "12mm",
      left: "10mm"
    }
  });
  await browser.close();

  const saved = await saveLocalFile({
    folder: "service-orders",
    originalName: `${params.serviceOrder.code}.pdf`,
    buffer: pdfBuffer
  });

  const mediaAsset = await params.prisma.mediaAsset.create({
    data: {
      type: "PDF",
      title: `Ordem de Servico ${params.serviceOrder.code}`,
      tags: ["service-order", `service-order:${params.serviceOrder.id}`],
      storageKey: saved.storageKey,
      mimeType: "application/pdf",
      size: pdfBuffer.length,
      createdById: params.actorId
    }
  });

  return mediaAsset;
};
