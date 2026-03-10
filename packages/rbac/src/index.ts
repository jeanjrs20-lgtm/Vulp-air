import type { Role } from "@vulp/shared";

export type PermissionAction =
  | "dashboard.read"
  | "checklist.template.manage"
  | "checklist.execution.manage"
  | "checklist.review.manage"
  | "serviceOrder.manage"
  | "routing.manage"
  | "quote.manage"
  | "inventory.manage"
  | "expense.manage"
  | "feedback.manage"
  | "finance.manage"
  | "chat.manage"
  | "reports.read"
  | "desk.manage"
  | "customerPortal.manage"
  | "pop.manage"
  | "pop.read"
  | "users.manage"
  | "settings.manage";

const rolePermissions: Record<Role, PermissionAction[]> = {
  SUPERADMIN: [
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
  ],
  ADMIN: [
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
  ],
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

export const hasPermission = (role: Role, action: PermissionAction) => {
  return rolePermissions[role]?.includes(action) ?? false;
};

export const permissionsByRole = rolePermissions;
