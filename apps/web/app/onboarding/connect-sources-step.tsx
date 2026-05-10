"use client";

import { useEffect, useRef } from "react";
import { DiscoveryFeed } from "./discovery-feed";
import { useIngestionStream } from "./use-ingestion-stream";
import styles from "./page.module.css";

const GOOGLE_SVG = (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const SLACK_SVG = (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A" />
    <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0" />
    <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.522-2.521V2.522A2.528 2.528 0 0 1 15.164 0a2.528 2.528 0 0 1 2.522 2.522v6.312z" fill="#2EB67D" />
    <path d="M15.164 18.956a2.528 2.528 0 0 1 2.522 2.522A2.528 2.528 0 0 1 15.164 24a2.528 2.528 0 0 1-2.522-2.522v-2.522h2.522zm0-1.27a2.528 2.528 0 0 1-2.522-2.522 2.528 2.528 0 0 1 2.522-2.522h6.314A2.528 2.528 0 0 1 24 15.164a2.528 2.528 0 0 1-2.522 2.522h-6.314z" fill="#ECB22E" />
  </svg>
);

const CHECK_SVG = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function ConnectSourcesStep({
  brainId,
  connected,
}: {
  brainId: string;
  connected: string[];
}) {
  const syncTriggered = useRef(false);

  const googleConnected = connected.includes("gmail") || connected.includes("google_drive");
  const slackConnected = connected.includes("slack");

  const { progress, entities, phase } = useIngestionStream(brainId, googleConnected);

  useEffect(() => {
    if (!googleConnected) return;

    const syncKey = `arvya-sync-${brainId}`;
    const alreadySyncing = sessionStorage.getItem(syncKey);

    if (!alreadySyncing && !syncTriggered.current) {
      syncTriggered.current = true;
      sessionStorage.setItem(syncKey, "true");
      fetch(`/api/brains/${brainId}/sync`, { method: "POST" }).catch(() => {});
    }
  }, [googleConnected, brainId]);

  function connectGoogle() {
    const returnUrl = encodeURIComponent(`${window.location.origin}/onboarding`);
    window.location.href = `/api/connectors/google/auth/start?brainId=${brainId}&return=${returnUrl}`;
  }

  function connectSlack() {
    const returnUrl = encodeURIComponent(`${window.location.origin}/onboarding`);
    window.location.href = `/api/connectors/slack/auth/start?brainId=${brainId}&return=${returnUrl}`;
  }

  function finish() {
    window.location.href = `/brains/${brainId}`;
  }

  const showFeed = googleConnected;

  return (
    <>
      <div className={styles.eyebrow}>STEP 2 OF 2</div>
      <h2>Connect your sources.</h2>
      <p className={styles.lede}>
        Arvya reads your email, calendar, and messages to build a knowledge
        graph of your people, commitments, and open loops. It never sends
        anything on your behalf without approval.
      </p>

      <div className={showFeed ? styles.connectGrid : undefined}>
        <div>
          <div className={styles.sourceList}>
            <button
              type="button"
              className={`${styles.sourceBtn} ${googleConnected ? styles.sourceBtnDone : ""}`}
              onClick={googleConnected ? undefined : connectGoogle}
              disabled={googleConnected}
            >
              <span className={styles.sourceLogo}>{GOOGLE_SVG}</span>
              <div>
                <div className={styles.sourceNm}>Google</div>
                <div className={styles.sourceDesc}>
                  {googleConnected ? "Gmail, Calendar, and Drive connected" : "Gmail, Calendar, and Drive"}
                </div>
              </div>
              <span className={styles.sourceAction}>
                {googleConnected ? CHECK_SVG : "Connect"}
              </span>
            </button>

            <button
              type="button"
              className={`${styles.sourceBtn} ${slackConnected ? styles.sourceBtnDone : ""}`}
              onClick={slackConnected ? undefined : connectSlack}
              disabled={slackConnected}
            >
              <span className={styles.sourceLogo}>{SLACK_SVG}</span>
              <div>
                <div className={styles.sourceNm}>Slack</div>
                <div className={styles.sourceDesc}>
                  {slackConnected ? "Channels and threads connected" : "Channels and threads"}
                </div>
              </div>
              <span className={styles.sourceAction}>
                {slackConnected ? CHECK_SVG : "Connect"}
              </span>
            </button>
          </div>

          <div className={styles.privacyNote}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              Read-only by default. Personal-labelled items are always invisible.
              Disconnect any source and its memory expires within 30 days.
            </span>
          </div>

          <div className={styles.ctas}>
            <button type="button" className={`${styles.btn} ${styles.btnGold}`} onClick={finish}>
              Take me to dashboard
            </button>
            {!googleConnected && !slackConnected && (
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={finish}>
                Skip for now
              </button>
            )}
          </div>
        </div>

        {showFeed && (
          <DiscoveryFeed progress={progress} entities={entities} phase={phase} />
        )}
      </div>
    </>
  );
}
