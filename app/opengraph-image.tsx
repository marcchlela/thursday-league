import { ImageResponse } from "next/og";

export const alt = "Thursday League — your matchweek in one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #11110f 0%, #123b24 100%)",
          color: "#f6f2e8",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          width: "100%"
        }}
      >
        <div style={{ border: "2px solid rgba(214,172,70,.28)", borderRadius: 999, height: 520, position: "absolute", right: -180, top: -170, width: 520 }} />
        <div style={{ border: "2px solid rgba(214,172,70,.15)", borderRadius: 999, bottom: -260, height: 620, left: -220, position: "absolute", width: 620 }} />
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 950, padding: "72px", width: "100%" }}>
          <div style={{ color: "#d6ac46", fontSize: 24, fontWeight: 800, letterSpacing: 8, textTransform: "uppercase" }}>Weekly five-a-side</div>
          <div style={{ fontSize: 94, fontWeight: 900, letterSpacing: -4, lineHeight: 1, marginTop: 26, textTransform: "uppercase" }}>Thursday League</div>
          <div style={{ color: "rgba(246,242,232,.72)", fontSize: 34, lineHeight: 1.35, marginTop: 30 }}>Your matchweek. One place.</div>
          <div style={{ display: "flex", gap: 18, marginTop: 52 }}>
            {["Lineups", "Fantasy", "Virtual bets", "Results"].map(label => (
              <div key={label} style={{ background: "rgba(214,172,70,.08)", border: "1px solid rgba(214,172,70,.25)", borderRadius: 18, color: "#d6ac46", display: "flex", fontSize: 21, fontWeight: 700, padding: "14px 20px" }}>{label}</div>
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
