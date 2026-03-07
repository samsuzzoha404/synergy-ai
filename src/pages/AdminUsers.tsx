import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Pencil, Trash2, Shield, UserCheck, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useAdminUsers,
  useAdminCreateUser,
  useAdminUpdateUser,
  useAdminDeleteUser,
} from "@/hooks/useLeads";
import type { UserProfile, UserCreate, UserUpdate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BU_OPTIONS = [
  "Stucken AAC",
  "Ajiya Metal / Glass",
  "G-Cast",
  "Signature Alliance",
  "Signature Kitchen",
  "Fiamma Holding",
  "PPG Hing",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      className={cn(
        "text-xs font-semibold px-2 py-0.5",
        role === "Admin"
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-success/10 text-success border border-success/20"
      )}
    >
      {role === "Admin" ? <Shield className="w-3 h-3 mr-1 inline" /> : <UserCheck className="w-3 h-3 mr-1 inline" />}
      {role}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// User Form (shared by create + edit dialogs)
// ---------------------------------------------------------------------------

interface UserFormState {
  name: string;
  email: string;
  role: "Admin" | "Sales_Rep";
  bu: string;
  password: string;
}

const EMPTY_FORM: UserFormState = {
  name: "",
  email: "",
  role: "Sales_Rep",
  bu: BU_OPTIONS[0],
  password: "",
};

interface UserFormProps {
  form: UserFormState;
  onChange: (updates: Partial<UserFormState>) => void;
  isEdit: boolean;
}

function UserForm({ form, onChange, isEdit }: UserFormProps) {
  const [showPass, setShowPass] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="uf-name">Full Name *</Label>
        <Input
          id="uf-name"
          placeholder="e.g. Ahmad Faris"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      {!isEdit && (
        <div className="grid gap-2">
          <Label htmlFor="uf-email">Email *</Label>
          <Input
            id="uf-email"
            type="email"
            placeholder="user@chinhin.com"
            value={form.email}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </div>
      )}

      <div className="grid gap-2">
        <Label>Role *</Label>
        <Select
          value={form.role}
          onValueChange={(v) => onChange({ role: v as "Admin" | "Sales_Rep" })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Admin">Admin</SelectItem>
            <SelectItem value="Sales_Rep">Sales Rep</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {form.role === "Sales_Rep" && (
        <div className="grid gap-2">
          <Label>Business Unit *</Label>
          <Select
            value={form.bu}
            onValueChange={(v) => onChange({ bu: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BU_OPTIONS.map((bu) => (
                <SelectItem key={bu} value={bu}>{bu}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="uf-pass">
          {isEdit ? "New Password (leave blank to keep current)" : "Password *"}
        </Label>
        <div className="relative">
          <Input
            id="uf-pass"
            type={showPass ? "text" : "password"}
            placeholder={isEdit ? "••••••  (unchanged if empty)" : "Min 6 characters"}
            value={form.password}
            onChange={(e) => onChange({ password: e.target.value })}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPass((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading } = useAdminUsers();
  const { mutateAsync: createUser, isPending: creating } = useAdminCreateUser();
  const { mutateAsync: deleteUser, isPending: deleting } = useAdminDeleteUser();

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState<UserFormState>(EMPTY_FORM);

  // Edit form (initialised when editTarget changes)
  const [editForm, setEditForm] = useState<UserFormState>(EMPTY_FORM);
  const { mutateAsync: updateUser, isPending: updating } = useAdminUpdateUser(
    editTarget?.id ?? ""
  );

  const openEdit = (u: UserProfile) => {
    setEditTarget(u);
    setEditForm({
      name: u.name,
      email: u.email,
      role: u.role,
      bu: u.bu ?? BU_OPTIONS[0],
      password: "",
    });
  };

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    const payload: UserCreate = {
      name: createForm.name.trim(),
      email: createForm.email.trim().toLowerCase(),
      role: createForm.role,
      bu: createForm.role === "Sales_Rep" ? createForm.bu : null,
      password: createForm.password,
    };
    try {
      await createUser(payload);
      toast({ title: "✅ User created", description: `${payload.email} added successfully.` });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
    } catch (err: unknown) {
      toast({
        title: "Create failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    const payload: UserUpdate = {};
    if (editForm.name.trim() && editForm.name !== editTarget.name)
      payload.name = editForm.name.trim();
    if (editForm.role !== editTarget.role) payload.role = editForm.role;
    if (editForm.role === "Sales_Rep" && editForm.bu !== editTarget.bu)
      payload.bu = editForm.bu;
    if (editForm.role === "Admin") payload.bu = null;
    if (editForm.password.trim()) payload.password = editForm.password;
    if (Object.keys(payload).length === 0) {
      toast({ title: "No changes detected." });
      setEditTarget(null);
      return;
    }
    try {
      await updateUser(payload);
      toast({ title: "✅ User updated", description: `${editTarget.email} updated.` });
      setEditTarget(null);
    } catch (err: unknown) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      toast({ title: "🗑️ User deleted", description: `${deleteTarget.email} removed.` });
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Non-admin fallback
  if (currentUser?.role !== "Admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-10">
        <Shield className="w-12 h-12 opacity-30" />
        <p className="text-lg font-semibold">Admin access required</p>
        <p className="text-sm">This page is restricted to Admin-role accounts.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add, edit or remove Synergy Sales Genius accounts.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </motion.div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users", value: users.length, color: "text-foreground" },
          { label: "Admins", value: users.filter((u) => u.role === "Admin").length, color: "text-primary" },
          { label: "Sales Reps", value: users.filter((u) => u.role === "Sales_Rep").length, color: "text-success" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className={cn("text-2xl font-bold", color)}>{isLoading ? "—" : value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground">All Accounts</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Name", "Email", "Role", "Business Unit", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium text-foreground">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        {u.name}
                        {u.email === currentUser?.email && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {u.bu ?? <span className="italic opacity-50">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 gap-1.5 text-xs"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                          disabled={u.email === currentUser?.email}
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Add New User
            </DialogTitle>
          </DialogHeader>
          <UserForm
            form={createForm}
            onChange={(u) => setCreateForm((f) => ({ ...f, ...u }))}
            isEdit={false}
          />
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Edit User — {editTarget?.email}
            </DialogTitle>
          </DialogHeader>
          <UserForm
            form={editForm}
            onChange={(u) => setEditForm((f) => ({ ...f, ...u }))}
            isEdit
          />
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updating} className="gap-2">
              {updating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <strong className="text-foreground">{deleteTarget?.name}</strong> (
              {deleteTarget?.email}) from the system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
