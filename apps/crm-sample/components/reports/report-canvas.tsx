"use client";

/**
 * The reading room: saved views, a spine that cannot be closed, and a renderer
 * that fails on purpose.
 *
 * The other three sections navigate a Panel at a time. This one moves the whole
 * stack: a saved view is a set of Panel References handed to `restoreStack`,
 * which resolves every affected guard as one Guarded Transition and commits
 * atomically. Panels the target stack shares with the current one keep their
 * identity and are never guarded, so switching between two views that both show
 * the win-rate analysis leaves that Panel — and its scroll position — exactly
 * where it was.
 */

import type {
  PanelInstanceRef,
  RestoreStackOutcome,
} from "@squaredlemons/canvas-panels/core";
import {
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squaredlemons/canvas-panels/ui";
import {
  ChevronsLeftIcon,
  HistoryIcon,
  LayersIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { createContext, useContext, useRef } from "react";
import { toast } from "sonner";

import {
  MetaList,
  PanelHero,
  PanelSection,
  RecordRow,
} from "@/components/pipeline/record-parts";
import { Button } from "@/components/ui/button";
import {
  dealValue,
  formatDate,
  formatMoney,
  isOpenStage,
  loadMeridianDataset,
  totalOpenPipelineValue,
} from "@/src/domain";

import {
  type MetricId,
  metricLabels,
  metricNotes,
  metricRows,
  metricIds,
} from "./report-metrics";
import {
  legacyReportAddress,
  type MetricInput,
  metricPanel,
  reportPanels,
  reportsRoot,
  type SavedView,
  savedViews,
  summaryPanel,
  type SummaryInput,
  summaryTitle,
  viewReferences,
} from "./report-panels";

const dataset = loadMeridianDataset();

const settled = Object.freeze({
  dirty: false,
  guard: () => ({ status: "allow" }) as const,
  save: async () => {},
  discard: async () => {},
});

/**
 * The application's own handle on `restoreStack`.
 *
 * The Bound Canvas Module's `useNavigation()` deliberately exposes only the
 * per-Panel commands — open, update, activate, collapse, close. Moving the
 * whole stack is an Engine command, and the Engine is the application's: it is
 * created in the mount, so the mount is what passes this down.
 */
type Restore = (
  references: ReturnType<typeof viewReferences>,
) => RestoreStackOutcome;

const RestoreContext = createContext<Restore | null>(null);

export function RestoreProvider({
  restore,
  children,
}: Readonly<{ restore: Restore; children: React.ReactNode }>) {
  return (
    <RestoreContext.Provider value={restore}>
      {children}
    </RestoreContext.Provider>
  );
}

/* -------------------------------------------------------------------------- *
 *  Parts
 * -------------------------------------------------------------------------- */

function Bar({ share }: Readonly<{ share: number }>) {
  return (
    <span
      aria-hidden="true"
      className="block h-1.5 w-full overflow-hidden rounded-full bg-border"
    >
      <span
        className="block h-full rounded-full bg-primary/70"
        style={{
          inlineSize: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`,
        }}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- *
 *  Root Panel — the shelf of saved views
 * -------------------------------------------------------------------------- */

function ReportsRoot() {
  const restore = useContext(RestoreContext);
  const navigation = ReportCanvas.useNavigation();
  const stack = ReportCanvas.useStack();
  const heading = useRef<HTMLHeadingElement>(null);
  ReportCanvas.useLifecycle({ ...settled, initialFocus: heading });

  const openMetrics = stack
    .filter(({ kind }) => kind === "metric")
    .map(({ title }) => title);

  /*
   * Analyses are appended, not opened from here.
   *
   * A Panel opened from the Root Panel replaces everything after it, and
   * everything after it includes the pinned summary — which cannot be removed,
   * so the command is refused outright and nothing happens. Adding an analysis
   * to the current reading is an append, and an append names the deepest Panel
   * as its Origin. The refusal is still reported if one ever arrives; a command
   * that quietly does nothing is the worst of both.
   */
  const deepest = stack.at(-1)?.panel;

  const openMetric = (metricId: MetricId) => {
    const outcome = navigation.open(
      metricPanel,
      { metricId },
      deepest ? { origin: deepest } : undefined,
    );
    if (outcome.status === "rejected") {
      toast.warning("The Canvas refused to open that", {
        description: outcome.reason,
      });
    }
  };

  const apply = (view: SavedView) => {
    if (!restore) return;
    const outcome = restore(viewReferences(view));
    if (outcome.status === "restored") {
      toast(`${view.label}`, {
        description: `${outcome.openedPanelIds.length} opened, ${outcome.removedPanelIds.length} closed — one Guarded Transition, committed atomically.`,
      });
      return;
    }
    if (outcome.status === "unchanged") {
      toast("Already showing that view");
      return;
    }
    if (outcome.status === "rejected") {
      toast.warning("The Canvas refused that restoration", {
        description: outcome.reason,
      });
    }
  };

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow={`As at ${formatDate(dataset.today)}`}
        headingRef={heading}
        subtitle="A saved view is a whole Panel Stack. Picking one moves the Canvas to it in a single atomic transition rather than opening its Panels one after another."
        title="Reading room"
      />

      <PanelSection
        description="Panels the new view shares with the current one keep their identity and are never guarded — switch between two views that both show Win rate and that Panel does not so much as blink."
        title="Saved views"
      >
        <div className="flex flex-col gap-2">
          {savedViews.map((view) => (
            <RecordRow
              key={view.id}
              label={`Restore the ${view.label} view`}
              onSelect={() => apply(view)}
              primary={view.label}
              recordId={view.id}
              secondary={view.note}
              trailing={`${view.metrics.length + 1} Panels`}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection
        description="Or open one at a time, the ordinary way."
        title="Single analyses"
      >
        <div className="flex flex-col gap-2">
          {metricIds.map((metricId: MetricId) => (
            <RecordRow
              key={metricId}
              label={`Open ${metricLabels[metricId]}`}
              onSelect={() => openMetric(metricId)}
              primary={metricLabels[metricId]}
              recordId={metricId}
              secondary={metricNotes[metricId]}
              trailing={metricId === "broken" ? "Throws" : undefined}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection
        description="Version 1 of this Panel Kind spelled the field `metric`; version 2 spells it `metricId`. Nothing writes the old shape any more, so this address was built with the package's own document builder. Open it: the stack reconstructs, and the address in the bar quietly becomes a version 2 one, because a migrated document asks the adapter to replace the history entry rather than push a new one."
        title="An address from before the rename"
      >
        {/*
          A plain anchor rather than a `Link`, and that is the point rather than
          an oversight. A client-side navigation would change the address and
          leave this Engine exactly as it is — the Workspace is seeded once,
          when it is created, because that is what makes a deep link paint its
          whole stack in one pass. An old bookmark arrives cold, so this one
          does too.
        */}
        <Button asChild size="sm" variant="outline">
          <a href={legacyReportAddress}>
            <HistoryIcon aria-hidden="true" />
            Open a version 1 link
          </a>
        </Button>
      </PanelSection>

      {openMetrics.length > 0 ? (
        <PanelSection title="Open now">
          <p className="text-sm text-muted-foreground">
            {openMetrics.join(" · ")}
          </p>
        </PanelSection>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Summary — the Panel that cannot be closed
 * -------------------------------------------------------------------------- */

function SummaryPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<SummaryInput, "summary">) {
  const navigation = ReportCanvas.useNavigation();
  const heading = useRef<HTMLHeadingElement>(null);
  ReportCanvas.useLifecycle({ ...settled, initialFocus: heading });

  const open = dataset.deals.filter((deal) => isOpenStage(deal.stage));
  const won = dataset.deals.filter((deal) => deal.stage === "closed-won");
  const wonValue = won.reduce(
    (total, deal) => total + dealValue(dataset, deal).amount,
    0,
  );

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow="Permanent"
        headingRef={heading}
        subtitle="This Panel is registered `closable: false`. The package renders no close control for it, and any command that would remove it — a close, a Branch Replacement, a restoration — is rejected atomically before anything moves."
        title={descriptor.title}
      />

      <PanelSection title="The quarter">
        <MetaList
          items={[
            ["Open deals", String(open.length)],
            ["Open pipeline", formatMoney(totalOpenPipelineValue(dataset))],
            ["Closed won", String(won.length)],
            [
              "Won value",
              formatMoney({
                amount: wonValue,
                currency: dataset.reportingCurrency,
              }),
            ],
            ["Accounts", String(dataset.companies.length)],
            ["People", String(dataset.contacts.length)],
          ]}
        />
      </PanelSection>

      <PanelSection
        description="Which is why every saved view begins with this Panel. `restoreStack` keeps the Panels a target stack shares with the current one, so the spine is always shared and restoration never has to ask to remove it."
        title="Try it"
      >
        <Button
          onClick={() => {
            const outcome = navigation.close(panel);
            toast.warning("The Canvas refused to close the spine", {
              description:
                outcome.status === "rejected"
                  ? `Rejected: ${outcome.reason}.`
                  : "Unexpectedly allowed.",
            });
          }}
          size="sm"
          variant="outline"
        >
          Close this Panel
        </Button>
      </PanelSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Metric — including the one that throws
 * -------------------------------------------------------------------------- */

function MetricPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<MetricInput, "metric">) {
  const { metricId } = descriptor;
  const navigation = ReportCanvas.useNavigation();
  const heading = useRef<HTMLHeadingElement>(null);
  ReportCanvas.useLifecycle({ ...settled, initialFocus: heading });

  // Deliberately not guarded. `broken` throws here, and being caught by the
  // package's per-Panel boundary rather than by this renderer is the point.
  const rows = metricRows(dataset, metricId);

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow="Analysis"
        headingRef={heading}
        subtitle={metricNotes[metricId]}
        title={metricLabels[metricId]}
      />

      <PanelSection title="Figures">
        <ol className="flex flex-col gap-3">
          {rows.map((row) => (
            <li className="flex flex-col gap-1" key={row.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{row.label}</span>
                <span className="text-sm font-semibold" data-numeric>
                  {row.figure}
                </span>
              </div>
              <Bar share={row.share} />
              {row.detail ? (
                <span className="text-xs text-muted-foreground" data-numeric>
                  {row.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </PanelSection>

      <PanelSection
        description="Removes every Panel after this one in a single Guarded Transition. It is the one navigation command the other three sections never call."
        title="Collapse"
      >
        <Button
          onClick={() => {
            const outcome = navigation.collapse(panel);
            if (outcome.status === "collapsed") {
              toast("Collapsed to here", {
                description: `${outcome.removedPanelIds.length} Panel${outcome.removedPanelIds.length === 1 ? "" : "s"} closed.`,
              });
              return;
            }
            if (outcome.status === "unchanged") {
              toast("Nothing after this Panel to collapse");
              return;
            }
            toast.warning("The Canvas refused to collapse", {
              description: outcome.reason,
            });
          }}
          size="sm"
          variant="outline"
        >
          <ChevronsLeftIcon aria-hidden="true" />
          Collapse to here
        </Button>
      </PanelSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  The Bound Canvas Module
 * -------------------------------------------------------------------------- */

export const ReportCanvas = createCanvasModule({
  root: reportsRoot,
  panels: reportPanels,
  renderers: {
    reports: ReportsRoot,
    summary: SummaryPanel,
    metric: MetricPanel,
  },
  /*
   * What the host is told when a renderer throws: the Panel Kind and the Panel
   * Instance Ref, and nothing else. Not the error, not the stack, not the
   * component — the package will not hand an application something it might
   * put on a screen or into a log.
   *
   * The Panel itself keeps its chrome and its place in the stack. Its body is
   * replaced by a notice with a Retry that remounts the renderer *without*
   * replacing the Panel instance, and focus goes to the notice and then, on a
   * retry, to the Panel's own heading — the Workspace owning that moment, as it
   * owns every other appearance of a body.
   */
  onRendererError: ({
    kind,
    panel,
  }: {
    kind: string;
    panel: PanelInstanceRef;
  }) => {
    toast.error("An analysis failed to render", {
      description: `The ${kind} Panel ${panel.instanceId} threw. The rest of the Canvas is unaffected — its own body has the notice.`,
    });
  },
});

/** A legend for the strip under the Canvas. */
export function ReportLegend() {
  const stack = ReportCanvas.useStack();
  const broken = stack.some(({ descriptor }) => {
    if (typeof descriptor !== "object" || descriptor === null) return false;
    return (descriptor as { metricId?: string }).metricId === "broken";
  });

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-border bg-muted/30 px-4 py-2.5 text-xs"
      data-meridian-inspector=""
    >
      <span className="flex items-center gap-1.5 font-medium">
        <LayersIcon aria-hidden="true" className="size-3.5" />
        {stack.length} Panels · {summaryTitle} is pinned
      </span>
      {broken ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <TriangleAlertIcon aria-hidden="true" className="size-3.5" />
          One analysis is failing, and only that Panel knows about it.
        </span>
      ) : (
        <span className="text-muted-foreground">
          Saved views move the whole stack at once; Collapse cuts it back; the
          spine refuses to go.
        </span>
      )}
    </div>
  );
}

export { summaryPanel };
