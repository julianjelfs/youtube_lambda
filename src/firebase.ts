import { InstallationRegistry } from "@open-ic/openchat-botclient-ts";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { DocumentSnapshot, getFirestore } from "firebase-admin/firestore";
import { ChannelStats, State } from "./types";

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

// this all needs refactoring to store things in individual documents inside collections.
// at the moment we are completely misusing firestore

function mapSubscriptions(doc: DocumentSnapshot): Map<string, Set<string>> {
  if (!doc.exists) {
    console.log("subscriptions document not found");
    return new Map();
  }

  const data = doc.data();

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
}

export async function readAll(): Promise<State> {
  const collection = db.collection(`/${process.env.FIREBASE_COLLECTION!}`);
  const subDoc = collection.doc("subscriptions");
  const channelsDoc = collection.doc("youtube_channels");
  const installsDoc = collection.doc("installation_registry");
  const [subSnap, channelsSnap, installsSnap] = await db.getAll(
    subDoc,
    channelsDoc,
    installsDoc
  );

  return {
    subscriptions: mapSubscriptions(subSnap),
    youtubeChannels: mapChannelStats(channelsSnap),
    installs: InstallationRegistry.fromMap(mapInstallData(installsSnap)),
  };
}

function mapInstallData(doc: DocumentSnapshot): Map<string, string> {
  if (!doc.exists) {
    console.log("installation_registry document not found");
    return new Map();
  }

  const data = doc.data();

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
}

function mapChannelStats(doc: DocumentSnapshot): Map<string, ChannelStats> {
  if (!doc.exists) {
    console.log("youtube_channels document not found");
    return new Map();
  }

  const data = doc.data();

  // Check if the retrieved data is an object and contains only string values
  if (typeof data !== "object" || data === null) {
    console.error("Firestore data is not an object:", data);
    return new Map();
  }

  const result = new Map<string, ChannelStats>();

  for (const key in data) {
    const value = data[key];
    if (typeof value === "object") {
      result.set(key, value);
    } else {
      console.warn(
        `Skipping non-string value for key "${key}" in document "${"youtube_channels"}"`
      );
    }
  }

  return result;
}
