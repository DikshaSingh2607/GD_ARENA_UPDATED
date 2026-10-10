import type { SavedSession, SessionSettings, TranscriptLine } from "../types";

const SETTINGS_KEY = "gd-arena-settings-v1";
const HISTORY_KEY = "gd-arena-history-v1";
const TRANSCRIPT_KEY = "gd-arena-current-transcript-v1";

export const DEFAULT_SETTINGS: SessionSettings = {
  topicId: "work-from-home",
  customTopic: "",
  panelSize: 4,
  format: "standard",
  language: "English",
  durationMinutes: 5,
  patienceSeconds: 1.6,
  captionSize: 18,
  volume: 1,
  voiceSpeed: 1,
  pressure: "Realistic",
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings(): SessionSettings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<SessionSettings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(settings: SessionSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing and storage quotas must not block a practice session.
  }
}

export function saveCurrentTranscript(lines: TranscriptLine[]): void {
  try {
    localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(lines));
  } catch {
    // The room stays functional when persistence is unavailable.
  }
}

export function saveCompletedSession(session: SavedSession): void {
  try {
    const history = readJson<SavedSession[]>(HISTORY_KEY, []);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([session, ...history].slice(0, 30)));
    localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(session.lines));
  } catch {
    // Do not let storage failure interrupt the turn loop.
  }
}

export function loadSessionHistory(): SavedSession[] {
  return readJson<SavedSession[]>(HISTORY_KEY, []);
}
