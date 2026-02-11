"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebaseClient";

type BillingStatus = "active" | "inactive";
type MemberRow = {
  uid: string;
  email: string;
  status: BillingStatus;
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodEndMs: number | null;
};

type ApiOk = { ok: true; members: MemberRow[] };
type ApiNg = { ok: false; error: string };

function toErrMsgFromResponseText(t: string, status: number): string {
  const s = (t ?? "").trim();
  if (s) return s;
  return `HTTP ${status}`;
}

async function readApiError(res: Response): Promise<string> {
  const status = res.status;
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();

  if (ct.includes("application/json")) {
    try {
      const j = (await res.json()) as unknown;
      if (typeof j === "object" && j !== null) {
        const o = j as Record<string, unknown>;
        const msg = typeof o.error === "string" ? o.error : "";
        const code = typeof o.errorCode === "string" ? o.errorCode : "";
        if (msg && code) return `${code}: ${msg}`;
        if (msg) return msg;
        if (code) return code;
      }
      return `HTTP ${status}`;
    } catch {
      // fallthrough
    }
  }

  try {
    const t = await res.text();
    return toErrMsgFromResponseText(t, status);
  } catch {
    return `HTTP ${status}`;
  }
}

function fmtDate(ms: number | null): string {
  if (!ms) return "-";
  const d = new Date(ms);
  return d.toLocaleString("ja-JP", { hour12: false });
}

export default function MembersPage() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const fetchRows = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error("未ログインです");

      const token = await u.getIdToken(true);
      const res = await fetch("/api/admin/members/list", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const msg = await readApiError(res);
        throw new Error(msg);
      }

      const json = (await res.json()) as ApiOk | ApiNg;
      if (!json.ok) {
        throw new Error(
          "error" in json && typeof json.error === "string" && json.error ? json.error : "取得失敗",
        );
      }

      setRows(json.members);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const doToggleCancel = useCallback(
    async (uid: string, cancelAtPeriodEnd: boolean) => {
      setErr("");
      try {
        const u = auth.currentUser;
        if (!u) throw new Error("未ログインです");

        const token = await u.getIdToken(true);
        const res = await fetch("/api/admin/members/cancel-at-period-end", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uid, cancelAtPeriodEnd }),
        });

        if (!res.ok) {
          const msg = await readApiError(res);
          throw new Error(msg);
        }

        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "更新に失敗しました");

        await fetchRows();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "更新に失敗しました");
      }
    },
    [fetchRows],
  );

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.email.localeCompare(b.email));
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">メンバー一覧（reNovaMember）</h1>
        <button
          type="button"
          onClick={fetchRows}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
        >
          再読み込み
        </button>
      </div>

      {err && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {err}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-left">email</th>
              <th className="px-3 py-2 text-left">uid</th>
              <th className="px-3 py-2 text-left">status</th>
              <th className="px-3 py-2 text-left">解約状態</th>
              <th className="px-3 py-2 text-left">期間満了</th>
              <th className="px-3 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4" colSpan={6}>
                  loading...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td className="px-3 py-4" colSpan={6}>
                  (no members)
                </td>
              </tr>
            ) : (
              sorted.map((m) => {
                const canOperate = m.status === "active" && m.stripeSubscriptionId;
                const isCancel = m.cancelAtPeriodEnd === true;
                const unknown = m.cancelAtPeriodEnd === null;

                return (
                  <tr key={m.uid} className="border-t dark:border-gray-800">
                    <td className="px-3 py-2">{m.email || "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.uid}</td>
                    <td className="px-3 py-2">{m.status}</td>
                    <td className="px-3 py-2">
                      {unknown ? "未同期" : isCancel ? "解約予定" : "継続中"}
                    </td>
                    <td className="px-3 py-2">{fmtDate(m.currentPeriodEndMs)}</td>
                    <td className="px-3 py-2">
                      {canOperate ? (
                        isCancel ? (
                          <button
                            type="button"
                            onClick={() => void doToggleCancel(m.uid, false)}
                            className="rounded-md border px-3 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                          >
                            解約取り消し
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void doToggleCancel(m.uid, true)}
                            className="rounded-md border px-3 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                          >
                            解約（期間満了）
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-gray-500">操作不可</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
