/**
 * The Panel Registry for the reading room.
 *
 * Three Kinds, and between them the four package behaviours no other section in
 * this application touches:
 *
 *   - **`closable: false`.** The summary is the report's spine. Every saved view
 *     opens with it, so `restoreStack` always finds it shared and never tries to
 *     remove it — and a reader who tries to close it is refused atomically,
 *     which is the package's answer rather than a disabled button.
 *   - **`restoreStack`.** A saved view is a whole Panel Stack, moved to in one
 *     Guarded Transition. Panels the target shares with the current stack keep
 *     their identity and are never guarded, so switching views disturbs only
 *     what actually changes.
 *   - **A descriptor migration.** `metric` is at version 2. Version 1 spelled
 *     the field `metric`; version 2 spells it `metricId`, and the ordered
 *     migration chain carries an old link forward. There is a link on the page
 *     built at version 1 so this can be watched happening.
 *   - **A renderer that throws.** One analysis fails on every render. The Panel
 *     keeps its chrome, the rest of the Canvas keeps working, and Retry remounts
 *     the renderer without replacing the Panel instance.
 */

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import { applyCanvasNavigationParameter } from "@squaredlemons/canvas-panels/next/server";
/*
 * The one place this application imports the package's testing entry point, and
 * it is not a test.
 *
 * A Panel Engine can only ever encode the *current* descriptor version, so a
 * link at version 1 cannot be produced by opening a Panel and asking for the
 * address — the engine would hand back a version 2 document. `buildNavigation
 * Document` writes the canonical form directly, which the package's own README
 * calls the only way to exercise a migration from outside. The entry point is
 * server-safe, imports no test runner and registers no global hook.
 */
import { buildNavigationDocument } from "@squaredlemons/canvas-panels/testing";

import { type MetricId, isMetricId, metricLabels } from "./report-metrics";

/** The fourth History Namespace: `canvas`, `book`, `people`, and this. */
export const reportParameterName = "report";

export type SummaryInput = Readonly<{ title: string }>;
export type MetricInput = Readonly<{ metricId: MetricId }>;

type SummaryDescriptor = { title: string };
type MetricDescriptorV2 = { metricId: string };

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

export const reportsRoot = defineRootPanel({
  kind: "reports",
  title: "Reading room",
});

/**
 * The report's spine, and the only Panel in this application that cannot be
 * closed.
 *
 * Its Panel Key is constant, so `reuse` finds it wherever it already is and
 * every saved view shares it at position one. That is what makes
 * `closable: false` liveable rather than a trap: restoration never has to
 * remove it, so it never has to be refused.
 */
export const summaryPanel = definePanel({
  kind: "summary",
  deduplication: "reuse",
  closable: false,
  key: (_input: SummaryInput) => "summary",
  title: ({ title }) => title,
  persistence: {
    mode: "navigation",
    version: 1,
    codec: {
      encode: ({ title }) => ({ title }),
      validate: (descriptor): descriptor is SummaryDescriptor =>
        stringField(descriptor, "title") !== null,
      decode: ({ title }) => ({ title }),
      migrations: [],
    },
  },
});

/**
 * One analysis, at descriptor version 2.
 *
 * Version 1 wrote `{ metric }`. Version 2 writes `{ metricId }`, and the
 * migration below carries every old link forward. The chain must stay complete
 * back to version 1 forever: a bookmarked address can be arbitrarily old, and
 * the package refuses a document it cannot migrate rather than reconstructing a
 * wrong stack from it.
 */
export const metricPanel = definePanel({
  kind: "metric",
  deduplication: "reuse",
  key: ({ metricId }: MetricInput) => metricId,
  title: ({ metricId }) => metricLabels[metricId],
  persistence: {
    mode: "navigation",
    version: 2,
    codec: {
      encode: ({ metricId }) => ({ metricId }),
      validate: (descriptor): descriptor is MetricDescriptorV2 => {
        const metricId = stringField(descriptor, "metricId");
        return metricId !== null && isMetricId(metricId);
      },
      decode: ({ metricId }) => ({ metricId: metricId as MetricId }),
      migrations: [
        {
          from: 1,
          /*
           * A migration is a pure rename and nothing more. It runs before
           * `validate`, so it may return something invalid — a v1 link naming
           * an analysis that has since been removed still fails closed, which
           * is the behaviour a stale bookmark should get.
           */
          migrate: (descriptor) => ({
            metricId: stringField(descriptor, "metric") ?? "",
          }),
        },
      ],
    },
  },
});

export const reportPanels = [summaryPanel, metricPanel] as const;

/* -------------------------------------------------------------------------- *
 *  Saved views
 * -------------------------------------------------------------------------- */

export type SavedView = Readonly<{
  id: string;
  label: string;
  note: string;
  metrics: readonly MetricId[];
}>;

export const savedViews: readonly SavedView[] = Object.freeze([
  Object.freeze({
    id: "quarter-close",
    label: "Quarter close",
    note: "What closed and what is ageing.",
    metrics: Object.freeze(["win-rate", "ageing"] as const),
  }),
  Object.freeze({
    id: "territory",
    label: "Territory load",
    note: "Who is carrying what, and where it is.",
    metrics: Object.freeze(["owner-load", "region-mix"] as const),
  }),
  Object.freeze({
    id: "everything",
    label: "Everything",
    note: "All four analyses at once.",
    /*
     * Deliberately not including `broken`. A renderer that throws is worth
     * demonstrating and worth being asked for: under `next dev` it also trips
     * Next's own full-screen error overlay, which would bury the very thing it
     * is demonstrating for anybody who had not chosen it.
     */
    metrics: Object.freeze([
      "win-rate",
      "ageing",
      "owner-load",
      "region-mix",
    ] as const),
  }),
]);

export const summaryTitle = "This quarter";

/**
 * A saved view as the Panel References `restoreStack` takes.
 *
 * Every one begins with the summary, which is what keeps the non-closable Panel
 * shared across every restoration.
 */
export function viewReferences(view: SavedView) {
  return [
    summaryPanel.reference({ title: summaryTitle }),
    ...view.metrics.map((metricId) => metricPanel.reference({ metricId })),
  ];
}

/* -------------------------------------------------------------------------- *
 *  Addresses
 * -------------------------------------------------------------------------- */

function addressFor(document: string): string {
  const search = applyCanvasNavigationParameter(
    new URLSearchParams(),
    document,
    {
      parameterName: reportParameterName,
    },
  );
  return `/reports?${search.toString()}`;
}

/** The stack the reading room opens on when the address names none of its own. */
export const openingReportDocument: string | null = (() => {
  const engine = createPanelEngine({ root: reportsRoot, panels: reportPanels });
  const first = savedViews[0];
  if (!first) return null;
  const restored = engine.restoreStack({ references: viewReferences(first) });
  if (restored.status !== "restored") return null;
  return engine.encodeNavigationDocument();
})();

/**
 * An address written the way this application used to write them, before the
 * `metric` descriptor was renamed.
 *
 * Nothing produces this shape any more. It is here so a reader can watch the
 * migration run: opening it reconstructs the same stack a current link would,
 * and the package asks the Navigation Adapter to *replace* the history entry
 * with the current spelling — so the address in the bar silently becomes a
 * version 2 one on arrival.
 */
export const legacyReportAddress: string = addressFor(
  buildNavigationDocument([
    { kind: "summary", version: 1, descriptor: { title: summaryTitle } },
    { kind: "metric", version: 1, descriptor: { metric: "win-rate" } },
    { kind: "metric", version: 1, descriptor: { metric: "owner-load" } },
  ]),
);
