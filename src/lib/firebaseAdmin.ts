// src/lib/firebaseAdmin.ts
import admin, { type ServiceAccount } from "firebase-admin";

function req(name: string, v: string): string {
  if (!v.trim()) throw new Error(`Missing env: ${name}`);
  return v;
}

function getServiceAccount(): ServiceAccount {
  // あなたの方針：?? "" で受ける
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ?? "";
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY ?? "";

  // private_key は \n を改行に戻す
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  // 実行時に必須チェック（空文字のまま進む事故防止）
  return {
    projectId: req("NEXT_PUBLIC_FIREBASE_PROJECT_ID", projectId),
    clientEmail: req("FIREBASE_CLIENT_EMAIL", clientEmail),
    privateKey: req("FIREBASE_PRIVATE_KEY", privateKey),
  };
}

export function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.app();

  const sa = getServiceAccount();
  return admin.initializeApp({
    credential: admin.credential.cert(sa),
  });
}

export function getAdminAuth(): admin.auth.Auth {
  return getAdminApp().auth();
}

export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}
