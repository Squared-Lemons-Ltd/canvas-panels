/**
 * How the account book is narrowed and ordered.
 *
 * Pure, and framework-free: the root Panel is a table with filters over it, and
 * nothing about filtering a table is a Canvas concern. Keeping it out here is
 * what lets the Root Panel renderer be about *navigation* — which row opens
 * what, and from where — rather than about predicates.
 */

import {
  type Company,
  type CompanySizeBand,
  contactsForCompany,
  dealsForCompany,
  type HealthSignal,
  type MeridianDataset,
  type Money,
  openPipelineValue,
  type Region,
} from "@/src/domain";

export type BookScope = "all" | "at-risk" | "no-open-pipeline" | "enterprise";

export const bookScopeLabels: Readonly<Record<BookScope, string>> =
  Object.freeze({
    all: "Whole book",
    "at-risk": "Needs attention",
    "no-open-pipeline": "Nothing in play",
    enterprise: "Enterprise",
  });

export type BookSort = "attention" | "name" | "pipeline";

export const bookSortLabels: Readonly<Record<BookSort, string>> = Object.freeze(
  {
    attention: "Attention",
    name: "Name",
    pipeline: "Open pipeline",
  },
);

export type BookQuery = Readonly<{
  text: string;
  scope: BookScope;
  region: Region | "all";
  sort: BookSort;
}>;

export const emptyBookQuery: BookQuery = Object.freeze({
  text: "",
  scope: "all",
  region: "all",
  sort: "attention",
});

/** Worst first, so "attention" order has something to sort by. */
const healthRank: Readonly<Record<HealthSignal, number>> = Object.freeze({
  "at-risk": 0,
  watch: 1,
  steady: 2,
  strong: 3,
});

const sizeRank: Readonly<Record<CompanySizeBand, number>> = Object.freeze({
  enterprise: 0,
  "mid-market": 1,
  smb: 2,
});

/** One line of the book: the account, plus everything the table column needs. */
export type BookEntry = Readonly<{
  company: Company;
  openValue: Money;
  openDealCount: number;
  dealCount: number;
  contactCount: number;
}>;

export function bookEntry(
  dataset: MeridianDataset,
  company: Company,
): BookEntry {
  const deals = dealsForCompany(dataset, company.id);
  const open = deals.filter(
    (deal) => deal.stage !== "closed-won" && deal.stage !== "closed-lost",
  );
  return Object.freeze({
    company,
    openValue: openPipelineValue(dataset, company.id),
    openDealCount: open.length,
    dealCount: deals.length,
    contactCount: contactsForCompany(dataset, company.id).length,
  });
}

function matchesScope(entry: BookEntry, scope: BookScope): boolean {
  switch (scope) {
    case "all":
      return true;
    case "at-risk":
      return (
        entry.company.health === "at-risk" || entry.company.health === "watch"
      );
    case "no-open-pipeline":
      return entry.openDealCount === 0;
    case "enterprise":
      return entry.company.sizeBand === "enterprise";
  }
}

function matchesText(entry: BookEntry, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (needle === "") return true;
  const { name, industry, headquarters } = entry.company;
  return (
    name.toLowerCase().includes(needle) ||
    industry.toLowerCase().includes(needle) ||
    headquarters.toLowerCase().includes(needle)
  );
}

function compare(a: BookEntry, b: BookEntry, sort: BookSort): number {
  if (sort === "name") return a.company.name.localeCompare(b.company.name);
  if (sort === "pipeline") {
    const byValue = b.openValue.amount - a.openValue.amount;
    return byValue !== 0
      ? byValue
      : a.company.name.localeCompare(b.company.name);
  }
  const byHealth = healthRank[a.company.health] - healthRank[b.company.health];
  if (byHealth !== 0) return byHealth;
  const bySize = sizeRank[a.company.sizeBand] - sizeRank[b.company.sizeBand];
  if (bySize !== 0) return bySize;
  return b.openValue.amount - a.openValue.amount;
}

/** The book, narrowed and ordered. Stable for a given dataset and query. */
export function readBook(
  dataset: MeridianDataset,
  query: BookQuery,
): readonly BookEntry[] {
  const entries = dataset.companies.map((company) =>
    bookEntry(dataset, company),
  );
  return Object.freeze(
    entries
      .filter(
        (entry) =>
          matchesScope(entry, query.scope) &&
          matchesText(entry, query.text) &&
          (query.region === "all" || entry.company.region === query.region),
      )
      .sort((a, b) => compare(a, b, query.sort)),
  );
}

/** The regions the book actually contains, in the order the labels declare. */
export function regionsInBook(
  dataset: MeridianDataset,
  order: readonly Region[],
): readonly Region[] {
  const present = new Set(dataset.companies.map(({ region }) => region));
  return Object.freeze(order.filter((region) => present.has(region)));
}
