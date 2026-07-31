import { describe, expect, it } from "vitest";
import {
  formatLeagueCode,
  leagueCodeIsComplete,
  normalizeLeagueCode
} from "./leagueCodes";

describe("league code formatting", () => {
  it("formats pasted and partially typed values", () => {
    expect(formatLeagueCode("abcd1234")).toBe("TL-ABCD-1234");
    expect(formatLeagueCode("tl-abcd-12")).toBe("TL-ABCD-12");
  });

  it("removes unsupported characters and caps the code length", () => {
    expect(normalizeLeagueCode("tl-a!b@c#d-1234-extra")).toBe("TL-ABCD-1234");
  });

  it("only accepts a complete code", () => {
    expect(leagueCodeIsComplete("tl-abcd-1234")).toBe(true);
    expect(leagueCodeIsComplete("TL-ABCD-123")).toBe(false);
  });
});
