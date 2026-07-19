import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thursday League",
    short_name: "Thursday",
    description: "Weekly 5-a-side match tracker and fantasy league",
    start_url: "/",
    display: "standalone",
    background_color: "#11110f",
    theme_color: "#0b5a23",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}