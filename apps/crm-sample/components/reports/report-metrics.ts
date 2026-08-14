/**
 * What the reading room reports on.
 *
 * Pure, framework-free and derived from the fixed dataset, so a figure on
 * screen can be checked by reading this file. One of them throws on purpose;
 * see `broken` below.
 */

import {
  type Deal,
  dealValue,
  type DealSource,
  dealSourceLabels,
  formatMoney,
  isOpenStage,
  type MeridianDataset,
  type PipelineStage,
  pipelineStageLabels,
  pipelineStages,
  type Region,
  regionLabels,
} from "@/src/domain";

export const metricIds = [
  "win-rate",
  "ageing",
  "owner-load",
  "region-mix",
  "broken",
] as const;

export type MetricId = (typeof metricIds)[number];

export function isMetricId(value: unknown): value is MetricId {
  return (
    typeof value === "string" &&
    (metricIds as readonly string[]).includes(value)
  );
}

export const metricLabels: Readonly<Record<MetricId, string>> = Object.freeze({
  "win-rate": "Win rate by source",
  ageing: "Ageing by stage",
  "owner-load": "Load by owner",
  "region-mix": "Open pipeline by region",
  broken: "An analysis that throws (dev overlay)",
});

export const metricNotes: Readonly<Record<MetricId, string>> = Object.freeze({
  "win-rate":
    "Closed Won as a share of everything closed, by where it came from.",
  ageing: "Mean days in stage for the deals sitting in each open stage.",
  "owner-load": "Open deals and open value against each rep's quota.",
  "region-mix": "Where the open pipeline is, by territory.",
  broken:
    "This renderer throws on every render, on purpose. The Panel keeps its chrome and shows the package's failure notice; the rest of the Canvas is untouched. Under `next dev` Next's own error overlay appears over the top of it as well — dismiss it and the Panel is behind. A production build shows only the notice.",
});

/** One row of a report: a label, a figure, and a share of the largest. */
export type MetricRow = Readonly<{
  key: string;
  label: string;
  figure: string;
  /** 0–1, for the bar. Never the only carrier of the number beside it. */
  share: number;
  detail?: string;
}>;

function closedDeals(dataset: MeridianDataset): readonly Deal[] {
  return dataset.deals.filter((deal) => !isOpenStage(deal.stage));
}

function winRateRows(dataset: MeridianDataset): readonly MetricRow[] {
  const closed = closedDeals(dataset);
  const sources = [
    ...new Set(closed.map((deal) => deal.source)),
  ] as DealSource[];
  const rows = sources.map((source) => {
    const inSource = closed.filter((deal) => deal.source === source);
    const won = inSource.filter((deal) => deal.stage === "closed-won").length;
    const rate = inSource.length === 0 ? 0 : won / inSource.length;
    return {
      key: source,
      label: dealSourceLabels[source],
      figure: `${Math.round(rate * 100)}%`,
      share: rate,
      detail: `${won} won of ${inSource.length} closed`,
    };
  });
  return Object.freeze(rows.sort((a, b) => b.share - a.share));
}

function ageingRows(dataset: MeridianDataset): readonly MetricRow[] {
  const openStages = pipelineStages.filter(isOpenStage);
  const rows = openStages.map((stage: PipelineStage) => {
    const inStage = dataset.deals.filter((deal) => deal.stage === stage);
    const mean =
      inStage.length === 0
        ? 0
        : Math.round(
            inStage.reduce((total, deal) => total + deal.daysInStage, 0) /
              inStage.length,
          );
    return { stage, mean, count: inStage.length };
  });
  const longest = rows.reduce((most, row) => Math.max(most, row.mean), 0);
  return Object.freeze(
    rows.map(({ stage, mean, count }) => ({
      key: stage,
      label: pipelineStageLabels[stage],
      figure: `${mean} days`,
      share: longest === 0 ? 0 : mean / longest,
      detail: `${count} ${count === 1 ? "deal" : "deals"}`,
    })),
  );
}

function ownerLoadRows(dataset: MeridianDataset): readonly MetricRow[] {
  const rows = dataset.owners.map((owner) => {
    const open = dataset.deals.filter(
      (deal) => deal.ownerId === owner.id && isOpenStage(deal.stage),
    );
    const value = open.reduce(
      (total, deal) => total + dealValue(dataset, deal).amount,
      0,
    );
    return { owner, count: open.length, value };
  });
  const busiest = rows.reduce((most, row) => Math.max(most, row.value), 0);
  return Object.freeze(
    rows
      .sort((a, b) => b.value - a.value)
      .map(({ owner, count, value }) => ({
        key: owner.id,
        label: owner.name,
        figure: `${Math.round((value / Math.max(owner.quota, 1)) * 100)}% of quota`,
        share: busiest === 0 ? 0 : value / busiest,
        detail: `${count} open ${count === 1 ? "deal" : "deals"}`,
      })),
  );
}

function regionMixRows(dataset: MeridianDataset): readonly MetricRow[] {
  const totals = new Map<Region, number>();
  for (const deal of dataset.deals) {
    if (!isOpenStage(deal.stage)) continue;
    const company = dataset.companies.find(({ id }) => id === deal.companyId);
    if (!company) continue;
    totals.set(
      company.region,
      (totals.get(company.region) ?? 0) + dealValue(dataset, deal).amount,
    );
  }
  const largest = [...totals.values()].reduce(
    (most, value) => Math.max(most, value),
    0,
  );
  return Object.freeze(
    [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([region, value]) => ({
        key: region,
        label: regionLabels[region],
        figure: formatMoney(
          { amount: value, currency: dataset.reportingCurrency },
          { compact: true },
        ),
        share: largest === 0 ? 0 : value / largest,
      })),
  );
}

/**
 * The rows one analysis reports.
 *
 * `broken` throws, deliberately and every time. It is the only way to show what
 * the package does when a renderer fails: the failure is caught inside that
 * Panel's body, the rest of the Canvas keeps working, the host is handed
 * `{ kind, panel }` and nothing else, and Retry remounts the renderer without
 * replacing the Panel instance.
 */
export function metricRows(
  dataset: MeridianDataset,
  metric: MetricId,
): readonly MetricRow[] {
  switch (metric) {
    case "win-rate":
      return winRateRows(dataset);
    case "ageing":
      return ageingRows(dataset);
    case "owner-load":
      return ownerLoadRows(dataset);
    case "region-mix":
      return regionMixRows(dataset);
    case "broken":
      throw new Error(
        "The quarterly cube is unavailable. (This analysis throws on purpose.)",
      );
  }
}
