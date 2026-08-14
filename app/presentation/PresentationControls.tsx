"use client";

import { useEffect, useId, useRef, useState } from "react";

import "./presentation-controls.css";

export type PresentationConnectionState =
  | "online"
  | "connecting"
  | "offline"
  | "error"
  | "unconfigured";

export type PresenterAuthState =
  | "signed-out"
  | "signing-in"
  | "authorized"
  | "unauthorized"
  | "unavailable";

export type AudienceFollowState =
  | "following"
  | "exploring"
  | "connecting"
  | "lost";

export interface PresenterPanelProps {
  /** Presenter controls render only on the explicit presenter route. */
  visible: boolean;
  connection: PresentationConnectionState;
  auth: PresenterAuthState;
  isLive: boolean;
  audienceUrl: string;
  userName?: string | null;
  userEmail?: string | null;
  statusMessage?: string | null;
  errorMessage?: string | null;
  lastPublishedLabel?: string | null;
  isBusy?: boolean;
  onSignIn: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onCopyAudienceLink?: () => void | Promise<void>;
}

export interface AudienceFollowControlProps {
  /** Keep false unless a live session is active or has just lost connection. */
  visible: boolean;
  followState: AudienceFollowState;
  connection: PresentationConnectionState;
  statusMessage?: string | null;
  lastSyncedLabel?: string | null;
  onExplore: () => void;
  onRejoin: () => void;
}

export interface PresentationInteractionShieldProps {
  active: boolean;
  /** Optional description for assistive technology. */
  label?: string;
}

const presentationFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getPresentationFocusTargets() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(presentationFocusableSelector),
  ).filter((element) => {
    if (!element.closest("[data-presentation-control]")) return false;
    if (element.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
    return element.tabIndex >= 0;
  });
}

function getAudienceFocusTarget() {
  return document.querySelector<HTMLElement>(
    ".presentation-audience-control .presentation-button.is-explore:not(:disabled)",
  ) || getPresentationFocusTargets()[0] || null;
}

const connectionCopy: Record<
  PresentationConnectionState,
  { label: string; detail: string }
> = {
  online: {
    label: "Connected",
    detail: "Presentation service is available.",
  },
  connecting: {
    label: "Connecting",
    detail: "Establishing a secure connection…",
  },
  offline: {
    label: "Offline",
    detail: "Changes cannot be shared until the connection returns.",
  },
  error: {
    label: "Connection error",
    detail: "The live presentation service could not be reached.",
  },
  unconfigured: {
    label: "Setup required",
    detail: "Live presentation is disabled until Firebase is configured.",
  },
};

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <rect x="6" y="6" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.5 6V4.5A1.5 1.5 0 0 0 12 3H4.5A1.5 1.5 0 0 0 3 4.5V12A1.5 1.5 0 0 0 4.5 13.5H6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function BroadcastIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20">
      <circle cx="10" cy="10" r="2" fill="currentColor" />
      <path d="M6.7 6.7a4.7 4.7 0 0 0 0 6.6M13.3 6.7a4.7 4.7 0 0 1 0 6.6M4 4a8.5 8.5 0 0 0 0 12M16 4a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path fill="currentColor" d="M18.2 10.2c0-.6-.1-1.2-.2-1.8H10v3.4h4.6a4 4 0 0 1-1.7 2.6v2.2h2.8c1.6-1.5 2.5-3.7 2.5-6.4Z" />
      <path fill="currentColor" opacity=".8" d="M10 18.5c2.3 0 4.3-.8 5.7-2l-2.8-2.1c-.8.5-1.8.8-2.9.8a5 5 0 0 1-4.7-3.4H2.4V14a8.6 8.6 0 0 0 7.6 4.5Z" />
      <path fill="currentColor" opacity=".62" d="M5.3 11.8a5.1 5.1 0 0 1 0-3.3V6.3H2.4a8.6 8.6 0 0 0 0 7.7l2.9-2.2Z" />
      <path fill="currentColor" opacity=".45" d="M10 5.1c1.3 0 2.4.4 3.3 1.3L15.8 4A8.2 8.2 0 0 0 2.4 6.3l2.9 2.2A5 5 0 0 1 10 5.1Z" />
    </svg>
  );
}

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const temporaryInput = document.createElement("textarea");
  temporaryInput.value = value;
  temporaryInput.setAttribute("readonly", "");
  temporaryInput.style.position = "fixed";
  temporaryInput.style.opacity = "0";
  document.body.appendChild(temporaryInput);
  temporaryInput.select();
  const copied = document.execCommand("copy");
  temporaryInput.remove();
  if (!copied) throw new Error("Copy command was not accepted.");
}

/**
 * Presenter-only control panel. It intentionally contains no Firebase logic;
 * authentication and session callbacks are supplied by the presentation hook.
 */
export function PresenterPanel({
  visible,
  connection,
  auth,
  isLive,
  audienceUrl,
  userName,
  userEmail,
  statusMessage,
  errorMessage,
  lastPublishedLabel,
  isBusy = false,
  onSignIn,
  onSignOut,
  onStart,
  onStop,
  onCopyAudienceLink,
}: PresenterPanelProps) {
  const headingId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  if (!visible) return null;

  const connectionStatus = connectionCopy[connection];
  const configured = connection !== "unconfigured";
  const authorized = auth === "authorized";
  const canStart = configured && connection === "online" && authorized && !isBusy;
  const canStop = connection === "online" && authorized && !isBusy;

  const copyAudienceLink = async () => {
    try {
      if (onCopyAudienceLink) await onCopyAudienceLink();
      else await writeClipboard(audienceUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopyState("idle"), 2400);
  };

  return (
    <aside
      className={`presentation-presenter-panel presentation-control-surface ${isLive ? "is-live" : "is-idle"}`}
      aria-labelledby={headingId}
      data-presentation-control
    >
      <header className="presentation-panel-header">
        <span className="presentation-panel-icon" aria-hidden="true">
          <BroadcastIcon />
        </span>
        <div>
          <p className="presentation-panel-eyebrow">Live presentation</p>
          <h2 id={headingId}>Presenter controls</h2>
        </div>
        <span
          className={`presentation-connection-badge is-${connection}`}
          title={connectionStatus.detail}
        >
          <i aria-hidden="true" />
          {connectionStatus.label}
        </span>
      </header>

      <div className="presentation-panel-body">
        {connection === "unconfigured" && (
          <div className="presentation-notice is-setup" role="status">
            <strong>Live mode is not configured</strong>
            <span>
              Add the Firebase browser configuration to enable sign-in and audience following.
              The public timeline remains safely read-only.
            </span>
          </div>
        )}

        {connection === "offline" && (
          <div className="presentation-notice is-warning" role="status">
            <strong>You are offline</strong>
            <span>The current view is not being published. Live controls will return when the connection recovers.</span>
          </div>
        )}

        {connection === "error" && (
          <div className="presentation-notice is-error" role="alert">
            <strong>Unable to reach live presentation</strong>
            <span>{errorMessage || connectionStatus.detail}</span>
          </div>
        )}

        {configured && auth === "signed-out" && (
          <section className="presentation-auth-card" aria-label="Presenter sign in">
            <div>
              <strong>Sign in to present</strong>
              <span>Only the authorized presenter account can publish a live view.</span>
            </div>
            <button
              className="presentation-button is-google"
              type="button"
              onClick={onSignIn}
              disabled={isBusy || connection === "offline"}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </section>
        )}

        {configured && auth === "signing-in" && (
          <div className="presentation-auth-card is-loading" role="status">
            <span className="presentation-spinner" aria-hidden="true" />
            <div>
              <strong>Completing sign-in</strong>
              <span>Waiting for Google authentication…</span>
            </div>
          </div>
        )}

        {configured && auth === "unauthorized" && (
          <div className="presentation-notice is-error" role="alert">
            <strong>This account is not authorized to present</strong>
            <span>
              {userEmail
                ? `${userEmail} can view the timeline but cannot publish presentation state.`
                : "Sign out and use the Google account authorized in the Firebase rules."}
            </span>
            <button className="presentation-text-button" type="button" onClick={onSignOut} disabled={isBusy}>
              Sign out and use another account
            </button>
          </div>
        )}

        {configured && auth === "unavailable" && (
          <div className="presentation-notice is-warning" role="status">
            <strong>Authorization check unavailable</strong>
            <span>
              {userEmail
                ? `${userEmail} is signed in, but Firebase must reconnect before presenter access can be confirmed.`
                : "Firebase must reconnect before presenter access can be confirmed."}
            </span>
            <button className="presentation-text-button" type="button" onClick={onSignOut} disabled={isBusy}>
              Sign out
            </button>
          </div>
        )}

        {authorized && (
          <>
            <section className="presentation-identity" aria-label="Signed-in presenter">
              <span className="presentation-avatar" aria-hidden="true">
                {(userName || userEmail || "P").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <small>Signed in as</small>
                <strong>{userName || userEmail || "Authorized presenter"}</strong>
                {userName && userEmail && <span>{userEmail}</span>}
              </div>
              <button className="presentation-text-button" type="button" onClick={onSignOut} disabled={isBusy || isLive}>
                Sign out
              </button>
            </section>

            <section className={`presentation-session-card ${isLive ? "is-live" : "is-ready"}`} aria-live="polite">
              <div className="presentation-session-status">
                <span className="presentation-live-mark" aria-hidden="true">
                  <i />
                  <i />
                </span>
                <div>
                  <strong>{isLive ? "Live for audience" : "Ready to present"}</strong>
                  <span>
                    {isLive
                      ? "Audience screens are following this timeline view."
                      : "Starting will guide anyone viewing the public audience URL."}
                  </span>
                </div>
              </div>

              <div className="presentation-session-actions">
                {isLive ? (
                  <button
                    className="presentation-button is-stop"
                    type="button"
                    onClick={onStop}
                    disabled={!canStop}
                  >
                    <span aria-hidden="true">■</span>
                    Stop presenting
                  </button>
                ) : (
                  <button
                    className="presentation-button is-start"
                    type="button"
                    onClick={onStart}
                    disabled={!canStart}
                  >
                    <span aria-hidden="true">●</span>
                    Start presenting
                  </button>
                )}

                <button
                  className="presentation-button is-copy"
                  type="button"
                  onClick={copyAudienceLink}
                  disabled={!audienceUrl || isBusy}
                >
                  <CopyIcon />
                  {copyState === "copied"
                    ? "Audience link copied"
                    : copyState === "failed"
                      ? "Copy failed"
                      : "Copy audience link"}
                </button>
              </div>

              {(lastPublishedLabel || statusMessage) && (
                <p className="presentation-session-meta">
                  {statusMessage || (isLive ? `Last update ${lastPublishedLabel}` : lastPublishedLabel)}
                </p>
              )}
            </section>
          </>
        )}

        {errorMessage && connection !== "error" && (
          <p className="presentation-inline-error" role="alert">
            {errorMessage}
          </p>
        )}

        <p className="presentation-sr-status" aria-live="polite">
          {copyState === "copied" && "Audience link copied to clipboard."}
          {copyState === "failed" && "Audience link could not be copied."}
          {isLive && "Presentation is live."}
        </p>
      </div>
    </aside>
  );
}

/**
 * Compact audience control. It appears only while following, exploring, or
 * recovering a previously live session.
 */
export function AudienceFollowControl({
  visible,
  followState,
  connection,
  statusMessage,
  lastSyncedLabel,
  onExplore,
  onRejoin,
}: AudienceFollowControlProps) {
  const headingId = useId();

  if (!visible) return null;

  const isFollowing = followState === "following";
  const isExploring = followState === "exploring";
  const isConnecting = followState === "connecting";
  const isLost = followState === "lost";

  const title = isFollowing
    ? "Following presenter"
    : isExploring
      ? "Exploring locally"
      : isConnecting
        ? "Reconnecting to presenter"
        : "Presenter connection lost";

  const detail = statusMessage || (isFollowing
    ? "Your timeline view is being guided in real time."
    : isExploring
      ? "You can navigate independently until you rejoin."
      : isConnecting
        ? "Holding this view while the live connection returns."
        : "This view is paused. Rejoin when the presenter is available.");

  return (
    <aside
      className={`presentation-audience-control presentation-control-surface is-${followState} connection-${connection}`}
      aria-labelledby={headingId}
      aria-live="polite"
      data-presentation-control
    >
      <div className="presentation-audience-status">
        <span className="presentation-audience-icon" aria-hidden="true">
          {isConnecting ? <span className="presentation-spinner" /> : <BroadcastIcon />}
        </span>
        <div>
          <p className="presentation-audience-eyebrow">
            {isFollowing && <><i aria-hidden="true" /> Live</>}
            {isExploring && "Live presentation"}
            {isConnecting && "Live presentation"}
            {isLost && "Connection interrupted"}
          </p>
          <h2 id={headingId}>{title}</h2>
          <span>{detail}</span>
          {lastSyncedLabel && <small>Last synced {lastSyncedLabel}</small>}
        </div>
      </div>

      {isFollowing ? (
        <button className="presentation-button is-explore" type="button" onClick={onExplore}>
          Explore locally
        </button>
      ) : (
        <button
          className="presentation-button is-rejoin"
          type="button"
          onClick={onRejoin}
          disabled={isConnecting || isLost || connection !== "online"}
        >
          {isConnecting ? "Rejoining…" : isLost ? "Waiting for presenter" : "Rejoin presenter"}
        </button>
      )}
    </aside>
  );
}

/**
 * Blocks pointer and keyboard interaction with the page while an audience
 * member follows the presenter. Controls marked with data-presentation-control
 * remain operable because they are rendered above this shield.
 */
export function PresentationInteractionShield({
  active,
  label = "Timeline controls are locked while following the presenter.",
}: PresentationInteractionShieldProps) {
  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const isPresentationControl = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest("[data-presentation-control]"));

    const focusAudienceControl = () => {
      getAudienceFocusTarget()?.focus({ preventScroll: true });
    };

    const blockBackgroundKeys = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const focusTargets = getPresentationFocusTargets();
        if (focusTargets.length === 0) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const activeElement = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        const activeIndex = activeElement ? focusTargets.indexOf(activeElement) : -1;
        const focusIsWithinControls = activeElement !== null && isPresentationControl(activeElement);

        if (!isPresentationControl(event.target) || !focusIsWithinControls || activeIndex < 0) {
          event.preventDefault();
          event.stopPropagation();
          focusTargets[event.shiftKey ? focusTargets.length - 1 : 0]?.focus({ preventScroll: true });
          return;
        }

        const leavingStart = event.shiftKey && activeIndex === 0;
        const leavingEnd = !event.shiftKey && activeIndex === focusTargets.length - 1;
        if (leavingStart || leavingEnd) {
          event.preventDefault();
          focusTargets[leavingStart ? focusTargets.length - 1 : 0]?.focus({ preventScroll: true });
        }

        // Keep page-level keyboard handlers from seeing focus-navigation keys.
        event.stopPropagation();
        return;
      }

      if (isPresentationControl(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const keepFocusWithinControls = (event: FocusEvent) => {
      if (isPresentationControl(event.target)) return;
      event.stopPropagation();
      focusAudienceControl();
    };

    const blockBackgroundScroll = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", blockBackgroundKeys, true);
    document.addEventListener("focusin", keepFocusWithinControls, true);
    document.addEventListener("wheel", blockBackgroundScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", blockBackgroundScroll, { capture: true, passive: false });
    focusAudienceControl();
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.removeEventListener("keydown", blockBackgroundKeys, true);
      document.removeEventListener("focusin", keepFocusWithinControls, true);
      document.removeEventListener("wheel", blockBackgroundScroll, true);
      document.removeEventListener("touchmove", blockBackgroundScroll, true);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="presentation-interaction-shield"
      data-presentation-shield
      aria-label={label}
      role="presentation"
      onContextMenu={(event) => event.preventDefault()}
      onWheel={(event) => event.preventDefault()}
      onTouchMove={(event) => event.preventDefault()}
    />
  );
}
