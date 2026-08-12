/**
 * The Panel Registry for Meridian's pipeline Canvas.
 *
 * Every Panel here is persistent: its descriptor is nothing but the id of the
 * record it shows, which is exactly what makes a Panel Stack expressible as a
 * URL. The record itself is never encoded — a link that carried a copy of a
 * deal would go stale the moment someone edited it.
 *
 * Deals, accounts and contacts restore through a loader so that a link naming
 * a record that no longer exists is trimmed on arrival rather than opening a
 * Panel with nothing in it.
 */

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import {
  applyCanvasNavigationParameter,
  canvasNavigationParameterName,
} from "@squaredlemons/canvas-panels/next/server";

import {
  getCompany,
  getContact,
  getDeal,
  loadMeridianDataset,
  type PipelineStage,
  pipelineStageLabels,
} from "@/src/domain";

const dataset = loadMeridianDataset();

export type DealInput = Readonly<{ dealId: string }>;
export type CompanyInput = Readonly<{ companyId: string }>;
export type ContactInput = Readonly<{ contactId: string }>;
export type StageInput = Readonly<{ stage: PipelineStage }>;

type DealDescriptor = { dealId: string };
type CompanyDescriptor = { companyId: string };
type ContactDescriptor = { contactId: string };
type StageDescriptor = { stage: string };

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

/** The Panel Kinds a record link can name, in the order a stack grows. */
export const pipelineRoot = defineRootPanel({
  kind: "pipeline",
  title: "Pipeline",
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
    // Availability is decided against the dataset, not fetched: the demo has
    // no service, but a link to a deleted record must still degrade the same
    // way it would against one.
    restore: ({ dealId }) =>
      Promise.resolve({
        status: getDeal(dataset, dealId) ? "available" : "unavailable",
      }),
  },
});

export const companyPanel = definePanel({
  kind: "company",
  deduplication: "reuse",
  key: ({ companyId }: CompanyInput) => companyId,
  title: ({ companyId }) => getCompany(dataset, companyId)?.name ?? "Account",
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ companyId }) => ({ companyId }),
      validate: (descriptor): descriptor is CompanyDescriptor =>
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

export const contactPanel = definePanel({
  kind: "contact",
  deduplication: "reuse",
  key: ({ contactId }: ContactInput) => contactId,
  title: ({ contactId }) => getContact(dataset, contactId)?.name ?? "Contact",
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ contactId }) => ({ contactId }),
      validate: (descriptor): descriptor is ContactDescriptor =>
        stringField(descriptor, "contactId") !== null,
      decode: ({ contactId }) => ({ contactId }),
      migrations: [],
    },
    restore: ({ contactId }) =>
      Promise.resolve({
        status: getContact(dataset, contactId) ? "available" : "unavailable",
      }),
  },
});

export const stagePanel = definePanel({
  kind: "stage",
  deduplication: "reuse",
  key: ({ stage }: StageInput) => stage,
  title: ({ stage }) => pipelineStageLabels[stage],
  persistence: {
    mode: "navigation",
    version: 1,
    codec: {
      encode: ({ stage }) => ({ stage }),
      validate: (descriptor): descriptor is StageDescriptor => {
        const stage = stringField(descriptor, "stage");
        return stage !== null && stage in pipelineStageLabels;
      },
      decode: ({ stage }) => ({ stage: stage as PipelineStage }),
      migrations: [],
    },
  },
});

export const pipelinePanels = [
  dealPanel,
  companyPanel,
  contactPanel,
  stagePanel,
] as const;

export type PipelinePanels = typeof pipelinePanels;

/**
 * One record, named the way everything outside the Panel Registry names one.
 *
 * The palette, the deep-link builder and the handle the overlay routes through
 * all need to say "this deal" or "this account" without repeating which Panel
 * Kind and which descriptor field that means. This is that word, and
 * {@link referenceFor} is the single place the mapping lives.
 */
export type RecordRef =
  | Readonly<{ kind: "deal"; id: string }>
  | Readonly<{ kind: "company"; id: string }>
  | Readonly<{ kind: "contact"; id: string }>;

export function referenceFor(record: RecordRef) {
  switch (record.kind) {
    case "deal":
      return dealPanel.reference({ dealId: record.id });
    case "company":
      return companyPanel.reference({ companyId: record.id });
    case "contact":
      return contactPanel.reference({ contactId: record.id });
  }
}

/**
 * The address that opens one record on a cold load.
 *
 * The Navigation Parameter is the package's own encoding, so it is produced by
 * the package: a throwaway engine opens the Panel, encodes the Navigation
 * Document it produced, and is discarded. Hand-writing the parameter would be
 * guessing at a format the Panel Engine owns.
 */
export function pipelineDeepLink(record: RecordRef): string {
  const engine = createPanelEngine({
    root: pipelineRoot,
    panels: pipelinePanels,
  });
  const root = engine.getSnapshot().panels[0];
  if (!root) return "/";
  const opened = engine.open({
    originId: root.instanceId,
    panel: referenceFor(record),
  });
  if (opened.status !== "opened" && opened.status !== "reused") return "/";
  const search = applyCanvasNavigationParameter(
    new URLSearchParams(),
    engine.encodeNavigationDocument(),
    { parameterName: canvasNavigationParameterName },
  );
  return `/?${search.toString()}`;
}
