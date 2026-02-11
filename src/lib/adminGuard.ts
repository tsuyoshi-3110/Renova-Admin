import { getAdminAuth } from "@/lib/firebaseAdmin";

function parseAdminUids(): string[] {
  const raw = process.env.RENOVA_ADMIN_UIDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function requireAdminFromRequest(req: Request): Promise<{
  uid: string;
}> {
  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("missing_authorization");

  const token = m[1];
  const decoded = await getAdminAuth().verifyIdToken(token);
  const uid = decoded.uid;

  const admins = parseAdminUids();
  if (!admins.includes(uid)) throw new Error("not_admin");

  return { uid };
}
