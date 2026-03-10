import { chromium } from "playwright";
import { AppError } from "../lib/app-error.js";

type StandardPopPdfInput = {
  companyName: string;
  code: string;
  revision: string;
  title: string;
  category: string;
  area: string;
  objective: string;
  scope: string;
  responsibilities: string;
  materials: string[];
  epis: string[];
  procedureSteps: string[];
  safetyRequirements: string[];
  qualityCriteria: string[];
  records: string[];
  references: string[];
  preparedBy: string;
  reviewedBy?: string;
  approvedBy: string;
  effectiveDateIso: string;
  generatedAtIso: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderList = (items: string[], ordered = false) => {
  if (!items.length) {
    return `<p class="muted">Nao informado.</p>`;
  }

  const tag = ordered ? "ol" : "ul";
  const listItems = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<${tag}>${listItems}</${tag}>`;
};

const renderStandardPopHtml = (input: StandardPopPdfInput) => {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      body {
        font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        color: #102a43;
        margin: 0;
        padding: 24px;
        line-height: 1.45;
      }
      h1, h2, h3 {
        margin: 0;
      }
      .header {
        border: 2px solid #0b3954;
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 16px;
      }
      .header-top {
        background: #0b3954;
        color: #fff;
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }
      .title {
        font-size: 22px;
        font-weight: 800;
        color: #0b3954;
        padding: 12px 14px 4px;
      }
      .subtitle {
        color: #486581;
        padding: 0 14px 12px;
        font-size: 12px;
      }
      table.meta {
        width: 100%;
        border-collapse: collapse;
      }
      table.meta td {
        border-top: 1px solid #d9e2ec;
        border-right: 1px solid #d9e2ec;
        padding: 8px 10px;
        vertical-align: top;
        font-size: 12px;
      }
      table.meta td:last-child {
        border-right: none;
      }
      .section {
        border: 1px solid #d9e2ec;
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 12px;
      }
      .section h3 {
        color: #0b3954;
        margin-bottom: 8px;
        font-size: 14px;
      }
      .muted {
        color: #627d98;
        font-size: 12px;
      }
      ul, ol {
        margin: 0;
        padding-left: 18px;
      }
      li {
        margin-bottom: 4px;
      }
      .footer {
        margin-top: 10px;
        border-top: 1px dashed #9fb3c8;
        padding-top: 8px;
        font-size: 11px;
        color: #627d98;
      }
    </style>
  </head>
  <body>
    <section class="header">
      <div class="header-top">
        <strong>${escapeHtml(input.companyName)}</strong>
        <span>Documento controlado</span>
      </div>
      <h1 class="title">${escapeHtml(input.title)}</h1>
      <p class="subtitle">Procedimento Operacional Padrao (POP) elaborado em formato corporativo.</p>
      <table class="meta">
        <tr>
          <td><strong>Codigo:</strong><br/>${escapeHtml(input.code)}</td>
          <td><strong>Revisao:</strong><br/>${escapeHtml(input.revision)}</td>
          <td><strong>Categoria:</strong><br/>${escapeHtml(input.category)}</td>
          <td><strong>Area:</strong><br/>${escapeHtml(input.area)}</td>
        </tr>
        <tr>
          <td><strong>Elaborado por:</strong><br/>${escapeHtml(input.preparedBy)}</td>
          <td><strong>Revisado por:</strong><br/>${escapeHtml(input.reviewedBy ?? "-")}</td>
          <td><strong>Aprovado por:</strong><br/>${escapeHtml(input.approvedBy)}</td>
          <td><strong>Vigencia:</strong><br/>${escapeHtml(new Date(input.effectiveDateIso).toLocaleDateString("pt-BR"))}</td>
        </tr>
      </table>
    </section>

    <section class="section">
      <h3>1. Objetivo</h3>
      <p>${escapeHtml(input.objective)}</p>
    </section>

    <section class="section">
      <h3>2. Escopo e aplicacao</h3>
      <p>${escapeHtml(input.scope)}</p>
    </section>

    <section class="section">
      <h3>3. Responsabilidades</h3>
      <p>${escapeHtml(input.responsibilities)}</p>
    </section>

    <section class="section">
      <h3>4. Materiais e recursos</h3>
      ${renderList(input.materials)}
    </section>

    <section class="section">
      <h3>5. EPIs obrigatorios</h3>
      ${renderList(input.epis)}
    </section>

    <section class="section">
      <h3>6. Procedimento passo a passo</h3>
      ${renderList(input.procedureSteps, true)}
    </section>

    <section class="section">
      <h3>7. Requisitos de seguranca e meio ambiente</h3>
      ${renderList(input.safetyRequirements)}
    </section>

    <section class="section">
      <h3>8. Criterios de qualidade e aceite</h3>
      ${renderList(input.qualityCriteria)}
    </section>

    <section class="section">
      <h3>9. Registros obrigatorios</h3>
      ${renderList(input.records)}
    </section>

    <section class="section">
      <h3>10. Referencias</h3>
      ${renderList(input.references)}
    </section>

    <p class="footer">
      Gerado automaticamente em ${escapeHtml(new Date(input.generatedAtIso).toLocaleString("pt-BR"))}.
    </p>
  </body>
</html>`;
};

export const generateStandardPopPdf = async (input: StandardPopPdfInput) => {
  const html = renderStandardPopHtml(input);

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
      top: "12mm",
      right: "10mm",
      bottom: "12mm",
      left: "10mm"
    }
  });
  await browser.close();

  return pdfBuffer;
};
