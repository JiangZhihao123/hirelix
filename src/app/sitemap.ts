import type { MetadataRoute } from "next";
import { publicPages, SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map(({ path, lastModified }) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    ...(lastModified ? { lastModified } : {}),
  }));
}
