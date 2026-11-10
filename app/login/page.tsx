"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type AuthResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  user?: {
    userId: number;
    name: string;
    email: string;
    role: "customer" | "admin";
  };
};

const inputClassName =
  "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const labelClassName = "block text-sm font-semibold text-slate-700";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { name, email, phone, address, password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result: AuthResponse = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.message ||
            result.error ||
            (mode === "login" ? "Login failed. Please check your details." : "Registration failed. Please try again.")
        );
      }

      if (mode === "register") {
        setMessage("Your account has been created. Sign in to continue.");
        setMode("login");
        setPassword("");
        return;
      }

      setMessage("Login successful. Taking you to your reservations…");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10 text-slate-900 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-100/70 blur-3xl"
      />

      <section className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.28)]">
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <header className="mb-8">
            <Link
              href="/"
              className="mb-5 inline-flex items-center text-sm font-semibold text-emerald-700 transition hover:text-emerald-800 hover:underline"
            >
              ← Back to VoltReserve
            </Link>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
              Smart charging platform
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              VoltReserve
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
              {mode === "login"
                ? "Welcome back. Sign in to manage your vehicles and charging reservations."
                : "Create your account to register your EV and reserve a charging point."}
            </p>
          </header>

          <div
            role="tablist"
            aria-label="Account access"
            className="mb-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1.5"
          >
            <button
              id="login-tab"
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              aria-controls="auth-panel"
              onClick={() => switchMode("login")}
              className={`rounded-lg px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                mode === "login"
                  ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Sign in
            </button>
            <button
              id="register-tab"
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              aria-controls="auth-panel"
              onClick={() => switchMode("register")}
              className={`rounded-lg px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                mode === "register"
                  ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Create account
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium leading-6 text-rose-800"
            >
              {error}
            </div>
          )}

          {message && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-800"
            >
              {message}
            </div>
          )}

          <form
            id="auth-panel"
            aria-labelledby={mode === "login" ? "login-tab" : "register-tab"}
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2"
          >
            {mode === "register" && (
              <>
                <div>
                  <label htmlFor="name" className={labelClassName}>
                    Full name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    autoComplete="name"
                    placeholder="Enter your full name"
                    required
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label htmlFor="phone" className={labelClassName}>
                    Phone number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={20}
                    autoComplete="tel"
                    placeholder="Enter your phone number"
                    required
                    className={inputClassName}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="address" className={labelClassName}>
                    Address <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <input
                    id="address"
                    name="address"
                    type="text"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    maxLength={255}
                    autoComplete="street-address"
                    placeholder="Street, area or city"
                    className={inputClassName}
                  />
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <label htmlFor="email" className={labelClassName}>
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
                required
                className={inputClassName}
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="password" className={labelClassName}>
                  Password
                </label>
                {mode === "register" && (
                  <span className="text-xs font-medium text-slate-500">8–72 characters</span>
                )}
              </div>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={72}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "Enter your password" : "Create a strong password"}
                required
                className={inputClassName}
              />
            </div>

            <div className="pt-1 sm:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign in to your account"
                    : "Create your account"}
              </button>
              <p className="mt-4 text-center text-sm text-slate-500">
                {mode === "login" ? "New to EV Charging? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => switchMode(mode === "login" ? "register" : "login")}
                  className="font-semibold text-emerald-700 underline-offset-4 hover:text-emerald-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  {mode === "login" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </div>
          </form>

          <footer className="mt-8 border-t border-slate-100 pt-5 text-center text-xs text-slate-500">
            Smart EV Charging Station Reservation System
          </footer>
        </div>
      </section>
    </main>
  );
}
