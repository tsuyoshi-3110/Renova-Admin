"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";

import { auth } from "@/lib/firebaseClient";

const LOGIN_PATH = "/login";

export default function AdminNavbar() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const isLoginPage = pathname === LOGIN_PATH;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 未ログインならログインページへ（ログインページ自身は除外）
  useEffect(() => {
    if (!authReady) return;
    if (!user && !isLoginPage) router.replace(LOGIN_PATH);
  }, [authReady, user, isLoginPage, router]);

  const isAuthed = !!user;

  const menuLinks = useMemo(
    () => [
      { href: "/", label: "アカウント作成" },
      { href: "/members", label: "メンバー一覧" },
    ],
    [],
  );

  async function handleLogout() {
    try {
      await signOut(auth);
    } finally {
      router.replace(LOGIN_PATH);
    }
  }

  return (
    <nav className="border-b bg-white shadow-sm dark:bg-gray-950 dark:border-gray-800">
      <div className="mx-auto h-14 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-full items-center justify-between gap-3">
          <Link
            href={isAuthed ? "/renova-admin/managers" : LOGIN_PATH}
            className="text-lg font-bold text-blue-600 dark:text-blue-400"
          >
            Renova Admin
          </Link>

          <div className="flex items-center gap-3">
            {isAuthed ? (
              <>
                <div className="hidden items-center gap-6 md:flex">
                  {menuLinks.map((m) => (
                    <Link
                      key={m.href}
                      href={m.href}
                      className="text-gray-700 hover:text-blue-600 transition-colors dark:text-gray-200 dark:hover:text-blue-400"
                    >
                      {m.label}
                    </Link>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  ログアウト
                </button>
              </>
            ) : (
              <Link
                href={LOGIN_PATH}
                className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                ログイン
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
