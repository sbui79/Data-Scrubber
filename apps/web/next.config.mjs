import path from "node:path";
import nextEnv from "@next/env";

// Single .env at the repo root
nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, "../.."));

const csp = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  output: "standalone", // small self-contained server for Docker
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  transpilePackages: ["@privatepath/config", "@privatepath/core", "@privatepath/crypto", "@privatepath/audit", "@privatepath/db", "@privatepath/adapters"],
  serverExternalPackages: ["@prisma/client"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }, {
      // API responses are data or downloads, never pages: lock them down completely (later entries win).
      source: "/api/:path*",
      headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; sandbox" }],
    }];
  },
};
