/**
 * The vocabulary of Meridian, the sample B2B CRM.
 *
 * Types only, and deliberately in their own module: a component can name what
 * it renders without importing the dataset that fills it.
 *
 * Ids are hand-written, URL-safe slugs rather than generated identifiers,
 * because every one of them becomes part of a deep link into the Canvas. They
 * are typed as plain strings so a value read out of a URL can be handed
 * straight to a lookup without a cast.
 */

export type Region =
  | "north-america"
  | "uk-ireland"
  | "europe"
  | "apac"
  /** A territory rather than a place: the strategic accounts book. */
  | "global";

export type Currency = "USD" | "GBP" | "EUR";

export type CompanySizeBand = "smb" | "mid-market" | "enterprise";

export type HealthSignal = "strong" | "steady" | "watch" | "at-risk";

export type ArrBand = "none" | "under-50k" | "50k-250k" | "250k-1m" | "1m-plus";

export type Seniority =
  | "c-suite"
  | "vp"
  | "director"
  | "manager"
  | "individual-contributor";

/** The pipeline stages, always handled in the order declared here. */
export type PipelineStage =
  | "qualify"
  | "discovery"
  | "proposal"
  | "negotiation"
  | "closed-won"
  | "closed-lost";

export type DealSource =
  | "inbound"
  | "outbound"
  | "partner"
  | "event"
  | "referral"
  | "expansion";

export type ActivityKind = "call" | "email" | "meeting" | "note";

/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;

/** An instant as `YYYY-MM-DDTHH:MM:SSZ`. */
export type IsoTimestamp = string;

export type Money = Readonly<{
  amount: number;
  currency: Currency;
}>;

/** A sales representative. Quotas are stated in the reporting currency. */
export type Owner = Readonly<{
  id: string;
  name: string;
  initials: string;
  title: string;
  region: Region;
  quota: number;
}>;

export type Company = Readonly<{
  id: string;
  name: string;
  industry: string;
  sizeBand: CompanySizeBand;
  employees: number;
  region: Region;
  headquarters: string;
  website: string;
  description: string;
  health: HealthSignal;
  arrBand: ArrBand;
  ownerId: string;
}>;

export type Contact = Readonly<{
  id: string;
  name: string;
  title: string;
  companyId: string;
  email: string;
  phone: string;
  seniority: Seniority;
  isEconomicBuyer: boolean;
  isChampion: boolean;
}>;

export type Deal = Readonly<{
  id: string;
  title: string;
  companyId: string;
  ownerId: string;
  primaryContactId: string;
  value: number;
  currency: Currency;
  stage: PipelineStage;
  /** Percentage, 0–100. Closed Won is 100 and Closed Lost is 0. */
  probability: number;
  expectedCloseDate: IsoDate;
  stageEnteredOn: IsoDate;
  source: DealSource;
  /** `null` once a deal has closed, because there is nothing left to do. */
  nextStep: string | null;
  /** The one field the demo lets a visitor edit. */
  notes: string;
  /**
   * Whole days since `stageEnteredOn`, derived at load time against the
   * dataset's fixed today rather than the clock, so the number a visitor sees
   * is the same on every load.
   */
  daysInStage: number;
}>;

export type Activity = Readonly<{
  id: string;
  kind: ActivityKind;
  subject: string;
  body: string;
  occurredAt: IsoTimestamp;
  ownerId: string;
  /** `null` for account-level activity that belongs to no single deal. */
  dealId: string | null;
  /** `null` for internal notes with no counterparty. */
  contactId: string | null;
}>;

export type MeridianDataset = Readonly<{
  /** The fixed date the whole demo is presented as of. */
  today: IsoDate;
  reportingCurrency: Currency;
  /** Units of the reporting currency per unit of each deal currency. */
  exchangeRates: Readonly<Record<Currency, number>>;
  owners: readonly Owner[];
  companies: readonly Company[];
  contacts: readonly Contact[];
  deals: readonly Deal[];
  activities: readonly Activity[];
}>;

/** One stage of the funnel, summarised in the reporting currency. */
export type StageForecast = Readonly<{
  stage: PipelineStage;
  dealCount: number;
  value: Money;
  weightedValue: Money;
}>;

export type DatasetProblemKind =
  | "duplicate-id"
  | "missing-reference"
  | "cross-entity-mismatch"
  | "date-order"
  | "stage-probability";

/**
 * One thing wrong with the dataset, described well enough to fix without
 * opening a debugger. Problems are collected rather than thrown one at a time
 * so a single run reports everything that is broken.
 */
export type DatasetProblem = Readonly<{
  kind: DatasetProblemKind;
  /** The id of the record at fault. */
  subject: string;
  detail: string;
}>;
