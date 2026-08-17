"use client";

/**
 * The territory book: one change at the top, every Panel beneath it refreshing
 * itself in place.
 *
 * The Pipeline already publishes Resource Invalidations, but only ever about
 * one record, to Panels that happen to be showing that record. This is the
 * other half of the Resource Exchange: an invalidation published `nested`,
 * which reaches every subscription *strictly beneath* the key it names.
 *
 * Three things are worth watching, and each Panel is instrumented so they can
 * be:
 *
 *   - **Down, not up.** Edit a territory and both the account and the deal
 *     beneath it re-read. Edit the account and only the deal does — the
 *     territory's read counter does not move. A child's change never implies
 *     anything about its parent, and no flag can make it.
 *   - **In place.** A re-read is the application's own function running again.
 *     Nothing remounts, nothing is replaced, scroll positions survive, and the
 *     Panel says how many times it has done it.
 *   - **Not to the publisher.** Whoever made the change declares itself the
 *     source and is suppressed from its own announcement. It already knows.
 */

import {
  usePanelResource,
  useResourceExchange,
} from "@squaredlemons/canvas-panels/extensions/resources";
import {
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squaredlemons/canvas-panels/ui";
import { ArrowDownIcon, RadioTowerIcon, RotateCwIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  MetaList,
  MissingRecord,
  PanelHero,
  PanelSection,
  RecordRow,
} from "@/components/pipeline/record-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatMoney,
  loadMeridianDataset,
  openPipelineValue,
  pipelineStageLabels,
  regionLabels,
} from "@/src/domain";

import { accountKey, dealKey, territoryKey } from "./territory-keys";
import {
  type AccountInput,
  accountPanel,
  type DealInput,
  dealPanel,
  territoriesRoot,
  type TerritoryInput,
  territoryPanel,
  territoryPanels,
} from "./territory-panels";
import {
  type AccountRecord,
  accountsInTerritory,
  accountOfDeal,
  type DealRecord,
  dealsOnAccount,
  readAccount,
  readDeal,
  readTerritory,
  resetTerritories,
  type TerritoryRecord,
  territoryOfAccount,
  territoryRoundTrip,
  writeAccountStatus,
  writeDealNextStep,
  writeTerritoryLabel,
} from "./territory-store";

const dataset = loadMeridianDataset();

const settled = Object.freeze({
  dirty: false,
  guard: () => ({ status: "allow" }) as const,
  save: async () => {},
  discard: async () => {},
});

/* -------------------------------------------------------------------------- *
 *  Making a re-read visible
 * -------------------------------------------------------------------------- */

/**
 * The band every Panel wears, and the instrument this whole section is built
 * around.
 *
 * A refresh that lands correctly is invisible — which is the point of doing it
 * in place, and useless for showing that it happened. So each Panel counts its
 * own reads and says so, and the band flashes while one is running. Nothing
 * here is load-bearing: delete it and the cascade works exactly as it does now,
 * silently.
 */
function ReadBand({
  reads,
  reloading,
  revision,
  keyName,
}: Readonly<{
  reads: number;
  reloading: boolean;
  revision: number;
  keyName: string;
}>) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-2 text-xs transition-colors duration-500 ${
        reloading
          ? "border-primary/40 bg-primary/15 text-foreground"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
      data-meridian-read-band={reloading ? "reading" : "settled"}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <RotateCwIcon
          aria-hidden="true"
          className={`size-3.5 ${reloading ? "animate-spin" : ""}`}
        />
        {reloading ? "Re-reading…" : `Read ${reads}×`}
      </span>
      <span data-numeric>revision {revision}</span>
      <code className="min-w-0 truncate font-mono text-[0.6875rem] opacity-80">
        {keyName}
      </code>
    </div>
  );
}

/** A Panel holding an invalidation it is not ready for. */
function HeldNotice({
  onApply,
  onDismiss,
}: Readonly<{ onApply: () => void; onDismiss: () => void }>) {
  return (
    <div
      className="flex flex-col gap-2 border-b border-border bg-warning/12 px-5 py-3"
      role="status"
    >
      <p className="text-sm">
        <strong>The change reached this Panel</strong> while you were typing.
        Nothing you wrote has been touched, and the read is waiting.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onApply} size="sm">
          Take the update
        </Button>
        <Button onClick={onDismiss} size="sm" variant="outline">
          Keep my draft
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Root Panel
 * -------------------------------------------------------------------------- */

function TerritoriesRoot() {
  const navigation = TerritoryCanvas.useNavigation();
  const heading = useRef<HTMLHeadingElement>(null);
  const [, redraw] = useState(0);
  TerritoryCanvas.useLifecycle({ ...settled, initialFocus: heading });

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow={`${dataset.owners.length} territories`}
        headingRef={heading}
        subtitle="Open a territory, an account inside it, and a deal on that account. Then change something at the top and watch what happens underneath."
        title="Territories"
      />

      <PanelSection
        description="Every Panel subscribes to a Resource Key that spells out where it sits: a territory, an account inside one, a deal on that account. An invalidation published `nested` reaches every subscription strictly beneath the key it names — and nothing above it."
        title="How the cascade is wired"
      >
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
          {`territories/{owner}
territories/{owner}/accounts/{company}
territories/{owner}/accounts/{company}/deals/{deal}`}
        </pre>
      </PanelSection>

      <PanelSection title="Open a territory">
        <div className="flex flex-col gap-2">
          {dataset.owners.map((owner) => {
            const record = readTerritory(owner.id);
            const accounts = accountsInTerritory(owner.id);
            return (
              <RecordRow
                key={owner.id}
                label={`Open the ${owner.name} territory`}
                onSelect={() =>
                  navigation.open(territoryPanel, { ownerId: owner.id })
                }
                primary={owner.name}
                recordId={owner.id}
                secondary={`${record?.label ?? ""} · ${accounts.length} accounts`}
                trailing={regionLabels[owner.region]}
              />
            );
          })}
        </div>
      </PanelSection>

      <PanelSection
        description="Puts every label, status and next step back as it started, so the demonstration can be run again."
        title="Start again"
      >
        <Button
          onClick={() => {
            resetTerritories();
            redraw((count) => count + 1);
            toast("Territories reset", {
              description:
                "Nothing was announced — close and reopen the Panels to read the originals.",
            });
          }}
          size="sm"
          variant="outline"
        >
          Reset everything
        </Button>
      </PanelSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Territory — the top of the cascade
 * -------------------------------------------------------------------------- */

function TerritoryPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<TerritoryInput, "territory">) {
  const { ownerId } = descriptor;
  const navigation = TerritoryCanvas.useNavigation();
  const exchange = useResourceExchange();
  const heading = useRef<HTMLHeadingElement>(null);
  TerritoryCanvas.useLifecycle({ ...settled, initialFocus: heading });

  const [record, setRecord] = useState<TerritoryRecord | undefined>(() =>
    readTerritory(ownerId),
  );
  const [reads, setReads] = useState(1);
  const [draft, setDraft] = useState(() => readTerritory(ownerId)?.label ?? "");

  const self = territoryKey(ownerId);

  const resource = usePanelResource({
    keys: [self],
    source: panel.instanceId,
    reload: async () => {
      await territoryRoundTrip();
      setRecord(readTerritory(ownerId));
      setReads((count) => count + 1);
    },
  });

  if (!record) return <MissingRecord headingRef={heading} what="territory" />;

  const accounts = accountsInTerritory(ownerId);

  const rename = () => {
    const label = draft.trim();
    if (label === "" || label === record.label) return;
    const revision = writeTerritoryLabel(ownerId, label);
    setRecord(readTerritory(ownerId));
    /*
     * `nested: true` is the entire cascade. Without it this announcement would
     * reach a subscription on exactly this key and stop; with it, every account
     * in this territory and every deal on those accounts hears it too.
     *
     * The source is this Panel, so it is suppressed from its own announcement.
     * It already knows: it did the writing.
     */
    const outcome = exchange.publish({
      kind: "changed",
      key: self,
      nested: true,
      source: panel.instanceId,
    });
    /*
     * `notified` counts *subscriptions*, not Panels — the strip under the
     * Canvas is a subscriber too, and saying "Panels" would be off by one for
     * anybody who counted the columns.
     */
    toast(`Territory renamed to “${label}”`, {
      description: `Revision ${revision}. ${outcome.notified} subscriptions were told: every Panel beneath this key, and the strip below. This Panel was not — it is the source.`,
    });
  };

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow="Territory"
        headingRef={heading}
        subtitle={`${record.owner.title} · quota ${formatMoney({ amount: record.owner.quota, currency: dataset.reportingCurrency })}`}
        title={record.owner.name}
      />
      <ReadBand
        keyName={self}
        reads={reads}
        reloading={resource.reloading}
        revision={record.revision}
      />

      <PanelSection
        description="Rename it and everything open beneath this Panel re-reads itself in place. Nothing above it moves, because there is nothing above it — and if there were, it would not hear this either."
        title="The label everything beneath inherits"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${panel.instanceId}-label`}>Territory label</Label>
          <Input
            id={`${panel.instanceId}-label`}
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
        </div>
        <Button
          className="self-start"
          disabled={draft.trim() === "" || draft.trim() === record.label}
          onClick={rename}
          size="sm"
        >
          <RadioTowerIcon aria-hidden="true" />
          Publish, nested
        </Button>
      </PanelSection>

      <PanelSection title={`Accounts (${accounts.length})`}>
        <div className="flex flex-col gap-2">
          {accounts.map((company) => (
            <RecordRow
              key={company.id}
              label={`Open the account ${company.name}`}
              onSelect={() =>
                navigation.open(accountPanel, { companyId: company.id })
              }
              primary={company.name}
              recordId={company.id}
              secondary={company.industry}
              trailing={formatMoney(openPipelineValue(dataset, company.id), {
                compact: true,
              })}
            />
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Account — the middle, which both hears and publishes
 * -------------------------------------------------------------------------- */

function AccountPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<AccountInput, "account">) {
  const { companyId } = descriptor;
  const navigation = TerritoryCanvas.useNavigation();
  const exchange = useResourceExchange();
  const heading = useRef<HTMLHeadingElement>(null);
  TerritoryCanvas.useLifecycle({ ...settled, initialFocus: heading });

  const ownerId = territoryOfAccount(companyId) ?? "";
  const self = accountKey(ownerId, companyId);

  const [record, setRecord] = useState<AccountRecord | undefined>(() =>
    readAccount(companyId),
  );
  const [territory, setTerritory] = useState<TerritoryRecord | undefined>(() =>
    readTerritory(ownerId),
  );
  const [reads, setReads] = useState(1);
  const [draft, setDraft] = useState(
    () => readAccount(companyId)?.status ?? "",
  );

  /*
   * One subscription, on this Panel's own key — and it hears a nested
   * announcement on the territory above it because `nested` reaches everything
   * strictly beneath, not because this Panel asked for the territory as well.
   * A Panel names where it *is*, and the publisher decides how far a change
   * travels.
   */
  const resource = usePanelResource({
    keys: [self],
    source: panel.instanceId,
    reload: async () => {
      await territoryRoundTrip();
      setRecord(readAccount(companyId));
      setTerritory(readTerritory(ownerId));
      setReads((count) => count + 1);
    },
  });

  if (!record) return <MissingRecord headingRef={heading} what="account" />;

  const deals = dealsOnAccount(companyId);

  const restatus = () => {
    const status = draft.trim();
    if (status === "" || status === record.status) return;
    const revision = writeAccountStatus(companyId, status);
    setRecord(readAccount(companyId));
    const outcome = exchange.publish({
      kind: "changed",
      key: self,
      nested: true,
      source: panel.instanceId,
    });
    toast(`Account status set to “${status}”`, {
      description: `Revision ${revision}. ${outcome.notified} subscriptions beneath this account heard it — the deal Panels, and the strip below. The territory above did not: propagation runs downward only.`,
    });
  };

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow={territory?.label ?? "Account"}
        headingRef={heading}
        subtitle={`${record.company.industry} · ${record.company.headquarters}`}
        title={record.company.name}
      />
      <ReadBand
        keyName={self}
        reads={reads}
        reloading={resource.reloading}
        revision={record.revision}
      />

      <PanelSection title="What this Panel inherited">
        <MetaList
          items={[
            ["Territory label", territory?.label ?? "—"],
            ["Status", record.status],
            [
              "Open pipeline",
              formatMoney(openPipelineValue(dataset, companyId)),
            ],
            ["Region", regionLabels[record.company.region]],
          ]}
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowDownIcon aria-hidden="true" className="size-3.5" />
          The territory label above arrived by cascade. This Panel never
          subscribed to the territory.
        </p>
      </PanelSection>

      <PanelSection
        description="Publishing from here reaches the deals beneath this account and stops. The territory Panel's read counter will not move."
        title="Set a status"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${panel.instanceId}-status`}>Account status</Label>
          <Input
            id={`${panel.instanceId}-status`}
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
        </div>
        <Button
          className="self-start"
          disabled={draft.trim() === "" || draft.trim() === record.status}
          onClick={restatus}
          size="sm"
        >
          <RadioTowerIcon aria-hidden="true" />
          Publish, nested
        </Button>
      </PanelSection>

      <PanelSection title={`Deals (${deals.length})`}>
        <div className="flex flex-col gap-2">
          {deals.map((deal) => (
            <RecordRow
              key={deal.id}
              label={`Open the deal ${deal.title}`}
              onSelect={() => navigation.open(dealPanel, { dealId: deal.id })}
              primary={deal.title}
              recordId={deal.id}
              secondary={pipelineStageLabels[deal.stage]}
              trailing="Deal"
            />
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Deal — the bottom, which can be caught mid-sentence
 * -------------------------------------------------------------------------- */

function DealPanel({
  descriptor,
  panel,
}: CanvasPanelRenderProps<DealInput, "deal">) {
  const { dealId } = descriptor;
  const heading = useRef<HTMLHeadingElement>(null);

  const companyId = accountOfDeal(dealId) ?? "";
  const ownerId = territoryOfAccount(companyId) ?? "";
  const self = dealKey(ownerId, companyId, dealId);

  const [record, setRecord] = useState<DealRecord | undefined>(() =>
    readDeal(dealId),
  );
  const [account, setAccount] = useState<AccountRecord | undefined>(() =>
    readAccount(companyId),
  );
  const [territory, setTerritory] = useState<TerritoryRecord | undefined>(() =>
    readTerritory(ownerId),
  );
  const [reads, setReads] = useState(1);
  const [draft, setDraft] = useState(() => readDeal(dealId)?.nextStep ?? "");

  const dirty = draft !== (record?.nextStep ?? "");

  /*
   * The one Panel here that can be caught mid-sentence. Reporting `dirty` is
   * what turns an automatic re-read into a held one: an invalidation must never
   * be the reason somebody loses what they typed, so the extension holds it and
   * offers the choice instead.
   */
  const resource = usePanelResource({
    keys: [self],
    source: panel.instanceId,
    dirty,
    reload: async () => {
      await territoryRoundTrip();
      const fresh = readDeal(dealId);
      setRecord(fresh);
      setAccount(readAccount(companyId));
      setTerritory(readTerritory(ownerId));
      setDraft(fresh?.nextStep ?? "");
      setReads((count) => count + 1);
    },
  });

  TerritoryCanvas.useLifecycle({
    dirty,
    dirtyLabel: "Unsaved",
    guard: () =>
      dirty
        ? { status: "confirm", message: "Discard the next step you typed?" }
        : { status: "allow" },
    save: async () => {
      writeDealNextStep(dealId, draft);
      setRecord(readDeal(dealId));
    },
    discard: async () => setDraft(record?.nextStep ?? ""),
    initialFocus: heading,
  });

  if (!record) return <MissingRecord headingRef={heading} what="deal" />;

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow={`${territory?.label ?? ""} · ${account?.company.name ?? ""}`}
        headingRef={heading}
        subtitle={pipelineStageLabels[record.deal.stage]}
        title={record.deal.title}
      />
      <ReadBand
        keyName={self}
        reads={reads}
        reloading={resource.reloading}
        revision={record.revision}
      />
      {resource.pending ? (
        <HeldNotice
          onApply={() => void resource.apply()}
          onDismiss={resource.dismiss}
        />
      ) : null}

      <PanelSection title="What this Panel inherited">
        <MetaList
          items={[
            ["Territory label", territory?.label ?? "—"],
            ["Account status", account?.status ?? "—"],
            ["Stage", pipelineStageLabels[record.deal.stage]],
            [
              "Value",
              formatMoney({
                amount: record.deal.value,
                currency: record.deal.currency,
              }),
            ],
          ]}
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowDownIcon aria-hidden="true" className="size-3.5" />
          Both arrived by cascade, from two different depths, through one
          subscription on this Panel's own key.
        </p>
      </PanelSection>

      <PanelSection
        description="Type in here and leave it unsaved, then change the territory or the account. The announcement reaches this Panel and waits rather than overwriting you."
        title="Your next step"
      >
        <Input
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What has to happen next?"
          value={draft}
        />
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved — an incoming change will be held." : "Settled."}
        </span>
      </PanelSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  The Bound Canvas Module
 * -------------------------------------------------------------------------- */

export const TerritoryCanvas = createCanvasModule({
  root: territoriesRoot,
  panels: territoryPanels,
  renderers: {
    territories: TerritoriesRoot,
    territory: TerritoryPanel,
    account: AccountPanel,
    deal: DealPanel,
  },
});
