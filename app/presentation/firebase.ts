import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getDatabase,
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  type Database,
  type OnDisconnect,
} from "firebase/database";

import {
  PRESENTATION_FIREBASE_APP_NAME,
  PRESENTATION_FIREBASE_CONFIG,
  PRESENTATION_ROOM_PATH,
} from "./config";
import {
  nextPointerSequence,
  normalizeMeta,
  normalizePointerState,
  normalizeSnapshot,
} from "./state";
import {
  PRESENTATION_SCHEMA_VERSION,
  type PresentationMeta,
  type PresentationPointerState,
  type PresentationSnapshot,
  type PresentationTransport,
  type PresentationTransportError,
  type PresentationUser,
  type Unsubscribe,
} from "./types";

type FirebaseContext = {
  app: FirebaseApp;
  auth: Auth;
  database: Database;
};

function normalizeError(error: unknown): PresentationTransportError {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : "presentation/unknown",
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : "The live presentation service returned an unknown error.",
    };
  }
  return {
    code: "presentation/unknown",
    message: typeof error === "string" ? error : "The live presentation service failed.",
  };
}

function transportFailure(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function presentationUser(user: User): PresentationUser {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
  };
}

function buildFirebaseContext(): FirebaseContext | null {
  if (!PRESENTATION_FIREBASE_CONFIG || typeof window === "undefined") return null;
  const existing = getApps().find((app) => app.name === PRESENTATION_FIREBASE_APP_NAME);
  const app = existing
    ? getApp(PRESENTATION_FIREBASE_APP_NAME)
    : initializeApp(PRESENTATION_FIREBASE_CONFIG, PRESENTATION_FIREBASE_APP_NAME);
  return {
    app,
    auth: getAuth(app),
    database: getDatabase(app, PRESENTATION_FIREBASE_CONFIG.databaseURL),
  };
}

class DisabledPresentationTransport implements PresentationTransport {
  readonly configured = false;

  subscribeMeta(onValueCallback: (meta: PresentationMeta | null) => void): Unsubscribe {
    onValueCallback(null);
    return () => undefined;
  }

  subscribeState(onValueCallback: (state: PresentationSnapshot | null) => void): Unsubscribe {
    onValueCallback(null);
    return () => undefined;
  }

  subscribePointer(onValueCallback: (pointer: PresentationPointerState | null) => void): Unsubscribe {
    onValueCallback(null);
    return () => undefined;
  }

  subscribeConnection(onValueCallback: (connected: boolean) => void): Unsubscribe {
    onValueCallback(false);
    return () => undefined;
  }

  subscribeServerTimeOffset(onValueCallback: (offsetMs: number) => void): Unsubscribe {
    onValueCallback(0);
    return () => undefined;
  }

  subscribeAuth(onValueCallback: (user: PresentationUser | null) => void): Unsubscribe {
    onValueCallback(null);
    return () => undefined;
  }

  private unavailable(): never {
    throw transportFailure(
      "presentation/not-configured",
      "Live presentation is disabled until Firebase browser configuration is supplied.",
    );
  }

  async signInWithGoogle(): Promise<PresentationUser> { return this.unavailable(); }
  async signOut(): Promise<void> { return undefined; }
  async probeAuthorization(): Promise<void> { return this.unavailable(); }
  async start(): Promise<void> { return this.unavailable(); }
  async publish(): Promise<void> { return this.unavailable(); }
  async publishPointer(): Promise<void> { return this.unavailable(); }
  async hidePointer(): Promise<void> { return this.unavailable(); }
  async heartbeat(): Promise<void> { return this.unavailable(); }
  async stop(): Promise<void> { return this.unavailable(); }
  async releasePresenterConnection(): Promise<void> { return undefined; }
}

class FirebasePresentationTransport implements PresentationTransport {
  readonly configured = true;
  private pendingDisconnect: OnDisconnect | null = null;
  private pendingPointerDisconnect: OnDisconnect | null = null;
  private readonly pointerSequences = new Map<string, number>();

  constructor(private readonly firebase: FirebaseContext) {}

  subscribeMeta(
    onValueCallback: (meta: PresentationMeta | null) => void,
    onErrorCallback: (error: PresentationTransportError) => void,
  ): Unsubscribe {
    return onValue(
      ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/meta`),
      (snapshot) => {
        if (!snapshot.exists()) {
          onValueCallback(null);
          return;
        }
        const meta = normalizeMeta(snapshot.val());
        if (!meta) {
          onErrorCallback({
            code: "presentation/invalid-meta",
            message: "The live session metadata did not match the supported schema.",
          });
          onValueCallback(null);
          return;
        }
        onValueCallback(meta);
      },
      (error) => onErrorCallback(normalizeError(error)),
    );
  }

  subscribeState(
    onValueCallback: (state: PresentationSnapshot | null) => void,
    onErrorCallback: (error: PresentationTransportError) => void,
  ): Unsubscribe {
    return onValue(
      ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/state`),
      (snapshot) => {
        if (!snapshot.exists()) {
          onValueCallback(null);
          return;
        }
        const state = normalizeSnapshot(snapshot.val());
        if (!state) {
          onErrorCallback({
            code: "presentation/invalid-state",
            message: "The presenter state did not match the supported schema.",
          });
          onValueCallback(null);
          return;
        }
        onValueCallback(state);
      },
      (error) => onErrorCallback(normalizeError(error)),
    );
  }

  subscribePointer(
    onValueCallback: (pointer: PresentationPointerState | null) => void,
    onErrorCallback: (error: PresentationTransportError) => void,
  ): Unsubscribe {
    return onValue(
      ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/pointer`),
      (snapshot) => {
        if (!snapshot.exists()) {
          onValueCallback(null);
          return;
        }
        const pointer = normalizePointerState(snapshot.val());
        if (!pointer) {
          onErrorCallback({
            code: "presentation/invalid-pointer",
            message: "The presenter pointer did not match the supported schema.",
          });
          onValueCallback(null);
          return;
        }
        onValueCallback(pointer);
      },
      (error) => onErrorCallback(normalizeError(error)),
    );
  }

  subscribeConnection(onValueCallback: (connected: boolean) => void): Unsubscribe {
    return onValue(
      ref(this.firebase.database, ".info/connected"),
      (snapshot) => onValueCallback(snapshot.val() === true),
      () => onValueCallback(false),
    );
  }

  subscribeServerTimeOffset(onValueCallback: (offsetMs: number) => void): Unsubscribe {
    return onValue(
      ref(this.firebase.database, ".info/serverTimeOffset"),
      (snapshot) => {
        const value = snapshot.val();
        onValueCallback(typeof value === "number" && Number.isFinite(value) ? value : 0);
      },
      () => onValueCallback(0),
    );
  }

  subscribeAuth(onValueCallback: (user: PresentationUser | null) => void): Unsubscribe {
    return onAuthStateChanged(this.firebase.auth, (user) => {
      onValueCallback(user ? presentationUser(user) : null);
    });
  }

  async signInWithGoogle() {
    await setPersistence(this.firebase.auth, browserSessionPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(this.firebase.auth, provider);
    return presentationUser(result.user);
  }

  async signOut() {
    // Session retirement belongs to the hook's explicit stop flow. Cancelling
    // onDisconnect here could strand active metadata if a stale owner signs out
    // while offline.
    await firebaseSignOut(this.firebase.auth);
  }

  async probeAuthorization(user: PresentationUser, clientId: string) {
    if (!user.emailVerified) {
      throw transportFailure(
        "presentation/email-not-verified",
        "The signed-in Google identity is not verified and cannot present.",
      );
    }
    const probe = ref(
      this.firebase.database,
      `${PRESENTATION_ROOM_PATH}/authChecks/${user.uid}`,
    );
    await set(probe, { clientId, checkedAt: serverTimestamp() });
    // The successful write is the authorization proof. Cleanup is best effort;
    // a failed delete must not turn an authorized identity into a false negative.
    await remove(probe).catch(() => undefined);
  }

  async start(snapshot: PresentationSnapshot) {
    await this.releasePresenterConnection();
    const metaReference = ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/meta`);
    const existingMeta = normalizeMeta((await get(metaReference)).val());
    if (existingMeta?.active && existingMeta.presenterClientId !== snapshot.clientId) {
      throw transportFailure(
        "presentation/session-already-active",
        "Another presenter tab still owns the live session.",
      );
    }
    const pointerReference = ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/pointer`);
    const metaDisconnect = onDisconnect(metaReference);
    const pointerDisconnect = onDisconnect(pointerReference);
    this.pendingDisconnect = metaDisconnect;
    this.pendingPointerDisconnect = pointerDisconnect;

    try {
      // Register complete, Rules-valid objects before making the session live.
      await metaDisconnect.set({
        schemaVersion: PRESENTATION_SCHEMA_VERSION,
        active: false,
        presenterClientId: snapshot.clientId,
        startedAt: snapshot.updatedAt,
        heartbeatAt: serverTimestamp(),
        endedAt: serverTimestamp(),
        disconnectedAt: serverTimestamp(),
      });
      // This client id cannot be reused after a disconnected page is gone, so
      // MAX_SAFE_INTEGER is an authoritative terminal hide for that client.
      await pointerDisconnect.set({
        schemaVersion: PRESENTATION_SCHEMA_VERSION,
        clientId: snapshot.clientId,
        sequence: Number.MAX_SAFE_INTEGER,
        xRatio: 0,
        yRatio: 0,
        visible: false,
        updatedAt: serverTimestamp(),
      });
      await this.hidePointer(snapshot.clientId, Date.now());
      // Publish the complete snapshot before making the room discoverably live.
      await set(ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/state`), {
        ...snapshot,
        updatedAt: serverTimestamp(),
      });
      await set(metaReference, {
        schemaVersion: PRESENTATION_SCHEMA_VERSION,
        active: true,
        presenterClientId: snapshot.clientId,
        startedAt: serverTimestamp(),
        heartbeatAt: serverTimestamp(),
        endedAt: 0,
        disconnectedAt: 0,
      });
    } catch (error) {
      await this.releasePresenterConnection();
      throw error;
    }
  }

  async publish(snapshot: PresentationSnapshot) {
    await set(ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/state`), {
      ...snapshot,
      updatedAt: serverTimestamp(),
    });
  }

  async publishPointer(pointer: PresentationPointerState) {
    const normalized = normalizePointerState(pointer);
    if (!normalized) {
      throw transportFailure(
        "presentation/invalid-pointer",
        "The local laser pointer state is invalid.",
      );
    }
    const previous = this.pointerSequences.get(normalized.clientId) ?? 0;
    const sequence = nextPointerSequence(previous, normalized.sequence);
    this.pointerSequences.set(normalized.clientId, sequence);
    await set(ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/pointer`), {
      ...normalized,
      sequence,
      updatedAt: serverTimestamp(),
    });
  }

  async hidePointer(clientId: string, sequence: number) {
    const previous = this.pointerSequences.get(clientId) ?? 0;
    const nextSequence = nextPointerSequence(previous, sequence);
    this.pointerSequences.set(clientId, nextSequence);
    await set(ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/pointer`), {
      schemaVersion: PRESENTATION_SCHEMA_VERSION,
      clientId,
      sequence: nextSequence,
      xRatio: 0,
      yRatio: 0,
      visible: false,
      updatedAt: serverTimestamp(),
    });
  }

  async heartbeat(clientId: string) {
    const metaReference = ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/meta`);
    const result = await runTransaction(
      metaReference,
      (current) => {
        const meta = normalizeMeta(current);
        if (!meta?.active || meta.presenterClientId !== clientId) return;
        return { ...current, heartbeatAt: serverTimestamp() };
      },
      { applyLocally: false },
    );
    if (!result.committed) {
      throw transportFailure(
        "presentation/session-lost",
        "This tab no longer owns the active presentation session.",
      );
    }
  }

  async stop(clientId: string) {
    const metaReference = ref(this.firebase.database, `${PRESENTATION_ROOM_PATH}/meta`);
    // Hiding is best effort: session retirement must still proceed if the
    // pointer write is blocked or the network drops between these operations.
    await this.hidePointer(clientId, Date.now()).catch(() => undefined);
    const result = await runTransaction(
      metaReference,
      (current) => {
        const meta = normalizeMeta(current);
        if (!meta?.active || meta.presenterClientId !== clientId) return;
        return {
          ...current,
          active: false,
          heartbeatAt: serverTimestamp(),
          endedAt: serverTimestamp(),
          disconnectedAt: 0,
        };
      },
      { applyLocally: false },
    );
    await this.releasePresenterConnection();
    if (!result.committed) {
      throw transportFailure(
        "presentation/session-lost",
        "This tab no longer owns the active presentation session.",
      );
    }
  }

  async releasePresenterConnection() {
    const operations = [this.pendingDisconnect, this.pendingPointerDisconnect];
    this.pendingDisconnect = null;
    this.pendingPointerDisconnect = null;
    await Promise.all(
      operations.map((operation) => operation?.cancel().catch(() => undefined)),
    );
  }
}

const disabledTransport = new DisabledPresentationTransport();
let singletonTransport: FirebasePresentationTransport | null = null;

export function createPresentationTransport(): PresentationTransport {
  if (!PRESENTATION_FIREBASE_CONFIG || typeof window === "undefined") {
    return disabledTransport;
  }
  if (!singletonTransport) {
    const context = buildFirebaseContext();
    if (!context) return disabledTransport;
    singletonTransport = new FirebasePresentationTransport(context);
  }
  return singletonTransport;
}

export { normalizeError as normalizePresentationTransportError };
