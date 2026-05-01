import admin from "firebase-admin";

function getServiceAccount() {
  if (process.env.FIREBASE_ADMIN_JSON) {
    const parsed = JSON.parse(process.env.FIREBASE_ADMIN_JSON);

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
    };
  }

  if (
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

// 🔥 Inicialização segura
if (!admin.apps.length) {
  const serviceAccount = getServiceAccount();

  if (!serviceAccount) {
    throw new Error("Firebase Admin não configurado corretamente.");
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey,
    }),
  });
}

// 🔥 AGORA NUNCA MAIS SERÁ NULL
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();

export default admin;