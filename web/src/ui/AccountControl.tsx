import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "../api/auth";
import { useLibrary } from "../store/library";

type AuthMode = "sign-in" | "sign-up";

/** Two-letter monogram for the avatar: initials from the name, else the email. */
function avatarInitials(user: { name?: string | null; email: string }): string {
  const name = (user.name ?? "").trim();
  if (name !== "") {
    const parts = name.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

/**
 * Account control that lives inline in a route header (right-side cluster).
 * Signed out it is a single "Sign in" button; signed in it collapses to an
 * initials avatar that opens a dropdown menu. The sign-in/up modal is rendered
 * as a centred overlay, unchanged from when this was a floating widget.
 */
export function AccountControl() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss the avatar menu on outside pointerdown or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const close = (): void => {
    setMode(null);
    setError(null);
    setPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (mode === null) return;

    setSubmitting(true);
    setError(null);
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    setSubmitting(false);

    if (result.error !== null) {
      setError(result.error.message ?? "Authentication failed.");
      return;
    }

    await refetch();
    await useLibrary.getState().load();
    close();
  };

  return (
    <>
      {isPending ? (
        <div
          className="h-8 w-8 rounded-full border border-neutral-700 bg-neutral-800"
          aria-hidden="true"
        />
      ) : session === null ? (
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600/15"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
          </svg>
          Sign in
        </button>
      ) : (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            title={session.user.email}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-600/70 bg-emerald-900/40 text-xs font-medium text-emerald-200 hover:border-emerald-500 hover:text-emerald-100"
          >
            {avatarInitials(session.user)}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-neutral-700 bg-neutral-900 p-1.5 text-sm shadow-2xl"
            >
              <div className="border-b border-neutral-800 px-2.5 py-2">
                <div className="text-xs text-neutral-500">Signed in as</div>
                <div className="truncate text-neutral-200">{session.user.email}</div>
              </div>
              <Link
                to="/stats"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="mt-1 block rounded-lg px-2.5 py-2 text-neutral-300 hover:bg-neutral-800 hover:text-white"
              >
                Stats
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void authClient.signOut().then(async () => {
                    await refetch();
                    await useLibrary.getState().load();
                  });
                }}
                className="block w-full rounded-lg px-2.5 py-2 text-left text-rose-300 hover:bg-neutral-800 hover:text-rose-200"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}

      {mode !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-title"
            className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="account-title" className="text-lg font-semibold">
                {mode === "sign-up" ? "Create account" : "Sign in"}
              </h2>
              <button type="button" onClick={close} className="text-neutral-500 hover:text-white">
                Close
              </button>
            </div>

            <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
              {mode === "sign-up" && (
                <label className="text-sm text-neutral-300">
                  Name
                  <input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-emerald-600"
                  />
                </label>
              )}
              <label className="text-sm text-neutral-300">
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-emerald-600"
                />
              </label>
              <label className="text-sm text-neutral-300">
                Password
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-emerald-600"
                />
              </label>

              {error !== null && <p className="text-sm text-rose-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="mt-1 rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "sign-up" ? "sign-in" : "sign-up");
                setError(null);
              }}
              className="mt-4 w-full text-sm text-neutral-400 hover:text-white"
            >
              {mode === "sign-up" ? "Already have an account? Sign in" : "Create an account"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
