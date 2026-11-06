"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useSession } from "@/features/auth/session-provider";
import { navItems, titleForPath } from "./navigation";

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = titleForPath(pathname);
  const [open, setOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="min-h-screen bg-page text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="md:grid md:grid-cols-[240px_minmax(0,1fr)]">
        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-ink/30 md:hidden"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        ) : null}
        <aside
          id={drawerId}
          className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-line bg-white px-4 py-6 transition-transform md:static md:translate-x-0`}
        >
          <div className="flex items-start justify-between px-2">
            <div>
              <p className="font-display text-xl font-extrabold tracking-tight">Ghartak</p>
              <p className="mt-1 text-xs font-medium tracking-wide text-muted uppercase">Central catalogue</p>
            </div>
            <button type="button" className="rounded-lg p-1 text-secondary md:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Dashboard">
            {navItems.map((item) => {
              const active = pathname === item.href || (item.href !== "/overview" && pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "bg-lime text-ink" : "text-secondary hover:bg-wash"}`}
                >
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-page/95 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-line bg-white p-2 md:hidden"
                aria-expanded={open}
                aria-controls={drawerId}
                aria-label="Open navigation"
                onClick={() => setOpen(true)}
              >
                <Menu size={18} aria-hidden="true" />
              </button>
              <h1 className="font-display text-xl font-extrabold md:text-2xl">{title}</h1>
            </div>
            <AccountMenu />
          </header>
          <main id="main" className="px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function AccountMenu() {
  const { profile, signOut } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuId = useId();
  const label = profile?.name ?? "Administrator";

  async function onLogout() {
    setError(null);
    const ended = await signOut();
    if (!ended) {
      setError("Sign out could not be completed.");
      return;
    }
    router.replace("/login");
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="max-w-[46vw] rounded-xl border border-line bg-white px-3 py-2 text-left sm:max-w-xs"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="block truncate text-sm font-medium">{label}</span>
        {profile?.email ? <span className="block truncate text-xs text-muted">{profile.email}</span> : null}
      </button>
      {open ? (
        <div id={menuId} className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-line bg-white p-2 shadow-card">
          {error ? <p className="px-3 py-2 text-sm text-secondary">{error}</p> : null}
          <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-ink hover:bg-wash" onClick={() => void onLogout()}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
