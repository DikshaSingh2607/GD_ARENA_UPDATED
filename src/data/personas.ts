import type { Persona, PersonaId } from "../types";

export const PERSONAS: Persona[] = [
  { id: "rohan", name: "Rohan", role: "Dominator", initials: "RO", color: "#cf8b59", pitch: 0.92, rate: 1.0, talkativeness: 1.65 },
  { id: "ananya", name: "Ananya", role: "Data Guru", initials: "AN", color: "#6fb1a2", pitch: 1.12, rate: 0.97, talkativeness: 1.12 },
  { id: "meera", name: "Meera", role: "Quiet One", initials: "ME", color: "#aa94d0", pitch: 1.22, rate: 0.92, talkativeness: 0.48 },
  { id: "karan", name: "Karan", role: "Drifter", initials: "KA", color: "#d5b75f", pitch: 0.98, rate: 1.0, talkativeness: 1.05 },
  { id: "sana", name: "Sana", role: "Diplomat", initials: "SA", color: "#79a4cf", pitch: 1.04, rate: 0.95, talkativeness: 1.1 },
];

export const MODERATOR: Persona = {
  id: "moderator",
  name: "Prof. Iyer",
  role: "Moderator",
  initials: "PI",
  color: "#88a883",
  pitch: 0.86,
  rate: 0.92,
  talkativeness: 0.75,
};

export const PERSONA_BY_ID = new Map<PersonaId, Persona>([
  ...PERSONAS.map((persona) => [persona.id, persona] as const),
  [MODERATOR.id, MODERATOR],
]);
