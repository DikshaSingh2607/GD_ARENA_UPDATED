import { useEffect, useMemo, useState } from "react";
import { SetupScreen } from "./SetupScreen";
import { RoomScreen } from "./RoomScreen";
import { findTopic, makeCustomTopic } from "./data/topics";
import { loadSettings, saveSettings } from "./lib/storage";
import type { MicStatus, SessionSettings, Topic } from "./types";

export default function App() {
  const [settings, setSettings] = useState<SessionSettings>(() => loadSettings());
  const [micStatus, setMicStatus] = useState<MicStatus>("unknown");
  const [screen, setScreen] = useState<"setup" | "room">("setup");
  const [sessionKey, setSessionKey] = useState(0);
  const topic: Topic = useMemo(
    () => settings.topicId === "custom" && settings.customTopic.trim()
      ? makeCustomTopic(settings.customTopic)
      : findTopic(settings.topicId),
    [settings.topicId, settings.customTopic],
  );

  useEffect(() => saveSettings(settings), [settings]);

  const joinRoom = (next: SessionSettings) => {
    setSettings(next);
    if ("speechSynthesis" in window) {
      // A muted utterance, initiated by the Join click, primes Chrome audio for the room.
      const unlock = new SpeechSynthesisUtterance(" ");
      unlock.volume = 0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(unlock);
    }
    setSessionKey((value) => value + 1);
    setScreen("room");
  };

  if (screen === "room") {
    return (
      <RoomScreen
        key={sessionKey}
        settings={settings}
        topic={topic}
        initialMicStatus={micStatus}
        onSettingsPatch={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        onBack={() => {
          window.speechSynthesis?.cancel();
          setScreen("setup");
        }}
      />
    );
  }

  return <SetupScreen settings={settings} setSettings={setSettings} onJoin={joinRoom} micStatus={micStatus} setMicStatus={setMicStatus} />;
}
