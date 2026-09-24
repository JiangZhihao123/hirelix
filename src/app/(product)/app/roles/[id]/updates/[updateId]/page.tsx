import { DocumentPage } from "@/components/workspace/deliverables";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; updateId: string }>;
}) {
  return <DocumentPage id={(await params).updateId} />;
}
