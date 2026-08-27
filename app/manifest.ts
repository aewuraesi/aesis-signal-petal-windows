import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aesi's Signal Petal",
    short_name: "Signal Petal",
    description: "A private operational command center for work, follow-ups, reflection, and delivery signals.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffafd",
    theme_color: "#d95191",
    orientation: "any",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
