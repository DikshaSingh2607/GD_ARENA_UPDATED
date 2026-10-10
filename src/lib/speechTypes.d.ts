export interface RecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface RecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: RecognitionAlternativeLike;
}

export interface RecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResultLike>;
}

export interface RecognitionErrorLike extends Event {
  readonly error: string;
}

export interface RecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionConstructor = new () => RecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}
