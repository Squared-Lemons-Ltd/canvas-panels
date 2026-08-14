"use client";

/**
 * The presentational vocabulary of the account book.
 *
 * Nothing here knows what a Panel is — the same discipline as the pipeline's
 * `record-parts`, and for the same reason. What is different is the idiom. The
 * pipeline draws records as rounded cards floating in a gutter; the book draws
 * them as a ledger: square, flush, hairline-ruled, figures in tabular columns.
 *
 * That contrast is deliberate and it is the point of this whole section. Both
 * surfaces are the same Canvas Workspace with the same Panel Engine underneath;
 * everything that looks different about them is `--canvas-*` tokens, the
 * documented data attributes, and what the application chooses to render.
 */

import type { ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";
import {
  type Company,
  type HealthSignal,
  healthLabels,
  type Money,
  formatMoney,
} from "@/src/domain";

/* -------------------------------------------------------------------------- *
 *  Marks
 * -------------------------------------------------------------------------- */

const healthTone: Readonly<Record<HealthSignal, string>> = Object.freeze({
  strong: "bg-success",
  steady: "bg-chart-2",
  watch: "bg-warning",
  "at-risk": "bg-destructive",
});

/**
 * Health as a single square. Colour alone never carries it: the square is
 * always accompanied by the word, either beside it or as its accessible name.
 */
export function HealthMark({
  health,
  labelled = false,
}: Readonly<{ health: HealthSignal; labelled?: boolean }>) {
  const mark = (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-[1px]", healthTone[health])}
    />
  );
  if (!labelled) {
    return (
      <span className="inline-flex items-center">
        {mark}
        <span className="sr-only">{healthLabels[health]}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {mark}
      <span className="text-muted-foreground">{healthLabels[health]}</span>
    </span>
  );
}

/** A flat, square tag. The book has no pills. */
export function Tag({
  children,
  tone = "quiet",
}: Readonly<{ children: ReactNode; tone?: "quiet" | "loud" }>) {
  return (
    <span
      data-meridian-tag=""
      className={cn(
        "inline-flex items-center rounded-[3px] border px-1.5 py-px text-[0.6875rem] leading-4 font-medium tracking-wide uppercase",
        tone === "loud"
          ? "border-primary/40 bg-primary/12 text-foreground"
          : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/**
 * A proportion, drawn. Never the only carrier of the number beside it — the
 * figure is always written out too, because a bar cannot be read aloud.
 */
export function Proportion({
  of,
  value,
}: Readonly<{ of: number; value: number }>) {
  const share = of <= 0 ? 0 : Math.min(1, Math.max(0, value / of));
  return (
    <span
      aria-hidden="true"
      className="block h-1 w-full overflow-hidden rounded-[1px] bg-border"
    >
      <span
        className="block h-full bg-primary/70"
        style={{ inlineSize: `${Math.round(share * 100)}%` }}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- *
 *  Panel structure
 * -------------------------------------------------------------------------- */

/**
 * A Panel's opening block, and the element the Canvas hands focus to when the
 * Panel becomes active.
 *
 * A real heading rather than a focusable wrapper, so landing on it says where
 * you have arrived. The focus ring is deliberately kept — it is how a keyboard
 * reader sees the Canvas move them.
 */
export function LedgerHead({
  eyebrow,
  title,
  headingRef,
  meta,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  headingRef?: Ref<HTMLHeadingElement>;
  meta?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <div
      className="flex flex-col gap-1.5 border-b border-border px-4 py-3.5"
      data-meridian-hero=""
    >
      <span
        className="text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
        data-meridian-eyebrow=""
      >
        {eyebrow}
      </span>
      <h3
        className="rounded-[2px] text-[1.0625rem] leading-tight font-semibold tracking-tight focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        data-meridian-title=""
        ref={headingRef}
        tabIndex={-1}
      >
        {title}
      </h3>
      {meta ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{meta}</p>
      ) : null}
      {children ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A ruled block. Sections butt against one another; no cards, no gutters. */
export function LedgerBlock({
  title,
  note,
  actions,
  children,
}: Readonly<{
  title?: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section
      className="flex flex-col gap-2.5 border-b border-border px-4 py-3.5 last:border-b-0"
      data-meridian-section=""
    >
      {title ? (
        <div className="flex items-baseline justify-between gap-3">
          <h4
            className="text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
            data-meridian-section-title=""
          >
            {title}
          </h4>
          {actions}
        </div>
      ) : null}
      {note ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Figures, in the shape a ledger states them: term on the left, value hard
 * right, a dotted leader joining the two so the eye does not lose the line.
 */
export function FactTable({
  items,
}: Readonly<{ items: readonly (readonly [string, ReactNode])[] }>) {
  return (
    <dl className="flex flex-col text-sm" data-meridian-facts="">
      {items.map(([term, value]) => (
        <div
          className="flex items-baseline gap-2 border-b border-dotted border-border/70 py-1.5 last:border-b-0"
          key={term}
        >
          <dt className="shrink-0 text-xs text-muted-foreground">{term}</dt>
          <span aria-hidden="true" className="min-w-4 flex-1" />
          <dd
            className="min-w-0 text-right text-[0.8125rem] font-medium break-words"
            data-numeric
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A dense row that opens something. The whole row is the control.
 *
 * The trailing slot is where the figure goes, so a column of these lines its
 * numbers up down the right-hand edge whatever the names on the left are doing.
 */
export function LedgerRow({
  label,
  lead,
  primary,
  secondary,
  trailing,
  selected = false,
  onSelect,
}: Readonly<{
  label: string;
  lead?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onSelect: () => void;
}>) {
  return (
    <button
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex w-full items-center gap-2.5 border-b border-border/70 px-1 py-2 text-left transition-colors last:border-b-0",
        "hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        selected && "bg-accent/70",
      )}
      data-meridian-tile=""
      onClick={onSelect}
      type="button"
    >
      {lead}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[0.8125rem] leading-snug font-medium">
          {primary}
        </span>
        {secondary ? (
          <span className="truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span
          className="shrink-0 text-right text-xs text-muted-foreground"
          data-numeric
        >
          {trailing}
        </span>
      ) : null}
    </button>
  );
}

/** The headline figure a Panel leads with. */
export function BigFigure({
  caption,
  value,
  detail,
}: Readonly<{ caption: string; value: Money; detail?: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {caption}
      </span>
      <span className="text-2xl leading-none font-semibold" data-numeric>
        {formatMoney(value)}
      </span>
      {detail ? (
        <span className="text-xs text-muted-foreground">{detail}</span>
      ) : null}
    </div>
  );
}

/** What a Panel shows when the record its descriptor names has gone. */
export function MissingEntry({
  headingRef,
  what,
}: Readonly<{ headingRef?: Ref<HTMLHeadingElement>; what: string }>) {
  return (
    <div className="flex flex-col gap-2 px-4 py-5">
      <h3 className="text-base font-semibold" ref={headingRef} tabIndex={-1}>
        This {what} is no longer in the book
      </h3>
      <p className="text-sm text-muted-foreground">
        Close this column to carry on from the table.
      </p>
    </div>
  );
}

/** The line an account is described by, wherever one is needed. */
export function accountLine(company: Company): string {
  return `${company.industry} · ${company.headquarters}`;
}
