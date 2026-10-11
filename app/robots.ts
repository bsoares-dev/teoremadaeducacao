import type { MetadataRoute } from "next";
import { searchRobots } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return searchRobots();
}
