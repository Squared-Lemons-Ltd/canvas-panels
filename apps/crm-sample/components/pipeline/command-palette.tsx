"use client";

/**
 * "Jump to" — Meridian's command palette, built as an Overlay Workspace.
 *
 * It is a Canvas like any other: a Root Panel that lists what can be searched,
 * and a Search Panel routed into it. Being an overlay only changes how it is
 * presented — a modal layer above the application, dismissed with Escape,
 * returning focus where it found it.
 *
 * Escape resolves innermost first, and the package owns that order: a Guarded
 * Transition dialog, then the Overlay Inner Layers, then the overlay itself.
 * The scope menu below is registered as an Inner Layer, so it takes the first
 * Escape and the palette takes the second. The rung above them never comes up
 * here — every Panel routed into this overlay registers
 * {@link settledPaletteLifecycle}, so dismissing the palette has nothing to
 * guard and can never raise a dialog. A palette that composed something (a
 * call to log, a note to file) would, and would get the ordering for free.
 */

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "@squared-lemons-ltd/canvas-panels/core";
import {
  createOverlayWorkspace,
  defineOverlayWorkspace,
} from "@squared-lemons-ltd/canvas-panels/overlay";
import {
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squared-lemons-ltd/canvas-panels/ui";
import {
  BriefcaseIcon,
  BuildingIcon,
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  dealValue,
  formatMoney,
  getCompany,
  loadMeridianDataset,
  pipelineStageLabels,
} from "@/src/domain";

import { pipelineDeepLink, type RecordRef } from "./panels";
import { pipelineNavigator } from "./pipeline-navigator";

const dataset = loadMeridianDataset();

export type PaletteScope = "all" | "deals" | "accounts" | "people";

const scopeLabels: Readonly<Record<PaletteScope, string>> = Object.freeze({
  all: "Everything",
  deals: "Deals",
  accounts: "Accounts",
  people: "People",
});

const scopes: readonly PaletteScope[] = Object.freeze([
  "all",
  "deals",
  "accounts",
  "people",
]);

type PaletteSearchInput = Readonly<{ scope: PaletteScope }>;

/**
 * Searching holds nothing a reader could lose, so every Panel in this overlay
 * allows a transition without asking. See the Escape order in the file header:
 * this is what keeps the dialog rung out of the palette's way.
 */
const settledPaletteLifecycle = Object.freeze({
  dirty: false,
  guard: () => ({ status: "allow" }) as const,
  save: async () => {},
  discard: async () => {},
});

const paletteHome = defineRootPanel({
  kind: "palette-home",
  title: "Jump to",
});

const paletteSearch = definePanel({
  kind: "palette-search",
  deduplication: "reuse",
  key: ({ scope }: PaletteSearchInput) => scope,
  title: ({ scope }) => `Search ${scopeLabels[scope].toLowerCase()}`,
});

const palettePanels = [paletteSearch] as const;

/** One search result: the record it names, and how to read it in the list. */
type Hit = RecordRef &
  Readonly<{
    primary: string;
    secondary: string;
    trailing: string;
  }>;

function matches(haystack: readonly string[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return haystack.some((value) => value.toLowerCase().includes(needle));
}

function searchMeridian(query: string, scope: PaletteScope): readonly Hit[] {
  const hits: Hit[] = [];
  const limit = 6;

  if (scope === "all" || scope === "deals") {
    for (const deal of dataset.deals) {
      const company = getCompany(dataset, deal.companyId);
      if (!matches([deal.title, company?.name ?? ""], query)) continue;
      hits.push({
        id: deal.id,
        kind: "deal",
        primary: deal.title,
        secondary: `${company?.name ?? "Unknown account"} · ${pipelineStageLabels[deal.stage]}`,
        trailing: formatMoney(dealValue(dataset, deal), { compact: true }),
      });
      if (hits.length >= limit) break;
    }
  }

  const beforeAccounts = hits.length;
  if (scope === "all" || scope === "accounts") {
    for (const company of dataset.companies) {
      if (!matches([company.name, company.industry], query)) continue;
      hits.push({
        id: company.id,
        kind: "company",
        primary: company.name,
        secondary: company.industry,
        trailing: "Account",
      });
      if (hits.length - beforeAccounts >= limit) break;
    }
  }

  const beforePeople = hits.length;
  if (scope === "all" || scope === "people") {
    for (const contact of dataset.contacts) {
      const company = getCompany(dataset, contact.companyId);
      if (!matches([contact.name, contact.title, company?.name ?? ""], query)) {
        continue;
      }
      hits.push({
        id: contact.id,
        kind: "contact",
        primary: contact.name,
        secondary: `${contact.title} · ${company?.name ?? ""}`,
        trailing: "Contact",
      });
      if (hits.length - beforePeople >= limit) break;
    }
  }

  return hits;
}

const hitIcons: Readonly<Record<Hit["kind"], ReactNode>> = Object.freeze({
  deal: <BriefcaseIcon aria-hidden="true" className="size-4" />,
  company: <BuildingIcon aria-hidden="true" className="size-4" />,
  contact: <UserIcon aria-hidden="true" className="size-4" />,
});

function PaletteHome() {
  const navigation = PaletteCanvas.useNavigation();
  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <p className="text-sm text-muted-foreground">
        Open any deal, account or person without leaving the column you are
        working in.
      </p>
      <div className="flex flex-col gap-2">
        {scopes.map((scope) => (
          <Button
            className="justify-between"
            key={scope}
            onClick={() => navigation.open(paletteSearch, { scope })}
            size="sm"
            variant="outline"
          >
            {scopeLabels[scope]}
            <Badge variant="secondary" data-numeric>
              {scope === "deals"
                ? dataset.deals.length
                : scope === "accounts"
                  ? dataset.companies.length
                  : scope === "people"
                    ? dataset.contacts.length
                    : dataset.deals.length +
                      dataset.companies.length +
                      dataset.contacts.length}
            </Badge>
          </Button>
        ))}
      </div>
      <dl className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <dt>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground">
              Esc
            </kbd>
          </dt>
          <dd>closes the menu, then this palette</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground">
              Tab
            </kbd>
          </dt>
          <dd>stays inside the palette while it is open</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground">
              F6
            </kbd>
          </dt>
          <dd>moves between the panels of a Canvas</dd>
        </div>
      </dl>
    </div>
  );
}

function ScopeMenu({
  scope,
  onSelect,
}: Readonly<{ scope: PaletteScope; onSelect: (next: PaletteScope) => void }>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // While it is open, Escape belongs to this menu rather than to the palette.
  commandPalette.useInnerLayer({
    open,
    onEscape: () => {
      setOpen(false);
      trigger.current?.focus();
    },
  });

  return (
    <div className="relative">
      <Button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        ref={trigger}
        size="sm"
        variant="outline"
      >
        {scopeLabels[scope]}
        <ChevronDownIcon aria-hidden="true" />
      </Button>
      {open ? (
        <div
          aria-label="Limit the search"
          className="absolute top-full right-0 z-10 mt-1 flex w-48 flex-col gap-0.5 rounded-md border border-border bg-popover p-1 shadow-lg"
          id={menuId}
          role="menu"
        >
          {scopes.map((option) => (
            <button
              aria-checked={option === scope}
              className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              key={option}
              onClick={() => {
                onSelect(option);
                setOpen(false);
              }}
              role="menuitemradio"
              type="button"
            >
              {scopeLabels[option]}
              {option === scope ? (
                <CheckIcon aria-hidden="true" className="size-4" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PaletteSearch({
  descriptor,
}: CanvasPanelRenderProps<PaletteSearchInput, "palette-search">) {
  const scope = descriptor.scope;
  const navigation = PaletteCanvas.useNavigation();
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const [query, setQuery] = useState("");

  PaletteCanvas.useLifecycle({
    ...settledPaletteLifecycle,
    initialFocus: field,
  });

  const hits = useMemo(() => searchMeridian(query, scope), [query, scope]);

  const jump = (record: RecordRef) => {
    const navigator = pipelineNavigator();
    if (navigator) navigator.open(record);
    // The pipeline Canvas is not on screen, so the jump becomes what it would
    // have been anyway: a deep link into it.
    else router.push(pipelineDeepLink(record));
    commandPalette.dismiss();
  };

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={fieldId}>Search Meridian</Label>
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoComplete="off"
              className="pl-9"
              id={fieldId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Deal, account or person…"
              ref={field}
              type="search"
              value={query}
            />
          </div>
        </div>
        <ScopeMenu
          onSelect={(next) => navigation.open(paletteSearch, { scope: next })}
          scope={scope}
        />
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {hits.length === 0
          ? "Nothing matches that."
          : `${hits.length} ${hits.length === 1 ? "result" : "results"}`}
      </p>

      <ul className="flex flex-col gap-1">
        {hits.map((hit) => (
          <li key={`${hit.kind}-${hit.id}`}>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-md border border-transparent px-2.5 py-2 text-left",
                "hover:border-border hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              )}
              onClick={() => jump(hit)}
              type="button"
            >
              <span className="text-muted-foreground">
                {hitIcons[hit.kind]}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {hit.primary}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {hit.secondary}
                </span>
              </span>
              <span
                className="shrink-0 text-xs text-muted-foreground"
                data-numeric
              >
                {hit.trailing}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PaletteCanvas = createCanvasModule({
  root: paletteHome,
  panels: palettePanels,
  renderers: {
    "palette-home": PaletteHome,
    "palette-search": PaletteSearch,
  },
});

/**
 * The one handle on the palette. Nothing reaches this Workspace without naming
 * it, which is what keeps the primary Canvas's own navigation unaffected by
 * whether the palette happens to be up.
 */
export const commandPalette = createOverlayWorkspace({
  canvas: PaletteCanvas,
  definition: defineOverlayWorkspace({
    label: "Jump to any record",
    name: "palette",
  }),
  engine: createPanelEngine({ root: paletteHome, panels: palettePanels }),
});

export function openCommandPalette(): void {
  commandPalette.open(paletteSearch.reference({ scope: "all" }));
}

/**
 * Wraps the application so the palette can cover it. Mounted once, in the root
 * layout, because ⌘K belongs to the whole product rather than to one route.
 */
export function CommandPaletteHost({
  children,
}: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      openCommandPalette();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <commandPalette.Host>{children}</commandPalette.Host>;
}

export function CommandPaletteTrigger() {
  const { presented } = commandPalette.usePresentation();
  return (
    <button
      aria-expanded={presented}
      aria-haspopup="dialog"
      className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={openCommandPalette}
      type="button"
    >
      <SearchIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">Search deals, accounts, people…</span>
      <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground text-[0.6875rem] sm:block">
        ⌘K
      </kbd>
    </button>
  );
}
