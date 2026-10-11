import type { Metadata, MetadataRoute } from "next";

// The domain was purchased by the project owner; DNS stays with HostGator.
export const SITE_URL = "https://www.teoremadaeducacao.com.br";
export const SITE_NAME = "Teorema da Educação";
export const PUBLIC_PATHS = ["/", "/materiais"] as const;

type IndexingEnvironment = Readonly<{ NODE_ENV?: string; VERCEL_ENV?: string }>;
type PublicPagePath = typeof PUBLIC_PATHS[number] | `/materiais?page=${number}`;

export function searchIndexingEnabled(env: IndexingEnvironment = process.env): boolean {
  return env.NODE_ENV === "production" &&
    (env.VERCEL_ENV === undefined || env.VERCEL_ENV === "production");
}

export function publicPageMetadata(
  path: PublicPagePath,
  title: string,
  description: string,
  env: IndexingEnvironment = process.env,
): Metadata {
  const url = new URL(path, SITE_URL).href;
  const indexable = searchIndexingEnabled(env);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: indexable, follow: indexable },
    openGraph: { title, description, url, siteName: SITE_NAME, type: "website", locale: "pt_BR" },
    twitter: { card: "summary", title, description },
  };
}

export function publicSitemap(env: IndexingEnvironment = process.env): MetadataRoute.Sitemap {
  if (!searchIndexingEnabled(env)) return [];
  // Only existing public pages: no customer IDs, orders, downloads or private PDFs.
  // Do not fabricate modification dates or catalog item URLs that do not exist.
  return PUBLIC_PATHS.map(path => ({ url: new URL(path, SITE_URL).href }));
}

export function searchRobots(env: IndexingEnvironment = process.env): MetadataRoute.Robots {
  if (!searchIndexingEnabled(env)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    // Private HTML pages retain their existing noindex headers and authentication.
    // Allow crawling of those headers; robots.txt is not an access-control mechanism.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
