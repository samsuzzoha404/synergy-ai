import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import LeadWorkbench from "@/pages/LeadWorkbench";
import ConflictResolution from "@/pages/ConflictResolution";
import DataIngestion from "@/pages/DataIngestion";
import AdminUsers from "@/pages/AdminUsers";
import Reports from "@/pages/Reports";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * ProtectedRoute — wraps any route that requires authentication.
 * If the user is not authenticated, immediately redirects to /auth
 * without rendering any protected UI (fixes BUG-C1).
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public pages */}
            <Route path="/" element={<Auth />} />
            <Route path="/auth" element={<Auth />} />

            {/* Protected app pages — guarded by ProtectedRoute */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/leads" element={<LeadWorkbench />} />
              <Route path="/conflicts" element={<ConflictResolution />} />
              <Route path="/ingest" element={<DataIngestion />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/reports" element={<Reports />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
