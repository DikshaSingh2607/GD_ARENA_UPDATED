import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowRight, AudioLines, Check, ChevronDown, Clock3, Headphones,
  Info, Mic, MicOff, Plus, ShieldCheck, SlidersHorizontal, Users, Volume2,
} from "lucide-react";
import { PERSONAS, MODERATOR } from "./data/personas";
import { TOPICS, TOPIC_GROUPS, findTopic, makeCustomTopic } from "./data/topics";
import { loadedVoices, recognitionConstructor, speakText } from "./lib/speech";
import { PressureDial } from "./Stage3Extras";
import type { MicStatus, SessionSettings, Topic, TopicGroup } from "./types";

interface SetupScreenProps {
  settings: SessionSettings;
  setSettings: (next: SessionSettings | ((current: SessionSettings) => SessionSettings)) => void;
  onJoin: (next: SessionSettings) => void;
  micStatus: MicStatus;
  setMicStatus: (status: MicStatus) => void;
}

const groupHint: Record<TopicGroup, string> = {
  Abstract: "Ideas, values, and how we learn",
  Controversial: "Questions with more than one fair answer",
  "Case-based": "A short scenario; make the decision together",
  "Current affairs India": "Public systems and daily life",
  Campus: "The decisions students experience first-hand",
};

function TopicRow({ topic, selected, onSelect }: { topic: Topic; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`topic-row ${selected ? "topic-row-selected" : ""}`} onClick={onSelect} type="button" aria-pressed={selected}>
      <span className="topic-select-dot">{selected && <span />}</span>
      <span className="topic-row-copy">
        <span className="topic-row-title">{topic.title}</span>
        {topic.caseBrief && <span className="topic-case">{topic.caseBrief[0]}</span>}
      </span>
      {selected && <Check size={15} className="topic-check" />}
    </button>
  );
}

export function SetupScreen({ settings, setSettings, onJoin, micStatus, setMicStatus }: SetupScreenProps) {
  const [voiceTotal, setVoiceTotal] = useState(0);
  const [voiceNames, setVoiceNames] = useState<string[]>([]);
  const [testingVoices, setTestingVoices] = useState(false);
  const [openGroup, setOpenGroup] = useState<TopicGroup | null>("Controversial");
  const [notice, setNotice] = useState("");
  const activeTopic = useMemo(() => settings.topicId === "custom" && settings.customTopic.trim()
    ? makeCustomTopic(settings.customTopic)
    : findTopic(settings.topicId), [settings.topicId, settings.customTopic]);

  useEffect(() => {
    const refresh = () => {
      const voices = loadedVoices();
      setVoiceTotal(voices.length);
      setVoiceNames(voices.map((voice) => `${voice.name} (${voice.lang})`));
    };
    refresh();
    if ("speechSynthesis" in window) window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.removeEventListener("voiceschanged", refresh);
    };
  }, []);

  const update = (patch: Partial<SessionSettings>) => setSettings((current) => ({ ...current, ...patch }));

  const checkMic = async () => {
    setMicStatus("checking");
    setNotice("");
    if (!recognitionConstructor()) {
      setMicStatus("unsupported");
      setNotice("Speech recognition isn't supported in this browser. Typed replies work fully in the room.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus("unsupported");
      setNotice("Microphone access is unavailable here. Typed replies are ready to use.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicStatus("ready");
      setNotice("Mic check passed. You can still use typed replies at any time.");
    } catch {
      setMicStatus("denied");
      setNotice("Mic access was blocked. No problem — typed replies work fully in this room.");
    }
  };

  const testVoices = async () => {
    if (testingVoices) return;
    setTestingVoices(true);
    setNotice("");
    const voices = [...PERSONAS, MODERATOR];
    for (const persona of voices) {
      await speakText(`Hi, I'm ${persona.name}.`, persona.id, settings.language);
    }
    setTestingVoices(false);
    setNotice("Voice check complete. Each participant has a different voice setting.");
  };

  const chooseTopic = (id: string) => {
    update({ topicId: id, customTopic: "" });
  };

  const useCustomTopic = () => {
    if (!settings.customTopic.trim()) return;
    update({ topicId: "custom" });
  };

  const start = () => {
    onJoin(settings);
  };

  const micLabel = micStatus === "ready" ? "Mic ready" : micStatus === "checking" ? "Checking mic" : micStatus === "denied" ? "Typed mode ready" : micStatus === "unsupported" ? "Typed mode" : "Mic not checked";

  return (
    <main className="setup-shell">
      <header className="brand-bar">
        <a className="brand-lockup" href="#top" aria-label="GD Arena home">
          <span className="brand-mark"><AudioLines size={20} strokeWidth={2.1} /></span>
          <span className="brand-copy"><strong>GD ARENA</strong><small>PLACEMENT PRACTICE ROOM</small></span>
        </a>
        <div className="top-right-note"><span className="status-dot" /> Local session <span className="top-divider">/</span> no account needed</div>
      </header>

      <div className="ai-disclosure" role="note">
        <ShieldCheck size={16} />
        <span>All other participants and the moderator are AI. Only you are human.</span>
        <span className="disclosure-tag">CLEAR BY DESIGN</span>
      </div>

      <section className="setup-hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-rule" /> YOUR NEXT GD, WITHOUT THE STAKES</div>
          <h1>Find your footing<br /><em>before the room.</em></h1>
          <p>Practise a campus-placement discussion with a room that pushes back, listens, and makes space for your point.</p>
          <div className="hero-meta"><span><Users size={15} /> 3–5 AI participants</span><span><Clock3 size={15} /> 5–10 minutes</span><span><Headphones size={15} /> Voice-first</span></div>
        </div>
        <div className="hero-aside" aria-hidden="true">
          <div className="room-art">
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
            <div className="art-table" />
            <div className="art-seat seat-a"><span>RO</span></div><div className="art-seat seat-b"><span>AN</span></div>
            <div className="art-seat seat-c"><span>ME</span></div><div className="art-seat seat-d"><span>KA</span></div>
            <div className="art-seat seat-e"><span>SA</span></div><div className="art-seat seat-f art-prof"><span>PI</span></div>
            <div className="art-caption"><span className="art-wave"><i /><i /><i /><i /><i /></span> A place to practise, not perform.</div>
          </div>
        </div>
      </section>

      <section className="setup-grid" aria-label="Discussion setup">
        <div className="setup-main-column">
          <div className="section-heading">
            <div><span className="step-kicker">01 <span>—</span> CHOOSE YOUR DISCUSSION</span><h2>Pick a topic</h2></div>
            <span className="topic-count">15 STARTING POINTS</span>
          </div>
          <div className="topic-groups">
            {TOPIC_GROUPS.map((group) => {
              const topics = TOPICS.filter((topic) => topic.group === group);
              const expanded = openGroup === group;
              return (
                <section className={`topic-group ${expanded ? "topic-group-open" : ""}`} key={group}>
                  <button className="topic-group-heading" type="button" aria-expanded={expanded} onClick={() => setOpenGroup(expanded ? null : group)}>
                    <span className="group-index">{String(TOPIC_GROUPS.indexOf(group) + 1).padStart(2, "0")}</span>
                    <span className="group-name">{group}<small>{groupHint[group]}</small></span>
                    <span className="group-count">{topics.length} topics</span><ChevronDown size={16} className={expanded ? "chevron-open" : ""} />
                  </button>
                  {expanded && <div className="topic-list">{topics.map((topic) => <TopicRow key={topic.id} topic={topic} selected={settings.topicId === topic.id} onSelect={() => chooseTopic(topic.id)} />)}</div>}
                </section>
              );
            })}
          </div>
          <div className={`custom-topic-card ${settings.topicId === "custom" ? "custom-active" : ""}`}>
            <div className="custom-topic-title"><span className="custom-topic-icon"><Plus size={16} /></span><div><strong>Bring your own topic</strong><small>Enter a short prompt for the room.</small></div></div>
            <div className="custom-topic-entry">
              <input
                value={settings.customTopic}
                onChange={(event) => update({ customTopic: event.target.value, topicId: "custom" })}
                onFocus={() => setOpenGroup("Campus")}
                placeholder="e.g. Should every student complete an internship?"
                aria-label="Custom topic"
                maxLength={110}
              />
              <button type="button" className="custom-apply" onClick={useCustomTopic} disabled={!settings.customTopic.trim()}>Use topic <ArrowRight size={14} /></button>
            </div>
            <span className="custom-note"><Info size={12} /> Short custom topics are rewritten into a clear debate question while the room prepares.</span>
          </div>
          {activeTopic.caseBrief && settings.topicId === activeTopic.id && (
            <div className="case-preview"><span className="case-label">CASE BRIEF</span><ol>{activeTopic.caseBrief.map((line) => <li key={line}>{line}</li>)}</ol></div>
          )}
        </div>

        <aside className="setup-side-column">
          <div className="section-heading side-heading">
            <div><span className="step-kicker">02 <span>—</span> SHAPE THE ROOM</span><h2>Set the pace</h2></div>
            <SlidersHorizontal size={18} className="side-heading-icon" />
          </div>
          <div className="settings-card">
            <div className="setting-block">
              <div className="setting-label"><span>AI participants</span><span className="setting-hint">+ 1 moderator</span></div>
              <div className="choice-row three-way" role="group" aria-label="AI participant count">
                {([3, 4, 5] as const).map((value) => <button key={value} className={settings.panelSize === value ? "choice-active" : ""} onClick={() => update({ panelSize: value })} type="button"><strong>{value}</strong><small>AI voices</small></button>)}
              </div>
              <div className="persona-preview">
                {PERSONAS.slice(0, settings.panelSize).map((persona) => <span key={persona.id} className="persona-chip"><i style={{ backgroundColor: persona.color }}>{persona.initials.slice(0, 1)}</i>{persona.name}</span>)}
              </div>
            </div>
            <div className="setting-block">
              <div className="setting-label"><span>Discussion format</span></div>
              <div className="format-options">
                <button className={`format-option ${settings.format === "standard" ? "format-active" : ""}`} onClick={() => update({ format: "standard" })} type="button">
                  <span className="format-icon"><AudioLines size={17} /></span><span><strong>Standard</strong><small>Join from the start</small></span>{settings.format === "standard" && <Check size={15} />}
                </button>
                <button className={`format-option ${settings.format === "fishbowl" ? "format-active" : ""}`} onClick={() => update({ format: "fishbowl" })} type="button">
                  <span className="format-icon"><Users size={17} /></span><span><strong>Fishbowl</strong><small>Observe the first 2 minutes</small></span>{settings.format === "fishbowl" && <Check size={15} />}
                </button>
              </div>
            </div>
            <div className="setting-block split-setting">
              <div><div className="setting-label"><span>Language</span></div><div className="choice-row two-way compact"><button className={settings.language === "English" ? "choice-active" : ""} onClick={() => update({ language: "English" })} type="button">English</button><button className={settings.language === "Hinglish" ? "choice-active" : ""} onClick={() => update({ language: "Hinglish" })} type="button">Hinglish</button></div></div>
              <div><div className="setting-label"><span>Duration</span></div><div className="choice-row duration-row">{([5, 8, 10] as const).map((minutes) => <button key={minutes} className={settings.durationMinutes === minutes ? "choice-active" : ""} onClick={() => update({ durationMinutes: minutes })} type="button">{minutes}<small>m</small></button>)}</div></div>
            </div>
            <div className="setting-block patience-block">
              <div className="setting-label"><span>Room patience</span><strong>{settings.patienceSeconds.toFixed(1)}s</strong></div>
              <input className="range-input" type="range" min="0.8" max="3" step="0.1" value={settings.patienceSeconds} onChange={(event) => update({ patienceSeconds: Number(event.target.value) })} aria-label="Room patience" />
              <div className="range-labels"><span>Quick to respond</span><span>Give me a moment</span></div>
            </div>
          </div>
          <div className="pressure-dial-wrap"><PressureDial value={settings.pressure} onChange={(pressure) => update({ pressure })} /></div>

          <div className="audio-card">
            <div className="audio-card-top"><div className="audio-icon"><Volume2 size={17} /></div><div><strong>Voice & microphone</strong><small>Browser audio only</small></div><span className="voice-count">{voiceTotal || "—"} voices</span></div>
            {voiceTotal === 1 && <p className="setup-notice" role="status">Only one browser voice is available: {voiceNames[0] ?? "default"}. Persona pitch and rate will keep voices distinct.</p>}
            <button className="voice-test-button" type="button" onClick={testVoices} disabled={testingVoices}>
              {testingVoices ? <><span className="mini-spinner" /> Testing each voice…</> : <><AudioLines size={15} /> Test voices <span>“Hi, I'm…”</span></>}
            </button>
            <div className="mic-check-row">
              <div className={`mic-state ${micStatus === "ready" ? "mic-ready" : micStatus === "denied" || micStatus === "unsupported" ? "mic-fallback" : ""}`}>
                {micStatus === "denied" || micStatus === "unsupported" ? <MicOff size={14} /> : <Mic size={14} />}{micLabel}
              </div>
              <button type="button" onClick={checkMic} disabled={micStatus === "checking"} className="mic-check-button">{micStatus === "checking" ? "Checking…" : "Check mic"}</button>
            </div>
            {notice && <p className={`setup-notice ${micStatus === "denied" || micStatus === "unsupported" ? "notice-warn" : ""}`} role="status">{notice}</p>}
          </div>

          <button className="join-button" type="button" onClick={start}>
            <span><strong>Join the room</strong><small>Your mic stays off until you hold to talk.</small></span><span className="join-arrow"><ArrowRight size={19} /></span>
          </button>
          <div className="join-footnote"><ShieldCheck size={14} /> Private practice <span>·</span> Transcript stays on this device</div>
          <div className="quiet-note"><span className="quiet-line" /> You can always reply by typing <ArrowDown size={13} /></div>
        </aside>
      </section>
      <footer className="setup-footer"><span>GD ARENA <b>·</b> PRACTICE WITH PURPOSE</span><span>VOICE-FIRST GD PRACTICE <b>·</b> BROWSER-LOCAL</span></footer>
    </main>
  );
}
