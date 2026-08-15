import { useState, useRef, useEffect } from "react";
import {
  Home, Heart, Target, Sun, BarChart2, MessageSquare, User,
  Droplets, Moon, Activity, Scale, Smile, Flame, Utensils,
  Plus, Send, Bell, Menu, X, TrendingUp, TrendingDown, Check,
  ChevronDown, ChevronRight, ArrowRight, Shield, Lock,
  Clock, Star, Zap, Info, CheckCircle, AlertCircle, LogOut,
  Calendar, ChevronUp, Eye, EyeOff, Loader2
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  onAuthStateChanged, signOut, deleteUser,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, updateProfile, getAdditionalUserInfo, type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { getUserProfile, saveUserProfile, deleteUserProfile, EMPTY_PROFILE, type UserProfile } from "../lib/profile";
import { getDailyLog, saveDailyLog, getRecentDailyLogs, todayKey, dateKeyOffset, wellnessScore, EMPTY_DAILY_LOG, type DailyLog, type DailyLogEntry } from "../lib/dailyLog";
import { getGoals, createGoal, updateGoalProgress, deleteGoal, type Goal } from "../lib/goals";
import { askAssistant, type ChatTurn } from "../lib/ai";
import { fetchAdminStats, fetchAdminUsers, type AdminStats, type AdminUser } from "../lib/admin";
import { enablePushNotifications, sendTestNotification } from "../lib/notifications";

function authErrorMessage(code: string): string {
  switch (code) {
    case "auth/email-already-in-use": return "Ya existe una cuenta con ese correo. Intenta iniciar sesión.";
    case "auth/invalid-email": return "El correo electrónico no es válido.";
    case "auth/weak-password": return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return "Correo o contraseña incorrectos.";
    case "auth/popup-closed-by-user": return "Se cerró la ventana de Google antes de completar el inicio de sesión.";
    default: return "Ocurrió un error. Intenta nuevamente.";
  }
}

// ── Types ────────────────────────────────────────────────────
type View = "landing" | "auth" | "onboarding" | "dashboard" | "health" | "goals" | "day" | "stats" | "ai" | "profile";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

// ── Mock Data ─────────────────────────────────────────────────
const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const GOAL_META: Record<string, { Icon: typeof Moon; color: string; target: string }> = {
  "Mejorar mi sueño": { Icon: Moon, color: "#6366f1", target: "8h de sueño diario" },
  "Aumentar actividad física": { Icon: Activity, color: "#147A60", target: "30 min/día de ejercicio" },
  "Beber más agua": { Icon: Droplets, color: "#0ea5e9", target: "8 vasos de agua al día" },
  "Mejorar alimentación": { Icon: Utensils, color: "#F59E0B", target: "Comidas balanceadas cada día" },
  "Reducir estrés": { Icon: Smile, color: "#ec4899", target: "Momentos de calma diarios" },
  "Controlar mi peso": { Icon: Scale, color: "#8b5cf6", target: "Seguimiento de peso semanal" },
};
const DEFAULT_GOAL_META = { Icon: Target, color: "#6366f1", target: "Objetivo personal" };

const SUGGESTED_QUESTIONS = [
  "¿Cómo puedo mejorar mi sueño?",
  "¿Qué puedo hacer para hidratarme mejor?",
  "¿Cómo empiezo a hacer más actividad física?",
  "¿Cómo mejorar mi alimentación esta semana?",
];

// ── Reusable Components ────────────────────────────────────────

function WellnessRing({ value, size = 80 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(20,122,96,0.12)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#30B98A" strokeWidth={6}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  );
}

function ProgressBar({ value, color = "#147A60" }: { value: number; color?: string }) {
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-foreground">{payload[0].value}</p>
    </div>
  );
}

function ConfirmDialog({ title, description, confirmLabel, danger, loading, error, onConfirm, onCancel }: {
  title: string; description: string; confirmLabel: string; danger?: boolean; loading?: boolean; error?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 bg-card rounded-3xl border border-border p-6 w-full max-w-sm shadow-xl">
        <h3 className="font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed mb-4">{description}</p>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 mb-4">
            <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-red-600 text-xs leading-relaxed">{error}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading} className="flex-1 border border-border text-foreground font-medium py-2.5 rounded-xl hover:bg-muted transition-colors text-sm disabled:opacity-60">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity hover:opacity-90 ${danger ? "bg-red-600 text-white" : "bg-primary text-primary-foreground"}`}>
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Landing Page ───────────────────────────────────────────────

function HeroPreviewCard() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 w-full max-w-sm shadow-2xl">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-full bg-emerald-400/20 flex items-center justify-center">
          <Heart size={18} className="text-emerald-300" />
        </div>
        <div>
          <p className="text-white/50 text-xs">Hoy · 14 ago 2026</p>
          <p className="text-white font-semibold text-sm">Tu bienestar hoy</p>
        </div>
      </div>
      <div className="flex items-center gap-5 mb-5">
        <div className="relative" style={{ width: 72, height: 72 }}>
          <WellnessRing value={78} size={72} />
          <div className="absolute inset-0 flex items-center justify-center rotate-90">
            <span className="text-white font-bold text-base">78</span>
          </div>
        </div>
        <div>
          <p className="text-white/50 text-xs mb-0.5">Puntaje de bienestar</p>
          <p className="text-emerald-400 font-semibold text-sm flex items-center gap-1">
            <TrendingUp size={13} /> Muy bien
          </p>
          <p className="text-white/40 text-xs mt-1">+5 pts respecto a ayer</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Sueño", val: "7.5h", ok: true, icon: Moon },
          { label: "Agua", val: "6/8", ok: false, icon: Droplets },
          { label: "Actividad", val: "35 min", ok: true, icon: Activity },
          { label: "Ánimo", val: "Bien 😊", ok: true, icon: Smile },
        ].map(({ label, val, ok, icon: Icon }) => (
          <div key={label} className={`rounded-2xl px-3 py-2 flex items-center gap-2 ${ok ? "bg-emerald-400/15" : "bg-amber-400/15"}`}>
            <Icon size={13} className={ok ? "text-emerald-300" : "text-amber-300"} />
            <div>
              <p className="text-white/40 text-[10px]">{label}</p>
              <p className={`text-xs font-semibold ${ok ? "text-emerald-300" : "text-amber-300"}`}>{val}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Sun, title: "Registro diario", desc: "Registra agua, sueño, actividad y estado de ánimo en segundos, sin complicaciones.", color: "#F59E0B" },
  { icon: MessageSquare, title: "Asistente de IA", desc: "Recibe recomendaciones personalizadas de bienestar basadas en tus hábitos registrados.", color: "#147A60" },
  { icon: BarChart2, title: "Estadísticas claras", desc: "Visualiza tu evolución semana a semana con gráficos simples y comprensibles.", color: "#0ea5e9" },
  { icon: Target, title: "Sistema de objetivos", desc: "Define metas de bienestar y sigue tu progreso con indicadores visuales motivadores.", color: "#6366f1" },
  { icon: Shield, title: "Privacidad total", desc: "Tus datos son tuyos. Cifrado extremo a extremo y control total siempre disponible.", color: "#ec4899" },
  { icon: Bell, title: "Recordatorios amigables", desc: "Alertas preventivas y motivadoras para mantener tus hábitos sin generar presión.", color: "#30B98A" },
];

const FAQ_ITEMS = [
  { q: "¿Es esta aplicación un reemplazo médico?", a: "No. Esta plataforma es una herramienta de bienestar personal. Toda la información entregada es de carácter general y no reemplaza la evaluación, diagnóstico ni tratamiento de un profesional de la salud." },
  { q: "¿Cómo se protegen mis datos de salud?", a: "Tus datos se almacenan con cifrado y nunca son compartidos con terceros sin tu consentimiento explícito. Puedes eliminar tu cuenta y todos tus datos personales en cualquier momento desde la sección Perfil." },
  { q: "¿Puedo usarla sin registrar datos sensibles?", a: "Sí. Todos los campos de salud son completamente voluntarios. Puedes usar la aplicación registrando únicamente lo que te resulte cómodo. Sin datos obligatorios." },
  { q: "¿Cómo funciona el asistente de IA?", a: "El asistente usa los datos que tú registras voluntariamente para ofrecer orientación general de bienestar. No realiza diagnósticos ni prescribe medicamentos. Siempre recomendará consultar a un profesional cuando la situación lo requiera." },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full text-left py-5 flex items-center justify-between gap-4 hover:text-primary transition-colors">
        <span className="font-medium text-foreground">{q}</span>
        {open ? <ChevronUp size={18} className="text-muted-foreground shrink-0" /> : <ChevronDown size={18} className="text-muted-foreground shrink-0" />}
      </button>
      {open && <p className="pb-5 text-muted-foreground text-sm leading-relaxed">{a}</p>}
    </div>
  );
}

function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen bg-background font-body">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Heart size={16} className="text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">BorquIA</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onStart} className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Iniciar sesión</button>
            <button onClick={onStart} className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-xl hover:opacity-90 transition-opacity">
              Comenzar gratis
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex items-center pt-16" style={{ background: "linear-gradient(135deg, #0C3529 0%, #1A5C44 60%, #147A60 100%)" }}>
        <div className="max-w-6xl mx-auto px-6 py-24 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-8">
                <Zap size={13} className="text-emerald-400" />
                <span className="text-white/80 text-xs font-medium">Bienestar personal inteligente</span>
              </div>
              <h1 className="text-5xl sm:text-6xl font-display text-white leading-tight mb-6">
                Cuida tu salud. Entiende tus hábitos. Mejora tu bienestar.
              </h1>
              <p className="text-white/60 text-lg leading-relaxed mb-10 max-w-md">
                Una plataforma inteligente para registrar, comprender y mejorar tus hábitos de salud de manera simple y segura.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={onStart} className="flex items-center justify-center gap-2 bg-white text-[#0C3529] font-semibold px-7 py-3.5 rounded-2xl hover:bg-emerald-50 transition-colors text-sm">
                  Comenzar ahora <ArrowRight size={16} />
                </button>
                <button className="flex items-center justify-center gap-2 border border-white/25 text-white px-7 py-3.5 rounded-2xl hover:bg-white/10 transition-colors text-sm">
                  Conocer la plataforma <ChevronDown size={16} />
                </button>
              </div>
              <div className="flex items-center gap-6 mt-10">
                {[{ v: "100%", l: "Privado" }, { v: "Sin", l: "diagnósticos" }, { v: "Gratis", l: "para empezar" }].map(({ v, l }) => (
                  <div key={l}>
                    <p className="text-white font-semibold text-sm">{v}</p>
                    <p className="text-white/40 text-xs">{l}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <HeroPreviewCard />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-primary text-sm font-medium mb-3 tracking-wider uppercase">Cómo funciona</p>
            <h2 className="font-display text-4xl text-foreground">Tres pasos hacia tu mejor versión</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "01", title: "Crea tu perfil", desc: "Comparte solo lo que quieras. Sin datos obligatorios. Sin presión. Tú decides qué registrar.", icon: User },
              { n: "02", title: "Registra tus hábitos", desc: "Un registro rápido al día es suficiente para comenzar. Agua, sueño, actividad, ánimo.", icon: Sun },
              { n: "03", title: "Comprende tu bienestar", desc: "Visualiza tu evolución y recibe orientación personalizada de tu asistente de IA.", icon: BarChart2 },
            ].map(({ n, title, desc, icon: Icon }) => (
              <div key={n} className="relative">
                <div className="bg-card rounded-3xl p-8 border border-border h-full">
                  <span className="font-display text-6xl text-border select-none absolute top-6 right-8">{n}</span>
                  <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-5">
                    <Icon size={22} className="text-primary" />
                  </div>
                  <h3 className="font-display text-xl text-foreground mb-3">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-secondary/40">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-primary text-sm font-medium mb-3 tracking-wider uppercase">Funcionalidades</p>
            <h2 className="font-display text-4xl text-foreground">Todo lo que necesitas para tu bienestar</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-card rounded-3xl p-7 border border-border hover:shadow-md transition-shadow group">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: `${color}18` }}>
                  <Icon size={22} style={{ color }} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Preview */}
      <section className="py-24" style={{ background: "linear-gradient(135deg, #0C3529 0%, #1A5C44 100%)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-emerald-400 text-sm font-medium mb-4 tracking-wider uppercase">Asistente inteligente</p>
              <h2 className="font-display text-4xl text-white mb-6">Tu guía de bienestar, disponible cuando la necesites</h2>
              <p className="text-white/60 leading-relaxed mb-8">
                El asistente analiza tus hábitos registrados y ofrece orientación general personalizada. Siempre transparente sobre sus limitaciones y listo para derivarte a un profesional cuando sea necesario.
              </p>
              <div className="space-y-3">
                {["Recomendaciones basadas en tus datos", "Explica su razonamiento siempre", "No realiza diagnósticos médicos", "Sugiere consultar profesionales"].map(item => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                    <span className="text-white/70 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Chat preview */}
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/15">
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-white/15">
                <div className="w-9 h-9 rounded-full bg-emerald-400/20 flex items-center justify-center">
                  <MessageSquare size={16} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Asistente BorquIA</p>
                  <p className="text-white/40 text-xs">Siempre disponible</p>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="bg-white/10 rounded-2xl rounded-tl-sm px-4 py-3 max-w-xs">
                  <p className="text-white/80 text-sm">Hola María 👋 ¿En qué puedo orientarte hoy?</p>
                </div>
                <div className="flex justify-end">
                  <div className="bg-emerald-500/30 rounded-2xl rounded-tr-sm px-4 py-3 max-w-xs">
                    <p className="text-white text-sm">¿Cómo puedo mejorar mi sueño?</p>
                  </div>
                </div>
                <div className="bg-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                  <p className="text-white/80 text-sm">Basado en tus registros, duermes en promedio 7.5h. Un pequeño ajuste en tu hora de dormir podría ayudarte a alcanzar las 8h...</p>
                </div>
              </div>
              <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2">
                <p className="text-amber-300 text-xs flex items-center gap-1.5">
                  <Info size={11} /> Información general · No reemplaza la consulta médica
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="py-24 bg-background">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-primary text-sm font-medium mb-3 tracking-wider uppercase">Privacidad y seguridad</p>
            <h2 className="font-display text-4xl text-foreground">Tus datos de salud son tuyos. Siempre.</h2>
            <p className="text-muted-foreground mt-4 max-w-lg mx-auto">Tratamos tu información de salud como lo que es: altamente sensible. Sin excepciones.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Lock, title: "Cifrado", desc: "Datos cifrados en tránsito y en reposo" },
              { icon: Shield, title: "Sin venta de datos", desc: "Nunca compartimos tu información con terceros" },
              { icon: Eye, title: "Transparencia", desc: "Siempre sabes qué hace la IA con tus datos" },
              { icon: User, title: "Control total", desc: "Elimina tu cuenta y datos en cualquier momento" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center p-6">
                <div className="w-12 h-12 rounded-2xl bg-secondary mx-auto flex items-center justify-center mb-4">
                  <Icon size={20} className="text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-sm">{title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-secondary/30">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl text-foreground">Preguntas frecuentes</h2>
          </div>
          <div className="bg-card rounded-3xl border border-border px-8 divide-y divide-border">
            {FAQ_ITEMS.map((item) => <FAQItem key={item.q} {...item} />)}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-background">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-display text-4xl text-foreground mb-4">Empieza hoy, sin compromiso</h2>
          <p className="text-muted-foreground mb-8">Gratis. Sin tarjeta de crédito. Sin datos obligatorios.</p>
          <button onClick={onStart} className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-4 rounded-2xl hover:opacity-90 transition-opacity text-sm">
            Comenzar ahora <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 bg-background">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Heart size={13} className="text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground text-sm">BorquIA</span>
          </div>
          <p className="text-muted-foreground text-xs">© 2026 BorquIA · Información general de bienestar · No es un servicio médico</p>
          <div className="flex gap-5">
            {["Privacidad", "Términos", "Contacto"].map(l => (
              <button key={l} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{l}</button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Auth Page ──────────────────────────────────────────────────

function AuthPage({ onSuccess, onBack }: { onSuccess: (isNewUser: boolean) => void; onBack: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        if (form.name) await updateProfile(cred.user, { displayName: form.name });
        onSuccess(true);
      } else {
        await signInWithEmailAndPassword(auth, form.email, form.password);
        onSuccess(false);
      }
    } catch (e: any) {
      setError(authErrorMessage(e?.code ?? ""));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      onSuccess(getAdditionalUserInfo(cred)?.isNewUser ?? false);
    } catch (e: any) {
      setError(authErrorMessage(e?.code ?? ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm mb-8">
          <ChevronDown size={16} className="rotate-90" /> Volver
        </button>
        <div className="bg-card rounded-3xl border border-border p-8">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Heart size={16} className="text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">BorquIA</span>
          </div>
          <h2 className="font-display text-2xl text-foreground mb-1">
            {mode === "register" ? "Crea tu cuenta" : "Bienvenido de vuelta"}
          </h2>
          <p className="text-muted-foreground text-sm mb-8">
            {mode === "register" ? "Gratis. Sin datos obligatorios." : "Ingresa para continuar."}
          </p>

          <div className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Nombre</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="María García" className="w-full bg-input-background rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Correo electrónico</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="tu@correo.com" className="w-full bg-input-background rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Contraseña</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  placeholder="••••••••" className="w-full bg-input-background rounded-xl px-4 py-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
                <button onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {mode === "register" && (
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
              Al crear tu cuenta aceptas nuestra <span className="text-primary cursor-pointer hover:underline">Política de Privacidad</span> y <span className="text-primary cursor-pointer hover:underline">Términos de uso</span>.
            </p>
          )}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-red-600 text-xs leading-relaxed">{error}</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} className="w-full mt-6 bg-primary text-primary-foreground font-semibold py-3.5 rounded-2xl hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === "register" ? "Crear cuenta gratuita" : "Iniciar sesión"}
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">o</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button onClick={handleGoogle} disabled={loading} className="w-full border border-border text-foreground font-medium py-3.5 rounded-2xl hover:bg-muted transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuar con Google
          </button>

          <div className="mt-6 text-center">
            <span className="text-muted-foreground text-sm">
              {mode === "register" ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
            </span>
            <button onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }} className="text-primary text-sm font-medium hover:underline">
              {mode === "register" ? "Iniciar sesión" : "Crear cuenta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Onboarding ─────────────────────────────────────────────────

const STEP_GOALS = ["Mejorar mi sueño", "Aumentar actividad física", "Beber más agua", "Mejorar alimentación", "Reducir estrés", "Controlar mi peso"];
const STEP_HABITS = ["Sueño", "Agua", "Actividad física", "Estado de ánimo", "Alimentación", "Peso"];

function OnboardingPage({ onFinish }: { onFinish: (profile: UserProfile) => void }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    name: auth.currentUser?.displayName ?? "",
    age: "", height: "", weight: "",
    goals: [] as string[], habits: [] as string[],
    reminders: { morning: true, evening: true, water: true },
  });
  const [saving, setSaving] = useState(false);

  const toggleArr = (key: "goals" | "habits", val: string) => {
    setData(d => ({ ...d, [key]: d[key].includes(val) ? d[key].filter(x => x !== val) : [...d[key], val] }));
  };

  const steps = ["Bienvenida", "Información básica", "Tus objetivos", "Hábitos a seguir", "Recordatorios"];

  const handleFinish = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    const profile: UserProfile = { ...data, health: EMPTY_PROFILE.health };
    await saveUserProfile(uid, profile);
    await Promise.all(data.goals.map(title => {
      const meta = GOAL_META[title] ?? DEFAULT_GOAL_META;
      return createGoal(uid, { title, target: meta.target, targetDate: null });
    }));
    setSaving(false);
    onFinish(profile);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${i + 1 < step ? "bg-accent text-accent-foreground" : i + 1 === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {i + 1 < step ? <Check size={13} /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 min-w-4 rounded-full ${i + 1 < step ? "bg-accent" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-card rounded-3xl border border-border p-8">
          {step === 1 && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-3xl bg-secondary flex items-center justify-center mx-auto mb-6">
                <Heart size={28} className="text-primary" />
              </div>
              <h2 className="font-display text-3xl text-foreground mb-3">Bienvenido a BorquIA</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-sm mx-auto">
                En los próximos pasos configuraremos tu experiencia. Solo comparte lo que te resulte cómodo. Sin datos obligatorios.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-left mb-6">
                <p className="text-amber-700 text-xs flex items-start gap-2 leading-relaxed">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  Esta aplicación entrega información general de bienestar y no reemplaza la evaluación de un profesional de la salud.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="font-display text-2xl text-foreground mb-1">Información básica</h2>
              <p className="text-muted-foreground text-sm mb-6">Todos los campos son opcionales.</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Nombre", key: "name", placeholder: "María", full: true },
                  { label: "Edad", key: "age", placeholder: "34" },
                  { label: "Altura (cm)", key: "height", placeholder: "165" },
                  { label: "Peso (kg)", key: "weight", placeholder: "68" },
                ].map(({ label, key, placeholder, full }) => (
                  <div key={key} className={full ? "col-span-2" : ""}>
                    <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
                    <input value={(data as any)[key]} onChange={e => setData(d => ({ ...d, [key]: e.target.value }))}
                      placeholder={placeholder} className="w-full bg-input-background rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="font-display text-2xl text-foreground mb-1">Tus objetivos</h2>
              <p className="text-muted-foreground text-sm mb-6">Selecciona los que quieras trabajar.</p>
              <div className="grid grid-cols-2 gap-3">
                {STEP_GOALS.map(g => (
                  <button key={g} onClick={() => toggleArr("goals", g)}
                    className={`text-left px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${data.goals.includes(g) ? "bg-secondary border-primary text-primary" : "bg-muted border-transparent text-muted-foreground hover:border-border"}`}>
                    <span className="flex items-center gap-2">
                      {data.goals.includes(g) && <Check size={13} className="text-primary shrink-0" />}
                      {g}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="font-display text-2xl text-foreground mb-1">Hábitos a registrar</h2>
              <p className="text-muted-foreground text-sm mb-6">¿Qué quieres seguir de tu día a día?</p>
              <div className="grid grid-cols-2 gap-3">
                {STEP_HABITS.map(h => (
                  <button key={h} onClick={() => toggleArr("habits", h)}
                    className={`text-left px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${data.habits.includes(h) ? "bg-secondary border-primary text-primary" : "bg-muted border-transparent text-muted-foreground hover:border-border"}`}>
                    <span className="flex items-center gap-2">
                      {data.habits.includes(h) && <Check size={13} className="text-primary shrink-0" />}
                      {h}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="font-display text-2xl text-foreground mb-1">Recordatorios</h2>
              <p className="text-muted-foreground text-sm mb-6">Puedes ajustarlos en cualquier momento.</p>
              <div className="space-y-3">
                {[
                  { key: "morning", label: "Recordatorio matutino", sub: "Para completar tu registro al despertar" },
                  { key: "evening", label: "Recordatorio vespertino", sub: "Para cerrar tu día y revisar tus hábitos" },
                  { key: "water", label: "Recordatorio de hidratación", sub: "Cada 2 horas durante el día" },
                ].map(({ key, label, sub }) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{sub}</p>
                    </div>
                    <button onClick={() => setData(d => ({ ...d, reminders: { ...d.reminders, [key]: !(d.reminders as any)[key] } }))}
                      className={`w-11 h-6 rounded-full transition-colors relative ${(data.reminders as any)[key] ? "bg-primary" : "bg-switch-background"}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${(data.reminders as any)[key] ? "left-5.5" : "left-0.5"}`} style={{ left: (data.reminders as any)[key] ? "22px" : "2px" }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="flex-1 border border-border text-foreground font-medium py-3 rounded-2xl hover:bg-muted transition-colors text-sm">
                Atrás
              </button>
            )}
            <button onClick={() => step < 5 ? setStep(s => s + 1) : handleFinish()} disabled={saving}
              className="flex-1 bg-primary text-primary-foreground font-semibold py-3 rounded-2xl hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 size={15} className="animate-spin" />}
              {step === 5 ? "Ver mi dashboard" : "Continuar"} {!saving && <ChevronRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App Views ──────────────────────────────────────────────────

const MOOD_EMOJI = ["", "😞", "😕", "😐", "😊", "😄"];

function metricTrend(todayVal: number, yesterdayVal: number | null): "up" | "down" | "stable" {
  if (yesterdayVal === null) return "stable";
  if (todayVal > yesterdayVal) return "up";
  if (todayVal < yesterdayVal) return "down";
  return "stable";
}

function DashboardView({ profile, onNavigate }: { profile: UserProfile; onNavigate: (v: View) => void }) {
  const today = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const name = profile.name.trim();
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [yesterdayLog, setYesterdayLog] = useState<DailyLog | null>(null);
  const [loadingLog, setLoadingLog] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoadingLog(false); return; }
    Promise.all([
      getDailyLog(uid, todayKey()),
      getDailyLog(uid, dateKeyOffset(-1)),
    ]).then(([t, y]) => {
      setTodayLog(t);
      setYesterdayLog(y);
      setLoadingLog(false);
    });
  }, []);

  const score = todayLog ? wellnessScore(todayLog) : 0;
  const prevScore = yesterdayLog ? wellnessScore(yesterdayLog) : null;
  const scoreDiff = prevScore !== null ? score - prevScore : null;
  const scoreLabel = score >= 75 ? "Muy bien" : score >= 50 ? "Bien" : score >= 25 ? "Regular" : "Recién empezando";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm capitalize">{today}</p>
          <h1 className="font-display text-2xl text-foreground">Buenos días{name ? `, ${name}` : ""} 👋</h1>
        </div>
        <button onClick={() => onNavigate("day")} className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shrink-0 self-start">
          <Plus size={15} /> Registrar hoy
        </button>
      </div>

      {loadingLog ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="text-primary animate-spin" />
        </div>
      ) : !todayLog ? (
        <div className="bg-card rounded-3xl border border-border p-8 text-center">
          <Sun size={24} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium text-sm mb-1">Aún no has registrado tu día de hoy</p>
          <p className="text-muted-foreground text-sm mb-4">Registra tu agua, sueño, actividad y ánimo para ver tu puntaje de bienestar aquí.</p>
          <button onClick={() => onNavigate("day")} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
            <Plus size={15} /> Registrar ahora
          </button>
        </div>
      ) : (
        <>
          {/* Wellness score */}
          <div className="bg-card rounded-3xl border border-border p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-6">
              <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
                <WellnessRing value={score} size={100} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-bold text-2xl text-foreground leading-none">{score}</span>
                  <span className="text-muted-foreground text-xs">/100</span>
                </div>
              </div>
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1 flex-wrap">
                  <h2 className="font-semibold text-foreground">Puntaje de bienestar</h2>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{scoreLabel}</span>
                </div>
                <p className="text-muted-foreground text-sm mb-4">
                  {scoreDiff === null ? "Aún no tienes registro de ayer para comparar." :
                    scoreDiff > 0 ? `+${scoreDiff} puntos respecto a ayer. ¡Vas en la dirección correcta!` :
                    scoreDiff < 0 ? `${scoreDiff} puntos respecto a ayer.` : "Igual que ayer."}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Sueño", val: `${todayLog.sleep}h`, ok: todayLog.sleep >= 7, icon: Moon },
                    { label: "Agua", val: `${todayLog.water}/8`, ok: todayLog.water >= 6, icon: Droplets },
                    { label: "Actividad", val: `${todayLog.activity} min`, ok: todayLog.activity >= 20, icon: Activity },
                    { label: "Ánimo", val: MOOD_EMOJI[todayLog.mood] ?? "😐", ok: todayLog.mood >= 4, icon: Smile },
                  ].map(({ label, val, ok, icon: Icon }) => (
                    <div key={label} className={`rounded-2xl px-3 py-2 text-center ${ok ? "bg-emerald-50" : "bg-amber-50"}`}>
                      <Icon size={14} className={`mx-auto mb-1 ${ok ? "text-emerald-600" : "text-amber-500"}`} />
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-xs font-semibold ${ok ? "text-emerald-700" : "text-amber-600"}`}>{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Moon, label: "Sueño", value: String(todayLog.sleep), unit: "horas", trend: metricTrend(todayLog.sleep, yesterdayLog?.sleep ?? null), color: "#6366f1", update: "Anoche" },
              { icon: Droplets, label: "Hidratación", value: String(todayLog.water), unit: "/ 8 vasos", trend: metricTrend(todayLog.water, yesterdayLog?.water ?? null), color: "#0ea5e9", update: "Hoy" },
              { icon: Activity, label: "Actividad", value: String(todayLog.activity), unit: "min hoy", trend: metricTrend(todayLog.activity, yesterdayLog?.activity ?? null), color: "#147A60", update: "Hoy" },
              { icon: Scale, label: "Peso", value: profile.weight || "—", unit: profile.weight ? "kg" : "Sin registrar", trend: "stable" as const, color: "#F59E0B", update: "Desde tu perfil" },
            ].map(({ icon: Icon, label, value, unit, trend, color, update }) => (
              <div key={label} className="bg-card rounded-3xl border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
                    <Icon size={15} style={{ color }} />
                  </div>
                </div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-2xl font-bold text-foreground">{value}</span>
                  <span className="text-xs text-muted-foreground mb-0.5">{unit}</span>
                </div>
                <div className="flex items-center gap-1">
                  {trend === "up" ? <TrendingUp size={11} className="text-emerald-500" /> : trend === "down" ? <TrendingDown size={11} className="text-amber-500" /> : <span className="w-3 h-0.5 bg-muted-foreground rounded-full inline-block" />}
                  <span className={`text-xs ${trend === "up" ? "text-emerald-600" : trend === "down" ? "text-amber-600" : "text-muted-foreground"}`}>
                    {trend === "up" ? "Mejorando" : trend === "down" ? "Atención" : "Estable"} · {update}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Quick actions + Reminders */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <h3 className="font-semibold text-foreground mb-3">Accesos rápidos</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Mi Salud", icon: Heart, view: "health" as View, color: "#ec4899" },
              { label: "Mis Objetivos", icon: Target, view: "goals" as View, color: "#6366f1" },
              { label: "Estadísticas", icon: BarChart2, view: "stats" as View, color: "#147A60" },
              { label: "Asistente IA", icon: MessageSquare, view: "ai" as View, color: "#0ea5e9" },
              { label: "Mi Perfil", icon: User, view: "profile" as View, color: "#F59E0B" },
              { label: "Mi Día", icon: Sun, view: "day" as View, color: "#30B98A" },
            ].map(({ label, icon: Icon, view, color }) => (
              <button key={label} onClick={() => onNavigate(view)}
                className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow group">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <span className="text-xs font-medium text-foreground text-center">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-3">Recordatorios</h3>
          <div className="space-y-3">
            {[
              { text: "Registra tu hidratación de hoy", time: "Pendiente", ok: false },
              { text: "Completa tu registro diario", time: "Pendiente", ok: false },
              { text: "Revisa tus objetivos de agosto", time: "Esta semana", ok: true },
            ].map(({ text, time, ok }) => (
              <div key={text} className={`flex items-start gap-3 p-3 rounded-2xl ${ok ? "bg-muted" : "bg-amber-50 border border-amber-100"}`}>
                <Bell size={14} className={`mt-0.5 shrink-0 ${ok ? "text-muted-foreground" : "text-amber-500"}`} />
                <div>
                  <p className="text-xs font-medium text-foreground">{text}</p>
                  <p className="text-xs text-muted-foreground">{time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayView() {
  const [water, setWater] = useState(EMPTY_DAILY_LOG.water);
  const [sleep, setSleep] = useState(EMPTY_DAILY_LOG.sleep);
  const [activity, setActivity] = useState(EMPTY_DAILY_LOG.activity);
  const [mood, setMood] = useState(EMPTY_DAILY_LOG.mood);
  const [notes, setNotes] = useState(EMPTY_DAILY_LOG.notes);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const today = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    getDailyLog(uid, todayKey()).then(log => {
      if (log) {
        setWater(log.water);
        setSleep(log.sleep);
        setActivity(log.activity);
        setMood(log.mood);
        setNotes(log.notes);
      }
      setLoading(false);
    });
  }, []);

  const moods = [{ v: 1, e: "😞" }, { v: 2, e: "😕" }, { v: 3, e: "😐" }, { v: 4, e: "😊" }, { v: 5, e: "😄" }];

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    const log: DailyLog = { water, sleep, activity, mood, notes };
    await saveDailyLog(uid, todayKey(), log);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-foreground">Mi Día</h1>
        <p className="text-muted-foreground text-sm capitalize">{today}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Water */}
        <div className="bg-card rounded-3xl border border-border p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 flex items-center justify-center">
              <Droplets size={18} className="text-sky-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Hidratación</h3>
              <p className="text-xs text-muted-foreground">Objetivo: 8 vasos</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={() => setWater(w => Math.max(0, w - 1))} className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors font-bold text-lg">−</button>
            <div className="text-center">
              <span className="text-4xl font-bold text-foreground">{water}</span>
              <span className="text-muted-foreground text-sm"> / 8</span>
            </div>
            <button onClick={() => setWater(w => Math.min(8, w + 1))} className="w-10 h-10 rounded-full bg-sky-50 border-2 border-sky-200 flex items-center justify-center text-sky-500 hover:bg-sky-100 transition-colors font-bold text-lg">+</button>
          </div>
          <div className="flex gap-1.5 justify-center">
            {Array.from({ length: 8 }).map((_, i) => (
              <button key={i} onClick={() => setWater(i + 1)} className={`w-6 h-8 rounded-lg transition-colors ${i < water ? "bg-sky-400" : "bg-muted"}`} />
            ))}
          </div>
        </div>

        {/* Sleep */}
        <div className="bg-card rounded-3xl border border-border p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Moon size={18} className="text-indigo-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Sueño anoche</h3>
              <p className="text-xs text-muted-foreground">Objetivo: 8 horas</p>
            </div>
          </div>
          <div className="text-center mb-4">
            <span className="text-4xl font-bold text-foreground">{sleep}</span>
            <span className="text-muted-foreground text-sm"> h</span>
          </div>
          <input type="range" min={4} max={12} step={0.5} value={sleep} onChange={e => setSleep(Number(e.target.value))}
            className="w-full accent-primary" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>4h</span><span>8h</span><span>12h</span>
          </div>
        </div>

        {/* Activity */}
        <div className="bg-card rounded-3xl border border-border p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <Activity size={18} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Actividad física</h3>
              <p className="text-xs text-muted-foreground">Objetivo: 30 min/día</p>
            </div>
          </div>
          <div className="text-center mb-4">
            <span className="text-4xl font-bold text-foreground">{activity}</span>
            <span className="text-muted-foreground text-sm"> min</span>
          </div>
          <input type="range" min={0} max={120} step={5} value={activity} onChange={e => setActivity(Number(e.target.value))}
            className="w-full accent-primary" />
          <div className="flex gap-2 mt-3">
            {[15, 30, 45, 60].map(v => (
              <button key={v} onClick={() => setActivity(v)} className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${activity === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>
                {v}m
              </button>
            ))}
          </div>
        </div>

        {/* Mood */}
        <div className="bg-card rounded-3xl border border-border p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl bg-pink-50 flex items-center justify-center">
              <Smile size={18} className="text-pink-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Estado de ánimo</h3>
              <p className="text-xs text-muted-foreground">¿Cómo te sientes hoy?</p>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            {moods.map(({ v, e }) => (
              <button key={v} onClick={() => setMood(v)}
                className={`w-12 h-12 rounded-2xl text-2xl flex items-center justify-center transition-all ${mood === v ? "bg-pink-100 scale-110 shadow-md" : "bg-muted hover:bg-secondary"}`}>
                {e}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">
            {["", "Mal", "Regular", "Neutro", "Bien", "Excelente"][mood]}
          </p>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-3">Notas del día</h3>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="¿Cómo fue tu día? ¿Algo que quieras recordar?"
          className="w-full bg-input-background rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition resize-none h-24" />
      </div>

      <button onClick={handleSave} disabled={saving} className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
        {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : saved ? <><CheckCircle size={16} /> ¡Registro guardado!</> : "Guardar registro del día"}
      </button>
    </div>
  );
}

function formatDateKey(dateKey: string): string {
  return new Date(dateKey + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

function GoalsView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formDate, setFormDate] = useState("");
  const [creating, setCreating] = useState(false);

  const uid = auth.currentUser?.uid;

  const reload = () => {
    if (!uid) { setLoading(false); return; }
    return getGoals(uid).then(setGoals);
  };

  useEffect(() => { reload()?.finally(() => setLoading(false)); }, []);

  const handleProgress = async (goal: Goal, delta: number) => {
    if (!uid) return;
    setUpdatingId(goal.id);
    const history = await updateGoalProgress(uid, goal, goal.progress + delta);
    setGoals(gs => gs.map(g => g.id === goal.id ? { ...g, progress: Math.max(0, Math.min(100, g.progress + delta)), history } : g));
    setUpdatingId(null);
  };

  const handleCreate = async () => {
    if (!uid || !formTitle.trim()) return;
    setCreating(true);
    await createGoal(uid, {
      title: formTitle.trim(),
      target: formTarget.trim() || (GOAL_META[formTitle.trim()]?.target ?? "Objetivo personal"),
      targetDate: formDate || null,
    });
    await reload();
    setCreating(false);
    setShowForm(false);
    setFormTitle(""); setFormTarget(""); setFormDate("");
  };

  const handleDelete = async () => {
    if (!uid || !deleteId) return;
    setDeleting(true);
    await deleteGoal(uid, deleteId);
    setGoals(gs => gs.filter(g => g.id !== deleteId));
    setDeleting(false);
    setDeleteId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">Mis Objetivos</h1>
          <p className="text-muted-foreground text-sm">{goals.length} objetivo{goals.length === 1 ? "" : "s"} activo{goals.length === 1 ? "" : "s"}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-muted transition-colors">
          <Plus size={15} /> Nuevo objetivo
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-8 text-center">
          <Target size={24} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium text-sm mb-1">Aún no tienes objetivos</p>
          <p className="text-muted-foreground text-sm">Crea uno para empezar a seguir tu progreso.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {goals.map(goal => {
            const { Icon, color } = GOAL_META[goal.title] ?? DEFAULT_GOAL_META;
            const status = goal.progress >= 80 ? "Casi logrado" : goal.progress >= 40 ? "En progreso" : "Iniciando";
            const statusClass = goal.progress >= 80 ? "bg-emerald-100 text-emerald-700" : goal.progress >= 40 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
            return (
              <div key={goal.id} className="bg-card rounded-3xl border border-border p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
                      <Icon size={20} style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground text-sm truncate">{goal.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">{goal.target}</p>
                    </div>
                  </div>
                  <button onClick={() => setDeleteId(goal.id)} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0">
                    <X size={15} />
                  </button>
                </div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold" style={{ color }}>{goal.progress}%</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleProgress(goal, -10)} disabled={updatingId === goal.id || goal.progress <= 0}
                      className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 text-xs font-bold">−</button>
                    <button onClick={() => handleProgress(goal, 10)} disabled={updatingId === goal.id || goal.progress >= 100}
                      className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40 text-xs font-bold">+</button>
                  </div>
                </div>
                <ProgressBar value={goal.progress} color={color} />
                <div className="flex items-center justify-between mt-3 flex-wrap gap-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar size={11} /> Inicio: {formatDateKey(goal.startedAt)}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>{status}</span>
                </div>
                {goal.targetDate && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Clock size={11} /> Meta: {formatDateKey(goal.targetDate)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative z-10 bg-card rounded-3xl border border-border p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-foreground mb-4">Nuevo objetivo</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Título</label>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ej: Meditar todos los días"
                  className="w-full bg-input-background rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Meta (opcional)</label>
                <input value={formTarget} onChange={e => setFormTarget(e.target.value)} placeholder="Ej: 10 min diarios"
                  className="w-full bg-input-background rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Fecha objetivo (opcional)</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                  className="w-full bg-input-background rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} disabled={creating} className="flex-1 border border-border text-foreground font-medium py-2.5 rounded-xl hover:bg-muted transition-colors text-sm disabled:opacity-60">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={creating || !formTitle.trim()} className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {creating && <Loader2 size={14} className="animate-spin" />} Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <ConfirmDialog
          title="Eliminar objetivo"
          description="Se eliminará este objetivo y su historial de progreso. Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}

function lastNDays(n: number, from: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => dateKeyOffset(-(n - 1 - i), from));
}

function avgOf(logs: DailyLog[], key: "sleep" | "activity" | "water"): number {
  if (!logs.length) return 0;
  return logs.reduce((s, l) => s + l[key], 0) / logs.length;
}

function StatsView() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    getRecentDailyLogs(uid, 28).then(e => { setEntries(e); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl text-foreground">Estadísticas</h1>
          <p className="text-muted-foreground text-sm">Tu evolución de bienestar</p>
        </div>
        <div className="bg-card rounded-3xl border border-border p-8 text-center">
          <BarChart2 size={24} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium text-sm mb-1">Aún no hay datos suficientes</p>
          <p className="text-muted-foreground text-sm">Registra tu día en "Mi Día" y aquí verás tu evolución.</p>
        </div>
      </div>
    );
  }

  const logMap = new Map(entries.map(e => [e.date, e.log]));
  const last7 = lastNDays(7);
  const last28 = lastNDays(28);

  const weekChart = last7.map(date => {
    const log = logMap.get(date);
    return {
      day: WEEKDAY_LABELS[new Date(date + "T00:00:00").getDay()],
      horas: log?.sleep ?? 0,
      min: log?.activity ?? 0,
      vasos: log?.water ?? 0,
    };
  });

  const monthChart = [0, 1, 2, 3].map(i => {
    const chunk = last28.slice(i * 7, i * 7 + 7).map(d => logMap.get(d)).filter((l): l is DailyLog => !!l);
    return {
      week: `Sem ${i + 1}`,
      sueño: chunk.length ? Math.round(avgOf(chunk, "sleep") * 10) / 10 : 0,
      actividad: chunk.length ? Math.round(avgOf(chunk, "activity")) : 0,
    };
  });

  const thisWeekLogs = last7.map(d => logMap.get(d)).filter((l): l is DailyLog => !!l);
  const prevWeekLogs = lastNDays(14).slice(0, 7).map(d => logMap.get(d)).filter((l): l is DailyLog => !!l);
  const sleepAvg = avgOf(thisWeekLogs, "sleep");
  const activityAvg = avgOf(thisWeekLogs, "activity");
  const waterAvg = avgOf(thisWeekLogs, "water");
  const sleepAvgPrev = avgOf(prevWeekLogs, "sleep");
  const activityAvgPrev = avgOf(prevWeekLogs, "activity");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">Estadísticas</h1>
          <p className="text-muted-foreground text-sm">Tu evolución de bienestar</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {(["week", "month"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {p === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-2">
        {[
          { label: "Sueño promedio", value: `${Math.round(sleepAvg * 10) / 10}h`, trend: metricTrend(sleepAvg, prevWeekLogs.length ? sleepAvgPrev : null), sub: prevWeekLogs.length ? `vs ${Math.round(sleepAvgPrev * 10) / 10}h semana anterior` : "Sin datos de la semana anterior" },
          { label: "Actividad promedio", value: `${Math.round(activityAvg)} min`, trend: metricTrend(activityAvg, prevWeekLogs.length ? activityAvgPrev : null), sub: prevWeekLogs.length ? `vs ${Math.round(activityAvgPrev)} min semana anterior` : "Sin datos de la semana anterior" },
          { label: "Hidratación promedio", value: `${Math.round(waterAvg * 10) / 10} vasos`, trend: "stable" as const, sub: "Objetivo: 8 vasos" },
        ].map(({ label, value, trend, sub }) => (
          <div key={label} className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
            <div className="flex items-center gap-1">
              {trend === "up" ? <TrendingUp size={11} className="text-emerald-500" /> : trend === "down" ? <TrendingDown size={11} className="text-amber-500" /> : null}
              <span className="text-xs text-muted-foreground">{sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sleep chart */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-1">Horas de sueño</h3>
        <p className="text-xs text-muted-foreground mb-5">Objetivo: 8h por noche</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={period === "week" ? weekChart : monthChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey={period === "week" ? "day" : "week"} tick={{ fontSize: 11, fill: "#5E7A72" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#5E7A72" }} axisLine={false} tickLine={false} domain={[0, 10]} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey={period === "week" ? "horas" : "sueño"} stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Activity chart */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-1">Actividad física</h3>
        <p className="text-xs text-muted-foreground mb-5">Minutos de actividad por día</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={period === "week" ? weekChart : monthChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey={period === "week" ? "day" : "week"} tick={{ fontSize: 11, fill: "#5E7A72" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#5E7A72" }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey={period === "week" ? "min" : "actividad"} fill="#147A60" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Water chart */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-1">Hidratación diaria</h3>
        <p className="text-xs text-muted-foreground mb-5">Vasos de agua registrados esta semana</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={weekChart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#5E7A72" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#5E7A72" }} axisLine={false} tickLine={false} domain={[0, 10]} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="vasos" stroke="#0ea5e9" strokeWidth={2.5} fill="url(#waterGrad)" dot={{ fill: "#0ea5e9", r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AIView({ profile }: { profile: UserProfile }) {
  const name = profile.name.trim();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "ai", content: `Hola${name ? ` ${name}` : ""} 👋 Soy tu asistente de bienestar. Puedo orientarte con información general sobre hábitos saludables basándome en tus registros. ¿En qué te puedo ayudar hoy?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [todayLogSummary, setTodayLogSummary] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDailyLog(uid, todayKey()).then(log => {
      if (log) setTodayLogSummary(`Sueño ${log.sleep}h, agua ${log.water}/8 vasos, actividad ${log.activity} min, ánimo ${MOOD_EMOJI[log.mood] ?? "neutro"}`);
    });
  }, []);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    // Skip the hardcoded greeting (index 0): it's UI-only, not a real model turn.
    const history: ChatTurn[] = messages.slice(1).map(m => ({ role: m.role === "ai" ? "model" as const : "user" as const, text: m.content }));
    setMessages(m => [...m, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);
    try {
      const reply = await askAssistant(history, userMsg, profile, todayLogSummary);
      setMessages(m => [...m, { role: "ai", content: reply }]);
    } catch (err) {
      console.error("[ai] error", err);
      setMessages(m => [...m, { role: "ai", content: "No pude responder en este momento. Intenta de nuevo en unos segundos.\n\n⚠️ Si esto persiste, revisa tu conexión o inténtalo más tarde." }]);
    } finally {
      setLoading(false);
    }
  };

  if (profile.aiConsentRevoked) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-2xl text-foreground">Asistente IA</h1>
          <p className="text-muted-foreground text-sm">Orientación general de bienestar, no diagnósticos médicos.</p>
        </div>
        <div className="bg-card rounded-3xl border border-border p-8 text-center">
          <Info size={24} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium text-sm mb-1">Revocaste el consentimiento de IA</p>
          <p className="text-muted-foreground text-sm">Puedes reactivarlo desde Mi Perfil → Privacidad y datos cuando quieras volver a usar el asistente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 120px)" }}>
      <div className="mb-4">
        <h1 className="font-display text-2xl text-foreground">Asistente IA</h1>
        <p className="text-muted-foreground text-sm">Orientación general de bienestar, no diagnósticos médicos.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 flex items-start gap-2">
        <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-amber-700 text-xs leading-relaxed">
          Esta herramienta entrega <strong>información general de bienestar</strong> y no reemplaza la evaluación de un profesional de la salud. No realiza diagnósticos ni prescribe tratamientos.
        </p>
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {SUGGESTED_QUESTIONS.map(q => (
            <button key={q} onClick={() => send(q)} className="text-left px-4 py-3 bg-card border border-border rounded-2xl text-sm text-foreground hover:bg-secondary hover:border-primary transition-all">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 bg-card rounded-3xl border border-border p-5 overflow-y-auto space-y-4 mb-4" style={{ maxHeight: "50vh" }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-3`}>
            {msg.role === "ai" && (
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                <MessageSquare size={14} className="text-primary" />
              </div>
            )}
            <div className={`max-w-sm rounded-3xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <MessageSquare size={14} className="text-primary" />
            </div>
            <div className="bg-muted rounded-3xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-3">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send(input)}
          placeholder="Escribe tu pregunta de bienestar..."
          className="flex-1 bg-card border border-border rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition" />
        <button onClick={() => send(input)} disabled={!input.trim() || loading}
          className="w-12 h-12 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function HealthView({ profile, onProfileChange }: { profile: UserProfile; onProfileChange: (p: UserProfile) => void }) {
  const [form, setForm] = useState({
    age: profile.age, height: profile.height, weight: profile.weight,
    bloodPressure: profile.health.bloodPressure, glucose: profile.health.glucose,
    medications: profile.health.medications, notes: profile.health.notes,
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    const updated: UserProfile = {
      ...profile,
      age: form.age, height: form.height, weight: form.weight,
      health: { bloodPressure: form.bloodPressure, glucose: form.glucose, medications: form.medications, notes: form.notes },
    };
    await saveUserProfile(uid, updated);
    onProfileChange(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-foreground">Mi Salud</h1>
        <p className="text-muted-foreground text-sm">Información personal de salud. Todos los campos son opcionales.</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-start gap-2">
        <Lock size={13} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-blue-700 text-xs leading-relaxed">
          Esta información se almacena de forma segura y solo tú puedes acceder a ella. No se usa sin tu consentimiento explícito.
        </p>
      </div>

      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Datos personales</h3>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Edad", key: "age", placeholder: "34", unit: "años" },
            { label: "Altura", key: "height", placeholder: "165", unit: "cm" },
            { label: "Peso", key: "weight", placeholder: "68", unit: "kg" },
          ].map(({ label, key, placeholder, unit }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
              <div className="relative">
                <input value={(form as any)[key]} onChange={e => update(key, e.target.value)} placeholder={placeholder}
                  className="w-full bg-input-background rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-1">Mediciones opcionales</h3>
        <p className="text-xs text-muted-foreground mb-4">Registra solo si tienes indicación de tu médico.</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Presión arterial", key: "bloodPressure", placeholder: "120/80 mmHg" },
            { label: "Glucosa en ayuno", key: "glucose", placeholder: "90 mg/dL" },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
              <input value={(form as any)[key]} onChange={e => update(key, e.target.value)} placeholder={placeholder}
                className="w-full bg-input-background rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-1">Medicamentos o suplementos</h3>
        <p className="text-xs text-muted-foreground mb-3">Solo para referencia personal. No generamos prescripciones.</p>
        <textarea value={form.medications} onChange={e => update("medications", e.target.value)}
          placeholder="Ej: Vitamina D 1000 UI diaria, Omega 3..."
          className="w-full bg-input-background rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition resize-none h-20" />
      </div>

      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-3">Notas de salud</h3>
        <textarea value={form.notes} onChange={e => update("notes", e.target.value)}
          placeholder="Antecedentes relevantes, alergias u otra información que quieras recordar..."
          className="w-full bg-input-background rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition resize-none h-24" />
      </div>

      <button onClick={handleSave} disabled={saving}
        className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
        {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : saved ? <><CheckCircle size={16} /> Perfil guardado</> : "Guardar perfil de salud"}
      </button>
    </div>
  );
}

function ProfileView({ profile, onProfileChange, onLogout }: { profile: UserProfile; onProfileChange: (p: UserProfile) => void; onLogout: () => void }) {
  const [notifications, setNotifications] = useState({ morning: profile.reminders.morning, water: profile.reminders.water, evening: profile.reminders.evening, weekly: false });
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name);
  const [savingName, setSavingName] = useState(false);
  const [busyAction, setBusyAction] = useState<"consent" | "download" | null>(null);
  const [confirmAction, setConfirmAction] = useState<"deleteData" | "deleteAccount" | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [pushState, setPushState] = useState<"idle" | "loading" | "granted" | "denied" | "unsupported">(
    typeof Notification !== "undefined" && Notification.permission === "granted" ? "granted" : "idle"
  );
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testError, setTestError] = useState("");

  const handleToggleReminder = (key: "morning" | "water" | "evening" | "weekly") => {
    const next = !(notifications as any)[key];
    setNotifications(n => ({ ...n, [key]: next }));
    if (key === "weekly") return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const reminders = { ...profile.reminders, [key]: next };
    saveUserProfile(uid, { reminders });
    onProfileChange({ ...profile, reminders });
  };

  const handleEnablePush = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setPushState("loading");
    try {
      const result = await enablePushNotifications(uid);
      setPushState(result);
    } catch {
      setPushState("denied");
    }
  };

  const handleSendTest = async () => {
    setTestState("sending");
    setTestError("");
    try {
      await sendTestNotification();
      setTestState("sent");
      setTimeout(() => setTestState("idle"), 3000);
    } catch (e: any) {
      setTestError(e?.message ?? "No se pudo enviar la notificación de prueba.");
      setTestState("error");
    }
  };

  const displayName = profile.name.trim() || "Sin nombre";
  const email = auth.currentUser?.email ?? "";
  const creationTime = auth.currentUser?.metadata.creationTime;
  const memberSince = creationTime
    ? new Date(creationTime).toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    : "";

  const handleSaveName = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSavingName(true);
    const trimmed = nameInput.trim();
    await saveUserProfile(uid, { name: trimmed });
    if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: trimmed });
    onProfileChange({ ...profile, name: trimmed });
    setSavingName(false);
    setEditingName(false);
  };

  const handleToggleAIConsent = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setBusyAction("consent");
    const updated = { ...profile, aiConsentRevoked: !profile.aiConsentRevoked };
    await saveUserProfile(uid, { aiConsentRevoked: updated.aiConsentRevoked });
    onProfileChange(updated);
    setBusyAction(null);
  };

  const handleDownloadData = () => {
    setBusyAction("download");
    const exportData = {
      uid: auth.currentUser?.uid,
      email,
      memberSince: creationTime ?? null,
      profile,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "borquia-mis-datos.json";
    a.click();
    URL.revokeObjectURL(url);
    setBusyAction(null);
  };

  const handleDeleteData = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      await deleteUserProfile(uid);
      onProfileChange(EMPTY_PROFILE);
      setConfirmAction(null);
    } catch {
      setConfirmError("No se pudieron eliminar tus datos. Intenta nuevamente.");
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      await deleteUserProfile(user.uid);
      await deleteUser(user);
      // onAuthStateChanged picks up the deletion and returns to the landing page.
    } catch (e: any) {
      setConfirmError(
        e?.code === "auth/requires-recent-login"
          ? "Por seguridad, debes haber iniciado sesión recientemente para eliminar tu cuenta. Cierra sesión, vuelve a entrar y reinténtalo."
          : "No se pudo eliminar tu cuenta. Intenta nuevamente."
      );
      setConfirmLoading(false);
    }
  };

  const privacyItems = [
    { key: "download", label: "Descargar mis datos", icon: Shield, onClick: handleDownloadData, loading: busyAction === "download" },
    { key: "consent", label: profile.aiConsentRevoked ? "Reactivar consentimiento de IA" : "Revocar consentimiento de IA", icon: Info, onClick: handleToggleAIConsent, loading: busyAction === "consent" },
    { key: "deleteData", label: "Eliminar datos personales", icon: AlertCircle, danger: true, onClick: () => { setConfirmError(""); setConfirmAction("deleteData"); } },
    { key: "deleteAccount", label: "Eliminar mi cuenta", icon: X, danger: true, onClick: () => { setConfirmError(""); setConfirmAction("deleteAccount"); } },
  ];

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-foreground">Mi Perfil</h1>

      {/* User card */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-2xl shrink-0">
            👤
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} autoFocus
                onKeyDown={e => e.key === "Enter" && handleSaveName()}
                className="w-full bg-input-background rounded-xl px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
            ) : (
              <h2 className="font-semibold text-foreground">{displayName}</h2>
            )}
            <p className="text-muted-foreground text-sm">{email}</p>
            {memberSince && <p className="text-xs text-muted-foreground mt-0.5 capitalize">Miembro desde {memberSince}</p>}
          </div>
          {editingName ? (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => { setEditingName(false); setNameInput(profile.name); }} disabled={savingName}
                className="border border-border text-sm text-foreground px-3 py-2 rounded-xl hover:bg-muted transition-colors disabled:opacity-60">
                Cancelar
              </button>
              <button onClick={handleSaveName} disabled={savingName}
                className="bg-primary text-primary-foreground text-sm px-3 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-1.5">
                {savingName && <Loader2 size={14} className="animate-spin" />} Guardar
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="border border-border text-sm text-foreground px-4 py-2 rounded-xl hover:bg-muted transition-colors shrink-0">Editar</button>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Recordatorios</h3>
        <div className="space-y-3">
          {[
            { key: "morning", label: "Registro matutino", sub: "Para empezar el día con intención" },
            { key: "water", label: "Hidratación", sub: "Cada 2 horas durante el día" },
            { key: "evening", label: "Cierre del día", sub: "Para completar tu registro diario" },
            { key: "weekly", label: "Resumen semanal", sub: "Los domingos por la tarde" },
          ].map(({ key, label, sub }) => (
            <div key={key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
              <button onClick={() => handleToggleReminder(key as "morning" | "water" | "evening" | "weekly")}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${(notifications as any)[key] ? "bg-primary" : "bg-switch-background"}`}>
                <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" style={{ left: (notifications as any)[key] ? "22px" : "2px" }} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Push notifications */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-1">Notificaciones push</h3>
        <p className="text-xs text-muted-foreground mb-4">
          {pushState === "granted" ? "Activadas en este dispositivo. Recibirás tus recordatorios como notificaciones push." : "Actívalas para recibir tus recordatorios como notificaciones del navegador."}
        </p>
        {pushState === "unsupported" && (
          <p className="text-xs text-amber-600 mb-3">Tu navegador no soporta notificaciones push.</p>
        )}
        {pushState === "denied" && (
          <p className="text-xs text-red-600 mb-3">Permiso denegado. Habilítalo desde la configuración del navegador para este sitio.</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          {pushState !== "granted" && (
            <button onClick={handleEnablePush} disabled={pushState === "loading"}
              className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {pushState === "loading" && <Loader2 size={14} className="animate-spin" />} Activar notificaciones
            </button>
          )}
          {pushState === "granted" && (
            <button onClick={handleSendTest} disabled={testState === "sending"}
              className="flex-1 border border-border text-foreground font-medium py-2.5 rounded-xl hover:bg-muted transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {testState === "sending" && <Loader2 size={14} className="animate-spin" />}
              {testState === "sent" ? <><CheckCircle size={14} className="text-emerald-500" /> Enviada</> : "Enviar notificación de prueba"}
            </button>
          )}
        </div>
        {testState === "error" && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-red-600 text-xs leading-relaxed">{testError}</p>
          </div>
        )}
      </div>

      {/* Privacy */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Privacidad y datos</h3>
        <div className="space-y-2">
          {privacyItems.map(({ key, label, icon: Icon, danger, onClick, loading }) => (
            <button key={key} onClick={onClick} disabled={loading}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors disabled:opacity-60 ${danger ? "hover:bg-red-50 text-red-600" : "hover:bg-muted text-foreground"}`}>
              {loading ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : <Icon size={16} className={danger ? "text-red-500" : "text-muted-foreground"} />}
              <span className="text-sm">{label}</span>
              <ChevronRight size={14} className="ml-auto text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-3xl border border-border p-4">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          BorquIA · v1.0 · <span className="text-primary cursor-pointer hover:underline">Política de Privacidad</span> · <span className="text-primary cursor-pointer hover:underline">Términos</span>
        </p>
      </div>

      {confirmAction === "deleteData" && (
        <ConfirmDialog
          title="Eliminar datos personales"
          description="Se borrará tu perfil (nombre, edad, altura, peso, objetivos y datos de salud). Tu cuenta seguirá activa y podrás volver a completar tus datos cuando quieras."
          confirmLabel="Eliminar datos"
          danger
          loading={confirmLoading}
          error={confirmError}
          onConfirm={handleDeleteData}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === "deleteAccount" && (
        <ConfirmDialog
          title="Eliminar mi cuenta"
          description="Esta acción es permanente: se borrará tu cuenta y todos tus datos de BorquIA. No podrás deshacerlo."
          confirmLabel="Eliminar cuenta"
          danger
          loading={confirmLoading}
          error={confirmError}
          onConfirm={handleDeleteAccount}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 border border-border text-foreground py-3 rounded-2xl hover:bg-muted transition-colors text-sm font-medium">
        <LogOut size={15} /> Cerrar sesión
      </button>
    </div>
  );
}

// ── App Shell ──────────────────────────────────────────────────

const NAV_ITEMS = [
  { view: "dashboard" as View, label: "Inicio", Icon: Home },
  { view: "health" as View, label: "Mi Salud", Icon: Heart },
  { view: "goals" as View, label: "Objetivos", Icon: Target },
  { view: "day" as View, label: "Mi Día", Icon: Sun },
  { view: "stats" as View, label: "Estadísticas", Icon: BarChart2 },
  { view: "ai" as View, label: "Asistente IA", Icon: MessageSquare },
  { view: "profile" as View, label: "Perfil", Icon: User },
];

function AppShell({ view, profile, onProfileChange, onNavigate, onLogout }: { view: View; profile: UserProfile; onProfileChange: (p: UserProfile) => void; onNavigate: (v: View) => void; onLogout: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-card border-r border-border">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Heart size={15} className="text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground tracking-tight">BorquIA</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ view: v, label, Icon }) => (
            <button key={v} onClick={() => onNavigate(v)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${view === v ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <LogOut size={17} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-64 bg-card h-full flex flex-col shadow-xl">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
                  <Heart size={15} className="text-primary-foreground" />
                </div>
                <span className="font-semibold text-foreground">BorquIA</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {NAV_ITEMS.map(({ view: v, label, Icon }) => (
                <button key={v} onClick={() => { onNavigate(v); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${view === v ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <Icon size={17} /> {label}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden sticky top-0 z-40 bg-card/90 backdrop-blur border-b border-border px-4 h-14 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
              <Heart size={11} className="text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground text-sm">BorquIA</span>
          </div>
          <button onClick={() => onNavigate("profile")} className="text-muted-foreground hover:text-foreground">
            <User size={20} />
          </button>
        </header>

        <main className="flex-1 p-5 md:p-8 overflow-y-auto">
          {view === "dashboard" && <DashboardView profile={profile} onNavigate={onNavigate} />}
          {view === "health" && <HealthView profile={profile} onProfileChange={onProfileChange} />}
          {view === "goals" && <GoalsView />}
          {view === "day" && <DayView />}
          {view === "stats" && <StatsView />}
          {view === "ai" && <AIView profile={profile} />}
          {view === "profile" && <ProfileView profile={profile} onProfileChange={onProfileChange} onLogout={onLogout} />}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden sticky bottom-0 bg-card/95 backdrop-blur border-t border-border px-2 pb-safe">
          <div className="flex">
            {NAV_ITEMS.map(({ view: v, label, Icon }) => (
              <button key={v} onClick={() => onNavigate(v)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${view === v ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon size={20} />
                <span className="text-[9px] font-medium leading-none">{label.replace("Asistente ", "")}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

// ── Admin Panel ────────────────────────────────────────────────
// Independent panel, separate from the regular user nav. Reached via /admin.
// Never reads individual users' health/goals/daily-log content — only
// aggregate counts and account metadata, enforced server-side in Cloud Functions.

function AdminApp() {
  const [user, setUser] = useState<FirebaseUser | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");

  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const token = await u.getIdTokenResult(true);
        setIsAdmin(token.claims.admin === true);
      } else {
        setIsAdmin(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingData(true);
    setDataError("");
    Promise.all([fetchAdminStats(), fetchAdminUsers()])
      .then(([s, u]) => { setStats(s); setUsers(u); })
      .catch(() => setDataError("No se pudo cargar la información administrativa."))
      .finally(() => setLoadingData(false));
  }, [isAdmin]);

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
    } catch (e: any) {
      setAuthError(authErrorMessage(e?.code ?? ""));
    } finally {
      setAuthLoading(false);
    }
  };

  if (user === undefined || isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={28} className="text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-card rounded-3xl border border-border p-8">
          <h1 className="font-display text-2xl text-foreground mb-1">Panel Administrativo</h1>
          <p className="text-muted-foreground text-sm mb-6">Inicia sesión con tu cuenta de administrador.</p>
          <div className="space-y-3">
            <input type="email" value={authForm.email} onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))}
              placeholder="tu@correo.com" className="w-full bg-input-background rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
            <input type="password" value={authForm.password} onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="••••••••" className="w-full bg-input-background rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-ring transition" />
          </div>
          {authError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-red-600 text-xs leading-relaxed">{authError}</p>
            </div>
          )}
          <button onClick={handleLogin} disabled={authLoading}
            className="w-full mt-6 bg-primary text-primary-foreground font-semibold py-3.5 rounded-2xl hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {authLoading && <Loader2 size={16} className="animate-spin" />} Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-card rounded-3xl border border-border p-8 text-center">
          <AlertCircle size={24} className="text-red-500 mx-auto mb-3" />
          <p className="text-foreground font-medium text-sm mb-1">Sin acceso</p>
          <p className="text-muted-foreground text-sm mb-6">Tu cuenta no tiene permisos de administrador.</p>
          <button onClick={() => signOut(auth)} className="w-full border border-border text-foreground font-medium py-3 rounded-2xl hover:bg-muted transition-colors text-sm">
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Shield size={15} className="text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground tracking-tight">BorquIA · Panel Administrativo</span>
        </div>
        <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <LogOut size={15} /> Cerrar sesión
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {loadingData ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="text-primary animate-spin" />
          </div>
        ) : dataError ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-red-600 text-sm">{dataError}</div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: "Usuarios registrados", value: stats?.totalProfiles ?? 0, icon: User, color: "#6366f1" },
                { label: "Registros diarios totales", value: stats?.totalDailyLogs ?? 0, icon: Sun, color: "#147A60" },
                { label: "Objetivos creados", value: stats?.totalGoals ?? 0, icon: Target, color: "#0ea5e9" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-card rounded-3xl border border-border p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
                      <Icon size={15} style={{ color }} />
                    </div>
                  </div>
                  <span className="text-3xl font-bold text-foreground">{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-card rounded-3xl border border-border overflow-hidden">
              <div className="p-6 pb-4">
                <h2 className="font-semibold text-foreground">Usuarios ({users.length})</h2>
                <p className="text-xs text-muted-foreground mt-1">Solo datos de cuenta. No se muestra información de salud ni hábitos personales.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-6 py-3 font-medium">Nombre</th>
                      <th className="px-6 py-3 font-medium">Correo</th>
                      <th className="px-6 py-3 font-medium">Registrado</th>
                      <th className="px-6 py-3 font-medium">Último acceso</th>
                      <th className="px-6 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.uid} className="border-t border-border">
                        <td className="px-6 py-3 text-foreground">{u.displayName || "—"}</td>
                        <td className="px-6 py-3 text-muted-foreground">{u.email || "—"}</td>
                        <td className="px-6 py-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("es-CL")}</td>
                        <td className="px-6 py-3 text-muted-foreground">{new Date(u.lastSignIn).toLocaleDateString("es-CL")}</td>
                        <td className="px-6 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.disabled ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {u.disabled ? "Deshabilitado" : "Activo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────

export default function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/admin") {
    return <AdminApp />;
  }

  const [view, setView] = useState<View>("landing");
  const [appView, setAppView] = useState<View>("dashboard");
  const [inApp, setInApp] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);

  useEffect(() => {
    let initialCheck = true;
    const unsubscribe = onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      if (initialCheck) {
        // Page load: an existing session means a returning, already-onboarded user.
        if (user) {
          getUserProfile(user.uid).then(p => setProfile(p ?? EMPTY_PROFILE));
          setInApp(true);
          setAppView("dashboard");
        } else {
          setInApp(false);
          setView("landing");
        }
        setCheckingSession(false);
        initialCheck = false;
      } else if (!user) {
        // Explicit sign-out during the session.
        setInApp(false);
        setView("landing");
        setProfile(EMPTY_PROFILE);
      }
      // Sign-in/sign-up while already on the page is handled by handleAuthSuccess,
      // so it can route new users through onboarding first.
    });
    return unsubscribe;
  }, []);

  const handleStart = () => setView("auth");
  const handleAuthSuccess = (isNewUser: boolean) => {
    if (isNewUser) {
      setView("onboarding");
    } else {
      const uid = auth.currentUser?.uid;
      if (uid) getUserProfile(uid).then(p => setProfile(p ?? EMPTY_PROFILE));
      setInApp(true);
      setAppView("dashboard");
    }
  };
  const handleOnboardFinish = (newProfile: UserProfile) => {
    setProfile(newProfile);
    setInApp(true);
    setAppView("dashboard");
  };
  const handleLogout = () => signOut(auth);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={28} className="text-primary animate-spin" />
      </div>
    );
  }

  if (inApp) return <AppShell view={appView} profile={profile} onProfileChange={setProfile} onNavigate={setAppView} onLogout={handleLogout} />;
  if (view === "landing") return <LandingPage onStart={handleStart} />;
  if (view === "auth") return <AuthPage onSuccess={handleAuthSuccess} onBack={() => setView("landing")} />;
  if (view === "onboarding") return <OnboardingPage onFinish={handleOnboardFinish} />;
  return <LandingPage onStart={handleStart} />;
}
