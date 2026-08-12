import assert from "node:assert/strict";
import test from "node:test";

import {
  activitiesForCompany,
  activitiesForContact,
  activitiesForDeal,
  assertDatasetIntegrity,
  contactsForCompany,
  dateOf,
  daysBetween,
  dealsByStage,
  dealsForCompany,
  dealsForOwner,
  dealsInStage,
  dealValue,
  findConsistencyProblems,
  findReferenceProblems,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelativeDate,
  getActivity,
  getCompany,
  getContact,
  getDeal,
  getOwner,
  isOpenStage,
  loadMeridianDataset,
  meridianToday,
  money,
  openPipelineValue,
  pipelineStages,
  totalOpenPipelineValue,
  weightedForecastByStage,
} from "../apps/crm-sample/src/domain/index.ts";

const dataset = loadMeridianDataset();

// The dataset ships as source, so these counts are a contract: a panel laid out
// for a real workday looks wrong the moment someone quietly halves it.
test("the dataset is the size a real workday looks like", () => {
  assert.equal(dataset.today, "2026-08-12");
  assert.equal(dataset.reportingCurrency, "USD");
  assert.equal(dataset.owners.length, 5);
  assert.equal(dataset.companies.length, 14);
  assert.equal(dataset.contacts.length, 37);
  assert.equal(dataset.deals.length, 30);
  assert.equal(dataset.activities.length, 72);
});

test("loading twice returns the same frozen structures", () => {
  assert.equal(loadMeridianDataset(), dataset);
  assert.equal(Object.isFrozen(dataset), true);
  assert.equal(Object.isFrozen(dataset.deals), true);
  for (const deal of dataset.deals) assert.equal(Object.isFrozen(deal), true);
});

test("every id is a readable, URL-safe slug prefixed by its entity", () => {
  const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const prefixes = [
    ["owner", dataset.owners],
    ["company", dataset.companies],
    ["contact", dataset.contacts],
    ["deal", dataset.deals],
    ["activity", dataset.activities],
  ];

  for (const [prefix, records] of prefixes) {
    for (const { id } of records) {
      assert.match(id, slug, `${id} is not URL-safe`);
      assert.equal(id.startsWith(`${prefix}-`), true, `${id} lacks its prefix`);
      assert.equal(encodeURIComponent(id), id);
    }
  }
});

// --- Referential integrity --------------------------------------------------

test("the shipped dataset has no dangling references", () => {
  assert.deepEqual(findReferenceProblems(dataset), []);
});

test("a deal pointing at a missing owner is reported", () => {
  const [first, ...rest] = dataset.deals;
  const broken = {
    ...dataset,
    deals: [{ ...first, ownerId: "owner-nobody" }, ...rest],
  };

  const problems = findReferenceProblems(broken);

  assert.deepEqual(problems, [
    {
      kind: "missing-reference",
      subject: first.id,
      detail: "no owner owner-nobody",
    },
  ]);
});

test("a contact pointing at a missing company is reported", () => {
  const [first, ...rest] = dataset.contacts;
  const broken = {
    ...dataset,
    contacts: [{ ...first, companyId: "company-nobody" }, ...rest],
  };

  const problems = findReferenceProblems(broken);

  assert.equal(
    problems.some(
      ({ kind, subject }) =>
        kind === "missing-reference" && subject === first.id,
    ),
    true,
  );
});

test("a primary contact belonging to another company is reported", () => {
  const deal = getDeal(dataset, "deal-northwind-network-rollout");
  const others = dataset.deals.filter(({ id }) => id !== deal.id);
  const broken = {
    ...dataset,
    deals: [{ ...deal, primaryContactId: "contact-gwen-abernathy" }, ...others],
  };

  assert.deepEqual(findReferenceProblems(broken), [
    {
      kind: "cross-entity-mismatch",
      subject: deal.id,
      detail:
        "primary contact contact-gwen-abernathy belongs to another company",
    },
  ]);
});

test("an activity naming a deal and a contact from different accounts is reported", () => {
  const [first, ...rest] = dataset.activities;
  const broken = {
    ...dataset,
    activities: [{ ...first, contactId: "contact-margot-cheyne" }, ...rest],
  };

  assert.deepEqual(findReferenceProblems(broken), [
    {
      kind: "cross-entity-mismatch",
      subject: first.id,
      detail:
        "contact contact-margot-cheyne does not belong to the deal's company",
    },
  ]);
});

test("a reused id is reported", () => {
  const [first, second, ...rest] = dataset.companies;
  const broken = {
    ...dataset,
    companies: [first, { ...second, id: first.id }, ...rest],
  };

  assert.equal(
    findReferenceProblems(broken).some(({ kind }) => kind === "duplicate-id"),
    true,
  );
});

// --- Date and stage consistency ---------------------------------------------

test("the shipped dataset is internally consistent in time", () => {
  assert.deepEqual(findConsistencyProblems(dataset), []);
  assert.doesNotThrow(() => assertDatasetIntegrity(dataset));
});

test("open deals close in the future and closed deals in the past", () => {
  for (const deal of dataset.deals) {
    const distance = daysBetween(dataset.today, deal.expectedCloseDate);
    if (isOpenStage(deal.stage)) {
      assert.equal(distance > 0, true, `${deal.id} closes in the past`);
    } else {
      assert.equal(distance <= 0, true, `${deal.id} closes in the future`);
    }
  }
});

test("no activity postdates today or the close of the deal it belongs to", () => {
  const closed = new Map(
    dataset.deals
      .filter((deal) => !isOpenStage(deal.stage))
      .map((deal) => [deal.id, deal.expectedCloseDate]),
  );

  for (const activity of dataset.activities) {
    const day = dateOf(activity.occurredAt);
    assert.equal(
      daysBetween(dataset.today, day) <= 0,
      true,
      `${activity.id} happens in the future`,
    );
    const closeDate = closed.get(activity.dealId);
    if (closeDate !== undefined) {
      assert.equal(
        daysBetween(closeDate, day) <= 0,
        true,
        `${activity.id} postdates a closed deal`,
      );
    }
  }
});

test("days in stage is derived from the fixed today, not the clock", () => {
  for (const deal of dataset.deals) {
    assert.equal(
      deal.daysInStage,
      daysBetween(deal.stageEnteredOn, meridianToday),
    );
    assert.equal(deal.daysInStage >= 0, true);
  }
  assert.equal(
    getDeal(dataset, "deal-saltmarsh-vessel-scheduling").daysInStage,
    54,
  );
});

test("an activity after its deal closed is reported", () => {
  const won = getDeal(dataset, "deal-verdant-yield-platform");
  const [first, ...rest] = dataset.activities;
  const broken = {
    ...dataset,
    activities: [
      { ...first, dealId: won.id, occurredAt: "2026-08-01T09:00:00Z" },
      ...rest,
    ],
  };

  assert.equal(
    findConsistencyProblems(broken).some(
      ({ kind, subject, detail }) =>
        kind === "date-order" &&
        subject === first.id &&
        detail.includes(won.id),
    ),
    true,
  );
});

test("a closed deal whose probability contradicts its stage is reported", () => {
  const won = getDeal(dataset, "deal-verdant-yield-platform");
  const others = dataset.deals.filter(({ id }) => id !== won.id);
  const broken = {
    ...dataset,
    deals: [{ ...won, probability: 60 }, ...others],
  };

  assert.deepEqual(findConsistencyProblems(broken), [
    {
      kind: "stage-probability",
      subject: won.id,
      detail: "Closed Won must be 100%",
    },
  ]);
});

test("an open deal dated in the past is reported", () => {
  const open = getDeal(dataset, "deal-orrery-cell-monitoring");
  const others = dataset.deals.filter(({ id }) => id !== open.id);
  const broken = {
    ...dataset,
    deals: [{ ...open, expectedCloseDate: "2026-08-01" }, ...others],
  };

  assert.deepEqual(findConsistencyProblems(broken), [
    {
      kind: "date-order",
      subject: open.id,
      detail: "is open but does not close in the future",
    },
  ]);
});

test("assertDatasetIntegrity names every problem it found", () => {
  const [first, ...rest] = dataset.deals;
  const broken = {
    ...dataset,
    deals: [{ ...first, ownerId: "owner-nobody" }, ...rest],
  };

  assert.throws(
    () => assertDatasetIntegrity(broken),
    /missing-reference: deal-.*owner-nobody/,
  );
});

// --- The funnel -------------------------------------------------------------

test("the funnel is fat at the top and thin at Negotiation", () => {
  const byStage = dealsByStage(dataset);
  const counts = pipelineStages.map((stage) => byStage.get(stage).length);

  assert.deepEqual(counts, [9, 8, 5, 3, 3, 2]);
  assert.equal(
    counts.slice(0, 4).every((count, index, open) => {
      const previous = open[index - 1];
      return previous === undefined || count <= previous;
    }),
    true,
    "the open stages must narrow towards Negotiation",
  );
  assert.equal(
    counts.reduce((total, count) => total + count, 0),
    dataset.deals.length,
  );
});

test("dealsInStage returns only that stage, richest first", () => {
  const proposals = dealsInStage(dataset, "proposal");

  assert.equal(proposals.length, 5);
  for (const deal of proposals) assert.equal(deal.stage, "proposal");
  const values = proposals.map((deal) => deal.value);
  assert.deepEqual(
    values,
    [...values].sort((a, b) => b - a),
  );
});

test("weighted forecast covers every stage and never exceeds its own value", () => {
  const forecast = weightedForecastByStage(dataset);

  assert.deepEqual(
    forecast.map(({ stage }) => stage),
    [...pipelineStages],
  );
  for (const stage of forecast) {
    assert.equal(stage.value.currency, "USD");
    assert.equal(stage.weightedValue.amount <= stage.value.amount, true);
  }

  const won = forecast.find(({ stage }) => stage === "closed-won");
  assert.equal(won.weightedValue.amount, won.value.amount);
  const lost = forecast.find(({ stage }) => stage === "closed-lost");
  assert.equal(lost.weightedValue.amount, 0);

  const openTotal = forecast
    .filter(({ stage }) => isOpenStage(stage))
    .reduce((total, stage) => total + stage.value.amount, 0);
  assert.deepEqual(totalOpenPipelineValue(dataset), {
    amount: openTotal,
    currency: "USD",
  });
});

test("open pipeline is reported in the reporting currency at fixed rates", () => {
  assert.deepEqual(totalOpenPipelineValue(dataset), {
    amount: 4821400,
    currency: "USD",
  });
  // Ellerby sells in sterling, so its total exercises the conversion.
  assert.deepEqual(openPipelineValue(dataset, "company-ellerby-utilities"), {
    amount: 1073150,
    currency: "USD",
  });
  assert.deepEqual(
    dealValue(dataset, getDeal(dataset, "deal-ellerby-grid-programme")),
    { amount: 787400, currency: "USD" },
  );
  // A won deal is not pipeline.
  assert.deepEqual(openPipelineValue(dataset, "company-verdant-agritech"), {
    amount: 45780,
    currency: "USD",
  });
});

// --- Selectors --------------------------------------------------------------

test("deals and contacts can be reached from their company", () => {
  const deals = dealsForCompany(dataset, "company-northwind-logistics");
  assert.deepEqual(
    deals.map(({ id }) => id),
    [
      "deal-northwind-driver-app",
      "deal-northwind-yard-telemetry",
      "deal-northwind-network-rollout",
    ],
    "funnel order, the same order the board draws its columns in",
  );

  const contacts = contactsForCompany(dataset, "company-northwind-logistics");
  assert.deepEqual(
    contacts.map(({ id }) => id),
    [
      "contact-dale-whitcombe",
      "contact-marisol-tavares",
      "contact-eugene-hartsook",
    ],
    "most senior first",
  );

  assert.deepEqual(dealsForCompany(dataset, "company-nobody"), []);
  assert.deepEqual(contactsForCompany(dataset, "company-nobody"), []);
});

test("every deal and contact belongs to a company that lists it", () => {
  for (const deal of dataset.deals) {
    assert.equal(
      dealsForCompany(dataset, deal.companyId).includes(deal),
      true,
      `${deal.id} is missing from its company`,
    );
  }
  for (const contact of dataset.contacts) {
    assert.equal(
      contactsForCompany(dataset, contact.companyId).includes(contact),
      true,
      `${contact.id} is missing from its company`,
    );
  }
});

test("deals can be reached from their owner", () => {
  const deals = dealsForOwner(dataset, "owner-tomas-lindqvist");

  assert.deepEqual(
    deals.map(({ id }) => id),
    [
      "deal-vantry-mro-analytics",
      "deal-vantry-supplier-quality",
      "deal-ellerby-grid-programme",
    ],
  );
  assert.deepEqual(dealsForOwner(dataset, "owner-nobody"), []);
});

test("activity reads newest first from a deal, a contact, or a company", () => {
  const forDeal = activitiesForDeal(dataset, "deal-ellerby-grid-programme");
  assert.deepEqual(
    forDeal.map(({ id }) => id),
    [
      "activity-ellerby-grid-order-form-email",
      "activity-ellerby-grid-commercial-review",
      "activity-ellerby-grid-uplift-note",
      "activity-ellerby-grid-procurement-note",
      "activity-ellerby-grid-partner-intro",
    ],
  );

  const forContact = activitiesForContact(dataset, "contact-nerys-gallacher");
  assert.deepEqual(
    forContact.map(({ id }) => id),
    [
      "activity-harrowgate-store-ops-discovery",
      "activity-harrowgate-nerys-checkin-call",
      "activity-harrowgate-store-ops-forum-meeting",
    ],
  );

  const timestamps = forDeal.map(({ occurredAt }) => occurredAt);
  assert.deepEqual(timestamps, [...timestamps].sort().reverse());

  assert.deepEqual(activitiesForDeal(dataset, "deal-nobody"), []);
  assert.deepEqual(activitiesForContact(dataset, "contact-nobody"), []);
});

test("a company's timeline includes account-level activity with no deal", () => {
  const timeline = activitiesForCompany(dataset, "company-verdant-agritech");
  const ids = timeline.map(({ id }) => id);

  assert.equal(ids.includes("activity-verdant-onboarding-note"), true);
  assert.equal(
    getActivity(dataset, "activity-verdant-onboarding-note").dealId,
    null,
  );
  assert.equal(new Set(ids).size, ids.length, "no activity is listed twice");
});

test("lookups by id return undefined rather than throwing", () => {
  assert.equal(getOwner(dataset, "owner-nadia-okonjo").initials, "NO");
  assert.equal(
    getCompany(dataset, "company-quandong-systems").name,
    "Quandong Systems",
  );
  assert.equal(getContact(dataset, "contact-hemi-rawiri").seniority, "vp");
  assert.equal(getDeal(dataset, "deal-northwind-driver-app").stage, "qualify");
  assert.equal(
    getActivity(dataset, "activity-northwind-driver-app-note").kind,
    "note",
  );

  assert.equal(getOwner(dataset, "owner-nobody"), undefined);
  assert.equal(getCompany(dataset, "company-nobody"), undefined);
  assert.equal(getContact(dataset, "contact-nobody"), undefined);
  assert.equal(getDeal(dataset, "deal-nobody"), undefined);
  assert.equal(getActivity(dataset, "activity-nobody"), undefined);
  assert.equal(getDeal(dataset, ""), undefined);
});

// --- Formatters -------------------------------------------------------------

test("money formats identically everywhere, with a compact form for cards", () => {
  assert.equal(formatMoney(money(480000, "USD")), "$480,000");
  assert.equal(formatMoney(money(620000, "GBP")), "£620,000");
  assert.equal(formatMoney(money(42000, "EUR")), "€42,000");
  assert.equal(formatMoney(money(950, "USD")), "$950");
  assert.equal(formatMoney(money(-52000, "GBP")), "-£52,000");

  assert.equal(formatMoney(money(480000, "USD"), { compact: true }), "$480K");
  assert.equal(formatMoney(money(4821400, "USD"), { compact: true }), "$4.8M");
  assert.equal(formatMoney(money(1000000, "USD"), { compact: true }), "$1M");
  assert.equal(formatMoney(money(4500, "EUR"), { compact: true }), "€4.5K");
  assert.equal(formatMoney(money(950, "USD"), { compact: true }), "$950");
});

test("relative dates are phrased against the fixed today", () => {
  assert.equal(formatRelativeDate("2026-08-12"), "Today");
  assert.equal(formatRelativeDate("2026-08-13"), "Tomorrow");
  assert.equal(formatRelativeDate("2026-08-11"), "Yesterday");
  assert.equal(formatRelativeDate("2026-08-15"), "In 3 days");
  assert.equal(formatRelativeDate("2026-08-06"), "6 days ago");
  assert.equal(formatRelativeDate("2026-08-19"), "In 1 week");
  assert.equal(formatRelativeDate("2026-09-02"), "In 3 weeks");
  assert.equal(formatRelativeDate("2026-06-19"), "2 months ago");
  assert.equal(formatRelativeDate("2026-12-15"), "In 4 months");

  // The default today is the dataset's, and an explicit one overrides it.
  assert.equal(formatRelativeDate("2026-08-12", "2026-08-05"), "In 1 week");
});

test("absolute dates and instants read the same in every runtime", () => {
  assert.equal(formatDate("2026-08-12"), "12 Aug 2026");
  assert.equal(formatDate("2026-01-05"), "5 Jan 2026");
  assert.equal(formatDateTime("2026-08-11T08:05:00Z"), "11 Aug 2026, 08:05");
  assert.equal(dateOf("2026-08-11T08:05:00Z"), "2026-08-11");
  assert.equal(daysBetween("2026-08-12", "2026-08-19"), 7);
  assert.equal(daysBetween("2026-08-19", "2026-08-12"), -7);
  assert.equal(daysBetween("2026-08-12", "2026-08-12"), 0);
});
