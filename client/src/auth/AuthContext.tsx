import React, { createContext, useContext, useState, useEffect } from "react";
import { getCurrentUser } from '../layouts/demo1/sidebar/SidebarMenu';
import { isSuperAdmin } from "@/utils/authRole.utils";

export type RBACState = {
  menuAccess: string[];
  access: Record<string, string[]>;
};

export type RBAC = {
  menuAccess: string[];
  access: Record<string, string[]>;
};

export type MenuAuthContextType = {
  rbac: RBAC | null;
  setRbac: React.Dispatch<React.SetStateAction<RBAC | null>>;
  canAccess: (asset: string, action: string) => boolean;
  resetAuth: () => void;
};
export const MenuAuthContext = createContext<MenuAuthContextType | undefined>(
  undefined
);
export const useMenuAuthContext = () => {
  const ctx = useContext(MenuAuthContext);
  if (!ctx) {
    throw new Error("useMenuAuthContext must be used inside MenuAuthProvider");
  }
  return ctx;
};
export const MenuAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [rbac, setRbac] = useState<RBACState | null>(null);

  const canAccess = (asset: string, action: string): boolean => {
    if (isSuperAdmin()) return true;
    if (!rbac) return false;

    // Checking asset key and action permissions
    return rbac.access?.[asset]?.includes(action) ?? false;
  };

  const resetAuth = () => {
    setRbac(null);
  };


  // Initialize rbac from localStorage on component mount
  useEffect(() => {
    const storedRbac = localStorage.getItem("rbac");
    if (storedRbac) {
      const parsedRbac = JSON.parse(storedRbac);
      setRbac(parsedRbac);
      console.log("rbac fetched from localStorage:", parsedRbac);
    }
  }, []);
  console.log("rbac auth context", rbac)



  return (
    <MenuAuthContext.Provider
      value={{
        rbac,
        setRbac,
        canAccess,
        resetAuth,
      }}
    >
      {children}
    </MenuAuthContext.Provider>
  );
};