"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const tabs = [
  { href: "/categories", label: "All categories" },
  { href: "/categories/daily", label: "Your daily everything" },
] as const;

export default function CategoriesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (!tabs.some((tab) => tab.href === pathname)) {
    return children;
  }
  return (
    <div className="space-y-6">
      <nav aria-label="Category sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${active ? "border-ink text-ink" : "border-transparent text-muted"}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
