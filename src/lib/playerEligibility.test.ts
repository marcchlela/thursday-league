import { describe, expect, it } from "vitest";
import {
  isFantasyEligible,
  isGuestPlayer,
  isIndividualBettingEligible,
  isModelEligible
} from "./playerEligibility";
import { Player } from "./types";

const regularPlayer: Player = {
  id: "player-1",
  name: "Regular Player",
  default_position: "outfield",
  active: true,
  player_type: "regular",
  fantasy_eligible: true,
  individual_betting_eligible: true
};

describe("player eligibility", () => {
  it("keeps player type separate from feature eligibility", () => {
    const guestWhoCanPlayFantasy = {
      ...regularPlayer,
      player_type: "guest" as const,
      fantasy_eligible: true,
      individual_betting_eligible: false
    };

    expect(isGuestPlayer(guestWhoCanPlayFantasy)).toBe(true);
    expect(isModelEligible(guestWhoCanPlayFantasy)).toBe(false);
    expect(isFantasyEligible(guestWhoCanPlayFantasy)).toBe(true);
    expect(isIndividualBettingEligible(guestWhoCanPlayFantasy)).toBe(false);
  });

  it("supports separate Fantasy and individual-betting controls", () => {
    const player = {
      ...regularPlayer,
      fantasy_eligible: false,
      individual_betting_eligible: true
    };

    expect(isFantasyEligible(player)).toBe(false);
    expect(isIndividualBettingEligible(player)).toBe(true);
    expect(isModelEligible(player)).toBe(true);
  });

  it("keeps older deployed records compatible during rollout", () => {
    const legacyGuest = { ...regularPlayer, player_type: undefined, fantasy_eligible: undefined, individual_betting_eligible: undefined, competition_eligible: false };
    expect(isGuestPlayer(legacyGuest)).toBe(true);
    expect(isFantasyEligible(legacyGuest)).toBe(false);
    expect(isIndividualBettingEligible(legacyGuest)).toBe(false);
  });
});
