/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  serverExternalPackages: ["pdf-lib", "sharp"],
  outputFileTracingIncludes: {
    "/api/admin/products/*/uploads/*": ["./lib/pdf-validation-worker.cjs", "./node_modules/pdf-lib/**/*", "./node_modules/@pdf-lib/**/*", "./node_modules/pako/**/*", "./node_modules/tslib/**/*"],
  },
};
export default nextConfig;
