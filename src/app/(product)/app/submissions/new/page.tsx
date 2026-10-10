import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{role?: string; people?: string}> }) {
  const params = await searchParams;
  const query = new URLSearchParams({prompt: "Prepare a candidate recommendation. Ask me for any missing candidate or role context. Do not send it."});
  if (params.role) query.set("role", params.role);
  if (params.people && !params.people.includes(",")) query.set("person", params.people);
  redirect(`/app?${query}`);
}
