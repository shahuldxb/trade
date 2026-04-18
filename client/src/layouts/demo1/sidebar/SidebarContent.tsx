


import { MENU_SIDEBAR } from "@/config/menu.config";
import { filterMenuByRBAC } from "@/utils/filterMenuByRBAC";
import { useMenuAuthContext } from "@/auth/AuthContext";
import { SidebarMenu } from "./SidebarMenu";

const SidebarContent = ({ height = 0 }) => {
  const { rbac } = useMenuAuthContext();
  // console.log("rbac sidebar content :",rbac)
  const visibleMenus = filterMenuByRBAC(MENU_SIDEBAR, rbac);
  // console.log("MENU_SIDEBAR, rbac  :",MENU_SIDEBAR, rbac)
  // console.log("visibleMenus",visibleMenus)
  return (
    <div className="sidebar-content grow shrink-0 py-5 pe-2">
      <div
        className="scrollable-y-hover grow shrink-0 flex ps-2 lg:ps-5 pe-1 lg:pe-3"
        style={height > 0 ? { height: `${height}px` } : undefined}
      >
        <SidebarMenu menuConfig={visibleMenus} />
      </div>
    </div>
  );
};

export { SidebarContent };