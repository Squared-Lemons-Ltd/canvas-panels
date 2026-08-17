/**
 * The Panel Registry for Meridian's account book.
 *
 * The pipeline Canvas registers four Panel Kinds and gives all four the same
 * policies: reuse an open Panel, persist it, restore it through a loader. That
 * is the right answer for a trail through records, and it is one answer out of
 * several the package offers. This registry is the others.
 *
 * | Kind       | Deduplication | Persistence | Why                                  |
 * | ---------- | ------------- | ----------- | ------------------------------------ |
 * | `book`     | root          | implicit    | The table. Permanent, never closable |
 * | `peek`     | `replace`     | transient   | One preview at a time, in place      |
 * | `account`  | `reuse`       | navigation  | The record, and it carries a view    |
 * | `person`   | `allow-many`  | navigation  | Several at once, side by side        |
 * | `reassign` | `replace`     | transient   | One proposed change at a time        |
 *
 * Two of those are transient on purpose. A preview is not somewhere you *were*,
 * and a change you have not made yet is not somewhere anybody can be sent — so
 * neither belongs in a link, and the package's default persistence keeps them
 * out of one without either Panel having to say anything.
 *
 * The account Panel is the only one in this application that takes an update.
 * Its descriptor carries which view is showing, so the tab a colleague is
 * looking at travels in the link with the record — and moving between tabs goes
 * through the Panel Engine's `update` command rather than round React state,
 * which is what puts it in the address bar.
 */

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import { applyCanvasNavigationParameter } from "@squaredlemons/canvas-panels/next/server";

import {
  contactsForCompany,
  dealsForCompany,
  getCompany,
  getContact,
  loadMeridianDataset,
} from "@/src/domain";

const dataset = loadMeridianDataset();

/**
 * The query parameter this Canvas claims, which is also the name of its History
 * Namespace. The pipeline owns `canvas`; naming a different one is what lets a
 * second URL-owning Workspace exist in the same application without the two
 * ever contending for the address — the first claimant of a namespace wins, and
 * a loser is demoted to memory rather than told about it.
 */
export const bookParameterName = "book";

export const accountViews = ["overview", "people", "deals", "signals"] as const;

export type AccountView = (typeof accountViews)[number];

export const accountViewLabels: Readonly<Record<AccountView, string>> =
  Object.freeze({
    overview: "Overview",
    people: "People",
    deals: "Deals",
    signals: "Signals",
  });

function isAccountView(value: unknown): value is AccountView {
  return (
    typeof value === "string" &&
    (accountViews as readonly string[]).includes(value)
  );
}

export type PeekInput = Readonly<{ companyId: string }>;
export type AccountInput = Readonly<{ companyId: string; view: AccountView }>;
export type PersonInput = Readonly<{ contactId: string }>;
export type ReassignInput = Readonly<{ companyIds: readonly string[] }>;

/** The one thing an account Panel can be asked to become. */
export type AccountUpdate = Readonly<{ type: "view"; view: AccountView }>;

type AccountDescriptor = { companyId: string; view: AccountView };
type PersonDescriptor = { contactId: string };

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

export const bookRoot = defineRootPanel({
  kind: "book",
  title: "The book",
});

/**
 * The preview.
 *
 * `replace` with a *constant* Panel Key is the whole trick: the key names the
 * slot rather than the record, so the second row a reader touches does not open
 * a second preview beside the first — it takes its place. That is the classic
 * list-and-preview idiom, and the package expresses it as a policy rather than
 * as something the application has to remember to close.
 *
 * Transient, so a preview never reaches the address bar. Somewhere you glanced
 * is not somewhere you went.
 */
export const peekPanel = definePanel({
  kind: "peek",
  deduplication: "replace",
  key: (_input: PeekInput) => "preview",
  title: ({ companyId }) => getCompany(dataset, companyId)?.name ?? "Preview",
});

/**
 * The account record, and the view it is open at.
 *
 * `reuse` keyed on the account means the same account is never open twice: come
 * at it from a person, from the table, or from a link, and you land on the Panel
 * that is already there — at the tab you left it on.
 */
export const accountPanel = definePanel({
  kind: "account",
  deduplication: "reuse",
  key: ({ companyId }: AccountInput) => companyId,
  title: ({ companyId }) => getCompany(dataset, companyId)?.name ?? "Account",
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ companyId, view }) => ({ companyId, view }),
      validate: (descriptor): descriptor is AccountDescriptor =>
        stringField(descriptor, "companyId") !== null &&
        isAccountView(field(descriptor, "view")),
      decode: ({ companyId, view }) => ({ companyId, view }),
      migrations: [],
    },
    restore: ({ companyId }) =>
      Promise.resolve({
        status: getCompany(dataset, companyId) ? "available" : "unavailable",
      }),
  },
  update: {
    validate: (value): value is AccountUpdate =>
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).type === "view" &&
      isAccountView((value as Record<string, unknown>).view),
    validateResult: (value): value is AccountInput =>
      stringField(value, "companyId") !== null &&
      isAccountView(field(value, "view")),
    apply: (current, update) => ({
      companyId: current.companyId,
      view: update.view,
    }),
    // The tab is part of where you are, so it belongs in the address — but
    // moving between tabs is not a step in the trail, so it replaces the
    // current history entry rather than pushing a new one. Back still means
    // "the Panel before this one", not "the tab before this one".
    navigation: "replace",
  },
});

/**
 * A person on the account.
 *
 * `allow-many` — the only Panel Kind in this application with no semantic
 * identity at all. A buying group is read by comparing its members, so opening
 * three of them has to give three Panels rather than one Panel changing its
 * mind. Each one is opened from the *deepest* Panel rather than from the
 * account, which is what makes them line up instead of replacing one another;
 * see `book-canvas.tsx`.
 */
export const personPanel = definePanel({
  kind: "person",
  deduplication: "allow-many",
  title: ({ contactId }: PersonInput) =>
    getContact(dataset, contactId)?.name ?? "Person",
  persistence: {
    mode: "navigation",
    version: 1,
    codec: {
      encode: ({ contactId }) => ({ contactId }),
      validate: (descriptor): descriptor is PersonDescriptor =>
        stringField(descriptor, "contactId") !== null,
      decode: ({ contactId }) => ({ contactId }),
      migrations: [],
    },
  },
});

/**
 * The proposed reassignment of every account ticked in the table.
 *
 * Its descriptor is a *set* rather than one record's id, which is worth having
 * in a sample: a Panel Kind is a category of surface, not a synonym for "one
 * row". `replace` on a constant key keeps it to one proposal at a time.
 *
 * Transient, because a change nobody has made yet cannot be linked to.
 */
export const reassignPanel = definePanel({
  kind: "reassign",
  deduplication: "replace",
  key: (_input: ReassignInput) => "reassignment",
  title: ({ companyIds }) =>
    companyIds.length === 1
      ? "Reassign 1 account"
      : `Reassign ${companyIds.length} accounts`,
});

export const bookPanels = [
  peekPanel,
  accountPanel,
  personPanel,
  reassignPanel,
] as const;

export type BookPanels = typeof bookPanels;

/** One record, named the way everything outside this registry names one. */
export type BookRef =
  | Readonly<{ kind: "account"; id: string; view?: AccountView }>
  | Readonly<{ kind: "person"; id: string }>;

export function bookReferenceFor(record: BookRef) {
  return record.kind === "account"
    ? accountPanel.reference({
        companyId: record.id,
        view: record.view ?? "overview",
      })
    : personPanel.reference({ contactId: record.id });
}

/**
 * The stack the book opens on when the address names none of its own.
 *
 * An empty table demonstrates a table. What this Canvas is for shows up one
 * step further along: an account open at its *People* view — a view carried in
 * the descriptor rather than in React state — with two of that buying group
 * lined up beside it, which is the `allow-many` policy doing the one thing
 * `reuse` cannot.
 *
 * Derived from the dataset rather than written as ids, so a renamed or removed
 * record cannot leave the page pointing at nothing.
 */
const openingBook: readonly BookRef[] = (() => {
  const account = [...dataset.companies].find(
    (company) =>
      contactsForCompany(dataset, company.id).length >= 2 &&
      dealsForCompany(dataset, company.id).length >= 2,
  );
  if (!account) return [];
  const [first, second] = contactsForCompany(dataset, account.id);
  if (!first || !second) return [];
  return Object.freeze([
    { kind: "account", id: account.id, view: "people" },
    { kind: "person", id: first.id },
    { kind: "person", id: second.id },
  ] as const);
})();

/**
 * That stack as a Navigation Document, built by the package rather than
 * hand-written: a throwaway engine walks the path and encodes what it produced.
 *
 * Every Panel is opened from the *deepest* Panel, which is what appends rather
 * than replaces — the same rule the People list follows at runtime.
 */
export const openingBookDocument: string | null = (() => {
  if (openingBook.length === 0) return null;
  const engine = createPanelEngine({ root: bookRoot, panels: bookPanels });
  for (const record of openingBook) {
    const deepest = engine.getSnapshot().panels.at(-1);
    if (!deepest) return null;
    const opened = engine.open({
      originId: deepest.instanceId,
      panel: bookReferenceFor(record),
    });
    if (opened.status !== "opened" && opened.status !== "reused") return null;
  }
  return engine.encodeNavigationDocument();
})();

/**
 * The address that opens one record on a cold load, under this Canvas's own
 * parameter name rather than the pipeline's.
 */
export function bookDeepLink(record: BookRef): string {
  const engine = createPanelEngine({ root: bookRoot, panels: bookPanels });
  const root = engine.getSnapshot().panels[0];
  if (!root) return "/accounts";
  const opened = engine.open({
    originId: root.instanceId,
    panel: bookReferenceFor(record),
  });
  if (opened.status !== "opened" && opened.status !== "reused") {
    return "/accounts";
  }
  const search = applyCanvasNavigationParameter(
    new URLSearchParams(),
    engine.encodeNavigationDocument(),
    { parameterName: bookParameterName },
  );
  return `/accounts?${search.toString()}`;
}
