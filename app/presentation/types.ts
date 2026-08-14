export const PRESENTATION_SCHEMA_VERSION = 1 as const;

export const PRESENTATION_CATEGORY_KEYS = [
  "clinical",
  "symptom",
  "hospital",
  "medication",
  "collateral",
  "digital",
  "event",
  "post",
] as const;

export type PresentationCategory = (typeof PRESENTATION_CATEGORY_KEYS)[number];
export type PresentationView = "course" | "post";

export type PresentationCategoryState = Record<PresentationCategory, boolean>;

/**
 * `id` is an existing stable timeline event id, medication generic value, or a
 * delimiter-joined list of stable event ids for a local cluster. An empty id is
 * required for the `none` case so the Realtime Database object has one stable
 * shape that can be validated by Security Rules.
 */
export type PresentationSelection = {
  kind: "none" | "event" | "medication" | "cluster";
  id: string;
};

export type PresentationVerticalPosition = {
  anchorId: string;
  progress: number;
  fallbackRatio: number;
};

/** State owned by the timeline React tree, before protocol/scroll metadata. */
export type PresentationControlState = {
  view: PresentationView;
  zoom: number;
  categories: PresentationCategoryState;
  searchQuery: string;
  medicationOverlayOpen: boolean;
  /** Comma-delimited stable FAQ ids whose accordions are open. */
  openFaqIds: string;
  selection: PresentationSelection;
};

/** Latest complete UI snapshot stored at /presentations/main/state. */
export type PresentationSnapshot = PresentationControlState & {
  schemaVersion: typeof PRESENTATION_SCHEMA_VERSION;
  revision: number;
  clientId: string;
  updatedAt: number;
  horizontalRatio: number;
  vertical: PresentationVerticalPosition;
  drawerRatio: number;
};

/** Session lifecycle data stored at /presentations/main/meta. */
export type PresentationMeta = {
  schemaVersion: typeof PRESENTATION_SCHEMA_VERSION;
  active: boolean;
  presenterClientId: string;
  startedAt: number;
  heartbeatAt: number;
  endedAt: number;
  disconnectedAt: number;
};

export type PresentationUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
};

export type PresentationConnectionStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type PresentationAuthorizationStatus =
  | "signed-out"
  | "checking"
  | "authorized"
  | "unauthorized"
  | "unavailable";

export type PresentationRoomUpdate = {
  meta: PresentationMeta | null;
  state: PresentationSnapshot | null;
};

export type PresentationTransportError = {
  code: string;
  message: string;
};

export type Unsubscribe = () => void;

/**
 * Deliberately small transport contract. Tests can inject an in-memory
 * implementation; production uses the modular Firebase implementation.
 */
export interface PresentationTransport {
  readonly configured: boolean;

  subscribeMeta(
    onValue: (meta: PresentationMeta | null) => void,
    onError: (error: PresentationTransportError) => void,
  ): Unsubscribe;

  subscribeState(
    onValue: (state: PresentationSnapshot | null) => void,
    onError: (error: PresentationTransportError) => void,
  ): Unsubscribe;

  subscribeConnection(onValue: (connected: boolean) => void): Unsubscribe;
  subscribeServerTimeOffset(onValue: (offsetMs: number) => void): Unsubscribe;
  subscribeAuth(onValue: (user: PresentationUser | null) => void): Unsubscribe;

  signInWithGoogle(): Promise<PresentationUser>;
  signOut(): Promise<void>;
  probeAuthorization(user: PresentationUser, clientId: string): Promise<void>;

  start(snapshot: PresentationSnapshot): Promise<void>;
  publish(snapshot: PresentationSnapshot): Promise<void>;
  heartbeat(clientId: string): Promise<void>;
  stop(clientId: string): Promise<void>;
  releasePresenterConnection(): Promise<void>;
}

export type PresentationTransportFactory = () => PresentationTransport;

export type PresentationAnchorTarget = {
  id: string;
  element: HTMLElement;
};

export type PresentationDomAdapter = {
  getAnchors: () => PresentationAnchorTarget[];
  getTimelineScroller: () => HTMLElement | null;
  getDrawerScroller: () => HTMLElement | null;
};

export type ApplyRemoteControls = (
  controls: Omit<PresentationControlState, "selection">,
) => void;

export type ApplyRemoteSelection = (selection: PresentationSelection) => void;

export type UsePresentationSyncOptions = {
  presenterMode: boolean;
  localState: PresentationControlState;
  applyRemoteControls: ApplyRemoteControls;
  applyRemoteSelection: ApplyRemoteSelection;
  dom?: Partial<PresentationDomAdapter>;
  transportFactory?: PresentationTransportFactory;
};

export type UsePresentationSyncResult = {
  configured: boolean;
  presenterMode: boolean;
  clientId: string;
  connection: PresentationConnectionStatus;
  user: PresentationUser | null;
  authorization: PresentationAuthorizationStatus;
  isPresenting: boolean;
  liveSessionActive: boolean;
  isFollowing: boolean;
  isExploring: boolean;
  hadLiveSession: boolean;
  isBusy: boolean;
  error: PresentationTransportError | null;
  latestRemoteState: PresentationSnapshot | null;
  lastPublishedAt: number;
  lastReceivedAt: number;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  startPresenting: () => Promise<void>;
  stopPresenting: () => Promise<void>;
  exploreLocally: () => void;
  rejoinPresenter: () => void;
  publishNow: () => Promise<void>;
};
