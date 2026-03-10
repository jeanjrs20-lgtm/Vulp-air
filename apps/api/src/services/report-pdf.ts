import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { renderChecklistReportHtml } from "@vulp/pdf-templates";
import type { PrismaClient } from "@prisma/client";
import { getStorageAbsolutePath, saveLocalFile } from "../lib/storage.js";
import { AppError } from "../lib/app-error.js";

type ExecutionForPdf = any;

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
      // try next candidate
    }
  }

  return null;
};

const answerToValue = (answer: any) => {
  if (answer.textValue) {
    return answer.textValue;
  }
  if (typeof answer.numberValue === "number") {
    return String(answer.numberValue);
  }
  if (typeof answer.booleanValue === "boolean") {
    return answer.booleanValue ? "OK" : "NOK";
  }
  if (answer.optionValue) {
    return answer.optionValue;
  }
  if (answer.valueJson) {
    if (Array.isArray(answer.valueJson)) {
      return answer.valueJson.join(", ");
    }
    return JSON.stringify(answer.valueJson);
  }
  return "-";
};

export const generateChecklistPdfAsset = async ({
  prisma,
  execution
}: {
  prisma: PrismaClient;
  execution: ExecutionForPdf;
}) => {
  const settings = await prisma.settings.findUnique({
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

  const answerMap = new Map(execution.answers.map((answer: any) => [answer.checklistItemId, answer]));

  const sections = execution.templateVersion.sections.map((section: any) => ({
    title: section.title,
    items: section.items.map((item: any) => {
      const answer = answerMap.get(item.id) as any;
      return {
        label: item.label,
        value: answerToValue(answer ?? {}),
        status: answer?.isNonConformity ? "NOK" : answer?.booleanValue === true ? "OK" : undefined
      };
    })
  }));

  const photos = await Promise.all(
    execution.mediaAssets
      .filter((asset: any) => asset.type === "PHOTO")
      .slice(0, 12)
      .map(async (asset: any) => {
        const fullPath = path.resolve(getStorageAbsolutePath(), asset.storageKey);
        return toDataUri(fullPath, asset.mimeType);
      })
  );

  const html = renderChecklistReportHtml({
    logoUrl,
    brandLockupImageUrl,
    useBrandLockup: settings?.useBrandLockup ?? true,
    checklistCode: execution.code,
    customer: execution.customer?.name ?? "-",
    site: execution.siteLocation?.name ?? "-",
    technician: execution.assignedTechnician?.name ?? "-",
    supervisor: execution.reviewedBy?.name,
    executedAt: execution.submittedAt?.toISOString() ?? new Date().toISOString(),
    status: execution.status,
    sections,
    photos,
    signatures: {
      technician: execution.technicianSignature,
      localResponsible: execution.localResponsibleSignature,
      supervisor: execution.supervisorSignature
    }
  });

  const browser = await chromium.launch({ headless: true }).catch(() => null);
  if (!browser) {
    throw new AppError(
      500,
      "PDF_ENGINE_ERROR",
      "Não foi possível iniciar o Playwright. Execute: pnpm --filter @vulp/api exec playwright install chromium"
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
    folder: "reports",
    originalName: `${execution.code}.pdf`,
    buffer: pdfBuffer
  });

  const mediaAsset = await prisma.mediaAsset.create({
    data: {
      type: "PDF",
      title: `Relatório ${execution.code}`,
      tags: ["checklist-report"],
      storageKey: saved.storageKey,
      mimeType: "application/pdf",
      size: pdfBuffer.length,
      createdById: execution.reviewedById,
      checklistExecutionId: execution.id
    }
  });

  return mediaAsset;
};
