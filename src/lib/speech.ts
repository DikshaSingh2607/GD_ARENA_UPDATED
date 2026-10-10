import { MODERATOR, PERSONAS } from "../data/personas";
import type { Persona, PersonaId, SessionSettings } from "../types";

export type SpeakResult = "ended" | "error" | "interrupted" | "unavailable";

export interface SpeechProgress {
  chunkIndex: number;
  wordIndex: number;
  chunkText: string;
}

export interface SpeechOptions {
  volume?: number;
  voiceSpeed?: number;
  onProgress?: (progress: SpeechProgress) => void;
}

const PERSONA_ORDER: PersonaId[] = ["rohan", "ananya", "meera", "karan", "sana", "moderator"];
let voiceCache: SpeechSynthesisVoice[] = [];

export function loadedVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) voiceCache = voices;
  return voices.length ? voices : voiceCache;
}

export function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const current = synth.getVoices();
  if (current.length) {
    voiceCache = current;
    return Promise.resolve(current);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      synth.removeEventListener("voiceschanged", onVoicesChanged);
      const voices = synth.getVoices();
      if (voices.length) voiceCache = voices;
      resolve(voices.length ? voices : voiceCache);
    };
    const onVoicesChanged = () => {
      if (synth.getVoices().length) finish();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    synth.addEventListener("voiceschanged", onVoicesChanged);
  });
}

export function recognitionConstructor(): (new () => import("./speechTypes").RecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function getPersona(personaId: PersonaId): Persona {
  return personaId === "moderator" ? MODERATOR : PERSONAS.find((item) => item.id === personaId) ?? MODERATOR;
}

function chooseVoice(personaId: PersonaId, voices: SpeechSynthesisVoice[], language: SessionSettings["language"]): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  const priority = language === "Hinglish" ? ["hi-IN", "en-IN"] : ["en-IN", "en-GB", "en-US"];
  const preferred: SpeechSynthesisVoice[] = [];
  for (const locale of priority) {
    preferred.push(...voices.filter((voice) => voice.lang.toLowerCase() === locale.toLowerCase()));
  }
  const fallbackEnglish = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en-"));
  const pool = preferred.length ? preferred : fallbackEnglish.length ? fallbackEnglish : voices;
  const index = Math.max(0, PERSONA_ORDER.indexOf(personaId));
  return pool[index % pool.length];
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberWords(value: number): string {
  if (value < 20) return ONES[value];
  if (value < 100) return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ""}`;
  if (value < 1000) return `${ONES[Math.floor(value / 100)]} hundred${value % 100 ? ` ${numberWords(value % 100)}` : ""}`;
  return String(value);
}

export function cleanSpeechText(input: string): string {
  let text = input
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\bWFH\b/gi, "work from home")
    .replace(/\bRs\.?\s*(?=\d)/gi, "rupees ")
    .replace(/%/g, " percent ")
    .replace(/&/g, " and ")
    .replace(/\bAI\b/gi, "A I")
    .replace(/^[\s>•-]+/gm, "")
    .replace(/[\*_`#~]/g, "")
    .replace(/(^|\s)'([^'\n]+)'(?=\s|[.,!?;:]|$)/g, "$1$2")
    .replace(/["“”‘’]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "");
  text = text.replace(/\b\d{1,3}\b/g, (digits) => numberWords(Number(digits)));
  return text.replace(/\s+/g, " ").trim();
}

function sentenceParts(text: string): string[] {
  return text.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? (text.trim() ? [text.trim()] : []);
}

export function splitSpeechChunks(text: string, maxWords = 18): string[] {
  const chunks: string[] = [];
  for (const sentence of sentenceParts(text)) {
    const words = sentence.match(/\S+/g) ?? [];
    for (let index = 0; index < words.length; index += maxWords) {
      chunks.push(words.slice(index, index + maxWords).join(" "));
    }
  }
  return chunks;
}

export function wordIndexAt(chunk: string, charIndex: number): number {
  const matches = [...chunk.matchAll(/\S+/g)];
  const found = matches.findIndex((match) => {
    const start = match.index ?? 0;
    return charIndex <= start + match[0].length;
  });
  return found >= 0 ? found : Math.max(0, matches.length - 1);
}

export function speakText(
  text: string,
  personaId: PersonaId,
  language: SessionSettings["language"],
  signal?: AbortSignal,
  options: SpeechOptions = {},
): Promise<SpeakResult> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve("unavailable");
  const synth = window.speechSynthesis;
  const phrases = splitSpeechChunks(cleanSpeechText(text));
  if (!phrases.length) return Promise.resolve("ended");

  return new Promise((resolve) => {
    let done = false;
    let chunkIndex = 0;
    let hadError = false;
    let watchdog: number | undefined;
    const finish = (result: SpeakResult) => {
      if (done) return;
      done = true;
      if (watchdog !== undefined) window.clearTimeout(watchdog);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => {
      synth.cancel();
      finish("interrupted");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    const persona = getPersona(personaId);
    const volume = Math.max(0, Math.min(1, options.volume ?? 1));
    const voiceSpeed = Math.max(0.8, Math.min(1.2, options.voiceSpeed ?? 1));
    const deliverProgress = (progress: SpeechProgress) => {
      try { options.onProgress?.(progress); } catch { /* UI progress must never stop speech. */ }
    };

    const advance = () => {
      if (done) return;
      chunkIndex += 1;
      window.setTimeout(() => speakChunk(0), 20);
    };

    const speakChunk = (attempt: number) => {
      if (done) return;
      if (signal?.aborted) {
        onAbort();
        return;
      }
      if (chunkIndex >= phrases.length) {
        finish(hadError ? "error" : "ended");
        return;
      }

      const chunk = phrases[chunkIndex];
      const utterance = new SpeechSynthesisUtterance(chunk);
      const voice = chooseVoice(personaId, voiceCache.length ? voiceCache : loadedVoices(), language);
      if (voice) utterance.voice = voice;
      utterance.lang = language === "Hinglish" ? (voice?.lang ?? "en-IN") : (voice?.lang ?? "en-IN");
      utterance.pitch = Math.max(0.85, Math.min(1.25, persona.pitch));
      utterance.rate = Math.max(0.8, Math.min(1.2, persona.rate * voiceSpeed));
      utterance.volume = volume;
      deliverProgress({ chunkIndex, wordIndex: -1, chunkText: chunk });

      let settled = false;
      const clearWatchdog = () => {
        if (watchdog !== undefined) window.clearTimeout(watchdog);
        watchdog = undefined;
      };
      const retryOrAdvance = () => {
        if (settled || done) return;
        settled = true;
        clearWatchdog();
        hadError = true;
        synth.cancel();
        window.setTimeout(() => {
          if (done) return;
          if (attempt === 0) speakChunk(1);
          else advance();
        }, 100);
      };

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name !== "word" && !event.charLength) return;
        deliverProgress({ chunkIndex, wordIndex: wordIndexAt(chunk, event.charIndex), chunkText: chunk });
      };
      utterance.onend = () => {
        if (settled || done) return;
        settled = true;
        clearWatchdog();
        advance();
      };
      utterance.onerror = retryOrAdvance;
      watchdog = window.setTimeout(retryOrAdvance, Math.max(9000, chunk.length * 90 + 5000));
      try {
        synth.speak(utterance);
      } catch {
        retryOrAdvance();
      }
    };

    void waitForVoices().then(() => {
      if (done || signal?.aborted) {
        if (signal?.aborted) onAbort();
        return;
      }
      // Always clear a stale utterance before a new line, never between successful chunks.
      synth.cancel();
      speakChunk(0);
    }).catch(() => {
      if (!done) {
        synth.cancel();
        speakChunk(0);
      }
    });
  });
}

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function voiceCount(): number {
  return loadedVoices().length;
}
