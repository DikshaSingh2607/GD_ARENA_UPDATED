import type { TranscriptLine } from "../types";

export function countSources(lines: TranscriptLine[]) {
  return {
    live: lines.filter((line) => line.source === "AI").length,
    bank: lines.filter((line) => line.source === "BANK").length,
    fallback: lines.filter((line) => line.source === "FALLBACK").length,
  };
}

export function countFillers(text: string): number {
  return (text.match(/\b(um|uh|erm|like|you know|basically)\b/gi) ?? []).length;
}
