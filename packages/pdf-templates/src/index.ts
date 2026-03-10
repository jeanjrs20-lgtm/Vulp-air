type ReportSection = {
  title: string;
  items: Array<{ label: string; value: string; status?: "OK" | "NOK" | "N/A" }>;
};

type ChecklistReportTemplateInput = {
  logoUrl?: string | null;
  brandLockupImageUrl?: string | null;
  useBrandLockup: boolean;
  checklistCode: string;
  customer: string;
  site: string;
  technician: string;
  supervisor?: string;
  executedAt: string;
  status: string;
  sections: ReportSection[];
  photos: string[];
  signatures: {
    technician?: string;
    localResponsible?: string;
    supervisor?: string;
  };
};

type ServiceOrderDocumentTemplateInput = {
  logoUrl?: string | null;
  brandLockupImageUrl?: string | null;
  useBrandLockup: boolean;
  company: {
    displayName: string;
    legalName?: string;
    phone?: string;
    document?: string;
    email?: string;
    address?: string;
  };
  client: {
    name: string;
    address?: string;
    observation?: string;
  };
  serviceOrder: {
    code: string;
    datetimeLabel: string;
    statusLabel: string;
    orientation?: string;
  };
  equipment: {
    title?: string;
    identifier?: string;
    specs: Array<{ label: string; value: string }>;
  };
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const renderChecklistReportHtml = (input: ChecklistReportTemplateInput) => {
  const headerBrand = input.logoUrl && !input.useBrandLockup
    ? `<img src="${input.logoUrl}" style="height:48px;object-fit:contain;" />`
    : input.brandLockupImageUrl
      ? `<img src="${input.brandLockupImageUrl}" style="height:52px;object-fit:contain;" />`
      : `<div style="font-size:22px;font-weight:800;color:#07384D;">VULP AIR</div>`;

  const sectionHtml = input.sections
    .map(
      (section) => `<section style="margin-bottom:18px;">
      <h3 style="margin:0 0 10px;font-size:14px;color:#07384D;">${section.title}</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          ${section.items
            .map(
              (item) => `<tr>
                <td style="border:1px solid #d6e5ea;padding:6px;font-size:11px;">${item.label}</td>
                <td style="border:1px solid #d6e5ea;padding:6px;font-size:11px;">${item.value}</td>
                <td style="border:1px solid #d6e5ea;padding:6px;font-size:11px;width:80px;">${item.status ?? ""}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>`
    )
    .join("");

  const photosHtml = input.photos
    .map((photo) => `<img src="${photo}" style="height:92px;width:128px;object-fit:cover;border-radius:8px;border:1px solid #d6e5ea;"/>`)
    .join("");

  const signatureHtml = [
    ["Técnico", input.signatures.technician],
    ["Responsável Local", input.signatures.localResponsible],
    ["Supervisor", input.signatures.supervisor]
  ]
    .map(
      ([label, img]) => `<div style="flex:1;min-width:150px;">
      <div style="height:70px;border:1px dashed #8da8b2;border-radius:8px;display:flex;align-items:center;justify-content:center;">
        ${img ? `<img src="${img}" style="max-height:66px;max-width:100%;"/>` : `<span style="font-size:11px;color:#768b94;">Sem assinatura</span>`}
      </div>
      <div style="font-size:10px;color:#07384D;margin-top:4px;">${label}</div>
    </div>`
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Relatório ${input.checklistCode}</title>
  </head>
  <body style="font-family:Arial,sans-serif;background:#EAF4F6;padding:20px;">
    <main style="background:#fff;border-radius:14px;padding:20px;">
      <header style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        ${headerBrand}
        <div style="text-align:right;">
          <div style="font-size:16px;font-weight:700;color:#07384D;">Checklist ${input.checklistCode}</div>
          <div style="font-size:11px;color:#4a636d;">Status: ${input.status}</div>
        </div>
      </header>

      <section style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-bottom:16px;font-size:12px;">
        <div><strong>Cliente:</strong> ${input.customer}</div>
        <div><strong>Unidade:</strong> ${input.site}</div>
        <div><strong>Técnico:</strong> ${input.technician}</div>
        <div><strong>Supervisor:</strong> ${input.supervisor ?? "-"}</div>
        <div><strong>Executado em:</strong> ${input.executedAt}</div>
      </section>

      ${sectionHtml}

      <section style="margin-bottom:18px;">
        <h3 style="margin:0 0 10px;font-size:14px;color:#07384D;">Fotos</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${photosHtml || "<span style='font-size:11px;color:#768b94'>Sem fotos</span>"}</div>
      </section>

      <section>
        <h3 style="margin:0 0 10px;font-size:14px;color:#07384D;">Assinaturas</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">${signatureHtml}</div>
      </section>
    </main>
  </body>
</html>`;
};

export const renderServiceOrderDocumentHtml = (input: ServiceOrderDocumentTemplateInput) => {
  const headerBrand = input.logoUrl && !input.useBrandLockup
    ? `<img src="${input.logoUrl}" style="height:88px;object-fit:contain;" />`
    : input.brandLockupImageUrl
      ? `<img src="${input.brandLockupImageUrl}" style="height:92px;object-fit:contain;" />`
      : `<div style="font-size:34px;font-weight:900;letter-spacing:1px;color:#111827;">${escapeHtml(input.company.displayName)}</div>`;

  const specRows = input.equipment.specs.length
    ? input.equipment.specs
        .map(
          (spec) => `<tr>
            <td style="border:1px solid #d1d5db;padding:7px;font-size:12px;font-weight:700;background:#f8fafc;">${escapeHtml(spec.label)}</td>
            <td style="border:1px solid #d1d5db;padding:7px;font-size:12px;">${escapeHtml(spec.value)}</td>
          </tr>`
        )
        .join("")
    : `<tr>
        <td style="border:1px solid #d1d5db;padding:7px;font-size:12px;font-weight:700;background:#f8fafc;">Especificacoes</td>
        <td style="border:1px solid #d1d5db;padding:7px;font-size:12px;">Nao informado</td>
      </tr>`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Ordem de Servico ${escapeHtml(input.serviceOrder.code)}</title>
  </head>
  <body style="margin:0;background:#d1d5db;font-family:Arial,sans-serif;padding:22px;color:#111827;">
    <main style="max-width:900px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;box-shadow:0 10px 26px rgba(0,0,0,0.08);">
      <header style="display:flex;justify-content:space-between;gap:20px;margin-bottom:16px;">
        <div style="flex:1;">
          <h1 style="margin:0 0 10px;font-size:36px;font-weight:900;letter-spacing:1px;">${escapeHtml(input.client.name)}</h1>
          <div style="font-size:14px;line-height:1.55;">
            <div style="font-weight:700;font-size:17px;">${escapeHtml(input.company.legalName ?? input.company.displayName)}</div>
            <div>Telefone: ${escapeHtml(input.company.phone ?? "Nao informado")}</div>
            <div>CNPJ/Documento: ${escapeHtml(input.company.document ?? "Nao informado")}</div>
            <div>Email: ${escapeHtml(input.company.email ?? "Nao informado")}</div>
            <div>Endereco: ${escapeHtml(input.company.address ?? "Nao informado")}</div>
          </div>
        </div>
        <div style="width:220px;min-width:220px;border:2px solid #e5e7eb;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:8px;">
          ${headerBrand}
        </div>
      </header>

      <section style="margin-bottom:10px;">
        <table style="width:100%;border-collapse:collapse;">
          <tbody>
            <tr>
              <td style="border:1px solid #d1d5db;background:#f8fafc;padding:7px;font-weight:700;font-size:14px;">Informacoes do cliente</td>
            </tr>
            <tr>
              <td style="border:1px solid #d1d5db;padding:7px;font-size:13px;"><strong>Endereco:</strong> ${escapeHtml(input.client.address ?? "Nao informado")}</td>
            </tr>
            <tr>
              <td style="border:1px solid #d1d5db;padding:7px;font-size:13px;"><strong>Observacao:</strong> ${escapeHtml(input.client.observation ?? "-")}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style="margin-bottom:10px;">
        <table style="width:100%;border-collapse:collapse;">
          <tbody>
            <tr>
              <td style="border:1px solid #d1d5db;background:#f8fafc;padding:7px;font-weight:700;font-size:14px;">Cod. Ordem de Servico</td>
            </tr>
            <tr>
              <td style="border:1px solid #d1d5db;padding:7px;font-size:13px;"><strong>Data/Hora:</strong> ${escapeHtml(input.serviceOrder.datetimeLabel)}</td>
            </tr>
            <tr>
              <td style="border:1px solid #d1d5db;padding:7px;font-size:13px;"><strong>Status:</strong> ${escapeHtml(input.serviceOrder.statusLabel)}</td>
            </tr>
            <tr>
              <td style="border:1px solid #d1d5db;padding:7px;font-size:13px;"><strong>Orientacao:</strong> ${escapeHtml(input.serviceOrder.orientation ?? "-")}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <table style="width:100%;border-collapse:collapse;">
          <tbody>
            <tr>
              <td style="border:1px solid #d1d5db;background:#f8fafc;padding:7px;font-weight:700;font-size:14px;width:55%;">Equipamento: ${escapeHtml(input.equipment.title ?? "Nao informado")}</td>
              <td style="border:1px solid #d1d5db;background:#f8fafc;padding:7px;font-weight:700;font-size:14px;">Identificador: ${escapeHtml(input.equipment.identifier ?? "Nao informado")}</td>
            </tr>
            ${specRows}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
};
