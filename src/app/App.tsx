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
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, updateProfile, getAdditionalUserInfo, type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

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
const SLEEP_DATA = [
  { day: "Lun", horas: 7.2 }, { day: "Mar", horas: 6.8 }, { day: "Mié", horas: 7.5 },
  { day: "Jue", horas: 8.0 }, { day: "Vie", horas: 6.5 }, { day: "Sáb", horas: 9.0 }, { day: "Dom", horas: 7.8 },
];
const ACTIVITY_DATA = [
  { day: "Lun", min: 35 }, { day: "Mar", min: 0 }, { day: "Mié", min: 45 },
  { day: "Jue", min: 30 }, { day: "Vie", min: 60 }, { day: "Sáb", min: 90 }, { day: "Dom", min: 20 },
];
const WATER_DATA = [
  { day: "Lun", vasos: 6 }, { day: "Mar", vasos: 8 }, { day: "Mié", vasos: 7 },
  { day: "Jue", vasos: 5 }, { day: "Vie", vasos: 9 }, { day: "Sáb", vasos: 8 }, { day: "Dom", vasos: 6 },
];
const MONTHLY_DATA = [
  { week: "Sem 1", sueño: 7.1, actividad: 28 }, { week: "Sem 2", sueño: 7.4, actividad: 35 },
  { week: "Sem 3", sueño: 6.9, actividad: 42 }, { week: "Sem 4", sueño: 7.8, actividad: 50 },
];
const GOALS_DATA = [
  { id: 1, title: "Mejorar hábitos de sueño", Icon: Moon, progress: 72, target: "8h de sueño diario", color: "#6366f1", started: "1 jun 2026", due: "31 ago 2026", status: "En progreso" },
  { id: 2, title: "Aumentar actividad física", Icon: Activity, progress: 55, target: "30 min/día de ejercicio", color: "#147A60", started: "15 jun 2026", due: "15 sep 2026", status: "En progreso" },
  { id: 3, title: "Mejorar hidratación", Icon: Droplets, progress: 88, target: "8 vasos de agua al día", color: "#0ea5e9", started: "1 jul 2026", due: "31 ago 2026", status: "Casi logrado" },
  { id: 4, title: "Bienestar general", Icon: Heart, progress: 40, target: "Registro diario completo", color: "#ec4899", started: "1 ago 2026", due: "31 oct 2026", status: "Iniciando" },
];

const SUGGESTED_QUESTIONS = [
  "¿Cómo puedo mejorar mi sueño?",
  "¿Qué puedo hacer para hidratarme mejor?",
  "¿Cómo empiezo a hacer más actividad física?",
  "¿Cómo mejorar mi alimentación esta semana?",
];

function getAIResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("sueño") || lower.includes("dormir") || lower.includes("descanso"))
    return "Para mejorar tu sueño, intenta mantener un horario constante para dormir y despertar, incluso los fines de semana. Reduce la exposición a pantallas al menos 1 hora antes de acostarte y asegúrate de que tu habitación esté oscura y fresca.\n\nTus registros muestran que en promedio duermes 7.5h, lo cual está muy cerca de tu objetivo de 8h. Un ajuste pequeño en tu hora de dormir podría marcar la diferencia.\n\n⚠️ Esta información es de carácter general y no reemplaza la evaluación de un especialista del sueño.";
  if (lower.includes("agua") || lower.includes("hidrat"))
    return "Para mantenerte bien hidratado, te recomiendo comenzar el día con un vaso de agua al despertar y llevar contigo una botella reutilizable durante el día. Establecer recordatorios cada 2 horas también ayuda mucho.\n\nEsta semana tu promedio ha sido de 7 vasos, muy cercano a tu objetivo. ¡Vas muy bien!\n\n⚠️ Esta información es general. Si tienes condiciones de salud que afecten tu hidratación, consulta con tu médico.";
  if (lower.includes("actividad") || lower.includes("ejercicio") || lower.includes("físic"))
    return "Para aumentar tu actividad física de forma sostenible, te recomiendo comenzar con 20-30 minutos de caminata tres veces por semana. La constancia es mucho más importante que la intensidad al inicio.\n\nTus mejores días de esta semana han sido los miércoles y viernes. ¿Podrías agregar un tercer día?\n\n⚠️ Consulta con un profesional de salud antes de iniciar una rutina de ejercicios intensa, especialmente si tienes condiciones previas.";
  if (lower.includes("aliment") || lower.includes("comer") || lower.includes("nutrición") || lower.includes("dieta"))
    return "Para mejorar tu alimentación, te recomiendo planificar tus comidas con anticipación e incluir vegetales de distintos colores en cada plato. Evitar saltarte comidas y mantener horarios regulares también tiene un gran impacto en tu energía y bienestar general.\n\nPara un plan personalizado y adaptado a tus necesidades específicas, lo ideal es consultar con un nutricionista certificado.\n\n⚠️ Esta información es general y no reemplaza la orientación de un profesional de nutrición.";
  return "Gracias por tu consulta. Basándome en tus hábitos registrados, te recomiendo enfocarte en pequeños cambios graduales y sostenibles. La consistencia es la clave del bienestar a largo plazo: pequeñas mejoras diarias generan grandes resultados en el tiempo.\n\nSi tienes dudas específicas sobre tu salud, consulta siempre con un profesional de la salud.\n\n⚠️ Esta herramienta entrega información general de bienestar y no reemplaza la evaluación de un profesional de la salud.";
}

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
            <span className="font-semibold text-foreground tracking-tight">Vitalia</span>
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
                  <p className="text-white font-semibold text-sm">Asistente Vitalia</p>
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
            <span className="font-semibold text-foreground text-sm">Vitalia</span>
          </div>
          <p className="text-muted-foreground text-xs">© 2026 Vitalia · Información general de bienestar · No es un servicio médico</p>
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
            <span className="font-semibold text-foreground">Vitalia</span>
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

function OnboardingPage({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({ name: "María", age: "34", height: "165", weight: "68", goals: ["Mejorar mi sueño", "Beber más agua"], habits: ["Sueño", "Agua", "Actividad física"], reminders: { morning: true, evening: true, water: true } });

  const toggleArr = (key: "goals" | "habits", val: string) => {
    setData(d => ({ ...d, [key]: d[key].includes(val) ? d[key].filter(x => x !== val) : [...d[key], val] }));
  };

  const steps = ["Bienvenida", "Información básica", "Tus objetivos", "Hábitos a seguir", "Recordatorios"];

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
              <h2 className="font-display text-3xl text-foreground mb-3">Bienvenido a Vitalia</h2>
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
            <button onClick={() => step < 5 ? setStep(s => s + 1) : onFinish()}
              className="flex-1 bg-primary text-primary-foreground font-semibold py-3 rounded-2xl hover:opacity-90 transition-opacity text-sm flex items-center justify-center gap-2">
              {step === 5 ? "Ver mi dashboard" : "Continuar"} <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App Views ──────────────────────────────────────────────────

function DashboardView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const today = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm capitalize">{today}</p>
          <h1 className="font-display text-2xl text-foreground">Buenos días, María 👋</h1>
        </div>
        <button onClick={() => onNavigate("day")} className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shrink-0 self-start">
          <Plus size={15} /> Registrar hoy
        </button>
      </div>

      {/* Wellness score */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-center gap-6">
          <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
            <WellnessRing value={78} size={100} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-bold text-2xl text-foreground leading-none">78</span>
              <span className="text-muted-foreground text-xs">/100</span>
            </div>
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1 flex-wrap">
              <h2 className="font-semibold text-foreground">Puntaje de bienestar</h2>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Muy bien</span>
            </div>
            <p className="text-muted-foreground text-sm mb-4">+5 puntos respecto a ayer. ¡Vas en la dirección correcta!</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Sueño", val: "7.5h", ok: true, icon: Moon },
                { label: "Agua", val: "3/8", ok: false, icon: Droplets },
                { label: "Actividad", val: "0 min", ok: false, icon: Activity },
                { label: "Ánimo", val: "😊", ok: true, icon: Smile },
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
          { icon: Moon, label: "Sueño", value: "7.5", unit: "horas", trend: "up" as const, color: "#6366f1", update: "Esta noche" },
          { icon: Droplets, label: "Hidratación", value: "3", unit: "/ 8 vasos", trend: "down" as const, color: "#0ea5e9", update: "Actualizar" },
          { icon: Activity, label: "Actividad", value: "0", unit: "min hoy", trend: "down" as const, color: "#147A60", update: "Registrar" },
          { icon: Scale, label: "Peso", value: "68.2", unit: "kg", trend: "stable" as const, color: "#F59E0B", update: "Hace 2 días" },
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
  const [water, setWater] = useState(3);
  const [sleep, setSleep] = useState(7.5);
  const [activity, setActivity] = useState(0);
  const [mood, setMood] = useState(4);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  const moods = [{ v: 1, e: "😞" }, { v: 2, e: "😕" }, { v: 3, e: "😐" }, { v: 4, e: "😊" }, { v: 5, e: "😄" }];

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-foreground">Mi Día</h1>
        <p className="text-muted-foreground text-sm">Jueves, 14 de agosto de 2026</p>
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
            <button onClick={() => setWater(Math.max(0, water - 1))} className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors font-bold text-lg">−</button>
            <div className="text-center">
              <span className="text-4xl font-bold text-foreground">{water}</span>
              <span className="text-muted-foreground text-sm"> / 8</span>
            </div>
            <button onClick={() => setWater(Math.min(8, water + 1))} className="w-10 h-10 rounded-full bg-sky-50 border-2 border-sky-200 flex items-center justify-center text-sky-500 hover:bg-sky-100 transition-colors font-bold text-lg">+</button>
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

      <button onClick={handleSave} className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
        {saved ? <><CheckCircle size={16} /> ¡Registro guardado!</> : "Guardar registro del día"}
      </button>
    </div>
  );
}

function GoalsView() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">Mis Objetivos</h1>
          <p className="text-muted-foreground text-sm">4 objetivos activos · agosto 2026</p>
        </div>
        <button className="flex items-center gap-2 border border-border text-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-muted transition-colors">
          <Plus size={15} /> Nuevo objetivo
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {GOALS_DATA.map(({ id, title, Icon, progress, target, color, started, due, status }) => (
          <div key={id} className="bg-card rounded-3xl border border-border p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${color}18` }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">{title}</h3>
                  <p className="text-xs text-muted-foreground">{target}</p>
                </div>
              </div>
              <span className="text-xs font-semibold" style={{ color }}>{progress}%</span>
            </div>
            <ProgressBar value={progress} color={color} />
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar size={11} /> Inicio: {started}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${progress >= 80 ? "bg-emerald-100 text-emerald-700" : progress >= 50 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                {status}
              </span>
            </div>
            {due && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock size={11} /> Meta: {due}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsView() {
  const [period, setPeriod] = useState<"week" | "month">("week");

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
          { label: "Sueño promedio", value: "7.5h", trend: "up", sub: "vs 7.1h semana anterior" },
          { label: "Actividad promedio", value: "40 min", trend: "up", sub: "vs 28 min semana anterior" },
          { label: "Hidratación promedio", value: "7 vasos", trend: "stable", sub: "Objetivo: 8 vasos" },
        ].map(({ label, value, trend, sub }) => (
          <div key={label} className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
            <div className="flex items-center gap-1">
              {trend === "up" ? <TrendingUp size={11} className="text-emerald-500" /> : null}
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
          <LineChart data={period === "week" ? SLEEP_DATA : MONTHLY_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey={period === "week" ? "day" : "week"} tick={{ fontSize: 11, fill: "#5E7A72" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#5E7A72" }} axisLine={false} tickLine={false} domain={[4, 10]} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="horas" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Activity chart */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-1">Actividad física</h3>
        <p className="text-xs text-muted-foreground mb-5">Minutos de actividad por día</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={period === "week" ? ACTIVITY_DATA : MONTHLY_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
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
        <p className="text-xs text-muted-foreground mb-5">Vasos de agua registrados</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={WATER_DATA} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
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

function AIView() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "ai", content: "Hola María 👋 Soy tu asistente de bienestar. Puedo orientarte con información general sobre hábitos saludables basándome en tus registros. ¿En qué te puedo ayudar hoy?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setMessages(m => [...m, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      setMessages(m => [...m, { role: "ai", content: getAIResponse(userMsg) }]);
      setLoading(false);
    }, 900);
  };

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

function HealthView() {
  const [form, setForm] = useState({ age: "34", height: "165", weight: "68.2", bloodPressure: "", glucose: "", medications: "", notes: "" });
  const [saved, setSaved] = useState(false);
  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

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

      <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
        className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
        {saved ? <><CheckCircle size={16} /> Perfil guardado</> : "Guardar perfil de salud"}
      </button>
    </div>
  );
}

function ProfileView({ onLogout }: { onLogout: () => void }) {
  const [notifications, setNotifications] = useState({ morning: true, water: true, evening: true, weekly: false });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-foreground">Mi Perfil</h1>

      {/* User card */}
      <div className="bg-card rounded-3xl border border-border p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-2xl">
          👩‍💼
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground">María García</h2>
          <p className="text-muted-foreground text-sm">maria@example.com</p>
          <p className="text-xs text-muted-foreground mt-0.5">Miembro desde agosto 2026</p>
        </div>
        <button className="border border-border text-sm text-foreground px-4 py-2 rounded-xl hover:bg-muted transition-colors">Editar</button>
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
              <button onClick={() => setNotifications(n => ({ ...n, [key]: !(n as any)[key] }))}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${(notifications as any)[key] ? "bg-primary" : "bg-switch-background"}`}>
                <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all" style={{ left: (notifications as any)[key] ? "22px" : "2px" }} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Privacy */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Privacidad y datos</h3>
        <div className="space-y-2">
          {[
            { label: "Descargar mis datos", icon: Shield },
            { label: "Revocar consentimiento de IA", icon: Info },
            { label: "Eliminar datos personales", icon: AlertCircle, danger: true },
            { label: "Eliminar mi cuenta", icon: X, danger: true },
          ].map(({ label, icon: Icon, danger }) => (
            <button key={label} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${danger ? "hover:bg-red-50 text-red-600" : "hover:bg-muted text-foreground"}`}>
              <Icon size={16} className={danger ? "text-red-500" : "text-muted-foreground"} />
              <span className="text-sm">{label}</span>
              <ChevronRight size={14} className="ml-auto text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-3xl border border-border p-4">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Vitalia · v1.0 · <span className="text-primary cursor-pointer hover:underline">Política de Privacidad</span> · <span className="text-primary cursor-pointer hover:underline">Términos</span>
        </p>
      </div>

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

function AppShell({ view, onNavigate, onLogout }: { view: View; onNavigate: (v: View) => void; onLogout: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-card border-r border-border">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Heart size={15} className="text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground tracking-tight">Vitalia</span>
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
                <span className="font-semibold text-foreground">Vitalia</span>
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
            <span className="font-semibold text-foreground text-sm">Vitalia</span>
          </div>
          <button onClick={() => onNavigate("profile")} className="text-muted-foreground hover:text-foreground">
            <User size={20} />
          </button>
        </header>

        <main className="flex-1 p-5 md:p-8 overflow-y-auto">
          {view === "dashboard" && <DashboardView onNavigate={onNavigate} />}
          {view === "health" && <HealthView />}
          {view === "goals" && <GoalsView />}
          {view === "day" && <DayView />}
          {view === "stats" && <StatsView />}
          {view === "ai" && <AIView />}
          {view === "profile" && <ProfileView onLogout={onLogout} />}
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

// ── App ────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [appView, setAppView] = useState<View>("dashboard");
  const [inApp, setInApp] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let initialCheck = true;
    const unsubscribe = onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      if (initialCheck) {
        // Page load: an existing session means a returning, already-onboarded user.
        if (user) { setInApp(true); setAppView("dashboard"); }
        else { setInApp(false); setView("landing"); }
        setCheckingSession(false);
        initialCheck = false;
      } else if (!user) {
        // Explicit sign-out during the session.
        setInApp(false);
        setView("landing");
      }
      // Sign-in/sign-up while already on the page is handled by handleAuthSuccess,
      // so it can route new users through onboarding first.
    });
    return unsubscribe;
  }, []);

  const handleStart = () => setView("auth");
  const handleAuthSuccess = (isNewUser: boolean) => {
    if (isNewUser) setView("onboarding");
    else { setInApp(true); setAppView("dashboard"); }
  };
  const handleOnboardFinish = () => { setInApp(true); setAppView("dashboard"); };
  const handleLogout = () => signOut(auth);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={28} className="text-primary animate-spin" />
      </div>
    );
  }

  if (inApp) return <AppShell view={appView} onNavigate={setAppView} onLogout={handleLogout} />;
  if (view === "landing") return <LandingPage onStart={handleStart} />;
  if (view === "auth") return <AuthPage onSuccess={handleAuthSuccess} onBack={() => setView("landing")} />;
  if (view === "onboarding") return <OnboardingPage onFinish={handleOnboardFinish} />;
  return <LandingPage onStart={handleStart} />;
}
