# Thursday League mascot

Status: **Confirmed v1 base design**

The visual source of truth is
`thursday-league-mascot-v1-reference.png`. Future poses and expressions
should use that turnaround sheet together with the official
`Thursday League logo (no bg).png`.

## Character identity

- **Name:** Tilo
- **Pronunciation:** TEE-loh
- **Role:** the user's competitive matchday teammate
- **Personality balance:** 60% friendly and motivating, 25% competitive,
  15% playful or cheeky

Tilo represents the whole league rather than Team A or Team B. He welcomes new
users, gets excited about matchday, encourages users after mistakes or losses,
and celebrates wins without mocking anyone. His competitive side should feel
like a friendly challenge, not pressure or aggression.

### Voice

Tilo speaks in short, natural sentences. Examples:

- **Success:** "Locked in. Nice picks."
- **Motivation:** "You're one good week away from climbing the table."
- **Competitive:** "Top spot is still up for grabs."
- **Deadline:** "Matchday is close. Time to make your move."
- **Error:** "That didn't go through. Let's try again."
- **Playful:** "No pressure... okay, maybe a little."
- **Empty state:** "Nothing here yet. Matchday will change that."

Avoid baby talk, aggressive trash-talking, mocking poor performances, long
speeches, constant exclamation marks, real-money gambling language, or
encouraging users to chase losses. Tilo should not trivialize destructive
account actions, security warnings, or serious administrative errors.

## Locked identity

- The mascot is an anthropomorphic Thursday League shield.
- Preserve the official shield silhouette, exact white `TL`, floating gold
  star, and black/gold/white palette.
- The shield is moderately thick with softly rounded corners.
- Gold is limited to the front rim. The shield sidewall and rear shell remain
  black/charcoal.
- The eyes sit inside a shallow recessed charcoal-black panel with a subtle
  black lip.
- Default expression is attentive, friendly, and confident—not angry or
  childlike.
- Arms and legs are athletic, clean, black, and medium length.
- Hands are compact white gloves with narrow gold cuffs.
- Footwear is real low-cut black football boots: laces, shaped toe and heel,
  restrained white/gold side details, and visible studs.
- Avoid block shoes, sneakers, generic boots, armor, superhero styling,
  animals, realistic humans, capes, and excessive glow.

## Color anchors

| Role | Color |
| --- | --- |
| Near black | `#080B0D` |
| Charcoal | `#11161A` |
| League gold | `#F6C515` |
| Dark gold | `#B8860B` |
| Warm white | `#F5F2E8` |

Materials should remain satin or matte. Gold may use a restrained brushed
finish, but should not become glossy yellow plastic.

## Responsive use

- **Hero illustrations (384–768 px):** full detail and expressive pose.
- **Content illustrations (160–320 px):** simplify glove seams, boot stitching,
  and eye highlights.
- **Small states (72–128 px):** prioritize star, shield, eyes, `TL`, and boot
  silhouette; remove nonessential surface detail.
- **Below 72 px:** use the official shield logo instead of shrinking the full
  mascot.

Always verify new assets against both dark and light app themes at their real
rendered size.

## Production workflow

1. Generate a neutral standing master from the confirmed turnaround.
2. Produce a transparent-background version and validate its edges.
3. Create poses one at a time while preserving the locked identity.
4. Export responsive PNG/WebP variants rather than shipping this large
   reference sheet to users.
5. Keep the turnaround outside `public/`; it is a design reference, not a
   runtime asset.

## Approved neutral master

`production/mascot-neutral-master.png` is the transparent neutral-standing
master. The generated responsive validation assets are:

- `production/responsive/mascot-neutral-512.png`
- `production/responsive/mascot-neutral-256.png`
- `production/responsive/mascot-neutral-128.png`

The light- and dark-theme comparison sheets live under `previews/`. The
character remains recognizable at 128 px. When used over the app's darkest
surface, apply a very subtle neutral drop shadow or edge separation in CSS;
do not bake a glow or background into the image.

## Production poses

### Welcome wave

Status: **Approved**

The first onboarding pose is stored at
`poses/welcome-wave/tilo-welcome-wave.png`. Responsive exports are available
at 512, 256, and 128 px under `poses/welcome-wave/responsive/`.

Use this pose when Tilo welcomes a user, introduces onboarding, or announces a
friendly new feature. It should not be reused for warnings, errors, or
competitive results.

### Matchday ready

Status: **Approved**

The approved pre-match pose is stored at
`poses/matchday-ready/tilo-matchday-ready.png`. It uses a slightly lowered
athletic stance with one boot resting on the football. Responsive exports are
available at 512, 256, and 128 px under
`poses/matchday-ready/responsive/`.

Reserve this pose for moments when a useful pre-match action is available,
such as completing fantasy picks, reviewing confirmed lineups, or entering
open betting markets. Do not place it beside every upcoming-game card or use
it as permanent decoration.

### Celebration

Status: **Approved**

The achievement pose is stored at
`poses/celebration/tilo-celebration.png`. Responsive exports are available at
512, 256, and 128 px under `poses/celebration/responsive/`.

Reserve this pose for meaningful achievements such as winning a weekly
leaderboard, reaching a new personal rank, or completing onboarding for the
first time. Routine saves and ordinary success messages should continue to use
the app's normal toast feedback rather than the mascot.
