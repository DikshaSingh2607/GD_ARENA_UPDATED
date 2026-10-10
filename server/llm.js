import { chatCompletion } from "./_core/llm.js";

const SPEAKERS = ["You", "Rohan", "Ananya", "Meera", "Karan", "Sana", "Prof. Iyer"];
const PERSONA_IDS = ["rohan", "ananya", "meera", "karan", "sana"];
const PERSONA_NAMES = { rohan: "Rohan", ananya: "Ananya", meera: "Meera", karan: "Karan", sana: "Sana", moderator: "Prof. Iyer" };

const scriptLineSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    respondsTo: { type: "string", enum: SPEAKERS },
    pointSummary: { type: "string" },
    angleUsed: { type: "string" },
  },
  required: ["text", "respondsTo", "pointSummary", "angleUsed"],
  additionalProperties: false,
};

const topicPackSchema = {
  type: "object",
  properties: {
    debateQuestion: { type: "string" },
    definition: { type: "string" },
    openingLine: { type: "string" },
    facts: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
    angles: {
      type: "array", minItems: 8, maxItems: 8,
      items: {
        type: "object",
        properties: {
          id: { type: "string" }, label: { type: "string" }, argument: { type: "string" },
          example: { type: "string" }, counterArgument: { type: "string" },
        },
        required: ["id", "label", "argument", "example", "counterArgument"],
        additionalProperties: false,
      },
    },
    keywords: {
      type: "array", minItems: 8, maxItems: 8,
      items: {
        type: "object",
        properties: { keyword: { type: "string" }, synonyms: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } } },
        required: ["keyword", "synonyms"],
        additionalProperties: false,
      },
    },
    scripts: {
      type: "object",
      properties: Object.fromEntries(PERSONA_IDS.map((id) => [id, { type: "array", minItems: 8, maxItems: 8, items: scriptLineSchema }])),
      required: PERSONA_IDS,
      additionalProperties: false,
    },
  },
  required: ["debateQuestion", "definition", "openingLine", "facts", "angles", "keywords", "scripts"],
  additionalProperties: false,
};

const liveLineSchema = {
  type: "object",
  properties: {
    speaker: { type: "string", enum: ["moderator", ...PERSONA_IDS] },
    text: { type: "string" },
    addresses: { type: "array", items: { type: "string" } },
    intent: { type: "string" },
    pointSummary: { type: "string" },
    angleUsed: { type: "string" },
  },
  required: ["speaker", "text", "addresses", "intent", "pointSummary", "angleUsed"],
  additionalProperties: false,
};

const evidenceSchema = {
  type: "object",
  properties: {
    quote: { type: "string" }, lineId: { type: "string" }, timestamp: { type: "number" },
  },
  required: ["quote", "lineId", "timestamp"],
  additionalProperties: false,
};
const feedbackSchema = {
  type: "object",
  properties: { text: { type: "string" }, evidence: { type: "array", maxItems: 2, items: evidenceSchema } },
  required: ["text", "evidence"],
  additionalProperties: false,
};
const criterionSchema = {
  type: "object",
  properties: { score: { type: "integer", minimum: 0, maximum: 10 }, reason: { type: "string" }, evidence: { type: "array", maxItems: 2, items: evidenceSchema } },
  required: ["score", "reason", "evidence"],
  additionalProperties: false,
};
const analysisSchema = {
  type: "object",
  properties: {
    overallScore: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    topStrength: feedbackSchema, topFix: feedbackSchema,
    criteria: {
      type: "object",
      properties: Object.fromEntries(["starting", "ideas", "relevance", "building", "listening", "interruptions", "ending", "clarity"].map((key) => [key, criterionSchema])),
      required: ["starting", "ideas", "relevance", "building", "listening", "interruptions", "ending", "clarity"],
      additionalProperties: false,
    },
    strengths: { type: "array", maxItems: 3, items: feedbackSchema },
    fixes: { type: "array", maxItems: 3, items: feedbackSchema },
    drill: { type: "object", properties: { title: { type: "string" }, instruction: { type: "string" } }, required: ["title", "instruction"], additionalProperties: false },
    missedOpenings: { type: "array", maxItems: 5, items: { type: "object", properties: { lineIds: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } }, context: { type: "string" }, modelAnswer: { type: "string" } }, required: ["lineIds", "context", "modelAnswer"], additionalProperties: false } },
    pointTags: { type: "array", maxItems: 100, items: { type: "object", properties: { lineId: { type: "string" }, tags: { type: "array", items: { type: "string", enum: ["Claim", "Example", "Statistic", "Question", "Rebuttal", "Summary"] } } }, required: ["lineId", "tags"], additionalProperties: false } },
    recruiterVerdict: { type: "object", properties: { panels: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", properties: { panel: { type: "string", enum: ["HR", "Technical Lead", "GD Moderator"] }, decision: { type: "string", enum: ["shortlist", "on hold", "not shortlisted"] }, reasons: { type: "array", maxItems: 2, items: evidenceSchema }, lookedFor: { type: "string" } }, required: ["panel", "decision", "reasons", "lookedFor"], additionalProperties: false } } }, required: ["panels"], additionalProperties: false },
  },
  required: ["overallScore", "summary", "topStrength", "topFix", "criteria", "strengths", "fixes", "drill", "missedOpenings", "pointTags", "recruiterVerdict"],
  additionalProperties: false,
};

const speechRules = [
  "Write natural spoken Indian English, or Hinglish when requested; use one concrete point per line.",
  "Never repeat the full debate question in a spoken sentence; refer briefly to the subject or a natural topic keyword.",
  "Avoid corporate filler: cost-benefit assessment, sustainable momentum, stakeholder consensus, ground reality, long-term trade-offs.",
  "Never begin with: Looking at, We must, It is imperative, Keeping in mind, or I feel we might be overlooking.",
  "Do not invent precise statistics or sources. If using a number, hedge it with roughly or reportedly.",
];

function requiredText(value, label, max = 180) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`Missing ${label}.`);
    error.status = 400;
    throw error;
  }
  return value.trim().slice(0, max);
}

function parseObject(text) {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(unfenced); } catch {
    const first = unfenced.indexOf("{");
    const last = unfenced.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try { return JSON.parse(unfenced.slice(first, last + 1)); } catch { /* fail below */ }
    }
    const error = new Error("The LLM response was not valid JSON.");
    error.status = 502;
    throw error;
  }
}

function assertTopicPack(pack, topicTitle, isCustom) {
  if (!pack || !Array.isArray(pack.angles) || pack.angles.length !== 8 || !Array.isArray(pack.keywords) || pack.keywords.length !== 8 || !Array.isArray(pack.facts) || pack.facts.length !== 2 || !pack.scripts) {
    const error = new Error("The LLM topic pack did not match its required shape.");
    error.status = 502;
    throw error;
  }
  for (const id of PERSONA_IDS) {
    if (!Array.isArray(pack.scripts[id]) || pack.scripts[id].length !== 8 || pack.scripts[id].some((line) => !line?.text || !line?.respondsTo)) {
      const error = new Error(`The topic pack is missing complete ${id} lines.`);
      error.status = 502;
      throw error;
    }
  }
  if (!isCustom) pack.debateQuestion = topicTitle;
  return pack;
}

export async function createTopicPack(input, signal) {
  const topicTitle = requiredText(input?.topicTitle, "topic title");
  const topicSubject = requiredText(input?.topicSubject || topicTitle, "topic subject", 200);
  const isCustom = Boolean(input?.isCustom);
  const language = input?.language === "Hinglish" ? "Hinglish" : "English";
  const topicGroup = typeof input?.topicGroup === "string" ? input.topicGroup.slice(0, 50) : "Discussion";
  const durationMinutes = [5, 8, 10].includes(Number(input?.durationMinutes)) ? Number(input.durationMinutes) : 5;
  const format = input?.format === "fishbowl" ? "fishbowl" : "standard";
  const system = [
    "You are a compact, careful GD-content writer for campus-placement practice. Return only the requested JSON.",
    "Do not browse or cite sources. Use concrete, varied, topic-specific arguments and examples.",
    ...speechRules,
  ].join("\n");
  const user = {
    chosenTopic: topicTitle,
    topicSubject,
    topicGroup,
    durationMinutes,
    format,
    isCustom,
    language,
    rewriteRule: isCustom
      ? "First rewrite the short custom topic as one clear debate question in debateQuestion. Keep the user's intended issue, do not add unrelated subtopics. Build every other field around that rewritten question."
      : "Set debateQuestion exactly equal to chosenTopic; do not change the chosen preset question.",
    contentRequirements: [
      "definition: one clear sentence that explains the issue without taking a side.",
      "angles: exactly 8 distinct angles; keep the argument, real-world scenario, and counter-argument to short phrases.",
      "keywords: exactly 8 topical keywords, each with exactly 2 natural synonyms for a code-side relevance gate.",
      "openingLine: one natural moderator sentence introducing the subject without copying the full debateQuestion, stating the available duration, and inviting You to begin; for fishbowl, explain that You observe silently for two minutes before joining.",
      "facts: exactly 2 short, hedged discussion-context talking points (roughly/reportedly); no precise invented statistics or fabricated sources.",
      "scripts: exactly 8 different, concise spoken lines per Rohan, Ananya, Meera, Karan, and Sana. Each line fits the persona, gives one distinct concrete point/example/scenario/counterpoint, avoids the full debateQuestion, and naturally addresses respondsTo.",
      "Each script respondsTo must be You, Rohan, Ananya, Meera, Karan, Sana, or Prof. Iyer. Vary it; each text is one sentence of about 10–14 words.",
      "Rohan: confident, bold opinion plus quick example, can be a little long. Ananya: one hedged number and its implication, never a fake precise source. Meera: rare, concise 10–15 words, human/ethical angle. Karan: relatable small tangent linked back in one clause. Sana: names and joins two earlier points.",
      "Avoid reusing the same point among a persona's eight lines and across personas. No markdown, quotation marks, emoji, or generic corporate filler.",
    ],
  };

  const text = await chatCompletion({
    model: "gpt-5-nano",
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }],
    maxCompletionTokens: 2300,
    reasoning: { effort: "low" },
    responseFormat: { type: "json_schema", json_schema: { name: "gd_topic_pack", strict: true, schema: topicPackSchema } },
  }, signal);
  return assertTopicPack(parseObject(text), topicTitle, isCustom);
}

export async function createLiveLine(input, signal) {
  const speaker = requiredText(input?.speaker, "speaker", 20);
  if (!["moderator", ...PERSONA_IDS].includes(speaker)) {
    const error = new Error("Unknown speaker.");
    error.status = 400;
    throw error;
  }
  const pack = input?.topicPack;
  if (!pack || !Array.isArray(pack.angles) || !Array.isArray(pack.keywords)) {
    const error = new Error("A prepared topic pack is required.");
    error.status = 400;
    throw error;
  }
  const previousLines = Array.isArray(input?.last4) ? input.last4.slice(-4).map((line) => ({
    speakerName: String(line?.speakerName || "").slice(0, 30),
    text: String(line?.text || "").slice(0, 500),
  })) : [];
  const personaName = PERSONA_NAMES[speaker];
  const scripts = speaker === "moderator" ? [] : (pack.scripts?.[speaker] ?? []);
  const payload = {
    speaker,
    personaName,
    personaRole: typeof input?.personaRole === "string" ? input.personaRole.slice(0, 40) : "Participant",
    language: input?.language === "Hinglish" ? "Hinglish" : "English",
    pressure: ["Friendly", "Realistic", "Cut-throat"].includes(input?.pressure) ? input.pressure : "Realistic",
    intent: String(input?.intent || "discussion").slice(0, 30),
    topicPack: {
      debateQuestion: pack.debateQuestion,
      definition: pack.definition,
      angles: pack.angles,
      keywords: pack.keywords,
      thisPersonaBank: scripts,
    },
    last4: previousLines,
    previousSpeaker: previousLines.at(-1)?.speakerName || "You",
    pointsMade: Array.isArray(input?.pointsMade) ? input.pointsMade.slice(-8).map((point) => String(point).slice(0, 160)) : [],
    usedAngles: Array.isArray(input?.usedAngles) ? input.usedAngles.slice(-8).map((angle) => String(angle).slice(0, 80)) : [],
    ownEarlierPoint: typeof input?.ownEarlierPoint === "string" ? input.ownEarlierPoint.slice(0, 300) : "",
    repairNote: typeof input?.repairNote === "string" ? input.repairNote.slice(0, 240) : "",
  };
  const system = [
    "You are one participant in a live campus-placement group discussion. Output only the requested JSON.",
    ...speechRules,
    "Use the topic pack and the last four transcript lines. React to the immediately previous speaker by name in the first sentence: use 'You' when the previous speaker is the student.",
    "Do not repeat a prior point; add one new, specific example, rebuttal, implication, or question. Use one point only.",
    "For the moderator, redirect with a SPECIFIC question about an angle in the pack that is not in usedAngles; invite a quiet member when appropriate.",
    "For a closing-round participant, give one or two sentences that refer to ownEarlierPoint. For a moderator invite or timing intent, keep the spoken line short and clear.",
    `Pressure setting: ${payload.pressure}. Friendly is patient and encouraging; Realistic uses natural placement intensity; Cut-throat increases direct rebuttal and quick floor-taking without overlapping speech.`,
    payload.repairNote ? `Repair requirement: ${payload.repairNote}` : "",
  ].filter(Boolean).join("\n");
  const text = await chatCompletion({
    model: "gpt-5-nano",
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload) }],
    temperature: 0.9,
    maxCompletionTokens: 700,
    reasoning: { effort: "low" },
    responseFormat: { type: "json_schema", json_schema: { name: "gd_live_line", strict: true, schema: liveLineSchema } },
  }, signal);
  const line = parseObject(text);
  if (line?.speaker !== speaker || typeof line.text !== "string" || !line.text.trim() || !Array.isArray(line.addresses) || typeof line.pointSummary !== "string") {
    const error = new Error("The LLM live line did not match its required shape.");
    error.status = 502;
    throw error;
  }
  return line;
}

export async function createAnalysis(input, signal) {
  const topicPack = input?.topicPack;
  const rawLines = Array.isArray(input?.lines) ? input.lines.slice(-120) : [];
  if (!topicPack || !Array.isArray(topicPack.angles) || rawLines.length === 0) {
    const error = new Error("A transcript and topic pack are required for analysis.");
    error.status = 400;
    throw error;
  }
  const transcript = rawLines.map((line, index) => ({
    lineId: String(line?.id || `T${index + 1}`).slice(0, 20),
    timestamp: Number(line?.timestamp) || 0,
    speaker: String(line?.speakerName || "Participant").slice(0, 40),
    isStudent: line?.speakerId === "student" || line?.speakerName === "You",
    text: String(line?.text || "").slice(0, 500),
    interrupted: Boolean(line?.interrupted),
  }));
  const studentLines = transcript.filter((line) => line.isStudent);
  if (!studentLines.length) {
    const error = new Error("The student did not contribute a transcript line, so there is no evidence to score.");
    error.status = 422;
    throw error;
  }
  const system = [
    "You are an honest campus-placement GD coach. Return only the strict JSON requested by the schema.",
    "The code computes all metrics. You write judgments only; do not invent or recalculate metrics.",
    "Use only lines where isStudent=true as evidence. Every quote must be an exact verbatim substring of that student's line and its lineId/timestamp must match exactly. Never invent quotes, IDs, times, facts, or events.",
    "If the student spoke little, say so honestly, lower confidence, give fewer feedback points and leave evidence arrays empty when unsupported. Do not criticize silence as a speaking-quality defect; explain that there is too little evidence.",
    "Evaluate the discussion against the supplied topic pack. Give exactly 3 recruiter panel verdicts (HR, Technical Lead, GD Moderator), each with two evidence quotes when available; if evidence is sparse, give fewer reasons and make the verdict provisional.",
    "Missed openings must identify a moment evident from this transcript, reference the exact T-line IDs, and provide one concise model answer. Point tags apply only to actual student lines.",
    "Scores and wording are practice feedback, not an actual hiring prediction. No medical, legal, or financial claims.",
  ].join("\n");
  const user = {
    topic: topicPack.debateQuestion,
    definition: topicPack.definition,
    angles: topicPack.angles,
    studentContributionCount: studentLines.length,
    transcript,
    requestedJudgments: [
      "overall score /100, one-line summary, top strength and top fix",
      "scores /10 with short reason: starting the discussion, quality of ideas, relevance, building on others, listening, handling interruptions, ending strongly, clarity and confidence",
      "up to 3 strengths, 3 fixes, one practice drill, 3–5 transcript-grounded missed openings when enough evidence exists",
      "tag each student point as Claim, Example, Statistic, Question, Rebuttal, Summary as applicable",
      "three clearly-labelled practice recruiter verdicts: HR, Technical Lead, GD Moderator; each shortlist/on hold/not shortlisted, two reasons linked to quotes, and what the panel looked for",
    ],
  };
  const text = await chatCompletion({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }],
    temperature: 0.25,
    maxCompletionTokens: 4200,
    reasoning: { effort: "low" },
    responseFormat: { type: "json_schema", json_schema: { name: "gd_analysis", strict: true, schema: analysisSchema } },
  }, signal);
  return parseObject(text);
}
