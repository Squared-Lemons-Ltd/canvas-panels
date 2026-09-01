"use client";

/**
 * Meridian's account book: a second Bound Canvas Module, built out of the same
 * package as the pipeline and deliberately unlike it.
 *
 * Where the pipeline is a trail — one path, each Panel reusing the record it
 * names — the book is a column browser. The table stays on the left, a preview
 * takes and gives up one slot, and the records a reader wants to hold on to
 * accumulate to the right. Every difference between the two surfaces is a
 * policy on a Panel definition, an origin chosen at the call site, or a
 * `--canvas-*` token. None of it is a fork of the package.
 *
 * Five things here are shown nowhere in the pipeline:
 *
 *   1. `replace` deduplication on a constant Panel Key — the preview slot.
 *   2. `allow-many` — several people, side by side, opened from the deepest
 *      Panel so that they append rather than replace one another.
 *   3. A typed `update` with a pure reducer — the account's view tab travels in
 *      the descriptor, so it is in the link and survives a reload.
 *   4. A `block` Guard Outcome — a write in flight that the Canvas refuses to
 *      commit over, and the rejected command read back and reported.
 *   5. Context Signals — every Panel publishes what it is about, and one strip
 *      below the Canvas reads whatever the Active Panel published.
 */

import type {
  GuardOutcome,
  PanelInstanceRef,
} from "@squaredlemons/canvas-panels/core";
import {
  type CanvasPanelRenderProps,
  createCanvasModule,
  defineCanvasContext,
} from "@squaredlemons/canvas-panels/ui";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { pipelineDeepLink } from "@/components/pipeline/panels";
import { ActivityTimeline } from "@/components/pipeline/record-parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  activitiesForCompany,
  activitiesForContact,
  arrBandLabels,
  contactsForCompany,
  type Deal,
  dealsForCompany,
  dealValue,
  formatMoney,
  formatRelativeDate,
  getCompany,
  getContact,
  getOwner,
  healthLabels,
  isOpenStage,
  type MeridianDataset,
  type Money,
  openPipelineValue,
  type Owner,
  pipelineStageLabels,
  type Region,
  regionLabels,
  seniorityLabels,
  sizeBandLabels,
} from "@/src/domain";

import {
  type BookQuery,
  type BookScope,
  bookScopeLabels,
  type BookSort,
  bookSortLabels,
  emptyBookQuery,
  readBook,
  regionsInBook,
} from "./book-index";
import {
  type AccountInput,
  type AccountView,
  accountPanel,
  accountViewLabels,
  accountViews,
  bookDeepLink,
  bookPanels,
  bookRoot,
  type PeekInput,
  peekPanel,
  type PersonInput,
  personPanel,
  type ReassignInput,
  reassignPanel,
} from "./book-panels";
import {
  accountLine,
  BigFigure,
  FactTable,
  HealthMark,
  LedgerBlock,
  LedgerHead,
  LedgerRow,
  MissingEntry,
  Proportion,
  Tag,
} from "./book-parts";
import {
  bookRoundTrip,
  bookSnapshot,
  reassignAccounts,
  reassignedAccountIds,
  resetBook,
  subscribeToBook,
} from "./book-store";

/* -------------------------------------------------------------------------- *
 *  The Context Signal
 * -------------------------------------------------------------------------- */

/**
 * What a Panel says about itself to anything outside it.
 *
 * A Context Signal is application-typed and opaque to the package: it stores
 * the value and selects whose value to hand back, and never interprets,
 * serialises, logs or announces it. That is what makes it the right place for
 * a strip like the inspector below — the alternative, reaching into whichever
 * Panel happens to be active, would have every renderer knowing about the
 * chrome that reads it.
 */
export type BookSignal = Readonly<{
  /** What kind of thing this column is showing, in the reader's words. */
  what: string;
  headline: string;
  facts: readonly (readonly [string, string])[];
  /** The package behaviour this column is a demonstration of. */
  note: string;
}>;

/* -------------------------------------------------------------------------- *
 *  Shared plumbing
 * -------------------------------------------------------------------------- */

/**
 * The book as it stands, re-read whenever the store republishes.
 *
 * Every Panel calls this, and that is the architectural contrast with the
 * pipeline: no Resource Exchange, no per-Panel invalidation policy, because
 * nothing here holds a draft that a colleague's change could overwrite. The
 * package does not oblige an application to use its extensions.
 */
function useBook(): MeridianDataset {
  return useSyncExternalStore(subscribeToBook, bookSnapshot, bookSnapshot);
}

/**
 * The Root Panel and the deepest Panel, which are the two Origins this Canvas
 * ever opens from.
 *
 * Origin is not incidental here — it is the whole difference between a column
 * browser and a stack. Opening from the Root Panel replaces everything to its
 * right, which is what clicking a row in the table means. Opening from the
 * deepest Panel appends, which is what adding a person to a line-up means.
 */
function useEnds(): Readonly<{
  root: PanelInstanceRef | undefined;
  deepest: PanelInstanceRef | undefined;
}> {
  const stack = BookCanvas.useStack();
  return { root: stack[0]?.panel, deepest: stack.at(-1)?.panel };
}

/**
 * The lifecycle a Panel with nothing to lose registers. Every Panel registers
 * one, both to take part in Guarded Transitions and to name where focus lands
 * when the Canvas activates it.
 */
const settled = Object.freeze({
  dirty: false,
  guard: () => ({ status: "allow" }) as const,
  save: async () => {},
  discard: async () => {},
});

/**
 * Reports a command the Canvas refused.
 *
 * Most of this application never looks at an outcome, because most commands
 * cannot fail in a way a reader caused. These two can: a Panel mid-write blocks
 * the transition that would remove it, and a non-closable Panel refuses one
 * outright. Both come back as a rejection rather than as an exception, and a
 * demonstration that swallowed them would be showing a Canvas that silently
 * does nothing.
 */
function reportRefusal(outcome: Readonly<{ status: string; reason?: string }>) {
  if (outcome.status !== "rejected") return;
  if (outcome.reason === "transition-blocked") {
    toast.warning("The Canvas blocked that", {
      description:
        "A column is part-way through writing. Nothing may close over it until the write settles.",
    });
    return;
  }
  if (outcome.reason === "not-closable") {
    toast.warning("That column cannot be closed", {
      description: "So nothing may replace it either.",
    });
  }
}

function ownerName(dataset: MeridianDataset, ownerId: string): string {
  return getOwner(dataset, ownerId)?.name ?? "Unassigned";
}

/* -------------------------------------------------------------------------- *
 *  Root Panel — the table
 * -------------------------------------------------------------------------- */

function ScopeBar({
  query,
  onChange,
  regions,
}: Readonly<{
  query: BookQuery;
  onChange: (next: BookQuery) => void;
  regions: readonly Region[];
}>) {
  const searchId = useId();
  const regionId = useId();
  const sortId = useId();
  return (
    <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3">
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Label className="sr-only" htmlFor={searchId}>
          Search the book
        </Label>
        <Input
          className="h-8 rounded-[4px] pl-8 text-sm"
          id={searchId}
          onChange={(event) => onChange({ ...query, text: event.target.value })}
          placeholder="Account, industry or city"
          value={query.text}
        />
      </div>
      {/*
        A single-select ToggleGroup rather than five buttons with `aria-pressed`.
        Radix gives it roving focus, arrow-key movement and a radio group's
        semantics — all of which the hand-rolled version was missing, and none of
        which is worth writing twice.

        `value=""` is not a scope, so an empty payload is treated as a re-press
        of the current one: a segmented control has no "nothing selected" state.
      */}
      <ToggleGroup
        className="justify-start gap-1"
        onValueChange={(value) => {
          if (value !== "") onChange({ ...query, scope: value as BookScope });
        }}
        size="sm"
        type="single"
        value={query.scope}
        variant="outline"
      >
        {(Object.keys(bookScopeLabels) as BookScope[]).map((scope) => (
          <ToggleGroupItem
            className="px-2 text-[0.6875rem] tracking-wide uppercase"
            key={scope}
            value={scope}
          >
            {bookScopeLabels[scope]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Label className="text-xs font-normal" htmlFor={regionId}>
            Region
          </Label>
          <Select
            onValueChange={(value) =>
              onChange({ ...query, region: value as BookQuery["region"] })
            }
            value={query.region}
          >
            <SelectTrigger
              className="h-7 min-w-28 text-xs"
              id={regionId}
              size="sm"
            >
              {/*
                The label is written out rather than left to `SelectValue` to
                infer. Radix reads a trigger's text from the selected *item*,
                and the items live inside a portal that is unmounted until the
                menu is first opened — so a controlled Select that arrives with
                a value already chosen renders an empty trigger until somebody
                opens it. Passing children settles it on the first paint.
              */}
              <SelectValue>
                {query.region === "all" ? "All" : regionLabels[query.region]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {regions.map((region) => (
                <SelectItem key={region} value={region}>
                  {regionLabels[region]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        <span className="flex items-center gap-1.5">
          <Label className="text-xs font-normal" htmlFor={sortId}>
            Order
          </Label>
          <Select
            onValueChange={(value) =>
              onChange({ ...query, sort: value as BookSort })
            }
            value={query.sort}
          >
            <SelectTrigger
              className="h-7 min-w-32 text-xs"
              id={sortId}
              size="sm"
            >
              <SelectValue>{bookSortLabels[query.sort]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(bookSortLabels) as BookSort[]).map((sort) => (
                <SelectItem key={sort} value={sort}>
                  {bookSortLabels[sort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      </div>
    </div>
  );
}

function BookRoot() {
  const navigation = BookCanvas.useNavigation();
  const dataset = useBook();
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState<BookQuery>(emptyBookQuery);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const stack = BookCanvas.useStack();

  // The Root Panel claims focus only once something has been opened from it.
  // Claiming it on first paint would put the reader past the skip link before
  // they had asked to go anywhere.
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => {
    if (stack.length > 1) setEverOpened(true);
  }, [stack.length]);

  BookCanvas.useLifecycle({
    ...settled,
    ...(everOpened ? { initialFocus: heading } : {}),
  });

  const entries = readBook(dataset, query);
  const regions = regionsInBook(dataset, [
    "north-america",
    "uk-ireland",
    "europe",
    "apac",
    "global",
  ]);
  const largest = entries.reduce(
    (running, entry) => Math.max(running, entry.openValue.amount),
    0,
  );
  const total: Money = {
    amount: entries.reduce(
      (running, entry) => running + entry.openValue.amount,
      0,
    ),
    currency: dataset.reportingCurrency,
  };
  const moved = reassignedAccountIds().length;

  // Formatted before the signal rather than inside it: a signal rebuilt on
  // every render would republish on every render, and the strip reading it
  // would flicker through values nothing had changed.
  const totalLabel = formatMoney(total, { compact: true });

  BookCanvas.useContextSignal(
    useMemo(
      (): BookSignal => ({
        what: "The book",
        headline: `${entries.length} of ${dataset.companies.length} accounts`,
        facts: [
          ["Open pipeline", totalLabel],
          ["Selected", String(selected.size)],
          ["Order", bookSortLabels[query.sort]],
        ],
        note: "The Root Panel. Permanent, never closable, and the Origin every row opens from — which is why a row replaces whatever was to its right.",
      }),
      [
        dataset.companies.length,
        entries.length,
        query.sort,
        selected.size,
        totalLabel,
      ],
    ),
  );

  const toggle = (companyId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(companyId)) next.add(companyId);
      return next;
    });
  };

  return (
    <div className="flex flex-col">
      <LedgerHead
        eyebrow={`Territory · ${entries.length} accounts`}
        headingRef={heading}
        meta={`${formatMoney(total)} still in play across everything showing.`}
        title="The book"
      >
        {moved > 0 ? (
          <Button
            className="h-7 rounded-[4px] px-2 text-xs"
            onClick={() => {
              resetBook();
              toast("Ownership put back as the dataset ships it");
            }}
            size="sm"
            variant="outline"
          >
            <RotateCcwIcon aria-hidden="true" className="size-3" />
            Undo {moved} reassignment{moved === 1 ? "" : "s"}
          </Button>
        ) : null}
      </LedgerHead>

      <ScopeBar onChange={setQuery} query={query} regions={regions} />

      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {selected.size === 0
            ? "Tick accounts to move them between owners."
            : `${selected.size} selected`}
        </span>
        <Button
          className="h-7 rounded-[4px] px-2.5 text-xs"
          disabled={selected.size === 0}
          onClick={() => {
            const outcome = navigation.open(reassignPanel, {
              companyIds: [...selected].sort(),
            });
            reportRefusal(outcome);
          }}
          size="sm"
          variant="secondary"
        >
          Reassign owner
        </Button>
      </div>

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Accounts, {bookSortLabels[query.sort].toLowerCase()} order. Selecting
          an account name previews it; the chevron opens the full record.
        </caption>
        <thead>
          {/*
            The Panel body is the scroll container, so the head sticks to the
            top of the column rather than to the page. Sticky is put on the
            cells rather than the row: a sticky `<tr>` is still not honoured
            everywhere, and a header that quietly stopped sticking in one
            browser would be worse than one that never did.
          */}
          <tr className="text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
            <th
              className="sticky top-0 z-10 w-8 border-b border-border bg-muted px-2 py-1.5"
              scope="col"
            >
              <span className="sr-only">Select</span>
            </th>
            <th
              className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-1.5 text-left font-semibold"
              scope="col"
            >
              Account
            </th>
            <th
              className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-1.5 text-left font-semibold"
              scope="col"
            >
              Owner
            </th>
            <th
              className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-1.5 text-right font-semibold"
              scope="col"
            >
              Open
            </th>
            <th
              className="sticky top-0 z-10 w-8 border-b border-border bg-muted px-2 py-1.5"
              scope="col"
            >
              <span className="sr-only">Open the record</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(
            ({ company, openValue, openDealCount, contactCount }) => (
              <tr
                className="border-b border-border/60 transition-colors hover:bg-accent/40"
                key={company.id}
              >
                <td className="px-2 py-1.5 align-middle">
                  <Checkbox
                    aria-label={`Select ${company.name}`}
                    checked={selected.has(company.id)}
                    className="size-3.5"
                    onCheckedChange={() => toggle(company.id)}
                  />
                </td>
                <td className="max-w-0 px-2 py-1.5 align-middle">
                  <button
                    className="flex w-full min-w-0 items-center gap-2 rounded-[2px] text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    onClick={() =>
                      reportRefusal(
                        navigation.open(peekPanel, { companyId: company.id }),
                      )
                    }
                    type="button"
                  >
                    <HealthMark health={company.health} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {company.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {company.industry} · {openDealCount} open ·{" "}
                        {contactCount} contacts
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-2 py-1.5 align-middle text-xs text-muted-foreground">
                  <span className="truncate">
                    {ownerName(dataset, company.ownerId)}
                  </span>
                </td>
                <td className="w-28 px-2 py-1.5 align-middle text-right">
                  <span
                    className="block text-xs font-medium tabular-nums"
                    data-numeric
                  >
                    {formatMoney(openValue, { compact: true })}
                  </span>
                  <Proportion of={largest} value={openValue.amount} />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <button
                    aria-label={`Open the full record for ${company.name}`}
                    className="grid size-6 place-items-center rounded-[3px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    onClick={() =>
                      reportRefusal(
                        navigation.open(accountPanel, {
                          companyId: company.id,
                          view: "overview",
                        }),
                      )
                    }
                    type="button"
                  >
                    <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing in the book matches that.
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Peek Panel — the one preview slot
 * -------------------------------------------------------------------------- */

function PeekPanel({ descriptor }: CanvasPanelRenderProps<PeekInput, "peek">) {
  const { companyId } = descriptor;
  const navigation = BookCanvas.useNavigation();
  const { root } = useEnds();
  const dataset = useBook();
  const heading = useRef<HTMLHeadingElement>(null);
  const company = getCompany(dataset, companyId);

  BookCanvas.useLifecycle({ ...settled, initialFocus: heading });

  BookCanvas.useContextSignal(
    useMemo(
      (): BookSignal => ({
        what: "Preview",
        headline: company?.name ?? "Preview",
        facts: [["Slot", "One at a time"]],
        note: "`replace` deduplication on a constant Panel Key. The next row you touch takes this slot rather than opening beside it, and nothing had to close it.",
      }),
      [company?.name],
    ),
  );

  if (!company) return <MissingEntry headingRef={heading} what="account" />;

  const deals = dealsForCompany(dataset, companyId);
  const contacts = contactsForCompany(dataset, companyId);
  const open = deals.filter((deal) => isOpenStage(deal.stage));

  return (
    <div className="flex flex-col">
      <LedgerHead
        eyebrow="Preview"
        headingRef={heading}
        meta={accountLine(company)}
        title={company.name}
      >
        <HealthMark health={company.health} labelled />
        <Tag>{sizeBandLabels[company.sizeBand]}</Tag>
      </LedgerHead>

      <LedgerBlock>
        <BigFigure
          caption="Open pipeline"
          detail={`${open.length} of ${deals.length} deals still in play`}
          value={openPipelineValue(dataset, companyId)}
        />
      </LedgerBlock>

      <LedgerBlock title="At a glance">
        <FactTable
          items={[
            ["Owner", ownerName(dataset, company.ownerId)],
            ["Region", regionLabels[company.region]],
            ["People", String(contacts.length)],
            ["ARR", arrBandLabels[company.arrBand]],
          ]}
        />
      </LedgerBlock>

      <LedgerBlock
        note="Opening the record from here would nest it under a preview, and a preview is transient — so everything beneath it would drop out of the link. It opens from the table instead, which is where the reader actually came from."
        title="The full record"
      >
        <Button
          className="h-8 w-full rounded-[4px]"
          disabled={root === undefined}
          onClick={() => {
            if (!root) return;
            reportRefusal(
              navigation.open(
                accountPanel,
                { companyId, view: "overview" },
                { origin: root },
              ),
            );
          }}
          size="sm"
        >
          Open {company.name}
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </LedgerBlock>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Account Panel — the record, and the view it is open at
 * -------------------------------------------------------------------------- */

function ViewTabs({
  current,
  onSelect,
}: Readonly<{
  current: AccountView;
  onSelect: (view: AccountView) => void;
}>) {
  /*
   * Radix Tabs, not a hand-rolled `role="tablist"`.
   *
   * The hand-rolled one had the roles and `aria-selected` and nothing else: no
   * roving `tabIndex`, no arrow-key movement between tabs, no `aria-controls`.
   * A tablist that a keyboard cannot move through is worse than no tablist,
   * because it has told a screen reader to expect one.
   *
   * There are no `TabsContent` panels underneath: what a tab selects is a
   * *descriptor*, and the Panel Engine re-renders the whole Panel body from it.
   * Radix is content to drive a list on its own.
   */
  return (
    <Tabs
      onValueChange={(value) => onSelect(value as AccountView)}
      value={current}
    >
      <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-muted/30 p-0">
        {accountViews.map((view) => (
          <TabsTrigger
            className="rounded-none border-0 border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none"
            key={view}
            value={view}
          >
            {accountViewLabels[view]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function AccountPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<AccountInput, "account">) {
  const { companyId, view } = descriptor;
  const navigation = BookCanvas.useNavigation();
  const { deepest } = useEnds();
  const dataset = useBook();
  const heading = useRef<HTMLHeadingElement>(null);
  const company = getCompany(dataset, companyId);

  BookCanvas.useLifecycle({ ...settled, initialFocus: heading });

  /*
   * An ornament in the Panel header: this account's health, beside its name.
   *
   * Deliberately *only* the mark. A registered visual title does not replace
   * the Panel's heading — the package renders both, the `h2` for the accessible
   * name and an `aria-hidden` span for whatever the application wants seen —
   * and a visual title repeating the name therefore prints it twice. It is the
   * heading that keeps the name, because the heading is also the element the
   * Canvas hands focus to when the Panel is activated, and a keyboard reader
   * who arrives on a visually-hidden target has been told nothing.
   *
   * The stylesheet puts the span before the heading; see `[data-canvas-visual-
   * title]` in `globals.css`.
   *
   * `useHeader` holds the node in a stable header-content store, so the natural
   * inline element updates this one heading slot without re-registering it.
   */
  BookCanvas.useHeader({
    visualTitle: company ? <HealthMark health={company.health} /> : undefined,
  });

  BookCanvas.useContextSignal(
    useMemo(
      (): BookSignal => ({
        what: "Account",
        headline: company?.name ?? "Account",
        facts: [
          ["View", accountViewLabels[view]],
          ["Health", company ? healthLabels[company.health] : "—"],
          ["Owner", company ? ownerName(dataset, company.ownerId) : "—"],
        ],
        note: "The view tab is part of the descriptor, not React state — so it went through the Panel Engine's `update` command and is in the address bar. Reload the page and you land back on this tab.",
      }),
      [company, dataset, view],
    ),
  );

  if (!company) return <MissingEntry headingRef={heading} what="account" />;

  const deals = dealsForCompany(dataset, companyId);
  const contacts = contactsForCompany(dataset, companyId);
  const activities = activitiesForCompany(dataset, companyId).slice(0, 8);
  const open = deals.filter((deal) => isOpenStage(deal.stage));

  return (
    <div className="flex flex-col">
      <BookCanvas.Action
        id="share-account"
        label="Copy link"
        onSelect={() => {
          const address = `${window.location.origin}${bookDeepLink({
            kind: "account",
            id: companyId,
            view,
          })}`;
          void navigator.clipboard
            ?.writeText(address)
            .then(() =>
              toast.success("Link copied", {
                description: `${company.name}, ${accountViewLabels[view]} view`,
              }),
            )
            .catch(() =>
              toast.error("Could not copy the link", { description: address }),
            );
        }}
      />

      <LedgerHead
        eyebrow="Account"
        headingRef={heading}
        meta={accountLine(company)}
        title={company.name}
      >
        <HealthMark health={company.health} labelled />
        <Tag>{sizeBandLabels[company.sizeBand]}</Tag>
        <Tag>{regionLabels[company.region]}</Tag>
      </LedgerHead>

      <ViewTabs
        current={view}
        onSelect={(next) => {
          // Not `setState`. The tab is where the reader is, so it goes through
          // the Panel Engine — which validates the update, runs the pure
          // reducer, refuses any change to the Panel Key, and asks the
          // Navigation Adapter to replace the current history entry.
          const outcome = navigation.update(
            accountPanel,
            { type: "view", view: next },
            panel,
          );
          if (outcome.status === "rejected") {
            toast.error("The Canvas refused that view change", {
              description: outcome.reason,
            });
            return;
          }
          // An update says what a Panel now shows; it does not say the reader
          // has moved into it, and the package is right not to conflate the
          // two. Here they do coincide — somebody who changes a column's tab
          // is working in that column — so the application says so itself,
          // rather than leaving the Active Panel behind in a column the reader
          // has stopped reading.
          navigation.activate(panel);
        }}
      />

      {view === "overview" ? (
        <>
          <LedgerBlock>
            <BigFigure
              caption="Open pipeline"
              detail={`${open.length} open of ${deals.length} deals ever`}
              value={openPipelineValue(dataset, companyId)}
            />
          </LedgerBlock>
          <LedgerBlock title="The record">
            <FactTable
              items={[
                ["Owner", ownerName(dataset, company.ownerId)],
                ["Industry", company.industry],
                ["Headquarters", company.headquarters],
                ["Employees", company.employees.toLocaleString("en-GB")],
                ["Size", sizeBandLabels[company.sizeBand]],
                ["ARR band", arrBandLabels[company.arrBand]],
                ["Website", company.website],
              ]}
            />
          </LedgerBlock>
          <LedgerBlock title="Description">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {company.description}
            </p>
          </LedgerBlock>
        </>
      ) : null}

      {view === "people" ? (
        <LedgerBlock
          note="Each of these opens from the deepest column rather than from this one, so they line up instead of taking each other's place. That is `allow-many`: the Panel Kind has no semantic identity, so the Canvas never treats two of them as the same surface."
          title={`Buying group (${contacts.length})`}
        >
          <div className="flex flex-col">
            {contacts.map((contact) => (
              <LedgerRow
                key={contact.id}
                label={`Add ${contact.name} to the line-up`}
                lead={
                  <PlusIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                }
                onSelect={() =>
                  reportRefusal(
                    navigation.open(
                      personPanel,
                      { contactId: contact.id },
                      deepest ? { origin: deepest } : undefined,
                    ),
                  )
                }
                primary={contact.name}
                secondary={contact.title}
                trailing={
                  contact.isEconomicBuyer
                    ? "Buyer"
                    : contact.isChampion
                      ? "Champion"
                      : seniorityLabels[contact.seniority]
                }
              />
            ))}
          </div>
        </LedgerBlock>
      ) : null}

      {view === "deals" ? (
        <LedgerBlock
          note="Deals belong to the other Canvas. Each of these is a deep link into the Pipeline's own Navigation Parameter — two URL-owning Workspaces in one application, each with a namespace of its own."
          title={`Deals (${deals.length})`}
        >
          <ul className="flex flex-col">
            {deals.map((deal: Deal) => (
              <li
                className="border-b border-border/70 last:border-b-0"
                key={deal.id}
              >
                <Link
                  className="flex items-center gap-2.5 py-2 transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  href={pipelineDeepLink({ kind: "deal", id: deal.id })}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[0.8125rem] font-medium">
                      {deal.title}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {pipelineStageLabels[deal.stage]} · closes{" "}
                      {formatRelativeDate(deal.expectedCloseDate)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium" data-numeric>
                    {formatMoney(dealValue(dataset, deal), { compact: true })}
                  </span>
                  <ExternalLinkIcon
                    aria-hidden="true"
                    className="size-3 shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </LedgerBlock>
      ) : null}

      {view === "signals" ? (
        <LedgerBlock title={`Recent activity (${activities.length})`}>
          <ActivityTimeline
            activities={activities}
            dataset={dataset}
            emptyMessage="Nothing has been logged against this account yet."
          />
        </LedgerBlock>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Person Panel — several at once
 * -------------------------------------------------------------------------- */

function PersonPanel({
  descriptor,
}: CanvasPanelRenderProps<PersonInput, "person">) {
  const { contactId } = descriptor;
  const navigation = BookCanvas.useNavigation();
  const dataset = useBook();
  const heading = useRef<HTMLHeadingElement>(null);
  const contact = getContact(dataset, contactId);
  const company = contact ? getCompany(dataset, contact.companyId) : undefined;

  BookCanvas.useLifecycle({ ...settled, initialFocus: heading });

  BookCanvas.useContextSignal(
    useMemo(
      (): BookSignal => ({
        what: "Person",
        headline: contact?.name ?? "Person",
        facts: [
          ["Role", contact ? seniorityLabels[contact.seniority] : "—"],
          ["Account", company?.name ?? "—"],
        ],
        note: "`allow-many`. Open three colleagues and you get three columns — and the account behind them is `reuse`, so going back to it activates the one already open rather than making a second.",
      }),
      [company?.name, contact],
    ),
  );

  if (!contact) return <MissingEntry headingRef={heading} what="person" />;

  const deals = dataset.deals.filter(
    (deal) => deal.primaryContactId === contactId,
  );
  const activities = activitiesForContact(dataset, contactId);

  return (
    <div className="flex flex-col">
      <LedgerHead
        eyebrow={company?.name ?? "Person"}
        headingRef={heading}
        meta={contact.title}
        title={contact.name}
      >
        <Tag>{seniorityLabels[contact.seniority]}</Tag>
        {contact.isEconomicBuyer ? <Tag tone="loud">Economic buyer</Tag> : null}
        {contact.isChampion ? <Tag tone="loud">Champion</Tag> : null}
      </LedgerHead>

      <LedgerBlock title="Reaching them">
        <FactTable
          items={[
            ["Email", contact.email],
            ["Phone", contact.phone],
          ]}
        />
      </LedgerBlock>

      {company ? (
        <LedgerBlock
          note="The account is `reuse`d: if it is already open behind you, this activates it and leaves your line-up exactly where it is."
          title="Account"
        >
          <LedgerRow
            label={`Go to the account ${company.name}`}
            lead={<HealthMark health={company.health} />}
            onSelect={() =>
              reportRefusal(
                navigation.open(accountPanel, {
                  companyId: company.id,
                  view: "people",
                }),
              )
            }
            primary={company.name}
            secondary={accountLine(company)}
            trailing="Account"
          />
        </LedgerBlock>
      ) : null}

      <LedgerBlock title={`Deals they lead (${deals.length})`}>
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deal names this person as its primary contact.
          </p>
        ) : (
          <ul className="flex flex-col">
            {deals.map((deal) => (
              <li
                className="border-b border-border/70 last:border-b-0"
                key={deal.id}
              >
                <Link
                  className="flex items-center gap-2.5 py-2 transition-colors hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  href={pipelineDeepLink({ kind: "deal", id: deal.id })}
                >
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
                    {deal.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {pipelineStageLabels[deal.stage]}
                  </span>
                  <ExternalLinkIcon
                    aria-hidden="true"
                    className="size-3 shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </LedgerBlock>

      <LedgerBlock title={`Logged with them (${activities.length})`}>
        <ActivityTimeline
          activities={activities}
          dataset={dataset}
          emptyMessage="Nothing has been logged with this person yet."
        />
      </LedgerBlock>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Reassign Panel — the write the Canvas will not commit over
 * -------------------------------------------------------------------------- */

function ReassignPanel({
  descriptor,
}: CanvasPanelRenderProps<ReassignInput, "reassign">) {
  const { companyIds } = descriptor;
  const navigation = BookCanvas.useNavigation();
  const dataset = useBook();
  const heading = useRef<HTMLHeadingElement>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const chosen = ownerId !== null && !applied;

  const apply = async () => {
    if (ownerId === null || applying) return;
    setApplying(true);
    try {
      await bookRoundTrip();
      reassignAccounts(companyIds, ownerId);
      setApplied(true);
      toast.success(
        `${companyIds.length} account${companyIds.length === 1 ? "" : "s"} moved to ${ownerName(dataset, ownerId)}`,
      );
    } finally {
      setApplying(false);
    }
  };

  /**
   * The one Panel in this application that can refuse a transition outright.
   *
   * While the write is outstanding the guard returns `block`, and the Canvas
   * will not commit any change that would remove this Panel — not a close, not
   * a Branch Replacement from the table, not a Back. `dirty` has to be true for
   * the guard to be consulted at all, which is why it covers the write as well
   * as the unapplied choice; the package's own README calls that out as a wart
   * it intends to split.
   */
  BookCanvas.useLifecycle({
    dirty: applying || chosen,
    dirtyLabel: applying ? "Writing" : "Not applied",
    guard: (): GuardOutcome =>
      applying
        ? {
            status: "block",
            reason:
              "Meridian is writing this reassignment. Closing now could leave half the accounts moved.",
          }
        : chosen
          ? {
              status: "confirm",
              message: `Apply the move of ${companyIds.length} account${companyIds.length === 1 ? "" : "s"} before leaving?`,
            }
          : { status: "allow" },
    save: async () => {
      await apply();
    },
    discard: async () => {
      setOwnerId(null);
    },
    initialFocus: heading,
  });

  BookCanvas.useContextSignal(
    useMemo(
      (): BookSignal => ({
        what: "Reassignment",
        headline: `${companyIds.length} account${companyIds.length === 1 ? "" : "s"}`,
        facts: [
          ["To", ownerId === null ? "Not chosen" : ownerName(dataset, ownerId)],
          ["State", applying ? "Writing" : applied ? "Applied" : "Proposed"],
        ],
        note: "A Panel whose descriptor is a set rather than one record's id. While the write is in flight its guard returns `block`, and every command that would remove it is refused rather than queued.",
      }),
      [applied, applying, companyIds.length, dataset, ownerId],
    ),
  );

  const companies = companyIds
    .map((companyId) => getCompany(dataset, companyId))
    .filter((company) => company !== undefined);

  return (
    <div className="flex flex-col">
      <LedgerHead
        eyebrow="Proposed change"
        headingRef={heading}
        meta="Nothing is written until you apply it. A proposal is not somewhere anyone can be sent, so this column is transient and never reaches the address bar."
        title={
          companyIds.length === 1
            ? "Reassign 1 account"
            : `Reassign ${companyIds.length} accounts`
        }
      />

      <LedgerBlock title="Moving">
        <ul className="flex flex-col">
          {companies.map((company) => (
            <li
              className="flex items-center gap-2 border-b border-dotted border-border/70 py-1.5 text-[0.8125rem] last:border-b-0"
              key={company.id}
            >
              <HealthMark health={company.health} />
              <span className="min-w-0 flex-1 truncate">{company.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {ownerName(dataset, company.ownerId)}
              </span>
            </li>
          ))}
        </ul>
      </LedgerBlock>

      <LedgerBlock title="To">
        <div className="flex flex-col gap-1">
          {dataset.owners.map((owner: Owner) => (
            <LedgerRow
              key={owner.id}
              label={`Move them to ${owner.name}`}
              lead={
                <span
                  aria-hidden="true"
                  className="grid size-5 shrink-0 place-items-center rounded-[3px] bg-secondary text-[0.625rem] font-semibold text-secondary-foreground"
                >
                  {owner.initials}
                </span>
              }
              onSelect={() => {
                if (applying || applied) return;
                setOwnerId(owner.id);
              }}
              primary={owner.name}
              secondary={`${owner.title} · ${regionLabels[owner.region]}`}
              selected={owner.id === ownerId}
            />
          ))}
        </div>
      </LedgerBlock>

      <LedgerBlock>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-8 rounded-[4px]"
            disabled={ownerId === null || applying || applied}
            onClick={() => void apply()}
            size="sm"
          >
            {applying ? "Writing…" : "Apply"}
          </Button>
          <Button
            className="h-8 rounded-[4px]"
            onClick={() => reportRefusal(navigation.close())}
            size="sm"
            variant="outline"
          >
            Close this column
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {applying
            ? "Writing. Try closing this column, or clicking a row in the table — the Canvas will refuse both until it settles."
            : applied
              ? "Written. The guard has gone quiet, so this column closes like any other."
              : chosen
                ? "Chosen but not applied. Closing now asks whether to apply first — that is a Guarded Transition, and the dialog belongs to the package."
                : "Choose an owner. Nothing is guarded until there is something to lose."}
        </p>
      </LedgerBlock>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  The Bound Canvas Module
 * -------------------------------------------------------------------------- */

export const BookCanvas = createCanvasModule({
  context: defineCanvasContext<BookSignal>(),
  root: bookRoot,
  panels: bookPanels,
  renderers: {
    book: BookRoot,
    peek: PeekPanel,
    account: AccountPanel,
    person: PersonPanel,
    reassign: ReassignPanel,
  },
});
