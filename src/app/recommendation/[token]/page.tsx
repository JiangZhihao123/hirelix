import type { Metadata } from "next";
import { readSharedDocument } from "@/lib/workspace/document-sharing";
import { AgentText } from "@/components/AgentText";
import { RecommendationFeedback } from "@/components/workspace/recommendation-feedback";
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
          <section className="mt-9 border-t border-[#dde3dd] pt-6">
            <h2 className="font-semibold">{zh ? "逐位反馈" : "Feedback on each candidate"}</h2>
            <p className="mt-2 text-sm text-[#67736b]">{zh ? "反馈仅推荐人可见。希望面试不代表已经安排面试。" : "Your feedback is visible to your recruiter only. An interview request does not book an interview."}</p>
            <div className="mt-5 grid gap-4">{doc.people.map(person => <section key={person.id} className="rounded-xl border border-[#dde3dd] p-5">
              <h3 className="font-semibold">{person.name}</h3><p className="mt-1 text-sm text-[#67736b]">{person.headline}</p>
              <details className="mt-3"><summary className="cursor-pointer text-sm text-[#285542]">{zh ? "填写反馈" : "Leave feedback"}</summary><RecommendationFeedback token={token} personId={person.id} name={person.name} zh={zh} /></details>
            </section>)}</div>
          </section>
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
