import admin from "firebase-admin";
import fs from "fs";
import path from "path";

function getServiceAccount() {
  if (process.env.FIREBASE_ADMIN_JSON) {
    const parsed = JSON.parse(process.env.FIREBASE_ADMIN_JSON);

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  const jsonPath = path.join(process.cwd(), "secrets", "firebase-admin.json");

  if (fs.existsSync(jsonPath)) {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  return {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

if (!admin.apps.length) {
  const serviceAccount = getServiceAccount();

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey,
    }),
  });
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export default admin;