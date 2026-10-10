import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, ChevronDown, Clock3, Eye, Info, Lightbulb,
  MessageSquareText, Mic, MicOff, Send, Settings2, ShieldCheck,
  Square, WifiOff, Zap,
} from "lucide-react";
import { MODERATOR, PERSONAS, PERSONA_BY_ID } from "./data/personas";
import { countSources, countFillers } from "./lib/debug";
import { makeLocalTopicPack, requestAnalysis, requestLiveLine, requestTopicPack, selectBankLine, validateLiveLine } from "./lib/ai";
import { cancelSpeech, cleanSpeechText, loadedVoices, recognitionConstructor, speakText, splitSpeechChunks, type SpeechProgress } from "./lib/speech";
import { saveCompletedSession, saveCurrentTranscript } from "./lib/storage";
import { GdPulse, TopicPrimer } from "./Stage3Extras";
import { ReportScreen } from "./ReportScreen";
import type { AnalysisResult } from "./ReportScreen";
import { countRealWords, formatTime, makeTranscriptLine } from "./lib/transcript";
import type { RecognitionEventLike, RecognitionLike } from "./lib/speechTypes";
import type { AiPersonaId, LiveLineResponse, MicStatus, PersonaId, Phase, SessionSettings, Topic, TopicPack, TranscriptLine } from "./types";

interface RoomScreenProps {
  settings: SessionSettings;
  topic: Topic;
  initialMicStatus: MicStatus;
  onSettingsPatch: (patch: Partial<SessionSettings>) => void;
  onBack: () => void;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const SPEAKER_ORDER: AiPersonaId[] = ["rohan", "ananya", "meera", "karan", "sana"];
type TurnIntent = "discussion" | "redirect" | "closing" | "opening" | "invite";
interface PreparedLine { text: string; source: TranscriptLine["source"]; pointSummary?: string; angleUsed?: string }

function withinBudget<T>(promise: Promise<T>, milliseconds: number): Promise<{ status: "value"; value: T } | { status: "error"; error: unknown } | { status: "timeout" }> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({ status: "timeout" }), milliseconds);
    promise.then((value) => {
      window.clearTimeout(timer);
      resolve({ status: "value", value });
    }, (error: unknown) => {
      window.clearTimeout(timer);
      resolve({ status: "error", error });
    });
  });
}

function timeLabel(timestamp: number, startedAt: number) {
  const elapsed = Math.max(0, Math.floor((timestamp - startedAt) / 1000));
  return `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
}

function highlightedSpeech(text: string, active: boolean, progress: SpeechProgress | null) {
  if (!active || !progress) return text;
  return splitSpeechChunks(text).map((chunk, chunkIndex) => {
    const tokens = chunk.match(/\S+\s*/g) ?? [chunk];
    return <span key={`chunk-${chunkIndex}`}>{tokens.map((token, wordIndex) => {
      const word = token.trimEnd();
      const spaces = token.slice(word.length);
      const sentenceFallback = chunkIndex === progress.chunkIndex && progress.wordIndex < 0;
      const wordActive = chunkIndex === progress.chunkIndex && progress.wordIndex === wordIndex;
      const className = wordActive ? "speech-active-word" : sentenceFallback ? "speech-active-sentence" : undefined;
      return <span key={`word-${chunkIndex}-${wordIndex}`} className={className}>{word}{spaces}</span>;
    })}</span>;
  });
}

function aiVoiceCount() {
  return loadedVoices().length;
}

export function RoomScreen({ settings, topic, initialMicStatus, onSettingsPatch, onBack }: RoomScreenProps) {
  const participants = useMemo(() => PERSONAS.slice(0, settings.panelSize), [settings.panelSize]);
  const localPack = useMemo(() => makeLocalTopicPack(topic), [topic]);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<PersonaId | "student" | null>(null);
  const [currentLine, setCurrentLine] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [phase, setPhase] = useState<Phase>("Opening");
  const [remainingSeconds, setRemainingSeconds] = useState(settings.durationMinutes * 60);
  const [micStatus, setMicStatus] = useState<MicStatus>(() => initialMicStatus === "unknown" && !recognitionConstructor() ? "unsupported" : initialMicStatus);
  const [micHeld, setMicHeld] = useState(false);
  const [studentSpeaking, setStudentSpeaking] = useState(false);
  const [finalizingSpeech, setFinalizingSpeech] = useState(false);
  const [studentAllowed, setStudentAllowed] = useState(settings.format === "standard");
  const [studentTurnOpen, setStudentTurnOpen] = useState(false);
  const [studentTurnSeconds, setStudentTurnSeconds] = useState(20);
  const [interimText, setInterimText] = useState("");
  const [typedDraft, setTypedDraft] = useState("");
  const [toast, setToast] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [captionSize, setCaptionSize] = useState(settings.captionSize);
  const [audioVolume, setAudioVolume] = useState(settings.volume);
  const [voiceSpeed, setVoiceSpeed] = useState(settings.voiceSpeed);
  const [topicPack, setTopicPack] = useState<TopicPack | null>(null);
  const [packReady, setPackReady] = useState(false);
  const [liveLineId, setLiveLineId] = useState<string | null>(null);
  const [speechProgress, setSpeechProgress] = useState<SpeechProgress | null>(null);
  const [voiceTotal, setVoiceTotal] = useState(0);
  const [voiceNames, setVoiceNames] = useState<string[]>([]);
  const [primerOpen, setPrimerOpen] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [thinking, setThinking] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [lastEvent, setLastEvent] = useState("Room initialising");
  const [lastError, setLastError] = useState("None");
  const [turns, setTurns] = useState<Record<string, number>>({});

  const feedRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const topicPackRef = useRef<TopicPack | null>(null);
  const audioControlsRef = useRef({ volume: settings.volume, voiceSpeed: settings.voiceSpeed });
  const usedBankKeysRef = useRef(new Set<string>());
  const pointsMadeRef = useRef<string[]>([]);
  const usedAnglesRef = useRef<string[]>([]);
  const llmControllersRef = useRef(new Set<AbortController>());
  const currentSpeakerRef = useRef<PersonaId | "student" | null>(null);
  const currentLineIdRef = useRef<string | null>(null);
  const currentLineTextRef = useRef("");
  const utteranceAbortRef = useRef<AbortController | null>(null);
  const speakingLockRef = useRef(false);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const listeningRequestedRef = useRef(false);
  const studentFinalizingRef = useRef(false);
  const finalizeRecognitionRef = useRef<(() => void) | null>(null);
  const pttDownRef = useRef(false);
  const toggleMicRef = useRef(false);
  const draftTextRef = useRef("");
  const interimTextRef = useRef("");
  const releaseTimerRef = useRef<number | undefined>(undefined);
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const startedAtRef = useRef(Date.now());
  const remainingRef = useRef(settings.durationMinutes * 60);
  const phaseRef = useRef<Phase>("Opening");
  const forceClosingRef = useRef(false);
  const closingStartedRef = useRef(false);
  const closingFinishedRef = useRef(false);
  const twoMinuteNoticeRef = useRef(false);
  const fishbowlNoticeRef = useRef(false);
  const longSilencePromptRef = useRef(false);
  const studentSubmissionCountRef = useRef(0);
  const studentWaiterRef = useRef<(() => void) | null>(null);
  const systemQueueRef = useRef<string[]>([]);
  const personaTurnsRef = useRef<Record<string, number>>({});
  const turnsSinceModeratorRef = useRef(0);
  const lastStudentAtRef = useRef(Date.now());
  const lastNudgeAtRef = useRef(0);
  const silenceNudgeShownRef = useRef(false);
  const speakingStartedAtRef = useRef<number | null>(null);
  const longSpeechNudgeShownRef = useRef(false);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const lastEventRef = useRef("Room initialising");
  const setEvent = useCallback((event: string) => {
    lastEventRef.current = event;
    setLastEvent(event);
  }, []);

  const appendLine = useCallback((line: TranscriptLine) => {
    const updated = [...transcriptRef.current, line];
    transcriptRef.current = updated;
    setLines(updated);
    saveCurrentTranscript(updated);
    return line;
  }, []);

  const markInterrupted = useCallback((lineId: string | null) => {
    if (!lineId) return;
    const updated = transcriptRef.current.map((line) => line.id === lineId ? { ...line, interrupted: true } : line);
    transcriptRef.current = updated;
    setLines(updated);
    saveCurrentTranscript(updated);
  }, []);

  const showNudge = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastNudgeAtRef.current < 45_000) return;
    lastNudgeAtRef.current = now;
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 5200);
  }, []);

  const showSystemToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 6000);
  }, []);

  const notifyStudent = useCallback(() => {
    studentSubmissionCountRef.current += 1;
    const waiter = studentWaiterRef.current;
    studentWaiterRef.current = null;
    waiter?.();
  }, []);

  const commitStudentText = useCallback((rawText: string) => {
    const text = rawText.trim().replace(/\s+/g, " ");
    if (countRealWords(text) < 2) {
      setStudentSpeaking(false);
      setLastEvent("Ignored speech under two words");
      return false;
    }
    const line = makeTranscriptLine("student", "You", text, "FALLBACK");
    appendLine(line);
    lastStudentAtRef.current = Date.now();
    silenceNudgeShownRef.current = false;
    longSilencePromptRef.current = false;
    longSpeechNudgeShownRef.current = false;
    speakingStartedAtRef.current = null;
    setStudentSpeaking(false);
    setInterimText("");
    interimTextRef.current = "";
    draftTextRef.current = "";
    setEvent("Student turn committed");
    notifyStudent();

    if (countFillers(text) >= 3) showNudge("Too many filler words — try one clean pause instead.");
    const previousAiLine = [...transcriptRef.current].slice(0, -1).reverse().find((item) => item.speakerId !== "student");
    if (previousAiLine && countRealWords(text) >= 5 && !text.toLowerCase().includes(previousAiLine.speakerName.toLowerCase())) {
      showNudge(`Try building on ${previousAiLine.speakerName}'s point.`);
    }
    return true;
  }, [appendLine, notifyStudent, setEvent, showNudge]);

  const stopRecognition = useCallback((discard = false) => {
    listeningRequestedRef.current = false;
    studentFinalizingRef.current = false;
    finalizeRecognitionRef.current = null;
    toggleMicRef.current = false;
    pttDownRef.current = false;
    setMicHeld(false);
    setFinalizingSpeech(false);
    setStudentSpeaking(false);
    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.abort();
    } catch {
      // Some Chrome versions throw if recognition has already stopped.
    }
    if (discard) {
      draftTextRef.current = "";
      interimTextRef.current = "";
      setInterimText("");
    }
  }, []);

  const releaseListening = useCallback((commit = true) => {
    if (!listeningRequestedRef.current) return;
    const recognition = recognitionRef.current;
    listeningRequestedRef.current = false;
    studentFinalizingRef.current = true;
    toggleMicRef.current = false;
    pttDownRef.current = false;
    setMicHeld(false);
    setFinalizingSpeech(true);
    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    const finalize = () => {
      if (!studentFinalizingRef.current) return;
      studentFinalizingRef.current = false;
      finalizeRecognitionRef.current = null;
      if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = undefined;
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      const collected = `${draftTextRef.current} ${interimTextRef.current}`.trim();
      if (commit) commitStudentText(collected);
      draftTextRef.current = "";
      interimTextRef.current = "";
      setInterimText("");
      setStudentSpeaking(false);
      setFinalizingSpeech(false);
    };
    finalizeRecognitionRef.current = finalize;
    releaseTimerRef.current = window.setTimeout(finalize, 900);
    try {
      recognition?.stop();
    } catch {
      // The typed fallback remains available if Chrome has ended recognition.
    }
    setEvent("Mic released; collecting final recognized words");
  }, [commitStudentText, setEvent]);

  const interruptAi = useCallback(() => {
    const speaker = currentSpeakerRef.current;
    if (!speaker || speaker === "student") return false;
    const lineId = currentLineIdRef.current;
    utteranceAbortRef.current?.abort();
    cancelSpeech();
    markInterrupted(lineId);
    setEvent(`Barge-in stopped ${PERSONA_BY_ID.get(speaker)?.name ?? "AI"}`);
    return true;
  }, [markInterrupted, setEvent]);

  const beginListening = useCallback((toggle = false) => {
    if (!activeRef.current || sessionEnded) return;
    if (studentFinalizingRef.current) return;
    if (!studentAllowed) {
      showNudge("The fishbowl is still in progress. You can join after the first two minutes.");
      return;
    }
    if (currentSpeakerRef.current && currentSpeakerRef.current !== "student") interruptAi();
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setMicStatus("unsupported");
      setLastError("SpeechRecognition unsupported; typed fallback available");
      showNudge("Speech recognition isn't supported here. Type your reply below.");
      return;
    }
    if (listeningRequestedRef.current) return;
    listeningRequestedRef.current = true;
    pttDownRef.current = !toggle;
    toggleMicRef.current = toggle;
    draftTextRef.current = "";
    interimTextRef.current = "";
    setInterimText("");
    setMicHeld(true);
    setStudentSpeaking(false);
    setMicStatus("checking");
    setEvent("Push-to-talk opened");
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = settings.language === "Hinglish" ? "en-IN" : "en-IN";
    recognition.onstart = () => {
      if (listeningRequestedRef.current) setMicStatus("ready");
    };
    recognition.onresult = (event: RecognitionEventLike) => {
      let finalText = "";
      let partialText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const value = result?.[0]?.transcript?.trim() ?? "";
        if (result?.isFinal) finalText += `${value} `;
        else partialText += `${value} `;
      }
      draftTextRef.current = finalText.trim();
      interimTextRef.current = partialText.trim();
      const combined = `${draftTextRef.current} ${interimTextRef.current}`.trim();
      setInterimText(combined);
      if (countRealWords(combined) >= 2) {
        setStudentSpeaking(true);
        if (!speakingStartedAtRef.current) speakingStartedAtRef.current = Date.now();
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        listeningRequestedRef.current = false;
        setMicHeld(false);
        setStudentSpeaking(false);
        setMicStatus("denied");
        setLastError("Microphone permission denied; typed fallback available");
        showNudge("Mic access was denied. You can continue with typed replies.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setLastError(`Speech recognition: ${event.error}`);
      }
    };
    recognition.onend = () => {
      if (studentFinalizingRef.current && recognitionRef.current === recognition) {
        finalizeRecognitionRef.current?.();
        return;
      }
      if (listeningRequestedRef.current && recognitionRef.current === recognition) {
        window.setTimeout(() => {
          if (!listeningRequestedRef.current || recognitionRef.current !== recognition) return;
          try {
            recognition.start();
            setEvent("Chrome recognition auto-restarted");
          } catch {
            setLastError("Recognition restart unavailable; typed fallback remains active");
          }
        }, 100);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      listeningRequestedRef.current = false;
      setMicHeld(false);
      setMicStatus("denied");
      setLastError("Could not start SpeechRecognition; typed fallback available");
      showNudge("Mic couldn't start. Type your reply instead.");
    }
  }, [interruptAi, releaseListening, sessionEnded, settings.language, showNudge, studentAllowed, setEvent]);

  const submitTyped = useCallback((event?: React.FormEvent) => {
    event?.preventDefault();
    const text = typedDraft.trim();
    if (countRealWords(text) < 2) {
      showNudge("Try a thought with at least two words so the room can respond.");
      return;
    }
    if (currentSpeakerRef.current && currentSpeakerRef.current !== "student") interruptAi();
    if (listeningRequestedRef.current) releaseListening(false);
    setTypedDraft("");
    commitStudentText(text);
  }, [commitStudentText, interruptAi, releaseListening, showNudge]);

  const speakLine = useCallback(async (speakerId: PersonaId, text: string, generation: number, source: TranscriptLine["source"] = "FALLBACK") => {
    if (!activeRef.current || generationRef.current !== generation) return "interrupted" as const;
    while ((listeningRequestedRef.current || studentFinalizingRef.current) && activeRef.current && generationRef.current === generation) await wait(70);
    if (!activeRef.current || generationRef.current !== generation) return "interrupted" as const;
    if (speakingLockRef.current) return "interrupted" as const;
    speakingLockRef.current = true;
    if (recognitionRef.current) stopRecognition(true);
    const persona = PERSONA_BY_ID.get(speakerId) ?? MODERATOR;
    const spokenText = cleanSpeechText(text);
    const line = appendLine(makeTranscriptLine(speakerId, persona.name, spokenText, source));
    setThinking(false);
    currentSpeakerRef.current = speakerId;
    currentLineIdRef.current = line.id;
    currentLineTextRef.current = spokenText;
    setLiveLineId(line.id);
    setSpeechProgress(null);
    setCurrentSpeaker(speakerId);
    setCurrentLine(spokenText);
    setIsSpeaking(true);
    setEvent(`${persona.name} speaking`);
    const controller = new AbortController();
    utteranceAbortRef.current = controller;
    try {
      const result = await speakText(spokenText, speakerId, settings.language, controller.signal, {
        volume: audioControlsRef.current.volume,
        voiceSpeed: audioControlsRef.current.voiceSpeed,
        onProgress: setSpeechProgress,
      });
      if (result === "error") {
        setLastError("Browser speech ended with an error or watchdog timeout");
        setEvent("Speech resolved by error/watchdog; turn loop continuing");
      } else if (result === "unavailable") {
        setLastError("speechSynthesis unavailable; captions remain active");
      }
      return result;
    } finally {
      if (generationRef.current === generation) {
        currentSpeakerRef.current = null;
        currentLineIdRef.current = null;
        currentLineTextRef.current = "";
        utteranceAbortRef.current = null;
        setLiveLineId(null);
        setSpeechProgress(null);
        setCurrentSpeaker(null);
        setCurrentLine("");
        setIsSpeaking(false);
      }
      speakingLockRef.current = false;
    }
  }, [appendLine, setEvent, settings.language, stopRecognition]);

  const waitForStudent = useCallback((timeoutMs: number) => new Promise<boolean>((resolve) => {
    if (studentSubmissionCountRef.current > 0) {
      studentSubmissionCountRef.current -= 1;
      resolve(true);
      return;
    }
    const complete = (submitted: boolean) => {
      studentWaiterRef.current = null;
      window.clearTimeout(timer);
      resolve(submitted);
    };
    const timer = window.setTimeout(() => complete(false), timeoutMs);
    studentWaiterRef.current = () => {
      studentSubmissionCountRef.current = Math.max(0, studentSubmissionCountRef.current - 1);
      complete(true);
    };
  }), []);

  const chooseNextSpeaker = useCallback((): PersonaId => {
    const allLines = transcriptRef.current;
    const last = allLines.at(-1);
    const lastId = last?.speakerId;
    const addressed = participants.find((persona) => last && new RegExp(`\\b${persona.name}\\b`, "i").test(last.text));
    if (addressed && addressed.id !== lastId) return addressed.id;

    const sinceStudent = Date.now() - lastStudentAtRef.current;
    const quietAllowed = sinceStudent >= 40_000 || (lastId === "moderator" && /\bmeera\b/i.test(last?.text ?? ""));
    let candidates = participants.filter((persona) => persona.id !== lastId && (persona.id !== "meera" || quietAllowed));
    if (!candidates.length) candidates = participants.filter((persona) => persona.id !== lastId);
    if (!candidates.length) candidates = [...participants];
    candidates = candidates.sort((a, b) => {
      const multiplier = (id: PersonaId) => id === "rohan" ? settings.pressure === "Cut-throat" ? 1.65 : settings.pressure === "Friendly" ? 0.72 : 1.15 : 1;
      const aScore = (personaTurnsRef.current[a.id] ?? 0) / (a.talkativeness * multiplier(a.id));
      const bScore = (personaTurnsRef.current[b.id] ?? 0) / (b.talkativeness * multiplier(b.id));
      return aScore - bScore;
    });
    const pool = candidates.slice(0, Math.min(2, candidates.length));
    const chosen = pool[Math.random() < 0.72 ? 0 : pool.length - 1];
    return chosen.id;
  }, [participants, settings.pressure]);

  const pauseAfterTurn = useCallback(() => {
    const [minimum, maximum] = settings.pressure === "Friendly" ? [550, 800] : settings.pressure === "Cut-throat" ? [300, 500] : [400, 700];
    return minimum + Math.random() * (maximum - minimum);
  }, [settings.pressure]);

  const getLine = useCallback(async (speakerId: PersonaId, intent: TurnIntent, generation: number, ownEarlierPoint = "", quickReply = false): Promise<PreparedLine> => {
    const pack = topicPackRef.current ?? localPack;
    const localOnly = pack === localPack;
    const last4 = transcriptRef.current.slice(-4).map((line) => ({ speakerName: line.speakerName, text: line.text }));
    const recentLines = transcriptRef.current.slice(-10).map((line) => line.text);
    const previousName = last4.at(-1)?.speakerName ?? "You";
    const remember = (line: PreparedLine) => {
      if (line.pointSummary) pointsMadeRef.current = [...pointsMadeRef.current.slice(-19), line.pointSummary];
      if (line.angleUsed && !usedAnglesRef.current.includes(line.angleUsed)) usedAnglesRef.current = [...usedAnglesRef.current.slice(-19), line.angleUsed];
      return line;
    };
    const useBank = (): PreparedLine => {
      if (speakerId === "moderator") {
        const options = [topic.moderatorRedirect, topic.moderatorInvite, ...pack.angles.map((angle) => angle.counterArgument)];
        const optionIndex = options.findIndex((_, index) => !usedBankKeysRef.current.has(`moderator:${index}`));
        const index = optionIndex >= 0 ? optionIndex : 0;
        usedBankKeysRef.current.add(`moderator:${index}`);
        const text = cleanSpeechText(options[index] || topic.moderatorRedirect);
        return remember({ text, source: "FALLBACK", pointSummary: text, angleUsed: pack.angles[index]?.id });
      }
      const bank = selectBankLine(pack, speakerId as AiPersonaId, previousName, usedBankKeysRef.current, last4, topic.title, recentLines);
      if (bank) {
        usedBankKeysRef.current.add(bank.key);
        return remember({ text: cleanSpeechText(bank.line.text), source: localOnly ? "FALLBACK" : "BANK", pointSummary: bank.line.pointSummary, angleUsed: bank.line.angleUsed });
      }
      const text = cleanSpeechText(topic.arguments[speakerId as AiPersonaId]);
      return remember({ text, source: "FALLBACK", pointSummary: text, angleUsed: "local-topic-argument" });
    };

    if (!activeRef.current || generationRef.current !== generation) return { text: "", source: "FALLBACK" };
    if (intent === "opening" && speakerId === "moderator") {
      const text = cleanSpeechText(pack.openingLine || topic.moderatorRedirect);
      usedBankKeysRef.current.add("moderator:opening");
      return remember({ text, source: localOnly ? "FALLBACK" : "BANK", pointSummary: "Topic-specific room opening", angleUsed: "opening" });
    }
    if (!navigator.onLine) {
      setLastError("Offline; using the topic-specific bank.");
      showSystemToast("AI is offline; the topic-specific bank is keeping the discussion moving.");
      return useBank();
    }

    const base = {
      speaker: speakerId,
      personaRole: PERSONA_BY_ID.get(speakerId)?.role ?? "Moderator",
      language: settings.language,
      pressure: settings.pressure,
      intent,
      topicPack: pack,
      last4,
      pointsMade: pointsMadeRef.current.slice(-8),
      usedAngles: usedAnglesRef.current.slice(-8),
      ownEarlierPoint,
    };
    const requestWithinBudget = async (repairNote: string | undefined, budgetMs: number) => {
      const controller = new AbortController();
      llmControllersRef.current.add(controller);
      const request = requestLiveLine({ ...base, ...(repairNote ? { repairNote } : {}) }, controller.signal)
        .finally(() => llmControllersRef.current.delete(controller));
      const result = await withinBudget(request, budgetMs);
      if (result.status === "timeout") controller.abort();
      return result;
    };
    const recordLive = (response: LiveLineResponse): PreparedLine => remember({
      text: cleanSpeechText(response.text),
      source: "AI",
      pointSummary: response.pointSummary,
      angleUsed: response.angleUsed,
    });

    try {
      const first = await requestWithinBudget(undefined, quickReply ? 850 : 4500);
      if (first.status === "timeout") {
        setLastError("Live LLM line exceeded the quick-response window; topic bank used.");
        showSystemToast("AI is taking longer than expected; a topic-bank line is keeping the discussion moving.");
        return useBank();
      }
      if (first.status === "error") throw first.error;
      const firstText = cleanSpeechText(first.value.text);
      const firstProblem = validateLiveLine(firstText, pack, last4, topic.title, recentLines);
      if (!firstProblem) return recordLive({ ...first.value, text: firstText });

      setEvent("Live line failed the topic/repetition gate; regenerating once");
      const retry = await requestWithinBudget(firstProblem, quickReply ? 300 : 1500);
      if (retry.status === "value") {
        const retryText = cleanSpeechText(retry.value.text);
        if (!validateLiveLine(retryText, pack, last4, topic.title, recentLines)) return recordLive({ ...retry.value, text: retryText });
      } else if (retry.status === "error") {
        setLastError(retry.error instanceof Error ? retry.error.message : "The one permitted live-line retry failed.");
      }
      setLastError("Live line rejected by the relevance/repetition gate; next unused topic-bank line selected.");
      showSystemToast("A generated line missed the topic/repetition check; switching to the next unused topic-bank line.");
      return useBank();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The live LLM request failed.";
      setLastError(message);
      showSystemToast("AI reply failed; the topic-specific bank is keeping the discussion moving.");
      return useBank();
    }
  }, [localPack, setEvent, settings.language, settings.pressure, showSystemToast, topic]);

  const finishSession = useCallback(() => {
    if (closingFinishedRef.current) return;
    closingFinishedRef.current = true;
    activeRef.current = false;
    cancelSpeech();
    stopRecognition(true);
    setIsSpeaking(false);
    setCurrentSpeaker(null);
    setCurrentLine("");
    setSessionEnded(true);
    setEvent("Session complete; Stage 1 Analysis Report shell opened");
    saveCompletedSession({
      id: `session-${startedAtRef.current}`,
      topic: topic.title,
      startedAt: startedAtRef.current,
      endedAt: Date.now(),
      lines: transcriptRef.current,
    });
  }, [setEvent, stopRecognition, topic.title]);

  const runClosingRound = useCallback(async (generation: number) => {
    if (closingStartedRef.current) return;
    closingStartedRef.current = true;
    phaseRef.current = "Closing Round";
    setPhase("Closing Round");
    setThinking(false);
    await speakLine("moderator", "One minute left. We'll hear a final takeaway from each participant, then a short turn from you.", generation, "FALLBACK");
    await wait(pauseAfterTurn());
    for (const personaId of SPEAKER_ORDER) {
      if (!activeRef.current || generationRef.current !== generation) return;
      const persona = participants.find((person) => person.id === personaId);
      if (!persona) continue;
      await speakLine("moderator", `${persona.name}, your final thought, please.`, generation, "FALLBACK");
      await wait(pauseAfterTurn());
      const previous = [...transcriptRef.current].reverse().find((line) => line.speakerId === personaId);
      const line = await getLine(personaId, "closing", generation, previous?.text ?? topic.arguments[personaId]);
      personaTurnsRef.current[personaId] = (personaTurnsRef.current[personaId] ?? 0) + 1;
      setTurns({ ...personaTurnsRef.current });
      await speakLine(personaId, line.text, generation, line.source);
      if (!activeRef.current || generationRef.current !== generation) return;
      await wait(pauseAfterTurn());
    }

    setStudentTurnOpen(true);
    setStudentTurnSeconds(20);
    setCurrentSpeaker("student");
    currentSpeakerRef.current = "student";
    setCurrentLine("Your turn: one final thought. You have 20 seconds.");
    setEvent("Student closing turn opened");
    const before = studentSubmissionCountRef.current;
    for (let seconds = 20; seconds > 0; seconds -= 1) {
      if (!activeRef.current || generationRef.current !== generation) return;
      setStudentTurnSeconds(seconds);
      if (studentSubmissionCountRef.current > before) break;
      await wait(1000);
    }
    setStudentTurnOpen(false);
    setCurrentSpeaker(null);
    currentSpeakerRef.current = null;
    setCurrentLine("");
    if (!activeRef.current || generationRef.current !== generation) return;
    await wait(pauseAfterTurn());
    await speakLine("moderator", "Thank you, everyone. Your discussion is saved on this device. The Analysis Report is opening now; detailed scoring and quote-linked coaching arrive in Stage 2.", generation, "FALLBACK");
    if (!activeRef.current || generationRef.current !== generation) return;
    finishSession();
  }, [finishSession, getLine, participants, pauseAfterTurn, setEvent, speakLine, topic]);

  const runDiscussion = useCallback(async (generation: number) => {
    const waitRoomGap = async (milliseconds: number) => {
      const until = Date.now() + milliseconds;
      while (Date.now() < until && activeRef.current && generationRef.current === generation) {
        if (listeningRequestedRef.current || releaseTimerRef.current !== undefined || transcriptRef.current.at(-1)?.speakerId === "student") return;
        await wait(Math.min(40, until - Date.now()));
      }
    };
    const opening = await getLine("moderator", "opening", generation);
    await speakLine("moderator", opening.text, generation, opening.source);
    if (!activeRef.current || generationRef.current !== generation) return;
    turnsSinceModeratorRef.current = 0;
    await waitRoomGap(pauseAfterTurn());

    if (settings.format === "standard") {
      const studentStarted = await waitForStudent(6000);
      if (!studentStarted && activeRef.current && generationRef.current === generation) {
        const starter: AiPersonaId = Math.random() < 0.55 ? "rohan" : "sana";
        personaTurnsRef.current[starter] = (personaTurnsRef.current[starter] ?? 0) + 1;
        setTurns({ ...personaTurnsRef.current });
        const firstLine = await getLine(starter, "discussion", generation);
        await speakLine(starter, firstLine.text, generation, firstLine.source);
      }
    }

    while (activeRef.current && generationRef.current === generation) {
      if (forceClosingRef.current || remainingRef.current <= 60) {
        await runClosingRound(generation);
        return;
      }
      if (systemQueueRef.current.length) {
        const announcement = systemQueueRef.current.shift();
        if (announcement) {
          await speakLine("moderator", announcement, generation, "FALLBACK");
          turnsSinceModeratorRef.current = 0;
          await waitRoomGap(pauseAfterTurn());
        }
      }
      if (!activeRef.current || generationRef.current !== generation) return;
      while ((listeningRequestedRef.current || releaseTimerRef.current !== undefined) && activeRef.current && generationRef.current === generation) await wait(30);
      if (!activeRef.current || generationRef.current !== generation) return;

      const moderatorDue = turnsSinceModeratorRef.current >= 6 && (turnsSinceModeratorRef.current >= 8 || Math.random() > 0.35);
      if (moderatorDue) {
        const redirect = await getLine("moderator", "redirect", generation, "", transcriptRef.current.at(-1)?.speakerId === "student");
        await speakLine("moderator", redirect.text, generation, redirect.source);
        turnsSinceModeratorRef.current = 0;
      } else {
        const speakerId = chooseNextSpeaker() as AiPersonaId;
        personaTurnsRef.current[speakerId] = (personaTurnsRef.current[speakerId] ?? 0) + 1;
        setTurns({ ...personaTurnsRef.current });
        const quickReply = transcriptRef.current.at(-1)?.speakerId === "student";
        const line = await getLine(speakerId, "discussion", generation, "", quickReply);
        await speakLine(speakerId, line.text, generation, line.source);
        turnsSinceModeratorRef.current += 1;
      }
      if (!activeRef.current || generationRef.current !== generation) return;
      await waitRoomGap(transcriptRef.current.slice(-2).some((line) => line.speakerId === "student") ? 350 : pauseAfterTurn());
    }
  }, [chooseNextSpeaker, getLine, pauseAfterTurn, runClosingRound, settings.format, speakLine, waitForStudent]);

  const handleEndEarly = useCallback(() => {
    if (listeningRequestedRef.current) releaseListening(true);
    forceClosingRef.current = true;
    phaseRef.current = "Closing Round";
    setPhase("Closing Round");
    setEvent("End early selected; finishing current line before the closing round");
    if (currentSpeakerRef.current && currentSpeakerRef.current !== "student") return;
    systemQueueRef.current.length = 0;
  }, [releaseListening, setEvent]);

  const toggleMic = useCallback(() => {
    if (listeningRequestedRef.current) {
      releaseListening(true);
      return;
    }
    beginListening(true);
  }, [beginListening, releaseListening]);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      const voices = loadedVoices();
      setVoiceTotal(voices.length);
      setVoiceNames(voices.map((voice) => `${voice.name} (${voice.lang})`));
    };
    refresh();
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.addEventListener("voiceschanged", refresh);
    return () => synth.removeEventListener("voiceschanged", refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let fallbackActivated = false;
    llmControllersRef.current.add(controller);
    topicPackRef.current = localPack;
    setTopicPack(localPack);
    setPackReady(false);
    setThinking(true);

    const activateFallback = (reason: string) => {
      if (cancelled || fallbackActivated) return;
      fallbackActivated = true;
      controller.abort();
      topicPackRef.current = localPack;
      setTopicPack(localPack);
      setPackReady(true);
      setThinking(false);
      setLastError(reason);
      showSystemToast("AI topic prep is unavailable; the local, topic-specific bank is keeping the room moving.");
      setEvent("Topic-pack fallback active");
    };

    const timer = window.setTimeout(() => {
      activateFallback("Topic-pack response exceeded five seconds; local topic bank selected.");
    }, 12_000);
    const pending = requestTopicPack({
      topicTitle: topic.title,
      topicSubject: topic.subject,
      topicGroup: topic.group,
      isCustom: settings.topicId === "custom",
      language: settings.language,
      durationMinutes: settings.durationMinutes,
      format: settings.format,
    }, controller.signal);
    void pending.then((pack) => {
      if (cancelled) return;
      window.clearTimeout(timer);
      topicPackRef.current = pack;
      setTopicPack(pack);
      if (!fallbackActivated) {
        setPackReady(true);
        setThinking(false);
      }
      setEvent("Topic pack ready");
    }).catch((error: unknown) => {
      if (cancelled) return;
      window.clearTimeout(timer);
      const message = error instanceof Error ? error.message : "Topic-pack request failed.";
      activateFallback(`Topic-pack request failed: ${message}`);
    }).finally(() => llmControllersRef.current.delete(controller));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
      llmControllersRef.current.delete(controller);
    };
  }, [localPack, setEvent, settings.durationMinutes, settings.format, settings.language, settings.topicId, showSystemToast, topic.group, topic.subject, topic.title]);

  useEffect(() => {
    if (!packReady) return;
    const generation = ++generationRef.current;
    activeRef.current = true;
    startedAtRef.current = Date.now();
    remainingRef.current = settings.durationMinutes * 60;
    lastStudentAtRef.current = startedAtRef.current;
    phaseRef.current = "Opening";
    setPhase("Opening");
    setRemainingSeconds(settings.durationMinutes * 60);
    setThinking(true);
    const failsafe = window.setTimeout(() => setThinking(false), 8000);
    void runDiscussion(generation);
    const timer = window.setInterval(() => {
      if (!activeRef.current || generationRef.current !== generation) return;
      const next = Math.max(0, remainingRef.current - 1);
      remainingRef.current = next;
      setRemainingSeconds(next);
      const elapsed = settings.durationMinutes * 60 - next;
      if (elapsed >= 30 && phaseRef.current === "Opening" && next > 60) {
        phaseRef.current = "Discussion";
        setPhase("Discussion");
      }
      if (!twoMinuteNoticeRef.current && next === 120) {
        twoMinuteNoticeRef.current = true;
        systemQueueRef.current.push("Two minutes left. Try to make one final point you can support with an example.");
        setEvent("T-2:00 warning queued");
      }
      if (settings.format === "fishbowl" && !fishbowlNoticeRef.current && elapsed >= 120) {
        fishbowlNoticeRef.current = true;
        setStudentAllowed(true);
        systemQueueRef.current.push("The fishbowl is open. You can join the discussion now; what would you add?");
        setEvent("Fishbowl observation complete");
      }
      if (!longSilencePromptRef.current && Date.now() - lastStudentAtRef.current >= 40_000 && next > 60 && (settings.format === "standard" || fishbowlNoticeRef.current)) {
        longSilencePromptRef.current = true;
        systemQueueRef.current.push(`You, we'd like to hear your view. What would change your mind about ${topic.subject}?`);
      }
      if (next <= 60 && phaseRef.current !== "Closing Round") {
        phaseRef.current = "Closing Round";
        setPhase("Closing Round");
        setEvent("T-1:00 closing round begins");
      }
      if (elapsed >= 180 && !silenceNudgeShownRef.current && Date.now() - lastStudentAtRef.current >= 180_000) {
        silenceNudgeShownRef.current = true;
        showNudge("You haven't spoken for 3 minutes. A short example is enough to join in.");
      }
      if (speakingStartedAtRef.current && !longSpeechNudgeShownRef.current && Date.now() - speakingStartedAtRef.current >= 60_000) {
        longSpeechNudgeShownRef.current = true;
        showNudge("You've been speaking over 60 seconds. Land your point and let the room respond.");
      }
      if (next === 0) forceClosingRef.current = true;
    }, 1000);
    return () => {
      window.clearTimeout(failsafe);
      window.clearInterval(timer);
      activeRef.current = false;
      generationRef.current += 1;
      utteranceAbortRef.current?.abort();
      llmControllersRef.current.forEach((controller) => controller.abort());
      llmControllersRef.current.clear();
      cancelSpeech();
      stopRecognition(true);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [packReady, runDiscussion, settings.durationMinutes, settings.format, setEvent, showNudge, stopRecognition]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [lines, interimText]);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isEditable(event.target)) return;
      event.preventDefault();
      pttDownRef.current = true;
      if (currentSpeakerRef.current && currentSpeakerRef.current !== "student") interruptAi();
      beginListening(false);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditable(event.target)) return;
      event.preventDefault();
      if (!toggleMicRef.current) releaseListening(true);
      pttDownRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [beginListening, interruptAi, releaseListening]);

  useEffect(() => {
    if (!studentTurnOpen) return;
    let seconds = 20;
    const timer = window.setInterval(() => {
      seconds -= 1;
      if (seconds <= 0 || studentSubmissionCountRef.current > 0) window.clearInterval(timer);
      else setStudentTurnSeconds(seconds);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [studentTurnOpen]);

  const sourceCounts = countSources(lines);
  const botLines = lines.filter((line) => line.speakerId !== "student");
  const nonLiveShare = botLines.length ? botLines.filter((line) => line.source !== "AI").length / botLines.length : 0;
  const showBankWarning = botLines.length > 0 && nonLiveShare > 0.3;
  const activeParticipant = currentSpeaker && currentSpeaker !== "student" ? PERSONA_BY_ID.get(currentSpeaker) : null;
  const studentCanSpeak = studentAllowed && !sessionEnded;
  const micLabel = micStatus === "unsupported" || micStatus === "denied" ? "Type a reply" : finalizingSpeech ? "Finishing statement…" : micHeld ? studentSpeaking ? "You're speaking" : "Mic is open" : "Tap to talk";
  const micDisabled = !studentCanSpeak || !recognitionConstructor() || micStatus === "unsupported" || micStatus === "denied" || finalizingSpeech;
  const tMinusNotice = twoMinuteNoticeRef.current;

  const handleMicClick = () => {
    if (micDisabled) return;
    toggleMic();
  };

  const handleVolumeChange = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    audioControlsRef.current = { ...audioControlsRef.current, volume: next };
    setAudioVolume(next);
    onSettingsPatch({ volume: next });
  };
  const handleSpeedChange = (value: number) => {
    const next = Math.max(0.8, Math.min(1.2, value));
    audioControlsRef.current = { ...audioControlsRef.current, voiceSpeed: next };
    setVoiceSpeed(next);
    onSettingsPatch({ voiceSpeed: next });
  };
  const handleCaptionSizeChange = (value: number) => {
    const next = Math.max(16, Math.min(26, value));
    setCaptionSize(next);
    onSettingsPatch({ captionSize: next });
  };

  if (sessionEnded) {
    return <ReportScreen
      lines={transcriptRef.current}
      topicTitle={topic.title}
      topicPack={topicPackRef.current ?? localPack}
      sessionId={`session-${startedAtRef.current}`}
      language={settings.language}
      pressure={settings.pressure}
      volume={audioVolume}
      voiceSpeed={voiceSpeed}
      onAnalyze={async () => await requestAnalysis({ lines: transcriptRef.current, topicPack: topicPackRef.current ?? localPack }) as AnalysisResult}
      onPractise={onBack}
    />;
  }

  return (
    <main className="room-shell">
      {offline && <div className="offline-banner"><WifiOff size={13} /> You're offline — the local room keeps running.</div>}
      <header className="room-topbar">
        <div className="room-brand"><span className="brand-mark"><AudioLines size={17} /></span><span className="brand-copy"><strong>GD ARENA</strong><small>LIVE PRACTICE</small></span></div>
        <div className="room-topic-head"><small>{topic.group} discussion</small><strong>{topicPack?.debateQuestion ?? topic.title}</strong></div>
        <div className="room-statuses">
          <span className="room-phase"><i className="phase-dot" />{phase}</span>
          <span className="room-clock"><Clock3 size={15} />{formatTime(remainingSeconds)}</span>
        </div>
      </header>
      <div className="room-disclosure"><ShieldCheck size={13} /><span>All other participants and the moderator are AI. Only you are human.</span><span className="room-live-dot"><i /> ROOM LIVE</span></div>
      <div className="room-audio-strip" aria-label="Persistent voice controls">
        <label htmlFor="room-volume">Volume <input id="room-volume" type="range" min="0" max="1" step="0.05" value={audioVolume} onChange={(event) => handleVolumeChange(Number(event.target.value))} /><span>{Math.round(audioVolume * 100)}%</span></label>
        <label htmlFor="room-voice-speed">Voice speed <input id="room-voice-speed" type="range" min="0.8" max="1.2" step="0.05" value={voiceSpeed} onChange={(event) => handleSpeedChange(Number(event.target.value))} /><span>{voiceSpeed.toFixed(2)}×</span></label>
        {voiceTotal === 1 && <small className="single-voice-note">One voice: {voiceNames[0] ?? "browser default"}; pitch and rate distinguish personas.</small>}
      </div>
      <div className="room-primer-row"><button type="button" className="topic-primer-trigger" onClick={() => setPrimerOpen(true)} disabled={!topicPack}>20-second topic primer</button>{!topicPack && <small>Preparing topic angles…</small>}</div>

      <div className="room-content">
        <section className="room-left" aria-label="Discussion table">
          <div className="room-panel-kicker"><span>THE DISCUSSION TABLE</span><span>{settings.format === "fishbowl" ? "FISHBOWL FORMAT" : "STANDARD FORMAT"} <b>·</b> {settings.language.toUpperCase()}</span></div>
          <div className="table-stage">
            {settings.format === "fishbowl" && !studentAllowed && <div className="fishbowl-banner"><Eye size={13} /> Observe for 2:00 <span>·</span> {formatTime(Math.max(0, 120 - (settings.durationMinutes * 60 - remainingSeconds)))}</div>}
            <div className="gd-table"><div className="table-center-label"><small>ONE ROOM · DIFFERENT ANGLES</small><strong>{phase === "Closing Round" ? "Last thoughts" : "Take a breath. Take a turn."}</strong></div></div>
            <div className="seat seat-moderator" style={{ "--seat-color": MODERATOR.color } as React.CSSProperties}>
              <div className="seat-avatar">{MODERATOR.initials}<span className="seat-bars"><i /><i /><i /></span></div><span className="seat-name">Prof. Iyer</span><span className="seat-role">AI moderator</span>
            </div>
            {participants.map((persona, index) => {
              const seatClass = ["seat-5", "seat-2", "seat-3", "seat-4", "seat-1"][index];
              const active = currentSpeaker === persona.id;
              return (
                <div key={persona.id} className={`seat ${seatClass} ${active ? "seat-active" : ""}`} style={{ "--seat-color": persona.color } as React.CSSProperties}>
                  <div className="seat-avatar">{persona.initials}<span className="seat-bars"><i /><i /><i /></span></div><span className="seat-name">{persona.name}</span><span className="seat-role">{persona.role}</span>
                </div>
              );
            })}
            {studentTurnOpen && <div className="fishbowl-banner"><Zap size={13} /> Your closing turn <b>{studentTurnSeconds}s</b></div>}
            <div className={`student-seat ${studentSpeaking || studentTurnOpen ? "student-speaking" : ""}`}>
              <span className="student-avatar">YOU</span><span className="student-seat-copy"><strong>{studentSpeaking ? "You're speaking" : studentTurnOpen ? "Your final turn" : micHeld ? "Mic is open" : "You · Human"}</strong><small>{micStatus === "denied" || micStatus === "unsupported" ? "Typed replies enabled" : studentAllowed ? "Mic off until you hold to talk" : "Watching the room"}</small></span>
            </div>
            {currentLine && <div className={`table-caption ${currentSpeaker === "student" ? "table-caption-quiet" : ""}`} style={{ "--caption-size": `${captionSize}px` } as React.CSSProperties} aria-live="polite"><small>{activeParticipant?.name ?? (currentSpeaker === "student" ? "YOUR TURN" : "ROOM")}</small>{highlightedSpeech(currentLine, currentSpeaker !== "student" && isSpeaking, speechProgress)}</div>}
          </div>
          {thinking && <div className="thinking-note"><span className="thinking-dots"><i /><i /><i /></span> Preparing the room…</div>}
        </section>

        <aside className="room-right" aria-label="Live captions and diagnostics">
          <div className="caption-header"><MessageSquareText size={16} /><strong>Live captions</strong><small>{lines.length} turns</small></div>
          {showBankWarning && <div className="ai-source-warning" role="status">More than 30% of room lines are from the topic bank or local fallback; live AI is recovering.</div>}
          <div className="caption-feed" ref={feedRef} aria-live="polite" aria-relevant="additions text" style={{ "--caption-size": `${captionSize}px` } as React.CSSProperties}>
            {lines.length === 0 && <div className="caption-empty"><AudioLines size={22} /><strong>The room is finding its rhythm</strong><span>The moderator will open with the topic, then invite the first voice.</span></div>}
            {lines.map((line) => {
              const persona = line.speakerId === "student" ? null : PERSONA_BY_ID.get(line.speakerId);
              return <article key={line.id} className={`caption-line ${line.speakerId === "student" ? "caption-line-student" : ""}`}>
                <div className="caption-line-top"><i className="caption-speaker-dot" style={{ backgroundColor: persona?.color ?? "#b7c795" }} /><span className="caption-speaker-name">{line.speakerName}</span><time>{line.id} · {timeLabel(line.timestamp, startedAtRef.current)}</time>{line.speakerId !== "student" && <span className={`line-source ${line.source === "FALLBACK" ? "line-source-fallback" : ""}`}>{line.source}</span>}</div>
                <p>{highlightedSpeech(line.text, line.id === liveLineId, speechProgress)}</p>{line.interrupted && <span className="line-interrupted">[interrupted]</span>}
              </article>;
            })}
            {interimText && <article className="caption-line caption-line-student"><div className="caption-line-top"><i className="caption-speaker-dot" style={{ backgroundColor: "#b7c795" }} /><span className="caption-speaker-name">You · live speech</span></div><p>{interimText}</p></article>}
          </div>
          <div className="caption-controls"><label htmlFor="caption-size">Caption size <b className="caption-size-value">{captionSize}px</b><input id="caption-size" type="range" min="16" max="26" step="1" value={captionSize} aria-label="Live caption text size" onChange={(event) => handleCaptionSizeChange(Number(event.target.value))} /></label><span className="caption-on"><i /> Captions on</span></div>
          <GdPulse active={studentSpeaking} lines={lines} topicPack={topicPack ?? localPack} pressure={settings.pressure} />
          <div className="debug-wrap">
            <button className="debug-toggle" type="button" onClick={() => setDebugOpen((open) => !open)} aria-expanded={debugOpen}><span><Settings2 size={12} /> DEBUG PANEL</span><ChevronDown size={13} style={{ transform: debugOpen ? "rotate(180deg)" : undefined }} /></button>
            {debugOpen && <div className="debug-content"><span>state <b>{sessionEnded ? "complete" : isSpeaking ? "speaking" : micHeld ? "listening" : "running"}</b></span><span>speaker <b>{activeParticipant?.name ?? (currentSpeaker === "student" ? "You" : "—")}</b></span><span>last event <b title={lastEvent}>{lastEvent}</b></span><span>last error <b title={lastError}>{lastError}</b></span><span>voices loaded <b>{voiceTotal || aiVoiceCount()}{voiceTotal === 1 ? ` · ${voiceNames[0] ?? "default"}` : ""}</b></span><span>phase / time <b>{phase} · {formatTime(remainingSeconds)}</b></span><span>AI turns <b>{Object.values(turns).reduce((sum, count) => sum + count, 0)}</b></span><span className="debug-counts">lines <b>AI {sourceCounts.live} · BANK {sourceCounts.bank} · FALLBACK {sourceCounts.fallback}</b></span></div>}
          </div>
        </aside>
      </div>

      <form className="room-controls" onSubmit={submitTyped}>
        <button className={`ptt-button ${micHeld ? "ptt-active" : ""} ${micDisabled ? "ptt-disabled" : ""}`} type="button" disabled={micDisabled} onClick={handleMicClick} aria-label={micLabel}>
          {micDisabled ? <MicOff size={17} /> : <Mic size={17} />}<span><strong>{finalizingSpeech ? "Finishing statement…" : micHeld ? studentSpeaking ? "Speaking…" : "Listening…" : micLabel}</strong><small>{settings.format === "fishbowl" && !studentAllowed ? "First 2 min: observe" : finalizingSpeech ? "Collecting final words…" : micHeld ? "Tap again when finished" : "Tap to start · tap again to finish"}</small></span>
        </button>
        <span className="room-key-hint"><kbd>SPACE</kbd> hold to talk</span>
        <div className="typed-reply"><input value={typedDraft} onChange={(event) => setTypedDraft(event.target.value)} placeholder={studentAllowed ? "Or type your point…" : "You'll be invited in after the first 2 minutes…"} disabled={!studentAllowed || sessionEnded} aria-label="Type your reply" /><button className="typed-send" type="submit" disabled={!studentAllowed || sessionEnded || countRealWords(typedDraft) < 2} aria-label="Send reply"><Send size={15} /></button></div>
        <button className="interrupt-button" type="button" onClick={interruptAi} disabled={!isSpeaking || !currentSpeaker || currentSpeaker === "student"}><Zap size={13} /> Tap to interrupt</button>
        <button className="end-button" type="button" onClick={handleEndEarly} disabled={sessionEnded}><Square size={12} /> End early</button>
      </form>
      <div className="room-bottom-note"><Info size={12} /> Your speech is transcribed in this browser; no recording is saved.<span className="room-bottom-right">{settings.format === "fishbowl" && !studentAllowed ? "OBSERVATION WINDOW" : tMinusNotice ? "TWO-MINUTE MARK PASSED" : "TAP MIC TO FINISH WHEN READY"}</span></div>
      {toast && <div className="toast-nudge" role="status"><Lightbulb size={14} />{toast}</div>}
      {primerOpen && topicPack && <div className="topic-primer-modal" role="dialog" aria-modal="true" aria-label="Silent topic primer"><div><TopicPrimer topicPack={topicPack} onDismiss={() => setPrimerOpen(false)} /></div></div>}
    </main>
  );
}
