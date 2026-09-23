import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Migrations precisam ir junto no build standalone (Docker).
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "postgres", "unpdf", "mammoth"],
};

export default nextConfig;
