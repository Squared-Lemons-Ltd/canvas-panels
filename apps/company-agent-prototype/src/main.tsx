import {
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import "@squaredlemons/canvas-panels/styles.css";
import {
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squaredlemons/canvas-panels/ui";
import {
  createContext,
  type ReactNode,
  StrictMode,
  useContext,
  useId,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import "./prototype.css";

type ScreenId =
  | "charter"
  | "model"
  | "connections"
  | "preview"
  | "tests"
  | "improvements";

type ScreenInput = Readonly<{ id: ScreenId; title: string }>;
type DetailInput = Readonly<{
  id:
    | "order-concept"
    | "model-item"
    | "salesforce-mcp"
    | "failed-eval"
    | "source-proposal";
  title: string;
  context: string;
  itemId?: string;
}>;
type HomeProps = CanvasPanelRenderProps<undefined, "home">;
type ScreenProps = CanvasPanelRenderProps<ScreenInput, "screen">;
type DetailProps = CanvasPanelRenderProps<DetailInput, "detail">;

const screens: readonly Readonly<{
  id: ScreenId;
  number: string;
  title: string;
  description: string;
  status: string;
}>[] = [
  {
    id: "charter",
    number: "01",
    title: "Agent Charter",
    description: "Give the agent one job, an owner and explicit boundaries.",
    status: "Approved",
  },
  {
    id: "model",
    number: "02",
    title: "Company Model",
    description: "Maintain vocabulary, sources, workflows and rules.",
    status: "12 items",
  },
  {
    id: "connections",
    number: "03",
    title: "Connections",
    description: "Connect MCPs and choose the capabilities Eve may discover.",
    status: "1 connected",
  },
  {
    id: "preview",
    number: "04",
    title: "Agent Preview",
    description: "Review the Eve files generated from approved decisions.",
    status: "4 changes",
  },
  {
    id: "tests",
    number: "05",
    title: "Test Lab",
    description: "Prove answers, tool use, escalation and refusals.",
    status: "17 / 20",
  },
  {
    id: "improvements",
    number: "06",
    title: "Improvement Centre",
    description: "Turn real gaps into governed change proposals.",
    status: "3 to review",
  },
];

type ModelItemKind = "Concept" | "Source" | "Rule" | "Workflow";
type ModelItem = Readonly<{
  id: string;
  kind: ModelItemKind;
  name: string;
  definition: string;
  aliases: string;
  status: "Approved" | "Draft";
}>;

const initialModelItems: readonly ModelItem[] = [
  {
    id: "customer",
    kind: "Concept",
    name: "Customer",
    definition: "A person or organisation that purchases Northstar services.",
    aliases: "client, buyer",
    status: "Approved",
  },
  {
    id: "order",
    kind: "Concept",
    name: "Order",
    definition:
      "A confirmed customer request identified by an order reference and tracked through an approved lifecycle.",
    aliases: "booking, request",
    status: "Approved",
  },
  {
    id: "salesforce",
    kind: "Source",
    name: "Salesforce Orders",
    definition: "System of record for current order status and delivery date.",
    aliases: "CRM, order system",
    status: "Approved",
  },
  {
    id: "delivery-authority",
    kind: "Rule",
    name: "Delivery-date authority",
    definition:
      "For an identified order, live Salesforce data overrides generic guidance.",
    aliases: "source precedence",
    status: "Draft",
  },
];

type CapabilityState = "Allowed" | "Blocked" | "Review requested";
type ProposalState = "Needs review" | "Approved for testing" | "Rejected";
type WorkspaceState = Readonly<{
  modelItems: readonly ModelItem[];
  saveModelItem: (item: ModelItem) => void;
  capabilityStates: Readonly<Record<string, CapabilityState>>;
  changeCapability: (name: string, classification: "Read" | "Write") => void;
  proposalState: ProposalState;
  setProposalState: (state: ProposalState) => void;
}>;

const WorkspaceStateContext = createContext<WorkspaceState | null>(null);

function useWorkspaceState() {
  const value = useContext(WorkspaceStateContext);
  if (!value) throw new Error("Workspace state provider is missing");
  return value;
}

function WorkspaceStateProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [modelItems, setModelItems] =
    useState<readonly ModelItem[]>(initialModelItems);
  const [capabilityStates, setCapabilityStates] = useState<
    Readonly<Record<string, CapabilityState>>
  >({
    search_orders: "Allowed",
    get_order: "Allowed",
    update_order: "Blocked",
  });
  const [proposalState, setProposalState] =
    useState<ProposalState>("Needs review");

  const saveModelItem = (item: ModelItem) => {
    setModelItems((current) => {
      const exists = current.some((candidate) => candidate.id === item.id);
      return exists
        ? current.map((candidate) =>
            candidate.id === item.id ? item : candidate,
          )
        : [...current, item];
    });
  };

  const changeCapability = (name: string, classification: "Read" | "Write") => {
    setCapabilityStates((current) => ({
      ...current,
      [name]:
        classification === "Write"
          ? "Review requested"
          : current[name] === "Allowed"
            ? "Blocked"
            : "Allowed",
    }));
  };

  return (
    <WorkspaceStateContext.Provider
      value={{
        modelItems,
        saveModelItem,
        capabilityStates,
        changeCapability,
        proposalState,
        setProposalState,
      }}
    >
      {children}
    </WorkspaceStateContext.Provider>
  );
}

const home = defineRootPanel({ kind: "home", title: "Company Agent" });
const screenPanel = definePanel({
  kind: "screen",
  deduplication: "reuse",
  key: (input: ScreenInput) => input.id,
  title: (input: ScreenInput) => input.title,
});
const detailPanel = definePanel({
  kind: "detail",
  deduplication: "reuse",
  key: (input: DetailInput) => `${input.id}:${input.itemId ?? "default"}`,
  title: (input: DetailInput) => input.title,
});

function Dot({ tone = "good" }: Readonly<{ tone?: "good" | "warn" | "info" }>) {
  return <i aria-hidden="true" className={`dot dot-${tone}`} />;
}

function Arrow() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d="M4 10h11m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HomePanel(_: HomeProps) {
  const navigation = AgentCanvas.useNavigation();
  const openScreen = (screen: (typeof screens)[number]) =>
    navigation.open(screenPanel, { id: screen.id, title: screen.title });
  const openScreenById = (id: ScreenId) => {
    const screen = screens.find((candidate) => candidate.id === id);
    if (screen) openScreen(screen);
  };

  return (
    <div className="home-panel">
      <aside className="side-nav" aria-label="Company Agent Builder navigation">
        <div className="side-agent">
          <div className="agent-orb" aria-hidden="true">
            A
          </div>
          <div>
            <strong>Atlas</strong>
            <span>
              <Dot /> Read-only pilot
            </span>
          </div>
        </div>
        <nav className="screen-list">
          <span className="nav-section-label">Build and govern</span>
          {screens.map((screen) => (
            <button
              className="screen-row"
              key={screen.id}
              onClick={() => openScreen(screen)}
              type="button"
            >
              <span className="nav-icon" aria-hidden="true">
                {screen.number}
              </span>
              <span className="screen-copy">
                <strong>{screen.title}</strong>
              </span>
              <span className="nav-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </nav>
        <div className="side-nav-footer">
          <span>Model v3</span>
          <span>Candidate v0.4</span>
        </div>
      </aside>

      <section className="home-overview">
        <div className="overview-heading">
          <span className="kicker">Northstar Services</span>
          <h1>Build the agent your company can explain.</h1>
          <p>
            Model how the business works, connect approved systems and prove
            every capability before Atlas goes live.
          </p>
        </div>
        <div className="overview-grid">
          <article className="overview-card overview-primary">
            <span className="card-eyebrow">Next recommended step</span>
            <h2>Resolve three failed tests</h2>
            <p>
              Atlas needs a clearer source-authority rule before candidate v0.4
              can be published.
            </p>
            <button
              className="primary-button"
              onClick={() => openScreenById("tests")}
              type="button"
            >
              Open Test Lab <Arrow />
            </button>
          </article>
          <article className="overview-card">
            <span className="card-eyebrow">Company model</span>
            <strong className="overview-metric">12</strong>
            <p>Approved concepts, rules and sources</p>
            <button onClick={() => openScreenById("model")} type="button">
              Review model
            </button>
          </article>
          <article className="overview-card">
            <span className="card-eyebrow">Connected systems</span>
            <strong className="overview-metric">1</strong>
            <p>Salesforce Orders via user-scoped OAuth</p>
            <button onClick={() => openScreenById("connections")} type="button">
              Manage connections
            </button>
          </article>
        </div>
        <section className="progress-section">
          <div>
            <span className="card-eyebrow">Agent maturity</span>
            <h2>Level 1 · Understand and answer</h2>
          </div>
          <div
            className="progress-track"
            aria-label="Agent maturity level 1 of 5"
            role="img"
          >
            <i className="is-complete" />
            <i />
            <i />
            <i />
            <i />
          </div>
          <p>
            The agent can retrieve and explain information. Write actions remain
            blocked until permissions, approvals and evaluations are ready.
          </p>
        </section>
      </section>
    </div>
  );
}

function PanelHeading({
  eyebrow,
  title,
  copy,
  status,
}: Readonly<{ eyebrow: string; title: string; copy: string; status: string }>) {
  return (
    <div className="product-heading">
      <div>
        <span className="kicker">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <span className="heading-status">
        <Dot /> {status}
      </span>
    </div>
  );
}

function CharterScreen() {
  return (
    <div className="screen-content">
      <PanelHeading
        copy="A plain-English contract for what Atlas is employed to do—and what remains human work."
        eyebrow="Purpose and boundaries"
        status="Approved"
        title="Agent Charter"
      />
      <section className="charter-statement">
        <span className="label">Atlas helps</span>
        <p>
          Customer operations find accurate order information, explain the next
          step and prepare an escalation using approved company sources.
        </p>
      </section>
      <div className="two-column">
        <section className="plain-section">
          <span className="label">It may</span>
          <ul className="check-list">
            <li>
              <Dot /> Answer order-status questions
            </li>
            <li>
              <Dot /> Explain the approved process
            </li>
            <li>
              <Dot /> Prepare an escalation summary
            </li>
          </ul>
        </section>
        <section className="plain-section">
          <span className="label">It must not</span>
          <ul className="boundary-list">
            <li>Change an order</li>
            <li>Promise a refund or delivery date</li>
            <li>Reveal another customer’s data</li>
          </ul>
        </section>
      </div>
      <section className="maturity-ladder">
        <div className="ladder-copy">
          <span className="label">Capability path</span>
          <strong>Earn the next level</strong>
          <small>
            Progress only when the model, permissions and evals are ready.
          </small>
        </div>
        {["Answer", "Draft", "Recommend", "Approve & act", "Automate"].map(
          (item, index) => (
            <div
              className={index === 0 ? "ladder-step is-current" : "ladder-step"}
              key={item}
            >
              <span>{index + 1}</span>
              <small>{item}</small>
            </div>
          ),
        )}
      </section>
    </div>
  );
}

function ModelScreen() {
  const navigation = AgentCanvas.useNavigation();
  const { modelItems } = useWorkspaceState();
  const approved = modelItems.filter(
    (item) => item.status === "Approved",
  ).length;
  const openItem = (itemId: string, title: string) =>
    navigation.open(detailPanel, {
      id: "model-item",
      itemId,
      title,
      context: "Company Model",
    });

  return (
    <div className="screen-content">
      <PanelHeading
        copy="The maintained map that teaches Atlas what the company means, where truth lives and how work fits together."
        eyebrow="Operational ontology"
        status={`${approved} approved · ${modelItems.length - approved} draft`}
        title="Company Model"
      />
      <div className="model-toolbar">
        <div>
          <span className="label">Model items</span>
          <strong>{modelItems.length} concepts, sources and rules</strong>
        </div>
        <button
          className="primary-button"
          onClick={() => openItem("new", "Add model item")}
          type="button"
        >
          + Add item
        </button>
      </div>
      <div className="model-item-table">
        <div className="model-item-head">
          <span>Name</span>
          <span>Type</span>
          <span>Status</span>
          <span aria-hidden="true" />
        </div>
        {modelItems.map((item) => (
          <button
            className="model-item-row"
            key={item.id}
            onClick={() => openItem(item.id, `Edit ${item.name}`)}
            type="button"
          >
            <span>
              <strong>{item.name}</strong>
              <small>{item.definition}</small>
            </span>
            <span>{item.kind}</span>
            <span
              className={
                item.status === "Approved"
                  ? "item-status is-approved"
                  : "item-status"
              }
            >
              {item.status}
            </span>
            <span className="nav-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
      <div className="model-summary">
        {(["Concept", "Source", "Rule", "Workflow"] as const).map((kind) => (
          <div key={kind}>
            <span className="metric">
              {modelItems.filter((item) => item.kind === kind).length}
            </span>
            <small>{kind}s</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionsScreen() {
  const navigation = AgentCanvas.useNavigation();
  const { capabilityStates, changeCapability } = useWorkspaceState();
  const capabilities = [
    {
      name: "search_orders",
      description: "Find by customer or reference",
      classification: "Read" as const,
    },
    {
      name: "get_order",
      description: "Retrieve current status",
      classification: "Read" as const,
    },
    {
      name: "update_order",
      description: "Change operational record",
      classification: "Write" as const,
    },
  ];
  const allowedCount = Object.values(capabilityStates).filter(
    (state) => state === "Allowed",
  ).length;

  return (
    <div className="screen-content">
      <PanelHeading
        copy="Connect systems securely, inspect what they expose and choose the smallest capability surface Atlas needs."
        eyebrow="Data and MCP"
        status="1 connected"
        title="Connections"
      />
      <section className="connection-card connected">
        <div className="connection-mark">SF</div>
        <div className="connection-copy">
          <span className="label">
            <Dot /> Connected MCP
          </span>
          <strong>Salesforce Orders</strong>
          <small>User-scoped OAuth · Last checked 4 min ago</small>
        </div>
        <button
          className="small-button"
          onClick={() =>
            navigation.open(detailPanel, {
              id: "salesforce-mcp",
              title: "Salesforce MCP",
              context: "Connections",
            })
          }
          type="button"
        >
          Inspect
        </button>
      </section>
      <section className="capability-section">
        <div className="section-title-row">
          <div>
            <span className="label">Discovered capabilities</span>
            <strong>{allowedCount} of 9 allowed</strong>
          </div>
          <span className="safe-chip">Read-only policy</span>
        </div>
        <div className="capability-table">
          <div className="table-head">
            <span>Capability</span>
            <span>Class</span>
            <span>Atlas</span>
          </div>
          {capabilities.map((capability) => {
            const state = capabilityStates[capability.name] ?? "Blocked";
            return (
              <div key={capability.name}>
                <span>
                  <code>{capability.name}</code>
                  <small>{capability.description}</small>
                </span>
                <span>{capability.classification}</span>
                <button
                  className={`capability-state capability-${state
                    .toLowerCase()
                    .replace(" ", "-")}`}
                  onClick={() =>
                    changeCapability(capability.name, capability.classification)
                  }
                  type="button"
                >
                  {state}
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <div className="security-note">
        <Dot tone="info" />
        <span>
          <strong>Credentials stay outside the model.</strong> Eve approval
          never replaces Salesforce authorization.
        </span>
      </div>
    </div>
  );
}

function PreviewScreen() {
  return (
    <div className="screen-content">
      <PanelHeading
        copy="Approved company decisions become a reviewable Eve project change—not an opaque prompt hidden in a database."
        eyebrow="Generated implementation"
        status="Ready to test"
        title="Agent Preview"
      />
      <div className="compile-banner">
        <div className="compile-icon">✓</div>
        <div>
          <strong>Company Model compiled</strong>
          <small>4 files changed · No credentials included</small>
        </div>
        <span>v0.3 → v0.4</span>
      </div>
      <div className="file-browser">
        <div className="file-tree">
          <span className="tree-title">Eve project</span>
          <button className="is-selected" type="button">
            M instructions.md
          </button>
          <button type="button">A skills/order-status/SKILL.md</button>
          <button type="button">A connections/salesforce.ts</button>
          <button type="button">A evals/order-status.eval.ts</button>
        </div>
        <div className="diff-view">
          <div className="diff-header">
            <code>agent/instructions.md</code>
            <span>Generated from 4 approved items</span>
          </div>
          <pre>
            <span>
              + You help customer operations answer order-status questions.
            </span>
            {"\n"}
            <span>
              + Prefer the Salesforce Orders connection for current status.
            </span>
            {"\n"}
            <span>+ Cite the order reference and status timestamp.</span>
            {"\n"}
            <span>+ Never change an order or promise a delivery date.</span>
            {"\n"}
            <span>+ Escalate when the customer cannot be matched safely.</span>
          </pre>
        </div>
      </div>
      <div className="preview-actions">
        <button className="secondary-button" type="button">
          Download change bundle
        </button>
        <button className="primary-button" type="button">
          Send to Test Lab <Arrow />
        </button>
      </div>
    </div>
  );
}

function TestsScreen() {
  const navigation = AgentCanvas.useNavigation();
  return (
    <div className="screen-content">
      <PanelHeading
        copy="Run the real Eve surface against normal, ambiguous, permission and refusal cases before capability changes are published."
        eyebrow="Eve evals"
        status="17 passed · 3 need work"
        title="Test Lab"
      />
      <div className="test-score">
        <div className="score-ring">
          <span>
            <strong>85%</strong>
            <small>passing</small>
          </span>
        </div>
        <div className="score-copy">
          <span className="label">Version 0.4 candidate</span>
          <strong>Safe to review, not ready to publish</strong>
          <small>
            Two source-routing failures and one weak refusal need attention.
          </small>
        </div>
      </div>
      <div className="test-groups">
        <div>
          <span>Normal requests</span>
          <strong>8 / 8</strong>
          <i className="bar">
            <b style={{ width: "100%" }} />
          </i>
        </div>
        <div>
          <span>Missing information</span>
          <strong>3 / 4</strong>
          <i className="bar">
            <b style={{ width: "75%" }} />
          </i>
        </div>
        <div>
          <span>Source conflicts</span>
          <strong>2 / 3</strong>
          <i className="bar">
            <b style={{ width: "66%" }} />
          </i>
        </div>
        <div>
          <span>Permissions & refusals</span>
          <strong>4 / 5</strong>
          <i className="bar">
            <b style={{ width: "80%" }} />
          </i>
        </div>
      </div>
      <button
        className="failed-case"
        onClick={() =>
          navigation.open(detailPanel, {
            id: "failed-eval",
            title: "Failed eval",
            context: "Test Lab",
          })
        }
        type="button"
      >
        <span className="case-state">Failed</span>
        <span>
          <strong>Conflicting delivery dates</strong>
          <small>
            Atlas used the help centre instead of current order data.
          </small>
        </span>
        <Arrow />
      </button>
    </div>
  );
}

function ImprovementsScreen() {
  const navigation = AgentCanvas.useNavigation();
  const { proposalState } = useWorkspaceState();
  const needsReview = proposalState === "Needs review";
  return (
    <div className="screen-content">
      <PanelHeading
        copy="Runtime evidence becomes a reviewable suggestion. The company—not the model—decides what becomes approved truth."
        eyebrow="Governed learning"
        status={`${needsReview ? 3 : 2} proposals need review`}
        title="Improvement Centre"
      />
      <div className="improvement-summary">
        <div>
          <span className="metric">14</span>
          <small>Questions this week</small>
        </div>
        <div>
          <span className="metric">3</span>
          <small>Need review</small>
        </div>
        <div>
          <span className="metric">0</span>
          <small>Auto-published</small>
        </div>
      </div>
      <div className="proposal-list">
        <button
          className="proposal-row is-priority"
          onClick={() =>
            navigation.open(detailPanel, {
              id: "source-proposal",
              title: "Source proposal",
              context: "Improvement Centre",
            })
          }
          type="button"
        >
          <span className="proposal-type">Source conflict</span>
          <span>
            <strong>Delivery date authority is unclear</strong>
            <small>
              Seen in 2 failed evals · Affects Order.status workflow
            </small>
          </span>
          <span className={needsReview ? "review-chip" : "review-chip neutral"}>
            {proposalState}
          </span>
        </button>
        <button className="proposal-row" type="button">
          <span className="proposal-type">Vocabulary</span>
          <span>
            <strong>“Dispatch note” may mean two things</strong>
            <small>Raised by Operations · No eval affected yet</small>
          </span>
          <span className="review-chip neutral">Triage</span>
        </button>
        <button className="proposal-row" type="button">
          <span className="proposal-type">New workflow</span>
          <span>
            <strong>Customers ask to change delivery windows</strong>
            <small>4 unanswered requests · Outside current charter</small>
          </span>
          <span className="review-chip neutral">Explore</span>
        </button>
      </div>
      <div className="governance-line">
        <Dot tone="warn" />
        <span>
          Proposals require an owner, evidence, review and passing affected
          evals before publication.
        </span>
      </div>
    </div>
  );
}

function ScreenPanel({ descriptor }: ScreenProps) {
  const { id } = descriptor;
  if (id === "charter") return <CharterScreen />;
  if (id === "model") return <ModelScreen />;
  if (id === "connections") return <ConnectionsScreen />;
  if (id === "preview") return <PreviewScreen />;
  if (id === "tests") return <TestsScreen />;
  return <ImprovementsScreen />;
}

function DetailPanel({ descriptor: input }: DetailProps) {
  const editorId = useId();
  const generatedId = useId().replaceAll(":", "");
  const { modelItems, saveModelItem, proposalState, setProposalState } =
    useWorkspaceState();
  const existingModelItem = modelItems.find((item) => item.id === input.itemId);
  const initialModelItem: ModelItem = existingModelItem ?? {
    id: `model-${generatedId}`,
    kind: "Concept",
    name: "Untitled item",
    definition: "",
    aliases: "",
    status: "Draft",
  };
  const [savedModelItem, setSavedModelItem] = useState(initialModelItem);
  const [modelDraft, setModelDraft] = useState(initialModelItem);
  const isModelEdit = input.id === "model-item";

  const initialDefinition =
    "A confirmed customer request for goods or services, identified by an order reference and tracked through an approved lifecycle.";
  const [saved, setSaved] = useState(initialDefinition);
  const [draft, setDraft] = useState(initialDefinition);
  const dirty = isModelEdit
    ? JSON.stringify(modelDraft) !== JSON.stringify(savedModelItem)
    : input.id === "order-concept" && draft !== saved;

  const saveChanges = async () => {
    if (isModelEdit) {
      saveModelItem(modelDraft);
      setSavedModelItem(modelDraft);
      return;
    }
    setSaved(draft);
  };

  const discardChanges = async () => {
    if (isModelEdit) {
      setModelDraft(savedModelItem);
      return;
    }
    setDraft(saved);
  };

  AgentCanvas.useLifecycle({
    dirty,
    guard: () =>
      dirty
        ? {
            status: "confirm",
            message: isModelEdit
              ? `${modelDraft.name} has unpublished changes.`
              : "The Order concept has unpublished changes.",
          }
        : { status: "allow" },
    save: saveChanges,
    discard: discardChanges,
  });

  if (input.id === "model-item") {
    const updateDraft = <Key extends keyof ModelItem>(
      key: Key,
      value: ModelItem[Key],
    ) => setModelDraft((current) => ({ ...current, [key]: value }));

    return (
      <div className="detail-content model-item-editor">
        <span className="kicker">
          {input.context} / {input.itemId === "new" ? "New item" : "Edit item"}
        </span>
        <div className="detail-title">
          <div className="concept-glyph">{modelDraft.kind.slice(0, 1)}</div>
          <div>
            <h2>{modelDraft.name}</h2>
            <span className={dirty ? "draft-state is-dirty" : "draft-state"}>
              {dirty ? "Unsaved changes" : modelDraft.status}
            </span>
          </div>
        </div>
        <div className="form-grid">
          <label>
            <span className="field-label">Name</span>
            <input
              onChange={(event) => updateDraft("name", event.target.value)}
              value={modelDraft.name}
            />
          </label>
          <label>
            <span className="field-label">Type</span>
            <select
              onChange={(event) =>
                updateDraft("kind", event.target.value as ModelItemKind)
              }
              value={modelDraft.kind}
            >
              <option>Concept</option>
              <option>Source</option>
              <option>Rule</option>
              <option>Workflow</option>
            </select>
          </label>
        </div>
        <label className="editor-field" htmlFor={editorId}>
          <span className="field-label">Business definition</span>
          <textarea
            id={editorId}
            onChange={(event) => updateDraft("definition", event.target.value)}
            placeholder="Explain this item in plain company language…"
            value={modelDraft.definition}
          />
        </label>
        <label className="editor-field">
          <span className="field-label">Everyday terms</span>
          <input
            onChange={(event) => updateDraft("aliases", event.target.value)}
            placeholder="Comma-separated aliases"
            value={modelDraft.aliases}
          />
        </label>
        <label className="editor-field">
          <span className="field-label">Review state</span>
          <select
            onChange={(event) =>
              updateDraft("status", event.target.value as ModelItem["status"])
            }
            value={modelDraft.status}
          >
            <option>Draft</option>
            <option>Approved</option>
          </select>
        </label>
        <div className="editor-actions">
          <span aria-live="polite">
            {dirty ? "Changes have not been saved" : "All changes saved"}
          </span>
          <button
            className="primary-button"
            disabled={!dirty || !modelDraft.name.trim()}
            onClick={() => void saveChanges()}
            type="button"
          >
            {input.itemId === "new" ? "Add to model" : "Save changes"}
          </button>
        </div>
        <p className="detail-hint">
          Closing with unsaved changes invokes the Canvas Panels save/discard
          guard. Saved changes immediately update the Company Model list.
        </p>
      </div>
    );
  }

  if (input.id === "order-concept") {
    return (
      <div className="detail-content">
        <span className="kicker">{input.context} / Concept</span>
        <div className="detail-title">
          <div className="concept-glyph">O</div>
          <div>
            <h2>Order</h2>
            <span className={dirty ? "draft-state is-dirty" : "draft-state"}>
              {dirty ? "Unpublished changes" : "Approved · v3"}
            </span>
          </div>
        </div>
        <label className="field-label" htmlFor={editorId}>
          Business definition
        </label>
        <textarea
          id={editorId}
          onChange={(event) => setDraft(event.target.value)}
          value={draft}
        />
        <div className="field-group">
          <span className="field-label">Everyday terms</span>
          <div className="tag-list">
            <span>booking</span>
            <span>request</span>
            <button type="button">+ Add term</button>
          </div>
        </div>
        <div className="field-group">
          <span className="field-label">Important properties</span>
          <dl className="property-list">
            <div>
              <dt>status</dt>
              <dd>6 approved states</dd>
            </div>
            <div>
              <dt>orderReference</dt>
              <dd>Unique identifier</dd>
            </div>
            <div>
              <dt>deliveryDate</dt>
              <dd>From Salesforce</dd>
            </div>
          </dl>
        </div>
        <div className="source-proof">
          <Dot />
          <span>
            <strong>Evidence</strong> Defined by Customer Operations · Reviewed
            8 Aug
          </span>
        </div>
        <p className="detail-hint">
          Edit the definition, then close this panel to see the Canvas Panels
          save/discard guard.
        </p>
      </div>
    );
  }

  if (input.id === "salesforce-mcp") {
    return (
      <div className="detail-content">
        <span className="kicker">{input.context} / MCP</span>
        <div className="detail-title">
          <div className="connection-mark large">SF</div>
          <div>
            <h2>Salesforce Orders</h2>
            <span className="draft-state">
              <Dot /> Connected
            </span>
          </div>
        </div>
        <section className="detail-section">
          <span className="field-label">Identity and scope</span>
          <dl className="property-list">
            <div>
              <dt>Principal</dt>
              <dd>Signed-in user</dd>
            </div>
            <div>
              <dt>Tenant</dt>
              <dd>Northstar Services</dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd>OAuth · managed</dd>
            </div>
          </dl>
        </section>
        <section className="detail-section">
          <span className="field-label">Capability policy</span>
          <div className="policy-row">
            <span>Read tools</span>
            <strong>2 allowed</strong>
          </div>
          <div className="policy-row">
            <span>Write tools</span>
            <strong>Blocked</strong>
          </div>
          <div className="policy-row">
            <span>Model-supplied scope</span>
            <strong>Ignored</strong>
          </div>
        </section>
        <div className="security-note">
          <Dot tone="info" />
          <span>
            Authorization remains inside Salesforce. The model never receives
            OAuth credentials.
          </span>
        </div>
      </div>
    );
  }

  if (input.id === "failed-eval") {
    return (
      <div className="detail-content">
        <span className="kicker">{input.context} / Evaluation</span>
        <div className="detail-title">
          <div className="failure-glyph">×</div>
          <div>
            <h2>Conflicting delivery dates</h2>
            <span className="draft-state is-failed">Failed · 1 gate</span>
          </div>
        </div>
        <blockquote>
          “My portal says Tuesday but the help article says 3–5 days. When will
          it arrive?”
        </blockquote>
        <div className="trace-list">
          <div>
            <span>1</span>
            <p>
              <strong>Loaded order-status skill</strong>
              <small>Correct</small>
            </p>
          </div>
          <div>
            <span>2</span>
            <p>
              <strong>Called get_order</strong>
              <small>Current date: Tuesday</small>
            </p>
          </div>
          <div className="is-failed">
            <span>3</span>
            <p>
              <strong>Cited help-centre estimate</strong>
              <small>Authority rule not applied</small>
            </p>
          </div>
        </div>
        <section className="recommendation">
          <span className="field-label">Recommended model change</span>
          <p>
            Make the live Salesforce delivery date authoritative over generic
            help-centre guidance for identified orders.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="detail-content">
      <span className="kicker">{input.context} / Proposal</span>
      <div className="detail-title">
        <div className="proposal-glyph">?</div>
        <div>
          <h2>Delivery date authority</h2>
          <span
            className={`draft-state ${
              proposalState === "Rejected" ? "is-failed" : "is-review"
            }`}
          >
            {proposalState}
          </span>
        </div>
      </div>
      <section className="proposal-evidence">
        <span className="field-label">Why this was proposed</span>
        <p>
          Two evals failed because current order data and generic guidance
          disagreed.
        </p>
        <div className="evidence-row">
          <span>Salesforce order</span>
          <strong>Tuesday, 12 Aug</strong>
        </div>
        <div className="evidence-row">
          <span>Help centre</span>
          <strong>3–5 working days</strong>
        </div>
      </section>
      <section className="recommendation">
        <span className="field-label">Proposed authority rule</span>
        <p>
          For an identified order, the current Salesforce delivery date wins.
          Generic guidance is explanatory only.
        </p>
      </section>
      <div className="proposal-actions">
        <button
          className="secondary-button"
          onClick={() => setProposalState("Rejected")}
          type="button"
        >
          Reject
        </button>
        <button
          className="primary-button"
          onClick={() => setProposalState("Approved for testing")}
          type="button"
        >
          Approve for testing
        </button>
      </div>
      <small className="detail-footnote">
        Approval updates the draft Company Model. It does not publish to the
        live agent until affected evals pass.
      </small>
    </div>
  );
}

const AgentCanvas = createCanvasModule({
  root: home,
  panels: [screenPanel, detailPanel],
  renderers: { home: HomePanel, screen: ScreenPanel, detail: DetailPanel },
});

function WorkspaceMeta() {
  const stack = AgentCanvas.useStack();
  return (
    <div className="workspace-meta" aria-live="polite">
      <span>
        <Dot /> Draft workspace
      </span>
      <span>Model v3</span>
      <span>Eve candidate v0.4</span>
      <span>
        {stack.length} open {stack.length === 1 ? "panel" : "panels"}
      </span>
    </div>
  );
}

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#agent-workspace">
        Skip to company agent workspace
      </a>
      <header className="app-header">
        <div className="wordmark">
          <span className="wordmark-symbol">
            <i />
            <i />
          </span>
          <span>Company Agent Builder</span>
        </div>
        <div className="company-switcher">
          <span>NS</span>
          <div>
            <small>Workspace</small>
            <strong>Northstar Services</strong>
          </div>
        </div>
        <div className="header-actions">
          <span className="eve-chip">Built with Eve</span>
          <button type="button">Share prototype</button>
          <span className="avatar">JG</span>
        </div>
      </header>
      <main id="agent-workspace">
        <WorkspaceStateProvider>
          <AgentCanvas.Provider>
            <WorkspaceMeta />
            <AgentCanvas.Workspace label="Northstar company agent builder" />
          </AgentCanvas.Provider>
        </WorkspaceStateProvider>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Company Agent Builder prototype root is missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
