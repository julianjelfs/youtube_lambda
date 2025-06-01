import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initFirebaseApp() {
  if (getApps().length > 0) return getApp();

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!json) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(json);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

const app = initFirebaseApp();
const db = getFirestore(app);

export async function writeSubscriptions(
  subs: Map<string, Set<string>>
): Promise<void> {
  try {
    const docRef = db
      .collection(`/${process.env.FIREBASE_COLLECTION!}`)
      .doc("subscriptions");
    const dataObject: { [key: string]: string[] } = {};
    for (const [k, v] of subs) {
      dataObject[k] = [...v];
    }
    await docRef.set(dataObject);
  } catch (error) {
    console.error(`Error writing apikeys:`, error);
    throw error;
  }
}

export async function writeInstallationRegistry(
  installs: Map<string, string>
): Promise<void> {
  try {
    const docRef = db
      .collection(`/${process.env.FIREBASE_COLLECTION!}`)
      .doc("installation_registry");
    const dataObject: { [key: string]: string } = {};
    for (const [k, v] of installs) {
      dataObject[k] = v;
    }
    await docRef.set(dataObject);
  } catch (error) {
    console.error(`Error writing installation_registry:`, error);
    throw error;
  }
}

export async function readSubscriptions(): Promise<Map<string, Set<string>>> {
  try {
    const docRef = db
      .collection(`/${process.env.FIREBASE_COLLECTION!}`)
      .doc("subscriptions");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.log("subscriptionss document not found");
      return new Map();
    }

    const data = docSnap.data();

    // Check if the retrieved data is an object and contains only string values
    if (typeof data !== "object" || data === null) {
      console.error("Firestore data is not an object:", data);
      return new Map();
    }

    const result = new Map<string, Set<string>>();

    for (const key in data) {
      const value = data[key];
      if (value instanceof Array) {
        result.set(key, new Set(value));
      } else {
        console.warn(
          `Skipping non-string value for key "${key}" in document "${"subscriptions"}"`
        );
      }
    }

    return result;
  } catch (error) {
    throw error;
  }
}

export async function readInstallationRegistry(): Promise<Map<string, string>> {
  try {
    const docRef = db
      .collection(`/${process.env.FIREBASE_COLLECTION!}`)
      .doc("installation_registry");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.log("installation_registry document not found");
      return new Map();
    }

    const data = docSnap.data();

    // Check if the retrieved data is an object and contains only string values
    if (typeof data !== "object" || data === null) {
      console.error("Firestore data is not an object:", data);
      return new Map();
    }

    const result = new Map<string, string>();

    for (const key in data) {
      const value = data[key];
      if (typeof value === "string") {
        result.set(key, value);
      } else {
        console.warn(
          `Skipping non-string value for key "${key}" in document "${"installation_registry"}"`
        );
      }
    }

    return result;
  } catch (error) {
    throw error;
  }
}
