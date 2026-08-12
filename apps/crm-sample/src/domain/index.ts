import activitiesJson from "./data/activities.json" with { type: "json" };
import companiesJson from "./data/companies.json" with { type: "json" };
import contactsJson from "./data/contacts.json" with { type: "json" };
import dealsJson from "./data/deals.json" with { type: "json" };
import ownersJson from "./data/owners.json" with { type: "json" };
import workspaceJson from "./data/workspace.json" with { type: "json" };
import type {
  Activity,
  ActivityKind,
  ArrBand,
  Company,
  CompanySizeBand,
  Contact,
  Currency,
  DatasetProblem,
  Deal,
  DealSource,
  HealthSignal,
  IsoDate,
  IsoTimestamp,
  MeridianDataset,
  Money,
  Owner,
  PipelineStage,
  Region,
  Seniority,
  StageForecast,
} from "./types.js";

export type {
  Activity,
  ActivityKind,
  ArrBand,
  Company,
  CompanySizeBand,
  Contact,
  Currency,
  DatasetProblem,
  DatasetProblemKind,
  Deal,
  DealSource,
  HealthSignal,
  IsoDate,
  IsoTimestamp,
  MeridianDataset,
  Money,
  Owner,
  PipelineStage,
  Region,
  Seniority,
  StageForecast,
} from "./types.js";

/**
 * Meridian's domain layer: the fixed sample dataset, the selectors a CRM
 * interface needs, and the formatters that present them.
 *
 * Everything here is pure and framework-free, which is what lets the same
 * reasoning be tested under `node --test` and rendered by React without a
 * second implementation. Nothing reads the clock: the demo is presented as of
 * one fixed day so that a screenshot taken today and one taken next year say
 * the same thing.
 *
 * The values live in this one module rather than being split by concern, and
 * that is a constraint rather than a preference. Splitting would need relative
 * imports between them, and no single specifier satisfies both readers: a
 * bundler's TypeScript settings reject a `.ts` extension, while Node's type
 * stripping resolves nothing else. Types are the exception — `./types.js` is a
 * type-only import, erased before either reader sees it.
 */

/** The pipeline stages in funnel order. Order is load-bearing. */
export const pipelineStages: readonly PipelineStage[] = Object.freeze([
  "qualify",
  "discovery",
  "proposal",
  "negotiation",
  "closed-won",
  "closed-lost",
] as const);

export const pipelineStageLabels: Readonly<Record<PipelineStage, string>> =
  Object.freeze({
    qualify: "Qualify",
    discovery: "Discovery",
    proposal: "Proposal",
    negotiation: "Negotiation",
    "closed-won": "Closed Won",
    "closed-lost": "Closed Lost",
  });

/** Whether a stage's deals still count towards pipeline. */
export function isOpenStage(stage: PipelineStage): boolean {
  return stage !== "closed-won" && stage !== "closed-lost";
}

export const regionLabels: Readonly<Record<Region, string>> = Object.freeze({
  "north-america": "North America",
  "uk-ireland": "UK & Ireland",
  europe: "Europe",
  apac: "Asia-Pacific",
  global: "Global",
});

export const sizeBandLabels: Readonly<Record<CompanySizeBand, string>> =
  Object.freeze({
    smb: "Small business",
    "mid-market": "Mid-market",
    enterprise: "Enterprise",
  });

export const healthLabels: Readonly<Record<HealthSignal, string>> =
  Object.freeze({
    strong: "Strong",
    steady: "Steady",
    watch: "Watch",
    "at-risk": "At risk",
  });

export const arrBandLabels: Readonly<Record<ArrBand, string>> = Object.freeze({
  none: "No ARR yet",
  "under-50k": "Under $50k",
  "50k-250k": "$50k–$250k",
  "250k-1m": "$250k–$1m",
  "1m-plus": "$1m+",
});

export const seniorityLabels: Readonly<Record<Seniority, string>> =
  Object.freeze({
    "c-suite": "C-suite",
    vp: "VP",
    director: "Director",
    manager: "Manager",
    "individual-contributor": "Individual contributor",
  });

export const dealSourceLabels: Readonly<Record<DealSource, string>> =
  Object.freeze({
    inbound: "Inbound",
    outbound: "Outbound",
    partner: "Partner",
    event: "Event",
    referral: "Referral",
    expansion: "Expansion",
  });

export const activityKindLabels: Readonly<Record<ActivityKind, string>> =
  Object.freeze({
    call: "Call",
    email: "Email",
    meeting: "Meeting",
    note: "Note",
  });

const currencySymbols: Readonly<Record<Currency, string>> = Object.freeze({
  USD: "$",
  GBP: "£",
  EUR: "€",
});

const seniorityRank: Readonly<Record<Seniority, number>> = Object.freeze({
  "c-suite": 0,
  vp: 1,
  director: 2,
  manager: 3,
  "individual-contributor": 4,
});

/**
 * The allowed members of a union, taken from the record that labels them so the
 * two can never disagree about which members exist.
 */
function membersOf<T extends string>(
  labels: Readonly<Record<T, string>>,
): readonly T[] {
  return Object.freeze(Object.keys(labels) as T[]);
}

// --- Dates ------------------------------------------------------------------

const millisecondsPerDay = 86_400_000;

const monthNames: readonly string[] = Object.freeze([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]);

function utcDayNumber(date: IsoDate): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Date.UTC(year, month - 1, day) / millisecondsPerDay;
}

/** Whole days from `from` to `to`; negative when `to` is the earlier date. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return utcDayNumber(to) - utcDayNumber(from);
}

/** The calendar date an instant falls on, in UTC. */
export function dateOf(timestamp: IsoTimestamp): IsoDate {
  return timestamp.slice(0, 10);
}

/** A date as `12 Aug 2026`. Hand-rolled rather than delegated to `Intl`,
 * because the demo must render identically in Node and in every browser. */
export function formatDate(date: IsoDate): string {
  const month = monthNames[Number(date.slice(5, 7)) - 1] ?? "";
  return `${Number(date.slice(8, 10))} ${month} ${date.slice(0, 4)}`;
}

/** An instant as `11 Aug 2026, 08:05` in UTC. */
export function formatDateTime(timestamp: IsoTimestamp): string {
  return `${formatDate(dateOf(timestamp))}, ${timestamp.slice(11, 16)}`;
}

function plural(count: number, unit: string): string {
  return count === 1 ? `1 ${unit}` : `${count} ${unit}s`;
}

/**
 * A date said the way a salesperson would say it, relative to the dataset's
 * fixed today: `Tomorrow`, `In 3 days`, `5 weeks ago`.
 *
 * `today` is a parameter with a fixed default rather than a call to `Date.now`,
 * so the phrasing is both testable and identical on every load.
 */
export function formatRelativeDate(
  date: IsoDate,
  today: IsoDate = meridianToday,
): string {
  const days = daysBetween(today, date);
  const magnitude = Math.abs(days);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";

  const phrase =
    magnitude < 7
      ? plural(magnitude, "day")
      : magnitude < 28
        ? plural(Math.round(magnitude / 7), "week")
        : plural(Math.max(1, Math.round(magnitude / 30)), "month");
  return days > 0 ? `In ${phrase}` : `${phrase} ago`;
}

// --- Money ------------------------------------------------------------------

export function money(amount: number, currency: Currency): Money {
  return Object.freeze({ amount, currency });
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function shortenUnits(units: number): string {
  return String(units >= 100 ? Math.round(units) : Math.round(units * 10) / 10);
}

/**
 * `$480,000`, or `$480K` when compact. Compact form is for cards and column
 * headers where the exact pound matters less than the shape of the funnel.
 */
export function formatMoney(
  value: Money,
  options: Readonly<{ compact?: boolean }> = {},
): string {
  const symbol = currencySymbols[value.currency];
  const rounded = Math.round(value.amount);
  const sign = rounded < 0 ? "-" : "";
  const magnitude = Math.abs(rounded);

  if (options.compact === true) {
    if (magnitude >= 1_000_000) {
      return `${sign}${symbol}${shortenUnits(magnitude / 1_000_000)}M`;
    }
    if (magnitude >= 1_000) {
      return `${sign}${symbol}${shortenUnits(magnitude / 1_000)}K`;
    }
  }
  return `${sign}${symbol}${groupDigits(String(magnitude))}`;
}

// --- Reading the dataset ----------------------------------------------------

function fail(path: string, expected: string): never {
  throw new Error(
    `Meridian dataset is invalid at ${path}: expected ${expected}.`,
  );
}

function record(
  value: unknown,
  path: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "an object");
  }
  return value as Readonly<Record<string, unknown>>;
}

function rows(
  value: unknown,
  path: string,
): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) fail(path, "an array");
  const list: readonly unknown[] = value;
  return list.map((row, index) => record(row, `${path}[${index}]`));
}

function text(
  row: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string {
  const value = row[key];
  if (typeof value !== "string" || value === "") {
    fail(`${path}.${key}`, "a non-empty string");
  }
  return value;
}

function nonNegative(
  row: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${path}.${key}`, "a non-negative number");
  }
  return value;
}

function flag(
  row: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): boolean {
  const value = row[key];
  if (typeof value !== "boolean") fail(`${path}.${key}`, "a boolean");
  return value;
}

function member<T extends string>(
  row: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  allowed: readonly T[],
): T {
  const value = row[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${path}.${key}`, `one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function nullableText(
  row: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string" || value === "") {
    fail(`${path}.${key}`, "a non-empty string or null");
  }
  return value;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function isoDate(
  row: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): IsoDate {
  const value = text(row, key, path);
  if (!isoDatePattern.test(value)) fail(`${path}.${key}`, "a YYYY-MM-DD date");
  return value;
}

function isoTimestamp(
  row: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): IsoTimestamp {
  const value = text(row, key, path);
  if (!isoTimestampPattern.test(value)) {
    fail(`${path}.${key}`, "a YYYY-MM-DDTHH:MM:SSZ instant");
  }
  return value;
}

const currencies = membersOf(currencySymbols);
const regions = membersOf(regionLabels);
const sizeBands = membersOf(sizeBandLabels);
const healthSignals = membersOf(healthLabels);
const arrBands = membersOf(arrBandLabels);
const seniorities = membersOf(seniorityLabels);
const dealSources = membersOf(dealSourceLabels);
const activityKinds = membersOf(activityKindLabels);

const workspace = record(workspaceJson, "workspace");
const rateTable = record(workspace.exchangeRates, "workspace.exchangeRates");

/** The one day the whole demo is presented as of. */
export const meridianToday: IsoDate = isoDate(workspace, "today", "workspace");

const reportingCurrency = member(
  workspace,
  "reportingCurrency",
  "workspace",
  currencies,
);

const exchangeRates: Readonly<Record<Currency, number>> = Object.freeze(
  Object.fromEntries(
    currencies.map((currency) => [
      currency,
      nonNegative(rateTable, currency, "workspace.exchangeRates"),
    ]),
  ) as Record<Currency, number>,
);

if (exchangeRates[reportingCurrency] !== 1) {
  fail(
    `workspace.exchangeRates.${reportingCurrency}`,
    "a rate of exactly 1 for the reporting currency",
  );
}

function readOwner(
  row: Readonly<Record<string, unknown>>,
  path: string,
): Owner {
  return Object.freeze({
    id: text(row, "id", path),
    name: text(row, "name", path),
    initials: text(row, "initials", path),
    title: text(row, "title", path),
    region: member(row, "region", path, regions),
    quota: nonNegative(row, "quota", path),
  });
}

function readCompany(
  row: Readonly<Record<string, unknown>>,
  path: string,
): Company {
  return Object.freeze({
    id: text(row, "id", path),
    name: text(row, "name", path),
    industry: text(row, "industry", path),
    sizeBand: member(row, "sizeBand", path, sizeBands),
    employees: nonNegative(row, "employees", path),
    region: member(row, "region", path, regions),
    headquarters: text(row, "headquarters", path),
    website: text(row, "website", path),
    description: text(row, "description", path),
    health: member(row, "health", path, healthSignals),
    arrBand: member(row, "arrBand", path, arrBands),
    ownerId: text(row, "ownerId", path),
  });
}

function readContact(
  row: Readonly<Record<string, unknown>>,
  path: string,
): Contact {
  return Object.freeze({
    id: text(row, "id", path),
    name: text(row, "name", path),
    title: text(row, "title", path),
    companyId: text(row, "companyId", path),
    email: text(row, "email", path),
    phone: text(row, "phone", path),
    seniority: member(row, "seniority", path, seniorities),
    isEconomicBuyer: flag(row, "isEconomicBuyer", path),
    isChampion: flag(row, "isChampion", path),
  });
}

function readDeal(row: Readonly<Record<string, unknown>>, path: string): Deal {
  const probability = nonNegative(row, "probability", path);
  if (probability > 100)
    fail(`${path}.probability`, "a percentage of 0 to 100");
  const stageEnteredOn = isoDate(row, "stageEnteredOn", path);

  return Object.freeze({
    id: text(row, "id", path),
    title: text(row, "title", path),
    companyId: text(row, "companyId", path),
    ownerId: text(row, "ownerId", path),
    primaryContactId: text(row, "primaryContactId", path),
    value: nonNegative(row, "value", path),
    currency: member(row, "currency", path, currencies),
    stage: member(row, "stage", path, pipelineStages),
    probability,
    expectedCloseDate: isoDate(row, "expectedCloseDate", path),
    stageEnteredOn,
    source: member(row, "source", path, dealSources),
    nextStep: nullableText(row, "nextStep", path),
    notes: text(row, "notes", path),
    daysInStage: daysBetween(stageEnteredOn, meridianToday),
  });
}

function readActivity(
  row: Readonly<Record<string, unknown>>,
  path: string,
): Activity {
  return Object.freeze({
    id: text(row, "id", path),
    kind: member(row, "kind", path, activityKinds),
    subject: text(row, "subject", path),
    body: text(row, "body", path),
    occurredAt: isoTimestamp(row, "occurredAt", path),
    ownerId: text(row, "ownerId", path),
    dealId: nullableText(row, "dealId", path),
    contactId: nullableText(row, "contactId", path),
  });
}

function readAll<T>(
  json: unknown,
  path: string,
  read: (row: Readonly<Record<string, unknown>>, rowPath: string) => T,
): readonly T[] {
  return Object.freeze(
    rows(json, path).map((row, index) => read(row, `${path}[${index}]`)),
  );
}

let loaded: MeridianDataset | null = null;

/**
 * The Meridian dataset: validated at the boundary, frozen all the way down, and
 * built once per process.
 *
 * The JSON is committed source, so a type assertion would compile happily over
 * a typo in an enum member or a renamed id. Validating and running the
 * integrity checks here instead means a broken dataset fails on the first load
 * with a message naming the record, rather than on stage as an empty panel.
 */
export function loadMeridianDataset(): MeridianDataset {
  if (loaded) return loaded;

  const dataset: MeridianDataset = Object.freeze({
    today: meridianToday,
    reportingCurrency,
    exchangeRates,
    owners: readAll(ownersJson, "owners", readOwner),
    companies: readAll(companiesJson, "companies", readCompany),
    contacts: readAll(contactsJson, "contacts", readContact),
    deals: readAll(dealsJson, "deals", readDeal),
    activities: readAll(activitiesJson, "activities", readActivity),
  });

  assertDatasetIntegrity(dataset);
  loaded = dataset;
  return dataset;
}

// --- Integrity --------------------------------------------------------------

function problem(
  kind: DatasetProblem["kind"],
  subject: string,
  detail: string,
): DatasetProblem {
  return Object.freeze({ kind, subject, detail });
}

function idsOf(
  records: readonly Readonly<{ id: string }>[],
): ReadonlySet<string> {
  return new Set(records.map(({ id }) => id));
}

/**
 * Every id one record uses to name another, checked against the records that
 * exist.
 *
 * A dangling reference is the classic way demo data dies in front of an
 * audience: the list renders, the panel opens, and the detail is blank. Finding
 * them is cheap and finding them late is not. A reused id is reported here
 * too, because it makes every reference to that id ambiguous — the same defect
 * arriving from the other direction.
 */
export function findReferenceProblems(
  dataset: MeridianDataset,
): readonly DatasetProblem[] {
  const problems: DatasetProblem[] = [];
  const ownerIds = idsOf(dataset.owners);
  const companyIds = idsOf(dataset.companies);
  const contactIds = idsOf(dataset.contacts);
  const dealIds = idsOf(dataset.deals);
  const companyOfContact = new Map(
    dataset.contacts.map((contact) => [contact.id, contact.companyId]),
  );
  const companyOfDeal = new Map(
    dataset.deals.map((deal) => [deal.id, deal.companyId]),
  );

  const seen = new Set<string>();
  for (const { id } of [
    ...dataset.owners,
    ...dataset.companies,
    ...dataset.contacts,
    ...dataset.deals,
    ...dataset.activities,
  ]) {
    if (seen.has(id)) {
      problems.push(problem("duplicate-id", id, "id is used more than once"));
    }
    seen.add(id);
  }

  for (const company of dataset.companies) {
    if (!ownerIds.has(company.ownerId)) {
      problems.push(
        problem("missing-reference", company.id, `no owner ${company.ownerId}`),
      );
    }
  }

  for (const contact of dataset.contacts) {
    if (!companyIds.has(contact.companyId)) {
      problems.push(
        problem(
          "missing-reference",
          contact.id,
          `no company ${contact.companyId}`,
        ),
      );
    }
  }

  for (const deal of dataset.deals) {
    if (!companyIds.has(deal.companyId)) {
      problems.push(
        problem("missing-reference", deal.id, `no company ${deal.companyId}`),
      );
    }
    if (!ownerIds.has(deal.ownerId)) {
      problems.push(
        problem("missing-reference", deal.id, `no owner ${deal.ownerId}`),
      );
    }
    if (!contactIds.has(deal.primaryContactId)) {
      problems.push(
        problem(
          "missing-reference",
          deal.id,
          `no contact ${deal.primaryContactId}`,
        ),
      );
    } else if (companyOfContact.get(deal.primaryContactId) !== deal.companyId) {
      problems.push(
        problem(
          "cross-entity-mismatch",
          deal.id,
          `primary contact ${deal.primaryContactId} belongs to another company`,
        ),
      );
    }
  }

  for (const activity of dataset.activities) {
    if (!ownerIds.has(activity.ownerId)) {
      problems.push(
        problem(
          "missing-reference",
          activity.id,
          `no owner ${activity.ownerId}`,
        ),
      );
    }
    if (activity.dealId !== null && !dealIds.has(activity.dealId)) {
      problems.push(
        problem("missing-reference", activity.id, `no deal ${activity.dealId}`),
      );
    }
    if (activity.contactId === null) continue;
    if (!contactIds.has(activity.contactId)) {
      problems.push(
        problem(
          "missing-reference",
          activity.id,
          `no contact ${activity.contactId}`,
        ),
      );
      continue;
    }
    // An activity that names both must not straddle two accounts, or a company
    // timeline assembled from either side would disagree with itself.
    const dealCompany =
      activity.dealId === null ? null : companyOfDeal.get(activity.dealId);
    if (
      dealCompany !== null &&
      dealCompany !== undefined &&
      companyOfContact.get(activity.contactId) !== dealCompany
    ) {
      problems.push(
        problem(
          "cross-entity-mismatch",
          activity.id,
          `contact ${activity.contactId} does not belong to the deal's company`,
        ),
      );
    }
  }

  return Object.freeze(problems);
}

/**
 * The dates and probabilities that have to agree with each other for the
 * dataset to read as one coherent workday.
 */
export function findConsistencyProblems(
  dataset: MeridianDataset,
): readonly DatasetProblem[] {
  const problems: DatasetProblem[] = [];
  const today = dataset.today;
  const closeDates = new Map(
    dataset.deals
      .filter((deal) => !isOpenStage(deal.stage))
      .map((deal) => [deal.id, deal.expectedCloseDate]),
  );

  for (const deal of dataset.deals) {
    if (daysBetween(today, deal.stageEnteredOn) > 0) {
      problems.push(
        problem("date-order", deal.id, "entered its stage in the future"),
      );
    }
    if (daysBetween(deal.stageEnteredOn, deal.expectedCloseDate) < 0) {
      problems.push(
        problem("date-order", deal.id, "closes before it entered its stage"),
      );
    }

    const open = isOpenStage(deal.stage);
    if (open && daysBetween(today, deal.expectedCloseDate) <= 0) {
      problems.push(
        problem(
          "date-order",
          deal.id,
          "is open but does not close in the future",
        ),
      );
    }
    if (!open && daysBetween(today, deal.expectedCloseDate) > 0) {
      problems.push(
        problem("date-order", deal.id, "is closed but closes in the future"),
      );
    }

    const expectedProbability =
      deal.stage === "closed-won"
        ? 100
        : deal.stage === "closed-lost"
          ? 0
          : null;
    if (
      expectedProbability !== null &&
      deal.probability !== expectedProbability
    ) {
      problems.push(
        problem(
          "stage-probability",
          deal.id,
          `${pipelineStageLabels[deal.stage]} must be ${expectedProbability}%`,
        ),
      );
    }
    if (open && (deal.probability <= 0 || deal.probability >= 100)) {
      problems.push(
        problem(
          "stage-probability",
          deal.id,
          "an open deal is neither 0% nor 100%",
        ),
      );
    }
  }

  for (const activity of dataset.activities) {
    const day = dateOf(activity.occurredAt);
    if (daysBetween(today, day) > 0) {
      problems.push(
        problem("date-order", activity.id, "happened in the future"),
      );
    }
    if (activity.dealId === null) continue;
    const closedOn = closeDates.get(activity.dealId);
    if (closedOn !== undefined && daysBetween(closedOn, day) > 0) {
      problems.push(
        problem(
          "date-order",
          activity.id,
          `postdates the close of ${activity.dealId}`,
        ),
      );
    }
  }

  return Object.freeze(problems);
}

/** Throws with every problem at once, or returns quietly. */
export function assertDatasetIntegrity(dataset: MeridianDataset): void {
  const problems = [
    ...findReferenceProblems(dataset),
    ...findConsistencyProblems(dataset),
  ];
  if (problems.length === 0) return;
  const lines = problems.map(
    ({ kind, subject, detail }) => `  ${kind}: ${subject} — ${detail}`,
  );
  throw new Error(`Meridian dataset is inconsistent:\n${lines.join("\n")}`);
}

// --- Lookups ----------------------------------------------------------------

function byId<T extends Readonly<{ id: string }>>(
  records: readonly T[],
  id: string,
): T | undefined {
  return records.find((entity) => entity.id === id);
}

export function getOwner(
  dataset: MeridianDataset,
  id: string,
): Owner | undefined {
  return byId(dataset.owners, id);
}

export function getCompany(
  dataset: MeridianDataset,
  id: string,
): Company | undefined {
  return byId(dataset.companies, id);
}

export function getContact(
  dataset: MeridianDataset,
  id: string,
): Contact | undefined {
  return byId(dataset.contacts, id);
}

export function getDeal(
  dataset: MeridianDataset,
  id: string,
): Deal | undefined {
  return byId(dataset.deals, id);
}

export function getActivity(
  dataset: MeridianDataset,
  id: string,
): Activity | undefined {
  return byId(dataset.activities, id);
}

// --- Selectors --------------------------------------------------------------

function stageOrder(stage: PipelineStage): number {
  return pipelineStages.indexOf(stage);
}

/**
 * Funnel order, then richest first, then by id.
 *
 * Every list of deals is ordered this way, so a company's deals and an owner's
 * deals read in the same direction as the board's columns rather than each
 * choosing an order of its own. The id breaks the last tie so the sequence is
 * identical on every load.
 */
function compareDeals(a: Deal, b: Deal): number {
  const byStage = stageOrder(a.stage) - stageOrder(b.stage);
  if (byStage !== 0) return byStage;
  const byValue = b.value - a.value;
  return byValue !== 0 ? byValue : a.id.localeCompare(b.id);
}

/** Newest first, with the id breaking ties so the order never wobbles. */
function compareActivities(a: Activity, b: Activity): number {
  const byTime = b.occurredAt.localeCompare(a.occurredAt);
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
}

export function dealsInStage(
  dataset: MeridianDataset,
  stage: PipelineStage,
): readonly Deal[] {
  return Object.freeze(
    dataset.deals.filter((deal) => deal.stage === stage).sort(compareDeals),
  );
}

/**
 * Every stage in funnel order, including the empty ones a board still draws.
 *
 * A fresh Map each call, so a caller reaching past the `ReadonlyMap` type can
 * only spoil its own copy.
 */
export function dealsByStage(
  dataset: MeridianDataset,
): ReadonlyMap<PipelineStage, readonly Deal[]> {
  return new Map(
    pipelineStages.map((stage) => [stage, dealsInStage(dataset, stage)]),
  );
}

export function dealsForCompany(
  dataset: MeridianDataset,
  companyId: string,
): readonly Deal[] {
  return Object.freeze(
    dataset.deals
      .filter((deal) => deal.companyId === companyId)
      .sort(compareDeals),
  );
}

export function dealsForOwner(
  dataset: MeridianDataset,
  ownerId: string,
): readonly Deal[] {
  return Object.freeze(
    dataset.deals.filter((deal) => deal.ownerId === ownerId).sort(compareDeals),
  );
}

/** Most senior first, because that is the order a rep reads a buying group in. */
export function contactsForCompany(
  dataset: MeridianDataset,
  companyId: string,
): readonly Contact[] {
  return Object.freeze(
    dataset.contacts
      .filter((contact) => contact.companyId === companyId)
      .sort((a, b) => {
        const bySeniority =
          seniorityRank[a.seniority] - seniorityRank[b.seniority];
        return bySeniority !== 0 ? bySeniority : a.name.localeCompare(b.name);
      }),
  );
}

export function activitiesForDeal(
  dataset: MeridianDataset,
  dealId: string,
): readonly Activity[] {
  return Object.freeze(
    dataset.activities
      .filter((activity) => activity.dealId === dealId)
      .sort(compareActivities),
  );
}

export function activitiesForContact(
  dataset: MeridianDataset,
  contactId: string,
): readonly Activity[] {
  return Object.freeze(
    dataset.activities
      .filter((activity) => activity.contactId === contactId)
      .sort(compareActivities),
  );
}

/**
 * Everything logged against a company: its own deals' activity plus anything
 * recorded against a contact there but no deal.
 */
export function activitiesForCompany(
  dataset: MeridianDataset,
  companyId: string,
): readonly Activity[] {
  const dealIds = new Set(
    dealsForCompany(dataset, companyId).map((deal) => deal.id),
  );
  const contactIds = new Set(
    contactsForCompany(dataset, companyId).map((contact) => contact.id),
  );
  return Object.freeze(
    dataset.activities
      .filter(
        (activity) =>
          (activity.dealId !== null && dealIds.has(activity.dealId)) ||
          (activity.contactId !== null && contactIds.has(activity.contactId)),
      )
      .sort(compareActivities),
  );
}

/**
 * A value restated in the reporting currency at the dataset's own fixed rates.
 *
 * Deals are quoted in the currency the customer buys in, so no total across
 * more than one account can be stated without this step. The rates are part of
 * the dataset rather than fetched, and each converted amount is rounded to
 * whole units, so a total never depends on the order its parts were added in.
 */
export function toReportingCurrency(
  dataset: MeridianDataset,
  value: Money,
): Money {
  if (value.currency === dataset.reportingCurrency) {
    return money(Math.round(value.amount), value.currency);
  }
  return money(
    Math.round(value.amount * dataset.exchangeRates[value.currency]),
    dataset.reportingCurrency,
  );
}

export function dealValue(dataset: MeridianDataset, deal: Deal): Money {
  return toReportingCurrency(dataset, money(deal.value, deal.currency));
}

function sumOf(dataset: MeridianDataset, deals: readonly Deal[]): Money {
  const total = deals.reduce(
    (running, deal) => running + dealValue(dataset, deal).amount,
    0,
  );
  return money(total, dataset.reportingCurrency);
}

function weightedSumOf(
  dataset: MeridianDataset,
  deals: readonly Deal[],
): Money {
  const total = deals.reduce((running, deal) => {
    const converted = dealValue(dataset, deal).amount;
    return running + Math.round((converted * deal.probability) / 100);
  }, 0);
  return money(total, dataset.reportingCurrency);
}

function openDealsOf(deals: readonly Deal[]): readonly Deal[] {
  return deals.filter((deal) => isOpenStage(deal.stage));
}

/** What a company still has in play, in the reporting currency. */
export function openPipelineValue(
  dataset: MeridianDataset,
  companyId: string,
): Money {
  return sumOf(dataset, openDealsOf(dealsForCompany(dataset, companyId)));
}

/** Every open deal on the board, in the reporting currency. */
export function totalOpenPipelineValue(dataset: MeridianDataset): Money {
  return sumOf(dataset, openDealsOf(dataset.deals));
}

/**
 * The funnel summarised stage by stage, in order.
 *
 * Closed stages are included and weighted by their own probability, so a Closed
 * Won column reports its full value and a Closed Lost column reports nothing —
 * which is what a forecast board wants to show beside the open stages.
 */
export function weightedForecastByStage(
  dataset: MeridianDataset,
): readonly StageForecast[] {
  return Object.freeze(
    pipelineStages.map((stage) => {
      const deals = dealsInStage(dataset, stage);
      return Object.freeze({
        stage,
        dealCount: deals.length,
        value: sumOf(dataset, deals),
        weightedValue: weightedSumOf(dataset, deals),
      });
    }),
  );
}
