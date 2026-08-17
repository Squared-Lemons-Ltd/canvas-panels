"use client";

/**
 * The contact directory: the outer Canvas, and the one thing this section is
 * for — a Canvas Workspace nested inside a Panel of another one.
 *
 * The Pipeline shows a trail and the account book shows a column browser; both
 * are one Workspace with one stack. This shows two Workspaces, one inside the
 * other, and what the package guarantees about the pair:
 *
 *   - **Separate Engines.** Each mints its own Panel Instance IDs from one, so
 *     the ids collide by design. It is the Panel Instance *Ref* that keeps them
 *     apart: a Ref from one Engine is refused by the other, where a bare id
 *     would have named that Engine's Panel at the same position and been
 *     honoured.
 *   - **Separate navigation.** The outer Workspace owns the `people` parameter.
 *     The inner one owns nothing and writes nothing, so walking it leaves the
 *     address bar exactly where it was.
 *   - **Separate everything else.** Active Panel, Guarded Transitions, F6
 *     regions, announcements. Nothing is shared and nothing has to be told.
 */

import {
  createPanelEngine,
  type PanelInstanceRef,
} from "@squared-lemons-ltd/canvas-panels/core";
import {
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squared-lemons-ltd/canvas-panels/ui";
import { SearchIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import {
  ActivityTimeline,
  ContactRoleBadges,
  MetaList,
  MissingRecord,
  PanelHero,
  PanelSection,
  RecordRow,
} from "@/components/pipeline/record-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  activitiesForContact,
  type Contact,
  getCompany,
  getContact,
  loadMeridianDataset,
  pipelineStageLabels,
  regionLabels,
  seniorityLabels,
} from "@/src/domain";

import {
  directoryPanels,
  directoryRoot,
  type DossierInput,
  dossierPanel,
} from "./directory-panels";
import {
  NetworkCanvas,
  NetworkSubjectProvider,
  useNetworkDepth,
} from "./network-canvas";
import { networkPanels, networkRoot } from "./network-panels";

const dataset = loadMeridianDataset();

const settled = Object.freeze({
  dirty: false,
  guard: () => ({ status: "allow" }) as const,
  save: async () => {},
  discard: async () => {},
});

/** Surname, for a directory that reads the way a directory does. */
function surname(contact: Contact): string {
  const parts = contact.name.split(" ");
  return parts.at(-1) ?? contact.name;
}

function initialOf(contact: Contact): string {
  return surname(contact).slice(0, 1).toUpperCase();
}

/* -------------------------------------------------------------------------- *
 *  Root Panel — the index
 * -------------------------------------------------------------------------- */

function DirectoryRoot() {
  const navigation = DirectoryCanvas.useNavigation();
  const heading = useRef<HTMLHeadingElement>(null);
  const searchId = useId();
  const [query, setQuery] = useState("");
  const stack = DirectoryCanvas.useStack();
  const [everOpened, setEverOpened] = useState(false);
  if (stack.length > 1 && !everOpened) setEverOpened(true);

  DirectoryCanvas.useLifecycle({
    ...settled,
    ...(everOpened ? { initialFocus: heading } : {}),
  });

  const needle = query.trim().toLowerCase();
  const matching = [...dataset.contacts]
    .filter((contact) => {
      if (needle === "") return true;
      const company = getCompany(dataset, contact.companyId);
      return (
        contact.name.toLowerCase().includes(needle) ||
        contact.title.toLowerCase().includes(needle) ||
        (company?.name.toLowerCase().includes(needle) ?? false)
      );
    })
    .sort((a, b) => surname(a).localeCompare(surname(b)));

  const letters = [...new Set(matching.map(initialOf))];

  return (
    <div className="flex flex-col">
      <PanelHero
        eyebrow={`${dataset.contacts.length} people`}
        headingRef={heading}
        subtitle="Open somebody, then walk their network without leaving their Panel."
        title="Directory"
      />

      <div className="border-b border-border px-5 py-3">
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Label className="sr-only" htmlFor={searchId}>
            Search the directory
          </Label>
          <Input
            className="h-9 pl-8"
            id={searchId}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, role or account"
            value={query}
          />
        </div>
      </div>

      {matching.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">
          Nobody in the directory matches that.
        </p>
      ) : (
        letters.map((letter) => (
          <section
            aria-labelledby={`directory-${letter}`}
            className="flex flex-col"
            key={letter}
          >
            {/*
              A sticky letter rail, which is the third shape a Root Panel takes
              in this application: the Pipeline's is a board, the account book's
              is a table, and this is an index. None of them is what the package
              expects — a Root Panel is host-defined and need not be a list.
            */}
            <h4
              className="sticky top-0 z-10 border-y border-border bg-muted px-5 py-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
              id={`directory-${letter}`}
            >
              {letter}
            </h4>
            <div className="flex flex-col gap-2 px-5 py-3">
              {matching
                .filter((contact) => initialOf(contact) === letter)
                .map((contact) => (
                  <RecordRow
                    key={contact.id}
                    label={`Open the file for ${contact.name}`}
                    onSelect={() =>
                      navigation.open(dossierPanel, { contactId: contact.id })
                    }
                    primary={contact.name}
                    recordId={contact.id}
                    secondary={`${contact.title} · ${getCompany(dataset, contact.companyId)?.name ?? ""}`}
                    trailing={seniorityLabels[contact.seniority]}
                  />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 *  Dossier — the Panel with a Canvas inside it
 * -------------------------------------------------------------------------- */

/**
 * The nested Workspace, and the whole reason this section exists.
 *
 * The Engine is created once per dossier Panel and belongs to it: open two
 * dossiers and there are two independent networks on screen, each with its own
 * stack, neither aware of the other or of the Workspace they are both inside.
 *
 * There is no navigation synchronisation here at all. A nested Workspace that
 * wanted one would have to declare `ownership: "memory"` — React commits
 * effects child-first, so a nested Workspace left to claim the History
 * Namespace would take it *before* its host and demote the host instead. This
 * one asks for nothing, which is the same answer with less machinery.
 */
function NestedNetwork({ contactId }: Readonly<{ contactId: string }>) {
  const [engine] = useState(() =>
    createPanelEngine({ root: networkRoot, panels: networkPanels }),
  );

  return (
    <NetworkSubjectProvider contactId={contactId}>
      <NetworkCanvas.Provider engine={engine}>
        <div
          className="overflow-hidden rounded-lg border border-border"
          data-meridian-nested=""
        >
          <NetworkDepthNote />
          <NetworkCanvas.Workspace label="Their network" />
        </div>
      </NetworkCanvas.Provider>
    </NetworkSubjectProvider>
  );
}

/** Reads the inner stack, which can only be done inside the inner Provider. */
function NetworkDepthNote() {
  const depth = useNetworkDepth();
  return (
    <p
      className="border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
      data-numeric
    >
      Inner Workspace · {depth} {depth === 1 ? "Panel" : "Panels"} · its own
      Engine, its own ids, no URL
    </p>
  );
}

function DossierPanel({
  descriptor,
}: CanvasPanelRenderProps<DossierInput, "dossier">) {
  const { contactId } = descriptor;
  const navigation = DirectoryCanvas.useNavigation();
  const heading = useRef<HTMLHeadingElement>(null);
  DirectoryCanvas.useLifecycle({ ...settled, initialFocus: heading });

  const contact = getContact(dataset, contactId);
  if (!contact) return <MissingRecord headingRef={heading} what="person" />;

  const company = getCompany(dataset, contact.companyId);
  const activities = activitiesForContact(dataset, contactId);
  const deals = dataset.deals.filter(
    (deal) => deal.primaryContactId === contactId,
  );

  return (
    <div className="flex flex-col">
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
            ["Seniority", seniorityLabels[contact.seniority]],
            ["Region", company ? regionLabels[company.region] : "—"],
          ]}
        />
      </PanelSection>

      <PanelSection
        description="A second Canvas Workspace, rendered into this Panel's body. It has its own Panel Engine, its own Panel Instance IDs numbered from one, its own Active Panel and its own F6 regions — and the two cannot reach each other, because a Panel Instance Ref issued by one Engine is refused by the other."
        title="Their network"
      >
        <NestedNetwork contactId={contactId} />
      </PanelSection>

      {deals.length > 0 ? (
        <PanelSection title={`Deals they lead (${deals.length})`}>
          <div className="flex flex-col gap-2">
            {deals.map((deal) => (
              <RecordRow
                key={deal.id}
                label={`Open ${deal.title}'s primary contact`}
                onSelect={() =>
                  navigation.open(dossierPanel, {
                    contactId: deal.primaryContactId,
                  })
                }
                primary={deal.title}
                recordId={deal.id}
                secondary={pipelineStageLabels[deal.stage]}
                trailing="Deal"
              />
            ))}
          </div>
        </PanelSection>
      ) : null}

      <PanelSection title={`Logged with them (${activities.length})`}>
        <ActivityTimeline
          activities={activities}
          dataset={dataset}
          emptyMessage="Nothing has been logged with this person yet."
        />
      </PanelSection>
    </div>
  );
}

export const DirectoryCanvas = createCanvasModule({
  root: directoryRoot,
  panels: directoryPanels,
  renderers: {
    directory: DirectoryRoot,
    dossier: DossierPanel,
  },
});

export type { PanelInstanceRef };
