import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs is a large CJS lib used only server-side (xlsx import parsing); keep it external
  // so Next doesn't try to bundle it into the server action.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
