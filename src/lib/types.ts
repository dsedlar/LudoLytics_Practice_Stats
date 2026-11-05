// Shared domain types used across screens.

export interface DraftPlayer {
  id?: string; // existing player id, once matched/created in DB
  jersey: string;
  name: string;
  squad: 0 | 1 | -1; // 0 = squad A, 1 = squad B, -1 = not practicing
  present: boolean;
  absenceReason?: string;
}

export interface SquadMeta {
  name: string;
  color: string;
}

export interface PracticeDraft {
  dateISO: string; // yyyy-mm-dd
  startTime?: string;
  finishTime?: string;
  squads: [SquadMeta, SquadMeta];
  players: DraftPlayer[];
}
