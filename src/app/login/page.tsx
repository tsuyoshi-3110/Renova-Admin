"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace("/");
    });
    return () => unsub();
  }, [router]);

  return (
    <main className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">
            ReNova-admin ログイン
          </h1>

          {err && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm font-semibold text-red-700">{err}</p>
            </div>
          )}

          <div className="mt-5 grid gap-3">
            <div>
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                メール
              </div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border px-3 py-3 text-base font-bold text-gray-900 outline-none
                           dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                placeholder="admin@example.com"
                inputMode="email"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                パスワード
              </div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-xl border px-3 py-3 text-base font-bold text-gray-900 outline-none
                           dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                placeholder="******"
                type="password"
                autoComplete="current-password"
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setErr("");
                const em = email.trim();
                if (!em || !password) {
                  setErr("メールとパスワードを入力してください。");
                  return;
                }
                try {
                  setBusy(true);
                  await signInWithEmailAndPassword(auth, em, password);
                  router.replace("/");
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "ログインに失敗しました。";
                  setErr(msg);
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-2 w-full rounded-2xl bg-gray-900 px-4 py-3 text-base font-extrabold text-white disabled:opacity-50
                         dark:bg-gray-100 dark:text-gray-900"
            >
              {busy ? "ログイン中..." : "ログイン"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
