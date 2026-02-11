"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";
import { AsYouType } from "libphonenumber-js";

type BillingMode = "free" | "paid";

type CreateUserResponse =
  | { ok: true; uid: string }
  | { ok: false; error: string };

async function authedPost(path: string, body: unknown): Promise<unknown> {
  const u = auth.currentUser;
  if (!u) throw new Error("未ログインです。");

  const token = await u.getIdToken(true);

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json: unknown = await res.json();
  if (!res.ok) {
    const err =
      typeof (json as { error?: unknown })?.error === "string"
        ? (json as { error: string }).error
        : "error";
    throw new Error(err);
  }
  return json;
}

function normalizePhone(s: string): string {
  return s.replace(/[^\d+]/g, "").trim();
}

export default function AdminHomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // --- create user form ---
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [billingMode, setBillingMode] = useState<BillingMode>("paid");
  const [creating, setCreating] = useState(false);

  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });
    return () => unsub();
  }, [router]);

  if (!ready) return null;

  return (
    <main className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">
              アカウント作成
            </h1>
          </div>
        </div>

        {msg && (
          <div className="mt-4 rounded-2xl border bg-white p-4 text-sm font-bold text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
            {msg}
          </div>
        )}

        <div className="mt-6 grid gap-4">
          {/* Create user */}
          <section className="rounded-2xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="text-lg font-extrabold text-gray-900 dark:text-gray-100">
              ユーザー作成
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  氏名
                </div>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-base font-bold text-gray-900 outline-none
                             dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  placeholder="例）山田 太郎"
                />
              </div>

              <div>
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  携帯番号（ハイフン不要）
                </div>
                <input
                  value={phone}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // 日本として入力中フォーマット（ハイフン付き）を作る
                    const formatted = new AsYouType("JP").input(raw);
                    setPhone(formatted);
                  }}
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-base font-bold text-gray-900 outline-none
             dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  placeholder="例）090-1234-5678"
                  inputMode="tel"
                />
              </div>

              <div>
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  所属会社名
                </div>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-base font-bold text-gray-900 outline-none
                             dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  placeholder="例）TSリフォーム"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  住所
                </div>
                <input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-base font-bold text-gray-900 outline-none
                             dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  placeholder="例）大阪府○○市..."
                />
              </div>

              <div>
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  メール
                </div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-base font-bold text-gray-900 outline-none
                             dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  placeholder="user@example.com"
                  inputMode="email"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  初期パスワード
                </div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-base font-bold text-gray-900 outline-none
                             dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  placeholder="6文字以上"
                  type="password"
                  autoComplete="new-password"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  課金モード
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBillingMode("paid")}
                    className={`rounded-xl border px-3 py-2 text-sm font-extrabold ${
                      billingMode === "paid"
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100 dark:border-gray-800"
                    }`}
                  >
                    paid（サブスク必要）
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingMode("free")}
                    className={`rounded-xl border px-3 py-2 text-sm font-extrabold ${
                      billingMode === "free"
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100 dark:border-gray-800"
                    }`}
                  >
                    free（無課金OK）
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={creating}
              onClick={async () => {
                setMsg("");

                const em = email.trim();
                const nm = fullName.trim();
                const ph = phone.trim();
                const cn = companyName.trim();
                const addr = companyAddress.trim();

                if (!nm) return setMsg("氏名（必須）を入力してください。");
                if (!ph) return setMsg("携帯番号（必須）を入力してください。");
                if (!cn)
                  return setMsg("所属会社名（必須）を入力してください。");
                if (!addr) return setMsg("住所（必須）を入力してください。");
                if (!em) return setMsg("メール（必須）を入力してください。");
                if (!password || password.length < 6)
                  return setMsg("パスワードは6文字以上にしてください。");

                try {
                  setCreating(true);

                  const jsonUnknown = await authedPost(
                    "/api/admin/create-user",
                    {
                      email: em,
                      password,
                      fullName: nm,
                      phone: normalizePhone(ph),
                      companyName: cn,
                      companyAddress: addr,
                      billingMode,
                    },
                  );

                  const json = jsonUnknown as CreateUserResponse;
                  if (!("ok" in json) || json.ok !== true) {
                    throw new Error("作成に失敗しました（レスポンス不正）。");
                  }

                  setMsg(
                    `作成しました。uid=${json.uid}（billing=${billingMode}）`,
                  );

                  // reset
                  setFullName("");
                  setPhone("");
                  setCompanyName("");
                  setCompanyAddress("");
                  setEmail("");
                  setPassword("");
                } catch (e) {
                  setMsg(
                    e instanceof Error ? e.message : "作成に失敗しました。",
                  );
                } finally {
                  setCreating(false);
                }
              }}
              className="mt-4 w-full rounded-2xl bg-gray-900 px-4 py-3 text-base font-extrabold text-white disabled:opacity-50
                         dark:bg-gray-100 dark:text-gray-900"
            >
              {creating ? "作成中..." : "作成"}
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
