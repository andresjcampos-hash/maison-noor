import admin from "firebase-admin";
import fs from "fs";
import path from "path";

type ServiceAccountShape = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

function readServiceAccountFromFile(): ServiceAccountShape | null {
  const jsonPath = path.join(process.cwd(), "secrets", "firebase-admin.json");

  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      projectId: parsed.project_id || parsed.projectId,
      clientEmail: parsed.client_email || parsed.clientEmail,
      privateKey: (parsed.private_key || parsed.privateKey || "").replace(/\\n/g, "\n"),
    };
  } catch (error) {
    console.error("Erro ao ler secrets/firebase-admin.json:", error);
    return null;
  }
}

function readServiceAccountFromEnv(): ServiceAccountShape | null {
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    process.env.FIREBASE_CLIENT_EMAIL;

  const privateKeyRaw =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

function getServiceAccount(): ServiceAccountShape {
  const fromFile = readServiceAccountFromFile();
  if (fromFile?.projectId && fromFile?.clientEmail && fromFile?.privateKey) {
    return fromFile;
  }

  const fromEnv = readServiceAccountFromEnv();
  if (fromEnv?.projectId && fromEnv?.clientEmail && fromEnv?.privateKey) {
    return fromEnv;
  }

  throw new Error(
    [
      "Firebase Admin não configurado.",
      "Use o arquivo secrets/firebase-admin.json localmente",
      "ou configure na Vercel:",
      "FIREBASE_ADMIN_PROJECT_ID",
      "FIREBASE_ADMIN_CLIENT_EMAIL",
      "FIREBASE_ADMIN_PRIVATE_KEY",
    ].join(" ")
  );
}

function getApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = getServiceAccount();

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey,
    }),
  });
}

const app = getApp();

export const adminDb = admin.firestore(app);
export const adminAuth = admin.auth(app);
export default admin;
