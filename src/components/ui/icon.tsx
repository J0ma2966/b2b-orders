import {
  Banknote,
  Bell,
  Boxes,
  Building,
  ChartLine,
  ClipboardList,
  ClockArrowLeft,
  Gift,
  House,
  LayoutDashboard,
  Menu,
  LogOut,
  Map,
  MapPin,
  Package,
  Percent,
  ReceiptText,
  Repeat2,
  ScrollText,
  Search,
  Settings,
  ShoppingCart,
  Siren,
  Store,
  Truck,
  Undo2,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./index";

// Меню хранит значки эмодзи (их видно и в старых местах). В навигации и шапке они рисуются
// линейными значками: одинаковая толщина, цвет темы, чёткие на любом экране.
const BY_EMOJI: Record<string, LucideIcon> = {
  "🏠": House,
  "🏭": Warehouse,
  "🛒": ShoppingCart,
  "📦": Package,
  "🔁": Repeat2,
  "💰": Wallet,
  "🧾": ReceiptText,
  "📍": MapPin,
  "👤": UserRound,
  "📊": LayoutDashboard,
  "📋": ClipboardList,
  "🏬": Boxes,
  "🎁": Gift,
  "🏪": Store,
  "🚚": Truck,
  "💵": Banknote,
  "↩️": Undo2,
  "📈": ChartLine,
  "🧮": Percent,
  "％": Percent,
  "🗺️": Map,
  "🏢": Building,
  "👥": Users,
  "☰": Menu,
  "🕘": ClockArrowLeft,
  "🔔": Bell,
  "⏻": LogOut,
  "🔍": Search,
  "📜": ScrollText,
  "⚙️": Settings,
  "🚨": Siren,
};

export function Icon({ emoji, className, strokeWidth = 2 }: { emoji?: string; className?: string; strokeWidth?: number }) {
  if (!emoji) return null;
  const Svg = BY_EMOJI[emoji];
  if (!Svg) return <span className={cn("leading-none", className)} aria-hidden>{emoji}</span>;
  return <Svg className={cn("size-5 shrink-0", className)} strokeWidth={strokeWidth} aria-hidden />;
}
