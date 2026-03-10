-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'TECNICO', 'LEITOR');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('INSTALACAO', 'PREVENTIVA', 'CORRETIVA', 'PMOC', 'VISTORIA');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('OK_NOK', 'TEXT', 'NUMBER', 'MULTIPLE_CHOICE', 'PHOTO_REQUIRED', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "ChecklistExecutionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REOPENED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'PDF', 'THUMBNAIL', 'SIGNATURE', 'OTHER');

-- CreateEnum
CREATE TYPE "PopStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('OPEN', 'SCHEDULED', 'DISPATCHED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ServiceOrderLocationType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'PING');

-- CreateEnum
CREATE TYPE "TeamGpsStatus" AS ENUM ('HIGH_ACCURACY', 'LOW_ACCURACY', 'OFF', 'UNAVAILABLE', 'MOCKED');

-- CreateEnum
CREATE TYPE "TeamInternetStatus" AS ENUM ('ONLINE', 'OFFLINE', 'LIMITED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'RESERVED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('FUEL', 'TOLL', 'PARKING', 'MEAL', 'LODGING', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoutePlanStatus" AS ENUM ('PLANNED', 'OPTIMIZED', 'PUBLISHED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "RouteStopStatus" AS ENUM ('PLANNED', 'STARTED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SatisfactionChannel" AS ENUM ('APP', 'WHATSAPP', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "DeskTicketStatus" AS ENUM ('OPEN', 'TRIAGE', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeskTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DeskTicketChannel" AS ENUM ('PORTAL', 'PHONE', 'EMAIL', 'WHATSAPP', 'INTERNAL');

-- CreateEnum
CREATE TYPE "FinancialInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "FinancialChargeStatus" AS ENUM ('SCHEDULED', 'SENT', 'VIEWED', 'PROMISED', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "FinancialChargeChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS', 'PHONE', 'PORTAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "FinancialPaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_SLIP', 'CASH', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "ChatThreadStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ChatThreadChannel" AS ENUM ('INTERNAL', 'WHATSAPP', 'PORTAL', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "ChatSenderType" AS ENUM ('USER', 'CUSTOMER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProjectTaskStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'ON_HOLD', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmLeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'WHATSAPP', 'NOTE', 'TASK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "RoleCode" NOT NULL DEFAULT 'TECNICO',
    "team" TEXT,
    "regional" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,
    "team" TEXT,
    "regional" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "customerGroup" TEXT,
    "segment" TEXT,
    "contactName" TEXT,
    "billingEmail" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteLocation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geofenceRadiusMeters" DOUBLE PRECISION DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "siteLocationId" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "btu" INTEGER,
    "equipmentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistSection" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ChecklistSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "unit" TEXT,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistExecution" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "assignedTechnicianId" TEXT NOT NULL,
    "customerId" TEXT,
    "siteLocationId" TEXT,
    "equipmentId" TEXT,
    "status" "ChecklistExecutionStatus" NOT NULL DEFAULT 'DRAFT',
    "step" INTEGER NOT NULL DEFAULT 1,
    "serviceDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "technicianSignature" TEXT,
    "localResponsibleSignature" TEXT,
    "supervisorSignature" TEXT,
    "notes" TEXT,
    "pdfAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ServiceOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "serviceDate" TIMESTAMP(3),
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "slaDueAt" TIMESTAMP(3),
    "customerId" TEXT,
    "siteLocationId" TEXT,
    "equipmentId" TEXT,
    "assignedTechnicianId" TEXT,
    "createdById" TEXT,
    "checklistExecutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderEvent" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderLocationPoint" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "type" "ServiceOrderLocationType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "source" TEXT,
    "note" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderLocationPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamLocationPing" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "source" TEXT,
    "gpsStatus" "TeamGpsStatus",
    "internetStatus" "TeamInternetStatus",
    "batteryLevel" INTEGER,
    "isCharging" BOOLEAN,
    "appVersion" TEXT,
    "osVersion" TEXT,
    "deviceModel" TEXT,
    "deviceId" TEXT,
    "isMockLocation" BOOLEAN,
    "integrityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamLocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "customerId" TEXT,
    "createdById" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeskTicket" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "DeskTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "DeskTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "channel" "DeskTicketChannel" NOT NULL DEFAULT 'PORTAL',
    "customerId" TEXT NOT NULL,
    "siteLocationId" TEXT,
    "serviceOrderId" TEXT,
    "quoteId" TEXT,
    "createdById" TEXT,
    "assignedTechnicianId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstResponseAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeskTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeskTicketEvent" (
    "id" TEXT NOT NULL,
    "deskTicketId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeskTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalAccess" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialInvoice" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "quoteId" TEXT,
    "deskTicketId" TEXT,
    "description" TEXT,
    "status" "FinancialInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penalties" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "FinancialPaymentMethod" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "note" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialCharge" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "channel" "FinancialChargeChannel" NOT NULL,
    "status" "FinancialChargeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledTo" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ChatThreadStatus" NOT NULL DEFAULT 'OPEN',
    "channel" "ChatThreadChannel" NOT NULL DEFAULT 'INTERNAL',
    "customerId" TEXT,
    "deskTicketId" TEXT,
    "serviceOrderId" TEXT,
    "quoteId" TEXT,
    "createdById" TEXT,
    "assignedToId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" "ChatSenderType" NOT NULL,
    "senderUserId" TEXT,
    "senderCustomerId" TEXT,
    "senderName" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "customerId" TEXT,
    "ownerId" TEXT,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "budgetAmount" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "isWatcher" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "ProjectTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedToId" TEXT,
    "createdById" TEXT,
    "linkedServiceOrderId" TEXT,
    "linkedDeskTicketId" TEXT,
    "dueDate" TIMESTAMP(3),
    "estimatedHours" DOUBLE PRECISION,
    "loggedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "priority" "CrmLeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "estimatedValue" DOUBLE PRECISION DEFAULT 0,
    "expectedCloseAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "customerId" TEXT,
    "projectId" TEXT,
    "linkedQuoteId" TEXT,
    "linkedDeskTicketId" TEXT,
    "notes" TEXT,
    "lostReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "CrmActivityType" NOT NULL,
    "subject" TEXT,
    "note" TEXT,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmLeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryProduct" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxStock" DOUBLE PRECISION,
    "costPrice" DOUBLE PRECISION,
    "salePrice" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderMaterial" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "totalCost" DOUBLE PRECISION,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseEntry" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "technicianId" TEXT NOT NULL,
    "type" "ExpenseType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "distanceKm" DOUBLE PRECISION,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "receiptAssetId" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "customerId" TEXT,
    "scoreNps" INTEGER,
    "scoreCsat" INTEGER,
    "comment" TEXT,
    "channel" "SatisfactionChannel" NOT NULL DEFAULT 'APP',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "status" "RoutePlanStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT,
    "assignedTechnicianId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePlanStop" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "etaStart" TIMESTAMP(3),
    "etaEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "distanceKmFromPrev" DOUBLE PRECISION,
    "travelMinutesFromPrev" INTEGER,
    "status" "RouteStopStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,

    CONSTRAINT "RoutePlanStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistAnswer" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "valueJson" JSONB,
    "textValue" TEXT,
    "numberValue" DOUBLE PRECISION,
    "booleanValue" BOOLEAN,
    "optionValue" TEXT,
    "notes" TEXT,
    "isNonConformity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "comment" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "title" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdById" TEXT,
    "checklistExecutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL,
    "status" "PopStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfAssetId" TEXT NOT NULL,
    "thumbnailAssetId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopChunk" (
    "id" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "chunkOrder" INTEGER NOT NULL,
    "tsv" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopReadReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "popId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL,

    CONSTRAINT "PopReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "brandingColors" JSONB,
    "logoAssetId" TEXT,
    "pdfFooter" TEXT,
    "useBrandLockup" BOOLEAN NOT NULL DEFAULT true,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpFrom" TEXT,
    "categories" JSONB,
    "tags" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "checklistExecutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AnswerAttachments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_action_key" ON "Permission"("action");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplateVersion_templateId_version_key" ON "ChecklistTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistExecution_code_key" ON "ChecklistExecution"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistExecution_pdfAssetId_key" ON "ChecklistExecution"("pdfAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_code_key" ON "ServiceOrder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_checklistExecutionId_key" ON "ServiceOrder"("checklistExecutionId");

-- CreateIndex
CREATE INDEX "ServiceOrderEvent_serviceOrderId_createdAt_idx" ON "ServiceOrderEvent"("serviceOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceOrderLocationPoint_serviceOrderId_capturedAt_idx" ON "ServiceOrderLocationPoint"("serviceOrderId", "capturedAt");

-- CreateIndex
CREATE INDEX "TeamLocationPing_technicianId_capturedAt_idx" ON "TeamLocationPing"("technicianId", "capturedAt");

-- CreateIndex
CREATE INDEX "TeamLocationPing_serviceOrderId_capturedAt_idx" ON "TeamLocationPing"("serviceOrderId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_code_key" ON "Quote"("code");

-- CreateIndex
CREATE INDEX "Quote_serviceOrderId_customerId_status_idx" ON "Quote"("serviceOrderId", "customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeskTicket_code_key" ON "DeskTicket"("code");

-- CreateIndex
CREATE INDEX "DeskTicket_customerId_status_priority_idx" ON "DeskTicket"("customerId", "status", "priority");

-- CreateIndex
CREATE INDEX "DeskTicket_assignedTechnicianId_status_idx" ON "DeskTicket"("assignedTechnicianId", "status");

-- CreateIndex
CREATE INDEX "DeskTicket_serviceOrderId_idx" ON "DeskTicket"("serviceOrderId");

-- CreateIndex
CREATE INDEX "DeskTicket_quoteId_idx" ON "DeskTicket"("quoteId");

-- CreateIndex
CREATE INDEX "DeskTicketEvent_deskTicketId_createdAt_idx" ON "DeskTicketEvent"("deskTicketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalAccess_tokenHash_key" ON "CustomerPortalAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_customerId_createdAt_idx" ON "CustomerPortalAccess"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialInvoice_code_key" ON "FinancialInvoice"("code");

-- CreateIndex
CREATE INDEX "FinancialInvoice_customerId_status_dueDate_idx" ON "FinancialInvoice"("customerId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "FinancialInvoice_serviceOrderId_idx" ON "FinancialInvoice"("serviceOrderId");

-- CreateIndex
CREATE INDEX "FinancialInvoice_quoteId_idx" ON "FinancialInvoice"("quoteId");

-- CreateIndex
CREATE INDEX "FinancialInvoice_deskTicketId_idx" ON "FinancialInvoice"("deskTicketId");

-- CreateIndex
CREATE INDEX "FinancialInvoiceItem_invoiceId_idx" ON "FinancialInvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "FinancialPayment_invoiceId_paidAt_idx" ON "FinancialPayment"("invoiceId", "paidAt");

-- CreateIndex
CREATE INDEX "FinancialCharge_invoiceId_createdAt_idx" ON "FinancialCharge"("invoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_code_key" ON "ChatThread"("code");

-- CreateIndex
CREATE INDEX "ChatThread_status_lastMessageAt_idx" ON "ChatThread"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatThread_customerId_status_idx" ON "ChatThread"("customerId", "status");

-- CreateIndex
CREATE INDEX "ChatThread_deskTicketId_idx" ON "ChatThread"("deskTicketId");

-- CreateIndex
CREATE INDEX "ChatThread_serviceOrderId_idx" ON "ChatThread"("serviceOrderId");

-- CreateIndex
CREATE INDEX "ChatThread_quoteId_idx" ON "ChatThread"("quoteId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_status_dueDate_idx" ON "Project"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_status_priority_idx" ON "ProjectTask"("projectId", "status", "priority");

-- CreateIndex
CREATE INDEX "ProjectTask_assignedToId_status_idx" ON "ProjectTask"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "ProjectTask_linkedServiceOrderId_idx" ON "ProjectTask"("linkedServiceOrderId");

-- CreateIndex
CREATE INDEX "ProjectTask_linkedDeskTicketId_idx" ON "ProjectTask"("linkedDeskTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLead_code_key" ON "CrmLead"("code");

-- CreateIndex
CREATE INDEX "CrmLead_status_ownerId_expectedCloseAt_idx" ON "CrmLead"("status", "ownerId", "expectedCloseAt");

-- CreateIndex
CREATE INDEX "CrmLead_customerId_idx" ON "CrmLead"("customerId");

-- CreateIndex
CREATE INDEX "CrmLead_projectId_idx" ON "CrmLead"("projectId");

-- CreateIndex
CREATE INDEX "CrmLead_linkedQuoteId_idx" ON "CrmLead"("linkedQuoteId");

-- CreateIndex
CREATE INDEX "CrmLead_linkedDeskTicketId_idx" ON "CrmLead"("linkedDeskTicketId");

-- CreateIndex
CREATE INDEX "CrmLeadActivity_leadId_createdAt_idx" ON "CrmLeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmLeadActivity_actorId_type_idx" ON "CrmLeadActivity"("actorId", "type");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryProduct_sku_key" ON "InventoryProduct"("sku");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceOrderMaterial_serviceOrderId_usedAt_idx" ON "ServiceOrderMaterial"("serviceOrderId", "usedAt");

-- CreateIndex
CREATE INDEX "ExpenseEntry_technicianId_expenseDate_idx" ON "ExpenseEntry"("technicianId", "expenseDate");

-- CreateIndex
CREATE INDEX "ExpenseEntry_serviceOrderId_status_idx" ON "ExpenseEntry"("serviceOrderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFeedback_serviceOrderId_key" ON "CustomerFeedback"("serviceOrderId");

-- CreateIndex
CREATE INDEX "CustomerFeedback_customerId_submittedAt_idx" ON "CustomerFeedback"("customerId", "submittedAt");

-- CreateIndex
CREATE INDEX "RoutePlan_planDate_status_idx" ON "RoutePlan"("planDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlanStop_routePlanId_sequence_key" ON "RoutePlanStop"("routePlanId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlanStop_routePlanId_serviceOrderId_key" ON "RoutePlanStop"("routePlanId", "serviceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistAnswer_executionId_checklistItemId_key" ON "ChecklistAnswer"("executionId", "checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PopDocument_title_version_key" ON "PopDocument"("title", "version");

-- CreateIndex
CREATE INDEX "PopChunk_popId_idx" ON "PopChunk"("popId");

-- CreateIndex
CREATE UNIQUE INDEX "PopReadReceipt_userId_popId_version_key" ON "PopReadReceipt"("userId", "popId", "version");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "_AnswerAttachments_AB_unique" ON "_AnswerAttachments"("A", "B");

-- CreateIndex
CREATE INDEX "_AnswerAttachments_B_index" ON "_AnswerAttachments"("B");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteLocation" ADD CONSTRAINT "SiteLocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_siteLocationId_fkey" FOREIGN KEY ("siteLocationId") REFERENCES "SiteLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateVersion" ADD CONSTRAINT "ChecklistTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistSection" ADD CONSTRAINT "ChecklistSection_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ChecklistTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ChecklistSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ChecklistTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_siteLocationId_fkey" FOREIGN KEY ("siteLocationId") REFERENCES "SiteLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_siteLocationId_fkey" FOREIGN KEY ("siteLocationId") REFERENCES "SiteLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_checklistExecutionId_fkey" FOREIGN KEY ("checklistExecutionId") REFERENCES "ChecklistExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderEvent" ADD CONSTRAINT "ServiceOrderEvent_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderEvent" ADD CONSTRAINT "ServiceOrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderLocationPoint" ADD CONSTRAINT "ServiceOrderLocationPoint_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLocationPing" ADD CONSTRAINT "TeamLocationPing_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLocationPing" ADD CONSTRAINT "TeamLocationPing_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskTicket" ADD CONSTRAINT "DeskTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskTicket" ADD CONSTRAINT "DeskTicket_siteLocationId_fkey" FOREIGN KEY ("siteLocationId") REFERENCES "SiteLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskTicket" ADD CONSTRAINT "DeskTicket_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskTicket" ADD CONSTRAINT "DeskTicket_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskTicket" ADD CONSTRAINT "DeskTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskTicket" ADD CONSTRAINT "DeskTicket_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskTicketEvent" ADD CONSTRAINT "DeskTicketEvent_deskTicketId_fkey" FOREIGN KEY ("deskTicketId") REFERENCES "DeskTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskTicketEvent" ADD CONSTRAINT "DeskTicketEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoice" ADD CONSTRAINT "FinancialInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoice" ADD CONSTRAINT "FinancialInvoice_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoice" ADD CONSTRAINT "FinancialInvoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoice" ADD CONSTRAINT "FinancialInvoice_deskTicketId_fkey" FOREIGN KEY ("deskTicketId") REFERENCES "DeskTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoice" ADD CONSTRAINT "FinancialInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInvoiceItem" ADD CONSTRAINT "FinancialInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPayment" ADD CONSTRAINT "FinancialPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPayment" ADD CONSTRAINT "FinancialPayment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialCharge" ADD CONSTRAINT "FinancialCharge_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FinancialInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialCharge" ADD CONSTRAINT "FinancialCharge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_deskTicketId_fkey" FOREIGN KEY ("deskTicketId") REFERENCES "DeskTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderCustomerId_fkey" FOREIGN KEY ("senderCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_linkedServiceOrderId_fkey" FOREIGN KEY ("linkedServiceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_linkedDeskTicketId_fkey" FOREIGN KEY ("linkedDeskTicketId") REFERENCES "DeskTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_linkedQuoteId_fkey" FOREIGN KEY ("linkedQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_linkedDeskTicketId_fkey" FOREIGN KEY ("linkedDeskTicketId") REFERENCES "DeskTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadActivity" ADD CONSTRAINT "CrmLeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadActivity" ADD CONSTRAINT "CrmLeadActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderMaterial" ADD CONSTRAINT "ServiceOrderMaterial_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderMaterial" ADD CONSTRAINT "ServiceOrderMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_receiptAssetId_fkey" FOREIGN KEY ("receiptAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlanStop" ADD CONSTRAINT "RoutePlanStop_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlanStop" ADD CONSTRAINT "RoutePlanStop_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistAnswer" ADD CONSTRAINT "ChecklistAnswer_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ChecklistExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistAnswer" ADD CONSTRAINT "ChecklistAnswer_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ChecklistExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_checklistExecutionId_fkey" FOREIGN KEY ("checklistExecutionId") REFERENCES "ChecklistExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopDocument" ADD CONSTRAINT "PopDocument_pdfAssetId_fkey" FOREIGN KEY ("pdfAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopDocument" ADD CONSTRAINT "PopDocument_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopDocument" ADD CONSTRAINT "PopDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopChunk" ADD CONSTRAINT "PopChunk_popId_fkey" FOREIGN KEY ("popId") REFERENCES "PopDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopReadReceipt" ADD CONSTRAINT "PopReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopReadReceipt" ADD CONSTRAINT "PopReadReceipt_popId_fkey" FOREIGN KEY ("popId") REFERENCES "PopDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_checklistExecutionId_fkey" FOREIGN KEY ("checklistExecutionId") REFERENCES "ChecklistExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AnswerAttachments" ADD CONSTRAINT "_AnswerAttachments_A_fkey" FOREIGN KEY ("A") REFERENCES "ChecklistAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AnswerAttachments" ADD CONSTRAINT "_AnswerAttachments_B_fkey" FOREIGN KEY ("B") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

