import { RBAC } from '@/auth/AuthContext';
import { type TMenuConfig } from '@/components/menu';
import { isSuperAdmin } from '@/utils/authRole.utils';

type MenuPermission = {
  asset: string;
  action?: string;
  actions?: string[];
};

const normalizePermissions = (permission: unknown, fallbackAsset?: string): MenuPermission[] => {
  const raw = Array.isArray(permission) ? permission : permission ? [permission] : [];
  const normalized: MenuPermission[] = [];

  raw.forEach((perm) => {
    if (!perm) return;
    if (typeof perm === 'string') {
      normalized.push({ asset: perm, actions: ['view'] });
      return;
    }
    if (typeof perm === 'object') {
      const permObj = perm as MenuPermission;
      const asset = permObj.asset || fallbackAsset;
      if (!asset) return;
      const actions =
        Array.isArray(permObj.actions) && permObj.actions.length > 0
          ? permObj.actions
          : permObj.action
            ? [permObj.action]
            : ['view'];
      normalized.push({ asset, actions });
    }
  });

  if (!normalized.length && fallbackAsset) {
    normalized.push({ asset: fallbackAsset, actions: ['view'] });
  }

  return normalized.filter((p) => !!p.asset);
};

const hasPermissionForMenu = (rbac: RBAC, perm: MenuPermission): boolean => {
  const allowedActions = rbac.access?.[perm.asset] ?? [];
  if (!Array.isArray(allowedActions)) return false;

  const actions = perm.actions?.length ? perm.actions : ['view'];
  const hasAction = actions.some((action) => allowedActions.includes(action));
  const hasMenuAccess = !rbac.menuAccess?.length || rbac.menuAccess.includes(perm.asset);

  return hasMenuAccess && hasAction;
};

export const filterMenuByRBAC = (menu: TMenuConfig, rbac: RBAC | null): TMenuConfig => {
  if (isSuperAdmin()) return menu;
  if (!rbac) {
    console.warn('RBAC not found, returning full menu');
    return menu;
  }

  return menu
    .map((item) => {
      const fallbackAsset =
        item.asset_key ||
        (typeof item.permission === 'string'
          ? item.permission
          : Array.isArray(item.permission)
            ? item.permission.find((p) => typeof p === 'object' && p && 'asset' in p)?.asset
            : item.permission?.asset);
      const permissions = normalizePermissions(item.permission, fallbackAsset);

      const hasAccess =
        !permissions.length || permissions.some((perm) => hasPermissionForMenu(rbac, perm));

      const filteredChildren = Array.isArray(item.children)
        ? filterMenuByRBAC(item.children, rbac)
        : undefined;

      if (!hasAccess && (!filteredChildren || filteredChildren.length === 0)) {
        return null;
      }

      return {
        ...item,
        ...(filteredChildren ? { children: filteredChildren } : {})
      };
    })
    .filter(Boolean) as TMenuConfig;
};