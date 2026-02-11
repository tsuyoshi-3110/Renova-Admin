import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminFromRequest } from "@/lib/adminGuard";
import admin from "firebase-admin";

export const runtime = "nodejs";

type BillingMode = "free" | "paid";

type Body = {
  email: string;
  password: string;

  // profile
  fullName: string;
  phone: string;
  companyName: string;
  companyAddress: string;

  billingMode: BillingMode;
};

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toBillingMode(v: unknown): BillingMode {
  return v === "free" ? "free" : "paid";
}

function normalizePhone(s: string): string {
  return s.replace(/[^\d+]/g, "").trim();
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    const bodyUnknown: unknown = await req.json();
    const body = bodyUnknown as Partial<Body>;

    const email = toStr(body.email).trim();
    const password = toStr(body.password);

    const fullName = toStr(body.fullName).trim();
    const phone = normalizePhone(toStr(body.phone));
    const companyName = toStr(body.companyName).trim();
    const companyAddress = toStr(body.companyAddress).trim();

    const billingMode = toBillingMode(body.billingMode);

    // --- validation ---
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "email_required" },
        { status: 400 },
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "password_min_6" },
        { status: 400 },
      );
    }
    if (!fullName) {
      return NextResponse.json(
        { ok: false, error: "fullName_required" },
        { status: 400 },
      );
    }
    if (!companyName) {
      return NextResponse.json(
        { ok: false, error: "companyName_required" },
        { status: 400 },
      );
    }

    // --- create auth user ---
    const userRecord = await getAdminAuth().createUser({
      email,
      password,
      displayName: fullName,
    });

    const uid = userRecord.uid;

    // --- create firestore doc ---
    const db = getAdminDb();

    // ✅ ここが reNovaMember
    await db.collection("reNovaMember").doc(uid).set(
      {
        uid,
        email,

        profile: {
          fullName,
          phone,
          companyName,
          companyAddress,
        },

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),

        billing: {
          mode: billingMode, // free / paid
          status: billingMode === "free" ? "active" : "inactive",
          stripeCustomerId: "",
          stripeSubscriptionId: "",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, uid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status =
      msg === "missing_authorization" ? 401 : msg === "not_admin" ? 403 : 500;

    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
