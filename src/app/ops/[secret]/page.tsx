import { notFound } from "next/navigation";

import { OpsDashboardClient } from "./OpsDashboardClient";

export const dynamic = "force-dynamic";

export default async function OpsDashboardPage({
  params,
}: {
  params: Promise<{ secret: string }>;
}) {
  const { secret } = await params;
  if (!process.env.OPS_DASHBOARD_SECRET || secret !== process.env.OPS_DASHBOARD_SECRET) {
    notFound();
  }

  return <OpsDashboardClient secret={secret} />;
}
