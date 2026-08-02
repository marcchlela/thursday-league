import { chromium } from "@playwright/test";
import { mkdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designRoot = path.join(root, "design", "store-listing");
const capturesRoot = path.join(designRoot, "captures");
const outputRoot = path.join(designRoot, "output");

const screenshots = [
  { file: "01-home", capture: "01-home.png", kicker: "MATCHWEEK", lines: ["YOUR MATCHWEEK.", "TOGETHER."] },
  { file: "02-match", capture: "02-match.png", kicker: "MATCHES", lines: ["EVERY MATCH.", "ONE PLACE."] },
  { file: "03-stats", capture: "03-stats.png", kicker: "PLAYER STATS", lines: ["EVERY CONTRIBUTION", "COUNTS."] },
  { file: "04-fantasy", capture: "04-fantasy.png", kicker: "FANTASY", lines: ["PICK YOUR", "MATCHDAY FIVE."] },
  { file: "05-predictions", capture: "05-predictions.png", kicker: "PREDICTIONS", lines: ["FRIENDLY PICKS.", "VIRTUAL COINS."] },
  { file: "06-leagues", capture: "06-leagues.png", kicker: "PRIVATE LEAGUES", lines: ["ONE APP.", "EVERY LEAGUE."] },
  { file: "07-admin", capture: "07-admin.png", kicker: "LEAGUE CONTROL", lines: ["RUN YOUR LEAGUE.", "KEEP IT SIMPLE."] }
];

async function dataUrl(file, type = "image/png") {
  const value = await readFile(file);
  return `data:${type};base64,${value.toString("base64")}`;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const baseStyles = `
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #0a0b09; }
  body { font-family: Inter, Arial, sans-serif; color: #F5F2E8; }
  .display { font-family: Oswald, Impact, "Arial Narrow", sans-serif; font-weight: 900; letter-spacing: -.025em; }
`;

function pitchBackground() {
  return `
    background:
      radial-gradient(circle at 72% 16%, rgba(218,165,32,.18), transparent 28%),
      radial-gradient(circle at 15% 88%, rgba(49,185,78,.14), transparent 30%),
      linear-gradient(145deg, #171714 0%, #10120f 54%, #082312 100%);
  `;
}

async function renderFeatureGraphic(page, tilo) {
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseStyles}
    .feature { position: relative; width: 1024px; height: 500px; overflow: hidden; ${pitchBackground()} }
    .feature::before { content: ""; position: absolute; inset: 24px; border: 1px solid rgba(245,242,232,.085); border-radius: 24px; }
    .feature::after { content: ""; position: absolute; width: 390px; height: 390px; right: -118px; top: 55px; border: 70px solid rgba(218,165,32,.055); border-radius: 50%; }
    .halfway { position: absolute; left: 0; right: 0; top: 250px; border-top: 1px solid rgba(245,242,232,.045); }
    .circle { position: absolute; left: 642px; top: 144px; width: 212px; height: 212px; border: 1px solid rgba(245,242,232,.055); border-radius: 50%; }
    .copy { position: absolute; z-index: 2; left: 68px; top: 67px; width: 620px; }
    .brand { display: flex; align-items: center; gap: 12px; color: #DAA520; font-size: 14px; font-weight: 900; letter-spacing: .19em; }
    .brand::before { content: ""; width: 36px; height: 3px; border-radius: 4px; background: #DAA520; }
    h1 { margin: 31px 0 18px; font-size: 66px; line-height: .98; }
    h1 span { color: #DAA520; }
    .detail { color: rgba(245,242,232,.68); font-size: 15px; font-weight: 800; letter-spacing: .13em; }
    .tilo { position: absolute; z-index: 3; right: 46px; bottom: -115px; width: 310px; height: auto; filter: drop-shadow(0 22px 32px rgba(0,0,0,.42)); }
    .gold-line { position: absolute; left: 68px; bottom: 58px; width: 480px; height: 1px; background: linear-gradient(90deg, rgba(218,165,32,.75), transparent); }
  </style></head><body><main class="feature">
    <div class="halfway"></div><div class="circle"></div>
    <section class="copy"><div class="brand">THURSDAY LEAGUE</div><h1 class="display">YOUR MATCHWEEK.<br><span>TOGETHER.</span></h1><div class="detail">MATCHES &nbsp;•&nbsp; STATS &nbsp;•&nbsp; FANTASY &nbsp;•&nbsp; FRIENDLY PICKS</div></section>
    <div class="gold-line"></div><img class="tilo" src="${tilo}" alt="">
  </main></body></html>`);
  await page.screenshot({ path: path.join(outputRoot, "play-feature-graphic.jpg"), type: "jpeg", quality: 96, clip: { x: 0, y: 0, width: 1024, height: 500 } });
}

function screenshotHtml(item, captureUrl, preview = false) {
  const headline = item.lines.map((line, index) => `<span class="${index === item.lines.length - 1 ? "accent" : ""}">${escapeHtml(line)}</span>`).join("<br>");
  const screen = captureUrl
    ? `<img class="capture" src="${captureUrl}" alt="">`
    : `<div class="capture placeholder"><div class="placeholder-mark">TL</div><strong>FINAL SIGNED APP CAPTURE</strong><span>${escapeHtml(item.capture)}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseStyles}
    .asset { position: relative; width: 1080px; height: 1920px; overflow: hidden; ${pitchBackground()} }
    .asset::before { content: ""; position: absolute; width: 900px; height: 900px; border: 130px solid rgba(218,165,32,.035); border-radius: 50%; right: -520px; top: -230px; }
    .asset::after { content: ""; position: absolute; inset: 34px; border: 1px solid rgba(218,165,32,.12); border-radius: 36px; pointer-events: none; }
    .top { position: absolute; z-index: 2; left: 92px; right: 92px; top: 82px; }
    .brand { color: rgba(218,165,32,.85); font-size: 21px; font-weight: 900; letter-spacing: .22em; }
    .kicker { margin-top: 50px; color: rgba(245,242,232,.48); font-size: 22px; font-weight: 900; letter-spacing: .2em; }
    h1 { margin: 12px 0 0; font-size: 76px; line-height: 1.02; }
    h1 .accent { color: #DAA520; }
    .screen-wrap { position: absolute; z-index: 2; left: 120px; top: 398px; width: 840px; height: 1494px; padding: 3px; overflow: hidden; border-radius: 49px; background: linear-gradient(150deg, rgba(218,165,32,.8), rgba(218,165,32,.14) 42%, rgba(49,185,78,.32)); box-shadow: 0 36px 95px rgba(0,0,0,.46); }
    .capture { display: block; width: 100%; height: 100%; border-radius: 46px; object-fit: cover; object-position: top; background: #11110F; }
    .placeholder { display: grid; place-content: center; gap: 22px; color: rgba(245,242,232,.52); text-align: center; }
    .placeholder-mark { margin: 0 auto; display: grid; place-items: center; width: 150px; height: 150px; border: 4px solid #DAA520; border-radius: 38px; color: #DAA520; font-family: Impact, sans-serif; font-size: 62px; }
    .placeholder strong { color: #F5F2E8; font-size: 25px; letter-spacing: .08em; }
    .placeholder span { font-family: monospace; font-size: 19px; }
    ${preview ? ".asset::after { border-color: rgba(240,138,138,.28); }" : ""}
  </style></head><body><main class="asset"><section class="top"><div class="brand">THURSDAY LEAGUE</div><div class="kicker">${escapeHtml(item.kicker)}</div><h1 class="display">${headline}</h1></section><div class="screen-wrap">${screen}</div></main></body></html>`;
}

async function renderScreenshots(page) {
  await page.setViewportSize({ width: 1080, height: 1920 });
  let rendered = 0;
  for (const item of screenshots) {
    const capturePath = path.join(capturesRoot, item.capture);
    if (!(await exists(capturePath))) continue;
    await page.setContent(screenshotHtml(item, await dataUrl(capturePath)));
    await page.screenshot({ path: path.join(outputRoot, `${item.file}.jpg`), type: "jpeg", quality: 96, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    rendered += 1;
  }
  return rendered;
}

async function renderStoryboard(page) {
  const scale = .25;
  const cardWidth = 1080 * scale;
  const cardHeight = 1920 * scale;
  const gap = 18;
  const padding = 42;
  const columns = 4;
  const rows = Math.ceil(screenshots.length / columns);
  const width = Math.round(padding * 2 + columns * cardWidth + (columns - 1) * gap);
  const height = Math.round(110 + padding + rows * cardHeight + (rows - 1) * gap + padding);
  const cards = screenshots.map(item => `<div class="card"><iframe title="${escapeHtml(item.file)}" srcdoc="${escapeHtml(screenshotHtml(item, null, true))}"></iframe></div>`).join("");
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseStyles}
    body { width: ${width}px; min-height: ${height}px; padding: ${padding}px; background: #090a08; }
    header { height: 110px; color: #F08A8A; font-size: 22px; font-weight: 900; letter-spacing: .14em; }
    header span { display: block; margin-top: 9px; color: rgba(245,242,232,.5); font-size: 14px; letter-spacing: .08em; }
    main { display: grid; grid-template-columns: repeat(${columns}, ${cardWidth}px); gap: ${gap}px; }
    .card { width: ${cardWidth}px; height: ${cardHeight}px; overflow: hidden; border-radius: 12px; background: #11110F; }
    iframe { width: 1080px; height: 1920px; border: 0; transform: scale(${scale}); transform-origin: left top; background: #11110F; }
  </style></head><body><header>DESIGN PREVIEW — NOT FOR PLAY CONSOLE<span>Replace every placeholder with a final signed-build capture.</span></header><main>${cards}</main></body></html>`);
  await page.screenshot({ path: path.join(outputRoot, "storyboard-preview.jpg"), type: "jpeg", quality: 94, fullPage: true });
}

await mkdir(capturesRoot, { recursive: true });
await mkdir(outputRoot, { recursive: true });

const tilo = await dataUrl(path.join(root, "design", "mascot", "poses", "matchday-ready", "tilo-matchday-ready.png"));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await renderFeatureGraphic(page, tilo);
  await renderStoryboard(page);
  const screenshotCount = await renderScreenshots(page);
  console.log(`Rendered feature graphic, storyboard preview, and ${screenshotCount} final screenshot(s).`);
  if (screenshotCount < screenshots.length) {
    console.log(`Add the ${screenshots.length - screenshotCount} missing signed-build capture(s) under design/store-listing/captures, then run this command again.`);
  }
} finally {
  await browser.close();
}
