export type PersonaId = "moderator" | "rohan" | "ananya" | "meera" | "karan" | "sana";
export type AiPersonaId = Exclude<PersonaId, "moderator">;
export type TopicGroup = "Abstract" | "Controversial" | "Case-based" | "Current affairs India" | "Campus";
export type SessionFormat = "standard" | "fishbowl";
export type LanguageMode = "English" | "Hinglish";
export type PressureLevel = "Friendly" | "Realistic" | "Cut-throat";
export type Phase = "Opening" | "Discussion" | "Closing Round";
export type LineSource = "AI" | "BANK" | "FALLBACK";

export interface Topic {
  id: string;
  title: string;
  group: TopicGroup;
  subject: string;
  caseBrief?: [string, string, string];
  arguments: Record<AiPersonaId, string>;
  moderatorRedirect: string;
  moderatorInvite: string;
  counterAngle: string;
}

export interface TopicAngle {
  id: string;
  label: string;
  argument: string;
  example: string;
  counterArgument: string;
}

export interface TopicKeyword {
  keyword: string;
  synonyms: string[];
}

export interface TopicPackLine {
  text: string;
  respondsTo: string;
  pointSummary: string;
  angleUsed: string;
}

export interface TopicPack {
  debateQuestion: string;
  definition: string;
  openingLine: string;
  facts: string[];
  angles: TopicAngle[];
  keywords: TopicKeyword[];
  scripts: Record<AiPersonaId, TopicPackLine[]>;
}

export interface LiveLineResponse {
  speaker: PersonaId;
  text: string;
  addresses: string[];
  intent: string;
  pointSummary: string;
  angleUsed: string;
}

export interface Persona {
  id: PersonaId;
  name: string;
  role: string;
  initials: string;
  color: string;
  pitch: number;
  rate: number;
  talkativeness: number;
}

export interface SessionSettings {
  topicId: string;
  customTopic: string;
  panelSize: 3 | 4 | 5;
  format: SessionFormat;
  language: LanguageMode;
  durationMinutes: 5 | 8 | 10;
  patienceSeconds: number;
  captionSize: number;
  volume: number;
  voiceSpeed: number;
  pressure: PressureLevel;
}

export interface TranscriptLine {
  id: string;
  timestamp: number;
  speakerId: PersonaId | "student";
  speakerName: string;
  text: string;
  interrupted: boolean;
  source: LineSource;
}

export interface SavedSession {
  id: string;
  topic: string;
  startedAt: number;
  endedAt: number;
  lines: TranscriptLine[];
}

export type MicStatus = "checking" | "ready" | "denied" | "unsupported" | "unknown";
