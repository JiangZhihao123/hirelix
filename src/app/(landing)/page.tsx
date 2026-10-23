import LandingPage from "./_components/LandingPage";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await searchParams;
  const attribution = new URLSearchParams();
  for (const key of [
    "traffic_source", "utm_source", "utm_medium", "utm_campaign",
    "utm_content", "utm_term", "gclid", "ref",
  ]) {
    const value = incoming[key];
    if (typeof value === "string") attribution.set(key, value);
  }

  // Render usable entry links, including campaign attribution, before hydration.
  return <LandingPage attributionQuery={attribution.toString()} />;
}
