/**
 * Illustrative sample data only. These people, employers and the client are
 * fictional; the film is a concept animation, not a recording of a real search.
 */

export type Candidate = {
  initials: string;
  name: string;
  role: string;
  experience: string;
  why: string;
  whyAfter: string;
  payments: { label: string; found: boolean };
  sources: number;
};

export const CANDIDATES: Candidate[] = [
  {
    initials: "DR",
    name: "Daniel Reyes",
    role: "Senior Backend Engineer · Logistics platform",
    experience: "Go services for real-time order routing and Kafka pipelines",
    why: "Event-driven Go at scale; OSS maintainer",
    whyAfter: "Event-driven Go at scale; OSS maintainer",
    payments: { label: "No payments work found", found: false },
    sources: 2,
  },
  {
    initials: "MB",
    name: "Marcus Bell",
    role: "Backend Lead · Healthcare SaaS",
    experience: "Led a move to event-driven services; PostgreSQL performance",
    why: "Platform lead; strong reliability record",
    whyAfter: "Platform lead; billing work, not payments",
    payments: { label: "Billing integrations only", found: false },
    sources: 2,
  },
  {
    initials: "PN",
    name: "Priya Nair",
    role: "Staff Engineer · Payments infrastructure startup",
    experience: "Ledger and reconciliation services in Go and PostgreSQL",
    why: "Deep PostgreSQL; talks on idempotent APIs",
    whyAfter: "Shipped payout ledgers; idempotent APIs",
    payments: { label: "Payments · ledgers & payouts", found: true },
    sources: 3,
  },
  {
    initials: "SL",
    name: "Sofia Lindqvist",
    role: "Senior Engineer · Card-issuing fintech",
    experience: "Rust and Go services for card authorization",
    why: "Low-latency fintech APIs; owns on-call",
    whyAfter: "Card authorization in production",
    payments: { label: "Payments · card authorization", found: true },
    sources: 2,
  },
];

/** Slot of each candidate after "Prioritize candidates with payments experience." */
export const REORDERED_SLOT = [3, 2, 0, 1];

export const PAGES = [
  { domain: "github.com", title: "Go repositories · event routing", excerpt: "Maintainer of an event-routing library", to: 0 },
  { domain: "engineering blog", title: "How we rebuilt our payout ledger", excerpt: "Author: Staff Engineer, payments team", to: 2 },
  { domain: "conference talk", title: "Idempotent APIs, in practice", excerpt: "Speaker bio · ledger services", to: 2 },
  { domain: "personal site", title: "Notes on Postgres partitioning", excerpt: "Writes about query performance", to: 1 },
  { domain: "github.com", title: "Card authorization in Rust", excerpt: "Contributor · Rust and Go services", to: 3 },
];

export const CLIENT = "Halden Pay";
