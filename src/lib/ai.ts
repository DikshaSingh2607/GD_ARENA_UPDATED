import type { AiPersonaId, LiveLineResponse, Topic, TopicPack, TopicPackLine, PersonaId, SessionSettings } from "../types";

export interface TopicPackRequest {
  topicTitle: string;
  topicSubject: string;
  topicGroup: string;
  isCustom: boolean;
  language: SessionSettings["language"];
  durationMinutes: SessionSettings["durationMinutes"];
  format: SessionSettings["format"];
}

export interface LiveLineRequest {
  speaker: PersonaId;
  personaRole: string;
  language: SessionSettings["language"];
  pressure: SessionSettings["pressure"];
  intent: "discussion" | "redirect" | "closing" | "opening" | "invite";
  topicPack: TopicPack;
  last4: Array<{ speakerName: string; text: string }>;
  pointsMade: string[];
  usedAngles: string[];
  ownEarlierPoint?: string;
  repairNote?: string;
}

let callQueue = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = callQueue.then(task, task);
  callQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function post(operation: string, data: object, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ operation, ...data }),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; data?: unknown; error?: string };
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error || `AI request failed (${response.status}).`);
  }
  return payload.data;
}

export function requestTopicPack(input: TopicPackRequest, signal?: AbortSignal): Promise<TopicPack> {
  return serialize(async () => await post("topic-pack", input, signal) as TopicPack);
}

export function requestLiveLine(input: LiveLineRequest, signal?: AbortSignal): Promise<LiveLineResponse> {
  return serialize(async () => await post("live-line", input, signal) as LiveLineResponse);
}

export function requestAnalysis(input: { lines: unknown[]; topicPack: TopicPack }, signal?: AbortSignal): Promise<unknown> {
  return serialize(async () => await post("analysis", input, signal));
}

const STOP_WORDS = new Set((
  "a an and are as at be been but by can could did do does for from had has have he her here him his how i if in into is it its just may me might more my no not of on one or our out she should so than that the their them then there these they this those to too up us was we were what when where which who will with would you your yours also about after before between into only very each some any much many each while because through over under against both both"
).split(/\s+/));

function normalizedWords(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

function contentWords(text: string, ignored: Set<string> = new Set()): Set<string> {
  return new Set(normalizedWords(text).filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !ignored.has(word)));
}

function topicTerms(pack: TopicPack): Set<string> {
  const all = [pack.definition, ...pack.keywords.flatMap((item) => [item.keyword, ...item.synonyms])].join(" ");
  return contentWords(all);
}

function phrasePresent(candidate: string, phrase: string): boolean {
  const phraseWords = normalizedWords(phrase);
  if (!phraseWords.length) return false;
  const words = new Set(normalizedWords(candidate));
  if (phraseWords.length === 1) return words.has(phraseWords[0]);
  return phraseWords.filter((word) => words.has(word)).length >= Math.min(2, phraseWords.length);
}

function addressedByName(candidate: string, previousName: string): boolean {
  const lower = candidate.toLowerCase();
  if (previousName === "You") return /\b(you|your)\b/i.test(candidate);
  const nameParts = normalizedWords(previousName);
  return nameParts.length > 0 && nameParts.every((part) => lower.normalize("NFKD").includes(part));
}

function directReference(candidate: string, previous?: { speakerName: string; text: string }): boolean {
  if (!previous || !addressedByName(candidate, previous.speakerName)) return false;
  const priorWords = contentWords(previous.text);
  const currentWords = contentWords(candidate);
  let overlap = 0;
  for (const word of currentWords) if (priorWords.has(word)) overlap += 1;
  return overlap >= 1;
}

function containsFullTitle(candidate: string, title: string): boolean {
  const phrase = normalizedWords(title).join(" ");
  if (phrase.split(" ").filter(Boolean).length < 3) return false;
  return normalizedWords(candidate).join(" ").includes(phrase);
}

function similarity(first: string, second: string, ignored: Set<string>): number {
  const left = contentWords(first, ignored);
  const right = contentWords(second, ignored);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

const BANNED_OPENERS = ["looking at", "we must", "it is imperative", "keeping in mind", "i feel we might be overlooking"];

export function validateLiveLine(
  candidate: string,
  pack: TopicPack,
  last4: Array<{ speakerName: string; text: string }>,
  topicTitle: string,
  recentLines: string[],
): string | null {
  const text = candidate.trim();
  if (!text) return "The line was empty.";
  const lower = text.toLowerCase();
  if (BANNED_OPENERS.some((opening) => lower.startsWith(opening))) return "Avoid the banned generic opening.";
  if (containsFullTitle(text, topicTitle) || containsFullTitle(text, pack.debateQuestion)) return "Do not repeat the full topic title.";

  const keywordHit = pack.keywords.some((entry) => [entry.keyword, ...entry.synonyms].some((term) => phrasePresent(text, term)));
  const previous = last4.at(-1);
  if (!keywordHit && !directReference(text, previous)) return "The line must use a topic keyword or directly connect to the previous point.";
  if (previous && !addressedByName(text, previous.speakerName)) return `Address ${previous.speakerName} by name in the first sentence.`;

  const ignored = topicTerms(pack);
  const tooSimilar = recentLines.slice(-10).some((line) => similarity(text, line, ignored) > 0.65);
  if (tooSimilar) return "This point overlaps too much with one of the last ten lines.";
  return null;
}

export function makeLocalTopicPack(topic: Topic): TopicPack {
  const personaIds: AiPersonaId[] = ["rohan", "ananya", "meera", "karan", "sana"];
  const seedLines = personaIds.map((id) => topic.arguments[id]);
  const angleSeeds = [...seedLines, topic.counterAngle, topic.moderatorRedirect, topic.moderatorInvite];
  const angles = Array.from({ length: 8 }, (_, index) => {
    const text = angleSeeds[index % angleSeeds.length];
    return {
      id: `local-${index + 1}`,
      label: index < 5 ? personaIds[index] : `Local angle ${index + 1}`,
      argument: text,
      example: text,
      counterArgument: topic.counterAngle,
    };
  });
  const terms = [...new Set(normalizedWords(`${topic.subject} ${topic.title} ${topic.counterAngle}`).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
  const keywordTerms = [...terms];
  while (keywordTerms.length < 8) keywordTerms.push(topic.subject);
  const keywords = keywordTerms.slice(0, 8).map((keyword) => ({ keyword, synonyms: [topic.subject, topic.counterAngle] }));
  const petFallbacks: Record<AiPersonaId, string[]> = {
    rohan: [
      "Dogs suit active households; daily walks can turn pet care into shared exercise.",
      "Dogs can join hikes and park visits that build an active routine.",
      "For an outgoing owner, dogs can make neighbourhood walks social time.",
      "Training dogs gives structure to a home that enjoys a steady routine.",
      "Some households prefer cats because they need less scheduled outdoor time.",
      "Cats can suit a compact flat better than a high-energy dog.",
      "Dogs and cats both need care that fits the household's real schedule.",
      "A home with room to play can make dogs a natural fit.",
    ],
    ananya: [
      "Compare time, space, allergies, and routine before ranking dogs and cats for a home.",
      "Dogs and cats bring different food, grooming, and veterinary costs.",
      "A shared flat may suit cats better when the landlord limits dogs.",
      "People who travel often need a reliable sitter for dogs or cats.",
      "Compare weekday routines before deciding whether dogs fit a household.",
      "Allergies can change whether dogs or cats are a practical match.",
      "A short pet-care trial can reveal whether dogs suit the owner's schedule.",
      "The comparison is clearer when households count time, space, and pet costs.",
    ],
    meera: [
      "The animal's welfare matters more than calling dogs or cats the better choice.",
      "Dogs and cats both need a home that meets their daily needs.",
      "If an owner cannot offer time, a dog's needs should come first.",
      "A cat's quiet nature does not mean it can be left without care.",
      "Adopted dogs or cats may need patience while they settle into a home.",
      "People should choose dogs or cats by the care they can reliably provide.",
      "A calm match protects both the animal and the person adopting it.",
      "Dogs and cats deserve a stable home, not a choice made for status.",
    ],
    karan: [
      "Cats may fit a small flat, while energetic dogs often need outdoor time.",
      "A dog park nearby makes dogs easier to exercise after long lectures.",
      "When students share a flat, agree who feeds dogs or cats during exams.",
      "Cats can be calmer at home, while dogs can make outdoor plans easier.",
      "A nearby vet matters for dogs and cats when a student is busy.",
      "A morning dog walk works only if someone's class schedule leaves time.",
      "For a student who travels, pet-sitting can decide between dogs and cats.",
      "A cat can suit a small room, but its daily care still needs a plan.",
    ],
    sana: [
      "Rohan's activity point and Karan's space point show that the right fit depends on the home.",
      "Ananya's cost check and Meera's care point both matter for dogs and cats.",
      "Dogs may fit active homes, while cats can suit quieter spaces.",
      "A fair comparison includes time, cost, space, and each animal's welfare.",
      "The right answer depends on whether an owner can meet dogs' or cats' needs.",
      "Cats and dogs both need daily attention, not only affection.",
      "Rohan's exercise point and Ananya's time check can guide dog owners.",
      "Meera's care standard and Karan's space example apply to both cats and dogs.",
    ],
  };
  const isPetTopic = topic.subject === "dogs and cats as pets";
  const scripts = Object.fromEntries(personaIds.map((id) => {
    const lines = isPetTopic ? petFallbacks[id] : [topic.arguments[id]];
    return [id, lines.map((text, index) => ({
      text,
      respondsTo: "You",
      pointSummary: `${topic.subject}: ${text.slice(0, 72)}`,
      angleUsed: `${topic.subject}-${index + 1}`,
    }))];
  })) as TopicPack["scripts"];
  return {
    debateQuestion: topic.title,
    definition: `A discussion about ${topic.subject}.`,
    openingLine: topic.moderatorRedirect,
    facts: ["Roughly, local conditions can change how this issue affects students.", "Reportedly, the practical impact depends on the campus and the people involved."],
    angles,
    keywords,
    scripts,
  };
}

export function selectBankLine(
  pack: TopicPack,
  speaker: AiPersonaId,
  previousName: string,
  usedKeys: Set<string>,
  last4: Array<{ speakerName: string; text: string }>,
  topicTitle: string,
  recentLines: string[],
): { key: string; line: TopicPackLine } | null {
  const choices = pack.scripts[speaker] ?? [];
  const previous = previousName.toLowerCase();
  const ranked = choices.map((line, index) => ({ line, index, matched: line.respondsTo.toLowerCase() === previous }))
    .filter((entry) => !usedKeys.has(`${speaker}:${entry.index}`))
    .sort((a, b) => Number(b.matched) - Number(a.matched));
  for (const entry of ranked) {
    const reason = validateLiveLine(entry.line.text, pack, last4, topicTitle, recentLines);
    if (!reason && entry.matched) return { key: `${speaker}:${entry.index}`, line: entry.line };
  }
  for (const entry of ranked) {
    // A prepared bank fallback remains topic-specific even if its addressee metadata is imperfect.
    const keywordHit = pack.keywords.some((item) => [item.keyword, ...item.synonyms].some((term) => phrasePresent(entry.line.text, term)));
    if (keywordHit && !containsFullTitle(entry.line.text, topicTitle)) return { key: `${speaker}:${entry.index}`, line: entry.line };
  }
  return null;
}
