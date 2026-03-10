import { z } from "zod";

export const Roles = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  SUPERVISOR: "SUPERVISOR",
  TECNICO: "TECNICO",
  LEITOR: "LEITOR"
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const ChecklistExecutionStatus = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REOPENED: "REOPENED"
} as const;

export type ChecklistExecutionStatus = (typeof ChecklistExecutionStatus)[keyof typeof ChecklistExecutionStatus];

export const ServiceType = {
  INSTALACAO: "INSTALACAO",
  PREVENTIVA: "PREVENTIVA",
  CORRETIVA: "CORRETIVA",
  PMOC: "PMOC",
  VISTORIA: "VISTORIA"
} as const;

export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

export const ItemType = {
  OK_NOK: "OK_NOK",
  TEXT: "TEXT",
  NUMBER: "NUMBER",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  PHOTO_REQUIRED: "PHOTO_REQUIRED",
  SIGNATURE: "SIGNATURE"
} as const;

export const ApiEnvelopeSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    data: schema.nullable(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional()
      })
      .nullable(),
    meta: z.record(z.string(), z.unknown()).default({})
  });

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const ChecklistTemplateCreateSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  serviceType: z.enum([
    ServiceType.INSTALACAO,
    ServiceType.PREVENTIVA,
    ServiceType.CORRETIVA,
    ServiceType.PMOC,
    ServiceType.VISTORIA
  ]),
  sections: z.array(
    z.object({
      title: z.string().min(1),
      items: z.array(
        z.object({
          label: z.string().min(1),
          itemType: z.enum([
            ItemType.OK_NOK,
            ItemType.TEXT,
            ItemType.NUMBER,
            ItemType.MULTIPLE_CHOICE,
            ItemType.PHOTO_REQUIRED,
            ItemType.SIGNATURE
          ]),
          unit: z.string().optional(),
          options: z.array(z.string()).optional(),
          required: z.boolean().default(false)
        })
      )
    })
  )
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type ChecklistTemplateCreateInput = z.infer<typeof ChecklistTemplateCreateSchema>;

export const BrandTokens = {
  primary: "#07384D",
  background: "#5ADCE8",
  highlight: "#DCEB15",
  textOnDark: "#FFFFFF",
  neutralBg: "#EAF4F6"
} as const;

export const API_PREFIX = "/api/v1";
