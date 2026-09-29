import {
  ArrowDownLeft,
  ArrowLeftRight,
  BookOpen,
  Car,
  Clapperboard,
  HeartPulse,
  MoreHorizontal,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Utensils,
} from "lucide-react";
import { categoryColour, categoryPastel } from "../lib/categories";

const ICONS = {
  utensils: Utensils,
  cart: ShoppingCart,
  car: Car,
  bag: ShoppingBag,
  film: Clapperboard,
  receipt: Receipt,
  book: BookOpen,
  heart: HeartPulse,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  other: MoreHorizontal,
};

const SIZES = {
  xs: { box: "h-8 w-8 rounded-[10px]", icon: 15 },
  sm: { box: "h-9 w-9 rounded-[12px]", icon: 17 },
  md: { box: "h-11 w-11 rounded-[14px]", icon: 20 },
  lg: { box: "h-14 w-14 rounded-[18px]", icon: 24 },
};

/**
 * Soft tinted tile in the category's identity colour, readable in both themes.
 * The "pastel" variant is the playful Home style: a flat pastel tile with an ink glyph.
 */
export function CategoryIcon({
  name,
  icon,
  colour,
  size = "md",
  variant = "pastel",
}: {
  name?: string;
  icon: string;
  colour?: string;
  size?: keyof typeof SIZES;
  variant?: "tint" | "pastel";
}) {
  const Icon = ICONS[icon as keyof typeof ICONS] ?? MoreHorizontal;
  const tint = categoryColour(name ?? "", colour);
  const { box, icon: iconSize } = SIZES[size];
  if (variant === "pastel") {
    return (
      <span aria-hidden="true" className={`grid shrink-0 place-items-center text-pastel-ink ${box}`} style={{ backgroundColor: categoryPastel(name ?? "") }}>
        <Icon size={iconSize} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center ${box}`}
      style={{
        backgroundColor: `color-mix(in oklab, ${tint} var(--icon-tint), var(--surface))`,
        color: `color-mix(in oklab, ${tint} var(--icon-ink), var(--ink))`,
      }}
    >
      <Icon size={iconSize} strokeWidth={1.9} />
    </span>
  );
}
