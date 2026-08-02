# Google Play store artwork

This folder is the production source for the Thursday League Google Play listing artwork.

## Final deliverables

- `output/play-feature-graphic.jpg`: 1024 x 500 feature graphic.
- `output/01-home.jpg` through `output/07-admin.jpg`: 1080 x 1920 phone screenshots.
- `output/storyboard-preview.jpg`: design-only contact sheet. Do not upload this file.

The renderer uses JPEG so every upload is opaque and meets Google Play's no-alpha requirement.

## Screenshot sequence

| File | Capture | Store headline |
| --- | --- | --- |
| `01-home.jpg` | Home with the next match and readiness | Your matchweek. Together. |
| `02-match.jpg` | Match lineups, score, and timeline | Every match. One place. |
| `03-stats.jpg` | Player profile or player leaders | Every contribution counts. |
| `04-fantasy.jpg` | Fantasy player selection | Pick your matchday five. |
| `05-predictions.jpg` | Friendly prediction markets | Friendly picks. Virtual coins. |
| `06-leagues.jpg` | League switcher and invite flow | One app. Every league. |
| `07-admin.jpg` | Owner match or roster controls | Run your league. Keep it simple. |

## Capture rules

1. Use the final signed Android build and the dedicated `Thursday League Review` league.
2. Capture portrait screenshots at 1080 x 1920 or another 9:16 resolution of at least that size.
3. Hide Android navigation controls if the device supports it, but keep the app's own interface intact.
4. Do not include personal email addresses, real notifications, development labels, placeholder content, or real people's private data.
5. Keep the same reviewer-league data across the full sequence.
6. Put the raw captures in `captures/` using the exact filenames below.

```text
captures/01-home.png
captures/02-match.png
captures/03-stats.png
captures/04-fantasy.png
captures/05-predictions.png
captures/06-leagues.png
captures/07-admin.png
```

Run the renderer from the repository root:

```powershell
node scripts/render-play-store-assets.mjs
```

The feature graphic and storyboard preview can be generated before captures exist. Final screenshot exports are created only for capture files that are present.

## Play Console alt text

1. `Thursday League home showing the next match and matchweek readiness.`
2. `Match page showing team lineups, score, and the match event timeline.`
3. `Player statistics page showing goals, assists, appearances, and recent form.`
4. `Fantasy selection page for choosing five players and a captain.`
5. `Friendly prediction markets using virtual league coins with no cash value.`
6. `League switcher showing multiple private leagues and an add-league option.`
7. `League owner controls for fixtures, lineups, results, and roster management.`

## Visual direction

- Palette: ink `#11110F`, chalk `#F5F2E8`, gold `#DAA520`, turf `#31B94E`.
- Screenshots stay large, straight, and readable; there are no decorative phone frames.
- Tilo appears on the feature graphic only so the mascot remains a meaningful moment.
- The first three assets prioritize real product UI, following Google Play discovery guidance.

