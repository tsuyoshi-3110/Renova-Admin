import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/adminAuth";

export const runtime = "nodejs";

type BillingStatus = "active" | "inactive";

type MemberRow = {
  uid: string;
  email: string;
  status: BillingStatus;
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodEndMs: number | null;
};

function pickStatus(v: unknown): BillingStatus {
  return v === "active" ? "active" : "inactive";
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: Request) {
  try {
    const db = getAdminDb();
    const snap = await db.collection("reNovaMember").get();

    const members: MemberRow[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const billing = (data.billing as Record<string, unknown> | undefined) ?? {};

      const uid = toStr(data.uid) || d.id;
      const email = toStr(data.email);

      return {
        uid,
        email,
        status: pickStatus(billing.status),
        stripeSubscriptionId: toStr(billing.stripeSubscriptionId),
        cancelAtPeriodEnd: toBoolOrNull(billing.cancelAtPeriodEnd),
        currentPeriodEndMs: toNumOrNull(billing.currentPeriodEndMs),
      };
    });

    return NextResponse.json({ ok: true, members });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
