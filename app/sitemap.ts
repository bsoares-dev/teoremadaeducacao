import type { MetadataRoute } from "next";
import { publicSitemap } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemap();
}
