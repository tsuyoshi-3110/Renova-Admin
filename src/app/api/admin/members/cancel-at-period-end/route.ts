// src/app/api/admin/members/cancel-at-period-end/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import admin from "firebase-admin";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function getBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is missing`);
  return v;
}

function getStripe(): Stripe {
  return new Stripe(mustEnv("STRIPE_SECRET_KEY"));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toBoolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function toNumOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

async function findMemberRefByUid(uid: string) {
  const db = getAdminDb();

  // 1) docId = uid
  const byId = db.collection("reNovaMember").doc(uid);
  const byIdSnap = await byId.get();
  if (byIdSnap.exists) return byId;

  // 2) auto docId + uid field
  const q = await db.collection("reNovaMember").where("uid", "==", uid).limit(1).get();
  if (q.empty) return null;
  return q.docs[0].ref;
}

type Body = {
  uid?: string;
  cancelAtPeriodEnd?: boolean;
};

export async function POST(req: Request) {
  try {
    // ✅ あなたの方針：admin判定はしない。ログインしていれば全員OK
    const token = getBearer(req);
    if (!token) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const app = getAdminApp();
    const decoded = await admin.auth(app).verifyIdToken(token);
    if (!decoded?.uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = (await req.json()) as Body;
    const uid = typeof body.uid === "string" ? body.uid : "";
    const cancelAtPeriodEnd =
      typeof body.cancelAtPeriodEnd === "boolean" ? body.cancelAtPeriodEnd : null;

    if (!uid || cancelAtPeriodEnd === null) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const memberRef = await findMemberRefByUid(uid);
    if (!memberRef) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const memberSnap = await memberRef.get();
    const memberData = memberSnap.data() as unknown;

    const billing = isObj(memberData) && isObj(memberData.billing) ? memberData.billing : null;
    const stripeSubscriptionId = billing ? toStr(billing.stripeSubscriptionId) : "";
    if (!stripeSubscriptionId) {
      return NextResponse.json({ ok: false, error: "stripeSubscriptionId_missing" }, { status: 400 });
    }

    const stripe = getStripe();

    // ✅ Stripeへ反映（期間満了解約 / 解約取り消し）
    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    const u = updated as unknown;
    const cancel = isObj(u) ? toBoolOrNull(u.cancel_at_period_end) : null;
    const cpeSec = isObj(u) ? toNumOrNull(u.current_period_end) : null;
    const currentPeriodEndMs = typeof cpeSec === "number" ? cpeSec * 1000 : null;

    // ✅ Firestoreへミラー（UI表示用）
    await memberRef.set(
      {
        billing: {
          cancelAtPeriodEnd: cancel,
          currentPeriodEndMs,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      uid,
      stripeSubscriptionId,
      cancelAtPeriodEnd: cancel,
      currentPeriodEndMs,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
