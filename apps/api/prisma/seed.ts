import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ensureDiagnosticTemplates } from "../src/modules/checklists/diagnostic-templates.js";

const prisma = new PrismaClient();

const permissions = [
  "dashboard.read",
  "checklist.template.manage",
  "checklist.execution.manage",
  "checklist.review.manage",
  "serviceOrder.manage",
  "routing.manage",
  "quote.manage",
  "inventory.manage",
  "expense.manage",
  "feedback.manage",
  "finance.manage",
  "chat.manage",
  "reports.read",
  "desk.manage",
  "customerPortal.manage",
  "pop.manage",
  "pop.read",
  "users.manage",
  "settings.manage"
];

const rolePermissionMap: Record<string, string[]> = {
  SUPERADMIN: permissions,
  ADMIN: permissions,
  SUPERVISOR: [
    "dashboard.read",
    "checklist.execution.manage",
    "checklist.review.manage",
    "serviceOrder.manage",
    "routing.manage",
    "quote.manage",
    "inventory.manage",
    "expense.manage",
    "feedback.manage",
    "finance.manage",
    "chat.manage",
    "reports.read",
    "desk.manage",
    "customerPortal.manage",
    "pop.manage",
    "pop.read"
  ],
  TECNICO: [
    "dashboard.read",
    "checklist.execution.manage",
    "serviceOrder.manage",
    "quote.manage",
    "expense.manage",
    "feedback.manage",
    "chat.manage",
    "desk.manage",
    "pop.read"
  ],
  LEITOR: ["pop.read", "reports.read"]
};

const hvacSections = [
  {
    title: "Dados do Equipamento",
    items: [
      { label: "Marca", itemType: "TEXT", required: true },
      { label: "Modelo", itemType: "TEXT", required: true },
      { label: "Serial", itemType: "TEXT", required: true },
      { label: "Capacidade BTU", itemType: "NUMBER", unit: "BTU", required: true }
    ]
  },
  {
    title: "Medições",
    items: [
      { label: "Temperatura de retorno", itemType: "NUMBER", unit: "°C", required: true },
      { label: "Temperatura de insuflação", itemType: "NUMBER", unit: "°C", required: true },
      { label: "Pressão", itemType: "NUMBER", unit: "psi", required: false },
      { label: "Amperagem", itemType: "NUMBER", unit: "A", required: false },
      { label: "Vibração", itemType: "NUMBER", unit: "mm/s", required: false },
      { label: "Ruído", itemType: "NUMBER", unit: "dB", required: false }
    ]
  },
  {
    title: "Inspeção Física",
    items: [
      { label: "Condensadora - limpeza", itemType: "OK_NOK", required: true },
      { label: "Condensadora - aletas", itemType: "OK_NOK", required: true },
      { label: "Condensadora - ventilador", itemType: "OK_NOK", required: true },
      { label: "Condensadora - fixação", itemType: "OK_NOK", required: true },
      { label: "Evaporadora - filtro", itemType: "OK_NOK", required: true },
      { label: "Evaporadora - dreno", itemType: "OK_NOK", required: true },
      { label: "Evaporadora - serpentina", itemType: "OK_NOK", required: true }
    ]
  },
  {
    title: "Elétrica e Evidências",
    items: [
      { label: "Disjuntor", itemType: "OK_NOK", required: true },
      { label: "Cabos", itemType: "OK_NOK", required: true },
      { label: "Aterramento", itemType: "OK_NOK", required: true },
      { label: "Fotos antes/depois", itemType: "PHOTO_REQUIRED", required: true },
      { label: "Observações e recomendação", itemType: "TEXT", required: false },
      { label: "Assinatura", itemType: "SIGNATURE", required: true }
    ]
  }
];

const upsertUser = async (
  email: string,
  name: string,
  role: "SUPERADMIN" | "ADMIN" | "SUPERVISOR" | "TECNICO" | "LEITOR",
  password = "123456"
) => {
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      passwordHash
    },
    create: {
      email,
      name,
      role,
      passwordHash
    }
  });
};

async function main() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch {
    console.warn("Extensao vector indisponivel neste ambiente; seguindo seed em modo texto.");
  }

  for (const roleCode of ["SUPERADMIN", "ADMIN", "SUPERVISOR", "TECNICO", "LEITOR"] as const) {
    await prisma.role.upsert({
      where: { code: roleCode },
      update: {},
      create: {
        code: roleCode,
        name: roleCode
      }
    });
  }

  for (const action of permissions) {
    await prisma.permission.upsert({
      where: { action },
      update: {},
      create: {
        action,
        description: action
      }
    });
  }

  for (const [roleCode, actions] of Object.entries(rolePermissionMap)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode as never } });

    for (const action of actions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { action } });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id
        }
      });
    }
  }

  const superadmin = await upsertUser("superadmin@vulp.local", "Superadmin VULP", "SUPERADMIN");
  await upsertUser("admin@vulp.local", "Admin VULP", "ADMIN");
  const supervisor = await upsertUser("supervisor@vulp.local", "Supervisor VULP", "SUPERVISOR");
  const tecnico = await upsertUser("tecnico@vulp.local", "Técnico VULP", "TECNICO");
  await upsertUser("leitor@vulp.local", "Leitor VULP", "LEITOR");

  await prisma.settings.upsert({
    where: { id: "app" },
    update: {
      brandingColors: {
        primary: "#07384D",
        background: "#5ADCE8",
        highlight: "#DCEB15",
        textOnDark: "#FFFFFF",
        neutralBg: "#EAF4F6"
      },
      useBrandLockup: true,
      smtpHost: "localhost",
      smtpPort: 1025,
      smtpFrom: "VULP AIR <no-reply@local>",
      categories: ["Segurança", "Instalação", "Manutenção", "PMOC"],
      tags: ["elétrica", "filtro", "limpeza", "condensadora", "evaporadora"]
    },
    create: {
      id: "app",
      brandingColors: {
        primary: "#07384D",
        background: "#5ADCE8",
        highlight: "#DCEB15",
        textOnDark: "#FFFFFF",
        neutralBg: "#EAF4F6"
      },
      useBrandLockup: true,
      smtpHost: "localhost",
      smtpPort: 1025,
      smtpFrom: "VULP AIR <no-reply@local>",
      categories: ["Segurança", "Instalação", "Manutenção", "PMOC"],
      tags: ["elétrica", "filtro", "limpeza", "condensadora", "evaporadora"]
    }
  });

  const customer = await prisma.customer.upsert({
    where: { id: "seed-customer" },
    update: {
      name: "Cliente Exemplo VULP",
      legalName: "Cliente Exemplo VULP LTDA",
      email: "contato@clientevulp.com.br",
      phone: "(11) 4002-1000",
      status: "ACTIVE",
      customerGroup: "Contratos",
      segment: "Comercial",
      contactName: "Fernanda Souza",
      billingEmail: "financeiro@clientevulp.com.br",
      notes: "Cliente preferencial com atendimento em horario comercial."
    },
    create: {
      id: "seed-customer",
      name: "Cliente Exemplo VULP",
      legalName: "Cliente Exemplo VULP LTDA",
      document: "12.345.678/0001-99",
      email: "contato@clientevulp.com.br",
      phone: "(11) 4002-1000",
      status: "ACTIVE",
      customerGroup: "Contratos",
      segment: "Comercial",
      contactName: "Fernanda Souza",
      billingEmail: "financeiro@clientevulp.com.br",
      notes: "Cliente preferencial com atendimento em horario comercial."
    }
  });

  const overdueCustomer = await prisma.customer.upsert({
    where: { id: "seed-customer-overdue" },
    update: {
      name: "Cliente Inadimplente Demo",
      legalName: "Cliente Inadimplente Demo LTDA",
      email: "financeiro@inadimplente.demo",
      status: "ACTIVE",
      customerGroup: "Cobranca",
      segment: "Industrial",
      contactName: "Andre Luiz"
    },
    create: {
      id: "seed-customer-overdue",
      name: "Cliente Inadimplente Demo",
      legalName: "Cliente Inadimplente Demo LTDA",
      document: "22.333.444/0001-55",
      email: "financeiro@inadimplente.demo",
      status: "ACTIVE",
      customerGroup: "Cobranca",
      segment: "Industrial",
      contactName: "Andre Luiz"
    }
  });

  const agreementCustomer = await prisma.customer.upsert({
    where: { id: "seed-customer-agreement" },
    update: {
      name: "Cliente Em Acordo Demo",
      legalName: "Cliente Em Acordo Demo SA",
      email: "contas@acordo.demo",
      status: "ACTIVE",
      customerGroup: "Cobranca",
      segment: "Hotelaria",
      contactName: "Bianca Paiva"
    },
    create: {
      id: "seed-customer-agreement",
      name: "Cliente Em Acordo Demo",
      legalName: "Cliente Em Acordo Demo SA",
      document: "66.777.888/0001-20",
      email: "contas@acordo.demo",
      status: "ACTIVE",
      customerGroup: "Cobranca",
      segment: "Hotelaria",
      contactName: "Bianca Paiva"
    }
  });

  const site = await prisma.siteLocation.upsert({
    where: { id: "seed-site" },
    update: {
      name: "Unidade Centro",
      latitude: -23.55052,
      longitude: -46.633308,
      geofenceRadiusMeters: 180
    },
    create: {
      id: "seed-site",
      customerId: customer.id,
      name: "Unidade Centro",
      address: "Rua das Palmeiras, 100",
      city: "São Paulo",
      state: "SP",
      latitude: -23.55052,
      longitude: -46.633308,
      geofenceRadiusMeters: 180
    }
  });

  const equipment = await prisma.equipment.upsert({
    where: { id: "seed-equipment" },
    update: {
      brand: "VULP AIR",
      model: "VX-24000"
    },
    create: {
      id: "seed-equipment",
      siteLocationId: site.id,
      brand: "VULP AIR",
      model: "VX-24000",
      serial: "VULP-24000-0001",
      btu: 24000,
      equipmentType: "Split"
    }
  });

  const serviceOrder = await prisma.serviceOrder.upsert({
    where: { id: "seed-service-order" },
    update: {
      title: "Manutencao preventiva mensal - Unidade Centro",
      customerId: customer.id,
      siteLocationId: site.id,
      equipmentId: equipment.id,
      assignedTechnicianId: tecnico.id,
      status: "SCHEDULED",
      serviceDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      scheduledStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      scheduledEndAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      slaDueAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    },
    create: {
      id: "seed-service-order",
      code: "SO-SEED-0001",
      title: "Manutencao preventiva mensal - Unidade Centro",
      description: "Ordem de servico de referencia para fluxo integrado",
      priority: "HIGH",
      status: "SCHEDULED",
      customerId: customer.id,
      siteLocationId: site.id,
      equipmentId: equipment.id,
      assignedTechnicianId: tecnico.id,
      createdById: supervisor.id,
      serviceDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      scheduledStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      scheduledEndAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      slaDueAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    }
  });

  const quote = await prisma.quote.upsert({
    where: { id: "seed-quote" },
    update: {
      customerId: customer.id,
      serviceOrderId: serviceOrder.id,
      status: "SENT",
      subtotal: 900,
      discount: 50,
      total: 850,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: "seed-quote",
      code: "QTE-SEED-0001",
      customerId: customer.id,
      serviceOrderId: serviceOrder.id,
      createdById: supervisor.id,
      status: "SENT",
      subtotal: 900,
      discount: 50,
      total: 850,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notes: "Proposta de referencia para validacao do portal",
      items: {
        createMany: {
          data: [
            {
              description: "Limpeza e higienizacao",
              quantity: 1,
              unitPrice: 400,
              total: 400
            },
            {
              description: "Troca de filtro",
              quantity: 1,
              unitPrice: 500,
              total: 500
            }
          ],
          skipDuplicates: true
        }
      }
    }
  });

  await prisma.deskTicket.upsert({
    where: { id: "seed-desk-ticket" },
    update: {
      title: "Cliente solicitou ajuste de horario",
      description: "Solicitacao recebida para remarcar inicio do atendimento",
      customerId: customer.id,
      siteLocationId: site.id,
      serviceOrderId: serviceOrder.id,
      quoteId: quote.id,
      assignedTechnicianId: tecnico.id,
      dueAt: new Date(Date.now() + 16 * 60 * 60 * 1000)
    },
    create: {
      id: "seed-desk-ticket",
      code: "DSK-SEED-0001",
      title: "Cliente solicitou ajuste de horario",
      description: "Solicitacao recebida para remarcar inicio do atendimento",
      status: "TRIAGE",
      priority: "MEDIUM",
      channel: "PHONE",
      customerId: customer.id,
      siteLocationId: site.id,
      serviceOrderId: serviceOrder.id,
      quoteId: quote.id,
      createdById: supervisor.id,
      assignedTechnicianId: tecnico.id,
      dueAt: new Date(Date.now() + 16 * 60 * 60 * 1000),
      events: {
        create: [
          {
            actorId: supervisor.id,
            type: "DESK_TICKET_CREATED",
            note: "Ticket criado automaticamente no seed"
          }
        ]
      }
    }
  });

  const project = await prisma.project.upsert({
    where: { id: "seed-project" },
    update: {
      code: "PRJ-SEED-0001",
      name: "Projeto PMOC 2026",
      description: "Controle macro de atividades, tickets e OS do contrato principal.",
      status: "ACTIVE",
      priority: "HIGH",
      customerId: customer.id,
      ownerId: supervisor.id,
      startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      budgetAmount: 25000
    },
    create: {
      id: "seed-project",
      code: "PRJ-SEED-0001",
      name: "Projeto PMOC 2026",
      description: "Controle macro de atividades, tickets e OS do contrato principal.",
      status: "ACTIVE",
      priority: "HIGH",
      customerId: customer.id,
      ownerId: supervisor.id,
      startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      budgetAmount: 25000
    }
  });

  await prisma.projectMember.deleteMany({
    where: {
      projectId: project.id
    }
  });

  await prisma.projectMember.createMany({
    data: [
      {
        projectId: project.id,
        userId: supervisor.id,
        role: "OWNER",
        isWatcher: true
      },
      {
        projectId: project.id,
        userId: tecnico.id,
        role: "FIELD_TECH",
        isWatcher: true
      }
    ],
    skipDuplicates: true
  });

  await prisma.projectTask.upsert({
    where: { id: "seed-project-task-1" },
    update: {
      projectId: project.id,
      title: "Executar manutencao preventiva da unidade centro",
      description: "Tarefa sincronizada com OS principal para acompanhamento em projeto.",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignedToId: tecnico.id,
      createdById: supervisor.id,
      linkedServiceOrderId: serviceOrder.id,
      linkedDeskTicketId: "seed-desk-ticket",
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      estimatedHours: 6,
      loggedHours: 2.5,
      startedAt: new Date()
    },
    create: {
      id: "seed-project-task-1",
      projectId: project.id,
      title: "Executar manutencao preventiva da unidade centro",
      description: "Tarefa sincronizada com OS principal para acompanhamento em projeto.",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignedToId: tecnico.id,
      createdById: supervisor.id,
      linkedServiceOrderId: serviceOrder.id,
      linkedDeskTicketId: "seed-desk-ticket",
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      estimatedHours: 6,
      loggedHours: 2.5,
      startedAt: new Date()
    }
  });

  await prisma.projectTask.upsert({
    where: { id: "seed-project-task-2" },
    update: {
      projectId: project.id,
      title: "Consolidar evidencias e enviar relatorio ao cliente",
      description: "Validar fotos, checklist e assinatura digital.",
      status: "TODO",
      priority: "MEDIUM",
      assignedToId: supervisor.id,
      createdById: supervisor.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      estimatedHours: 3,
      loggedHours: 0,
      linkedServiceOrderId: serviceOrder.id,
      linkedDeskTicketId: null,
      startedAt: null,
      completedAt: null
    },
    create: {
      id: "seed-project-task-2",
      projectId: project.id,
      title: "Consolidar evidencias e enviar relatorio ao cliente",
      description: "Validar fotos, checklist e assinatura digital.",
      status: "TODO",
      priority: "MEDIUM",
      assignedToId: supervisor.id,
      createdById: supervisor.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      estimatedHours: 3,
      loggedHours: 0,
      linkedServiceOrderId: serviceOrder.id
    }
  });

  const crmLead = await prisma.crmLead.upsert({
    where: { id: "seed-crm-lead-1" },
    update: {
      code: "CRM-SEED-0001",
      name: "Fernanda Souza",
      company: "Cliente Exemplo VULP LTDA",
      email: "fernanda.souza@clientevulp.com.br",
      phone: "(11) 98888-0001",
      source: "INDICACAO",
      status: "NEGOTIATION",
      priority: "HIGH",
      estimatedValue: 18000,
      expectedCloseAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      ownerId: supervisor.id,
      customerId: customer.id,
      projectId: project.id,
      linkedQuoteId: quote.id,
      linkedDeskTicketId: "seed-desk-ticket",
      notes: "Lead avancado com proposta tecnica e financeira em negociacao."
    },
    create: {
      id: "seed-crm-lead-1",
      code: "CRM-SEED-0001",
      name: "Fernanda Souza",
      company: "Cliente Exemplo VULP LTDA",
      email: "fernanda.souza@clientevulp.com.br",
      phone: "(11) 98888-0001",
      source: "INDICACAO",
      status: "NEGOTIATION",
      priority: "HIGH",
      estimatedValue: 18000,
      expectedCloseAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      ownerId: supervisor.id,
      customerId: customer.id,
      projectId: project.id,
      linkedQuoteId: quote.id,
      linkedDeskTicketId: "seed-desk-ticket",
      notes: "Lead avancado com proposta tecnica e financeira em negociacao."
    }
  });

  await prisma.crmLeadActivity.upsert({
    where: { id: "seed-crm-activity-1" },
    update: {
      leadId: crmLead.id,
      actorId: supervisor.id,
      type: "MEETING",
      subject: "Reuniao de alinhamento comercial",
      note: "Cliente aprovou escopo tecnico e pediu ajuste de condicoes de pagamento.",
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: "seed-crm-activity-1",
      leadId: crmLead.id,
      actorId: supervisor.id,
      type: "MEETING",
      subject: "Reuniao de alinhamento comercial",
      note: "Cliente aprovou escopo tecnico e pediu ajuste de condicoes de pagamento.",
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    }
  });

  const invoice = await prisma.financialInvoice.upsert({
    where: { id: "seed-invoice" },
    update: {
      code: "INV-SEED-0001",
      customerId: customer.id,
      serviceOrderId: serviceOrder.id,
      quoteId: quote.id,
      deskTicketId: "seed-desk-ticket",
      description: "Fatura seed referente a manutencao preventiva",
      status: "PARTIALLY_PAID",
      currency: "BRL",
      issueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      subtotal: 1700,
      discount: 0,
      penalties: 0,
      totalAmount: 1700,
      paidAmount: 500,
      balanceAmount: 1200,
      issuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      createdById: supervisor.id
    },
    create: {
      id: "seed-invoice",
      code: "INV-SEED-0001",
      customerId: customer.id,
      serviceOrderId: serviceOrder.id,
      quoteId: quote.id,
      deskTicketId: "seed-desk-ticket",
      description: "Fatura seed referente a manutencao preventiva",
      status: "PARTIALLY_PAID",
      currency: "BRL",
      issueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      subtotal: 1700,
      discount: 0,
      penalties: 0,
      totalAmount: 1700,
      paidAmount: 500,
      balanceAmount: 1200,
      issuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      createdById: supervisor.id
    }
  });

  await prisma.financialInvoiceItem.deleteMany({
    where: {
      invoiceId: invoice.id
    }
  });

  await prisma.financialInvoiceItem.createMany({
    data: [
      {
        invoiceId: invoice.id,
        description: "Servico tecnico de manutencao preventiva",
        quantity: 1,
        unitPrice: 1000,
        total: 1000
      },
      {
        invoiceId: invoice.id,
        description: "Materiais e troca de filtro",
        quantity: 1,
        unitPrice: 700,
        total: 700
      }
    ]
  });

  await prisma.financialPayment.upsert({
    where: { id: "seed-payment" },
    update: {
      invoiceId: invoice.id,
      method: "PIX",
      amount: 500,
      paidAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      reference: "PIX-SEED-500",
      note: "Pagamento parcial seed",
      receivedById: supervisor.id
    },
    create: {
      id: "seed-payment",
      invoiceId: invoice.id,
      method: "PIX",
      amount: 500,
      paidAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      reference: "PIX-SEED-500",
      note: "Pagamento parcial seed",
      receivedById: supervisor.id
    }
  });

  await prisma.financialCharge.upsert({
    where: { id: "seed-charge" },
    update: {
      invoiceId: invoice.id,
      channel: "WHATSAPP",
      status: "SENT",
      sentAt: new Date(),
      note: "Cobranca seed enviada",
      createdById: supervisor.id
    },
    create: {
      id: "seed-charge",
      invoiceId: invoice.id,
      channel: "WHATSAPP",
      status: "SENT",
      sentAt: new Date(),
      note: "Cobranca seed enviada",
      createdById: supervisor.id
    }
  });

  const overdueInvoice = await prisma.financialInvoice.upsert({
    where: { id: "seed-invoice-overdue" },
    update: {
      code: "INV-INAD-0001",
      customerId: overdueCustomer.id,
      description: "Fatura demo em atraso para teste de inadimplencia",
      status: "OVERDUE",
      currency: "BRL",
      issueDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      subtotal: 980,
      discount: 0,
      penalties: 0,
      totalAmount: 980,
      paidAmount: 0,
      balanceAmount: 980,
      issuedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      createdById: supervisor.id
    },
    create: {
      id: "seed-invoice-overdue",
      code: "INV-INAD-0001",
      customerId: overdueCustomer.id,
      description: "Fatura demo em atraso para teste de inadimplencia",
      status: "OVERDUE",
      currency: "BRL",
      issueDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      subtotal: 980,
      discount: 0,
      penalties: 0,
      totalAmount: 980,
      paidAmount: 0,
      balanceAmount: 980,
      issuedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      createdById: supervisor.id
    }
  });

  await prisma.financialInvoiceItem.deleteMany({
    where: {
      invoiceId: overdueInvoice.id
    }
  });

  await prisma.financialInvoiceItem.createMany({
    data: [
      {
        invoiceId: overdueInvoice.id,
        description: "Manutencao corretiva em atraso",
        quantity: 1,
        unitPrice: 980,
        total: 980
      }
    ]
  });

  await prisma.financialCharge.upsert({
    where: { id: "seed-charge-overdue" },
    update: {
      invoiceId: overdueInvoice.id,
      channel: "WHATSAPP",
      status: "SENT",
      sentAt: new Date(),
      note: "Cobranca automatica enviada - cliente inadimplente",
      createdById: supervisor.id
    },
    create: {
      id: "seed-charge-overdue",
      invoiceId: overdueInvoice.id,
      channel: "WHATSAPP",
      status: "SENT",
      sentAt: new Date(),
      note: "Cobranca automatica enviada - cliente inadimplente",
      createdById: supervisor.id
    }
  });

  const agreementInvoice = await prisma.financialInvoice.upsert({
    where: { id: "seed-invoice-agreement" },
    update: {
      code: "INV-ACO-0001",
      customerId: agreementCustomer.id,
      description: "Fatura demo em fase de acordo",
      status: "PARTIALLY_PAID",
      currency: "BRL",
      issueDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      subtotal: 1400,
      discount: 0,
      penalties: 0,
      totalAmount: 1400,
      paidAmount: 300,
      balanceAmount: 1100,
      issuedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      createdById: supervisor.id
    },
    create: {
      id: "seed-invoice-agreement",
      code: "INV-ACO-0001",
      customerId: agreementCustomer.id,
      description: "Fatura demo em fase de acordo",
      status: "PARTIALLY_PAID",
      currency: "BRL",
      issueDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      subtotal: 1400,
      discount: 0,
      penalties: 0,
      totalAmount: 1400,
      paidAmount: 300,
      balanceAmount: 1100,
      issuedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      createdById: supervisor.id
    }
  });

  await prisma.financialInvoiceItem.deleteMany({
    where: {
      invoiceId: agreementInvoice.id
    }
  });

  await prisma.financialInvoiceItem.createMany({
    data: [
      {
        invoiceId: agreementInvoice.id,
        description: "Servico tecnico em parcelamento de acordo",
        quantity: 1,
        unitPrice: 1400,
        total: 1400
      }
    ]
  });

  await prisma.financialPayment.upsert({
    where: { id: "seed-payment-agreement" },
    update: {
      invoiceId: agreementInvoice.id,
      method: "TRANSFER",
      amount: 300,
      paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      reference: "ACORDO-PARCELA-1",
      note: "Entrada do acordo",
      receivedById: supervisor.id
    },
    create: {
      id: "seed-payment-agreement",
      invoiceId: agreementInvoice.id,
      method: "TRANSFER",
      amount: 300,
      paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      reference: "ACORDO-PARCELA-1",
      note: "Entrada do acordo",
      receivedById: supervisor.id
    }
  });

  await prisma.financialCharge.upsert({
    where: { id: "seed-charge-agreement" },
    update: {
      invoiceId: agreementInvoice.id,
      channel: "PHONE",
      status: "PROMISED",
      sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      note: "Cliente em acordo com promessa de pagamento",
      createdById: supervisor.id
    },
    create: {
      id: "seed-charge-agreement",
      invoiceId: agreementInvoice.id,
      channel: "PHONE",
      status: "PROMISED",
      sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      note: "Cliente em acordo com promessa de pagamento",
      createdById: supervisor.id
    }
  });

  const chatThread = await prisma.chatThread.upsert({
    where: { id: "seed-chat-thread" },
    update: {
      code: "CHT-SEED-0001",
      subject: "Alinhamento de atendimento da unidade",
      status: "OPEN",
      channel: "PORTAL",
      customerId: customer.id,
      deskTicketId: "seed-desk-ticket",
      serviceOrderId: serviceOrder.id,
      quoteId: quote.id,
      createdById: supervisor.id,
      assignedToId: tecnico.id,
      lastMessageAt: new Date()
    },
    create: {
      id: "seed-chat-thread",
      code: "CHT-SEED-0001",
      subject: "Alinhamento de atendimento da unidade",
      status: "OPEN",
      channel: "PORTAL",
      customerId: customer.id,
      deskTicketId: "seed-desk-ticket",
      serviceOrderId: serviceOrder.id,
      quoteId: quote.id,
      createdById: supervisor.id,
      assignedToId: tecnico.id,
      lastMessageAt: new Date()
    }
  });

  await prisma.chatMessage.deleteMany({
    where: {
      threadId: chatThread.id
    }
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        threadId: chatThread.id,
        senderType: "CUSTOMER",
        senderCustomerId: customer.id,
        senderName: customer.name,
        message: "Precisamos confirmar o horario da visita de manutencao."
      },
      {
        threadId: chatThread.id,
        senderType: "USER",
        senderUserId: supervisor.id,
        senderName: supervisor.name,
        message: "Horario confirmado para amanha as 08:00. Tecnico ja acionado."
      }
    ]
  });

  const portalSeedToken = "portal-seed-vulp-air";
  await prisma.customerPortalAccess.upsert({
    where: {
      tokenHash: createHash("sha256").update(portalSeedToken).digest("hex")
    },
    update: {
      customerId: customer.id,
      label: "Acesso seed",
      revokedAt: null
    },
    create: {
      customerId: customer.id,
      tokenHash: createHash("sha256").update(portalSeedToken).digest("hex"),
      label: "Acesso seed",
      createdById: supervisor.id
    }
  });

  const template = await prisma.checklistTemplate.upsert({
    where: { id: "seed-template" },
    update: {
      name: "Template HVAC Padrão",
      serviceType: "PREVENTIVA"
    },
    create: {
      id: "seed-template",
      name: "Template HVAC Padrão",
      description: "Checklist padrão para atendimentos HVAC",
      serviceType: "PREVENTIVA",
      createdById: superadmin.id
    }
  });

  const existingVersion = await prisma.checklistTemplateVersion.findFirst({
    where: { templateId: template.id },
    orderBy: { version: "desc" }
  });

  let templateVersion = existingVersion;

  if (!templateVersion) {
    templateVersion = await prisma.checklistTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        isActive: true
      }
    });

    for (let sectionIndex = 0; sectionIndex < hvacSections.length; sectionIndex += 1) {
      const sectionData = hvacSections[sectionIndex];
      const section = await prisma.checklistSection.create({
        data: {
          templateVersionId: templateVersion.id,
          title: sectionData.title,
          order: sectionIndex + 1
        }
      });

      for (let itemIndex = 0; itemIndex < sectionData.items.length; itemIndex += 1) {
        const itemData = sectionData.items[itemIndex];
        await prisma.checklistItem.create({
          data: {
            sectionId: section.id,
            label: itemData.label,
            itemType: itemData.itemType as never,
            required: itemData.required,
            unit: itemData.unit,
            order: itemIndex + 1
          }
        });
      }
    }
  }

  const existingExecution = await prisma.checklistExecution.findFirst({
    where: {
      assignedTechnicianId: tecnico.id,
      templateVersionId: templateVersion!.id,
      customerId: customer.id
    }
  });

  if (!existingExecution) {
    await prisma.checklistExecution.create({
      data: {
        code: `CHK-SEED-${Date.now().toString().slice(-6)}`,
        templateVersionId: templateVersion!.id,
        assignedTechnicianId: tecnico.id,
        customerId: customer.id,
        siteLocationId: site.id,
        equipmentId: equipment.id,
        status: "IN_PROGRESS",
        step: 2,
        startedAt: new Date(),
        reviewComments: {
          create: [
            {
              comment: "Execução criada automaticamente para testes",
              createdById: supervisor.id
            }
          ]
        }
      }
    });
  }

  await ensureDiagnosticTemplates({
    db: prisma,
    createdById: superadmin.id
  });

  console.log("Seed finalizado.");
  console.log("Usuários padrão (senha 123456):");
  console.log("superadmin@vulp.local");
  console.log("admin@vulp.local");
  console.log("supervisor@vulp.local");
  console.log("tecnico@vulp.local");
  console.log("leitor@vulp.local");
  console.log("Portal cliente seed: http://localhost:3000/portal/portal-seed-vulp-air");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
