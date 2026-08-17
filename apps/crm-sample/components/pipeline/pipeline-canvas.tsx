"use client";

/**
 * Meridian's pipeline Canvas: the Bound Canvas Module and the five Panels it
 * renders — the board, a deal, an account, a contact, and a closed stage.
 *
 * The module and its renderers live in one file on purpose. A Bound Canvas
 * Module closes its Panel definitions and its renderers into a single registry,
 * and every renderer reaches back into that module for its typed hooks — so
 * splitting them across files buys nothing but an import cycle. Everything that
 * does not need the module is a plain component in `./record-parts`.
 */

import {
  type EditorStatus,
  usePanelEditor,
} from "@squared-lemons-ltd/canvas-panels/extensions/editor";
import {
  usePanelResource,
  useResourceExchange,
} from "@squared-lemons-ltd/canvas-panels/extensions/resources";
import {
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squared-lemons-ltd/canvas-panels/ui";
import { ArrowRightIcon, UsersIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  activitiesForCompany,
  activitiesForContact,
  activitiesForDeal,
  arrBandLabels,
  contactsForCompany,
  type Deal,
  dealSourceLabels,
  dealsForCompany,
  dealsInStage,
  dealValue,
  formatDate,
  formatMoney,
  formatRelativeDate,
  getCompany,
  getContact,
  getOwner,
  isOpenStage,
  type MeridianDataset,
  openPipelineValue,
  type PipelineStage,
  pipelineStageLabels,
  pipelineStages,
  regionLabels,
  sizeBandLabels,
  totalOpenPipelineValue,
  weightedForecastByStage,
} from "@/src/domain";

import {
  type CompanyInput,
  type ContactInput,
  companyPanel,
  contactPanel,
  type DealInput,
  dealPanel,
  pipelineDeepLink,
  pipelinePanels,
  pipelineRoot,
  type RecordRef,
  type StageInput,
  stagePanel,
} from "./panels";
import {
  ActivityTimeline,
  ContactRoleBadges,
  DealCard,
  expectedClose,
  HealthBadge,
  litRow,
  MetaList,
  MissingRecord,
  OwnerChip,
  PanelHero,
  PanelSection,
  RecordRow,
  StageBadge,
} from "./record-parts";
import {
  companyKey,
  contactKey,
  type DealDraft,
  dealKey,
  meridianSnapshot,
  moveDealStage,
  readDeal,
  resetDeal,
  serviceRoundTrip,
  setDealNextStep,
  subscribeToMeridian,
  writeDealDraft,
} from "./session-store";

/** The stages the board draws as columns. Closed stages get their own Panel. */
const openStages = pipelineStages.filter(isOpenStage);

/**
 * The deal the "team activity" control acts on. It is named rather than picked
 * at random so the demo tells the same story every time, and so the copy can
 * say which record to open first.
 */
const teamActivityDealId = "deal-vantry-mro-analytics";

function useLiveDataset(): MeridianDataset {
  return useSyncExternalStore(
    subscribeToMeridian,
    meridianSnapshot,
    meridianSnapshot,
  );
}

/**
 * Hand a record's address to wherever the reader wants to put it.
 *
 * A Panel Stack is expressible as a URL, and the whole point of that is that
 * somebody else can open it — so the control offers the platform's own share
 * sheet where there is one, and copies to the clipboard where there is not.
 * Both paths end at the same address; only the destination differs.
 *
 * Dismissing the share sheet is a decision, not a failure. It arrives as an
 * `AbortError`, and reporting it would tell a reader something went wrong at
 * the exact moment they said they had changed their mind.
 */
async function shareDeepLink(record: RecordRef, label: string): Promise<void> {
  const path = pipelineDeepLink(record);
  const address =
    typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const payload = { title: label, url: address };

  if (
    typeof navigator.share === "function" &&
    (navigator.canShare?.(payload) ?? true)
  ) {
    try {
      await navigator.share(payload);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Anything else and the sheet failed rather than being dismissed, which
      // the clipboard below can still make good.
    }
  }

  if (!navigator.clipboard) {
    toast.error("Could not share the link", { description: address });
    return;
  }
  try {
    await navigator.clipboard.writeText(address);
    toast.success("Link copied", { description: label });
  } catch {
    toast.error("Could not share the link", { description: address });
  }
}

/**
 * The lifecycle a Panel with nothing to lose registers. Every Panel has to
 * register one to take part in Guarded Transitions and to name where focus
 * lands when it is activated; a Panel that holds no draft has nothing to say
 * beyond "go ahead".
 */
const settledLifecycle = Object.freeze({
  dirty: false,
  guard: () => ({ status: "allow" }) as const,
  save: async () => {},
  discard: async () => {},
});

// --- Root Panel: the board ---------------------------------------------------

function TeamActivity({ dataset }: Readonly<{ dataset: MeridianDataset }>) {
  const exchange = useResourceExchange();
  const navigation = PipelineCanvas.useNavigation();
  const deal = dataset.deals.find(({ id }) => id === teamActivityDealId);
  if (!deal) return null;
  const company = getCompany(dataset, deal.companyId);

  const announce = (message: string) => {
    exchange.publish({ key: dealKey(teamActivityDealId), kind: "changed" });
    toast(message);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <UsersIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
        <h4 className="text-sm font-semibold">Team activity</h4>
      </div>
      <p className="text-sm text-muted-foreground">
        Meridian is shared. These stand in for changes your colleagues make
        while you are working. Open <strong>{deal.title}</strong> at{" "}
        {company?.name}, start typing in its notes, then press one — the deal
        you are editing holds the news until you decide, and the board behind it
        moves straight away.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => navigation.open(dealPanel, { dealId: deal.id })}
          size="sm"
          variant="secondary"
        >
          Open {deal.title}
          <ArrowRightIcon aria-hidden="true" />
        </Button>
        <Button
          onClick={() => {
            moveDealStage(
              teamActivityDealId,
              "negotiation",
              "Tomás: legal has the pilot terms — chase Yasmin for the fleet list.",
            );
            announce(`Tomás Lindqvist moved ${deal.title} to Negotiation`);
          }}
          size="sm"
          variant="outline"
        >
          Tomás moves it to Negotiation
        </Button>
        <Button
          onClick={() => {
            setDealNextStep(
              teamActivityDealId,
              "Nadia: send Yasmin the revised fleet scope before Friday's review.",
            );
            announce(`Nadia Okonjo rewrote the next step on ${deal.title}`);
          }}
          size="sm"
          variant="outline"
        >
          Nadia rewrites the next step
        </Button>
        <Button
          onClick={() => {
            resetDeal(teamActivityDealId);
            announce(`${deal.title} was put back as it was`);
          }}
          size="sm"
          variant="ghost"
        >
          Undo the team's changes
        </Button>
      </div>
    </div>
  );
}

function BoardPanel() {
  const navigation = PipelineCanvas.useNavigation();
  const stack = PipelineCanvas.useStack();
  const dataset = useLiveDataset();
  const heading = useRef<HTMLHeadingElement>(null);
  // The Root Panel claims focus only once something has been opened from it.
  // Registering it unconditionally would move focus on first paint, which puts
  // the reader past the skip link before they have asked to go anywhere.
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => {
    if (stack.length > 1) setEverOpened(true);
  }, [stack.length]);

  PipelineCanvas.useLifecycle({
    ...settledLifecycle,
    ...(everOpened ? { initialFocus: heading } : {}),
  });

  const forecast = weightedForecastByStage(dataset);
  const open = totalOpenPipelineValue(dataset);
  const openCount = dataset.deals.filter((deal) =>
    isOpenStage(deal.stage),
  ).length;

  return (
    <div className="@container flex flex-col">
      <PanelHero
        eyebrow={`Meridian · as at ${formatDate(dataset.today)}`}
        headingRef={heading}
        title="Open pipeline"
        subtitle={`${openCount} open deals worth ${formatMoney(open)} across four stages.`}
      />

      <div className="grid grid-cols-1 gap-4 px-5 py-4 @lg:grid-cols-2 @5xl:grid-cols-4">
        {openStages.map((stage) => {
          const summary = forecast.find((entry) => entry.stage === stage);
          const deals = dealsInStage(dataset, stage);
          return (
            <section
              aria-labelledby={`board-column-${stage}`}
              className="flex min-w-0 flex-col gap-3"
              key={stage}
            >
              <header className="flex flex-col gap-1 rounded-lg border border-border bg-muted/50 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h4
                    className="text-sm font-semibold"
                    id={`board-column-${stage}`}
                  >
                    {pipelineStageLabels[stage]}
                  </h4>
                  <span className="text-xs text-muted-foreground" data-numeric>
                    {deals.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground" data-numeric>
                  <span className="font-semibold text-foreground">
                    {summary
                      ? formatMoney(summary.value, { compact: true })
                      : "—"}
                  </span>{" "}
                  total ·{" "}
                  {summary
                    ? formatMoney(summary.weightedValue, { compact: true })
                    : "—"}{" "}
                  weighted
                </p>
              </header>
              <div className="flex flex-col gap-2">
                {deals.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Nothing in this stage
                  </p>
                ) : (
                  deals.map((deal) => (
                    <DealCard
                      company={getCompany(dataset, deal.companyId)}
                      dataset={dataset}
                      deal={deal}
                      key={deal.id}
                      onSelect={() =>
                        navigation.open(dealPanel, { dealId: deal.id })
                      }
                      owner={getOwner(dataset, deal.ownerId)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <PanelSection
        description="Closed business is off the board, but one click away."
        title="Closed this quarter"
      >
        <div className="flex flex-wrap gap-2">
          {pipelineStages
            .filter((stage) => !isOpenStage(stage))
            .map((stage) => {
              const summary = forecast.find((entry) => entry.stage === stage);
              return (
                <Button
                  className={litRow}
                  // A stage Panel's descriptor is the stage itself, so the
                  // stage is what the trail calls its record — the tether needs
                  // no special case for the one Panel that is not a record.
                  data-meridian-record={stage}
                  key={stage}
                  onClick={() => navigation.open(stagePanel, { stage })}
                  size="sm"
                  variant="outline"
                >
                  {pipelineStageLabels[stage]}
                  <Badge variant="secondary" data-numeric>
                    {summary?.dealCount ?? 0}
                  </Badge>
                </Button>
              );
            })}
        </div>
      </PanelSection>

      <PanelSection title="Working alongside other people">
        <TeamActivity dataset={dataset} />
      </PanelSection>
    </div>
  );
}

// --- Deal Panel --------------------------------------------------------------

const editorSentences: Readonly<Record<Exclude<EditorStatus, "idle">, string>> =
  Object.freeze({
    discarding: "Putting the deal back as it was…",
    loading: "Reading the deal…",
    reloading: "Reading the deal again…",
    saving: "Saving to the deal record…",
  });

function DealPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<DealInput, "deal">) {
  const { dealId } = descriptor;
  const navigation = PipelineCanvas.useNavigation();
  const exchange = useResourceExchange();
  const heading = useRef<HTMLHeadingElement>(null);
  const notesId = useId();
  const nextStepId = useId();

  // What this Panel believes the record says. It is a snapshot rather than a
  // live read on purpose: a change made elsewhere must not overwrite what is on
  // screen until this Panel has decided it may.
  const [record, setRecord] = useState(() => readDeal(dealId));
  const [baseline, setBaseline] = useState<DealDraft>(() => ({
    notes: record?.notes ?? "",
    nextStep: record?.nextStep ?? "",
  }));
  const [draft, setDraft] = useState<DealDraft>(baseline);

  const dirty =
    draft.notes !== baseline.notes || draft.nextStep !== baseline.nextStep;

  const editor = usePanelEditor({
    dirty,
    save: async () => {
      await serviceRoundTrip();
      writeDealDraft(dealId, draft);
      const saved = readDeal(dealId);
      if (saved) setRecord(saved);
      setBaseline(draft);
      // Everyone else showing this deal re-reads it. This Panel does not: the
      // invalidation carries its own token.
      exchange.publish({
        key: dealKey(dealId),
        kind: "changed",
        source: panel.instanceId,
      });
    },
    discard: async () => {
      setDraft(baseline);
    },
    reload: async () => {
      await serviceRoundTrip();
      const fresh = readDeal(dealId);
      if (!fresh) return;
      const next: DealDraft = {
        notes: fresh.notes,
        nextStep: fresh.nextStep ?? "",
      };
      setRecord(fresh);
      setBaseline(next);
      setDraft(next);
    },
  });

  PipelineCanvas.useLifecycle({
    ...editor.lifecycle,
    dirtyLabel: "Unsaved",
    initialFocus: heading,
  });

  // The editor already refuses to read over unsaved work; this composes with it
  // rather than deciding again. A write part-way through is as much in the way
  // as a half-typed note.
  const resource = usePanelResource({
    dirty: editor.dirty || editor.busy,
    keys: [dealKey(dealId)],
    reload: async () => {
      const outcome = await editor.reload({ discardChanges: true });
      // A cancelled operation is not a failure — the Panel simply stopped
      // caring — so only a real refusal is worth holding the invalidation for.
      if (outcome.status === "completed" || outcome.status === "aborted") {
        return;
      }
      throw new Error("The deal could not be read again.");
    },
    source: panel.instanceId,
  });

  const dataset = meridianSnapshot();

  if (!record) {
    return <MissingRecord headingRef={heading} what="deal" />;
  }

  const company = getCompany(dataset, record.companyId);
  const owner = getOwner(dataset, record.ownerId);
  const contact = getContact(dataset, record.primaryContactId);
  const value = dealValue(dataset, record);
  const weighted = Math.round((value.amount * record.probability) / 100);
  const activities = activitiesForDeal(dataset, record.id);

  const statusSentence =
    editor.status === "idle"
      ? editor.dirty
        ? "Unsaved changes"
        : "Everything here is saved"
      : editorSentences[editor.status];

  return (
    <div className="flex flex-col">
      <PipelineCanvas.Action
        id="share-deal-link"
        label="Share"
        onSelect={() =>
          void shareDeepLink({ kind: "deal", id: record.id }, record.title)
        }
      />
      <PanelHero
        eyebrow={company?.name ?? "Deal"}
        headingRef={heading}
        subtitle={`${formatMoney(value)} · closes ${expectedClose(record)}`}
        title={record.title}
      >
        <StageBadge stage={record.stage} />
        <Badge variant="outline" data-numeric>
          {record.probability}% likely
        </Badge>
        <Badge variant="outline">{dealSourceLabels[record.source]}</Badge>
      </PanelHero>

      {resource.pending ? (
        <div
          className="flex flex-col gap-2 border-b border-border bg-warning/12 px-5 py-3"
          role="status"
        >
          <p className="text-sm">
            <strong>A colleague changed this deal</strong> while you were
            writing. Nothing you typed has been touched.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void resource.apply()} size="sm">
              Take their version
            </Button>
            <Button onClick={resource.dismiss} size="sm" variant="outline">
              Keep my draft
            </Button>
          </div>
        </div>
      ) : null}

      <PanelSection title="At a glance">
        <MetaList
          items={[
            ["Value", formatMoney(value)],
            [
              "Weighted",
              formatMoney({ amount: weighted, currency: value.currency }),
            ],
            ["In stage", `${record.daysInStage} days`],
            ["Expected close", expectedClose(record)],
            ["Owner", <OwnerChip key="owner" owner={owner} />],
            ["Source", dealSourceLabels[record.source]],
          ]}
        />
      </PanelSection>

      <PanelSection
        description="Edit either field and the Panel is marked unsaved. Try closing it."
        title="Your working notes"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nextStepId}>Next step</Label>
          <Input
            aria-busy={editor.busy || undefined}
            disabled={editor.busy}
            id={nextStepId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                nextStep: event.target.value,
              }))
            }
            placeholder="What has to happen next?"
            value={draft.nextStep}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={notesId}>Notes</Label>
          <Textarea
            aria-busy={editor.busy || undefined}
            className="min-h-40"
            disabled={editor.busy}
            id={notesId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, notes: event.target.value }))
            }
            value={draft.notes}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={editor.busy || !editor.dirty}
            onClick={() => void editor.save()}
            size="sm"
          >
            Save
          </Button>
          <Button
            disabled={editor.busy || !editor.dirty}
            onClick={() => void editor.discard()}
            size="sm"
            variant="outline"
          >
            Discard
          </Button>
          <span className="text-xs text-muted-foreground">
            {statusSentence}
          </span>
        </div>
        {editor.failure ? (
          <p className="text-sm text-destructive" role="alert">
            The deal could not be saved.{" "}
            <Button onClick={editor.dismissFailure} size="xs" variant="outline">
              Dismiss
            </Button>
          </p>
        ) : null}
      </PanelSection>

      <PanelSection title="Related">
        <div className="flex flex-col gap-2">
          {company ? (
            <RecordRow
              label={`Open the account ${company.name}`}
              onSelect={() =>
                navigation.open(companyPanel, { companyId: company.id })
              }
              primary={company.name}
              recordId={company.id}
              secondary={`${company.industry} · ${regionLabels[company.region]}`}
              trailing="Account"
            />
          ) : null}
          {contact ? (
            <RecordRow
              label={`Open the contact ${contact.name}`}
              onSelect={() =>
                navigation.open(contactPanel, { contactId: contact.id })
              }
              primary={contact.name}
              recordId={contact.id}
              secondary={contact.title}
              trailing="Primary contact"
            />
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title={`Activity (${activities.length})`}>
        <ActivityTimeline
          activities={activities}
          dataset={dataset}
          emptyMessage="Nothing has been logged against this deal yet."
        />
      </PanelSection>
    </div>
  );
}

// --- Company Panel -----------------------------------------------------------

function CompanyPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<CompanyInput, "company">) {
  const { companyId } = descriptor;
  const navigation = PipelineCanvas.useNavigation();
  const heading = useRef<HTMLHeadingElement>(null);
  const [dataset, setDataset] = useState(meridianSnapshot);

  const company = getCompany(dataset, companyId);
  const deals = dealsForCompany(dataset, companyId);

  PipelineCanvas.useLifecycle({ ...settledLifecycle, initialFocus: heading });

  // An account shows its own record and every deal on it, so it listens on all
  // of them. It holds no draft, so what it hears it simply re-reads.
  usePanelResource({
    keys: [companyKey(companyId), ...deals.map((deal) => dealKey(deal.id))],
    reload: async () => {
      await serviceRoundTrip();
      setDataset(meridianSnapshot());
    },
    source: panel.instanceId,
  });

  if (!company) {
    return <MissingRecord headingRef={heading} what="account" />;
  }

  const owner = getOwner(dataset, company.ownerId);
  const contacts = contactsForCompany(dataset, companyId);
  const activities = activitiesForCompany(dataset, companyId).slice(0, 6);

  return (
    <div className="flex flex-col">
      <PipelineCanvas.Action
        id="share-company-link"
        label="Share"
        onSelect={() =>
          void shareDeepLink({ kind: "company", id: company.id }, company.name)
        }
      />
      <PanelHero
        eyebrow="Account"
        headingRef={heading}
        subtitle={company.description}
        title={company.name}
      >
        <HealthBadge company={company} />
        <Badge variant="outline">{sizeBandLabels[company.sizeBand]}</Badge>
        <Badge variant="outline">{regionLabels[company.region]}</Badge>
        <Badge variant="outline">ARR {arrBandLabels[company.arrBand]}</Badge>
      </PanelHero>

      <PanelSection title="At a glance">
        <MetaList
          items={[
            ["Industry", company.industry],
            ["Headquarters", company.headquarters],
            ["Employees", company.employees.toLocaleString("en-GB")],
            [
              "Open pipeline",
              formatMoney(openPipelineValue(dataset, companyId)),
            ],
            ["Account owner", <OwnerChip key="owner" owner={owner} />],
            ["Website", company.website],
          ]}
        />
      </PanelSection>

      <PanelSection
        description="Every deal on this account, in funnel order."
        title={`Deals (${deals.length})`}
      >
        <div className="flex flex-col gap-2">
          {deals.map((deal) => (
            <RecordRow
              key={deal.id}
              label={`Open the deal ${deal.title}`}
              onSelect={() => navigation.open(dealPanel, { dealId: deal.id })}
              primary={deal.title}
              recordId={deal.id}
              secondary={`${pipelineStageLabels[deal.stage]} · ${deal.daysInStage} days in stage`}
              trailing={formatMoney(dealValue(dataset, deal), {
                compact: true,
              })}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection
        description="Most senior first — the order a rep reads a buying group in."
        title={`People (${contacts.length})`}
      >
        <div className="flex flex-col gap-2">
          {contacts.map((contact) => (
            <RecordRow
              key={contact.id}
              label={`Open the contact ${contact.name}`}
              onSelect={() =>
                navigation.open(contactPanel, { contactId: contact.id })
              }
              primary={contact.name}
              recordId={contact.id}
              secondary={contact.title}
              trailing={
                contact.isEconomicBuyer
                  ? "Economic buyer"
                  : contact.isChampion
                    ? "Champion"
                    : undefined
              }
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Recent activity">
        <ActivityTimeline
          activities={activities}
          dataset={dataset}
          emptyMessage="Nothing has been logged against this account yet."
        />
      </PanelSection>
    </div>
  );
}

// --- Contact Panel -----------------------------------------------------------

function ContactPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<ContactInput, "contact">) {
  const { contactId } = descriptor;
  const navigation = PipelineCanvas.useNavigation();
  const heading = useRef<HTMLHeadingElement>(null);
  const [dataset, setDataset] = useState(meridianSnapshot);

  const contact = getContact(dataset, contactId);
  const deals = dataset.deals.filter(
    (deal) => deal.primaryContactId === contactId,
  );

  PipelineCanvas.useLifecycle({ ...settledLifecycle, initialFocus: heading });

  usePanelResource({
    keys: [contactKey(contactId), ...deals.map((deal) => dealKey(deal.id))],
    reload: async () => {
      await serviceRoundTrip();
      setDataset(meridianSnapshot());
    },
    source: panel.instanceId,
  });

  if (!contact) {
    return <MissingRecord headingRef={heading} what="contact" />;
  }

  const company = getCompany(dataset, contact.companyId);
  const activities = activitiesForContact(dataset, contactId);

  return (
    <div className="flex flex-col">
      <PipelineCanvas.Action
        id="share-contact-link"
        label="Share"
        onSelect={() =>
          void shareDeepLink({ kind: "contact", id: contact.id }, contact.name)
        }
      />
      <PanelHero
        eyebrow={company?.name ?? "Contact"}
        headingRef={heading}
        subtitle={contact.title}
        title={contact.name}
      >
        <ContactRoleBadges contact={contact} />
      </PanelHero>

      <PanelSection title="Reaching them">
        <MetaList
          items={[
            ["Email", contact.email],
            ["Phone", contact.phone],
          ]}
        />
      </PanelSection>

      <PanelSection
        description="Deals where this person is the primary contact."
        title={`Deals (${deals.length})`}
      >
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deal names this person as its primary contact.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {deals.map((deal: Deal) => (
              <RecordRow
                key={deal.id}
                label={`Open the deal ${deal.title}`}
                onSelect={() => navigation.open(dealPanel, { dealId: deal.id })}
                primary={deal.title}
                recordId={deal.id}
                secondary={`${pipelineStageLabels[deal.stage]} · closes ${formatRelativeDate(deal.expectedCloseDate)}`}
                trailing={formatMoney(dealValue(dataset, deal), {
                  compact: true,
                })}
              />
            ))}
          </div>
        )}
      </PanelSection>

      {company ? (
        <PanelSection title="Account">
          <RecordRow
            label={`Open the account ${company.name}`}
            onSelect={() =>
              navigation.open(companyPanel, { companyId: company.id })
            }
            primary={company.name}
            recordId={company.id}
            secondary={`${company.industry} · ${regionLabels[company.region]}`}
            trailing="Account"
          />
        </PanelSection>
      ) : null}

      <PanelSection title={`Activity (${activities.length})`}>
        <ActivityTimeline
          activities={activities}
          dataset={dataset}
          emptyMessage="Nothing has been logged with this person yet."
        />
      </PanelSection>
    </div>
  );
}

// --- Stage Panel -------------------------------------------------------------

function StagePanel({
  descriptor,
}: CanvasPanelRenderProps<StageInput, "stage">) {
  const stage: PipelineStage = descriptor.stage;
  const navigation = PipelineCanvas.useNavigation();
  const dataset = useLiveDataset();
  const heading = useRef<HTMLHeadingElement>(null);

  PipelineCanvas.useLifecycle({ ...settledLifecycle, initialFocus: heading });

  const deals = dealsInStage(dataset, stage);
  const summary = weightedForecastByStage(dataset).find(
    (entry) => entry.stage === stage,
  );

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow="Closed business"
        headingRef={heading}
        subtitle={
          summary
            ? `${summary.dealCount} deals worth ${formatMoney(summary.value)}.`
            : undefined
        }
        title={pipelineStageLabels[stage]}
      />
      <div className="flex flex-col gap-2 px-5 py-4">
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has reached this stage.
          </p>
        ) : (
          deals.map((deal) => (
            <DealCard
              company={getCompany(dataset, deal.companyId)}
              dataset={dataset}
              deal={deal}
              key={deal.id}
              onSelect={() => navigation.open(dealPanel, { dealId: deal.id })}
              owner={getOwner(dataset, deal.ownerId)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --- The Bound Canvas Module -------------------------------------------------

export const PipelineCanvas = createCanvasModule({
  root: pipelineRoot,
  panels: pipelinePanels,
  renderers: {
    pipeline: BoardPanel,
    deal: DealPanel,
    company: CompanyPanel,
    contact: ContactPanel,
    stage: StagePanel,
  },
});
