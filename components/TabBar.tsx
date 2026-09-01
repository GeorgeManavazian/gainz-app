// components/TabBar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const icon = {
  hub: <path d="M3 11 L12 3 L21 11 M6 10 V20 H18 V10" />,
  diet: <path d="M7 3 V11 M5 3 V7 M9 3 V7 M7 11 V21 M16 3 C14 3 14 8 16 10 V21 M16 10 C18 8 18 3 16 3" />,
  perf: <path d="M4 20 V14 M10 20 V9 M16 20 V12 M22 20 V5" />,
};

const TABS = [
  { href: "/", label: "HUB", d: icon.hub },
  { href: "/diet", label: "DIET", d: icon.diet },
  { href: "/performance", label: "PERFORMANCE", d: icon.perf },
] as const;

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex rounded-full border border-border bg-surface p-1.5 shadow-2xl">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-semibold ${
                active ? "bg-accent/20 text-accent" : "text-muted active:text-foreground"}`}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{t.d}</svg>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
