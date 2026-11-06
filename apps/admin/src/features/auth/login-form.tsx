"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginErrorMessage, loginFieldErrors, type LoginFieldErrors } from "@/lib/auth/login";
import { useSession } from "./session-provider";

export function LoginForm() {
  const router = useRouter();
  const { signIn, configError, client } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = loginFieldErrors({ email, password });
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) {
      return;
    }
    setPending(true);
    try {
      const result = await signIn({ email, password });
      if (!result.ok) {
        setFormError(loginErrorMessage(result));
        return;
      }
      setPassword("");
      router.replace("/overview");
    } catch {
      setFormError("The admin service is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
      {configError ? (
        <p className="rounded-xl border border-line bg-wash px-4 py-3 text-sm text-secondary" role="alert">
          {configError}
        </p>
      ) : null}
      {formError ? (
        <p className="rounded-xl border border-line bg-wash px-4 py-3 text-sm text-ink" role="alert">
          {formError}
        </p>
      ) : null}
      <div>
        <label className="text-sm font-medium text-ink" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldErrors.email !== undefined}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-ink"
        />
        {fieldErrors.email ? (
          <p id="email-error" className="mt-2 text-sm text-secondary">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium text-ink" htmlFor="password">
          Password
        </label>
        <div className="relative mt-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password !== undefined}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            className="w-full rounded-xl border border-line bg-white px-4 py-3 pr-14 text-ink"
          />
          <button
            type="button"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1 text-secondary"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
        {fieldErrors.password ? (
          <p id="password-error" className="mt-2 text-sm text-secondary">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending || client === null}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-ink font-display text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
