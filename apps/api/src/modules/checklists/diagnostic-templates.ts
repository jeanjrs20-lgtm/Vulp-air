import type { Prisma, PrismaClient } from "@prisma/client";

type ServiceType = "INSTALACAO" | "PREVENTIVA" | "CORRETIVA" | "PMOC" | "VISTORIA";
type ItemType = "OK_NOK" | "TEXT" | "NUMBER" | "MULTIPLE_CHOICE" | "PHOTO_REQUIRED" | "SIGNATURE";

export type DiagnosticItemSeed = {
  label: string;
  itemType: ItemType;
  required: boolean;
  unit?: string;
  options?: string[];
};

export type DiagnosticSectionSeed = {
  title: string;
  items: DiagnosticItemSeed[];
};

export type DiagnosticTemplateSeed = {
  key: string;
  name: string;
  description: string;
  serviceType: ServiceType;
  sections: DiagnosticSectionSeed[];
};

const buildBaseSections = (symptoms: string[], technicalChecks: DiagnosticItemSeed[]): DiagnosticSectionSeed[] => {
  return [
    {
      title: "Identificacao do equipamento",
      items: [
        { label: "Patrimonio/Tag", itemType: "TEXT", required: true },
        { label: "Marca", itemType: "TEXT", required: true },
        { label: "Modelo", itemType: "TEXT", required: true },
        { label: "Serial", itemType: "TEXT", required: false },
        { label: "Localizacao", itemType: "TEXT", required: true }
      ]
    },
    {
      title: "Sintomas para diagnostico (check)",
      items: [
        {
          label: "Sintomas observados",
          itemType: "MULTIPLE_CHOICE",
          required: true,
          options: symptoms
        },
        {
          label: "Outros sintomas observados",
          itemType: "TEXT",
          required: false
        }
      ]
    },
    {
      title: "Validacoes tecnicas",
      items: technicalChecks
    },
    {
      title: "Diagnostico e encerramento",
      items: [
        { label: "Causa provavel", itemType: "TEXT", required: true },
        { label: "Acao corretiva recomendada", itemType: "TEXT", required: true },
        { label: "Pecas/material sugerido", itemType: "TEXT", required: false },
        { label: "Necessita retorno tecnico", itemType: "OK_NOK", required: true },
        { label: "Evidencias fotograficas", itemType: "PHOTO_REQUIRED", required: false },
        { label: "Assinatura do tecnico", itemType: "SIGNATURE", required: true }
      ]
    }
  ];
};

export const diagnosticTemplateSeeds: DiagnosticTemplateSeed[] = [
  {
    key: "diag-ar-condicionado",
    name: "Diagnostico - Ar Condicionado",
    description: "Checklist corretivo com sintomas e validacoes para diagnostico de ar condicionado.",
    serviceType: "CORRETIVA",
    sections: buildBaseSections(
      [
        "Nao refrigera",
        "Refrigera pouco",
        "Nao liga",
        "Desarma disjuntor",
        "Gotejamento interno",
        "Ruido excessivo",
        "Odor forte",
        "Congelamento da evaporadora",
        "Ventilador da condensadora nao gira",
        "Controle remoto sem resposta",
        "Variacao de temperatura",
        "Erro no display"
      ],
      [
        { label: "Tensao de alimentacao", itemType: "NUMBER", unit: "V", required: true },
        { label: "Corrente do compressor", itemType: "NUMBER", unit: "A", required: false },
        { label: "Pressao de sucao", itemType: "NUMBER", unit: "psi", required: false },
        { label: "Pressao de descarga", itemType: "NUMBER", unit: "psi", required: false },
        { label: "Filtro de ar limpo", itemType: "OK_NOK", required: true },
        { label: "Dreno desobstruido", itemType: "OK_NOK", required: true }
      ]
    )
  },
  {
    key: "diag-frigobar",
    name: "Diagnostico - Frigobar",
    description: "Checklist corretivo com sintomas e validacoes para diagnostico de frigobar.",
    serviceType: "CORRETIVA",
    sections: buildBaseSections(
      [
        "Nao refrigera",
        "Refrigera pouco",
        "Nao liga",
        "Faz gelo em excesso",
        "Vazamento de agua",
        "Ruido anormal",
        "Porta nao veda",
        "Borracha ressecada",
        "Luz interna apagada",
        "Compressor nao parte",
        "Superaquecimento lateral",
        "Odor interno forte"
      ],
      [
        { label: "Tensao de alimentacao", itemType: "NUMBER", unit: "V", required: true },
        { label: "Corrente do compressor", itemType: "NUMBER", unit: "A", required: false },
        { label: "Termostato responde", itemType: "OK_NOK", required: true },
        { label: "Vedacao da porta integra", itemType: "OK_NOK", required: true },
        { label: "Evaporador sem bloqueio de gelo", itemType: "OK_NOK", required: true }
      ]
    )
  },
  {
    key: "diag-tv",
    name: "Diagnostico - TV",
    description: "Checklist corretivo com sintomas e validacoes para diagnostico de TVs.",
    serviceType: "CORRETIVA",
    sections: buildBaseSections(
      [
        "Nao liga",
        "Sem imagem",
        "Sem som",
        "Imagem piscando",
        "Linhas na tela",
        "Controle remoto sem resposta",
        "Sem sinal HDMI",
        "Wifi nao conecta",
        "Reinicia sozinha",
        "Tela escura com audio",
        "Mancha na tela",
        "Entrada USB nao reconhece"
      ],
      [
        { label: "Tensao de alimentacao", itemType: "NUMBER", unit: "V", required: true },
        { label: "Backlight funcionando", itemType: "OK_NOK", required: false },
        { label: "Audio em teste local", itemType: "OK_NOK", required: false },
        { label: "Entradas HDMI testadas", itemType: "OK_NOK", required: true },
        { label: "Controle remoto com bateria", itemType: "OK_NOK", required: true }
      ]
    )
  },
  {
    key: "diag-cofre",
    name: "Diagnostico - Cofre",
    description: "Checklist corretivo com sintomas e validacoes para diagnostico de cofre eletronico.",
    serviceType: "CORRETIVA",
    sections: buildBaseSections(
      [
        "Nao abre com senha correta",
        "Teclado sem resposta",
        "Display apagado",
        "Bateria fraca",
        "Travamento mecanico",
        "Porta desalinhada",
        "Alerta sonoro continuo",
        "Erro apos tentativa",
        "Chave de emergencia nao funciona",
        "Fechamento nao conclui",
        "Codigo mestre rejeitado",
        "Sinal de arrombamento"
      ],
      [
        { label: "Bateria dentro da especificacao", itemType: "OK_NOK", required: true },
        { label: "Contato do teclado limpo", itemType: "OK_NOK", required: false },
        { label: "Mecanismo de travamento livre", itemType: "OK_NOK", required: true },
        { label: "Teste de abertura com senha tecnica", itemType: "OK_NOK", required: true },
        { label: "Teste com chave de emergencia", itemType: "OK_NOK", required: false }
      ]
    )
  },
  {
    key: "diag-filtro-agua",
    name: "Diagnostico - Filtro de Agua",
    description: "Checklist corretivo com sintomas e validacoes para diagnostico de filtro de agua.",
    serviceType: "CORRETIVA",
    sections: buildBaseSections(
      [
        "Nao sai agua",
        "Vazao reduzida",
        "Agua com gosto ou odor",
        "Vazamento externo",
        "Luz de troca de filtro acesa",
        "Ruido interno",
        "Pressao irregular",
        "Torneira com folga",
        "Filtro vencido",
        "Bomba nao aciona",
        "Agua turva",
        "Dreno obstruido"
      ],
      [
        { label: "Pressao de entrada", itemType: "NUMBER", unit: "bar", required: false },
        { label: "Elemento filtrante na validade", itemType: "OK_NOK", required: true },
        { label: "Conexoes sem vazamento", itemType: "OK_NOK", required: true },
        { label: "Bomba/solenoide operando", itemType: "OK_NOK", required: false },
        { label: "Fluxo apos manutencao", itemType: "OK_NOK", required: true }
      ]
    )
  },
  {
    key: "diag-camera-fria",
    name: "Diagnostico - Camera Fria",
    description: "Checklist corretivo com sintomas e validacoes para diagnostico de camara fria.",
    serviceType: "CORRETIVA",
    sections: buildBaseSections(
      [
        "Nao atinge temperatura",
        "Oscilacao de temperatura",
        "Nao liga",
        "Alarme de alta temperatura",
        "Excesso de gelo no evaporador",
        "Porta nao veda",
        "Vazamento de agua",
        "Ventilador interno parado",
        "Compressor nao parte",
        "Ruido excessivo",
        "Iluminacao interna falha",
        "Controlador com erro"
      ],
      [
        { label: "Temperatura ambiente da camara", itemType: "NUMBER", unit: "C", required: true },
        { label: "Setpoint configurado", itemType: "NUMBER", unit: "C", required: true },
        { label: "Degelo automatico funcionando", itemType: "OK_NOK", required: false },
        { label: "Vedacao da porta integra", itemType: "OK_NOK", required: true },
        { label: "Ventilacao interna operacional", itemType: "OK_NOK", required: true },
        { label: "Pressao de sucao", itemType: "NUMBER", unit: "psi", required: false }
      ]
    )
  }
];

const normalizeSeedSections = (sections: DiagnosticSectionSeed[]) => {
  return sections.map((section) => ({
    title: section.title.trim(),
    items: section.items.map((item) => ({
      label: item.label.trim(),
      itemType: item.itemType,
      unit: item.unit ?? null,
      required: item.required,
      options: item.options ?? null
    }))
  }));
};

const normalizeDbSections = (sections: Array<{ title: string; items: any[] }>) => {
  return sections.map((section) => ({
    title: section.title.trim(),
    items: section.items.map((item) => ({
      label: item.label.trim(),
      itemType: item.itemType,
      unit: item.unit ?? null,
      required: item.required,
      options: item.options ?? null
    }))
  }));
};

const sectionsAreDifferent = (seedSections: DiagnosticSectionSeed[], dbSections: Array<{ title: string; items: any[] }>) => {
  return JSON.stringify(normalizeSeedSections(seedSections)) !== JSON.stringify(normalizeDbSections(dbSections));
};

const createTemplateVersion = async ({
  tx,
  templateId,
  version,
  sections
}: {
  tx: Prisma.TransactionClient;
  templateId: string;
  version: number;
  sections: DiagnosticSectionSeed[];
}) => {
  const createdVersion = await tx.checklistTemplateVersion.create({
    data: {
      templateId,
      version,
      isActive: true
    }
  });

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const sectionData = sections[sectionIndex];
    const section = await tx.checklistSection.create({
      data: {
        templateVersionId: createdVersion.id,
        title: sectionData.title,
        order: sectionIndex + 1
      }
    });

    for (let itemIndex = 0; itemIndex < sectionData.items.length; itemIndex += 1) {
      const itemData = sectionData.items[itemIndex];
      await tx.checklistItem.create({
        data: {
          sectionId: section.id,
          label: itemData.label,
          itemType: itemData.itemType,
          unit: itemData.unit,
          options: itemData.options ? (itemData.options as unknown as Prisma.InputJsonValue) : undefined,
          required: itemData.required,
          order: itemIndex + 1
        }
      });
    }
  }
};

type EnsureDiagnosticTemplatesParams = {
  db: PrismaClient;
  createdById?: string;
};

export const ensureDiagnosticTemplates = async ({ db, createdById }: EnsureDiagnosticTemplatesParams) => {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const seed of diagnosticTemplateSeeds) {
    const template = await db.checklistTemplate.findFirst({
      where: { name: seed.name },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            sections: {
              orderBy: { order: "asc" },
              include: {
                items: {
                  orderBy: { order: "asc" }
                }
              }
            }
          }
        }
      }
    });

    if (!template) {
      await db.$transaction(async (tx) => {
        const createdTemplate = await tx.checklistTemplate.create({
          data: {
            name: seed.name,
            description: seed.description,
            serviceType: seed.serviceType,
            createdById
          }
        });

        await createTemplateVersion({
          tx,
          templateId: createdTemplate.id,
          version: 1,
          sections: seed.sections
        });
      });

      created += 1;
      continue;
    }

    const latestVersion = template.versions[0];

    const metadataChanged =
      template.description !== seed.description || template.serviceType !== seed.serviceType;

    const needsNewVersion =
      !latestVersion || sectionsAreDifferent(seed.sections, latestVersion.sections);

    if (!metadataChanged && !needsNewVersion) {
      unchanged += 1;
      continue;
    }

    await db.$transaction(async (tx) => {
      await tx.checklistTemplate.update({
        where: { id: template.id },
        data: {
          description: seed.description,
          serviceType: seed.serviceType
        }
      });

      if (needsNewVersion) {
        await tx.checklistTemplateVersion.updateMany({
          where: { templateId: template.id, isActive: true },
          data: { isActive: false }
        });

        await createTemplateVersion({
          tx,
          templateId: template.id,
          version: (latestVersion?.version ?? 0) + 1,
          sections: seed.sections
        });
      }
    });

    updated += 1;
  }

  return {
    created,
    updated,
    unchanged,
    total: diagnosticTemplateSeeds.length,
    templates: diagnosticTemplateSeeds.map((seed) => ({
      key: seed.key,
      name: seed.name,
      serviceType: seed.serviceType
    }))
  };
};
