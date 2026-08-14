"use client";

/**
 * The session's working copy of the territory book.
 *
 * Deliberately *not* reactive. Nothing here notifies anybody: a write bumps a
 * revision and returns, and the only thing that tells a Panel to look again is
 * the Resource Exchange. Keeping the two apart is what makes the cascade
 * legible — a Panel that refreshes did so because it was told, not because a
 * store pushed at it, and a Panel that did not refresh was not told.
 *
 * It is also what lets a Panel hold an announcement it is not ready for without
 * the underlying record being any less written.
 */

import {
  type Company,
  type Deal,
  loadMeridianDataset,
  type Owner,
} from "@/src/domain";

const dataset = loadMeridianDataset();

/** What an editor at each level may change, and what everything reads back. */
export type TerritoryRecord = Readonly<{
  owner: Owner;
  label: string;
  revision: number;
}>;

export type AccountRecord = Readonly<{
  company: Company;
  status: string;
  revision: number;
}>;

export type DealRecord = Readonly<{
  deal: Deal;
  nextStep: string;
  revision: number;
}>;

const territoryLabels = new Map<string, string>();
const accountStatuses = new Map<string, string>();
const dealNextSteps = new Map<string, string>();
const revisions = new Map<string, number>();

function bump(id: string): number {
  const next = (revisions.get(id) ?? 1) + 1;
  revisions.set(id, next);
  return next;
}

function revisionOf(id: string): number {
  return revisions.get(id) ?? 1;
}

const defaultLabels: Readonly<Record<string, string>> = Object.freeze({
  "north-america": "North America",
  "uk-ireland": "UK & Ireland",
  europe: "Europe",
  apac: "Asia-Pacific",
  global: "Strategic accounts",
});

export function readTerritory(ownerId: string): TerritoryRecord | undefined {
  const owner = dataset.owners.find(({ id }) => id === ownerId);
  if (!owner) return undefined;
  return Object.freeze({
    owner,
    label:
      territoryLabels.get(ownerId) ??
      defaultLabels[owner.region] ??
      owner.region,
    revision: revisionOf(ownerId),
  });
}

export function readAccount(companyId: string): AccountRecord | undefined {
  const company = dataset.companies.find(({ id }) => id === companyId);
  if (!company) return undefined;
  return Object.freeze({
    company,
    status: accountStatuses.get(companyId) ?? "Under review",
    revision: revisionOf(companyId),
  });
}

export function readDeal(dealId: string): DealRecord | undefined {
  const deal = dataset.deals.find(({ id }) => id === dealId);
  if (!deal) return undefined;
  return Object.freeze({
    deal,
    nextStep: dealNextSteps.get(dealId) ?? deal.nextStep ?? "",
    revision: revisionOf(dealId),
  });
}

export function writeTerritoryLabel(ownerId: string, label: string): number {
  territoryLabels.set(ownerId, label);
  return bump(ownerId);
}

export function writeAccountStatus(companyId: string, status: string): number {
  accountStatuses.set(companyId, status);
  return bump(companyId);
}

export function writeDealNextStep(dealId: string, nextStep: string): number {
  dealNextSteps.set(dealId, nextStep);
  return bump(dealId);
}

export function accountsInTerritory(ownerId: string): readonly Company[] {
  return Object.freeze(
    dataset.companies
      .filter((company) => company.ownerId === ownerId)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}

export function dealsOnAccount(companyId: string): readonly Deal[] {
  return Object.freeze(
    dataset.deals
      .filter((deal) => deal.companyId === companyId)
      .sort((a, b) => a.title.localeCompare(b.title)),
  );
}

/** Which territory an account sits in, so a Panel can build its own key. */
export function territoryOfAccount(companyId: string): string | undefined {
  return dataset.companies.find(({ id }) => id === companyId)?.ownerId;
}

export function accountOfDeal(dealId: string): string | undefined {
  return dataset.deals.find(({ id }) => id === dealId)?.companyId;
}

/**
 * Stands in for the round trip a real service would make. Long enough to be
 * seen: a cascade that completed before the eye reached it demonstrates
 * nothing.
 */
export function territoryRoundTrip(): Promise<void> {
  return new Promise((settle) => setTimeout(settle, 420));
}

export function resetTerritories(): void {
  territoryLabels.clear();
  accountStatuses.clear();
  dealNextSteps.clear();
  revisions.clear();
}
