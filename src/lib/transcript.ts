import type { LineSource, PersonaId, TranscriptLine } from "../types";

let sequence = 0;

export function makeTranscriptLine(
  speakerId: PersonaId | "student",
  speakerName: string,
  text: string,
  source: LineSource = "FALLBACK",
): TranscriptLine {
  sequence += 1;
  return {
    id: `T${sequence}`,
    timestamp: Date.now(),
    speakerId,
    speakerName,
    text: text.trim(),
    interrupted: false,
    source,
  };
}

export function countRealWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [])
    .filter((word) => word.replace(/[’']/g, "").length > 1)
    .filter((word) => !/^(um+|uh+|erm+|hmm+)$/i.test(word)).length;
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const rest = Math.max(0, seconds) % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
