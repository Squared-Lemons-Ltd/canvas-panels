"use client";

/**
 * The Canvas that lives inside a Panel.
 *
 * A second complete Bound Canvas Module: its own Panel Engine, its own Panel
 * Instance IDs numbered from one, its own Active Panel, its own Guarded
 * Transitions, its own F6 regions. Nothing about it is a reduced or special
 * "inner" mode — the package has no such concept, and that is the point. A
 * Canvas Workspace is a component, and a component can be rendered anywhere,
 * including inside a Panel of another one.
 *
 * The two Engines cannot reach each other. A Panel Instance Ref issued by one
 * is refused by the other, which is exactly what the Ref exists for: a bare
 * Panel Instance ID would have named *that* Engine's Panel at the same position
 * and been honoured.
 */

import {
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squared-lemons-ltd/canvas-panels/ui";
import { UsersIcon } from "lucide-react";
import { createContext, useContext, useMemo, useRef } from "react";

import { OwnerChip, RecordRow } from "@/components/pipeline/record-parts";
import {
  type Contact,
  contactsForCompany,
  getCompany,
  getContact,
  getOwner,
  loadMeridianDataset,
  seniorityLabels,
} from "@/src/domain";

import {
  type ColleagueInput,
  colleaguePanel,
  networkPanels,
  networkRoot,
} from "./network-panels";

const dataset = loadMeridianDataset();

/**
 * Whose network the nested Root Panel is showing.
 *
 * A Root Panel takes no input — none does — so a nested Canvas that is *about*
 * something is given its subject the ordinary React way, by the Panel that
 * hosts it. No package support is needed or offered for this, and none should
 * be: the host already knows.
 */
const NetworkSubjectContext = createContext<string | null>(null);

export function NetworkSubjectProvider({
  contactId,
  children,
}: Readonly<{ contactId: string; children: React.ReactNode }>) {
  return (
    <NetworkSubjectContext.Provider value={contactId}>
      {children}
    </NetworkSubjectContext.Provider>
  );
}

const settled = Object.freeze({
  dirty: false,
  guard: () => ({ status: "allow" }) as const,
  save: async () => {},
  discard: async () => {},
});

/** Everyone at this person's account except this person. */
function colleaguesOf(contact: Contact): readonly Contact[] {
  return contactsForCompany(dataset, contact.companyId).filter(
    ({ id }) => id !== contact.id,
  );
}

function PersonList({
  people,
  onOpen,
  emptyMessage,
}: Readonly<{
  people: readonly Contact[];
  onOpen: (contactId: string) => void;
  emptyMessage: string;
}>) {
  if (people.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {people.map((person) => (
        <RecordRow
          key={person.id}
          label={`Open ${person.name} in this network`}
          onSelect={() => onOpen(person.id)}
          primary={person.name}
          recordId={person.id}
          secondary={person.title}
          trailing={seniorityLabels[person.seniority]}
        />
      ))}
    </div>
  );
}

function NetworkRoot() {
  const navigation = NetworkCanvas.useNavigation();
  const subjectId = useContext(NetworkSubjectContext);
  const heading = useRef<HTMLHeadingElement>(null);
  NetworkCanvas.useLifecycle({ ...settled, initialFocus: heading });

  const subject = subjectId ? getContact(dataset, subjectId) : undefined;
  const colleagues = subject ? colleaguesOf(subject) : [];
  const company = subject ? getCompany(dataset, subject.companyId) : undefined;

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <h4
        className="flex items-center gap-1.5 text-xs font-semibold"
        ref={heading}
        tabIndex={-1}
      >
        <UsersIcon aria-hidden="true" className="size-3.5" />
        {company?.name ?? "Their account"}
      </h4>
      <p className="text-xs leading-relaxed text-muted-foreground">
        This is a whole Canvas Workspace inside a Panel of another one. Walk it
        as far as you like — the address bar above will not move, because none
        of it is somewhere you have been as far as the outer Workspace is
        concerned.
      </p>
      <PersonList
        emptyMessage="Nobody else is recorded at this account."
        onOpen={(contactId) => navigation.open(colleaguePanel, { contactId })}
        people={colleagues}
      />
    </div>
  );
}

function ColleaguePanel({
  descriptor,
}: CanvasPanelRenderProps<ColleagueInput, "colleague">) {
  const navigation = NetworkCanvas.useNavigation();
  const stack = NetworkCanvas.useStack();
  const heading = useRef<HTMLHeadingElement>(null);
  NetworkCanvas.useLifecycle({ ...settled, initialFocus: heading });

  const deepest = stack.at(-1)?.panel;
  const contact = getContact(dataset, descriptor.contactId);

  if (!contact) {
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground" ref={heading}>
        This person has left.
      </p>
    );
  }

  const owner = getOwner(
    dataset,
    getCompany(dataset, contact.companyId)?.ownerId ?? "",
  );
  const colleagues = colleaguesOf(contact);

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-xs font-semibold" ref={heading} tabIndex={-1}>
          {contact.name}
        </h4>
        <p className="text-xs text-muted-foreground">{contact.title}</p>
      </div>
      {owner ? (
        <p className="text-xs text-muted-foreground">
          Account owner: <OwnerChip owner={owner} />
        </p>
      ) : null}
      <PersonList
        emptyMessage="Nobody else is recorded here."
        onOpen={(contactId) =>
          navigation.open(
            colleaguePanel,
            { contactId },
            deepest ? { origin: deepest } : undefined,
          )
        }
        people={colleagues}
      />
    </div>
  );
}

export const NetworkCanvas = createCanvasModule({
  root: networkRoot,
  panels: networkPanels,
  renderers: {
    network: NetworkRoot,
    colleague: ColleaguePanel,
  },
});

/**
 * How deep the reader has walked, for the dossier to report above the nested
 * Canvas. It has to be read inside the Provider, so it lives here rather than
 * in the file that mounts it.
 */
export function useNetworkDepth(): number {
  const stack = NetworkCanvas.useStack();
  return useMemo(() => stack.length, [stack]);
}
