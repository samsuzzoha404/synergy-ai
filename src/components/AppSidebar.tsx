import { useState } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  TableProperties,
  AlertTriangle,
  Upload,
  Zap,
  ChevronLeft,
  ChevronRight,
  X,
  Menu,
  Settings,
  HelpCircle,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useConflicts } from "@/hooks/useLeads";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Executive Dashboard" },
  { to: "/leads", icon: TableProperties, label: "Lead Workbench" },
  { to: "/conflicts", icon: AlertTriangle, label: "Conflict Resolution", dynamicBadge: true },
  { to: "/ingest", icon: Upload, label: "Data Ingestion" },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AppSidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Fetch live conflict count for the sidebar badge (BUG-M4 fix)
  const { data: conflicts = [] } = useConflicts();
  // Show the real count. If 0, badge is hidden — no artificial fallback to 1.
  const conflictCount = conflicts.length;

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div
      className={cn(
        "flex flex-col h-full bg-sidebar transition-all duration-300",
        !isMobile && (collapsed ? "w-16" : "w-60")
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border flex-shrink-0">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {(!collapsed || isMobile) && (
          <div className="min-w-0">
            <p className="text-sidebar-primary-foreground font-bold text-sm leading-tight truncate">Synergy Sales</p>
            <p className="text-sidebar-foreground text-xs opacity-70 truncate">Genius · Chin Hin Group</p>
          </div>
        )}
        {isMobile && (
          <button onClick={onMobileClose} className="ml-auto text-sidebar-foreground hover:text-sidebar-primary-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map(({ to, icon: Icon, label, dynamicBadge }) => {
          const badge = dynamicBadge ? (conflictCount > 0 ? String(conflictCount) : undefined) : undefined;
          return (
          <NavLink
            key={to}
            to={to}
            end={to === "/dashboard"}
            onClick={isMobile ? onMobileClose : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground transition-all duration-150 text-sm font-medium group relative",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground")} />
                {(!collapsed || isMobile) && (
                  <span className="flex-1 truncate">{label}</span>
                )}
                {badge && (!collapsed || isMobile) && (
                  <Badge className="bg-warning text-warning-foreground text-xs px-1.5 py-0 min-w-[20px] h-5 flex items-center justify-center">
                    {badge}
                  </Badge>
                )}
                {badge && collapsed && !isMobile && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warning" />
                )}
              </>
            )}
          </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1 flex-shrink-0">
        {[{ icon: Settings, label: "Settings" }, { icon: HelpCircle, label: "Help & Docs" }].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150 text-sm font-medium w-full"
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {(!collapsed || isMobile) && <span className="truncate">{label}</span>}
          </button>
        ))}

        {!isMobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-150 text-sm font-medium w-full mt-2"
          >
            {collapsed ? <ChevronRight className="w-4 h-4 flex-shrink-0" /> : <ChevronLeft className="w-4 h-4 flex-shrink-0" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-shrink-0 h-screen sticky top-0 overflow-hidden transition-all duration-300">
        <SidebarContent />
      </aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 w-72 md:hidden overflow-hidden"
            >
              <SidebarContent isMobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
