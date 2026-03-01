import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Mail, User, ArrowRight, Lock, BarChart3, Users, TrendingUp,
  ShieldCheck, Sparkles, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
        background: "rgba(255,255,255,0.04)",
        border: focused
          ? "1.5px solid hsl(217 91% 60% / 0.7)"
          : "1.5px solid rgba(255,255,255,0.08)",
        boxShadow: focused ? "0 0 0 3px hsl(217 91% 60% / 0.12)" : "none",
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
        className="w-full h-12 pl-11 pr-4 bg-transparent text-sm text-white placeholder:text-white/25 outline-none rounded-xl"
      />
    </div>
  );
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast({
        title: mode === "signin" ? "Welcome back!" : "Account created!",
        description:
          mode === "signin"
            ? `Signed in as ${email || "user@chinhin.com"}`
            : "Your account has been set up successfully.",
      });
      navigate("/dashboard");
    }, 1400);
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
      className="min-h-screen flex"
      style={{ background: "hsl(222 47% 6%)" }}
    >
      {/* ══════════════ LEFT — Brand Panel ══════════════ */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[54%] relative overflow-hidden flex-col">

        {/* Deep layered background */}
        <div className="absolute inset-0" style={{ background: "hsl(222 47% 7%)" }} />

        {/* Primary glow — top-left */}
        <div
          className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, hsl(217 91% 55% / 0.18) 0%, transparent 70%)",
          }}
        />
        {/* Secondary glow — bottom-right */}
        <div
          className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, hsl(217 91% 45% / 0.12) 0%, transparent 70%)",
          }}
        />
        {/* Accent glow — centre */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(ellipse, hsl(217 91% 50% / 0.07) 0%, transparent 65%)",
          }}
        />

        {/* Subtle dot-grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Diagonal stripe accent */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0, rgba(255,255,255,0.6) 1px, transparent 0, transparent 50%)",
            backgroundSize: "14px 14px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">

          {/* Logo */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-xl"
              style={{ background: "linear-gradient(135deg, hsl(217 91% 55%), hsl(217 91% 40%))" }}
            >
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight tracking-tight">
                Synergy Sales Genius
              </p>
              <p
                className="text-[10px] tracking-[0.2em] uppercase font-medium"
                style={{ color: "hsl(217 91% 65%)" }}
              >
                Chin Hin Group
              </p>
            </div>
          </motion.div>

          {/* Hero copy */}
          <div className="flex-1 flex flex-col justify-center max-w-[420px]">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.55 }}
            >
              {/* Eyebrow pill */}
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7"
                style={{
                  background: "hsl(217 91% 55% / 0.12)",
                  border: "1px solid hsl(217 91% 55% / 0.22)",
                }}
              >
                <Sparkles className="w-3 h-3" style={{ color: "hsl(217 91% 65%)" }} />
                <span
                  className="text-[11px] font-semibold tracking-[0.18em] uppercase"
                  style={{ color: "hsl(217 91% 70%)" }}
                >
                  Enterprise AI CRM
                </span>
              </div>

              <h1 className="text-[2.6rem] xl:text-5xl font-extrabold text-white leading-[1.1] tracking-tight mb-5">
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

              <p className="text-white/45 text-[15px] leading-relaxed mb-10 max-w-[350px]">
                Unify your sales pipeline, detect duplicate leads, and surface
                cross-BU synergies with AI-powered intelligence — all in one
                workspace.
              </p>

              {/* Feature list */}
              <div className="flex flex-col gap-3 mb-12">
                {features.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "hsl(217 91% 55% / 0.14)" }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: "hsl(217 91% 65%)" }} />
                    </div>
                    <span className="text-white/55 text-sm">{text}</span>
                  </div>
                ))}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {stats.map(({ icon: Icon, label, value }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 + i * 0.08, duration: 0.4 }}
                    className="rounded-2xl p-4"
                    style={{
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <Icon className="w-4 h-4 mb-2.5" style={{ color: "hsl(217 91% 62%)" }} />
                    <p className="text-white font-bold text-lg leading-none mb-1">{value}</p>
                    <p className="text-white/35 text-[10px] leading-tight font-medium uppercase tracking-wide">
                      {label}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Footer row */}
          <div className="flex items-center justify-between">
            <p className="text-white/20 text-xs">© {new Date().getFullYear()} Chin Hin Group</p>
            <div className="flex gap-4">
              {["Privacy", "Terms", "Support"].map((l) => (
                <span
                  key={l}
                  className="text-white/20 text-xs hover:text-white/45 cursor-pointer transition-colors duration-200"
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ RIGHT — Form Panel ══════════════ */}
      <div
        className="flex-1 flex flex-col relative overflow-hidden"
        style={{ background: "hsl(222 47% 8%)" }}
      >
        {/* Subtle right-panel glow */}
        <div
          className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, hsl(217 91% 50% / 0.06) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, hsl(217 91% 50% / 0.05) 0%, transparent 70%)",
          }}
        />

        {/* Mobile topbar */}
        <div className="flex lg:hidden items-center px-6 pt-7 pb-4">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, hsl(217 91% 55%), hsl(217 91% 40%))" }}
          >
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="ml-2.5 font-bold text-sm text-white">Synergy Sales Genius</span>
        </div>

        {/* Centred form */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-6 sm:px-10 py-10">
          <div className="w-full max-w-[400px]">

            {/* Glass card */}
            <div
              className="rounded-3xl p-8 sm:p-10"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(12px)",
                boxShadow:
                  "0 24px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  {/* Header */}
                  <div className="mb-8">
                    {/* Mode badge */}
                    <div
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-5"
                      style={{
                        background: "hsl(217 91% 55% / 0.1)",
                        border: "1px solid hsl(217 91% 55% / 0.18)",
                      }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "hsl(217 91% 65%)" }}
                      />
                      <span
                        className="text-[11px] font-semibold tracking-wide"
                        style={{ color: "hsl(217 91% 68%)" }}
                      >
                        {mode === "signin" ? "Returning Member" : "New Account"}
                      </span>
                    </div>

                    <h2 className="text-2xl font-bold text-white tracking-tight leading-snug mb-2">
                      {mode === "signin"
                        ? "Welcome back"
                        : "Create your account"}
                    </h2>
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.38)" }}>
                      {mode === "signin"
                        ? "Sign in to access your sales workspace."
                        : "Get started in seconds — no credit card required."}
                    </p>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === "signup" && (
                      <div className="space-y-1.5">
                        <label htmlFor="name" className="block text-xs font-semibold text-white/50 uppercase tracking-wider pl-1">
                          Full Name
                        </label>
                        <PremiumInput
                          id="name"
                          icon={User}
                          placeholder="Ahmad Razif"
                          value={name}
                          onChange={setName}
                          required
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label htmlFor="email" className="block text-xs font-semibold text-white/50 uppercase tracking-wider pl-1">
                        Work Email
                      </label>
                      <PremiumInput
                        id="email"
                        type="email"
                        icon={Mail}
                        placeholder="you@chinhin.com"
                        value={email}
                        onChange={setEmail}
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="password" className="block text-xs font-semibold text-white/50 uppercase tracking-wider pl-1">
                        Password
                      </label>
                      <PremiumInput
                        id="password"
                        type="password"
                        icon={Lock}
                        placeholder="••••••••"
                        value={password}
                        onChange={setPassword}
                        required
                      />
                    </div>

                    {mode === "signin" && (
                      <div className="flex justify-end -mt-1">
                        <button
                          type="button"
                          className="text-xs font-medium transition-colors duration-150"
                          style={{ color: "hsl(217 91% 62%)" }}
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}

                    {/* Submit */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 relative overflow-hidden group"
                        style={{
                          background: loading
                            ? "hsl(217 91% 45%)"
                            : "linear-gradient(135deg, hsl(217 91% 55%), hsl(217 91% 45%))",
                          color: "#fff",
                          boxShadow: loading
                            ? "none"
                            : "0 4px 24px hsl(217 91% 50% / 0.4), 0 1px 0 rgba(255,255,255,0.12) inset",
                        }}
                      >
                        {/* Shimmer overlay on hover */}
                        <span
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                          style={{
                            background:
                              "linear-gradient(135deg, hsl(217 91% 60%), hsl(217 91% 50%))",
                          }}
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
                  <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>or</span>
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                  </div>

                  {/* Switch mode */}
                  <button
                    type="button"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    className="w-full flex items-center justify-center gap-1.5 text-sm transition-colors duration-150 group"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    {mode === "signin" ? "New to Synergy? " : "Already have an account? "}
                    <span
                      className="font-semibold flex items-center gap-0.5 group-hover:gap-1.5 transition-all duration-150"
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
            <div className="flex items-center justify-center gap-5 mt-7">
              {[
                { icon: ShieldCheck, label: "SOC 2 Compliant" },
                { icon: Lock,        label: "256-bit Encrypted" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5"
                  style={{ color: "rgba(255,255,255,0.22)" }}
                >
                  <Icon className="w-3 h-3" />
                  <span className="text-[11px] font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 pb-7 text-center">
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.18)" }}>
            © {new Date().getFullYear()} Chin Hin Group · Synergy Sales Genius
          </p>
        </div>
      </div>
    </div>
  );
}
