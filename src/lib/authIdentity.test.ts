import { describe, expect, it } from "vitest";
import {
  authEmailRedirect,
  internalEmailForUsername,
  isInternalAuthEmail,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
  parseAuthPlatform
} from "./authIdentity";

describe("auth identity helpers", () => {
  it("normalizes and validates usernames without silently changing invalid input", () => {
    expect(normalizeUsername("  Player_10 ")).toBe("player_10");
    expect(isValidUsername("Player_10")).toBe(true);
    expect(isValidUsername("player-name")).toBe(false);
    expect(isValidUsername("x")).toBe(false);
  });

  it("normalizes and validates recovery email addresses", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user@example")).toBe(false);
    expect(isValidEmail("user @example.com")).toBe(false);
  });

  it("distinguishes internal login aliases from verified recovery addresses", () => {
    const url = "https://project.supabase.co";
    expect(internalEmailForUsername(" Player_10 ", url)).toBe("player_10@project.supabase.co");
    expect(isInternalAuthEmail("player_10@project.supabase.co", url)).toBe(true);
    expect(isInternalAuthEmail("player@example.com", url)).toBe(false);
  });

  it("uses only allow-listed web and native confirmation destinations", () => {
    expect(parseAuthPlatform("anything")).toBe("web");
    expect(authEmailRedirect({
      platform: "web",
      flow: "verify-email",
      appUrl: "https://thursday-league.vercel.app"
    })).toBe("https://thursday-league.vercel.app/auth/confirm?flow=verify-email");
    expect(authEmailRedirect({
      platform: "mobile",
      flow: "recover-password"
    })).toBe("thursdayleague://auth/confirm?flow=recover-password");
  });
});
