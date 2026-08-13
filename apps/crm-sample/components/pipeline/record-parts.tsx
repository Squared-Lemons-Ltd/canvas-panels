"use client";

/**
 * The presentational vocabulary of the pipeline Canvas.
 *
 * Nothing here knows what a Panel is. Every piece takes the domain records it
 * shows and, where it is a navigation affordance, the function to call — so a
 * deal card can be read, restyled and reasoned about without the Canvas, and
 * the Panel renderers stay about navigation rather than markup.
 */

import type { ReactNode, Ref } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type Activity,
  activityKindLabels,
  type Company,
  type Contact,
  type Deal,
  dealValue,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelativeDate,
  healthLabels,
  type MeridianDataset,
  type Owner,
  type PipelineStage,
  pipelineStageLabels,
  seniorityLabels,
} from "@/src/domain";

/** Stage colour is meaning, so it is never the only carrier of it. */
const stageTone: Readonly<Record<PipelineStage, string>> = Object.freeze({
  qualify: "bg-muted text-foreground",
  discovery: "bg-chart-2/18 text-foreground",
  proposal: "bg-warning/20 text-foreground",
  negotiation: "bg-primary/18 text-foreground",
  "closed-won": "bg-success/20 text-foreground",
  "closed-lost": "bg-destructive/15 text-foreground",
});

export function StageBadge({ stage }: Readonly<{ stage: PipelineStage }>) {
  return (
    <Badge variant="ghost" className={cn("border-border", stageTone[stage])}>
      {pipelineStageLabels[stage]}
    </Badge>
  );
}

export function HealthBadge({ company }: Readonly<{ company: Company }>) {
  const tone =
    company.health === "at-risk"
      ? "bg-destructive/15"
      : company.health === "watch"
        ? "bg-warning/20"
        : company.health === "strong"
          ? "bg-success/20"
          : "bg-muted";
  return (
    <Badge variant="ghost" className={cn("border-border", tone)}>
      Health: {healthLabels[company.health]}
    </Badge>
  );
}

export function OwnerChip({
  owner,
  className,
}: Readonly<{ owner: Owner | undefined; className?: string }>) {
  if (!owner) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[0.625rem] font-semibold text-secondary-foreground"
      >
        {owner.initials}
      </span>
      <span className="truncate">{owner.name}</span>
    </span>
  );
}

/**
 * The panel's own opening heading, and the element the Canvas hands focus to
 * when the Panel becomes active. It is a real heading rather than a focusable
 * wrapper so that landing on it says where you have arrived.
 */
export function PanelHero({
  eyebrow,
  title,
  subtitle,
  headingRef,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}>) {
  return (
    <div className="flex flex-col gap-2 border-b border-border px-5 py-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {eyebrow}
      </span>
      {/*
        The Canvas hands focus here when the Panel becomes active, so the ring
        is deliberately kept: it is how a keyboard reader sees where they
        arrived. `focus-visible` means a mouse click never shows it.
      */}
      <h3
        className="rounded-sm text-lg leading-tight font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        ref={headingRef}
        tabIndex={-1}
      >
        {title}
      </h3>
      {subtitle ? (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
      {children ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function PanelSection({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description?: string;
  children: ReactNode;
}>) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0">
      <h4 className="text-sm font-semibold">{title}</h4>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </section>
  );
}

export function MetaList({
  items,
}: Readonly<{ items: readonly (readonly [string, ReactNode])[] }>) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      {items.map(([term, value]) => (
        <div className="flex min-w-0 flex-col gap-0.5" key={term}>
          <dt className="text-xs text-muted-foreground">{term}</dt>
          <dd className="font-medium break-words" data-numeric>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * How the tether layer finds the row a Panel was opened from.
 *
 * Every control that opens a record carries that record's id, and nothing else
 * has to be arranged: the tether layer knows which record the next Panel shows,
 * so naming the record on the control is enough for it to find the one line on
 * the page that produced the Panel beside it.
 *
 * The lit state is written back onto the same element as an attribute, and is
 * important because it has to survive the row's own hover — a reader pointing
 * at the row they came from must not see the connection weaken under the
 * cursor.
 */
export const litRow =
  "data-[meridian-tethered]:border-primary! data-[meridian-tethered]:bg-primary/10!";

/** A row that opens another record. The whole row is the control. */
export function RecordRow({
  label,
  primary,
  recordId,
  secondary,
  trailing,
  onSelect,
}: Readonly<{
  label: string;
  primary: ReactNode;
  /** The record this row opens, for the tether layer to find it by. */
  recordId: string;
  secondary?: ReactNode;
  trailing?: ReactNode;
  onSelect: () => void;
}>) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/60 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        litRow,
      )}
      data-meridian-record={recordId}
      onClick={onSelect}
      type="button"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{primary}</span>
        {secondary ? (
          <span className="truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-right text-xs text-muted-foreground">
          {trailing}
        </span>
      ) : null}
    </button>
  );
}

/**
 * One deal on the board. It carries the four things a rep checks before
 * deciding whether to open it: what it is worth, who owns it, how long it has
 * been sitting, and what happens next.
 */
export function DealCard({
  dataset,
  deal,
  company,
  owner,
  onSelect,
}: Readonly<{
  dataset: MeridianDataset;
  deal: Deal;
  company: Company | undefined;
  owner: Owner | undefined;
  onSelect: () => void;
}>) {
  const value = dealValue(dataset, deal);
  const stale = deal.daysInStage >= 28;
  return (
    <button
      aria-label={`${deal.title}, ${company?.name ?? "unknown account"}, ${formatMoney(value)}, ${deal.daysInStage} days in ${pipelineStageLabels[deal.stage]}`}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        litRow,
      )}
      data-meridian-record={deal.id}
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm leading-snug font-medium">{deal.title}</span>
        <span className="shrink-0 text-sm font-semibold" data-numeric>
          {formatMoney(value, { compact: true })}
        </span>
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {company?.name}
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <OwnerChip owner={owner} />
        {/*
          A deal that has sat too long is flagged by weight and a tint, never by
          colour alone — and the text stays `foreground` so the smallest type on
          the card is not the least readable thing on it.
        */}
        <span
          data-numeric
          className={cn(
            stale && "rounded bg-warning/25 px-1 font-semibold text-foreground",
          )}
        >
          {deal.daysInStage}d in stage
        </span>
        <span data-numeric>{deal.probability}%</span>
      </span>
      {deal.nextStep ? (
        <span className="line-clamp-2 text-xs text-foreground/80">
          <span className="font-medium">Next: </span>
          {deal.nextStep}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground italic">
          No next step recorded
        </span>
      )}
    </button>
  );
}

const activityTone: Readonly<Record<Activity["kind"], string>> = Object.freeze({
  call: "bg-chart-2/20",
  email: "bg-chart-5/18",
  meeting: "bg-primary/18",
  note: "bg-muted",
});

export function ActivityTimeline({
  activities,
  dataset,
  emptyMessage,
}: Readonly<{
  activities: readonly Activity[];
  dataset: MeridianDataset;
  emptyMessage: string;
}>) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {activities.map((activity) => {
        const owner = dataset.owners.find(({ id }) => id === activity.ownerId);
        return (
          <li className="flex flex-col gap-1" key={activity.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="ghost"
                className={cn("border-border", activityTone[activity.kind])}
              >
                {activityKindLabels[activity.kind]}
              </Badge>
              <span className="text-sm font-medium">{activity.subject}</span>
            </div>
            <p className="text-sm text-muted-foreground">{activity.body}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(activity.occurredAt)}
              {owner ? ` · ${owner.name}` : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function ContactRoleBadges({ contact }: Readonly<{ contact: Contact }>) {
  return (
    <>
      <Badge variant="outline">{seniorityLabels[contact.seniority]}</Badge>
      {contact.isEconomicBuyer ? (
        <Badge variant="ghost" className="border-border bg-primary/18">
          Economic buyer
        </Badge>
      ) : null}
      {contact.isChampion ? (
        <Badge variant="ghost" className="border-border bg-success/20">
          Champion
        </Badge>
      ) : null}
    </>
  );
}

/** `2 Oct 2026 (In 2 months)` — the date and the distance, in one phrase. */
export function expectedClose(deal: Deal): string {
  return `${formatDate(deal.expectedCloseDate)} (${formatRelativeDate(deal.expectedCloseDate)})`;
}

/**
 * What a Panel shows when the record its descriptor names has gone. A deep
 * link can always outlive the thing it points at.
 */
export function MissingRecord({
  headingRef,
  what,
}: Readonly<{ headingRef?: Ref<HTMLHeadingElement>; what: string }>) {
  return (
    <div className="flex flex-col gap-3 px-5 py-6">
      <h3 className="text-lg font-semibold" ref={headingRef} tabIndex={-1}>
        This {what} is no longer in Meridian
      </h3>
      <p className="text-sm text-muted-foreground">
        Close this Panel to carry on from the board.
      </p>
    </div>
  );
}
