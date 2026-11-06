"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { useSession } from "@/features/auth/session-provider";
import { loginRedirect } from "@/lib/auth/session";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const destination = loginRedirect(status);

  useEffect(() => {
    if (destination) {
      router.replace(destination);
    }
  }, [destination, router]);

  if (status === "loading" || destination) {
    return (
      <div className="grid min-h-screen place-items-center bg-page text-secondary" aria-live="polite">
        Checking your session
      </div>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-page px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-line bg-white p-6 shadow-card sm:p-8">
        <p className="font-display text-2xl font-extrabold tracking-tight">Ghartak</p>
        <h1 className="mt-6 font-display text-3xl font-extrabold">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-secondary">Manage the central catalogue, price, and stock.</p>
        <LoginForm />
      </section>
    </main>
  );
}
