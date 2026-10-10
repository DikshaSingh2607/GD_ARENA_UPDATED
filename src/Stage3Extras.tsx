import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { TopicPack, TranscriptLine } from "./types";

/** The three pressure presets understood by the Stage 3 controls. */
export type PressureLevel = "Friendly" | "Realistic" | "Cut-throat";

const pressureOptions = [
  {
    value: "Friendly" as const,
    hint: "Warm prompts and generous turns",
    color: "#8ee3b1",
  },
  {
    value: "Realistic" as const,
    hint: "Natural pace with useful challenge",
    color: "#8dc8ff",
  },
  {
    value: "Cut-throat" as const,
    hint: "Fast rebuttals and little recovery time",
    color: "#ff9e9e",
  },
];

const ui = {
  panel: {
    background: "#111a28",
    border: "1px solid #26374b",
    borderRadius: 16,
    boxShadow: "0 14px 36px rgba(2, 8, 20, 0.24)",
    color: "#e9f0fa",
    padding: 20,
  } satisfies CSSProperties,
  muted: {
    color: "#91a5bc",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  eyebrow: {
    color: "#88b7df",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  } satisfies CSSProperties,
  title: {
    fontSize: 18,
    letterSpacing: "-0.02em",
    margin: "4px 0 5px",
  } satisfies CSSProperties,
  smallButton: {
    background: "#1c2a3d",
    border: "1px solid #39516d",
    borderRadius: 9,
    color: "#dbe9f8",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    padding: "8px 11px",
  } satisfies CSSProperties,
};

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <header>
      <p style={ui.eyebrow}>{eyebrow}</p>
      <h2 style={ui.title}>{title}</h2>
      {detail ? <p style={{ ...ui.muted, margin: 0 }}>{detail}</p> : null}
    </header>
  );
}

function wordsIn(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function uniqueNonEmpty(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export interface PressureDialProps {
  value: PressureLevel;
  onChange: (value: PressureLevel) => void;
  disabled?: boolean;
}

/** A keyboard-accessible three-card pressure selector. */
export function PressureDial({ value, onChange, disabled = false }: PressureDialProps) {
  return (
    <section aria-labelledby="pressure-dial-title" style={ui.panel}>
      <SectionHeading
        eyebrow="Room settings"
        title="Pressure dial"
        detail="Choose how hard the room should press you between turns."
      />
      <h3 id="pressure-dial-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Pressure level
      </h3>
      <div
        aria-label="Pressure level"
        role="radiogroup"
        style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", marginTop: 16 }}
      >
        {pressureOptions.map((option) => {
          const selected = option.value === value;
          return (
            <button
              aria-checked={selected}
              disabled={disabled}
              key={option.value}
              onClick={() => onChange(option.value)}
              role="radio"
              style={{
                background: selected ? "#1c3046" : "#172333",
                border: `1px solid ${selected ? option.color : "#2a3d54"}`,
                borderRadius: 12,
                color: "#edf5ff",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                padding: 14,
                textAlign: "left",
                transition: "border-color 160ms ease, background 160ms ease",
              }}
              type="button"
            >
              <span style={{ alignItems: "center", display: "flex", gap: 8, fontSize: 14, fontWeight: 750 }}>
                <span aria-hidden="true" style={{ background: option.color, borderRadius: "50%", height: 8, width: 8 }} />
                {option.value}
              </span>
              <span style={{ ...ui.muted, display: "block", marginTop: 7 }}>{option.hint}</span>
              <span aria-hidden="true" style={{ color: selected ? option.color : "#6f849c", display: "block", fontSize: 12, marginTop: 10 }}>
                {selected ? "Selected" : "Select"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** A TopicPack may optionally be enriched by an importer with verified facts. */
type TopicPackWithFacts = TopicPack & { facts?: readonly string[] };

export interface TopicPrimerProps {
  topicPack: TopicPack;
  /** Starts the silent visual preview on mount when true. Defaults to false. */
  autoPreview?: boolean;
  /** Kept configurable for tests and shorter previews; the normal value is 20 seconds. */
  previewDurationMs?: number;
  onSkip?: () => void;
  onDismiss?: () => void;
}

/**
 * A quiet, visual 20-second topic primer. It never invents facts: without two
 * supplied pack facts it explicitly presents angle examples as illustrative.
 */
export function TopicPrimer({
  topicPack,
  autoPreview = false,
  previewDurationMs = 20_000,
  onSkip,
  onDismiss,
}: TopicPrimerProps) {
  const [previewing, setPreviewing] = useState(autoPreview);
  const [dismissed, setDismissed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.max(1, Math.ceil(previewDurationMs / 1000)));
  const totalSeconds = Math.max(1, Math.ceil(previewDurationMs / 1000));
  const packWithFacts = topicPack as TopicPackWithFacts;
  const suppliedFacts = Array.isArray(packWithFacts.facts)
    ? packWithFacts.facts.filter((fact): fact is string => typeof fact === "string" && fact.trim().length > 0).slice(0, 2)
    : [];
  const hasTwoFacts = suppliedFacts.length === 2;
  const angles = topicPack.angles.slice(0, 3);
  const illustrativeExamples = angles.slice(0, 2);

  useEffect(() => {
    if (!previewing) return undefined;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          setPreviewing(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [previewing]);

  const startPreview = () => {
    setSecondsLeft(totalSeconds);
    setPreviewing(true);
  };

  const skipPreview = () => {
    setPreviewing(false);
    setSecondsLeft(0);
    onSkip?.();
  };

  const dismiss = () => {
    setDismissed(true);
    setPreviewing(false);
    onDismiss?.();
  };

  if (dismissed) return null;

  return (
    <section aria-labelledby="topic-primer-title" style={ui.panel}>
      <div style={{ alignItems: "flex-start", display: "flex", gap: 16, justifyContent: "space-between" }}>
        <SectionHeading eyebrow="Before you speak" title="Topic primer" detail="A silent visual preview — no audio, no timer pressure." />
        <button aria-label="Dismiss topic primer" onClick={dismiss} style={ui.smallButton} type="button">
          Dismiss
        </button>
      </div>
      <h2 id="topic-primer-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Topic primer
      </h2>
      <div aria-live="polite" style={{ background: "#0c1420", border: "1px solid #213349", borderRadius: 12, marginTop: 16, padding: 14 }}>
        <p style={{ color: "#f3f7fb", fontSize: 15, fontWeight: 700, lineHeight: 1.45, margin: 0 }}>{topicPack.debateQuestion}</p>
        <p style={{ ...ui.muted, margin: "8px 0 0" }}>{topicPack.definition}</p>
      </div>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: 15 }}>
        <div>
          <p style={ui.eyebrow}>Three angles</p>
          <ol style={{ color: "#cbd9e8", fontSize: 13, lineHeight: 1.45, margin: "8px 0 0", paddingLeft: 20 }}>
            {angles.length > 0 ? angles.map((angle) => <li key={angle.id} style={{ marginBottom: 6 }}>{angle.label}</li>) : <li>No angles supplied by this pack.</li>}
          </ol>
        </div>
        <div>
          <p style={ui.eyebrow}>{hasTwoFacts ? "Facts in this pack" : "Illustrative angle examples"}</p>
          <ul style={{ color: "#cbd9e8", fontSize: 13, lineHeight: 1.45, margin: "8px 0 0", paddingLeft: 18 }}>
            {hasTwoFacts
              ? suppliedFacts.map((fact, index) => <li key={`${fact}-${index}`} style={{ marginBottom: 6 }}>{fact}</li>)
              : illustrativeExamples.length > 0
                ? illustrativeExamples.map((angle) => <li key={`${angle.id}-example`} style={{ marginBottom: 6 }}>{angle.example}</li>)
                : <li>No examples supplied; use the definition as your starting point.</li>}
          </ul>
          {!hasTwoFacts ? <p style={{ ...ui.muted, fontSize: 11, margin: "7px 0 0" }}>Examples are prompts, not claimed statistics.</p> : null}
        </div>
      </div>
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 9, marginTop: 16 }}>
        {!previewing && secondsLeft === 0 ? (
          <button onClick={startPreview} style={{ ...ui.smallButton, background: "#24405a" }} type="button">Replay silent 20s</button>
        ) : !previewing ? (
          <button onClick={startPreview} style={{ ...ui.smallButton, background: "#24405a" }} type="button">Start silent preview</button>
        ) : null}
        {previewing ? (
          <>
            <span aria-live="polite" style={{ color: "#8ee3b1", fontSize: 12, fontWeight: 700 }}>Previewing silently · {secondsLeft}s</span>
            <button onClick={skipPreview} style={ui.smallButton} type="button">Skip preview</button>
          </>
        ) : null}
        {!previewing && secondsLeft === 0 ? <span style={ui.muted}>Preview complete.</span> : null}
      </div>
    </section>
  );
}

export interface GdPulseProps {
  active: boolean;
  lines: TranscriptLine[];
  topicPack: TopicPack;
  pressure: PressureLevel;
}

interface PulseStats {
  studentPercent: number;
  studentWords: number;
  panelWords: number;
  freshWords: number;
  freshnessPercent: number;
  listeningReferences: number;
  namedParticipants: string[];
  powerMoves: Array<{ label: string; done: boolean }>;
}

function buildPulseStats(lines: TranscriptLine[], topicPack: TopicPack): PulseStats {
  const studentLines = lines.filter((line) => line.speakerId === "student");
  const panelLines = lines.filter((line) => line.speakerId !== "student");
  const studentText = studentLines.map((line) => line.text).join(" ");
  const studentTokens = wordsIn(studentText);
  const studentWords = studentTokens.length;
  const panelWords = panelLines.reduce((total, line) => total + wordsIn(line.text).length, 0);
  const totalWords = studentWords + panelWords;
  const normalizedContent = studentTokens.filter((word) => word.length > 3 && !["that", "this", "with", "from", "have", "about", "there", "their", "would", "could", "should"].includes(word));
  const freshWords = new Set(normalizedContent).size;
  const names = uniqueNonEmpty(panelLines.map((line) => line.speakerName)).filter((name) => name.toLowerCase() !== "moderator");
  const lowerStudentText = studentText.toLowerCase();
  const namedParticipants = names.filter((name) => lowerStudentText.includes(name.toLowerCase()));
  const cueCount = studentLines.filter((line) => /(you said|your point|earlier|building on|i agree|i disagree|as .* mentioned|that point)/i.test(line.text)).length;
  const firstTimestamp = studentLines[0]?.timestamp;
  const firstThirtyText = firstTimestamp === undefined
    ? ""
    : studentLines.filter((line) => line.timestamp - firstTimestamp <= 30_000).map((line) => line.text).join(" ");
  const hasExample = /for example|for instance|e\.g\.|such as|one case/i.test(firstThirtyText);
  const hasNumber = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|percent|percentage)\b/i.test(firstThirtyText);
  const hasQuestion = /\?/.test(firstThirtyText);
  const hasName = names.some((name) => firstThirtyText.toLowerCase().includes(name.toLowerCase()));
  const hasSummary = /in short|to sum up|overall|in summary|therefore|this means/i.test(firstThirtyText);
  const hasConclusion = /to conclude|in conclusion|finally|my view is|that is why|i would conclude/i.test(firstThirtyText);
  const topicSignals = uniqueNonEmpty([
    ...topicPack.keywords.map((keyword) => keyword.keyword),
    ...topicPack.angles.map((angle) => angle.label),
  ]).filter((signal) => lowerStudentText.includes(signal.toLowerCase())).length;
  return {
    studentPercent: totalWords === 0 ? 0 : Math.round((studentWords / totalWords) * 100),
    studentWords,
    panelWords,
    freshWords: freshWords + topicSignals,
    freshnessPercent: normalizedContent.length === 0 ? 0 : Math.round((freshWords / normalizedContent.length) * 100),
    listeningReferences: cueCount + namedParticipants.length,
    namedParticipants,
    powerMoves: [
      { label: "Example", done: hasExample },
      { label: "Number", done: hasNumber },
      { label: "Question", done: hasQuestion },
      { label: "Participant name", done: hasName },
      { label: "Summary", done: hasSummary },
      { label: "Conclusion", done: hasConclusion },
    ],
  };
}

/** Live, code-derived coaching that is intentionally absent when the student is not speaking. */
export function GdPulse({ active, lines, topicPack, pressure }: GdPulseProps) {
  const stats = useMemo(() => buildPulseStats(lines, topicPack), [lines, topicPack]);
  if (!active) return null;
  const balanceLabel = stats.panelWords === 0 ? "No panel airtime yet" : `${stats.studentPercent}% you · ${100 - stats.studentPercent}% panel`;
  const tone = pressure === "Friendly" ? "steady" : pressure === "Realistic" ? "focused" : "decisive";

  return (
    <aside aria-label="Gd Pulse live coaching" style={{ ...ui.panel, borderColor: pressure === "Cut-throat" ? "#68414d" : "#2b5068" }}>
      <div style={{ alignItems: "flex-start", display: "flex", gap: 12, justifyContent: "space-between" }}>
        <SectionHeading eyebrow="Live coaching" title="Gd Pulse" detail={`A ${tone} read on your current turn · ${pressure} room`} />
        <span style={{ background: "#193d3a", border: "1px solid #2a6a5e", borderRadius: 999, color: "#91e3c2", fontSize: 11, fontWeight: 800, padding: "5px 8px" }}>LIVE</span>
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 16 }}>
        <div style={{ background: "#0c1420", borderRadius: 11, padding: 12 }}>
          <p style={ui.eyebrow}>Airtime balance</p>
          <p style={{ color: "#f3f7fb", fontSize: 20, fontWeight: 750, margin: "7px 0 3px" }}>{stats.studentPercent}%</p>
          <div aria-label={`Airtime: ${balanceLabel}`} role="img" style={{ background: "#27394d", borderRadius: 99, height: 6, overflow: "hidden" }}>
            <span style={{ background: "#8dc8ff", borderRadius: 99, display: "block", height: "100%", width: `${clamp(stats.studentPercent, 0, 100)}%` }} />
          </div>
          <p style={{ ...ui.muted, fontSize: 11, margin: "6px 0 0" }}>{balanceLabel}</p>
        </div>
        <div style={{ background: "#0c1420", borderRadius: 11, padding: 12 }}>
          <p style={ui.eyebrow}>Idea freshness</p>
          <p style={{ color: "#f3f7fb", fontSize: 20, fontWeight: 750, margin: "7px 0 3px" }}>{stats.freshnessPercent}%</p>
          <p style={{ ...ui.muted, fontSize: 11, margin: 0 }}>{stats.freshWords} distinct content signals in your turn</p>
        </div>
        <div style={{ background: "#0c1420", borderRadius: 11, padding: 12 }}>
          <p style={ui.eyebrow}>Listening references</p>
          <p style={{ color: "#f3f7fb", fontSize: 20, fontWeight: 750, margin: "7px 0 3px" }}>{stats.listeningReferences}</p>
          <p style={{ ...ui.muted, fontSize: 11, margin: 0 }}>{stats.namedParticipants.length > 0 ? `Named: ${stats.namedParticipants.join(", ")}` : "Use a point, name, or earlier cue"}</p>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #24374b", marginTop: 17, paddingTop: 15 }}>
        <div style={{ alignItems: "baseline", display: "flex", gap: 8, justifyContent: "space-between" }}>
          <p style={{ ...ui.eyebrow, color: "#d5b77d" }}>Power Moves</p>
          <span style={ui.muted}>first 30 seconds</span>
        </div>
        <div aria-label="Power Moves checklist" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", marginTop: 10 }}>
          {stats.powerMoves.map((move) => (
            <div key={move.label} style={{ alignItems: "center", color: move.done ? "#bcebd1" : "#8da0b5", display: "flex", fontSize: 12, gap: 7 }}>
              <span aria-hidden="true" style={{ alignItems: "center", background: move.done ? "#225443" : "#263548", borderRadius: "50%", color: move.done ? "#9df0be" : "#90a3b8", display: "inline-flex", fontSize: 11, height: 18, justifyContent: "center", width: 18 }}>{move.done ? "✓" : "·"}</span>
              {move.label}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export interface ProgressSession {
  id: string;
  topic: string;
  startedAt: number;
  endedAt: number;
  lines: TranscriptLine[];
  score?: number;
  /** Optional stored summary; when absent, the transcript is used as a conservative proxy. */
  summary?: string;
}

export interface ProgressPanelProps {
  sessions: ProgressSession[];
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function sessionStreak(sessions: ProgressSession[]): number {
  const dates = Array.from(new Set(sessions.map((session) => localDateKey(session.endedAt)))).sort().reverse();
  if (dates.length === 0) return 0;
  let streak = 1;
  for (let index = 1; index < dates.length; index += 1) {
    const newer = dateFromKey(dates[index - 1]).getTime();
    const older = dateFromKey(dates[index]).getTime();
    if (Math.round((newer - older) / 86_400_000) !== 1) break;
    streak += 1;
  }
  return streak;
}

function sessionText(session: ProgressSession): string {
  if (session.summary?.trim()) return session.summary;
  return session.lines.filter((line) => line.speakerId === "student").map((line) => line.text).join(" ");
}

function recurringHabits(sessions: ProgressSession[]): Array<{ label: string; count: number }> {
  const rules: Array<{ label: string; matches: (text: string, session: ProgressSession) => boolean }> = [
    { label: "Asks follow-up questions", matches: (text) => (text.match(/\?/g) ?? []).length > 0 },
    { label: "Uses concrete examples", matches: (text) => /for example|for instance|such as|e\.g\./i.test(text) },
    { label: "Acknowledges another point", matches: (text) => /you said|your point|earlier|building on|i agree|i disagree/i.test(text) },
    { label: "Closes with a summary", matches: (text) => /in short|to sum up|in summary|overall|to conclude|in conclusion/i.test(text) },
    { label: "Keeps turns compact", matches: (_text, session) => {
      const studentLines = session.lines.filter((line) => line.speakerId === "student");
      if (studentLines.length === 0) return false;
      const average = studentLines.reduce((sum, line) => sum + wordsIn(line.text).length, 0) / studentLines.length;
      return average <= 75;
    } },
  ];
  return rules
    .map((rule) => ({ label: rule.label, count: sessions.filter((session) => rule.matches(sessionText(session), session)).length }))
    .filter((habit) => habit.count >= 2)
    .sort((a, b) => b.count - a.count);
}

/** Progress overview with a dependency-free SVG chart and transcript-derived habits. */
export function ProgressPanel({ sessions }: ProgressPanelProps) {
  const ordered = useMemo(() => [...sessions].sort((a, b) => a.endedAt - b.endedAt), [sessions]);
  const streak = useMemo(() => sessionStreak(sessions), [sessions]);
  const habits = useMemo(() => recurringHabits(sessions), [sessions]);
  const scored = ordered.filter((session) => session.score !== undefined);
  const chartPoints = scored.map((session, index) => {
    const score = clamp(session.score ?? 0, 0, 100);
    const x = scored.length === 1 ? 20 : 20 + (index / (scored.length - 1)) * 260;
    const y = 88 - (score / 100) * 70;
    return { x, y, score, session };
  });
  const polyline = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <section aria-labelledby="progress-panel-title" style={ui.panel}>
      <SectionHeading eyebrow="Practice history" title="Progress" detail="Small signals over time, not a grade for one conversation." />
      <h2 id="progress-panel-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Progress panel</h2>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", marginTop: 16 }}>
        <div style={{ background: "#0c1420", borderRadius: 11, padding: 12 }}><p style={ui.eyebrow}>Session streak</p><p style={{ color: "#9de6c0", fontSize: 25, fontWeight: 800, margin: "6px 0 0" }}>{streak}<span style={{ color: "#91a5bc", fontSize: 12, fontWeight: 500 }}> days</span></p></div>
        <div style={{ background: "#0c1420", borderRadius: 11, padding: 12 }}><p style={ui.eyebrow}>Sessions logged</p><p style={{ color: "#dceaff", fontSize: 25, fontWeight: 800, margin: "6px 0 0" }}>{sessions.length}</p></div>
        <div style={{ background: "#0c1420", borderRadius: 11, padding: 12 }}><p style={ui.eyebrow}>Scored sessions</p><p style={{ color: "#dceaff", fontSize: 25, fontWeight: 800, margin: "6px 0 0" }}>{scored.length}</p></div>
      </div>
      <div style={{ borderTop: "1px solid #24374b", marginTop: 17, paddingTop: 15 }}>
        <p style={ui.eyebrow}>Score line</p>
        {chartPoints.length > 0 ? (
          <svg aria-label="Session scores over time" height="128" role="img" style={{ display: "block", marginTop: 8, overflow: "visible", width: "100%" }} viewBox="0 0 300 110">
            <line stroke="#26394e" strokeWidth="1" x1="20" x2="280" y1="88" y2="88" />
            <line stroke="#26394e" strokeDasharray="3 5" strokeWidth="1" x1="20" x2="280" y1="53" y2="53" />
            <line stroke="#26394e" strokeDasharray="3 5" strokeWidth="1" x1="20" x2="280" y1="18" y2="18" />
            <text fill="#71869c" fontSize="8" x="0" y="91">0</text><text fill="#71869c" fontSize="8" x="0" y="56">50</text><text fill="#71869c" fontSize="8" x="0" y="21">100</text>
            {chartPoints.length > 1 ? <polyline fill="none" points={polyline} stroke="#8dc8ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /> : null}
            {chartPoints.map((point) => <g key={point.session.id}><circle cx={point.x} cy={point.y} fill="#8dc8ff" r="4" stroke="#d8eeff" strokeWidth="1" /><title>{`${point.session.topic}: ${point.score}`}</title></g>)}
          </svg>
        ) : <p style={{ ...ui.muted, margin: "10px 0 0" }}>Add scores to saved sessions to see your line here.</p>}
      </div>
      <div style={{ borderTop: "1px solid #24374b", marginTop: 11, paddingTop: 15 }}>
        <p style={ui.eyebrow}>Recurring habits</p>
        {habits.length > 0 ? (
          <ul style={{ color: "#cbd9e8", fontSize: 13, lineHeight: 1.5, margin: "9px 0 0", paddingLeft: 18 }}>
            {habits.slice(0, 4).map((habit) => <li key={habit.label} style={{ marginBottom: 6 }}>{habit.label} <span style={{ color: "#91a5bc", fontSize: 11 }}>· {habit.count}/{sessions.length} sessions</span></li>)}
          </ul>
        ) : <p style={{ ...ui.muted, margin: "9px 0 0" }}>Two sessions with the same signal will surface a habit here.</p>}
      </div>
    </section>
  );
}

export interface RetryMomentProps {
  /** A tuple deliberately enforces exactly three context lines at integration time. */
  precedingLines: [TranscriptLine, TranscriptLine, TranscriptLine];
  onSubmit: (text: string) => void;
  response?: string;
  score?: number;
  onVoiceToggle?: () => void;
  isListening?: boolean;
  voiceText?: string;
  disabled?: boolean;
  placeholder?: string;
}

/** A focused text retry with an optional host-provided voice control and comparison result. */
export function RetryMoment({
  precedingLines,
  onSubmit,
  response,
  score,
  onVoiceToggle,
  isListening = false,
  voiceText,
  disabled = false,
  placeholder = "Try the point again in one clear sentence…",
}: RetryMomentProps) {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");
  const hasComparison = response !== undefined || score !== undefined;
  useEffect(() => { if (voiceText !== undefined) setDraft(voiceText); }, [voiceText]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setSubmitted(text);
    setDraft("");
  };

  return (
    <section aria-labelledby="retry-moment-title" style={ui.panel}>
      <SectionHeading eyebrow="One more chance" title="Retry moment" detail="Keep the meaning, then make the delivery cleaner." />
      <h2 id="retry-moment-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Retry moment</h2>
      <div style={{ background: "#0c1420", borderLeft: "3px solid #536f8d", borderRadius: "0 10px 10px 0", marginTop: 16, padding: "10px 13px" }}>
        <p style={{ ...ui.eyebrow, marginBottom: 7 }}>Before</p>
        {precedingLines.map((line) => <p key={line.id} style={{ color: "#b9c8d9", fontSize: 13, lineHeight: 1.45, margin: "5px 0" }}><strong style={{ color: "#e7f0fb" }}>{line.speakerName}:</strong> {line.text}</p>)}
      </div>
      <form onSubmit={submit}>
        <label htmlFor="retry-response" style={{ color: "#d8e5f2", display: "block", fontSize: 12, fontWeight: 700, margin: "15px 0 7px" }}>Your retry</label>
        <textarea
          aria-describedby="retry-help"
          disabled={disabled}
          id="retry-response"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          rows={4}
          style={{ background: "#0c1420", border: "1px solid #38516b", borderRadius: 10, boxSizing: "border-box", color: "#edf5ff", font: "inherit", fontSize: 14, lineHeight: 1.5, outline: "none", padding: 12, resize: "vertical", width: "100%" }}
          value={draft}
        />
        <p id="retry-help" style={{ ...ui.muted, fontSize: 11, margin: "6px 0 10px" }}>Type your answer, or use the voice control supplied by the host app.</p>
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 9 }}>
          <button disabled={disabled || draft.trim().length === 0} style={{ ...ui.smallButton, background: "#2b5875", opacity: disabled || draft.trim().length === 0 ? 0.5 : 1 }} type="submit">Submit retry</button>
          {onVoiceToggle ? <button aria-pressed={isListening} disabled={disabled} onClick={onVoiceToggle} style={{ ...ui.smallButton, borderColor: isListening ? "#76d8bd" : "#39516d" }} type="button">{isListening ? "Stop voice" : "Use voice"}</button> : null}
          {submitted ? <span aria-live="polite" style={{ color: "#91e3c2", fontSize: 12 }}>Retry sent.</span> : null}
        </div>
      </form>
      {hasComparison || submitted ? (
        <div aria-live="polite" style={{ background: "#142333", border: "1px solid #31516a", borderRadius: 11, marginTop: 16, padding: 13 }}>
          <p style={{ ...ui.eyebrow, color: "#9bd7ff" }}>After</p>
          {submitted ? <p style={{ color: "#d9e7f3", fontSize: 13, lineHeight: 1.5, margin: "7px 0 0" }}><strong>Your revised point:</strong> {submitted}</p> : null}
          {response !== undefined ? <p style={{ color: "#e8f3ff", fontSize: 14, lineHeight: 1.5, margin: "7px 0 0" }}>{response}</p> : null}
          {score !== undefined ? <p style={{ color: "#9de6c0", fontSize: 13, fontWeight: 750, margin: "8px 0 0" }}>Score: {score}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export type { TopicPack, TranscriptLine } from "./types";
