import { headerRules } from "./config/security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  headers: () => headerRules(),
  images: {
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL ? [{
      protocol: "https",
      hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
      pathname: "/storage/v1/object/public/teorema-covers/products/**",
      search: "",
    }] : [],
  },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit", "sharp"],
  outputFileTracingIncludes: {
    "/api/admin/products/*/uploads/*": ["./lib/pdf-validation-worker.cjs", "./node_modules/pdf-lib/**/*", "./node_modules/@pdf-lib/**/*", "./node_modules/pako/**/*", "./node_modules/tslib/**/*"],
    "/api/library/download": ["./assets/pdf/NotoSans-Regular.ttf", "./lib/pdf-validation-worker.cjs", "./node_modules/pdf-lib/**/*", "./node_modules/@pdf-lib/**/*", "./node_modules/pako/**/*", "./node_modules/tslib/**/*"],
  },
};
export default nextConfig;
