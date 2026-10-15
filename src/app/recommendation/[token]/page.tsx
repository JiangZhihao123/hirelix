import { recommendationSections } from "@/lib/workspace/recommendation-presentation";
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
  const layout = recommendationSections(doc.content, doc.people);
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
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#dde3dd] pb-6">
            <span className="text-sm text-[#67736b]">{zh ? `本次推荐 ${doc.people.length} 位候选人` : `${doc.people.length} ${doc.people.length === 1 ? "candidate" : "candidates"} in this recommendation`}</span>
            <a className="rounded-lg border border-[#dde3dd] px-4 py-2 text-sm hover:bg-[#f7f8f6]" href={`/recommendation/${token}/package`}>{zh ? "下载本批材料 · ZIP" : "Download package · ZIP"}</a>
          </div>
          <nav aria-label={zh ? "本次候选人" : "Candidates"} className="mb-8 flex flex-wrap gap-2">{doc.people.map((person,index)=><a key={person.id} href={`#candidate-${person.id}`} className="rounded-full bg-[#eef3ef] px-4 py-2 text-sm text-[#285542]">{index+1}. {person.name}</a>)}</nav>
          {layout.overview && <div className="mb-9 text-[15px] leading-8"><AgentText content={layout.overview} /></div>}
          <div className="space-y-8">{doc.people.map((person,index)=><section id={`candidate-${person.id}`} key={person.id} className="scroll-mt-6 rounded-xl border border-[#dde3dd] p-5 sm:p-7">
            <header className="mb-5 flex items-start gap-4">
              <span className="rounded-full bg-[#eef3ef] px-3 py-1 text-sm text-[#285542]">{String(index+1).padStart(2,'0')}</span>
              <div><h2 className="text-xl font-semibold">{person.name}</h2><p className="mt-1 text-sm text-[#67736b]">{[person.headline,person.location].filter(Boolean).join(' · ')}</p></div>
            </header>
            {layout.sections[person.id] && <div className="text-[15px] leading-8"><AgentText content={layout.sections[person.id]} /></div>}
            <div className="mt-5 flex flex-wrap gap-3">{doc.files.filter(file=>file.person_id===person.id).map(file=><a key={file.id} className="rounded-lg border border-[#dde3dd] px-4 py-2 text-sm text-[#285542] hover:bg-[#f7f8f6]" href={`/recommendation/${token}/files/${file.id}`}>{zh ? "下载简历" : "Download CV"} · {file.name} ↓</a>)}</div>
            <details className="mt-6 border-t border-[#dde3dd] pt-4"><summary className="cursor-pointer text-sm font-medium text-[#285542]">{zh ? `反馈 ${person.name}` : `Feedback on ${person.name}`}</summary>
              <p className="mb-4 mt-3 text-xs text-[#67736b]">{zh ? "反馈仅推荐人可见。面试意向不会自动安排面试。" : "Only your recruiter sees this feedback. Requesting an interview does not book one."}</p>
              <RecommendationFeedback token={token} personId={person.id} name={person.name} zh={zh} />
            </details>
          </section>)}</div>
          {layout.closing && <div className="mt-8 border-t border-[#dde3dd] pt-6 text-[15px] leading-8"><AgentText content={layout.closing} /></div>}
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
