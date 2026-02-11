import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminFromRequest } from "@/lib/adminGuard";
import admin from "firebase-admin";

export const runtime = "nodejs";

type Body = {
  uid: string;
  mode: "free" | "paid";
  status: "active" | "inactive";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toMode(v: unknown): "free" | "paid" {
  return v === "free" ? "free" : "paid";
}

function toStatus(v: unknown): "active" | "inactive" {
  return v === "active" ? "active" : "inactive";
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    const bodyUnknown: unknown = await req.json();
    const body = bodyUnknown as Partial<Body>;

    const uid = toStr(body.uid).trim();
    if (!uid) {
      return NextResponse.json({ ok: false, error: "uid_required" }, { status: 400 });
    }

    const mode = toMode(body.mode);
    const status = toStatus(body.status);

    const stripeCustomerId = toStr(body.stripeCustomerId ?? "");
    const stripeSubscriptionId = toStr(body.stripeSubscriptionId ?? "");

    const db = getAdminDb();
    await db.collection("renovaUsers").doc(uid).set(
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        billing: {
          mode,
          status,
          stripeCustomerId,
          stripeSubscriptionId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status =
      msg === "missing_authorization" ? 401 : msg === "not_admin" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
