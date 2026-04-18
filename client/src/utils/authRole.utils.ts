import { getAuthSessionItem } from '@/auth/_helpers';

export const isSuperAdmin = (): boolean => {
  try {
    const currentUser = JSON.parse(getAuthSessionItem("currentUser") || "{}");

    const rawRole =
      currentUser?.PrimaryRole ??
      currentUser?.role ??
      getAuthSessionItem("PrimaryRole") ??
      getAuthSessionItem("role") ??
      "";

    const normalizedRole = String(rawRole)
      .toLowerCase()
      .replace(/[\s_-]+/g, ""); // "Super Admin" -> "superadmin"

    return normalizedRole === "superadmin";
  } catch {
    return false;
  }
};
