/**
 * The Panel Registry for the contact directory — the *outer* Canvas.
 *
 * Two Kinds and nothing clever: an index, and a person's file. The interest is
 * not in this registry at all, it is in what one of these Panels contains. A
 * dossier renders a second, complete Canvas Workspace inside its body, with its
 * own Panel Engine, its own Panel Instance IDs and its own Panel Stack — and
 * the two do not know about each other.
 *
 * This Workspace owns the URL under its own parameter, `people`. The one inside
 * it owns nothing; see `network-panels.ts`.
 */

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import { applyCanvasNavigationParameter } from "@squaredlemons/canvas-panels/next/server";

import {
  contactsForCompany,
  getContact,
  loadMeridianDataset,
} from "@/src/domain";

const dataset = loadMeridianDataset();

/** The third History Namespace in this application, after `canvas` and `book`. */
export const directoryParameterName = "people";

export type DossierInput = Readonly<{ contactId: string }>;

type DossierDescriptor = { contactId: string };

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

export const directoryRoot = defineRootPanel({
  kind: "directory",
  title: "Directory",
});

export const dossierPanel = definePanel({
  kind: "dossier",
  deduplication: "reuse",
  key: ({ contactId }: DossierInput) => contactId,
  title: ({ contactId }) => getContact(dataset, contactId)?.name ?? "Contact",
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ contactId }) => ({ contactId }),
      validate: (descriptor): descriptor is DossierDescriptor =>
        stringField(descriptor, "contactId") !== null,
      decode: ({ contactId }) => ({ contactId }),
      migrations: [],
    },
    restore: ({ contactId }) =>
      Promise.resolve({
        status: getContact(dataset, contactId) ? "available" : "unavailable",
      }),
  },
});

export const directoryPanels = [dossierPanel] as const;

/**
 * The dossier the directory opens on when the address names none of its own —
 * somebody with colleagues, so the Canvas inside their Panel has somewhere to
 * go on the first click.
 */
const openingDossier: string | null = (() => {
  const subject = dataset.contacts.find(
    (contact) => contactsForCompany(dataset, contact.companyId).length >= 3,
  );
  return subject?.id ?? null;
})();

export const openingDirectoryDocument: string | null = (() => {
  if (openingDossier === null) return null;
  const engine = createPanelEngine({
    root: directoryRoot,
    panels: directoryPanels,
  });
  const root = engine.getSnapshot().panels[0];
  if (!root) return null;
  const opened = engine.open({
    originId: root.instanceId,
    panel: dossierPanel.reference({ contactId: openingDossier }),
  });
  if (opened.status !== "opened") return null;
  return engine.encodeNavigationDocument();
})();

export function directoryDeepLink(contactId: string): string {
  const engine = createPanelEngine({
    root: directoryRoot,
    panels: directoryPanels,
  });
  const root = engine.getSnapshot().panels[0];
  if (!root) return "/contacts";
  const opened = engine.open({
    originId: root.instanceId,
    panel: dossierPanel.reference({ contactId }),
  });
  if (opened.status !== "opened" && opened.status !== "reused") {
    return "/contacts";
  }
  const search = applyCanvasNavigationParameter(
    new URLSearchParams(),
    engine.encodeNavigationDocument(),
    { parameterName: directoryParameterName },
  );
  return `/contacts?${search.toString()}`;
}
