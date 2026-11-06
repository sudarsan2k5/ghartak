"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { dashboardRedirect } from "@/lib/auth/session";
import { useSession } from "./session-provider";

export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const redirect = dashboardRedirect(status);

  useEffect(() => {
    if (redirect) {
      router.replace(redirect);
    }
  }, [redirect, router]);

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-page text-secondary" aria-live="polite">
        Checking your session
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="grid min-h-screen place-items-center bg-page px-6">
        <section className="max-w-md rounded-2xl border border-line bg-white p-6 shadow-card" role="alert">
          <h1 className="font-display text-xl font-extrabold">Admin service unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-secondary">The dashboard could not confirm your session. Try again when the API is reachable.</p>
        </section>
      </div>
    );
  }

  if (redirect) {
    return (
      <div className="grid min-h-screen place-items-center bg-page text-secondary" aria-live="polite">
        Returning to sign in
      </div>
    );
  }

  return <DashboardShell>{children}</DashboardShell>;
}
