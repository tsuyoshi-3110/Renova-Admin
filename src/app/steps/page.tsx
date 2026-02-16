"use client";

import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";

// ✅ DnD
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Step = {
  id: string;
  name: string;
  order: number;
};

type PublicWorkTemplate = {
  workTypeId: string;
  title: string;
  steps: Step[];
  updatedAt?: Timestamp;
};

type WorkTypeCodeDoc = {
  label: string;
  order: number;
  enabled: boolean;
  updatedAt?: Timestamp;
};

type TemplateMeta = {
  id: string;
  title: string;
  updatedAtLabel: string;
};

type WorkTypeRow = {
  id: string; // ✅ 選択キー（= documentID）
  label: string;
  order: number;
  enabled: boolean;
  source: "codes" | "templates" | "both";
};

const COL_CODES = "proclinkWorkTypeCodes";
const COL_TEMPLATES = "publicWorkTemplates";

function uid() {
  return `st_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function normStr(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}
function normNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function normBool(v: unknown, fallback = true) {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * ✅ 配列順のまま order を 1..n に振り直す（DnD/追加/削除の後に使う）
 * ここでは sort しない。これが重要。
 */
function renumberByArrayOrder(steps: Step[]): Step[] {
  const normalized = steps.map((s) => ({
    id: String(s.id || uid()),
    name: typeof s.name === "string" ? s.name : String(s.name ?? ""),
    order: Number.isFinite(s.order) ? s.order : 0,
  }));
  return normalized.map((s, i) => ({ ...s, order: i + 1 }));
}

/** ✅ ロード時だけ order を信用して整列 → 配列順に採番 */
function renumberFromOrder(steps: Step[]): Step[] {
  const sorted = steps
    .map((s) => ({
      id: String(s.id || uid()),
      name: typeof s.name === "string" ? s.name : String(s.name ?? ""),
      order: Number.isFinite(s.order) ? s.order : 0,
    }))
    .slice()
    .sort((a, b) => a.order - b.order);
  return renumberByArrayOrder(sorted);
}

/** ✅ 保存用：空欄除外 + trim + 今の並び（配列順）で採番 */
function normalizeStepsForSave(steps: Step[]): Step[] {
  const cleaned = steps
    .map((s) => ({
      id: String(s.id || uid()),
      name: String(s.name || "").trim(),
      order: Number.isFinite(s.order) ? s.order : 0,
    }))
    .filter((s) => s.name.length > 0);
  return cleaned.map((s, i) => ({ ...s, order: i + 1 }));
}

/** ✅ 1行分（Sortable Item） */
function SortableStepRow(props: {
  step: Step;
  index: number;
  onChangeName: (id: string, v: string) => void;
  onDelete: (id: string) => void;
}) {
  const { step: s, index, onChangeName, onDelete } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "grid gap-2 rounded-lg border p-2",
        "md:grid-cols-[120px_1fr_96px]",
        "bg-white dark:bg-gray-950 dark:border-gray-800",
        isDragging ? "shadow" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          #{index + 1}
        </div>

        {/* ✅ ドラッグハンドル */}
        <button
          type="button"
          className="h-8 w-8 rounded-md border text-sm leading-none
                     bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800
                     text-gray-900 dark:text-gray-100"
          aria-label="ドラッグして並び替え"
          {...attributes}
          {...listeners}
          style={{ touchAction: "none" }}
          title="ドラッグして並び替え"
        >
          ≡
        </button>
      </div>

      <textarea
        rows={2}
        className="rounded-md border px-3 py-2 leading-5 resize-none
                   bg-white dark:bg-gray-900 dark:border-gray-700
                   text-gray-900 dark:text-gray-100
                   placeholder:text-gray-400 dark:placeholder:text-gray-500"
        value={s.name}
        onChange={(e) => onChangeName(s.id, e.target.value)}
        placeholder="工程名（2行まで）"
      />

      <button
        type="button"
        className="h-10 rounded-md border text-sm
                   bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800
                   text-gray-900 dark:text-gray-100"
        onClick={() => onDelete(s.id)}
      >
        削除
      </button>
    </div>
  );
}

export default function WorkSettingsPage() {
  // -----------------------------
  // auth
  // -----------------------------
  const [authReady, setAuthReady] = useState(false);
  const [userUid, setUserUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserUid(u?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const requireLogin = () => {
    if (!userUid) {
      alert("ログインしてください。");
      return false;
    }
    return true;
  };

  // -----------------------------
  // codes（マスタ）: onSnapshot
  // -----------------------------
  const [codesMap, setCodesMap] = useState<Map<string, WorkTypeCodeDoc>>(
    new Map(),
  );

  useEffect(() => {
    const qy = query(collection(db, COL_CODES), orderBy("order", "asc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const m = new Map<string, WorkTypeCodeDoc>();
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          m.set(d.id, {
            label: normStr(data.label, d.id),
            order: normNum(data.order, 0),
            enabled: normBool(data.enabled, true),
          });
        });
        setCodesMap(m);
      },
      (e) => console.error(e),
    );
    return () => unsub();
  }, []);

  // -----------------------------
  // templates（既存資産も必ず拾う）
  // - 一覧用に title を持っておく（label補完のため）
  // -----------------------------
  const [templatesMeta, setTemplatesMeta] = useState<Map<string, TemplateMeta>>(
    new Map(),
  );
  const [loadingTemplatesMeta, setLoadingTemplatesMeta] = useState(true);

  const loadTemplatesMeta = async () => {
    setLoadingTemplatesMeta(true);
    try {
      const snap = await getDocs(collection(db, COL_TEMPLATES));
      const m = new Map<string, TemplateMeta>();
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const title = normStr(data.title, d.id);
        const ts = data.updatedAt instanceof Timestamp ? data.updatedAt : null;
        m.set(d.id, {
          id: d.id,
          title,
          updatedAtLabel: ts ? ts.toDate().toLocaleString() : "",
        });
      });
      setTemplatesMeta(m);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTemplatesMeta(false);
    }
  };

  useEffect(() => {
    void loadTemplatesMeta();
  }, []);

  // -----------------------------
  // merged work types（codes + templates）
  // -----------------------------
  const workTypes: WorkTypeRow[] = useMemo(() => {
    const ids = new Set<string>();

    // codes の id
    codesMap.forEach((_, id) => ids.add(id));
    // templates の id
    templatesMeta.forEach((_, id) => ids.add(id));

    const rows: WorkTypeRow[] = [];
    ids.forEach((id) => {
      const c = codesMap.get(id);
      const t = templatesMeta.get(id);

      const source: WorkTypeRow["source"] =
        c && t ? "both" : c ? "codes" : "templates";
      const label = c?.label ?? t?.title ?? id;
      const order = c?.order ?? 999999;
      const enabled = c?.enabled ?? true;

      rows.push({ id, label, order, enabled, source });
    });

    rows.sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : 999999;
      const bo = Number.isFinite(b.order) ? b.order : 999999;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label, "ja");
    });

    return rows;
  }, [codesMap, templatesMeta]);

  const maxOrder = useMemo(() => {
    const orders = workTypes
      .map((x) => x.order)
      .filter((n) => Number.isFinite(n));
    return orders.length ? Math.max(...orders) : 0;
  }, [workTypes]);

  // -----------------------------
  // selected workType
  // -----------------------------
  const [workTypeId, setWorkTypeId] = useState<string>("usWork");

  // workTypes が揃った時、存在しないなら先頭へ
  useEffect(() => {
    if (!workTypes.length) return;
    const exists = workTypes.some((w) => w.id === workTypeId);
    if (!exists) setWorkTypeId(workTypes[0]!.id);
  }, [workTypes, workTypeId]);

  const selectedWork = useMemo(
    () => workTypes.find((w) => w.id === workTypeId) ?? null,
    [workTypes, workTypeId],
  );

  // -----------------------------
  // add work type (✅ documentID auto)
  // -----------------------------
  const [newWorkLabel, setNewWorkLabel] = useState("");

  const addWorkType = async () => {
    if (!requireLogin()) return;

    const label = newWorkLabel.trim();
    if (!label) return alert("表示名を入力してください。");

    try {
      // ✅ codes: auto documentID
      const newCodeRef = doc(collection(db, COL_CODES)); // auto id
      const id = newCodeRef.id;

      await setDoc(
        newCodeRef,
        {
          label,
          order: maxOrder + 1,
          enabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false },
      );

      // ✅ templates: codes と同じ id を採用（選択キー統一）
      await setDoc(
        doc(db, COL_TEMPLATES, id),
        {
          workTypeId: id,
          title: label,
          steps: [],
          updatedAt: serverTimestamp(),
        },
        { merge: false },
      );

      setNewWorkLabel("");
      setWorkTypeId(id);
      await loadTemplatesMeta();
    } catch (e) {
      console.error(e);
      alert("追加に失敗しました（コンソール確認）");
    }
  };

  // templates に存在するが codes 未登録のものを codes に作る（既存の docId を維持）
  const importFromTemplates = async () => {
    if (!requireLogin()) return;

    try {
      const snap = await getDocs(collection(db, COL_TEMPLATES));
      const batch = writeBatch(db);

      let nextOrder = maxOrder + 1;
      let count = 0;

      for (const d of snap.docs) {
        const id = d.id;
        if (codesMap.has(id)) continue;

        const data = d.data() as Record<string, unknown>;
        const title = normStr(data.title, id);

        batch.set(
          doc(db, COL_CODES, id), // ✅ 既存テンプレのIDをそのまま使う
          {
            label: title || id,
            order: nextOrder++,
            enabled: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        count++;
      }

      if (count === 0) {
        alert("取り込み対象はありません（すでに揃っています）。");
        return;
      }

      await batch.commit();
      alert(`取り込みしました: ${count}件`);
    } catch (e) {
      console.error(e);
      alert("取り込みに失敗しました（コンソール確認）");
    }
  };

  const renameWorkType = async (id: string, label: string) => {
    if (!requireLogin()) return;
    const fixed = label.trim();
    if (!fixed) return alert("表示名が空です。");

    try {
      // codes（存在しない場合も作れる）
      await setDoc(
        doc(db, COL_CODES, id),
        { label: fixed, updatedAt: serverTimestamp() },
        { merge: true },
      );

      // templates.title も同期
      await setDoc(
        doc(db, COL_TEMPLATES, id),
        { title: fixed, updatedAt: serverTimestamp(), workTypeId: id },
        { merge: true },
      );

      await loadTemplatesMeta();
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました（コンソール確認）");
    }
  };

  const setEnabled = async (id: string, enabled: boolean) => {
    if (!requireLogin()) return;
    try {
      await setDoc(
        doc(db, COL_CODES, id),
        { enabled, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (e) {
      console.error(e);
      alert("更新に失敗しました（コンソール確認）");
    }
  };

  const hardDelete = async (id: string) => {
    if (!requireLogin()) return;

    const ok = confirm(
      `完全削除します。\n- ${COL_CODES}/${id}\n- ${COL_TEMPLATES}/${id}\n\n続行しますか？`,
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, COL_CODES, id)).catch(() => {});
      await deleteDoc(doc(db, COL_TEMPLATES, id)).catch(() => {});
      await loadTemplatesMeta();
      // UIメッセージ「削除しました」は表示しない
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました（コンソール確認）");
    }
  };

  // -----------------------------
  // selected template editing
  // -----------------------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [lastLoadedAt, setLastLoadedAt] = useState<string>("");

  const [workLabelDraft, setWorkLabelDraft] = useState("");

  useEffect(() => {
    setWorkLabelDraft(selectedWork?.label ?? workTypeId);
  }, [selectedWork?.label, workTypeId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const ref = doc(db, COL_TEMPLATES, workTypeId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          const fallbackTitle = selectedWork?.label ?? workTypeId;
          setTitle(fallbackTitle);
          setSteps([]);
          setLastLoadedAt("(未作成)");
          return;
        }

        const data = snap.data() as Partial<PublicWorkTemplate>;

        const baseTitle = String(
          data.title ?? selectedWork?.label ?? workTypeId,
        );
        setTitle(baseTitle);

        const rawSteps = Array.isArray(data.steps) ? data.steps : [];
        const parsed: Step[] = rawSteps
          .map((x) => {
            const obj = x as Record<string, unknown>;
            return {
              id: String(obj.id ?? uid()),
              name: String(obj.name ?? ""),
              order: Number(obj.order ?? 0),
            };
          })
          .filter((s) => s.name.trim().length > 0);

        setSteps(renumberFromOrder(parsed));

        const ts = data.updatedAt instanceof Timestamp ? data.updatedAt : null;
        setLastLoadedAt(ts ? ts.toDate().toLocaleString() : "(更新日時なし)");
      } finally {
        setLoading(false);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTypeId]);

  const onAddStep = () => {
    setSteps((prev) =>
      renumberByArrayOrder([
        ...prev,
        { id: uid(), name: "", order: prev.length + 1 },
      ]),
    );
  };

  const onDeleteStep = (id: string) => {
    setSteps((prev) => renumberByArrayOrder(prev.filter((x) => x.id !== id)));
  };

  const onSaveTemplate = async () => {
    if (!requireLogin()) return;

    const fixedSteps = normalizeStepsForSave(steps);
    const fixedTitle = String(
      title || selectedWork?.label || workTypeId,
    ).trim();

    setSaving(true);
    try {
      await setDoc(
        doc(db, COL_TEMPLATES, workTypeId),
        {
          workTypeId,
          title: fixedTitle,
          steps: fixedSteps,
          updatedAt: serverTimestamp(),
        },
        { merge: false },
      );

      // codesがあればlabelも同期（任意運用）
      if (codesMap.has(workTypeId)) {
        await setDoc(
          doc(db, COL_CODES, workTypeId),
          { label: fixedTitle, updatedAt: serverTimestamp() },
          { merge: true },
        );
      }

      alert("保存しました");
      await loadTemplatesMeta();

      const ref = doc(db, COL_TEMPLATES, workTypeId);
      const snap = await getDoc(ref);
      const data = snap.data() as Partial<PublicWorkTemplate>;
      const ts = data.updatedAt instanceof Timestamp ? data.updatedAt : null;
      setLastLoadedAt(ts ? ts.toDate().toLocaleString() : "(更新日時なし)");
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました（コンソール確認）");
    } finally {
      setSaving(false);
    }
  };

  // ✅ DnD sensors（PC/スマホ両対応）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const ids = useMemo(() => steps.map((s) => s.id), [steps]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    setSteps((prev) => {
      const oldIndex = prev.findIndex((x) => x.id === String(active.id));
      const newIndex = prev.findIndex((x) => x.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;

      const moved = arrayMove(prev, oldIndex, newIndex);
      return renumberByArrayOrder(moved);
    });
  };

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 text-gray-900 dark:text-gray-100">
      <h1 className="text-xl font-bold">工事種類 / 工程テンプレ管理</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        工事種類を選択すると、そのテンプレ（工程一覧）が表示され、追加・削除・編集・並び替え・保存ができます。
      </p>

      {!authReady ? (
        <div className="mt-6 rounded-2xl border bg-white p-4 dark:bg-gray-950 dark:border-gray-800">
          認証状態を確認中...
        </div>
      ) : !userUid ? (
        <div className="mt-6 rounded-2xl border bg-white p-4 dark:bg-gray-950 dark:border-gray-800">
          未ログインです。ログイン後に操作してください。
        </div>
      ) : null}

      {/* 工事種類：管理 */}
      <div className="mt-6 rounded-2xl border bg-white p-4 dark:bg-gray-950 dark:border-gray-800">
        <div className="grid gap-4">
          {/* 左：工種選択 */}
          <div className="grid gap-2">
            <label className="text-sm font-semibold">工事種類（工種）</label>
            <select
              className="h-10 rounded-md border px-3 bg-white dark:bg-gray-900 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              value={workTypeId}
              onChange={(e) => setWorkTypeId(e.target.value)}
              disabled={loadingTemplatesMeta}
            >
              {workTypes.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label} {w.enabled ? "" : "（無効）"}
                </option>
              ))}
            </select>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              {loadingTemplatesMeta ? "読み込み中..." : `総数: ${workTypes.length}`}
            </div>

            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              選択ID: <span className="font-mono break-all">{workTypeId}</span>
            </div>
          </div>

          {/* 右：表示名 + 操作 */}
          <div className="grid gap-2">
            <label className="text-sm font-semibold">工事種類の表示名</label>
            <div className="grid gap-2">
              <input
                className="h-10 w-full rounded-md border px-3 bg-white dark:bg-gray-900 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                value={workLabelDraft}
                onChange={(e) => setWorkLabelDraft(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="h-10 rounded-md border px-4 text-sm font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
                  onClick={() => void renameWorkType(workTypeId, workLabelDraft)}
                >
                  保存
                </button>

                {selectedWork?.enabled === false ? (
                  <button
                    type="button"
                    className="h-10 rounded-md border px-4 text-sm font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
                    onClick={() => void setEnabled(workTypeId, true)}
                  >
                    有効化
                  </button>
                ) : (
                  <button
                    type="button"
                    className="h-10 rounded-md border px-4 text-sm font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
                    onClick={() => void setEnabled(workTypeId, false)}
                  >
                    無効化
                  </button>
                )}

                <button
                  type="button"
                  className="h-10 rounded-md border px-4 text-sm font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
                  onClick={() => void hardDelete(workTypeId)}
                  title="必要時のみ"
                >
                  完全削除
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              source: {selectedWork?.source ?? "-"}
            </div>
          </div>
        </div>

        {/* 追加 / 取り込み */}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border p-4 dark:border-gray-800">
            <div className="text-sm font-semibold">
              工事種類を追加（documentIDは自動）
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
                  表示名
                </label>
                <input
                  value={newWorkLabel}
                  onChange={(e) => setNewWorkLabel(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border px-3
                             bg-white dark:bg-gray-900 dark:border-gray-700
                             text-gray-900 dark:text-gray-100"
                  placeholder="例）ウレタン防水工事（新）"
                />
              </div>

              <button
                type="button"
                className="h-10 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={() => void addWorkType()}
              >
                追加
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              追加時に <span className="font-mono">{COL_CODES}</span> と{" "}
              <span className="font-mono">{COL_TEMPLATES}</span>{" "}
              の両方を作成します。
            </div>
          </div>

          <div className="rounded-xl border p-4 dark:border-gray-800">
            <div className="text-sm font-semibold">既存テンプレ取り込み</div>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              <span className="font-mono">{COL_TEMPLATES}</span> にある工種で、
              <span className="font-mono"> {COL_CODES}</span>{" "}
              未登録のものを作成します（IDは既存テンプレIDを維持）。
            </p>

            <button
              type="button"
              className="mt-3 h-10 rounded-md border px-4 text-sm font-semibold
                         bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800
                         text-gray-900 dark:text-gray-100"
              onClick={() => void importFromTemplates()}
            >
              取り込み実行
            </button>
          </div>
        </div>
      </div>

      {/* 選択中テンプレ編集（usWork選択時は usWork の中身が出る） */}
      <div className="mt-6 rounded-2xl border bg-white p-4 dark:bg-gray-950 dark:border-gray-800">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold">選択中テンプレ</div>
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              保存先:{" "}
              <code className="font-mono">
                {COL_TEMPLATES}/{workTypeId}
              </code>
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            最終読み込み: {loading ? "読み込み中..." : lastLoadedAt}
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <label className="text-sm font-semibold">テンプレ名</label>
          <input
            className="h-10 rounded-md border px-3
                       bg-white dark:bg-gray-900 dark:border-gray-700
                       text-gray-900 dark:text-gray-100"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例）ウレタン防水工事"
          />
        </div>

        <div className="mt-4 rounded-xl border p-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="font-semibold">工程一覧</div>
            <button
              type="button"
              className="h-9 rounded-md border px-3 text-sm font-semibold
                         bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800
                         text-gray-900 dark:text-gray-100"
              onClick={onAddStep}
            >
              + 追加
            </button>
          </div>

          {loading ? (
            <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              読み込み中...
            </div>
          ) : steps.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              まだ工程がありません。「+ 追加」から作成してください。
            </div>
          ) : (
            <div className="mt-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={ids}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid gap-2">
                    {steps.map((s, index) => (
                      <SortableStepRow
                        key={s.id}
                        step={s}
                        index={index}
                        onChangeName={(id, v) => {
                          setSteps((prev) =>
                            prev.map((x) =>
                              x.id === id ? { ...x, name: v } : x,
                            ),
                          );
                        }}
                        onDelete={onDeleteStep}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                並び替えは「≡」をドラッグしてください。
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="h-10 rounded-md bg-black px-4 text-sm font-semibold text-white
                       hover:bg-gray-900 disabled:opacity-50"
            onClick={() => void onSaveTemplate()}
            disabled={saving || loading}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
