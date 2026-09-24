import { PrepareDocument } from "@/components/workspace/deliverables";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PrepareDocument kind="search_update" roleId={(await params).id} />;
}
