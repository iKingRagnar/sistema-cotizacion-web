import {
  Activity,
  Award,
  BarChart3,
  Building2,
  ClipboardList,
  Clock,
  Cog,
  FileSpreadsheet,
  Gauge,
  LayoutDashboard,
  MapPinned,
  Package,
  Plane,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  UserCircle2,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
};

export const mainNav: NavItem[] = [
  { href: "/", label: "Tablero", icon: LayoutDashboard, description: "KPIs y tendencias" },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/prospectos", label: "Prospectos", icon: MapPinned, description: "Mapa y pipeline" },
  { href: "/refacciones", label: "Refacciones", icon: Package },
  { href: "/maquinas", label: "Máquinas", icon: Cog },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileSpreadsheet },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/viajes", label: "Viajes (viáticos)", icon: Plane },
  { href: "/revision-maquinas", label: "Revisión máquinas", icon: ClipboardList },
  { href: "/tarifas", label: "Tarifas", icon: Gauge },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/garantias", label: "Garantías", icon: ShieldCheck },
  { href: "/mantenimientos", label: "Mantenimientos", icon: Wrench },
  { href: "/sin-cobertura", label: "Sin cobertura", icon: ShieldAlert },
  { href: "/bonos", label: "Bonos", icon: Award },
  { href: "/personal", label: "Personal / Técnicos", icon: UserCircle2 },
  { href: "/bitacora", label: "Bitácora de horas", icon: Clock },
  { href: "/auditoria", label: "Auditoría", icon: Activity },
];
