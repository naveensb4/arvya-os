"use client";

import { useState, useCallback } from "react";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
];

type Props = {
  brainId: string;
  brainName: string;
  meetingPrepEnabled: boolean;
  linkedinEnabled: boolean;
  webSearchEnabled: boolean;
  timezone: string;
  prepCountThisMonth: number;
};

export default function MeetingPrepSettingsClient(props: Props) {
  const [meetingPrepEnabled, setMeetingPrepEnabled] = useState(props.meetingPrepEnabled);
  const [linkedinEnabled, setLinkedinEnabled] = useState(props.linkedinEnabled);
  const [timezone, setTimezone] = useState(props.timezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const resp = await fetch(`/api/brains/${props.brainId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: {
            meeting_prep_enabled: meetingPrepEnabled,
            linkedin_enrichment_enabled: linkedinEnabled,
            timezone,
          },
        }),
      });
      if (resp.ok) {
        setSaved(true);
        if (meetingPrepEnabled && !props.meetingPrepEnabled) {
          await fetch(`/api/brains/${props.brainId}/meetings/next/prep`, {
            method: "POST",
          }).catch(() => {});
        }
      }
    } finally {
      setSaving(false);
    }
  }, [props.brainId, props.meetingPrepEnabled, meetingPrepEnabled, linkedinEnabled, timezone]);

  const estimatedCost = props.prepCountThisMonth * 0.15;

  return (
    <div style={{
      maxWidth: 720,
      margin: "0 auto",
      padding: "56px 48px 96px",
      fontFamily: "'Instrument Sans', -apple-system, sans-serif",
      color: "var(--text-primary, #0E1726)",
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase" as const,
        color: "var(--text-accent, #BC8530)",
        marginBottom: 8,
      }}>
        SETTINGS
      </div>
      <h1 style={{
        fontFamily: "'Roboto Slab', serif",
        fontSize: 36,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        margin: "0 0 12px",
      }}>
        Meeting Prep
      </h1>
      <p style={{
        fontSize: 17,
        color: "var(--text-secondary, #3D4970)",
        maxWidth: "56ch",
        lineHeight: 1.55,
        marginBottom: 40,
      }}>
        Get a prep brief in your DMs every morning, sourced from your Brain. Confidence-scored. No hallucinations.
      </p>

      <div style={{
        display: "flex",
        flexDirection: "column" as const,
        gap: 28,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={meetingPrepEnabled}
            onChange={(e) => setMeetingPrepEnabled(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: "var(--arvya-gold, #D89A3F)" }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Enable Meeting Prep</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary, #3D4970)" }}>
              Get a daily prep brief at 7am for upcoming meetings.
            </div>
          </div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={linkedinEnabled}
            onChange={(e) => setLinkedinEnabled(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: "var(--arvya-gold, #D89A3F)" }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Enable LinkedIn enrichment</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary, #3D4970)" }}>
              Pulls public LinkedIn profile data for attendees. Costs ~$0.10/profile via Proxycurl. Disabled by default.
            </div>
          </div>
        </label>

        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Timezone</div>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-subtle, #EBE5DC)",
              fontSize: 14,
              fontFamily: "'Instrument Sans', sans-serif",
              background: "white",
              minWidth: 240,
            }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <div style={{ fontSize: 13, color: "var(--text-secondary, #3D4970)", marginTop: 4 }}>
            7am cron fires in this timezone.
          </div>
        </div>

        <div style={{
          padding: "16px 20px",
          borderRadius: 10,
          background: "var(--cream-100, #FAF8F5)",
          border: "1px solid var(--border-subtle, #EBE5DC)",
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            Estimated cost this month
          </div>
          <div style={{ fontSize: 24, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            ${estimatedCost.toFixed(2)}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary, #3D4970)", marginTop: 4 }}>
            {props.prepCountThisMonth} meetings prepped · Updates daily based on actual usage.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              background: "var(--arvya-dark-900, #0E1726)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && (
            <span style={{ fontSize: 14, color: "var(--arvya-status-active, #059669)" }}>
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
