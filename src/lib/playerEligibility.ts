import { Player } from "./types";

export function isCompetitionEligible(player: Pick<Player, "competition_eligible"> | null | undefined) {
  // Keep the app usable before the database migration is applied.
  return player?.competition_eligible !== false;
}
