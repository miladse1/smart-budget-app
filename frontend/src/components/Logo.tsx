/** BudgetFlow monogram: a lowercase "b" made of a stem and a lime ring, on a forest tile. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect width="512" height="512" rx="116" fill="#173D2F" />
      <circle cx="257" cy="300" r="92" fill="none" stroke="#C8EC62" strokeWidth="60" />
      <rect x="135" y="96" width="60" height="326" rx="30" fill="#F2F1EB" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[17px] font-semibold tracking-[-0.03em]">BudgetFlow</span>
    </span>
  );
}
