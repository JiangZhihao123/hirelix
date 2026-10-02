import type { Metadata } from "next";
import { readSharedDocument } from "@/lib/workspace/document-sharing";
import { AgentText } from "@/components/AgentText";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Candidate recommendation | Hirelix",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Recommendation({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await readSharedDocument(token);
  if (!share)
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="text-2xl font-semibold">
          This recommendation is unavailable.
        </h1>
        <p className="mt-4">
          The link has expired or was withdrawn. Ask the sender for a new link.
        </p>
      </main>
    );
  const doc = share.snapshot,
    zh = doc.language === "zh";
  return (
    <main className="min-h-screen bg-[#f7f8f6] px-5 py-10 text-[#26352d]">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <span className="text-lg font-semibold">Hirelix</span>
          <span className="text-sm text-[#67736b]">
            {zh ? "候选人推荐" : "Candidate recommendation"}
          </span>
        </header>
        <article className="rounded-2xl border border-[#dde3dd] bg-white p-6 shadow-sm sm:p-10">
          <p className="mb-4 text-sm text-[#67736b]">
            {doc.client} · {doc.role}
          </p>
          <h1 className="mb-7 text-2xl font-semibold leading-relaxed">
            {doc.title}
          </h1>
          <div className="text-[15px] leading-8">
            <AgentText content={doc.content} />
          </div>
          {!!doc.files.length && (
            <section className="mt-9 border-t border-[#dde3dd] pt-6">
              <h2 className="mb-4 font-semibold">
                {zh ? "候选人简历" : "Candidate CVs"}
              </h2>
              <div className="grid gap-3">
                {doc.files.map((file) => (
                  <a
                    className="flex flex-wrap justify-between gap-3 rounded-lg border border-[#dde3dd] p-4 underline underline-offset-4"
                    key={file.id}
                    href={`/recommendation/${token}/files/${file.id}`}
                  >
                    <span>
                      {doc.people.find((p) => p.id === file.person_id)?.name}
                    </span>
                    <span>{file.name} ↓</span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </article>
        <p className="mt-6 text-center text-xs text-[#67736b]">
          {zh
            ? "由推荐人使用 Hirelix 整理"
            : "Prepared by your recruiter with Hirelix"}
        </p>
      </div>
    </main>
  );
}
