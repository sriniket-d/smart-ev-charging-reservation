
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AuthResponse = {
  success: boolean;
  message?: string;
  user?: {
    userId: number;
    name: string;
    email: string;
    role: "customer" | "admin";
  };
};

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";

      const body =
        mode === "login"
          ? { email, password }
          : { name, email, phone, address, password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result: AuthResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            (mode === "login" ? "Login failed." : "Registration failed.")
        );
      }

      if (mode === "register") {
        setMessage("Registration successful. You can now log in.");
        setMode("login");
        setPassword("");
        return;
      }

      setMessage("Login successful. Redirecting...");
      router.push("/reservations");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <section className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold text-gray-900">
          EV Charging
        </h1>

        <p className="mt-2 text-gray-600">
          Sign in or create an account to reserve a charging point.
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
              setMessage("");
            }}
            className={`rounded-md px-4 py-2 font-medium ${
              mode === "login"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-600"
            }`}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
              setMessage("");
            }}
            className={`rounded-md px-4 py-2 font-medium ${
              mode === "register"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-600"
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-red-700"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-green-700"
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "register" && (
            <>
              <div>
                <label htmlFor="name" className="mb-1 block font-medium">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  autoComplete="name"
                  required
                  className="w-full rounded border p-2"
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-1 block font-medium">
                  Phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={20}
                  autoComplete="tel"
                  required
                  className="w-full rounded border p-2"
                />
              </div>

              <div>
                <label htmlFor="address" className="mb-1 block font-medium">
                  Address (optional)
                </label>
                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  maxLength={255}
                  autoComplete="street-address"
                  className="w-full rounded border p-2"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block font-medium">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              autoComplete="email"
              required
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              className="w-full rounded border p-2"
            />
            {mode === "register" && (
              <p className="mt-1 text-xs text-gray-500">
                Use at least 8 characters.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Smart EV Charging Station Reservation System
        </p>
      </section>
    </main>
  );
}
