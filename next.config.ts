import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statischer Export für GitHub Pages — die App hat kein Backend.
  output: "export",
  // GitHub Pages hat kein URL-Rewriting; trailingSlash erzeugt
  // foo/index.html, sodass /foo/ ohne 404 ausgeliefert wird.
  trailingSlash: true,
};

export default nextConfig;
