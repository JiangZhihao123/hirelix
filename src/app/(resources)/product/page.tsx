import Link from "next/link";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata(
  "/product",
  "Your Personal AI Agent for Headhunting | Hirelix",
  "Meet your personal AI agent for headhunting. Build on saved candidate relationships, client briefs, conversations, and the way you like to work.",
);

export default function ProductPage() {
  return (
    <>
      <p className="ha-eyebrow">AN ASSISTANT THAT STAYS WITH YOUR WORK</p>
      <h1>
        Your work continues.
        <br />
        So does your assistant.
      </h1>
      <p className="hr-intro">
        Hirelix is a personal AI agent for independent headhunters and
        consultants at boutique search firms, built for a working relationship
        that continues over time. Bring it your candidates, client briefs, and
        everyday questions. Keep building on the work you have already done
        together.
      </p>
      <section>
        <h2>Start with a conversation</h2>
        <p>
          Share a CV, a candidate list, a client message, or a goal. Ask your
          assistant to organize clearly identified records, revisit candidates
          for a role, or prepare a client draft. Files provide context for the
          work; your conversation is where you ask, refine, and receive the
          result.
        </p>
      </section>
      <section>
        <h2>Keep the context that matters</h2>
        <p>
          Saved candidate profiles, original materials, role requirements, and
          recorded conversations remain in your workspace for later work. Add a
          new call note today and use it when a relevant role comes in later.
        </p>
        <p>
          You can ask your assistant to remember an explicit preference, such as
          how you like recommendations written. Review, update, or ask it to
          forget those saved preferences as your way of working changes. This is
          context you choose to retain, not a promise that every past detail is
          automatically recalled in every answer.
        </p>
      </section>
      <section>
        <h2>Stay with a role as it changes</h2>
        <p>
          A client refines the brief. A candidate’s priorities change. You need
          a different emphasis in a recommendation. Bring those developments
          into the same workspace so your assistant can continue from the saved
          records.
        </p>
        <p>
          You can also agree on recurring role-update drafts, specifying the
          role, schedule, and source scope. The assistant prepares the work for
          review; it does not automatically contact clients or candidates.
        </p>
      </section>
      <section className="hr-callout">
        <h2>What does “long-term” mean here?</h2>
        <p>
          Your assistant works with the records and preferences you save over
          time. It helps you continue work across conversations and roles. It
          does not mean unlimited memory, automatic knowledge of outside events,
          or independent authority to make recruiting decisions.
        </p>
        <p>
          Hirelix works with your own candidate pool. It does not provide paid
          external candidate sourcing or access to a talent database.
        </p>
      </section>
      <section>
        <h2>Your judgment stays central</h2>
        <p>
          Give clear instructions for work you want saved. The assistant asks
          about ambiguous identities, conflicting facts, or missing information
          that blocks the task. An analysis request alone does not authorize
          changes to your records.
        </p>
        <p>
          Review candidate assessments and client-facing drafts before using
          them. Copy, export, or share approved work through the available
          controls. Optional Gmail delivery requires sending permission and your
          explicit action.
        </p>
      </section>
      <section className="hr-related">
        <h2>See how the relationship builds</h2>
        <ul>
          <li>
            <Link href="/guides/candidate-rediscovery">
              Revisit candidates without starting from scratch
            </Link>
          </li>
          <li>
            <Link href="/guides/candidate-submissions">
              Prepare a recommendation from the context you already have
            </Link>
          </li>
          <li>
            <Link href="/pricing">See pricing and the free trial</Link>
          </li>
        </ul>
        <p>
          Hirelix is operated by YieldMirror.{" "}
          <Link href="/contact">Contact us</Link> or read our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <Link className="ha-button" href="/app?entry=free_trial">
          Meet your assistant
        </Link>
      </section>
    </>
  );
}
