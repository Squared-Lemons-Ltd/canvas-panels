/**
 * The Panel Registry for the territory book.
 *
 * Three nested Kinds, and the nesting is the whole design: a territory holds
 * accounts, an account holds deals, and each Panel subscribes to a Resource Key
 * that spells that relationship out. See `territory-keys.ts`.
 *
 * Every Kind is `reuse`d on the record it shows, because a cascade that opened
 * a second copy of a Panel it had just refreshed would be arguing with itself.
 */

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "@squared-lemons-ltd/canvas-panels/core";
import { applyCanvasNavigationParameter } from "@squared-lemons-ltd/canvas-panels/next/server";

import {
  getCompany,
  getDeal,
  getOwner,
  loadMeridianDataset,
} from "@/src/domain";

const dataset = loadMeridianDataset();

/** The fifth History Namespace in this application. */
export const territoryParameterName = "territory";

export type TerritoryInput = Readonly<{ ownerId: string }>;
export type AccountInput = Readonly<{ companyId: string }>;
export type DealInput = Readonly<{ dealId: string }>;

type TerritoryDescriptor = { ownerId: string };
type AccountDescriptor = { companyId: string };
type DealDescriptor = { dealId: string };

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

export const territoriesRoot = defineRootPanel({
  kind: "territories",
  title: "Territories",
});

export const territoryPanel = definePanel({
  kind: "territory",
  deduplication: "reuse",
  key: ({ ownerId }: TerritoryInput) => ownerId,
  title: ({ ownerId }) => getOwner(dataset, ownerId)?.name ?? "Territory",
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ ownerId }) => ({ ownerId }),
      validate: (descriptor): descriptor is TerritoryDescriptor =>
        stringField(descriptor, "ownerId") !== null,
      decode: ({ ownerId }) => ({ ownerId }),
      migrations: [],
    },
    restore: ({ ownerId }) =>
      Promise.resolve({
        status: getOwner(dataset, ownerId) ? "available" : "unavailable",
      }),
  },
});

export const accountPanel = definePanel({
  kind: "account",
  deduplication: "reuse",
  key: ({ companyId }: AccountInput) => companyId,
  title: ({ companyId }) => getCompany(dataset, companyId)?.name ?? "Account",
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ companyId }) => ({ companyId }),
      validate: (descriptor): descriptor is AccountDescriptor =>
        stringField(descriptor, "companyId") !== null,
      decode: ({ companyId }) => ({ companyId }),
      migrations: [],
    },
    restore: ({ companyId }) =>
      Promise.resolve({
        status: getCompany(dataset, companyId) ? "available" : "unavailable",
      }),
  },
});

export const dealPanel = definePanel({
  kind: "deal",
  deduplication: "reuse",
  key: ({ dealId }: DealInput) => dealId,
  title: ({ dealId }) => getDeal(dataset, dealId)?.title ?? "Deal",
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ dealId }) => ({ dealId }),
      validate: (descriptor): descriptor is DealDescriptor =>
        stringField(descriptor, "dealId") !== null,
      decode: ({ dealId }) => ({ dealId }),
      migrations: [],
    },
    restore: ({ dealId }) =>
      Promise.resolve({
        status: getDeal(dataset, dealId) ? "available" : "unavailable",
      }),
  },
});

export const territoryPanels = [
  territoryPanel,
  accountPanel,
  dealPanel,
] as const;

/**
 * The stack this section opens on: a territory, an account in it, and a deal on
 * that account.
 *
 * Three deep is the minimum that can show anything. A cascade needs something
 * to cascade *through*: with one Panel open there is nothing to tell, and with
 * two there is no way to see a change stop at the right depth.
 */
const openingChain: Readonly<{
  ownerId: string;
  companyId: string;
  dealId: string;
}> | null = (() => {
  for (const owner of dataset.owners) {
    const company = dataset.companies.find((it) => it.ownerId === owner.id);
    if (!company) continue;
    const deal = dataset.deals.find((it) => it.companyId === company.id);
    if (!deal) continue;
    return { ownerId: owner.id, companyId: company.id, dealId: deal.id };
  }
  return null;
})();

export const openingTerritoryDocument: string | null = (() => {
  if (!openingChain) return null;
  const engine = createPanelEngine({
    root: territoriesRoot,
    panels: territoryPanels,
  });
  const references = [
    territoryPanel.reference({ ownerId: openingChain.ownerId }),
    accountPanel.reference({ companyId: openingChain.companyId }),
    dealPanel.reference({ dealId: openingChain.dealId }),
  ];
  const restored = engine.restoreStack({ references });
  if (restored.status !== "restored") return null;
  return engine.encodeNavigationDocument();
})();

export function territoryDeepLink(ownerId: string): string {
  const engine = createPanelEngine({
    root: territoriesRoot,
    panels: territoryPanels,
  });
  const root = engine.getSnapshot().panels[0];
  if (!root) return "/territories";
  const opened = engine.open({
    originId: root.instanceId,
    panel: territoryPanel.reference({ ownerId }),
  });
  if (opened.status !== "opened" && opened.status !== "reused") {
    return "/territories";
  }
  const search = applyCanvasNavigationParameter(
    new URLSearchParams(),
    engine.encodeNavigationDocument(),
    { parameterName: territoryParameterName },
  );
  return `/territories?${search.toString()}`;
}
