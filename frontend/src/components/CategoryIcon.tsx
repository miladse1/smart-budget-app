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

export function CategoryIcon({ name, colour }: { name: string; colour: string }) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? MoreHorizontal;
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
      style={{ backgroundColor: `${colour}1A`, color: colour }}
    >
      <Icon size={15} aria-hidden="true" />
    </span>
  );
}
