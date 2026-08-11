import {
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import {
  type EditorStatus,
  usePanelEditor,
} from "@squaredlemons/canvas-panels/extensions/editor";
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

type PortfolioRenderProps = CanvasPanelRenderProps<undefined, "portfolio">;
type ProjectRenderProps = CanvasPanelRenderProps<ProjectInput, "project">;
type BriefRenderProps = CanvasPanelRenderProps<BriefInput, "brief">;

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

const BriefStoreContext = createContext<Map<string, string> | null>(null);
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

function PortfolioPanel(_: PortfolioRenderProps) {
  const navigation = ShowcaseCanvas.useNavigation();
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
        {projects.map((project, index) => (
          <button
            className="project-row"
            key={project.id}
            onClick={() =>
              navigation.open(projectPanel, {
                projectId: project.id,
                name: project.name,
              })
            }
            style={{ "--project-accent": project.accent } as CSSProperties}
            type="button"
          >
            <span className="project-index">0{index + 1}</span>
            <span className="project-copy">
              <strong>{project.name}</strong>
              <small>{project.client}</small>
            </span>
            <span className="project-stage">{project.stage}</span>
            <span className="round-arrow">
              <Icon name="arrow" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectPanel({ descriptor: input }: ProjectRenderProps) {
  const navigation = ShowcaseCanvas.useNavigation();
  const project = projects.find(({ id }) => id === input.projectId);
  if (!project) throw new Error(`Unknown showcase project: ${input.projectId}`);
  return (
    <div
      className="project-panel"
      style={{ "--project-accent": project.accent } as CSSProperties}
    >
      <div className="project-hero">
        <div>
          <span className="status-pill">
            <i />
            {project.stage}
          </span>
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

function BriefPanel({ descriptor: input }: BriefRenderProps) {
  const savedBriefs = useContext(BriefStoreContext);
  const editorId = useId();
  if (!savedBriefs) {
    throw new Error("Showcase briefs require a Workspace-owned store");
  }
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
      const stored = savedBriefs.get(input.briefId) ?? input.initial;
      setPublished(stored);
      setDraft(stored);
    })();
    return () => {
      current = false;
    };
  }, [input.briefId, input.initial, savedBriefs]);

  const editor = usePanelEditor({
    dirty: published !== null && draft !== published,
    discard: async () => {
      setDraft(published ?? input.initial);
    },
    loading: published === null,
    reload: async () => {
      await pause(serviceLatency);
      const stored = savedBriefs.get(input.briefId) ?? input.initial;
      setPublished(stored);
      setDraft(stored);
    },
    save: async () => {
      await pause(serviceLatency);
      if (refuseNextSave) {
        throw new Error("The studio service refused the change.");
      }
      savedBriefs.set(input.briefId, draft);
      setPublished(draft);
    },
  });

  useShowcaseLifecycle({ ...editor.lifecycle, dirtyLabel: "Unsaved" });

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
      <div className="editor-footer">
        <span>{words} words</span>
        <span>Try editing, then use the panel’s Close control.</span>
      </div>
    </div>
  );
}

const ShowcaseCanvas = createCanvasModule({
  root: portfolio,
  panels: [projectPanel, briefPanel],
  renderers: {
    portfolio: PortfolioPanel,
    project: ProjectPanel,
    brief: BriefPanel,
  },
});

const primaryBriefs = new Map<string, string>();
const isolatedBriefs = new Map<string, string>();

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
            <BriefStoreContext.Provider value={primaryBriefs}>
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
                      identity, version, and saved draft state. Actions here
                      never leak into the primary workspace.
                    </p>
                  </div>
                  <BriefStoreContext.Provider value={isolatedBriefs}>
                    <ShowcaseCanvas.Provider>
                      <ShowcaseCanvas.Workspace label="Isolated portfolio sandbox" />
                    </ShowcaseCanvas.Provider>
                  </BriefStoreContext.Provider>
                </div>
              </ShowcaseCanvas.Provider>
            </BriefStoreContext.Provider>
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
