import { useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "../api/auth";

type AuthMode = "sign-in" | "sign-up";

export function AccountControl() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    close();
  };

  return (
    <>
      <div className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/95 p-2 text-sm text-neutral-100 shadow-xl backdrop-blur">
        {isPending ? (
          <span className="px-2 text-neutral-500">Checking account…</span>
        ) : session === null ? (
          <>
            <span className="hidden px-2 text-neutral-500 sm:inline">Browsing anonymously</span>
            <button
              type="button"
              onClick={() => setMode("sign-in")}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium hover:bg-emerald-500"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            <span className="max-w-48 truncate px-2 text-neutral-300">{session.user.email}</span>
            <button
              type="button"
              onClick={() => void authClient.signOut()}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Sign out
            </button>
          </>
        )}
      </div>

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
