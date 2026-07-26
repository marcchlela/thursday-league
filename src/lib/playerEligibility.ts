import { Player } from "./types";

type EligibilityPlayer = Pick<Player, "player_type" | "fantasy_eligible" | "individual_betting_eligible" | "competition_eligible">;

function legacyEligibility(player: EligibilityPlayer | null | undefined) {
  return player?.competition_eligible !== false;
}

export function isGuestPlayer(player: EligibilityPlayer | null | undefined) {
  return player?.player_type ? player.player_type === "guest" : !legacyEligibility(player);
}

export function isFantasyEligible(player: EligibilityPlayer | null | undefined) {
  return player?.fantasy_eligible ?? legacyEligibility(player);
}

export function isIndividualBettingEligible(player: EligibilityPlayer | null | undefined) {
  return player?.individual_betting_eligible ?? legacyEligibility(player);
}

export function isModelEligible(player: EligibilityPlayer | null | undefined) {
  return !isGuestPlayer(player);
}
