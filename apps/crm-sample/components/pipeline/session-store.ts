"use client";

/**
 * The session's working copy of the Meridian dataset.
 *
 * Meridian has no backend, but the demo still has to behave like something
 * with one: two Panels can show the same deal, an edit in one has to become
 * visible in the other, and a colleague's change has to arrive from outside
 * the Panel that receives it. This module is that stand-in — an in-memory
 * overlay on the fixed dataset that lasts as long as the tab.
 *
 * It publishes nothing. Announcing a change is the Resource Exchange's job,
 * and keeping the two separate is what lets a Panel hold an announcement it is
 * not ready for without the underlying record being any less written.
 */

import {
  type Deal,
  loadMeridianDataset,
  type MeridianDataset,
  meridianToday,
  type PipelineStage,
} from "@/src/domain";

const base = loadMeridianDataset();

/**
 * The probability a stage carries when a deal is moved into it. Real CRMs
 * derive this from the stage rather than asking, and the demo does the same so
 * a moved deal's weighted forecast is not left describing where it used to be.
 */
const stageProbability: Readonly<Record<PipelineStage, number>> = Object.freeze(
  {
    qualify: 15,
    discovery: 30,
    proposal: 45,
    negotiation: 70,
    "closed-won": 100,
    "closed-lost": 0,
  },
);

const overrides = new Map<string, Deal>();
const listeners = new Set<() => void>();
let current: MeridianDataset = base;

function republish(): void {
  current = Object.freeze({
    ...base,
    deals: Object.freeze(
      base.deals.map((deal) => overrides.get(deal.id) ?? deal),
    ),
  });
  for (const listener of listeners) listener();
}

/** The dataset as it stands now, with every edit made this session applied. */
export function meridianSnapshot(): MeridianDataset {
  return current;
}

export function subscribeToMeridian(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readDeal(dealId: string): Deal | undefined {
  return current.deals.find((deal) => deal.id === dealId);
}

export type DealDraft = Readonly<{ notes: string; nextStep: string }>;

/** Writes what a person typed. An empty next step means there is not one. */
export function writeDealDraft(dealId: string, draft: DealDraft): void {
  const deal = readDeal(dealId);
  if (!deal) return;
  const nextStep = draft.nextStep.trim();
  overrides.set(
    dealId,
    Object.freeze({
      ...deal,
      notes: draft.notes,
      nextStep: nextStep === "" ? null : nextStep,
    }),
  );
  republish();
}

/**
 * Moves a deal, the way a colleague dragging a card across the board would.
 * The stage clock restarts, because the age a board shows is age *in stage*.
 */
export function moveDealStage(
  dealId: string,
  stage: PipelineStage,
  nextStep?: string,
): void {
  const deal = readDeal(dealId);
  if (!deal) return;
  overrides.set(
    dealId,
    Object.freeze({
      ...deal,
      stage,
      probability: stageProbability[stage],
      stageEnteredOn: meridianToday,
      daysInStage: 0,
      ...(nextStep === undefined ? {} : { nextStep }),
    }),
  );
  republish();
}

/** Puts a deal back exactly as the dataset ships it, so a demo can be re-run. */
export function resetDeal(dealId: string): void {
  if (!overrides.delete(dealId)) return;
  republish();
}

export function setDealNextStep(dealId: string, nextStep: string): void {
  const deal = readDeal(dealId);
  if (!deal) return;
  overrides.set(dealId, Object.freeze({ ...deal, nextStep }));
  republish();
}

/** The Resource Keys the pipeline publishes on. Opaque to the package. */
export const dealKey = (dealId: string) => `deals/${dealId}`;
export const companyKey = (companyId: string) => `companies/${companyId}`;
export const contactKey = (contactId: string) => `contacts/${contactId}`;

/**
 * Stands in for the round trip a real CRM would make, so "saving" and
 * "re-reading" are states a visitor can actually see rather than instants.
 */
export function serviceRoundTrip(): Promise<void> {
  return new Promise((settle) => setTimeout(settle, 260));
}
