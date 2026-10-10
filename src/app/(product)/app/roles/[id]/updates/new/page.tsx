import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{id: string}> }) {
  const query = new URLSearchParams({role: (await params).id, prompt: "Prepare a search update for this role. Ask me for the reporting period and any missing source context. Do not send it."});
  redirect(`/app?${query}`);
}
