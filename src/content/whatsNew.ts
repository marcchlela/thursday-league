export type ReleaseLevel = "major" | "minor" | "patch";

export type ReleaseNoteSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export type ReleaseNote = {
  version: string;
  level: ReleaseLevel;
  releasedAt: string;
  title: string;
  summary: string;
  sections: ReleaseNoteSection[];
};

// Add every user-facing release here. The first item is treated as the latest
// update and powers the unread badge in Settings.
export const releaseNotes: ReleaseNote[] = [
  {
    version: "0.4.0",
    level: "minor",
    releasedAt: "2026-07-26",
    title: "A league for every screen",
    summary: "A brighter theme, a more polished opening, and a permanent home for every Thursday League update.",
    sections: [
      {
        title: "Choose your matchday",
        items: [
          "Use System, Light, or Dark appearance from Settings.",
          "Light mode introduces warm ivory surfaces, darker gold accents, and carefully adjusted status colors across the full app.",
          "Your choice is remembered on this device and applied before the app appears."
        ]
      },
      {
        title: "A better opening",
        items: [
          "Thursday League now opens with its logo, name, and a short matchday animation.",
          "The animation respects reduced-motion preferences and gives way as soon as the app is ready."
        ]
      },
      {
        title: "What’s New",
        items: [
          "Release notes now live in Settings, sorted from newest to oldest.",
          "A single New update badge appears when there is a release you have not read.",
          "Releases are labelled Major, Minor, or Patch to make the size of each update clear."
        ]
      }
    ]
  },
  {
    version: "0.3.1",
    level: "minor",
    releasedAt: "2026-07-26",
    title: "More flexible matchdays",
    summary: "Rotating goalkeepers, clearer player eligibility, safer admin corrections, and stronger local testing.",
    sections: [
      {
        title: "Flexible goalkeepers",
        items: [
          "Lineups can now use either a fixed goalkeeper or five rotating outfield players.",
          "Fantasy selection adapts to the goalkeeper mode chosen for the match.",
          "Team save markets remain available when the goalkeeper role rotates."
        ]
      },
      {
        title: "Admin control",
        items: [
          "Match statistics are entered in a faster two-team grid.",
          "Wallet balances can be corrected with a mandatory reason and permanent audit history.",
          "Unsaved match statistics are protected when leaving the admin screen."
        ]
      },
      {
        title: "Reliability",
        items: [
          "Player eligibility is enforced by the database.",
          "Desktop and mobile end-to-end tests now cover the league’s most important journeys."
        ]
      }
    ]
  },
  {
    version: "0.3.0",
    level: "major",
    releasedAt: "2026-07-24",
    title: "The new Thursday League",
    summary: "A complete mobile-first redesign with a simpler matchday experience across Home, Games, Play, Players, Profile, and Admin.",
    sections: [
      {
        title: "A new matchday design",
        items: [
          "A cleaner Bauhaus-inspired visual system built around the Thursday League identity.",
          "Faster access to fixtures, lineups, Fantasy, bets, players, and league leaders.",
          "Consistent mobile, tablet, desktop, loading, empty, and error states."
        ]
      },
      {
        title: "Profiles and settings",
        items: [
          "Profile photos, player pages, notification preferences, wallet history, and account controls now live in dedicated screens.",
          "The Thursday League logo now represents the installed app and notifications."
        ]
      }
    ]
  },
  {
    version: "0.2.0",
    level: "major",
    releasedAt: "2026-07-22",
    title: "Fantasy, predictions, and notifications",
    summary: "The league expanded beyond results with weekly Fantasy teams, virtual-coin predictions, seasons, and push notifications.",
    sections: [
      {
        title: "Play together",
        items: [
          "Build a five-player Fantasy team, select a captain, and compare weekly and seasonal standings.",
          "Use virtual coins on pre-match prediction markets with automatic result settlement.",
          "Review historical Fantasy teams and league picks after results are final."
        ]
      },
      {
        title: "Stay updated",
        items: [
          "Push notifications announce scheduled games, confirmed lineups, deadlines, and final results.",
          "Notification preferences and the onboarding guide give every user control over what they receive."
        ]
      }
    ]
  }
];

export const latestRelease = releaseNotes[0];

export function releaseByVersion(version: string) {
  return releaseNotes.find(release => release.version === version);
}
