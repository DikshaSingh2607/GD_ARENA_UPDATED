import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LanguageMode, PressureLevel, TopicPack, TranscriptLine } from "./types";
import { ProgressPanel, RetryMoment } from "./Stage3Extras";
import type { ProgressSession } from "./Stage3Extras";
import { requestLiveLine } from "./lib/ai";
import { loadSessionHistory } from "./lib/storage";
import { PERSONA_BY_ID } from "./data/personas";
import { recognitionConstructor, speakText } from "./lib/speech";
import type { RecognitionLike } from "./lib/speechTypes";

/**
 * Integration: render this screen after a room session and pass the captured lines,
 * the room topic pack, an async server analysis callback, and a navigation callback.
 */
export interface ReportScreenProps {
  lines: TranscriptLine[];
  topicTitle: string;
  topicPack: TopicPack;
  sessionId: string;
  language: LanguageMode;
  pressure: PressureLevel;
  volume: number;
  voiceSpeed: number;
  onAnalyze: () => Promise<AnalysisResult | null>;
  onPractise: () => void;
}

export type Evidence = {
  quote: string;
  lineId: string;
  timestamp: number;
};

export type CriterionKey =
  | "starting"
  | "ideas"
  | "relevance"
  | "building"
  | "listening"
  | "interruptions"
  | "ending"
  | "clarity";

export type CriterionScore = {
  score: number;
  reason: string;
  evidence: Evidence[];
};

export type ReportFeedback = {
  text: string;
  evidence: Evidence[];
};

export type ReportAnalysis = {
  overallScore: number;
  summary: string;
  topStrength: ReportFeedback;
  topFix: ReportFeedback;
  criteria: Record<CriterionKey, CriterionScore>;
  strengths: ReportFeedback[];
  fixes: ReportFeedback[];
  drill: { title: string; instruction: string };
  missedOpenings: Array<{
    lineIds: string[];
    context: string;
    modelAnswer: string;
  }>;
  pointTags: Array<{
    lineId: string;
    tags: string[];
  }>;
  recruiterVerdict: {
    panels: Array<{
      panel: string;
      decision: string;
      reasons: Array<{ quote: string; lineId: string }>;
      lookedFor: string;
    }>;
  };
};

/** Alias used by the callback contract while keeping ReportAnalysis public for API types. */
export type AnalysisResult = ReportAnalysis;

type TranscriptFilter = "all" | "own" | "interrupted" | "fillers";
type StudentLine = TranscriptLine & { speakerId: "student" };

const CRITERIA: Array<{ key: CriterionKey; label: string }> = [
  { key: "starting", label: "Starting" },
  { key: "ideas", label: "Ideas" },
  { key: "relevance", label: "Relevance" },
  { key: "building", label: "Building" },
  { key: "listening", label: "Listening" },
  { key: "interruptions", label: "Interruptions" },
  { key: "ending", label: "Ending" },
  { key: "clarity", label: "Clarity" },
];
const FILLERS = ["um", "uh", "like", "you know", "basically", "actually", "matlab", "toh"];
const FILLER_REGEX = /\b(um+|uh+|like|you\s+know|basically|actually|matlab|toh)\b/gi;
const WORD_REGEX = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;
const STOP_WORDS = new Set(["the", "and", "for", "that", "this", "with", "from", "were", "have", "your", "you", "are", "was", "but", "not", "their", "they", "what", "when", "then", "into", "our", "will", "can", "just", "very", "like"]);

function words(text: string): string[] {
  return text.match(WORD_REGEX) ?? [];
}

function wordCount(text: string): number {
  return words(text).filter((word) => !/^(um+|uh+|erm+|hmm+)$/i.test(word)).length;
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatNumber(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function clampScore(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(10, number)) : 0;
}

function clampOverall(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

function normalise(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[“”‘’'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFiller(text: string): boolean {
  FILLER_REGEX.lastIndex = 0;
  const found = FILLER_REGEX.test(text);
  FILLER_REGEX.lastIndex = 0;
  return found;
}

function fillerCounts(studentLines: StudentLine[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(FILLERS.map((filler) => [filler, 0]));
  for (const line of studentLines) {
    FILLER_REGEX.lastIndex = 0;
    for (const match of line.text.matchAll(FILLER_REGEX)) {
      const key = match[0].toLocaleLowerCase().replace(/\s+/g, " ");
      const canonical = key.startsWith("um") ? "um" : key.startsWith("uh") ? "uh" : key;
      if (canonical in counts) counts[canonical] += 1;
    }
  }
  FILLER_REGEX.lastIndex = 0;
  return counts;
}

function highlightFillers(text: string) {
  return text.split(/(um+|uh+|like|you\s+know|basically|actually|matlab|toh)/gi).map((part, index) =>
    /^(um+|uh+|like|you\s+know|basically|actually|matlab|toh)$/i.test(part)
      ? <mark key={`filler-${index}`}>{part}</mark>
      : <span key={`text-${index}`}>{part}</span>,
  );
}

function tolerantEvidenceLine(quote: string, lineId: string | undefined, studentLines: StudentLine[]): StudentLine | null {
  const wanted = normalise(quote);
  if (!wanted) return null;
  const candidates = lineId ? studentLines.filter((line) => line.id === lineId) : studentLines;
  return candidates.find((line) => {
    const actual = normalise(line.text);
    return actual.includes(wanted) || wanted.includes(actual) || wanted.split(" ").filter(Boolean).every((token) => actual.includes(token));
  }) ?? null;
}

function validEvidence(evidence: unknown, studentLines: StudentLine[]): Evidence[] {
  if (!Array.isArray(evidence)) return [];
  return evidence.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<Evidence>;
    if (typeof candidate.quote !== "string") return [];
    const line = tolerantEvidenceLine(candidate.quote, typeof candidate.lineId === "string" ? candidate.lineId : undefined, studentLines);
    return line ? [{ quote: candidate.quote, lineId: line.id, timestamp: line.timestamp }] : [];
  });
}

function precedingThree(opening: ReportAnalysis["missedOpenings"][number], lines: TranscriptLine[]): [TranscriptLine, TranscriptLine, TranscriptLine] | null {
  const matched = opening.lineIds.map((id) => lines.findIndex((line) => line.id === id)).filter((index) => index >= 0);
  if (matched.length >= 3) return matched.slice(0, 3).map((index) => lines[index]) as [TranscriptLine, TranscriptLine, TranscriptLine];
  if (matched.length) {
    const anchor = Math.min(...matched);
    if (anchor >= 3) return lines.slice(anchor - 3, anchor) as [TranscriptLine, TranscriptLine, TranscriptLine];
  }
  return null;
}

function loadProgressSessions(): ProgressSession[] {
  let scores: Record<string, { score: number; summary?: string }> = {};
  try { scores = JSON.parse(localStorage.getItem("gd-arena-scores-v1") ?? "{}"); } catch { /* Keep the report available if history is corrupt. */ }
  return loadSessionHistory().map((session) => ({ ...session, score: scores[session.id]?.score, summary: scores[session.id]?.summary }));
}

function normaliseFeedback(value: unknown, studentLines: StudentLine[], fallback: string): ReportFeedback {
  if (typeof value === "string") return { text: value, evidence: [] };
  if (value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string") {
    const feedback = value as { text: string; evidence?: unknown };
    return { text: feedback.text, evidence: validEvidence(feedback.evidence, studentLines) };
  }
  return { text: fallback, evidence: [] };
}

function safeAnalysis(raw: AnalysisResult, studentLines: StudentLine[]): ReportAnalysis {
  const source = raw as Partial<ReportAnalysis>;
  const criteria = {} as Record<CriterionKey, CriterionScore>;
  for (const { key } of CRITERIA) {
    const value = source.criteria?.[key] as Partial<CriterionScore> | undefined;
    criteria[key] = {
      score: clampScore(value?.score),
      reason: typeof value?.reason === "string" ? value.reason : "No reason supplied.",
      evidence: validEvidence(value?.evidence, studentLines),
    };
  }
  const missed = Array.isArray(source.missedOpenings) ? source.missedOpenings : [];
  const pointTags = Array.isArray(source.pointTags) ? source.pointTags : [];
  const verdict = source.recruiterVerdict?.panels;
  return {
    overallScore: clampOverall(source.overallScore),
    summary: typeof source.summary === "string" ? source.summary : "No summary was returned.",
    topStrength: normaliseFeedback(source.topStrength, studentLines, "No top strength was returned."),
    topFix: normaliseFeedback(source.topFix, studentLines, "No top fix was returned."),
    criteria,
    strengths: Array.isArray(source.strengths) ? source.strengths.map((item) => normaliseFeedback(item, studentLines, "")).filter((item) => item.text) : [],
    fixes: Array.isArray(source.fixes) ? source.fixes.map((item) => normaliseFeedback(item, studentLines, "")).filter((item) => item.text) : [],
    drill: source.drill && typeof source.drill === "object" && typeof source.drill.title === "string" && typeof source.drill.instruction === "string"
      ? { title: source.drill.title, instruction: source.drill.instruction }
      : { title: "Practice drill", instruction: typeof source.drill === "string" ? source.drill : "No drill was returned." },
    missedOpenings: missed.flatMap((item) => item && typeof item === "object" && typeof item.context === "string" && typeof item.modelAnswer === "string"
      ? [{ lineIds: Array.isArray(item.lineIds) ? item.lineIds.filter((id): id is string => typeof id === "string") : [], context: item.context, modelAnswer: item.modelAnswer }]
      : []),
    pointTags: pointTags.flatMap((item) => item && typeof item === "object" && typeof item.lineId === "string"
      ? [{ lineId: item.lineId, tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [] }]
      : []),
    recruiterVerdict: {
      panels: Array.isArray(verdict) ? verdict.flatMap((panel) => {
        if (!panel || typeof panel !== "object" || typeof panel.panel !== "string") return [];
        return [{
          panel: panel.panel,
          decision: typeof panel.decision === "string" ? panel.decision : "No decision returned.",
          lookedFor: typeof panel.lookedFor === "string" ? panel.lookedFor : "",
          reasons: Array.isArray(panel.reasons) ? panel.reasons.flatMap((reason) => {
            if (!reason || typeof reason !== "object" || typeof reason.quote !== "string") return [];
            return [{ quote: reason.quote, lineId: typeof reason.lineId === "string" ? reason.lineId : "" }];
          }) : [],
        }];
      }) : [],
    },
  };
}

function metricLabel(label: string, value: string, note?: string) {
  return <div className="report-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export function ReportScreen({ lines, topicTitle, topicPack, sessionId, language, pressure, volume, voiceSpeed, onAnalyze, onPractise }: ReportScreenProps) {
  const [analysis, setAnalysis] = useState<ReportAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TranscriptFilter>("all");
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [progressSessions, setProgressSessions] = useState<ProgressSession[]>(() => loadProgressSessions());
  const [retryOpeningIndex, setRetryOpeningIndex] = useState<number | null>(null);
  const [retryResponse, setRetryResponse] = useState("");
  const [retryVoiceDraft, setRetryVoiceDraft] = useState("");
  const [retryListening, setRetryListening] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const lineRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const analyzeRef = useRef(onAnalyze);
  const retryRecognitionRef = useRef<RecognitionLike | null>(null);
  analyzeRef.current = onAnalyze;

  const orderedLines = useMemo(() => [...lines].sort((a, b) => a.timestamp - b.timestamp), [lines]);
  const studentLines = useMemo(() => orderedLines.filter((line): line is StudentLine => line.speakerId === "student"), [orderedLines]);
  const allWords = useMemo(() => orderedLines.reduce((sum, line) => sum + wordCount(line.text), 0), [orderedLines]);
  const studentWords = useMemo(() => studentLines.reduce((sum, line) => sum + wordCount(line.text), 0), [studentLines]);
  const speakerStats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; words: number; turns: number }>();
    for (const line of orderedLines) {
      const existing = map.get(line.speakerId) ?? { id: line.speakerId, name: line.speakerName, words: 0, turns: 0 };
      existing.words += wordCount(line.text);
      existing.turns += 1;
      map.set(line.speakerId, existing);
    }
    return [...map.values()];
  }, [orderedLines]);
  const metrics = useMemo(() => {
    const sessionStart = orderedLines[0]?.timestamp ?? 0;
    const firstStudent = studentLines[0];
    const lastStudent = studentLines.at(-1);
    const sessionDuration = orderedLines.length > 1 ? Math.max(0, (orderedLines.at(-1)!.timestamp - sessionStart) / 1000) : 0;
    const studentDuration = firstStudent && lastStudent ? Math.max(0, (lastStudent.timestamp - firstStudent.timestamp) / 1000) : 0;
    const studentGaps = studentLines.slice(1).map((line, index) => Math.max(0, (line.timestamp - studentLines[index].timestamp) / 1000));
    const sentenceLengths = studentLines.flatMap((line) => line.text.split(/[.!?]+/).map((sentence) => wordCount(sentence)).filter(Boolean));
    const interruptedMade = orderedLines.filter((line) => line.interrupted && line.speakerId !== "student").length;
    const interruptedReceived = orderedLines.filter((line) => line.interrupted && line.speakerId === "student").length;
    const repeated: Record<string, number> = {};
    for (const word of studentLines.flatMap((line) => words(line.text.toLocaleLowerCase()))) {
      if (!STOP_WORDS.has(word) && word.length > 2) repeated[word] = (repeated[word] ?? 0) + 1;
    }
    return {
      sessionDuration,
      timeToEnter: firstStudent && sessionStart ? Math.max(0, (firstStudent.timestamp - sessionStart) / 1000) : 0,
      wpm: studentWords / Math.max(studentDuration / 60, 1 / 12),
      turns: studentLines.length,
      averageTurn: studentWords / Math.max(studentLines.length, 1),
      firstSpeaker: orderedLines[0]?.speakerId === "student",
      interruptionsMade: interruptedMade,
      interruptionsReceived: interruptedReceived,
      longestSilence: Math.max(0, ...studentGaps),
      fillers: fillerCounts(studentLines),
      repeated: Object.entries(repeated).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 8),
      averageSentence: sentenceLengths.reduce((sum, value) => sum + value, 0) / Math.max(sentenceLengths.length, 1),
      fillerLines: studentLines.filter((line) => hasFiller(line.text)),
    };
  }, [orderedLines, studentLines, studentWords]);

  const validPointTags = useMemo(() => {
    if (!analysis) return [];
    const ids = new Set(studentLines.map((line) => line.id));
    return analysis.pointTags.filter((point) => ids.has(point.lineId));
  }, [analysis, studentLines]);
  const pointTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const point of validPointTags) for (const tag of point.tags) counts[tag] = (counts[tag] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [validPointTags]);
  const angleCoverage = useMemo(() => {
    const studentText = normalise(studentLines.map((line) => line.text).join(" "));
    return topicPack.angles.map((angle) => {
      const probes = [angle.id, angle.label, angle.argument, angle.example].map(normalise).filter((probe) => probe.length > 3);
      const covered = probes.some((probe) => studentText.includes(probe)) || topicPack.keywords.some((keyword) => {
        const key = normalise(keyword.keyword);
        return key.length > 2 && studentText.includes(key) && probes.some((probe) => probe.includes(key));
      });
      return { ...angle, covered };
    });
  }, [studentLines, topicPack]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await analyzeRef.current();
      const validated = result ? safeAnalysis(result, studentLines) : null;
      setAnalysis(validated);
      if (validated) {
        try {
          const scores = JSON.parse(localStorage.getItem("gd-arena-scores-v1") ?? "{}") as Record<string, { score: number; summary?: string }>;
          scores[sessionId] = { score: validated.overallScore, summary: validated.summary };
          localStorage.setItem("gd-arena-scores-v1", JSON.stringify(scores));
          setProgressSessions(loadProgressSessions());
        } catch { /* The report remains available without a scored progress entry. */ }
      }
      if (!result) setError("The analysis service returned no result. Your transcript is still available below.");
    } catch (reason) {
      console.error("GD Arena report analysis failed", reason);
      setAnalysis(null);
      setError("We could not load the analysis. Nothing was invented; please try again or review the transcript below.");
    } finally {
      setLoading(false);
    }
  }, [sessionId, studentLines]);

  useEffect(() => {
    void runAnalysis();
    // Analysis intentionally runs once when the report opens; the retry button uses the latest callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!analysis) return;
    try {
      localStorage.setItem("gd-arena-report-summary", JSON.stringify({
        topicTitle,
        savedAt: Date.now(),
        overallScore: analysis.overallScore,
        summary: analysis.summary,
        topStrength: analysis.topStrength,
        topFix: analysis.topFix,
      }));
      setSaved(true);
    } catch (reason) {
      console.warn("Could not save report summary locally", reason);
      setSaved(false);
    }
  }, [analysis, topicTitle]);

  const evidenceClick = useCallback((lineId: string) => {
    setActiveLineId(lineId);
    window.requestAnimationFrame(() => lineRefs.current[lineId]?.scrollIntoView({ behavior: "smooth", block: "center" }));
    window.setTimeout(() => setActiveLineId(null), 2200);
  }, []);

  const summaryText = useMemo(() => analysis
    ? `${topicTitle}\nScore ${formatNumber(analysis.overallScore, 1)}/100\n${analysis.summary}\nStrength: ${analysis.topStrength.text}\nFocus: ${analysis.topFix.text}`
    : `${topicTitle}\nReport analysis is not available yet.`, [analysis, topicTitle]);

  const shareSummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (reason) {
      console.warn("Could not copy report summary", reason);
      setCopied(false);
    }
  }, [summaryText]);

  const selectedOpening = retryOpeningIndex === null ? null : analysis?.missedOpenings[retryOpeningIndex] ?? null;
  const retryContext = useMemo(() => selectedOpening ? precedingThree(selectedOpening, orderedLines) : null, [orderedLines, selectedOpening]);
  const chooseRetryMoment = useCallback((index: number) => {
    const opening = analysis?.missedOpenings[index];
    if (!opening) return;
    const context = precedingThree(opening, orderedLines);
    if (!context) return;
    setRetryOpeningIndex(index);
    setRetryResponse("");
    setRetryVoiceDraft("");
    void (async () => {
      for (const line of context) {
        const speaker = line.speakerId === "student" ? "moderator" : line.speakerId;
        await speakText(line.text, speaker, language, undefined, { volume, voiceSpeed });
      }
    })();
  }, [analysis, language, orderedLines, volume, voiceSpeed]);
  const toggleRetryVoice = useCallback(() => {
    if (retryListening) {
      retryRecognitionRef.current?.stop();
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = language === "Hinglish" ? "hi-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => setRetryVoiceDraft(Array.from(event.results, (result) => result[0]?.transcript ?? "").join(" ").trim());
    recognition.onerror = () => setRetryListening(false);
    recognition.onend = () => { setRetryListening(false); retryRecognitionRef.current = null; };
    retryRecognitionRef.current = recognition;
    try { recognition.start(); setRetryListening(true); } catch { setRetryListening(false); }
  }, [language, retryListening]);
  const submitRetry = useCallback((text: string) => {
    if (!retryContext) return;
    setRetryBusy(true);
    setRetryResponse("");
    const last4 = [
      ...retryContext.map((line) => ({ speakerName: line.speakerName, text: line.text })),
      { speakerName: "You", text },
    ];
    const persona = PERSONA_BY_ID.get("rohan");
    const fallback = topicPack.scripts.rohan[0]?.text ?? "I would add one practical example to that point.";
    void requestLiveLine({
      speaker: "rohan", personaRole: persona?.role ?? "Dominator", language, pressure, intent: "discussion",
      topicPack, last4, pointsMade: [], usedAngles: [], ownEarlierPoint: text,
    }).then((line) => {
      const response = `Rohan: ${line.text}`;
      setRetryResponse(response);
      void speakText(line.text, "rohan", language, undefined, { volume, voiceSpeed });
    }).catch(() => {
      const response = `Rohan: ${fallback}`;
      setRetryResponse(`${response} (topic-bank response)`);
      void speakText(fallback, "rohan", language, undefined, { volume, voiceSpeed });
    }).finally(() => setRetryBusy(false));
  }, [language, pressure, retryContext, topicPack, volume, voiceSpeed]);
  useEffect(() => () => { retryRecognitionRef.current?.abort(); window.speechSynthesis?.cancel(); }, []);

  const filteredLines = orderedLines.filter((line) => {
    if (filter === "own") return line.speakerId === "student";
    if (filter === "interrupted") return line.interrupted;
    if (filter === "fillers") return line.speakerId === "student" && hasFiller(line.text);
    return true;
  });
  const maxSpeakerWords = Math.max(1, ...speakerStats.map((stat) => stat.words));
  const allFillerCount = Object.values(metrics.fillers).reduce((sum, count) => sum + count, 0);

  return (
    <main className="report-screen">
      <style>{REPORT_CSS}</style>
      <div className="report-shell">
        <header className="report-header">
          <div>
            <div className="report-eyebrow"><span className="report-rule" /> GD ARENA / POST-SESSION</div>
            <h1>Performance report</h1>
            <p className="report-topic">{topicTitle}</p>
          </div>
          <div className="report-actions">
            <button type="button" className="report-button report-button-quiet" onClick={() => window.print()}>Print</button>
            <button type="button" className="report-button report-button-quiet" onClick={() => void shareSummary()}>{copied ? "Copied" : "Share summary"}</button>
            <button type="button" className="report-button report-button-primary" onClick={onPractise}>Practise again</button>
          </div>
        </header>

        <section className="report-stage-intro">
          <div><span className="stage-label">STAGE 2</span><h2>Read the room, then read your signal</h2></div>
          <span className="report-save-note">{saved ? "Summary saved locally" : "Local save unavailable"}</span>
        </section>
        {loading && <div className="report-notice report-loading"><span className="report-spinner" /> Analysing your transcript… no score is shown until the response arrives.</div>}
        {error && <div className="report-notice report-error"><strong>Analysis unavailable.</strong> {error} <button type="button" className="report-inline-button" onClick={() => void runAnalysis()}>Retry</button></div>}

        <section className="report-overview-grid">
          <div className="report-card report-score-card">
            <span className="card-kicker">OVERALL SIGNAL</span>
            {analysis ? <><div className="score-ring" style={{ "--score": `${analysis.overallScore}%` } as React.CSSProperties}><strong>{formatNumber(analysis.overallScore, 1)}</strong><span>/ 100</span></div><p>{analysis.summary}</p></> : <p className="empty-copy">A score will appear here when the analysis is available.</p>}
          </div>
          <div className="report-card report-callout-card">
            <span className="card-kicker">TOP STRENGTH</span><p className="callout-value">{analysis?.topStrength.text || "Waiting for the analysis response."}</p>
            <span className="card-kicker">TOP FIX</span><p className="callout-value callout-fix">{analysis?.topFix.text || "No recommendation is shown without a response."}</p>
          </div>
          <div className="report-card report-metrics-card">
            <span className="card-kicker">YOUR SIGNALS</span>
            <div className="metric-grid">
              {metricLabel("Student WPM", formatNumber(metrics.wpm), "estimated from timestamps")}
              {metricLabel("Turns", String(metrics.turns))}
              {metricLabel("Avg turn", `${formatNumber(metrics.averageTurn)} words`)}
              {metricLabel("Time to enter", formatSeconds(metrics.timeToEnter))}
              {metricLabel("First speaker", metrics.firstSpeaker ? "Yes" : "No")}
              {metricLabel("Longest silence", formatSeconds(metrics.longestSilence))}
            </div>
          </div>
        </section>

        <section className="report-section">
          <div className="section-title-row"><div><span className="stage-label">PARTICIPATION</span><h2>Where the airtime went</h2></div><span className="section-note">Airtime is estimated from word count</span></div>
          <div className="airtime-layout">
            <div className="donut" style={{ background: `conic-gradient(${speakerStats.map((_, index) => `${index === 0 ? "#b7c795" : index % 2 ? "#71835d" : "#43523b"} ${(speakerStats.slice(0, index).reduce((sum, item) => sum + item.words, 0) / Math.max(allWords, 1)) * 360}deg ${((speakerStats.slice(0, index + 1).reduce((sum, item) => sum + item.words, 0) / Math.max(allWords, 1)) * 360)}deg`).join(", ")})` }}><div><strong>{studentWords}</strong><small>your words</small></div></div>
            <div className="airtime-list">{speakerStats.map((stat, index) => <div className="airtime-row" key={stat.id}><span className="legend-dot" style={{ background: index === 0 ? "#b7c795" : index % 2 ? "#71835d" : "#43523b" }} /><span>{stat.name}{stat.id === "student" ? " (you)" : ""}</span><strong>{formatNumber((stat.words / Math.max(allWords, 1)) * 100)}%</strong><small>{stat.words} words · {stat.turns} turns</small><div className="airtime-bar"><i style={{ width: `${(stat.words / maxSpeakerWords) * 100}%` }} /></div></div>)}</div>
          </div>
        </section>

        <section className="report-section">
          <div className="section-title-row"><div><span className="stage-label">CONVERSATION TRACE</span><h2>Timeline and interruptions</h2></div><span className="section-note">{orderedLines.length} transcript lines · {formatSeconds(metrics.sessionDuration)} span</span></div>
          <div className="timeline-card">{orderedLines.length ? orderedLines.map((line, index) => <div className={`timeline-row ${line.speakerId === "student" ? "timeline-student" : ""}`} key={`${line.id}-timeline`}><span className="timeline-time">{formatSeconds(Math.max(0, (line.timestamp - (orderedLines[0]?.timestamp ?? line.timestamp)) / 1000))}</span><span className="timeline-track"><i style={{ height: `${Math.max(12, Math.min(48, wordCount(line.text) * 2))}px` }} /></span><span className="timeline-speaker">{line.speakerName}{line.speakerId === "student" ? " · you" : ""}</span><span className="timeline-words">{wordCount(line.text)}w{line.interrupted ? " · cut" : ""}</span>{index < orderedLines.length - 1 && <span className="timeline-gap">{formatSeconds(Math.max(0, (orderedLines[index + 1].timestamp - line.timestamp) / 1000))}</span>}</div>) : <p className="empty-copy">No transcript lines were captured.</p>}</div>
          <div className="micro-metrics"><span>Interruptions made <strong>{metrics.interruptionsMade}</strong></span><span>Interruptions received <strong>{metrics.interruptionsReceived}</strong></span><span>Session span <strong>{formatSeconds(metrics.sessionDuration)}</strong></span></div>
        </section>

        <section className="report-section">
          <div className="section-title-row"><div><span className="stage-label">LANGUAGE PATTERNS</span><h2>What your words are doing</h2></div><span className="section-note">Filler counts are case-insensitive</span></div>
          <div className="pattern-grid">
            <div className="report-card"><span className="card-kicker">FILLERS</span><div className="tag-cloud">{FILLERS.map((filler) => <span key={filler} className={metrics.fillers[filler] ? "tag tag-active" : "tag"}>{filler} <b>{metrics.fillers[filler]}</b></span>)}</div><p className="card-footnote">{allFillerCount} total · avg sentence {formatNumber(metrics.averageSentence)} words</p></div>
            <div className="report-card"><span className="card-kicker">REPEATED WORDS</span><div className="tag-cloud">{metrics.repeated.length ? metrics.repeated.map(([word, count]) => <span className="tag tag-active" key={word}>{word} <b>{count}</b></span>) : <span className="muted">No repeated content words detected.</span>}</div><p className="card-footnote">A light signal, not a correctness judgement.</p></div>
            <div className="report-card"><span className="card-kicker">POINT TAGS</span><div className="tag-cloud">{pointTagCounts.length ? pointTagCounts.map(([tag, count]) => <span className="tag tag-active" key={tag}>{tag} <b>{count}</b></span>) : <span className="muted">Tags appear when the analysis returns them.</span>}</div></div>
          </div>
        </section>

        <section className="report-section">
          <div className="section-title-row"><div><span className="stage-label">TOPIC COVERAGE</span><h2>Angles you touched</h2></div><span className="section-note">Coverage is a transcript keyword estimate</span></div>
          <div className="angle-grid">{angleCoverage.length ? angleCoverage.map((angle) => <div className={`angle-card ${angle.covered ? "angle-covered" : ""}`} key={angle.id}><span>{angle.covered ? "COVERED" : "MISSED"}</span><strong>{angle.label}</strong><p>{angle.covered ? "Your transcript contains a signal for this angle." : "No matching angle signal was found in your lines."}</p></div>) : <p className="empty-copy">No topic angles were supplied.</p>}</div>
        </section>

        <section className="report-stage-intro stage-three"><div><span className="stage-label">STAGE 3</span><h2>Turn feedback into your next move</h2></div></section>
        {analysis && <>
          <section className="report-section criteria-section"><div className="section-title-row"><div><span className="stage-label">EIGHT CRITERIA</span><h2>How the panel read you</h2></div></div><div className="criteria-grid">{CRITERIA.map(({ key, label }) => { const item = analysis.criteria[key]; return <div className="criterion-card" key={key}><div className="criterion-top"><strong>{label}</strong><span>{formatNumber(item.score, 1)}<small>/10</small></span></div><div className="criterion-bar"><i style={{ width: `${item.score * 10}%` }} /></div><p>{item.reason}</p>{item.evidence.map((evidence, index) => <button type="button" className="evidence" key={`${evidence.lineId}-${index}`} onClick={() => evidenceClick(evidence.lineId)}><span>“{evidence.quote}”</span><small>{evidence.lineId} · {formatSeconds(Math.max(0, (evidence.timestamp - (orderedLines[0]?.timestamp ?? evidence.timestamp)) / 1000))}</small></button>)}</div>; })}</div></section>
          <section className="report-section"><div className="insight-grid"><div><span className="card-kicker">STRENGTHS</span><ol className="insight-list">{analysis.strengths.slice(0, 3).map((item, index) => <li key={`${item.text}-${index}`}>{item.text}</li>)}</ol></div><div><span className="card-kicker">FIXES</span><ol className="insight-list insight-fixes">{analysis.fixes.slice(0, 3).map((item, index) => <li key={`${item.text}-${index}`}>{item.text}</li>)}</ol></div><div className="drill-card"><span className="card-kicker">ONE DRILL</span><strong>{analysis.drill.title}</strong><p>{analysis.drill.instruction}</p></div></div></section>
          <section className="report-section"><div className="section-title-row"><div><span className="stage-label">MISSED OPENINGS</span><h2>Places you could have entered</h2></div><span className="section-note">Only model answers returned by the analysis are shown</span></div><div className="opening-grid">{analysis.missedOpenings.slice(0, 5).map((opening, index) => { const canRetry = Boolean(precedingThree(opening, orderedLines)); return <div className="opening-card" key={`${opening.context}-${index}`}><span className="opening-index">0{index + 1}</span><p><strong>Context</strong>{opening.context}</p><p><strong>Model answer</strong>{opening.modelAnswer}</p>{opening.lineIds.length > 0 && <small>Related lines: {opening.lineIds.join(", ")}</small>}<button type="button" className="report-button report-button-quiet" disabled={!canRetry} onClick={() => chooseRetryMoment(index)}>{canRetry ? "Replay 3 lines and retry" : "Not enough transcript context"}</button></div>; })}</div>{analysis.missedOpenings.length === 0 && <p className="empty-copy">No missed openings were returned.</p>}{retryOpeningIndex !== null && selectedOpening && retryContext && <div className="retry-moment-wrap"><div className="section-title-row"><div><span className="stage-label">RETRY THE MOMENT</span><h2>{selectedOpening.context}</h2></div><button type="button" className="report-button report-button-quiet" onClick={() => setRetryOpeningIndex(null)}>Close retry</button></div><RetryMoment key={retryOpeningIndex} precedingLines={retryContext} onSubmit={submitRetry} response={retryResponse || (retryBusy ? "Rohan is preparing a response…" : undefined)} onVoiceToggle={recognitionConstructor() ? toggleRetryVoice : undefined} isListening={retryListening} voiceText={retryVoiceDraft} disabled={retryBusy} /></div>}</section>
          <section className="report-section"><div className="section-title-row"><div><span className="stage-label">RECRUITER LENS</span><h2>What different panels might decide</h2></div></div><div className="panel-grid">{analysis.recruiterVerdict.panels.map((panel) => <div className="panel-card" key={panel.panel}><span className="card-kicker">{panel.panel}</span><strong>{panel.decision}</strong><p>{panel.lookedFor}</p>{panel.reasons.map((reason, index) => { const line = tolerantEvidenceLine(reason.quote, reason.lineId, studentLines); return line ? <button type="button" className="evidence" key={`${line.id}-${index}`} onClick={() => evidenceClick(line.id)}><span>“{reason.quote}”</span><small>{line.id}</small></button> : null; })}</div>)}</div>{analysis.recruiterVerdict.panels.length === 0 && <p className="empty-copy">No recruiter verdict was returned.</p>}</section>
        </>}

        <section className="report-section transcript-section">
          <div className="section-title-row"><div><span className="stage-label">SOURCE TRANSCRIPT</span><h2>Review the moments</h2></div><span className="section-note">Evidence is validated against your lines only</span></div>
          <div className="filter-row">{(["all", "own", "interrupted", "fillers"] as TranscriptFilter[]).map((item) => <button type="button" className={filter === item ? "filter-active" : ""} key={item} onClick={() => setFilter(item)}>{item === "own" ? "My lines" : item[0].toUpperCase() + item.slice(1)}{item === "fillers" && metrics.fillerLines.length ? ` · ${metrics.fillerLines.length}` : ""}</button>)}</div>
          <div className="transcript-list">{filteredLines.map((line) => { const point = line.speakerId === "student" ? validPointTags.find((item) => item.lineId === line.id) : undefined; return <div ref={(node) => { lineRefs.current[line.id] = node; }} className={`transcript-line ${line.speakerId === "student" ? "transcript-own" : ""} ${line.interrupted ? "transcript-interrupted" : ""} ${activeLineId === line.id ? "transcript-highlight" : ""}`} key={line.id}><div><span className="transcript-speaker">{line.speakerName}{line.speakerId === "student" ? " · you" : ""}</span><small>{line.id} · {formatSeconds(Math.max(0, (line.timestamp - (orderedLines[0]?.timestamp ?? line.timestamp)) / 1000))}</small></div><p>{line.speakerId === "student" ? highlightFillers(line.text) : line.text}</p>{point && <div className="tag-cloud transcript-tags">{point.tags.map((tag) => <span className="tag tag-active" key={`${line.id}-${tag}`}>{tag}</span>)}</div>}{line.interrupted && <span className="interrupt-label">interrupted</span>}{line.speakerId === "student" && hasFiller(line.text) && <span className="filler-label">filler signal</span>}</div>; })}{filteredLines.length === 0 && <p className="empty-copy">No lines match this filter.</p>}</div>
        </section>
        <section className="report-section"><ProgressPanel sessions={progressSessions} /></section>
        <footer className="report-footer"><span>GD Arena · a practice signal, not a verdict</span><button type="button" className="report-button report-button-primary" onClick={onPractise}>Start another practice</button></footer>
      </div>
    </main>
  );
}

const REPORT_CSS = `
.report-screen{min-height:100vh;background:#121713;color:#e8e9e2;font-family:'DM Sans',sans-serif;padding:0 0 56px}.report-shell{width:min(1180px,calc(100% - 48px));margin:auto}.report-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:38px 0 28px;border-bottom:1px solid rgba(221,231,215,.1)}.report-eyebrow,.stage-label,.card-kicker{color:#909b88;font:500 9px/1.2 'DM Mono',monospace;letter-spacing:.15em}.report-rule{display:inline-block;width:24px;height:1px;background:#9aae82;margin-right:9px;vertical-align:middle}.report-header h1{font:600 clamp(34px,5vw,54px)/1.03 Manrope,sans-serif;letter-spacing:-.06em;margin:17px 0 8px}.report-topic{color:#9da79a;font-size:13px;margin:0}.report-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.report-button{border-radius:7px;padding:10px 13px;border:1px solid rgba(221,231,215,.14);cursor:pointer;font-size:10px;transition:.16s ease}.report-button:hover{border-color:rgba(183,199,149,.5);transform:translateY(-1px)}.report-button-quiet{background:#171d17;color:#aeb8a7}.report-button-primary{background:#b7c795;color:#172016;border-color:#b7c795;font-weight:700}.report-stage-intro{display:flex;justify-content:space-between;align-items:end;gap:16px;padding:34px 0 17px}.report-stage-intro h2,.section-title-row h2{font:600 23px/1.2 Manrope,sans-serif;letter-spacing:-.04em;margin:8px 0 0}.report-save-note,.section-note{color:#7e897a;font:9px 'DM Mono',monospace}.report-notice{border-radius:8px;padding:12px 14px;margin:0 0 14px;border:1px solid rgba(183,199,149,.18);color:#b9c8a5;background:rgba(150,176,119,.08);font-size:11px}.report-error{color:#d4aa8b;border-color:rgba(213,140,104,.25);background:rgba(213,140,104,.07)}.report-inline-button{margin-left:8px;border:0;background:transparent;color:#d3e2b5;text-decoration:underline;cursor:pointer}.report-spinner{display:inline-block;width:11px;height:11px;border:1px solid #80936d;border-top-color:#d7e2bc;border-radius:50%;animation:report-spin .7s linear infinite;vertical-align:-1px;margin-right:7px}.report-overview-grid{display:grid;grid-template-columns:1fr 1.12fr 1.3fr;gap:12px}.report-card,.criterion-card,.panel-card,.opening-card{background:#171d18;border:1px solid rgba(221,231,215,.11);border-radius:10px}.report-card{padding:18px}.score-ring{width:128px;height:128px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;margin:14px auto 13px;background:radial-gradient(circle at center,#171d18 61%,transparent 62%),conic-gradient(#b7c795 var(--score),#303b2e 0)}.score-ring strong{font:600 30px Manrope;color:#dbe7c3}.score-ring span{color:#818d7d;font:10px 'DM Mono',monospace}.report-card p{color:#9ba59a;font-size:11px;line-height:1.6;margin:0}.report-score-card{text-align:center}.empty-copy,.muted{color:#778177!important;font-size:11px;line-height:1.6}.callout-value{min-height:43px;margin:11px 0 20px!important;color:#d0dbbe!important;font-size:13px!important}.callout-fix{color:#d3a987!important;margin-bottom:0!important}.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px 8px;margin-top:17px}.report-metric{display:flex;flex-direction:column;gap:3px}.report-metric span{color:#7d897c;font-size:9px}.report-metric strong{color:#d0dabf;font:600 18px Manrope}.report-metric small{color:#667264;font-size:8px}.section-title-row{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:15px}.report-section{padding:26px 0;border-bottom:1px solid rgba(221,231,215,.1)}.airtime-layout{display:grid;grid-template-columns:210px 1fr;gap:36px;align-items:center}.donut{width:188px;height:188px;border-radius:50%;display:grid;place-items:center}.donut>div{width:114px;height:114px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#171d18;border:1px solid rgba(221,231,215,.08)}.donut strong{font:600 24px Manrope;color:#d6e3bd}.donut small{font-size:9px;color:#7e8a7d}.airtime-row{display:grid;grid-template-columns:11px minmax(90px,1fr) auto auto;gap:7px 9px;align-items:center;margin:8px 0;font-size:11px;color:#bfc8b9}.legend-dot{width:8px;height:8px;border-radius:50%}.airtime-row strong{color:#d4dfc0;font:600 12px 'DM Mono',monospace}.airtime-row small{color:#778278;font-size:9px}.airtime-bar{grid-column:2/-1;height:3px;background:#2c352c;border-radius:10px;overflow:hidden}.airtime-bar i{display:block;height:100%;background:#91a873;border-radius:10px}.timeline-card{border:1px solid rgba(221,231,215,.1);border-radius:9px;overflow:auto;background:#151a15}.timeline-row{min-width:510px;display:grid;grid-template-columns:46px 21px minmax(140px,1fr) 58px 42px;gap:9px;align-items:center;min-height:43px;padding:5px 12px;border-bottom:1px solid rgba(221,231,215,.06);font-size:10px}.timeline-row:last-child{border:0}.timeline-student{background:rgba(183,199,149,.08)}.timeline-time,.timeline-gap,.timeline-words{color:#758174;font:9px 'DM Mono',monospace}.timeline-gap{font-size:8px;text-align:right}.timeline-track{height:30px;display:flex;align-items:center;justify-content:center}.timeline-track i{display:block;width:5px;border-radius:4px;background:#5f7352}.timeline-student .timeline-track i{background:#b7c795}.timeline-speaker{color:#b8c3b4}.timeline-student .timeline-speaker{color:#d7e2bf;font-weight:600}.micro-metrics{display:flex;gap:20px;flex-wrap:wrap;margin-top:12px;color:#829080;font-size:10px}.micro-metrics strong{color:#c5d2b1;font:600 11px 'DM Mono',monospace;margin-left:5px}.pattern-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.tag-cloud{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;min-height:44px}.tag{padding:6px 8px;border-radius:5px;background:#202820;color:#758174;font:9px 'DM Mono',monospace}.tag b{color:#9fac91;font-weight:500}.tag-active{color:#c3d1ae;background:rgba(151,177,117,.15);border:1px solid rgba(183,199,149,.17)}.card-footnote{color:#657164!important;font-size:9px!important;margin-top:16px!important}.angle-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:9px}.angle-card{padding:13px;border:1px solid rgba(221,231,215,.09);border-radius:8px;background:#161b16}.angle-card>span{color:#9a806e;font:8px 'DM Mono',monospace;letter-spacing:.12em}.angle-card strong{display:block;margin-top:9px;color:#afb9a7;font-size:11px}.angle-card p{color:#727e72;font-size:9px;line-height:1.5;margin:8px 0 0}.angle-covered{border-color:rgba(183,199,149,.23);background:rgba(155,178,122,.07)}.angle-covered>span{color:#b7c795}.stage-three{padding-top:37px}.criteria-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.criterion-card{padding:14px}.criterion-top{display:flex;align-items:baseline;justify-content:space-between;color:#b9c5b4;font-size:11px}.criterion-top>span{color:#d4e0be;font:600 15px 'DM Mono',monospace}.criterion-top small{font-size:8px;color:#738070}.criterion-bar{height:4px;background:#2a3429;border-radius:4px;margin:10px 0 11px;overflow:hidden}.criterion-bar i{height:100%;display:block;background:#9eb47e;border-radius:4px}.criterion-card p{color:#909b8d;font-size:10px;line-height:1.5;margin:0 0 10px}.evidence{display:block;width:100%;text-align:left;padding:8px 8px;margin-top:6px;border:1px solid rgba(183,199,149,.14);border-radius:6px;background:rgba(183,199,149,.05);cursor:pointer}.evidence:hover{background:rgba(183,199,149,.12);border-color:rgba(183,199,149,.35)}.evidence span{display:block;color:#c5d1b4;font-size:9px;line-height:1.4}.evidence small{display:block;color:#71806f;font:8px 'DM Mono',monospace;margin-top:5px}.insight-grid{display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:12px}.insight-list{margin:13px 0 0;padding:0;list-style:none;counter-reset:insight}.insight-list li{counter-increment:insight;position:relative;padding:10px 9px 10px 30px;margin:5px 0;color:#b8c4b2;background:#171d18;border:1px solid rgba(221,231,215,.08);border-radius:7px;font-size:10px;line-height:1.5}.insight-list li:before{content:counter(insight,decimal-leading-zero);position:absolute;left:9px;top:10px;color:#9db184;font:9px 'DM Mono',monospace}.insight-fixes li:before{color:#c08c70}.drill-card{padding:16px;background:rgba(183,199,149,.09);border:1px solid rgba(183,199,149,.2);border-radius:9px}.drill-card p{color:#ced9bd;font-size:12px;line-height:1.6;margin:13px 0 0}.opening-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.opening-card{position:relative;padding:15px 14px 14px 41px}.opening-index{position:absolute;top:15px;left:14px;color:#9fb386;font:10px 'DM Mono',monospace}.opening-card p{color:#a8b3a4;font-size:10px;line-height:1.55;margin:0 0 12px}.opening-card p strong{display:block;margin-bottom:4px;color:#748170;font:8px 'DM Mono',monospace;letter-spacing:.1em;text-transform:uppercase}.opening-card small{color:#6f7d6c;font:8px 'DM Mono',monospace}.panel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.panel-card{padding:16px}.panel-card>strong{display:block;color:#d1dfbd;font:600 16px Manrope;margin-top:10px}.panel-card>p{color:#919d8f;font-size:10px;line-height:1.5;margin:8px 0 10px}.filter-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.filter-row button{padding:7px 10px;color:#859180;background:#171d18;border:1px solid rgba(221,231,215,.12);border-radius:6px;font-size:9px;cursor:pointer}.filter-row button:hover,.filter-row .filter-active{color:#d5e2bf;background:rgba(183,199,149,.12);border-color:rgba(183,199,149,.3)}.transcript-list{border-top:1px solid rgba(221,231,215,.1)}.transcript-line{position:relative;padding:13px 70px 12px 13px;border-bottom:1px solid rgba(221,231,215,.07);background:#151a15;transition:background .2s,box-shadow .2s}.transcript-own{background:rgba(183,199,149,.055);border-left:2px solid #8ca174;padding-left:11px}.transcript-highlight{background:rgba(183,199,149,.22);box-shadow:inset 0 0 0 1px rgba(183,199,149,.45)}.transcript-line>div{display:flex;align-items:center;gap:9px}.transcript-speaker{color:#bfccb7;font-size:10px;font-weight:600}.transcript-line small{color:#6c796a;font:8px 'DM Mono',monospace}.transcript-line p{color:#a6b0a2;font-size:11px;line-height:1.55;margin:6px 0 0}.transcript-own p{color:#ccd8be}.interrupt-label,.filler-label{position:absolute;right:12px;top:13px;color:#c49276;font:8px 'DM Mono',monospace}.filler-label{top:29px;color:#99ab7f}.report-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:25px;color:#758174;font:9px 'DM Mono',monospace}@keyframes report-spin{to{transform:rotate(360deg)}}@media(max-width:850px){.report-overview-grid{grid-template-columns:1fr 1fr}.report-metrics-card{grid-column:1/-1}.criteria-grid{grid-template-columns:repeat(2,1fr)}.insight-grid{grid-template-columns:1fr 1fr}.drill-card{grid-column:1/-1}}@media(max-width:610px){.report-shell{width:min(100% - 28px,1180px)}.report-header{display:block}.report-actions{justify-content:flex-start;margin-top:20px}.report-overview-grid,.pattern-grid,.airtime-layout,.insight-grid{grid-template-columns:1fr}.report-metrics-card{grid-column:auto}.airtime-layout{gap:20px}.donut{margin:auto}.criteria-grid{grid-template-columns:1fr}.report-stage-intro,.section-title-row{display:block}.section-note,.report-save-note{display:block;margin-top:8px}.report-footer{display:block}.report-footer .report-button{margin-top:15px}}
@media print{.report-screen{background:#fff;color:#111;padding:0}.report-shell{width:100%}.report-actions,.report-notice,.filter-row,.report-footer,.stage-three{display:none!important}.report-card,.criterion-card,.panel-card,.opening-card,.timeline-card,.transcript-line{background:#fff;border-color:#ccc}.report-header h1,.report-stage-intro h2,.section-title-row h2,.report-card p,.criterion-card p,.transcript-line p{color:#111}.report-section{break-inside:avoid}}
`;
