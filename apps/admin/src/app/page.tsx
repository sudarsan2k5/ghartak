"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/features/auth/session-provider";
import { dashboardRedirect, loginRedirect } from "@/lib/auth/session";

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    const destination = loginRedirect(status) ?? dashboardRedirect(status);
    if (destination) {
      router.replace(destination);
    }
  }, [router, status]);

  return (
    <div className="grid min-h-screen place-items-center bg-page text-secondary" aria-live="polite">
      {status === "unavailable" ? "The admin service is unavailable." : "Opening the dashboard"}
    </div>
  );
}
