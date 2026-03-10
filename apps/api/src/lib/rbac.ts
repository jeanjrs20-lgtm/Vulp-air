import { PermissionAction, hasPermission } from "@vulp/rbac";
import { AppError } from "./app-error.js";

export const assertPermission = (role: string, permission: PermissionAction) => {
  if (!hasPermission(role as never, permission)) {
    throw new AppError(403, "FORBIDDEN", "Sem permissão para executar esta ação");
  }
};
