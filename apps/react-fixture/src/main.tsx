import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import {
  type EditorStatus,
  usePanelEditor,
} from "@squaredlemons/canvas-panels/extensions/editor";
import {
  createResourceExchange,
  ResourceExchangeProvider,
  usePanelResource,
  useResourceExchange,
  useResourceSubscription,
} from "@squaredlemons/canvas-panels/extensions/resources";
import {
  createOverlayWorkspace,
  defineOverlayWorkspace,
} from "@squaredlemons/canvas-panels/overlay";
import "@squaredlemons/canvas-panels/styles.css";
import {
  type CanvasPanelLifecycle,
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squaredlemons/canvas-panels/ui";
import type { CSSProperties } from "react";
import {
  createContext,
  StrictMode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import "./showcase.css";

type Project = Readonly<{
  id: string;
  name: string;
  client: string;
  accent: string;
  stage: string;
  summary: string;
  progress: number;
  due: string;
}>;

type ProjectInput = Readonly<{ projectId: string; name: string }>;
type BriefInput = Readonly<{
  briefId: string;
  projectId: string;
  projectName: string;
  title: string;
  initial: string;
}>;
type CollaboratorInput = Readonly<{
  personId: string;
  name: string;
  role: string;
}>;

type PortfolioRenderProps = CanvasPanelRenderProps<undefined, "portfolio">;
type ProjectRenderProps = CanvasPanelRenderProps<ProjectInput, "project">;
type BriefRenderProps = CanvasPanelRenderProps<BriefInput, "brief">;
type CollaboratorRenderProps = CanvasPanelRenderProps<
  CollaboratorInput,
  "collaborator"
>;

/**
 * The showcase's opaque Resource Keys. Canvas Panels never parses one: these
 * shapes are the studio's own, and only this file knows what they mean.
 */
const projectKey = (projectId: string) => `projects/${projectId}`;
const briefKey = (projectId: string, briefId: string) =>
  `projects/${projectId}/briefs/${briefId}`;
const personKey = (personId: string) => `people/${personId}`;

const projects: readonly Project[] = [
  {
    id: "atlas",
    name: "Atlas Field Guide",
    client: "Northstar Studio",
    accent: "#d7ff5f",
    stage: "In review",
    summary:
      "A living field guide for teams shaping resilient digital services.",
    progress: 72,
    due: "14 Aug",
  },
  {
    id: "harbour",
    name: "Harbour Sessions",
    client: "Common Ground",
    accent: "#ff8f70",
    stage: "Discovery",
    summary:
      "An intimate event series connecting makers, places, and local stories.",
    progress: 38,
    due: "27 Aug",
  },
  {
    id: "mono",
    name: "Mono Editions",
    client: "Edition House",
    accent: "#7dd3fc",
    stage: "Ready",
    summary:
      "A focused storefront for limited-run objects with traceable provenance.",
    progress: 91,
    due: "09 Aug",
  },
];

/**
 * The studio's own records. The package stores none of this: it carries the
 * keys that name it and leaves reading and writing to the application.
 */
type StudioRecords = Readonly<{
  briefs: Map<string, string>;
  names: Map<string, string>;
  archived: Set<string>;
}>;

const StudioRecordsContext = createContext<StudioRecords | null>(null);

function createStudioRecords(): StudioRecords {
  return {
    archived: new Set<string>(),
    briefs: new Map<string, string>(),
    names: new Map<string, string>(),
  };
}

function useStudioRecords(): StudioRecords {
  const records = useContext(StudioRecordsContext);
  if (!records) {
    throw new Error("Showcase Panels require a Workspace-owned record store");
  }
  return records;
}

const portfolio = defineRootPanel({ kind: "portfolio", title: "Portfolio" });
const projectPanel = definePanel({
  kind: "project",
  deduplication: "reuse",
  key: (input: ProjectInput) => input.projectId,
  title: (input: ProjectInput) => input.name,
});
const briefPanel = definePanel({
  kind: "brief",
  deduplication: "allow-many",
  title: (input: BriefInput) => input.title,
});
const collaboratorPanel = definePanel({
  kind: "collaborator",
  deduplication: "reuse",
  key: (input: CollaboratorInput) => input.personId,
  title: (input: CollaboratorInput) => input.name,
});

function Icon({
  name,
}: Readonly<{ name: "arrow" | "spark" | "layers" | "edit" }>) {
  const paths = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    spark: (
      <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Zm6 12 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z" />
    ),
    layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-7 9 7 4 7-4M5 16l7 4 7-4" />,
    edit: (
      <path d="M13.5 6.5 17.5 10.5M4 20l4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20Z" />
    ),
  };
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      >
        {paths[name]}
      </g>
    </svg>
  );
}

const atlasBriefKey = briefKey("atlas", "atlas-direction");

/**
 * Stands in for a change made by someone else, or pushed by a service. It
 * publishes without a source, so every subscribed Panel hears it.
 */
function StudioActivity({ heard }: Readonly<{ heard: number }>) {
  const records = useStudioRecords();
  const exchange = useResourceExchange();

  return (
    <div className="studio-activity">
      <span className="eyebrow">Elsewhere in the studio</span>
      <p>
        Open Atlas and its brief first, then watch what each panel does with
        what it hears.
      </p>
      <div className="editor-actions">
        <button
          onClick={() => {
            records.names.set("atlas", "Atlas Field Guide, second edition");
            exchange.publish({ key: projectKey("atlas"), kind: "changed" });
          }}
          type="button"
        >
          Rename Atlas
        </button>
        <button
          onClick={() => {
            records.briefs.set(
              atlasBriefKey,
              "Rewritten elsewhere: lead with the field, not the guide.",
            );
            exchange.publish({ key: atlasBriefKey, kind: "changed" });
          }}
          type="button"
        >
          Rewrite the Atlas brief
        </button>
        <button
          onClick={() => {
            records.archived.add("atlas");
            exchange.publish({
              key: projectKey("atlas"),
              kind: "deleted",
              nested: true,
            });
          }}
          type="button"
        >
          Archive Atlas
        </button>
      </div>
      <p className="activity-count">
        This list has re-read {heard} {heard === 1 ? "time" : "times"}.
      </p>
    </div>
  );
}

function PortfolioPanel(_: PortfolioRenderProps) {
  const navigation = ShowcaseCanvas.useNavigation();
  const records = useStudioRecords();
  const [heard, setHeard] = useState(0);

  // The list shows every project, so it listens on every project key. It has
  // no draft of its own, so what it hears it simply re-reads.
  useResourceSubscription({
    keys: ["projects/*"],
    notify: () => setHeard((count) => count + 1),
  });

  const listed = projects.filter(({ id }) => !records.archived.has(id));

  return (
    <div className="portfolio-panel">
      <div className="panel-intro">
        <span className="eyebrow">Selected work</span>
        <p>
          Choose a project to open its context. Then edit a brief to see guarded
          transitions protect unsaved work.
        </p>
      </div>
      <div className="project-list">
        {listed.map((project, index) => (
          <button
            className="project-row"
            key={project.id}
            onClick={() =>
              navigation.open(projectPanel, {
                projectId: project.id,
                name: records.names.get(project.id) ?? project.name,
              })
            }
            style={{ "--project-accent": project.accent } as CSSProperties}
            type="button"
          >
            <span className="project-index">0{index + 1}</span>
            <span className="project-copy">
              <strong>{records.names.get(project.id) ?? project.name}</strong>
              <small>{project.client}</small>
            </span>
            <span className="project-stage">{project.stage}</span>
            <span className="round-arrow">
              <Icon name="arrow" />
            </span>
          </button>
        ))}
      </div>
      <StudioActivity heard={heard} />
    </div>
  );
}

function ProjectPanel({ descriptor: input, panel }: ProjectRenderProps) {
  const navigation = ShowcaseCanvas.useNavigation();
  const records = useStudioRecords();
  const project = projects.find(({ id }) => id === input.projectId);
  if (!project) throw new Error(`Unknown showcase project: ${input.projectId}`);
  const key = projectKey(input.projectId);
  const [name, setName] = useState(
    () => records.names.get(input.projectId) ?? project.name,
  );

  // Nothing here is unsaved, so a change is simply re-read. A deletion is not:
  // the panel is told, and a human decides what to do about it.
  const resource = usePanelResource({
    keys: [key],
    reload: async () => {
      await pause(serviceLatency);
      setName(records.names.get(input.projectId) ?? project.name);
    },
    source: panel.instanceId,
  });

  return (
    <div
      className="project-panel"
      style={{ "--project-accent": project.accent } as CSSProperties}
    >
      {resource.deleted ? (
        <p className="editor-notice" role="status">
          This project was archived elsewhere. Nothing has been taken away from
          you — close the panel when you are ready.
        </p>
      ) : null}
      <div className="project-hero">
        <div>
          <span className="status-pill">
            <i />
            {resource.reloading ? "Re-reading…" : project.stage}
          </span>
          <h3 className="project-name">{name}</h3>
          <p className="project-client">{project.client}</p>
          <p className="project-summary">{project.summary}</p>
        </div>
        <div
          className="progress-orbit"
          style={
            { "--progress": `${project.progress * 3.6}deg` } as CSSProperties
          }
        >
          <span>
            <strong>{project.progress}%</strong>
            <small>complete</small>
          </span>
        </div>
      </div>
      <dl className="project-meta">
        <div>
          <dt>Next milestone</dt>
          <dd>Editorial sign-off</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{project.due}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>Studio team</dd>
        </div>
      </dl>
      <div className="editor-actions">
        <button
          onClick={() => {
            const renamed = `${project.name} (renamed here)`;
            records.names.set(input.projectId, renamed);
            setName(renamed);
            // Published under this panel's own token, so the Portfolio list
            // re-reads and this panel is not told to re-read what it just did.
            resource.publish({ key, kind: "changed" });
          }}
          type="button"
        >
          Rename in this panel
        </button>
      </div>
      <div className="brief-card">
        <div className="brief-icon">
          <Icon name="edit" />
        </div>
        <div>
          <span className="eyebrow">Working document</span>
          <h3>Creative direction</h3>
          <p>
            Open the brief, make a change, then close it or switch projects.
          </p>
        </div>
        <button
          className="primary-action"
          onClick={() =>
            navigation.open(briefPanel, {
              briefId: `${project.id}-direction`,
              projectId: project.id,
              projectName: project.name,
              title: "Creative direction",
              initial: `The ${project.name} experience should feel confident, useful, and distinctly human. Every interaction earns its place and leaves the next decision clearer.`,
            })
          }
          type="button"
        >
          Open brief <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}

function useShowcaseLifecycle(lifecycle: CanvasPanelLifecycle) {
  ShowcaseCanvas.useLifecycle(lifecycle);
}

/** Stands in for the round trip a real studio service would make. */
function pause(milliseconds: number): Promise<void> {
  return new Promise((settle) => setTimeout(settle, milliseconds));
}

const serviceLatency = 320;

const briefOperationSentences: Readonly<
  Record<Exclude<EditorStatus, "idle">, string>
> = {
  discarding: "Discarding your changes…",
  loading: "Reading the brief…",
  reloading: "Reading the published brief again…",
  saving: "Publishing your changes…",
};

function BriefPanel({ descriptor: input, panel }: BriefRenderProps) {
  const records = useStudioRecords();
  const exchange = useResourceExchange();
  const navigation = ShowcaseCanvas.useNavigation();
  const editorId = useId();
  const savedBriefs = records.briefs;
  const key = briefKey(input.projectId, input.briefId);
  // `null` until the brief has been read: the application owns the read, and
  // only tells the extension that one is in progress.
  const [published, setPublished] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [refuseNextSave, setRefuseNextSave] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      await pause(serviceLatency);
      if (!current) return;
      const stored = savedBriefs.get(key) ?? input.initial;
      setPublished(stored);
      setDraft(stored);
    })();
    return () => {
      current = false;
    };
  }, [input.initial, key, savedBriefs]);

  const editor = usePanelEditor({
    dirty: published !== null && draft !== published,
    discard: async () => {
      setDraft(published ?? input.initial);
    },
    loading: published === null,
    reload: async () => {
      await pause(serviceLatency);
      const stored = savedBriefs.get(key) ?? input.initial;
      setPublished(stored);
      setDraft(stored);
    },
    save: async () => {
      await pause(serviceLatency);
      if (refuseNextSave) {
        throw new Error("The studio service refused the change.");
      }
      savedBriefs.set(key, draft);
      setPublished(draft);
      // Everyone else showing this brief re-reads it; this panel does not,
      // because the invalidation carries its own token.
      exchange.publish({ key, kind: "changed", source: panel.instanceId });
    },
  });

  useShowcaseLifecycle({ ...editor.lifecycle, dirtyLabel: "Unsaved" });

  // The editor already refuses to reload over unsaved work, so the coordinator
  // composes with it rather than deciding again: an operation part-way through
  // is as much in the way as a half-written draft.
  const resource = usePanelResource({
    dirty: editor.dirty || editor.busy,
    keys: [key],
    reload: async () => {
      const outcome = await editor.reload({ discardChanges: true });
      if (outcome.status !== "completed") {
        throw new Error("The brief could not be read again.");
      }
    },
    source: panel.instanceId,
  });

  const words = useMemo(
    () => draft.trim().split(/\s+/).filter(Boolean).length,
    [draft],
  );
  const statusSentence =
    editor.status === "idle"
      ? editor.dirty
        ? "Unsaved changes"
        : "All changes published"
      : briefOperationSentences[editor.status];
  const reloadBrief = async (discardChanges: boolean) => {
    setNotice(null);
    const outcome = await editor.reload({ discardChanges });
    if (outcome.status === "rejected" && outcome.reason === "unsaved-changes") {
      setNotice(
        "Reloading would replace your unsaved changes. Discard them, or choose Reload and lose changes.",
      );
    }
  };

  return (
    <div className="editor-panel">
      <div className="editor-toolbar">
        <div>
          <span className="eyebrow">{input.projectName}</span>
          <p>{statusSentence}</p>
        </div>
        <span className={editor.dirty ? "save-state is-dirty" : "save-state"}>
          <i /> {editor.dirty ? "Draft" : "Published"}
        </span>
      </div>
      <label className="editor-label" htmlFor={editorId}>
        Direction statement
      </label>
      <textarea
        aria-busy={editor.busy || undefined}
        disabled={editor.status === "loading"}
        id={editorId}
        onChange={(event) => {
          setNotice(null);
          setDraft(event.target.value);
        }}
        spellCheck="true"
        value={draft}
      />
      {editor.failure ? (
        <p className="editor-failure" role="alert">
          {editor.failure.error instanceof Error
            ? editor.failure.error.message
            : "The brief could not be published."}{" "}
          <button onClick={editor.dismissFailure} type="button">
            Dismiss
          </button>
        </p>
      ) : null}
      {notice ? <p className="editor-notice">{notice}</p> : null}
      {resource.pending ? (
        <p className="editor-notice" role="status">
          {resource.pending.kind === "deleted"
            ? "The project this brief belongs to was archived elsewhere. Your draft is untouched."
            : "This brief changed elsewhere while you were working. Your draft is untouched."}
          <button onClick={() => void resource.apply()} type="button">
            Take the new version
          </button>
          <button onClick={resource.dismiss} type="button">
            Keep editing
          </button>
        </p>
      ) : null}
      <div className="editor-actions">
        <button
          disabled={editor.busy || !editor.dirty}
          onClick={() => {
            setNotice(null);
            void editor.save();
          }}
          type="button"
        >
          Publish
        </button>
        <button
          disabled={editor.busy || !editor.dirty}
          onClick={() => {
            setNotice(null);
            void editor.discard();
          }}
          type="button"
        >
          Discard
        </button>
        <button
          disabled={editor.busy}
          onClick={() => void reloadBrief(false)}
          type="button"
        >
          Reload
        </button>
        <button
          disabled={editor.busy || !editor.dirty}
          onClick={() => void reloadBrief(true)}
          type="button"
        >
          Reload and lose changes
        </button>
        <label className="editor-toggle">
          <input
            checked={refuseNextSave}
            onChange={(event) => setRefuseNextSave(event.target.checked)}
            type="checkbox"
          />
          Make the next publish fail
        </label>
      </div>
      <div className="editor-actions">
        <button
          className="link-action"
          onClick={() =>
            navigation.open(collaboratorPanel, {
              name: "Ada Lovelace",
              personId: "ada",
              role: "Editorial lead",
            })
          }
          type="button"
        >
          Open the editorial lead
        </button>
      </div>
      <div className="editor-footer">
        <span>{words} words</span>
        <span>Try editing, then use the panel’s Close control.</span>
      </div>
    </div>
  );
}

/**
 * The unrelated Panel. It shows a person, not a project, so nothing published
 * about a project reaches it however deeply that change propagates.
 */
function CollaboratorPanel({
  descriptor: input,
  panel,
}: CollaboratorRenderProps) {
  const [heard, setHeard] = useState(0);
  const resource = usePanelResource({
    keys: [personKey(input.personId)],
    reload: async () => {
      await pause(serviceLatency);
      setHeard((count) => count + 1);
    },
    source: panel.instanceId,
  });

  return (
    <div className="collaborator-panel">
      <div className="panel-intro">
        <span className="eyebrow">{input.role}</span>
        <p>
          This panel listens on <code>{personKey(input.personId)}</code> and
          nothing else. Rename, rewrite, or archive Atlas from the Portfolio
          panel: the project and its brief will react, and this will not.
        </p>
      </div>
      <dl className="project-meta">
        <div>
          <dt>Listening on</dt>
          <dd>{personKey(input.personId)}</dd>
        </div>
        <div>
          <dt>Re-reads</dt>
          <dd>{heard}</dd>
        </div>
        <div>
          <dt>Waiting</dt>
          <dd>{resource.pending ? resource.pending.kind : "nothing"}</dd>
        </div>
      </dl>
    </div>
  );
}

const ShowcaseCanvas = createCanvasModule({
  root: portfolio,
  panels: [projectPanel, briefPanel, collaboratorPanel],
  renderers: {
    portfolio: PortfolioPanel,
    project: ProjectPanel,
    brief: BriefPanel,
    collaborator: CollaboratorPanel,
  },
});

const primaryRecords = createStudioRecords();
const isolatedRecords = createStudioRecords();
// One exchange per Workspace, so the sandbox below hears nothing the primary
// Workspace publishes and publishes nothing into it.
const primaryExchange = createResourceExchange();
const isolatedExchange = createResourceExchange();

/*
 * The optional overlay composition path. Its Workspace is a Canvas like any
 * other — the shortcuts Panel below opens a second Panel through ordinary
 * navigation — but it is presented as a modal layer, and it is reached only
 * through the `helpOverlay` handle. Nothing in the portfolio Canvas can route
 * a Panel into it by accident.
 */
type ShortcutsInput = Readonly<{ topic: string }>;

const helpRoot = defineRootPanel({ kind: "help-root", title: "Help" });
const shortcutsPanel = definePanel({
  kind: "shortcuts",
  title: (input: ShortcutsInput) => input.topic,
});

function ShortcutsPanel({
  descriptor,
}: CanvasPanelRenderProps<ShortcutsInput, "shortcuts">) {
  const initialFocus = useRef<HTMLButtonElement>(null);
  HelpCanvas.useLifecycle({
    dirty: false,
    initialFocus,
    guard: () => ({ status: "allow" }) as const,
    save: async () => {},
    discard: async () => {},
  });
  return (
    <div className="help-overlay-body">
      <p>
        Escape closes the innermost thing that is open, then this overlay, then
        leaves the key to the Canvas behind it.
      </p>
      <ul>
        <li>
          <kbd>F6</kbd> cycles the visible Panel Regions.
        </li>
        <li>
          <kbd>Tab</kbd> stays inside this overlay while it is modal.
        </li>
        <li>
          <kbd>Escape</kbd> dismisses it and returns focus where it came from.
        </li>
      </ul>
      <div className="help-overlay-actions">
        <button
          onClick={() =>
            helpOverlay.open(shortcutsPanel.reference({ topic: "Guards" }))
          }
          ref={initialFocus}
          type="button"
        >
          Open “{descriptor.topic}” detail
        </button>
        <button onClick={() => helpOverlay.dismiss()} type="button">
          Close help
        </button>
      </div>
    </div>
  );
}

const HelpCanvas = createCanvasModule({
  root: helpRoot,
  panels: [shortcutsPanel],
  renderers: {
    "help-root": () => (
      <p className="help-overlay-body">
        A global, modal Canvas Workspace of its own.
      </p>
    ),
    shortcuts: ShortcutsPanel,
  },
});

const helpOverlay = createOverlayWorkspace({
  canvas: HelpCanvas,
  definition: defineOverlayWorkspace({ label: "Help", name: "help" }),
  engine: createPanelEngine({ root: helpRoot, panels: [shortcutsPanel] }),
});

function HelpOverlayTrigger() {
  // The overlay is read here and routed to explicitly; there is no context that
  // would let this button reach a global layer without naming one.
  const { presented } = helpOverlay.usePresentation();
  return (
    <button
      aria-expanded={presented}
      className="version-chip"
      onClick={() =>
        helpOverlay.open(shortcutsPanel.reference({ topic: "Shortcuts" }))
      }
      type="button"
    >
      Keyboard help
    </button>
  );
}

function StackTelemetry() {
  const stack = ShowcaseCanvas.useStack();
  const active = ShowcaseCanvas.usePanel();
  return (
    <div className="stack-telemetry" aria-live="polite">
      <span>
        <i className="live-dot" />
        Live workspace
      </span>
      <span>Bound read model</span>
      <span>
        {stack.length} {stack.length === 1 ? "panel" : "panels"}
      </span>
      <span>Active: {active.title}</span>
    </div>
  );
}

function Showcase() {
  return (
    <helpOverlay.Host>
      <ShowcaseShell />
    </helpOverlay.Host>
  );
}

function ShowcaseShell() {
  return (
    <div className="showcase-shell">
      <a className="skip-link" href="#workspace">
        Skip to interactive showcase
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#top"
          aria-label="Canvas Panels showcase home"
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>Canvas Panels</span>
        </a>
        <nav aria-label="Showcase navigation">
          <a href="#workspace">Workspace</a>
          <a href="#architecture">Architecture</a>
          <a href="https://github.com/Squared-Lemons-Ltd/canvas-panels">
            GitHub
          </a>
        </nav>
        <HelpOverlayTrigger />
        <span className="version-chip">Private preview · 0.x</span>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker">
              <Icon name="spark" /> Interaction infrastructure for React
            </span>
            <h1>
              Context that moves
              <br />
              <em>with your work.</em>
            </h1>
            <p>
              A framework-neutral panel engine with typed navigation, semantic
              identity, nested isolation, and guarded transitions—presented
              through a small React API.
            </p>
            <div className="hero-actions">
              <a className="hero-primary" href="#workspace">
                Explore the workspace <Icon name="arrow" />
              </a>
              <a
                className="hero-secondary"
                href="https://github.com/Squared-Lemons-Ltd/canvas-panels"
              >
                View source
              </a>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="visual-grid" />
            <div className="floating-card card-one">
              <span>01</span>
              <strong>Portfolio</strong>
              <small>Root · permanent</small>
            </div>
            <div className="floating-card card-two">
              <span>02</span>
              <strong>Project context</strong>
              <small>Semantic reuse</small>
            </div>
            <div className="floating-card card-three">
              <span>03</span>
              <strong>Working brief</strong>
              <small>Guarded lifecycle</small>
            </div>
            <div className="orbit-label">
              <i /> Core stays pure
            </div>
          </div>
        </section>

        <section className="feature-ribbon" aria-label="Package qualities">
          <span>Framework-neutral core</span>
          <i />
          <span>React 19 ready</span>
          <i />
          <span>Typed outcomes</span>
          <i />
          <span>Accessible by default</span>
        </section>

        <section className="workspace-section" id="workspace">
          <div className="section-heading">
            <div>
              <span className="section-number">01 / Live showcase</span>
              <h2>
                Follow the context,
                <br />
                not the breadcrumbs.
              </h2>
            </div>
            <p>
              Open a project, enter its brief, make an edit, then close it or
              choose another project from the Portfolio panel. The stack handles
              the rest.
            </p>
          </div>

          <div className="demo-window">
            <div className="window-chrome">
              <div className="traffic-lights">
                <i />
                <i />
                <i />
              </div>
              <span>studio.canvas.local / portfolio</span>
              <span className="secure-label">Interactive demo</span>
            </div>
            <StudioRecordsContext.Provider value={primaryRecords}>
              <ResourceExchangeProvider exchange={primaryExchange}>
                <ShowcaseCanvas.Provider>
                  <StackTelemetry />
                  <ShowcaseCanvas.Workspace label="Studio portfolio workspace" />
                  <div className="isolation-lab" id="architecture">
                    <div className="isolation-copy">
                      <span className="eyebrow">
                        <Icon name="layers" /> Nested isolation
                      </span>
                      <h3>A workspace inside a workspace.</h3>
                      <p>
                        This compact canvas owns an independent engine, stack,
                        identity, version, saved draft state, and resource
                        exchange. Actions here never leak into the primary
                        workspace.
                      </p>
                    </div>
                    <StudioRecordsContext.Provider value={isolatedRecords}>
                      <ResourceExchangeProvider exchange={isolatedExchange}>
                        <ShowcaseCanvas.Provider>
                          <ShowcaseCanvas.Workspace label="Isolated portfolio sandbox" />
                        </ShowcaseCanvas.Provider>
                      </ResourceExchangeProvider>
                    </StudioRecordsContext.Provider>
                  </div>
                </ShowcaseCanvas.Provider>
              </ResourceExchangeProvider>
            </StudioRecordsContext.Provider>
          </div>
        </section>

        <section className="principles-section">
          <div className="principle-title">
            <span className="section-number">02 / What it proves</span>
            <h2>
              Small surface.
              <br />
              <em>Deep behavior.</em>
            </h2>
          </div>
          <div className="principle-grid">
            <article>
              <span>01</span>
              <h3>Semantic navigation</h3>
              <p>
                Open, reuse, replace, close, and collapse with immutable,
                discriminated outcomes.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Guarded work</h3>
              <p>
                Pure guards stage Save, Discard, or Stay before destructive
                transitions mutate the stack.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>True isolation</h3>
              <p>
                Each workspace engine owns its instance identity, active
                context, subscriptions, and monotonic version.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer>
        <div className="brand footer-brand">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>Canvas Panels</span>
        </div>
        <p className="footer-copy">
          Reusable interaction infrastructure by Squared Lemons.
        </p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("React fixture root is missing");

createRoot(root).render(
  <StrictMode>
    <Showcase />
  </StrictMode>,
);
