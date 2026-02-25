import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Menu, Bell, Search, ChevronDown, Sun, Moon, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { AppSidebar } from "@/components/AppSidebar";
import { notifications } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 flex-shrink-0 shadow-card z-30">
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Search */}
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md bg-muted rounded-lg px-3 py-1.5 border border-transparent hover:border-border transition-colors">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search leads, projects..."
              className="bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground flex-1"
            />
            <kbd className="hidden lg:inline-flex text-xs text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded font-mono">
              ⌘K
            </kbd>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Moon className="w-4 h-4 text-muted-foreground" />
              )}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                className="relative p-2 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setNotifOpen(!notifOpen)}
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive flex items-center justify-center">
                    <span className="sr-only">{unread} notifications</span>
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-40"
                      onClick={() => setNotifOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                        <span className="text-xs bg-destructive text-destructive-foreground rounded-full px-2 py-0.5 font-medium">{unread} new</span>
                      </div>
                      <div className="divide-y divide-border max-h-80 overflow-y-auto scrollbar-thin">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            className={cn(
                              "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer",
                              !n.read && "bg-primary-light/50"
                            )}
                          >
                            <div className={cn(
                              "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                              n.type === "alert" ? "bg-destructive" :
                              n.type === "success" ? "bg-success" : "bg-info"
                            )} />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground">{n.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">{n.time}</p>
                            </div>
                            {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-2.5 border-t border-border">
                        <button
                          className="text-xs text-primary hover:underline font-medium"
                          onClick={() => { navigate("/conflicts"); setNotifOpen(false); }}
                        >
                          View conflict alert →
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* User Avatar */}
            <button className="flex items-center gap-2 rounded-lg hover:bg-muted px-2 py-1.5 transition-colors ml-1">
              <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center flex-shrink-0 ring-2 ring-primary/20">
                <span className="text-white text-xs font-bold">MY</span>
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-semibold text-foreground leading-tight">Marvis Yeoh</p>
                <p className="text-xs text-muted-foreground leading-tight">Group CFO</p>
              </div>
              <ChevronDown className="hidden md:block w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
