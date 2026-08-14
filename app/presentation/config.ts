/**
 * Firebase browser configuration is intentionally supplied at build time.
 * These values identify a public Firebase web app; they are not credentials and
 * never replace the write authorization enforced by Realtime Database Rules.
 */
export type PresentationFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
};

type PresentationBuildEnv = Record<string, string | boolean | undefined>;

const buildEnv =
  ((import.meta as ImportMeta & { readonly env?: PresentationBuildEnv }).env ?? {});

function envString(name: string) {
  const value = buildEnv[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const candidateConfig = {
  apiKey: envString("VITE_FIREBASE_API_KEY"),
  authDomain: envString("VITE_FIREBASE_AUTH_DOMAIN"),
  databaseURL: envString("VITE_FIREBASE_DATABASE_URL"),
  projectId: envString("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: envString("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: envString("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: envString("VITE_FIREBASE_APP_ID"),
  measurementId: envString("VITE_FIREBASE_MEASUREMENT_ID"),
};

const hasRequiredConfig = Boolean(
  candidateConfig.apiKey &&
    candidateConfig.authDomain &&
    candidateConfig.databaseURL &&
    candidateConfig.projectId &&
    candidateConfig.appId,
);

/** Null is the secure, fail-safe default until the browser config is supplied. */
export const PRESENTATION_FIREBASE_CONFIG: PresentationFirebaseConfig | null =
  hasRequiredConfig
    ? {
        apiKey: candidateConfig.apiKey!,
        authDomain: candidateConfig.authDomain!,
        databaseURL: candidateConfig.databaseURL!,
        projectId: candidateConfig.projectId!,
        appId: candidateConfig.appId!,
        ...(candidateConfig.storageBucket
          ? { storageBucket: candidateConfig.storageBucket }
          : {}),
        ...(candidateConfig.messagingSenderId
          ? { messagingSenderId: candidateConfig.messagingSenderId }
          : {}),
        ...(candidateConfig.measurementId
          ? { measurementId: candidateConfig.measurementId }
          : {}),
      }
    : null;

export const PRESENTATION_FIREBASE_APP_NAME = "clancy-live-presentation";
export const PRESENTATION_ROOM_PATH = "presentations/main";
export const PRESENTATION_HEARTBEAT_MS = 5_000;
export const PRESENTATION_STALE_AFTER_MS = 18_000;
export const PRESENTATION_AUTH_RETRY_MS = 2_000;
export const PRESENTATION_SCROLL_THROTTLE_MS = 90;
export const PRESENTATION_REMOTE_SUPPRESSION_MS = 240;
export const PRESENTATION_MAX_SEARCH_LENGTH = 240;
export const PRESENTATION_MAX_SELECTION_ID_LENGTH = 500;
export const PRESENTATION_MAX_FAQ_IDS_LENGTH = 500;
