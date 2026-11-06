import type { MetadataRoute } from "next";

/** Web manifest (step 16, logo « Point »): name, colours, icons 192 and 512. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Binivol",
    short_name: "Binivol",
    description: "Gestion des bénévoles de l'unité locale.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f2",
    theme_color: "#0f0f0f",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
