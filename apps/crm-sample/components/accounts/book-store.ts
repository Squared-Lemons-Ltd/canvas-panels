"use client";

/**
 * The session's working copy of the account book.
 *
 * Deliberately simpler than the pipeline's `session-store`, and the difference
 * is the point. The pipeline has Panels holding drafts, so a change made in one
 * must not overwrite what somebody is typing in another, and that needs the
 * Resource Exchange to announce it and each Panel to decide for itself.
 *
 * Nothing on the account book holds a draft except the reassignment Panel, and
 * that Panel is the only writer. So every other Panel can simply read the live
 * store through `useSyncExternalStore` and re-render — no invalidation, no
 * subscription, no per-Panel decision. A Canvas does not oblige an application
 * to use the extensions, and this one shows what it costs not to: nothing.
 */

import {
  type Company,
  loadMeridianDataset,
  type MeridianDataset,
} from "@/src/domain";

const base = loadMeridianDataset();

/** companyId → the owner it has been reassigned to this session. */
const reassignments = new Map<string, string>();
const listeners = new Set<() => void>();
let current: MeridianDataset = base;

function republish(): void {
  current = Object.freeze({
    ...base,
    companies: Object.freeze(
      base.companies.map((company): Company => {
        const ownerId = reassignments.get(company.id);
        return ownerId === undefined || ownerId === company.ownerId
          ? company
          : Object.freeze({ ...company, ownerId });
      }),
    ),
  });
  for (const listener of listeners) listener();
}

/** The book as it stands now, with every reassignment made this session. */
export function bookSnapshot(): MeridianDataset {
  return current;
}

export function subscribeToBook(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reassignAccounts(
  companyIds: readonly string[],
  ownerId: string,
): void {
  for (const companyId of companyIds) reassignments.set(companyId, ownerId);
  republish();
}

/** Which accounts this session has moved, so the book can offer to undo it. */
export function reassignedAccountIds(): readonly string[] {
  return Object.freeze(
    [...reassignments.keys()].filter((companyId) => {
      const original = base.companies.find(({ id }) => id === companyId);
      return (
        original !== undefined &&
        reassignments.get(companyId) !== original.ownerId
      );
    }),
  );
}

export function resetBook(): void {
  if (reassignments.size === 0) return;
  reassignments.clear();
  republish();
}

/**
 * Stands in for the round trip a real CRM would make. It is deliberately slow
 * enough to be seen: the reassignment Panel *blocks* transitions while it is
 * outstanding, and a block nobody can observe demonstrates nothing.
 */
export function bookRoundTrip(): Promise<void> {
  return new Promise((settle) => setTimeout(settle, 900));
}
