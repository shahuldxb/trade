import { isSuperAdmin } from "@/utils/authRole.utils";
export const hasPermission = (
  rbac: any,
  asset: string,
  actions: string[] | string = 'view'
): boolean => {
  if (isSuperAdmin()) return true;
  if (!rbac) return false;

  const allowed = rbac.access?.[asset];
  if (!Array.isArray(allowed)) return false;

  const actionList = Array.isArray(actions) ? actions : [actions];
  return actionList.some((action) => allowed.includes(action));
};