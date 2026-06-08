import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfkit", "docxtemplater", "pizzip"],
};

export default nextConfig;
