// src/lib/adminAuth.ts
import admin from "firebase-admin";

function getPrivateKey(): string | undefined {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return undefined;
  return raw.replace(/\\n/g, "\n");
}

export function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing firebase admin env: FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY",
    );
  }

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    ...(storageBucket ? { storageBucket } : {}),
  });
}

export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}
export function getAdminAuth(): admin.auth.Auth {
  return getAdminApp().auth();
}
export function getAdminStorage(): admin.storage.Storage {
  return getAdminApp().storage();
}

/* =========================================================
   ✅ 追加：あなたのAPIがimportしている名前に合わせる
========================================================= */

// 既存コード互換: adminDb()
export function adminDb(): admin.firestore.Firestore {
  return getAdminDb();
}

// 管理者チェック（例：IDトークン + custom claims admin=true）
function getBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function requireAdmin(req: Request): Promise<{ uid: string }> {
  const token = getBearer(req);
  if (!token) throw new Error("UNAUTHORIZED");

  const decoded = await getAdminAuth().verifyIdToken(token);

  // custom claims: { admin: true } を想定
  const isAdmin = !!(decoded as unknown as { admin?: unknown }).admin;
  if (!isAdmin) throw new Error("FORBIDDEN");

  return { uid: decoded.uid };
}
