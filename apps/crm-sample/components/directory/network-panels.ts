/**
 * The Panel Registry for the network Canvas — the one that lives *inside* a
 * Panel of the contact directory.
 *
 * Every Panel here is transient, and that is the whole design rather than an
 * omission. A nested Canvas has nowhere to persist to: the address bar belongs
 * to the Workspace that hosts it, and a nested Workspace that tried to claim a
 * History Namespace would be refused and demoted to memory — React commits
 * effects child-first, so left to race it would take the namespace *before* its
 * host and demote the host instead. The package's rule is that a nested
 * Workspace declares `ownership: "memory"`; this one goes further and
 * synchronises nothing at all, which is the same answer with less machinery.
 *
 * What that buys is visible in the address bar: walk three colleagues deep
 * inside a dossier and the URL does not move, because none of it is somewhere
 * the application considers you to have gone.
 */

import {
  definePanel,
  defineRootPanel,
} from "@squared-lemons-ltd/canvas-panels/core";

import { getContact, loadMeridianDataset } from "@/src/domain";

const dataset = loadMeridianDataset();

export type ColleagueInput = Readonly<{ contactId: string }>;

/**
 * The nested Root Panel takes no input, because no Root Panel does. Whose
 * network it is arrives through a React context the dossier provides — see
 * `NetworkSubjectContext` in `network-canvas.tsx`. That is the ordinary way to
 * give a Root Panel a subject, and it is why a nested Canvas needs no special
 * support from the package to be about something.
 */
export const networkRoot = defineRootPanel({
  kind: "network",
  title: "Their network",
});

export const colleaguePanel = definePanel({
  kind: "colleague",
  deduplication: "reuse",
  key: ({ contactId }: ColleagueInput) => contactId,
  title: ({ contactId }) => getContact(dataset, contactId)?.name ?? "Colleague",
});

export const networkPanels = [colleaguePanel] as const;
