import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, User, ArrowRight, Lock, BarChart3, Users, TrendingUp,
  ShieldCheck, Sparkles, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

/* ─── demo account definitions ─── */
const DEMO_ACCOUNTS_UI = [
  { label: 'Admin: Marvis',       email: 'marvis@chinhin.com',   isAdmin: true  },
  { label: 'Stucken AAC',         email: 'sales@stucken.com',    isAdmin: false },
  { label: 'Ajiya Metal/Glass',   email: 'sales@ajiya.com',      isAdmin: false },
  { label: 'G-Cast',              email: 'sales@gcast.com',      isAdmin: false },
  { label: 'Signature Alliance',  email: 'sales@signature.com',  isAdmin: false },
  { label: 'Signature Kitchen',   email: 'sales@kitchen.com',    isAdmin: false },
  { label: 'Fiamma Holding',      email: 'sales@fiamma.com',     isAdmin: false },
  { label: 'PPG Hing',            email: 'sales@ppghing.com',    isAdmin: false },
] as const;

/* ─── tiny reusable input ─── */
function PremiumInput({
  id, type = "text", placeholder, value, onChange, icon: Icon, required,
}: {
  id: string; type?: string; placeholder: string; value: string;
  onChange: (v: string) => void; icon: React.ElementType; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className="relative rounded-xl transition-all duration-200"
      style={{
        background: "rgba(0,0,0,0.25)",
        border: focused
          ? "1.5px solid hsl(217 91% 60% / 0.75)"
          : "1.5px solid rgba(255,255,255,0.10)",
        boxShadow: focused ? "0 0 0 3px hsl(217 91% 60% / 0.15)" : "none",
      }}
    >
      <Icon
        className="absolute left-4 top-1/2 -translate-y-1/2 w-[15px] h-[15px] transition-colors duration-200"
        style={{ color: focused ? "hsl(217 91% 65%)" : "rgba(255,255,255,0.3)" }}
      />
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full h-10 pl-11 pr-4 bg-transparent text-sm text-white placeholder:text-white/25 outline-none rounded-xl"
      />
    </div>
  );
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login, isAuthenticated } = useAuth();

  // Navigate to dashboard as soon as React has committed the auth state updates.
  // This is the correct pattern — avoids racing against React's batched state flush.
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: () => login({ email, password }),
    onSuccess: () => {
      toast({
        title: "Welcome back!",
        description: `Signed in as ${email}`,
      });
      navigate("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: "Login failed",
        description: err.message ?? "Invalid email or password.",
        variant: "destructive",
      });
    },
  });

  const loading = loginMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // BUG-M5 fix: signup mode has no backend endpoint — show an informative toast
    // and redirect to login mode instead of attempting a login with signup data.
    if (mode === "signup") {
      toast({
        title: "Registration disabled for this demo",
        description: "Please use the Admin or Sales demo login below.",
        variant: "destructive",
      });
      setMode("signin");
      return;
    }
    loginMutation.mutate();
  };

  /** One-click demo login — calls login() and lets the isAuthenticated effect handle navigation. */
  const handleDemoLogin = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    login({ email: demoEmail, password: demoPassword })
      .then(() => {
        toast({ title: "Demo login successful", description: `Signed in as ${demoEmail}` });
        // Navigation is handled by the useEffect above once React flushes the auth state.
      })
      .catch((err: Error) => {
        toast({ title: "Demo login failed", description: err.message, variant: "destructive" });
      });
  };

  const stats = [
    { icon: Users,      label: "Active Leads",     value: "12,400+" },
    { icon: BarChart3,  label: "Synergy Matches",   value: "3,280"   },
    { icon: TrendingUp, label: "Pipeline Growth",   value: "↑ 34%"  },
  ];

  const features = [
    { icon: ShieldCheck, text: "Enterprise-grade data security" },
    { icon: Sparkles,    text: "AI-powered lead matching engine" },
    { icon: BarChart3,   text: "Real-time cross-BU analytics"   },
  ];

  return (
    <div
      className="h-screen overflow-hidden flex"
      style={{ background: "hsl(240 10% 3%)" }}
    >
      {/* ══════════════ LEFT — Brand Panel ══════════════ */}
      <div className="hidden lg:flex lg:w-[50%] xl:w-[52%] h-full relative overflow-hidden flex-col">

        {/* Layered background */}
        <div className="absolute inset-0" style={{ background: "hsl(240 10% 4%)" }} />
        <div
          className="absolute -top-24 -left-24 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(217 91% 55% / 0.18) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(217 91% 45% / 0.12) 0%, transparent 70%)" }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0, rgba(255,255,255,0.6) 1px, transparent 0, transparent 50%)",
            backgroundSize: "14px 14px",
          }}
        />

        {/* Content — full height, no overflow */}
        <div className="relative z-10 flex flex-col h-full px-9 py-7 xl:px-12 xl:py-9">

          {/* ── Logo ── */}
          <motion.div
            className="flex-shrink-0 flex items-center gap-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div
              className="flex-shrink-0 flex items-center justify-center rounded-xl px-3 py-2"
              style={{
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
              }}
            >
              <img src="/logo/chinhin.png" alt="Chin Hin Group" className="h-10 w-auto object-contain" />
            </div>
            <div>
              <p className="text-[17px] font-semibold tracking-tight text-white/90 leading-tight">
                Synergy Sales Genius
              </p>
              <p className="text-[10px] tracking-[0.18em] uppercase font-medium" style={{ color: "hsl(217 91% 65%)" }}>
                Chin Hin Group
              </p>
            </div>
          </motion.div>

          {/* ── Hero — flex-1 ── */}
          <div className="flex-1 flex flex-col justify-center max-w-[400px]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.5 }}
            >
              {/* Eyebrow */}
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
                style={{ background: "hsl(217 91% 55% / 0.12)", border: "1px solid hsl(217 91% 55% / 0.22)" }}
              >
                <Sparkles className="w-3 h-3" style={{ color: "hsl(217 91% 65%)" }} />
                <span className="text-[11px] font-semibold tracking-[0.16em] uppercase" style={{ color: "hsl(217 91% 70%)" }}>
                  Enterprise AI CRM
                </span>
              </div>

              <h1 className="text-[2.05rem] xl:text-[2.45rem] font-extrabold text-white leading-[1.1] tracking-tight mb-3.5">
                Close more deals,<br />
                <span
                  style={{
                    background: "linear-gradient(90deg, hsl(217 91% 65%), hsl(199 89% 60%))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  together.
                </span>
              </h1>

              <p className="text-white/45 text-[13.5px] leading-relaxed mb-5 max-w-[340px]">
                Unify your sales pipeline, detect duplicate leads, and surface
                cross-BU synergies with AI-powered intelligence — all in one workspace.
              </p>

              {/* Feature list */}
              <div className="flex flex-col gap-2 mb-5">
                {features.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "hsl(217 91% 55% / 0.14)" }}
                    >
                      <Icon className="w-3 h-3" style={{ color: "hsl(217 91% 65%)" }} />
                    </div>
                    <span className="text-white/55 text-[13px]">{text}</span>
                  </div>
                ))}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2.5">
                {stats.map(({ icon: Icon, label, value }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.07, duration: 0.35 }}
                    className="rounded-xl p-3"
                    style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <Icon className="w-3.5 h-3.5 mb-2" style={{ color: "hsl(217 91% 62%)" }} />
                    <p className="text-white font-bold text-base leading-none mb-1">{value}</p>
                    <p className="text-white/35 text-[9px] leading-tight font-medium uppercase tracking-wide">{label}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── BU Logo Strip ── */}
          <motion.div
            className="flex-shrink-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.5 }}
          >
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
              Our Business Units
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {[
                { src: "/logo/starken.png",   alt: "Starken"   },
                { src: "/logo/ajiya.png",     alt: "Ajiya"     },
                { src: "/logo/gcast.png",     alt: "G-Cast"    },
                { src: "/logo/signature.png", alt: "Signature" },
                { src: "/logo/fiamma.png",    alt: "Fiamma"    },
                { src: "/logo/alliance.png",  alt: "Alliance"  },
                { src: "/logo/ppg.png",       alt: "PPG"       },
              ].map(({ src, alt }) => (
                <img
                  key={alt}
                  src={src}
                  alt={alt}
                  className="h-6 object-contain opacity-45 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300 cursor-pointer"
                />
              ))}
            </div>
          </motion.div>

          {/* ── Footer ── */}
          <div className="flex-shrink-0 flex items-center justify-between mt-4">
            <p className="text-white/20 text-[11px]">© {new Date().getFullYear()} Chin Hin Group</p>
            <div className="flex gap-4">
              {["Privacy", "Terms", "Support"].map((l) => (
                <span key={l} className="text-white/20 text-[11px] hover:text-white/45 cursor-pointer transition-colors duration-200">{l}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ RIGHT — Form Panel ══════════════ */}
      <div
        className="flex-1 h-full flex flex-col relative overflow-hidden"
        style={{ background: "hsl(240 10% 4%)" }}
      >
        {/* Glows */}
        <div
          className="absolute top-0 right-0 w-[380px] h-[380px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(217 91% 50% / 0.06) 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-[280px] h-[280px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(217 91% 50% / 0.05) 0%, transparent 70%)" }}
        />

        {/* Mobile topbar */}
        <div className="flex lg:hidden flex-shrink-0 items-center px-6 pt-6 pb-3 gap-2.5">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-lg px-2 py-1.5"
            style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }}
          >
            <img src="/logo/chinhin.png" alt="Chin Hin Group" className="h-6 w-auto object-contain" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-white/90">Synergy Sales Genius</span>
        </div>

        {/* ── Centred form — flex-1 ── */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-9">
          <div className="w-full max-w-[390px]">

            {/* Glass card */}
            <div
              className="rounded-2xl p-5 sm:p-6"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 24px 80px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  {/* Header */}
                  <div className="mb-4">
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-3"
                      style={{ background: "hsl(217 91% 55% / 0.1)", border: "1px solid hsl(217 91% 55% / 0.18)" }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(217 91% 65%)" }} />
                      <span className="text-[11px] font-semibold tracking-wide" style={{ color: "hsl(217 91% 68%)" }}>
                        {mode === "signin" ? "Returning Member" : "New Account"}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight leading-snug mb-1">
                      {mode === "signin" ? "Welcome back" : "Create your account"}
                    </h2>
                    <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.38)" }}>
                      {mode === "signin"
                        ? "Sign in to access your sales workspace."
                        : "Get started in seconds — no credit card required."}
                    </p>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-2.5">
                    {mode === "signup" && (
                      <div className="space-y-1">
                        <label htmlFor="name" className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider pl-1">Full Name</label>
                        <PremiumInput id="name" icon={User} placeholder="Ahmad Razif" value={name} onChange={setName} required />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label htmlFor="email" className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider pl-1">Work Email</label>
                      <PremiumInput id="email" type="email" icon={Mail} placeholder="you@chinhin.com" value={email} onChange={setEmail} required />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="password" className="block text-[11px] font-semibold text-white/50 uppercase tracking-wider pl-1">Password</label>
                      <PremiumInput id="password" type="password" icon={Lock} placeholder="••••••••" value={password} onChange={setPassword} required />
                    </div>

                    {mode === "signin" && (
                      <div className="flex justify-end">
                        <button type="button" className="text-[11px] font-medium transition-colors duration-150" style={{ color: "hsl(217 91% 62%)" }}>
                          Forgot password?
                        </button>
                      </div>
                    )}

                    {/* Submit */}
                    <div className="pt-1">
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-9 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 relative overflow-hidden group"
                        style={{
                          background: loading ? "hsl(217 91% 45%)" : "linear-gradient(135deg, hsl(217 91% 55%), hsl(217 91% 45%))",
                          color: "#fff",
                          boxShadow: loading ? "none" : "0 4px 20px hsl(217 91% 50% / 0.4), 0 1px 0 rgba(255,255,255,0.12) inset",
                        }}
                      >
                        <span
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                          style={{ background: "linear-gradient(135deg, hsl(217 91% 60%), hsl(217 91% 50%))" }}
                        />
                        <span className="relative flex items-center gap-2">
                          {loading ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 0.75, ease: "linear" }}
                              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                            />
                          ) : (
                            <>
                              {mode === "signin" ? "Sign In" : "Create Account"}
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </span>
                      </button>
                    </div>
                  </form>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.22)" }}>Demo Accounts</span>
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                  </div>

                  {/* Demo buttons */}
                  <div className="flex flex-col gap-1.5 mb-3">
                    {DEMO_ACCOUNTS_UI.filter(a => a.isAdmin).map(({ label, email }) => (
                      <button
                        key={email}
                        type="button"
                        onClick={() => handleDemoLogin(email, 'admin123')}
                        disabled={loading}
                        title={email}
                        className="w-full h-7 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 disabled:opacity-40"
                        style={{ background: "hsl(217 91% 55% / 0.12)", border: "1px solid hsl(217 91% 55% / 0.30)", color: "hsl(217 91% 78%)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "hsl(217 91% 55% / 0.22)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "hsl(217 91% 55% / 0.12)")}
                      >
                        <ShieldCheck className="w-3 h-3 flex-shrink-0" />
                        <span>{label}</span>
                      </button>
                    ))}
                    <div className="grid grid-cols-4 gap-1">
                      {DEMO_ACCOUNTS_UI.filter(a => !a.isAdmin).map(({ label, email }) => (
                        <button
                          key={email}
                          type="button"
                          onClick={() => handleDemoLogin(email, 'sales123')}
                          disabled={loading}
                          title={`${label} · ${email}`}
                          className="h-7 rounded-lg text-[10px] font-semibold flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-40 px-1 text-slate-400 hover:text-slate-200"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; e.currentTarget.style.border = "1px solid rgba(255,255,255,0.18)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)"; }}
                        >
                          <span className="truncate">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Switch mode */}
                  <button
                    type="button"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    className="w-full flex items-center justify-center gap-1 text-[13px] transition-colors duration-150 group"
                    style={{ color: "rgba(255,255,255,0.32)" }}
                  >
                    {mode === "signin" ? "New to Synergy?" : "Already have an account?"}
                    <span
                      className="font-semibold flex items-center gap-0.5 group-hover:gap-1 transition-all duration-150 ml-1"
                      style={{ color: "hsl(217 91% 65%)" }}
                    >
                      {mode === "signin" ? "Create account" : "Sign in"}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </button>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-5 mt-3">
              {[
                { icon: ShieldCheck, label: "SOC 2 Compliant" },
                { icon: Lock,        label: "256-bit Encrypted" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.20)" }}>
                  <Icon className="w-3 h-3" />
                  <span className="text-[11px] font-medium">{label}</span>
                </div>
              ))}
            </div>

          </div>
        </div>


      </div>
    </div>
  );
}
