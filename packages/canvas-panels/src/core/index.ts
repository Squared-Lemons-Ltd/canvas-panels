declare const panelInstanceIdBrand: unique symbol;
declare const panelKeyBrand: unique symbol;
declare const panelReferenceBrand: unique symbol;
declare const workspaceIdBrand: unique symbol;
declare const stackVersionBrand: unique symbol;

// Counts Engines within one process. A Workspace ID never reaches the DOM, so
// a value that differs between a server process and a browser costs nothing;
// it exists to tell one Engine's refs from another's within a single process,
// which is the only place two Engines can ever meet.
let nextEngineNumber = 1;
const referenceDefinitions = new WeakMap<object, object>();

export type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type PanelInstanceId = string & {
  readonly [panelInstanceIdBrand]: "PanelInstanceId";
};

export type WorkspaceId = string & {
  readonly [workspaceIdBrand]: "WorkspaceId";
};

export type StackVersion = number & {
  readonly [stackVersionBrand]: "StackVersion";
};

export type PanelInstanceRef = Readonly<{
  workspaceId: WorkspaceId;
  instanceId: PanelInstanceId;
  kind: string;
}>;

export type PanelKey = string & {
  readonly [panelKeyBrand]: "PanelKey";
};

export type PanelReference<
  Kind extends string = string,
  Input = unknown,
> = Readonly<{
  kind: Kind;
  input: DeepReadonly<Input>;
  panelKey?: PanelKey;
  readonly [panelReferenceBrand]: "PanelReference";
}>;

export type PanelDeduplication = "reuse" | "replace" | "allow-many";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

export type PanelDescriptorMigration = Readonly<{
  from: number;
  migrate: (descriptor: unknown) => unknown;
}>;

export type PanelDescriptorCodec<
  Input,
  Descriptor extends JsonValue = JsonValue,
> = Readonly<{
  encode: (input: DeepReadonly<Input>) => Descriptor;
  validate: (descriptor: unknown) => descriptor is Descriptor;
  decode: (descriptor: Descriptor) => Input;
  migrations: readonly PanelDescriptorMigration[];
}>;

export type PanelRestoreOutcome =
  | Readonly<{ status: "available" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "denied" }>;

export type PanelPersistence<Input, Descriptor extends JsonValue = JsonValue> =
  | Readonly<{ mode: "transient" }>
  | Readonly<{
      mode: "navigation";
      version: number;
      codec: PanelDescriptorCodec<Input, Descriptor>;
    }>
  | Readonly<{
      mode: "navigation-with-loader";
      version: number;
      codec: PanelDescriptorCodec<Input, Descriptor>;
      restore: (
        input: DeepReadonly<Input>,
        context: Readonly<{ signal: AbortSignal }>,
      ) => Promise<PanelRestoreOutcome>;
    }>;

export type RootPanelDefinition<Kind extends string = string> = Readonly<{
  role: "root";
  kind: Kind;
  title: string;
  reference: PanelReference<Kind, undefined>;
}>;

export type PanelDefinition<
  Kind extends string = string,
  Input = unknown,
  Update = never,
  Descriptor extends JsonValue = JsonValue,
> = Readonly<{
  role: "panel";
  kind: Kind;
  deduplication: PanelDeduplication;
  closable: boolean;
  key?: (input: DeepReadonly<Input>) => string;
  title: (input: DeepReadonly<Input>) => string;
  reference: (input: Input) => PanelReference<Kind, Input>;
  persistence: PanelPersistence<Input, Descriptor>;
  update?: Readonly<{
    validate: (update: unknown) => update is Update;
    validateResult: (value: unknown) => value is Input;
    apply: (current: DeepReadonly<Input>, update: Update) => Input;
    navigation: "replace" | "none";
  }>;
}>;

export type OpenPanel = Readonly<{
  instanceId: PanelInstanceId;
  instanceRef: PanelInstanceRef;
  kind: string;
  title: string;
  isRoot: boolean;
  closable: boolean;
  panelKey?: PanelKey;
  reference: PanelReference;
}>;

export type GuardedTransitionCommand = "open" | "close";

export type GuardedTransitionProposal = Readonly<{
  command: GuardedTransitionCommand;
  removedPanelIds: readonly PanelInstanceId[];
}>;

export type GuardOutcome =
  | Readonly<{ status: "allow" }>
  | Readonly<{ status: "confirm"; message: string }>
  | Readonly<{ status: "block"; reason: string }>;

export type PanelLifecycleOperation = Readonly<{
  signal: AbortSignal;
  transition: GuardedTransitionProposal;
}>;

export type PanelLifecycle = Readonly<{
  dirty?: boolean;
  guard: (transition: GuardedTransitionProposal) => GuardOutcome;
  save: (operation: PanelLifecycleOperation) => Promise<void>;
  discard: (operation: PanelLifecycleOperation) => Promise<void>;
}>;

export type PendingGuardedPanel = Readonly<{
  panelId: PanelInstanceId;
  panelTitle: string;
  message: string;
}>;

export type PendingGuardedTransition = Readonly<{
  command: GuardedTransitionCommand;
  panels: readonly PendingGuardedPanel[];
}>;

/**
 * The declared responsive breakpoints a Canvas Workspace presents. Presentation
 * selects which Panels are visible; it never changes the logical Panel Stack.
 */
export const canvasBreakpoints = Object.freeze([
  "desktop",
  "tablet",
  "mobile",
] as const);

export type CanvasBreakpoint = (typeof canvasBreakpoints)[number];

/**
 * The media queries that select each declared breakpoint, ordered from the
 * narrowest presentation to the widest. They are part of the Public Contract so
 * applications can align their own layout with the Canvas, and they live beside
 * the breakpoints themselves so the server-safe entry points — and the testing
 * tools — can read them without reaching into the React layer.
 */
export const canvasBreakpointQueries: readonly (readonly [
  CanvasBreakpoint,
  string,
])[] = Object.freeze([
  Object.freeze(["mobile", "(max-width: 47.999rem)"] as const),
  Object.freeze([
    "tablet",
    "(min-width: 48rem) and (max-width: 79.999rem)",
  ] as const),
  Object.freeze(["desktop", "(min-width: 80rem)"] as const),
]);

export type PresentationOutcome =
  | Readonly<{ status: "updated"; breakpoint: CanvasBreakpoint }>
  | Readonly<{ status: "unchanged"; breakpoint: CanvasBreakpoint }>
  | Readonly<{ status: "rejected"; reason: "unsupported-breakpoint" }>;

export type PanelEngineSnapshot = Readonly<{
  workspaceId: WorkspaceId;
  version: StackVersion;
  panels: readonly OpenPanel[];
  activePanelId: PanelInstanceId;
  deepestPanelId: PanelInstanceId;
  visiblePanelIds: readonly PanelInstanceId[];
  breakpoint: CanvasBreakpoint;
  /**
   * How the transition that produced this snapshot should be recorded by a
   * Navigation Adapter. Meaningful persistent navigation reports `push`;
   * normalization reports `replace`; activation-only, presentation, and
   * transient changes report `none`.
   */
  navigationIntent: NavigationIntent;
  transition: PendingGuardedTransition | null;
}>;

export type NavigationIntent = "push" | "replace" | "none";

export type OpenPanelCommand<
  Reference extends PanelReference = PanelReference,
> = Readonly<{
  originId?: PanelInstanceId;
  panel: Reference;
}>;

export type OpenPanelOutcome =
  | Readonly<{
      status: "opened";
      instanceId: PanelInstanceId;
      removedPanelIds: readonly PanelInstanceId[];
    }>
  | Readonly<{
      status: "reused";
      instanceId: PanelInstanceId;
      removedPanelIds: readonly PanelInstanceId[];
    }>
  | Readonly<{
      status: "replaced";
      instanceId: PanelInstanceId;
      replacedInstanceId: PanelInstanceId;
      removedPanelIds: readonly PanelInstanceId[];
    }>
  | Readonly<{
      status: "confirmation-required";
      command: "open";
      panelIds: readonly PanelInstanceId[];
    }>
  | Readonly<{
      status: "rejected";
      reason: "transition-blocked";
      originId: PanelInstanceId;
      panelId: PanelInstanceId;
    }>
  | Readonly<{
      status: "rejected";
      reason: "stale-origin" | "invalid-origin" | "transition-in-progress";
      originId: PanelInstanceId;
    }>
  | Readonly<{
      status: "rejected";
      reason: "invalid-panel-reference";
      originId: PanelInstanceId;
      panelKind: string;
    }>
  | Readonly<{
      status: "rejected";
      reason: "deduplication-conflict";
      originId: PanelInstanceId;
      panelKind: string;
      panelKey: PanelKey;
    }>
  | Readonly<{
      status: "rejected";
      reason: "not-closable";
      originId: PanelInstanceId;
      panelId: PanelInstanceId;
    }>;

export type UpdatePanelOutcome =
  | Readonly<{
      status: "updated";
      panelId: PanelInstanceId;
      navigationIntent: "replace" | "none";
    }>
  | Readonly<{
      status: "unchanged";
      command: "update";
      panelId: PanelInstanceId;
      navigationIntent: "none";
    }>
  | Readonly<{
      status: "rejected";
      command: "update";
      reason:
        | "stale-panel"
        | "invalid-panel"
        | "foreign-workspace"
        | "invalid-panel-reference"
        | "not-updatable"
        | "invalid-update"
        | "identity-change";
      panelId: PanelInstanceId;
    }>;

export type ActivatePanelOutcome =
  | Readonly<{
      status: "activated";
      panelId: PanelInstanceId;
      navigationIntent: "replace";
    }>
  | Readonly<{
      status: "unchanged";
      command: "activate";
      panelId: PanelInstanceId;
      navigationIntent: "none";
    }>
  | Readonly<{
      status: "rejected";
      command: "activate";
      reason:
        | "stale-panel"
        | "invalid-panel"
        | "invalid-panel-reference"
        | "foreign-workspace";
      panelId: PanelInstanceId;
    }>;

export type CollapsePanelOutcome =
  | Readonly<{
      status: "collapsed";
      panelId: PanelInstanceId;
      removedPanelIds: readonly PanelInstanceId[];
      navigationIntent: "push";
    }>
  | Readonly<{
      status: "unchanged";
      command: "collapse";
      panelId: PanelInstanceId;
      navigationIntent: "none";
    }>
  | Readonly<{
      status: "rejected";
      command: "collapse";
      reason:
        | "stale-panel"
        | "invalid-panel"
        | "invalid-panel-reference"
        | "foreign-workspace"
        | "not-closable"
        | "transition-in-progress";
      panelId: PanelInstanceId;
    }>;

export type ClosePanelOutcome =
  | Readonly<{
      status: "closed";
      panelId: PanelInstanceId;
      removedPanelIds: readonly PanelInstanceId[];
      activePanelId: PanelInstanceId;
      navigationIntent: "push";
    }>
  | Readonly<{
      status: "confirmation-required";
      command: "close";
      panelIds: readonly PanelInstanceId[];
    }>
  | Readonly<{
      status: "rejected";
      command: "close";
      reason:
        | "stale-panel"
        | "invalid-panel"
        | "invalid-panel-reference"
        | "foreign-workspace"
        | "root-panel"
        | "not-closable"
        | "transition-blocked"
        | "transition-in-progress";
      panelId: PanelInstanceId;
    }>;

export type RestoreStackOutcome =
  | Readonly<{
      status: "restored";
      removedPanelIds: readonly PanelInstanceId[];
      openedPanelIds: readonly PanelInstanceId[];
      activePanelId: PanelInstanceId;
      navigationIntent: NavigationIntent;
    }>
  | Readonly<{
      status: "unchanged";
      command: "restore";
      navigationIntent: "none";
    }>
  | Readonly<{
      status: "confirmation-required";
      command: "restore";
      panelIds: readonly PanelInstanceId[];
    }>
  | Readonly<{
      status: "rejected";
      command: "restore";
      reason: "transition-blocked" | "not-closable";
      panelId: PanelInstanceId;
    }>
  | Readonly<{
      status: "rejected";
      command: "restore";
      reason: "invalid-panel-reference";
      panelKind: string;
    }>
  | Readonly<{
      status: "rejected";
      command: "restore";
      reason: "transition-in-progress";
    }>;

export type TransitionResolutionOutcome =
  | Readonly<{
      status: "committed";
      decision: "save" | "discard";
      command: "open";
      panelIds: readonly PanelInstanceId[];
      outcome: Extract<
        OpenPanelOutcome,
        { status: "opened" | "reused" | "replaced" }
      >;
    }>
  | Readonly<{
      status: "committed";
      decision: "save" | "discard";
      command: "close";
      panelIds: readonly PanelInstanceId[];
      outcome: Extract<ClosePanelOutcome, { status: "closed" }>;
    }>
  | Readonly<{
      status: "committed";
      decision: "save" | "discard";
      command: "restore";
      panelIds: readonly PanelInstanceId[];
      outcome: Extract<RestoreStackOutcome, { status: "restored" }>;
    }>
  | Readonly<{
      status: "stayed";
      command: GuardedTransitionCommand;
      panelIds: readonly PanelInstanceId[];
    }>
  | Readonly<{
      status: "cancelled";
      command: GuardedTransitionCommand;
      reason: "stale-transition";
      panelIds: readonly PanelInstanceId[];
    }>
  | Readonly<{
      status: "rejected";
      reason:
        | "no-pending-transition"
        | "transition-in-progress"
        | "transition-decision-conflict";
    }>;

export type NavigationDocumentDiagnostic = Readonly<{
  code:
    | "invalid-json"
    | "duplicate-key"
    | "document-too-large"
    | "invalid-document"
    | "unsupported-schema"
    | "too-many-panels"
    | "unknown-kind"
    | "transient-kind"
    | "unsupported-codec-version"
    | "missing-migration"
    | "migration-failed"
    | "invalid-descriptor"
    | "decode-failed";
  path: string;
}>;

export type NavigationDocumentDecodeOutcome<
  Reference extends PanelReference = PanelReference,
> =
  | Readonly<{
      status: "decoded";
      references: readonly Reference[];
      normalized: boolean;
    }>
  | Readonly<{
      status: "rejected";
      diagnostic: NavigationDocumentDiagnostic;
    }>;

export type NavigationRecoveryReason =
  | "invalid-document"
  | "unavailable"
  | "denied"
  | "loader-failed"
  | "aborted";

export type NavigationRecoveryIntent = Readonly<{
  kind: "recovery-panel";
  reason: NavigationRecoveryReason;
  failedPanelIndex: number | null;
}>;

export type NavigationRestorationOutcome<
  Reference extends PanelReference = PanelReference,
> =
  | Readonly<{
      status: "restored";
      references: readonly Reference[];
      navigationIntent: "none" | "replace";
      recovery: null;
    }>
  | Readonly<{
      status: "recovered";
      references: readonly Reference[];
      navigationIntent: "replace";
      recovery: NavigationRecoveryIntent;
    }>;

export type PanelEngine<Reference extends PanelReference = PanelReference> =
  Readonly<{
    getSnapshot: () => PanelEngineSnapshot;
    encodeNavigationDocument: () => string;
    decodeNavigationDocument: (
      encoded: string,
    ) => NavigationDocumentDecodeOutcome<Reference>;
    restoreNavigationDocument: (
      encoded: string,
      context: Readonly<{ signal: AbortSignal }>,
    ) => Promise<NavigationRestorationOutcome<Reference>>;
    subscribe: (listener: () => void) => () => void;
    open: (command: OpenPanelCommand<Reference>) => OpenPanelOutcome;
    activate: (command: { target: PanelInstanceRef }) => ActivatePanelOutcome;
    collapse: (command: { target: PanelInstanceRef }) => CollapsePanelOutcome;
    update: <Kind extends string, Input, Update>(command: {
      definition: PanelDefinition<Kind, Input, Update>;
      target: PanelInstanceRef;
      update: NoInfer<Update>;
    }) => UpdatePanelOutcome;
    close: (command?: { target?: PanelInstanceRef }) => ClosePanelOutcome;
    setPresentation: (command: {
      breakpoint: CanvasBreakpoint;
    }) => PresentationOutcome;
    /**
     * Moves the Panel Stack to the Panels `references` describes, resolving
     * every affected Transition Guard as one Guarded Transition and committing
     * atomically. Panels shared with the current stack keep their identity and
     * their guards are never consulted.
     */
    restoreStack: (command: {
      references: readonly Reference[];
      navigationIntent?: NavigationIntent;
    }) => RestoreStackOutcome;
    registerLifecycle: (command: {
      target: PanelInstanceRef;
      lifecycle: PanelLifecycle;
    }) => () => void;
    resolveTransition: (command: {
      decision: "save" | "discard" | "stay";
    }) => Promise<TransitionResolutionOutcome>;
  }>;

type PanelDefinitionShape = Readonly<{
  role: "panel";
  kind: string;
  deduplication: PanelDeduplication;
  closable: boolean;
  key?: (input: never) => string;
  title: (input: never) => string;
  reference: (input: never) => PanelReference<string, unknown>;
  persistence?: unknown;
  update?: Readonly<{
    validate: (update: unknown) => boolean;
    validateResult: (value: unknown) => boolean;
    apply: (current: never, update: never) => unknown;
    navigation: "replace" | "none";
  }>;
}>;

type ReferenceOf<Definition> =
  Definition extends PanelDefinition<
    infer Kind,
    infer Input,
    infer _Update,
    infer _Descriptor
  >
    ? PanelReference<Kind, Input>
    : never;

function cloneAndFreezePanelInput<Input>(input: Input): DeepReadonly<Input> {
  const validateVisited = new WeakSet<object>();
  const assertPlainInput = (value: unknown): void => {
    if (
      value === null ||
      typeof value !== "object" ||
      validateVisited.has(value)
    ) {
      return;
    }
    if (!Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(
          "Panel input may contain only plain objects and arrays",
        );
      }
    }
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      throw new TypeError(
        "Panel input may not contain symbol-keyed properties",
      );
    }

    validateVisited.add(value);
    for (const child of Object.values(value)) assertPlainInput(child);
  };

  assertPlainInput(input);
  let clone: Input;
  try {
    clone = structuredClone(input);
  } catch (cause) {
    throw new TypeError("Panel input must be structured-cloneable", { cause });
  }

  const visited = new WeakSet<object>();
  const freeze = (value: unknown): void => {
    if (value === null || typeof value !== "object" || visited.has(value)) {
      return;
    }
    if (!Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(
          "Panel input may contain only plain objects and arrays",
        );
      }
    }

    visited.add(value);
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };

  freeze(clone);
  return clone as DeepReadonly<Input>;
}

const navigationDocumentSchemaVersion = 1;
const maximumNavigationDocumentBytes = 16_384;
const maximumNavigationDocumentPanels = 32;
const maximumNavigationDescriptorDepth = 32;
const navigationParameterVersion = 1;
const navigationParameterPrefix = `v${navigationParameterVersion}.`;

/**
 * The query parameter name a URL-Owning Canvas Workspace claims by default.
 */
export const navigationParameterName = "canvas";

/**
 * The longest supported navigation parameter value, derived from the
 * Navigation Document byte limit once base64url expansion is applied.
 */
export const maximumNavigationParameterLength =
  navigationParameterPrefix.length +
  Math.ceil((maximumNavigationDocumentBytes * 4) / 3);

export type NavigationParameterDiagnostic = Readonly<{
  code:
    | "missing-prefix"
    | "unsupported-parameter-version"
    | "parameter-too-large"
    | "invalid-base64url"
    | "invalid-utf8";
  path: string;
}>;

export type NavigationParameterDecodeOutcome =
  | Readonly<{ status: "decoded"; document: string }>
  | Readonly<{ status: "rejected"; diagnostic: NavigationParameterDiagnostic }>;

const base64urlAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const base64urlSextets = new Map(
  [...base64urlAlphabet].map((character, sextet) => [character, sextet]),
);

function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] as number;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += base64urlAlphabet[first >> 2];
    encoded += base64urlAlphabet[((first & 0b11) << 4) | ((second ?? 0) >> 4)];
    if (second === undefined) break;
    encoded +=
      base64urlAlphabet[((second & 0b1111) << 2) | ((third ?? 0) >> 6)];
    if (third === undefined) break;
    encoded += base64urlAlphabet[third & 0b111111];
  }
  return encoded;
}

function decodeBase64Url(encoded: string): Uint8Array | null {
  // A single trailing sextet cannot complete a byte, so it is never canonical.
  if (encoded.length === 0 || encoded.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((encoded.length * 3) / 4));
  let byteLength = 0;
  let accumulator = 0;
  let bits = 0;
  for (const character of encoded) {
    const sextet = base64urlSextets.get(character);
    if (sextet === undefined) return null;
    accumulator = (accumulator << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteLength] = (accumulator >> bits) & 0xff;
      byteLength += 1;
    }
  }
  // Reject non-canonical encodings whose discarded padding bits are set.
  if (bits > 0 && (accumulator & ((1 << bits) - 1)) !== 0) return null;
  return bytes.subarray(0, byteLength);
}

/**
 * Wraps an encoded Navigation Document as a versioned, namespaced navigation
 * parameter value suitable for a URL query string.
 */
export function encodeNavigationParameter(document: string): string {
  if (utf8ByteLength(document) > maximumNavigationDocumentBytes) {
    throw new RangeError("Navigation Document exceeds the byte limit");
  }
  const bytes = new TextEncoder().encode(document);
  return `${navigationParameterPrefix}${encodeBase64Url(bytes)}`;
}

/**
 * Unwraps a navigation parameter value into the encoded Navigation Document it
 * carries. Document-level validation remains the Panel Engine's responsibility.
 */
export function decodeNavigationParameter(
  value: string,
): NavigationParameterDecodeOutcome {
  const reject = (
    code: NavigationParameterDiagnostic["code"],
  ): NavigationParameterDecodeOutcome =>
    Object.freeze({
      status: "rejected",
      diagnostic: Object.freeze({ code, path: "$" }),
    } as const);

  if (typeof value !== "string") return reject("missing-prefix");
  const prefix = /^v(\d+)\./.exec(value);
  if (!prefix) return reject("missing-prefix");
  if (prefix[1] !== String(navigationParameterVersion)) {
    return reject("unsupported-parameter-version");
  }
  if (value.length > maximumNavigationParameterLength) {
    return reject("parameter-too-large");
  }
  const bytes = decodeBase64Url(value.slice(prefix[0].length));
  if (!bytes) return reject("invalid-base64url");
  let document: string;
  try {
    document = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return reject("invalid-utf8");
  }
  return Object.freeze({ status: "decoded", document } as const);
}

/**
 * Resolves which Panels the declared breakpoint presents. Desktop presents the
 * whole ordered stack, tablet adds one previous-context Panel to the Active
 * Panel, and mobile presents the Active Panel alone.
 */
function resolveVisiblePanelIds(
  panels: readonly OpenPanel[],
  activePanelId: PanelInstanceId,
  breakpoint: CanvasBreakpoint,
): readonly PanelInstanceId[] {
  if (breakpoint === "desktop") {
    return Object.freeze(panels.map(({ instanceId }) => instanceId));
  }
  const activeIndex = panels.findIndex(
    ({ instanceId }) => instanceId === activePanelId,
  );
  const previousContext = breakpoint === "tablet" ? 1 : 0;
  return Object.freeze(
    panels
      .slice(Math.max(0, activeIndex - previousContext), activeIndex + 1)
      .map(({ instanceId }) => instanceId),
  );
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function canonicalJson(
  value: unknown,
  maximumDepth = maximumNavigationDescriptorDepth,
): string {
  const ancestors = new WeakSet<object>();
  const visit = (candidate: unknown, depth: number): string => {
    if (depth > maximumDepth) {
      throw new TypeError("Navigation descriptor nesting is too deep");
    }
    if (candidate === null || typeof candidate === "boolean") {
      return String(candidate);
    }
    if (typeof candidate === "string") return JSON.stringify(candidate);
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        throw new TypeError("Navigation descriptors require finite numbers");
      }
      return Object.is(candidate, -0) ? "0" : String(candidate);
    }
    if (typeof candidate !== "object") {
      throw new TypeError("Navigation descriptors must contain JSON values");
    }
    if (ancestors.has(candidate)) {
      throw new TypeError("Navigation descriptors may not contain cycles");
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const expectedKeys = new Set<PropertyKey>(["length"]);
        const values: string[] = [];
        for (let index = 0; index < candidate.length; index += 1) {
          const property = Object.getOwnPropertyDescriptor(candidate, index);
          if (!property || !("value" in property) || !property.enumerable) {
            throw new TypeError(
              "Navigation descriptor arrays must be dense JSON arrays",
            );
          }
          expectedKeys.add(String(index));
          values.push(visit(property.value, depth + 1));
        }
        if (Reflect.ownKeys(candidate).some((key) => !expectedKeys.has(key))) {
          throw new TypeError(
            "Navigation descriptor arrays must be dense JSON arrays",
          );
        }
        return `[${values.join(",")}]`;
      }
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("Navigation descriptors require plain objects");
      }
      const keys = Object.keys(candidate).sort();
      if (
        keys.some((key) =>
          ["__proto__", "constructor", "prototype"].includes(key),
        )
      ) {
        throw new TypeError("Navigation descriptors contain an unsafe key");
      }
      if (Reflect.ownKeys(candidate).length !== keys.length) {
        throw new TypeError("Navigation descriptors require string keys");
      }
      return `{${keys
        .map((key) => {
          const property = Object.getOwnPropertyDescriptor(candidate, key);
          if (!property || !("value" in property) || !property.enumerable) {
            throw new TypeError(
              "Navigation descriptors require data properties",
            );
          }
          return `${JSON.stringify(key)}:${visit(property.value, depth + 1)}`;
        })
        .join(",")}}`;
    } finally {
      ancestors.delete(candidate);
    }
  };
  return visit(value, 0);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

function findDuplicateJsonKey(source: string): string | undefined {
  let index = 0;
  let duplicate: string | undefined;
  const skipWhitespace = () => {
    while (/\s/u.test(source[index] ?? "")) index += 1;
  };
  const readString = (): string => {
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source[index] === '"') {
        index += 1;
        break;
      }
      index += 1;
    }
    return JSON.parse(source.slice(start, index)) as string;
  };
  const childPath = (path: string, key: string) =>
    /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)
      ? `${path}.${key}`
      : `${path}[${JSON.stringify(key)}]`;
  const visit = (path: string): void => {
    skipWhitespace();
    if (source[index] === "{") {
      index += 1;
      const keys = new Set<string>();
      skipWhitespace();
      while (index < source.length && source[index] !== "}") {
        if (source[index] !== '"') return;
        const key = readString();
        const keyPath = childPath(path, key);
        if (keys.has(key)) duplicate ??= keyPath;
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ":") return;
        index += 1;
        visit(keyPath);
        skipWhitespace();
        if (source[index] !== ",") break;
        index += 1;
        skipWhitespace();
      }
      if (source[index] === "}") index += 1;
      return;
    }
    if (source[index] === "[") {
      index += 1;
      let itemIndex = 0;
      skipWhitespace();
      while (index < source.length && source[index] !== "]") {
        visit(`${path}[${itemIndex}]`);
        itemIndex += 1;
        skipWhitespace();
        if (source[index] !== ",") break;
        index += 1;
        skipWhitespace();
      }
      if (source[index] === "]") index += 1;
      return;
    }
    if (source[index] === '"') {
      readString();
      return;
    }
    while (index < source.length && !/[\s,\]}]/u.test(source[index] ?? "")) {
      index += 1;
    }
  };
  try {
    visit("$");
  } catch {
    return undefined;
  }
  return duplicate;
}

function panelReferencesEqual(
  left: PanelReference,
  right: PanelReference,
): boolean {
  if (left === right) return true;
  if (referenceDefinitions.get(left) !== referenceDefinitions.get(right))
    return false;
  if (left.kind !== right.kind || left.panelKey !== right.panelKey)
    return false;
  const compared = new WeakMap<object, object>();
  const equal = (leftValue: unknown, rightValue: unknown): boolean => {
    if (Object.is(leftValue, rightValue)) return true;
    if (
      leftValue === null ||
      rightValue === null ||
      typeof leftValue !== "object" ||
      typeof rightValue !== "object"
    ) {
      return false;
    }
    const previousMatch = compared.get(leftValue);
    if (previousMatch !== undefined) return previousMatch === rightValue;
    if (Array.isArray(leftValue) !== Array.isArray(rightValue)) return false;
    const leftKeys = Object.keys(leftValue);
    const rightKeys = Object.keys(rightValue);
    if (leftKeys.length !== rightKeys.length) return false;
    compared.set(leftValue, rightValue);
    return leftKeys.every(
      (key) =>
        Object.hasOwn(rightValue, key) &&
        equal(
          (leftValue as Record<string, unknown>)[key],
          (rightValue as Record<string, unknown>)[key],
        ),
    );
  };
  return equal(left.input, right.input);
}

export function defineRootPanel<const Kind extends string>(options: {
  kind: Kind;
  title: string;
}): RootPanelDefinition<Kind> {
  const reference = Object.freeze({
    kind: options.kind,
    input: undefined,
  }) as PanelReference<Kind, undefined>;

  return Object.freeze({
    role: "root",
    kind: options.kind,
    title: options.title,
    reference,
  });
}

export function definePanel<
  const Kind extends string,
  Input,
  Update = never,
  Descriptor extends JsonValue = JsonValue,
>(
  options: {
    kind: Kind;
    title: (input: DeepReadonly<Input>) => string;
    closable?: boolean;
    persistence?: PanelPersistence<Input, Descriptor>;
    update?: Readonly<{
      validate: (value: unknown) => value is Update;
      validateResult: (value: unknown) => value is Input;
      apply: (current: DeepReadonly<Input>, update: Update) => Input;
      navigation: "replace" | "none";
    }>;
  } & (
    | {
        deduplication: "reuse" | "replace";
        key: (input: DeepReadonly<Input>) => string;
      }
    | {
        deduplication?: "allow-many";
        key?: (input: DeepReadonly<Input>) => string;
      }
  ),
): PanelDefinition<Kind, Input, Update, Descriptor> {
  const updatePolicy =
    options.update === undefined
      ? undefined
      : Object.freeze({
          validate: options.update.validate,
          validateResult: options.update.validateResult,
          apply: options.update.apply,
          navigation: options.update.navigation,
        });
  const suppliedPersistence = options.persistence;
  const suppliedMode = (
    suppliedPersistence as Readonly<{ mode?: unknown }> | undefined
  )?.mode;
  if (
    suppliedPersistence !== undefined &&
    suppliedMode !== "transient" &&
    suppliedMode !== "navigation" &&
    suppliedMode !== "navigation-with-loader"
  ) {
    throw new TypeError("Unknown Panel persistence mode");
  }
  let persistence: PanelPersistence<Input, Descriptor>;
  if (
    suppliedPersistence === undefined ||
    suppliedPersistence.mode === "transient"
  ) {
    persistence = Object.freeze({ mode: "transient" });
  } else {
    if (
      !Number.isSafeInteger(suppliedPersistence.version) ||
      suppliedPersistence.version < 1
    ) {
      throw new TypeError(
        "Panel persistence versions must be positive integers",
      );
    }
    if (
      typeof suppliedPersistence.codec?.encode !== "function" ||
      typeof suppliedPersistence.codec.validate !== "function" ||
      typeof suppliedPersistence.codec.decode !== "function" ||
      !Array.isArray(suppliedPersistence.codec.migrations) ||
      (suppliedPersistence.mode === "navigation-with-loader" &&
        typeof suppliedPersistence.restore !== "function")
    ) {
      throw new TypeError(
        "Panel persistence requires a valid descriptor codec",
      );
    }
    const seenVersions = new Set<number>();
    const migrations = suppliedPersistence.codec.migrations.map((migration) =>
      Object.freeze({ from: migration.from, migrate: migration.migrate }),
    );
    for (const migration of migrations) {
      if (
        !Number.isSafeInteger(migration.from) ||
        migration.from < 1 ||
        migration.from >= suppliedPersistence.version ||
        seenVersions.has(migration.from) ||
        typeof migration.migrate !== "function"
      ) {
        throw new TypeError(
          "Panel descriptor migrations must have unique valid versions",
        );
      }
      seenVersions.add(migration.from);
    }
    for (let version = 1; version < suppliedPersistence.version; version += 1) {
      if (!seenVersions.has(version)) {
        throw new TypeError(
          `Missing Panel descriptor migration from version ${version}`,
        );
      }
    }
    const codec = Object.freeze({
      encode: suppliedPersistence.codec.encode,
      validate: suppliedPersistence.codec.validate,
      decode: suppliedPersistence.codec.decode,
      migrations: Object.freeze(migrations),
    });
    persistence =
      suppliedPersistence.mode === "navigation"
        ? Object.freeze({
            mode: "navigation",
            version: suppliedPersistence.version,
            codec,
          })
        : Object.freeze({
            mode: "navigation-with-loader",
            version: suppliedPersistence.version,
            codec,
            restore: suppliedPersistence.restore,
          });
  }
  const definition = Object.freeze({
    role: "panel",
    kind: options.kind,
    deduplication: options.deduplication ?? "allow-many",
    closable: options.closable ?? true,
    ...(options.key === undefined ? {} : { key: options.key }),
    title: options.title,
    persistence,
    ...(updatePolicy === undefined ? {} : { update: updatePolicy }),
    reference: (input: Input) => {
      const immutableInput = cloneAndFreezePanelInput(input);
      const panelKey = options.key?.(immutableInput) as PanelKey | undefined;
      if (
        panelKey !== undefined &&
        (typeof panelKey !== "string" || panelKey.length === 0)
      ) {
        throw new TypeError("Panel Keys must be non-empty strings");
      }
      const reference = Object.freeze({
        kind: options.kind,
        input: immutableInput,
        ...(panelKey === undefined ? {} : { panelKey }),
      }) as PanelReference<Kind, Input>;
      referenceDefinitions.set(reference, definition);
      return reference;
    },
  });
  return definition;
}

export function createPanelEngine<
  const Definitions extends readonly PanelDefinitionShape[],
>(options: {
  root: RootPanelDefinition;
  panels: Definitions;
  onSubscriberError?: (error: AggregateError) => void;
}): PanelEngine<ReferenceOf<Definitions[number]>> {
  const workspaceId = `canvas-workspace-${nextEngineNumber++}` as WorkspaceId;
  // A Panel Instance ID is rendered into the DOM, so it is numbered within its
  // own Engine and nothing else. An Engine seeded the same way issues the same
  // identities whichever process it runs in, which is what lets a server render
  // and the browser that hydrates it agree about which element is which Panel.
  // Uniqueness beyond one Engine is not claimed and must not be relied upon:
  // the presentation scopes every lookup to the Workspace that owns it.
  let nextInstanceNumber = 1;
  const nextInstanceId = () =>
    `canvas-panel-${nextInstanceNumber++}` as PanelInstanceId;
  const instanceId = nextInstanceId();
  const rootInstanceRef = Object.freeze({
    workspaceId,
    instanceId,
    kind: options.root.kind,
  });
  const rootPanel = Object.freeze({
    instanceId,
    instanceRef: rootInstanceRef,
    kind: options.root.kind,
    title: options.root.title,
    isRoot: true,
    closable: false,
    reference: options.root.reference,
  });
  const issuedPanelIds = new Set<PanelInstanceId>([instanceId]);
  const issuedInstanceRefs = new WeakSet<object>([rootInstanceRef]);
  let snapshot = Object.freeze({
    workspaceId,
    version: 0 as StackVersion,
    panels: Object.freeze([rootPanel]),
    activePanelId: instanceId,
    deepestPanelId: instanceId,
    visiblePanelIds: Object.freeze([instanceId]),
    breakpoint: "desktop" as CanvasBreakpoint,
    navigationIntent: "none" as NavigationIntent,
    transition: null,
  }) as PanelEngineSnapshot;
  const listeners = new Set<() => void>();
  type RegisteredLifecycle = PanelLifecycle & Readonly<{ dirty: boolean }>;
  type GuardedRequest =
    | Readonly<{
        command: "open";
        originId: PanelInstanceId;
        panel: PanelReference;
      }>
    | Readonly<{ command: "close"; panelId: PanelInstanceId }>
    | Readonly<{
        command: "restore";
        references: readonly PanelReference[];
      }>;
  const lifecycles = new Map<PanelInstanceId, RegisteredLifecycle>();
  let pendingTransition:
    | Readonly<{
        readModel: PendingGuardedTransition;
        lifecycles: readonly RegisteredLifecycle[];
        proposal: GuardedTransitionProposal;
        abortController: AbortController;
        resolution: {
          completedLifecycleCount: number;
          decision: "save" | "discard" | null;
          resolving: boolean;
        };
        request: GuardedRequest;
        expectedVersion: StackVersion;
        commit: () =>
          | OpenPanelOutcome
          | ClosePanelOutcome
          | RestoreStackOutcome;
      }>
    | undefined;
  const registeredKinds = new Set([options.root.kind]);
  for (const definition of options.panels) {
    if (registeredKinds.has(definition.kind)) {
      throw new Error(`Duplicate Panel Kind: ${definition.kind}`);
    }
    registeredKinds.add(definition.kind);
  }
  const definitions = new Map(
    options.panels.map((definition) => [
      definition.kind,
      {
        closable: definition.closable,
        deduplication: definition.deduplication,
        identity: definition,
        persistence: definition.persistence as PanelPersistence<unknown>,
        reference: definition.reference as (input: unknown) => PanelReference,
        title: definition.title as (input: unknown) => string,
        update: definition.update as
          | Readonly<{
              validate: (update: unknown) => boolean;
              validateResult: (value: unknown) => boolean;
              apply: (current: unknown, update: unknown) => unknown;
              navigation: "replace" | "none";
            }>
          | undefined,
      },
    ]),
  );

  type RegisteredDefinition = NonNullable<
    ReturnType<(typeof definitions)["get"]>
  >;

  /**
   * Builds a Panel instance for a reference. The title is computed by the
   * caller before any Guarded Transition is staged, so a Panel Kind whose
   * title function throws is rejected before dirty work is put at risk.
   */
  const createPanel = (
    reference: PanelReference,
    definition: RegisteredDefinition,
    title: string,
  ): OpenPanel => {
    const panelId = nextInstanceId();
    issuedPanelIds.add(panelId);
    const panel = Object.freeze({
      instanceId: panelId,
      instanceRef: Object.freeze({
        workspaceId,
        instanceId: panelId,
        kind: reference.kind,
      }),
      kind: reference.kind,
      title,
      isRoot: false,
      closable: definition.closable,
      ...(reference.panelKey === undefined
        ? {}
        : { panelKey: reference.panelKey }),
      reference,
    });
    issuedInstanceRefs.add(panel.instanceRef);
    return panel;
  };

  const notifySubscribers = () => {
    const subscriberErrors: unknown[] = [];
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        subscriberErrors.push(error);
      }
    }
    if (subscriberErrors.length > 0) {
      const error = new AggregateError(
        subscriberErrors,
        "Panel Engine subscriber failed after the snapshot was published",
      );
      try {
        options.onSubscriberError?.(error);
      } catch {
        // Error reporting cannot change the outcome of a published command.
      }
    }
  };

  const publish = (
    panels: readonly OpenPanel[],
    activePanelId: PanelInstanceId | undefined,
    navigationIntent: NavigationIntent,
  ) => {
    const deepestPanel = panels.at(-1);
    if (!deepestPanel || activePanelId === undefined) {
      throw new Error("A Canvas Workspace must retain its Root Panel");
    }
    if (!panels.some(({ instanceId }) => instanceId === activePanelId)) {
      throw new Error("The Active Panel must belong to the Canvas Workspace");
    }

    pendingTransition?.abortController.abort();

    snapshot = Object.freeze({
      workspaceId,
      version: (snapshot.version + 1) as StackVersion,
      panels: Object.freeze(panels),
      activePanelId,
      deepestPanelId: deepestPanel.instanceId,
      visiblePanelIds: resolveVisiblePanelIds(
        panels,
        activePanelId,
        snapshot.breakpoint,
      ),
      breakpoint: snapshot.breakpoint,
      navigationIntent,
      transition: snapshot.transition,
    });
    notifySubscribers();
  };

  const setTransition = (transition: PendingGuardedTransition | null) => {
    snapshot = Object.freeze({ ...snapshot, transition });
    notifySubscribers();
  };

  const evaluateGuard = (
    lifecycle: PanelLifecycle,
    proposal: GuardedTransitionProposal,
  ): GuardOutcome => {
    let outcome: unknown;
    try {
      outcome = lifecycle.guard(proposal);
    } catch {
      return Object.freeze({ status: "block", reason: "Panel guard failed" });
    }
    if (
      typeof outcome !== "object" ||
      outcome === null ||
      !("status" in outcome)
    ) {
      return Object.freeze({
        status: "block",
        reason: "Invalid Guard Outcome",
      });
    }
    if (outcome.status === "allow") return Object.freeze({ status: "allow" });
    if (
      outcome.status === "confirm" &&
      "message" in outcome &&
      typeof outcome.message === "string" &&
      outcome.message.trim().length > 0
    ) {
      return Object.freeze({ status: "confirm", message: outcome.message });
    }
    if (
      outcome.status === "block" &&
      "reason" in outcome &&
      typeof outcome.reason === "string" &&
      outcome.reason.trim().length > 0
    ) {
      return Object.freeze({ status: "block", reason: outcome.reason });
    }
    return Object.freeze({ status: "block", reason: "Invalid Guard Outcome" });
  };

  const stageGuardedTransition = (
    command: GuardedTransitionCommand,
    removedPanels: readonly OpenPanel[],
    commit: () => OpenPanelOutcome | ClosePanelOutcome | RestoreStackOutcome,
    request: GuardedRequest,
  ):
    | Readonly<{ status: "allow" }>
    | Readonly<{ status: "block"; panelId: PanelInstanceId }>
    | Readonly<{
        status: "confirm";
        panelIds: readonly PanelInstanceId[];
      }> => {
    const removedPanelIds = Object.freeze(
      removedPanels.map(({ instanceId: removedPanelId }) => removedPanelId),
    );
    const proposal = Object.freeze({ command, removedPanelIds });
    const confirmations: Array<
      Readonly<{
        panel: OpenPanel;
        lifecycle: RegisteredLifecycle;
        message: string;
      }>
    > = [];
    for (const guardedPanel of [...removedPanels].reverse()) {
      const lifecycle = lifecycles.get(guardedPanel.instanceId);
      if (!lifecycle?.dirty) continue;
      const guardOutcome = evaluateGuard(lifecycle, proposal);
      if (guardOutcome.status === "block") {
        return Object.freeze({
          status: "block",
          panelId: guardedPanel.instanceId,
        });
      }
      if (guardOutcome.status === "confirm") {
        confirmations.push(
          Object.freeze({
            panel: guardedPanel,
            lifecycle,
            message: guardOutcome.message,
          }),
        );
      }
    }
    if (confirmations.length === 0) return Object.freeze({ status: "allow" });

    const panels = Object.freeze(
      confirmations.map(({ panel: guardedPanel, message }) =>
        Object.freeze({
          panelId: guardedPanel.instanceId,
          panelTitle: guardedPanel.title,
          message,
        }),
      ),
    );
    const readModel = Object.freeze({ command, panels });
    pendingTransition = Object.freeze({
      abortController: new AbortController(),
      readModel,
      lifecycles: Object.freeze(
        confirmations.map(({ lifecycle }) => lifecycle),
      ),
      proposal,
      resolution: {
        completedLifecycleCount: 0,
        decision: null,
        resolving: false,
      },
      request,
      expectedVersion: snapshot.version,
      commit,
    });
    setTransition(readModel);
    return Object.freeze({
      status: "confirm",
      panelIds: Object.freeze(panels.map(({ panelId }) => panelId)),
    });
  };

  const rejectedNavigationDetails = new WeakMap<
    object,
    Readonly<{
      references: readonly ReferenceOf<Definitions[number]>[];
      failedPanelIndex: number | null;
    }>
  >();
  type EngineApi = PanelEngine<ReferenceOf<Definitions[number]>>;
  let engineApi: EngineApi;
  engineApi = Object.freeze({
    getSnapshot: () => snapshot,
    encodeNavigationDocument: () => {
      const panels: Array<{
        kind: string;
        version: number;
        descriptor: JsonValue;
      }> = [];
      for (const panel of snapshot.panels.slice(1)) {
        const definition = definitions.get(panel.kind);
        if (!definition || definition.persistence.mode === "transient") break;
        if (panels.length >= maximumNavigationDocumentPanels) {
          throw new RangeError("Navigation Document exceeds the Panel limit");
        }
        const descriptor = definition.persistence.codec.encode(
          panel.reference.input,
        );
        const canonicalDescriptor = canonicalJson(descriptor);
        let validDescriptor = false;
        try {
          validDescriptor = definition.persistence.codec.validate(descriptor);
        } catch {
          // Codec exceptions are normalized below.
        }
        if (!validDescriptor) {
          throw new TypeError(
            "Panel descriptor codec emitted an invalid descriptor",
          );
        }
        panels.push({
          descriptor: JSON.parse(canonicalDescriptor) as JsonValue,
          kind: panel.kind,
          version: definition.persistence.version,
        });
      }
      const encoded = canonicalJson(
        {
          panels,
          version: navigationDocumentSchemaVersion,
        },
        maximumNavigationDescriptorDepth + 3,
      );
      if (utf8ByteLength(encoded) > maximumNavigationDocumentBytes) {
        throw new RangeError("Navigation Document exceeds the byte limit");
      }
      return encoded;
    },
    decodeNavigationDocument: (encoded: string) => {
      const references: PanelReference[] = [];
      const reject = (
        code: NavigationDocumentDiagnostic["code"],
        path: string,
        failedPanelIndex: number | null = null,
      ): NavigationDocumentDecodeOutcome<ReferenceOf<Definitions[number]>> => {
        const outcome = {
          status: "rejected",
          diagnostic: Object.freeze({ code, path }),
        } as const;
        rejectedNavigationDetails.set(
          outcome,
          Object.freeze({
            references: Object.freeze([...references]) as readonly ReferenceOf<
              Definitions[number]
            >[],
            failedPanelIndex,
          }),
        );
        return Object.freeze(outcome);
      };
      if (
        typeof encoded !== "string" ||
        utf8ByteLength(encoded) > maximumNavigationDocumentBytes
      ) {
        return reject("document-too-large", "$");
      }
      const duplicateKey = findDuplicateJsonKey(encoded);
      if (duplicateKey) return reject("duplicate-key", "$");
      let document: unknown;
      try {
        document = JSON.parse(encoded);
      } catch {
        return reject("invalid-json", "$");
      }
      if (
        !isPlainRecord(document) ||
        !hasExactKeys(document, ["panels", "version"])
      ) {
        return reject("invalid-document", "$");
      }
      if (document.version !== navigationDocumentSchemaVersion) {
        return reject("unsupported-schema", "$.version");
      }
      if (!Array.isArray(document.panels)) {
        return reject("invalid-document", "$.panels");
      }
      if (document.panels.length > maximumNavigationDocumentPanels) {
        return reject("too-many-panels", "$.panels");
      }
      let normalized = false;
      for (let index = 0; index < document.panels.length; index += 1) {
        const path = `$.panels[${index}]`;
        const encodedPanel = document.panels[index];
        if (
          !isPlainRecord(encodedPanel) ||
          !hasExactKeys(encodedPanel, ["descriptor", "kind", "version"]) ||
          typeof encodedPanel.kind !== "string" ||
          encodedPanel.kind.length === 0 ||
          !Number.isSafeInteger(encodedPanel.version) ||
          (encodedPanel.version as number) < 1 ||
          !("descriptor" in encodedPanel)
        ) {
          return reject("invalid-document", path, index);
        }
        const definition = definitions.get(encodedPanel.kind);
        if (!definition) return reject("unknown-kind", `${path}.kind`, index);
        const persistence = definition.persistence;
        if (persistence.mode === "transient") {
          return reject("transient-kind", `${path}.kind`, index);
        }
        const encodedVersion = encodedPanel.version as number;
        if (encodedVersion > persistence.version) {
          return reject("unsupported-codec-version", `${path}.version`, index);
        }
        let descriptor: unknown = encodedPanel.descriptor;
        try {
          canonicalJson(descriptor);
        } catch {
          return reject("invalid-descriptor", `${path}.descriptor`, index);
        }
        for (
          let version = encodedVersion;
          version < persistence.version;
          version += 1
        ) {
          const migration = persistence.codec.migrations.find(
            (candidate) => candidate.from === version,
          );
          if (!migration) {
            return reject("missing-migration", `${path}.version`, index);
          }
          try {
            descriptor = migration.migrate(descriptor);
            canonicalJson(descriptor);
          } catch {
            return reject("migration-failed", `${path}.descriptor`, index);
          }
          normalized = true;
        }
        let validDescriptor = false;
        try {
          validDescriptor = persistence.codec.validate(descriptor);
        } catch {
          return reject("invalid-descriptor", `${path}.descriptor`, index);
        }
        if (!validDescriptor) {
          return reject("invalid-descriptor", `${path}.descriptor`, index);
        }
        try {
          const input = persistence.codec.decode(descriptor as JsonValue);
          references.push(definition.reference(input));
        } catch {
          return reject("decode-failed", `${path}.descriptor`, index);
        }
      }
      return Object.freeze({
        status: "decoded",
        references: Object.freeze(references) as readonly ReferenceOf<
          Definitions[number]
        >[],
        normalized,
      });
    },
    restoreNavigationDocument: async (encoded, { signal }) => {
      const decoded = engineApi.decodeNavigationDocument(encoded);
      const rejectedDetails =
        decoded.status === "rejected"
          ? rejectedNavigationDetails.get(decoded)
          : undefined;
      const decodedReferences =
        decoded.status === "decoded"
          ? decoded.references
          : (rejectedDetails?.references ?? Object.freeze([]));
      const documentFailureIndex: number | null =
        decoded.status === "rejected"
          ? (rejectedDetails?.failedPanelIndex ?? null)
          : null;
      const recover = (
        references: readonly ReferenceOf<Definitions[number]>[],
        reason: NavigationRecoveryReason,
        failedPanelIndex: number | null,
      ): NavigationRestorationOutcome<ReferenceOf<Definitions[number]>> =>
        Object.freeze({
          status: "recovered",
          references: Object.freeze(references),
          navigationIntent: "replace",
          recovery: Object.freeze({
            kind: "recovery-panel",
            reason,
            failedPanelIndex,
          }),
        });

      if (decoded.status === "rejected") {
        return recover(
          decodedReferences,
          "invalid-document",
          documentFailureIndex,
        );
      }
      for (let index = 0; index < decodedReferences.length; index += 1) {
        const reference = decodedReferences[index];
        if (!reference) continue;
        const definition = definitions.get(reference.kind);
        if (definition?.persistence.mode !== "navigation-with-loader") {
          continue;
        }
        if (signal.aborted) {
          return recover(decodedReferences.slice(0, index), "aborted", index);
        }
        let availabilityStatus: PanelRestoreOutcome["status"] | undefined;
        try {
          const availability = await definition.persistence.restore(
            reference.input,
            { signal },
          );
          const status = availability.status;
          if (
            status === "available" ||
            status === "unavailable" ||
            status === "denied"
          ) {
            availabilityStatus = status;
          }
        } catch {
          return recover(
            decodedReferences.slice(0, index),
            signal.aborted ? "aborted" : "loader-failed",
            index,
          );
        }
        if (signal.aborted) {
          return recover(decodedReferences.slice(0, index), "aborted", index);
        }
        if (!availabilityStatus) {
          return recover(
            decodedReferences.slice(0, index),
            "loader-failed",
            index,
          );
        }
        if (availabilityStatus !== "available") {
          return recover(
            decodedReferences.slice(0, index),
            availabilityStatus,
            index,
          );
        }
      }
      return Object.freeze({
        status: "restored",
        references: decodedReferences,
        navigationIntent: decoded.normalized ? "replace" : "none",
        recovery: null,
      });
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPresentation: ({ breakpoint }) => {
      if (!canvasBreakpoints.includes(breakpoint)) {
        return Object.freeze({
          status: "rejected",
          reason: "unsupported-breakpoint",
        } as const);
      }
      if (breakpoint === snapshot.breakpoint) {
        return Object.freeze({ status: "unchanged", breakpoint } as const);
      }
      // Presentation is not a stack change: the Panel Stack, activation, and
      // transition history are carried across unchanged and the Stack Version
      // is deliberately not advanced.
      snapshot = Object.freeze({
        ...snapshot,
        visiblePanelIds: resolveVisiblePanelIds(
          snapshot.panels,
          snapshot.activePanelId,
          breakpoint,
        ),
        breakpoint,
        navigationIntent: "none",
      });
      notifySubscribers();
      return Object.freeze({ status: "updated", breakpoint } as const);
    },
    registerLifecycle: ({ target, lifecycle }) => {
      const panel = snapshot.panels.find(
        (candidate) => candidate.instanceId === target.instanceId,
      );
      if (
        target.workspaceId !== workspaceId ||
        !issuedInstanceRefs.has(target) ||
        !panel ||
        panel.kind !== target.kind
      ) {
        throw new TypeError("A lifecycle must target a current issued Panel");
      }
      if (
        typeof lifecycle !== "object" ||
        lifecycle === null ||
        typeof lifecycle.guard !== "function" ||
        typeof lifecycle.save !== "function" ||
        typeof lifecycle.discard !== "function"
      ) {
        throw new TypeError(
          "A Panel lifecycle requires guard, save, and discard functions",
        );
      }
      if (
        lifecycle.dirty !== undefined &&
        typeof lifecycle.dirty !== "boolean"
      ) {
        throw new TypeError("Panel lifecycle dirty must be a boolean");
      }
      const registeredLifecycle = Object.freeze({
        dirty: lifecycle.dirty ?? true,
        guard: lifecycle.guard,
        save: lifecycle.save,
        discard: lifecycle.discard,
      });
      lifecycles.set(target.instanceId, registeredLifecycle);
      return () => {
        if (lifecycles.get(target.instanceId) === registeredLifecycle) {
          lifecycles.delete(target.instanceId);
        }
      };
    },
    resolveTransition: async ({ decision }) => {
      const pending = pendingTransition;
      if (!pending) {
        return Object.freeze({
          status: "rejected",
          reason: "no-pending-transition",
        });
      }
      const panelIds = Object.freeze(
        pending.readModel.panels.map(({ panelId }) => panelId),
      );
      const cancelStaleTransition = (): TransitionResolutionOutcome => {
        pendingTransition = undefined;
        pending.abortController.abort();
        setTransition(null);
        return Object.freeze({
          status: "cancelled",
          command: pending.readModel.command,
          reason: "stale-transition",
          panelIds,
        });
      };
      if (pending.resolution.resolving) {
        return Object.freeze({
          status: "rejected",
          reason: "transition-in-progress",
        });
      }
      if (
        decision !== "stay" &&
        pending.resolution.decision !== null &&
        pending.resolution.decision !== decision
      ) {
        return Object.freeze({
          status: "rejected",
          reason: "transition-decision-conflict",
        });
      }
      if (decision === "stay") {
        pendingTransition = undefined;
        pending.abortController.abort();
        setTransition(null);
        return Object.freeze({
          status: "stayed",
          command: pending.readModel.command,
          panelIds,
        });
      }
      if (snapshot.version !== pending.expectedVersion) {
        return cancelStaleTransition();
      }
      let outcome: OpenPanelOutcome | ClosePanelOutcome | RestoreStackOutcome;
      try {
        pending.resolution.resolving = true;
        pending.resolution.decision ??= decision;
        for (
          let index = pending.resolution.completedLifecycleCount;
          index < pending.lifecycles.length;
          index += 1
        ) {
          const lifecycle = pending.lifecycles[index];
          if (!lifecycle)
            throw new Error("Pending Panel lifecycle disappeared");
          await lifecycle[decision]({
            signal: pending.abortController.signal,
            transition: pending.proposal,
          });
          pending.resolution.completedLifecycleCount = index + 1;
          if (snapshot.version !== pending.expectedVersion) {
            return cancelStaleTransition();
          }
        }
        if (snapshot.version !== pending.expectedVersion) {
          return cancelStaleTransition();
        }
        pendingTransition = undefined;
        snapshot = Object.freeze({ ...snapshot, transition: null });
        outcome = pending.commit();
      } catch (error) {
        pending.resolution.resolving = false;
        if (snapshot.version !== pending.expectedVersion) {
          return cancelStaleTransition();
        }
        throw error;
      }
      if (pending.readModel.command === "open") {
        if (
          outcome.status !== "opened" &&
          outcome.status !== "reused" &&
          outcome.status !== "replaced"
        ) {
          throw new Error("A guarded open did not produce a committed outcome");
        }
        return Object.freeze({
          status: "committed",
          decision,
          command: "open",
          panelIds,
          outcome,
        });
      }
      if (pending.request.command === "restore") {
        if (outcome.status !== "restored") {
          throw new Error(
            "A guarded restoration did not produce a committed outcome",
          );
        }
        return Object.freeze({
          status: "committed",
          decision,
          command: "restore",
          panelIds,
          outcome,
        });
      }
      if (outcome.status !== "closed") {
        throw new Error("A guarded close did not produce a committed outcome");
      }
      return Object.freeze({
        status: "committed",
        decision,
        command: "close",
        panelIds,
        outcome,
      });
    },
    open: ({ originId: requestedOriginId, panel }) => {
      const originId = requestedOriginId ?? snapshot.activePanelId;
      if (pendingTransition) {
        if (
          pendingTransition.request.command === "open" &&
          pendingTransition.request.originId === originId &&
          panelReferencesEqual(pendingTransition.request.panel, panel)
        ) {
          return Object.freeze({
            status: "confirmation-required",
            command: "open",
            panelIds: Object.freeze(
              pendingTransition.readModel.panels.map(({ panelId }) => panelId),
            ),
          });
        }
        return Object.freeze({
          status: "rejected",
          reason: "transition-in-progress",
          originId,
        });
      }
      const originIndex = snapshot.panels.findIndex(
        (candidate) => candidate.instanceId === originId,
      );
      if (originIndex < 0) {
        return Object.freeze({
          status: "rejected",
          reason: issuedPanelIds.has(originId)
            ? "stale-origin"
            : "invalid-origin",
          originId,
        });
      }

      const definition = definitions.get(panel.kind);
      if (
        !definition ||
        referenceDefinitions.get(panel) !== definition.identity
      ) {
        return Object.freeze({
          status: "rejected",
          reason: "invalid-panel-reference",
          originId,
          panelKind: panel.kind,
        });
      }

      const matchingIndex =
        panel.panelKey === undefined
          ? -1
          : snapshot.panels.findIndex(
              (candidate) =>
                candidate.kind === panel.kind &&
                candidate.panelKey === panel.panelKey,
            );
      if (definition.deduplication === "reuse" && matchingIndex >= 0) {
        const matchedPanel = snapshot.panels[matchingIndex];
        if (!matchedPanel) throw new Error("Matching Panel disappeared");
        const reusedPanels =
          matchingIndex < originIndex
            ? snapshot.panels
            : snapshot.panels.slice(0, matchingIndex + 1);
        const removedPanels = snapshot.panels.slice(reusedPanels.length);
        const blockingPanel = removedPanels.find(
          (candidate) => !candidate.closable,
        );
        if (blockingPanel) {
          return Object.freeze({
            status: "rejected",
            reason: "not-closable",
            originId,
            panelId: blockingPanel.instanceId,
          });
        }
        const removedPanelIds = Object.freeze(
          removedPanels.map(({ instanceId: removedPanelId }) => removedPanelId),
        );
        const commitReuse = (): OpenPanelOutcome => {
          if (
            removedPanelIds.length > 0 ||
            snapshot.activePanelId !== matchedPanel.instanceId
          ) {
            publish(reusedPanels, matchedPanel.instanceId, "push");
          }
          return Object.freeze({
            status: "reused",
            instanceId: matchedPanel.instanceId,
            removedPanelIds,
          });
        };
        const guarded = stageGuardedTransition(
          "open",
          removedPanels,
          commitReuse,
          Object.freeze({ command: "open", originId, panel }),
        );
        if (guarded.status === "block") {
          return Object.freeze({
            status: "rejected",
            reason: "transition-blocked",
            originId,
            panelId: guarded.panelId,
          });
        }
        if (guarded.status === "confirm") {
          return Object.freeze({
            status: "confirmation-required",
            command: "open",
            panelIds: guarded.panelIds,
          });
        }
        return commitReuse();
      }

      if (
        definition.deduplication === "replace" &&
        matchingIndex >= 0 &&
        matchingIndex <= originIndex
      ) {
        if (panel.panelKey === undefined) {
          throw new Error(
            "A replace Panel must provide its semantic Panel Key",
          );
        }
        return Object.freeze({
          status: "rejected",
          reason: "deduplication-conflict",
          originId,
          panelKind: panel.kind,
          panelKey: panel.panelKey,
        });
      }

      const removedPanels = snapshot.panels.slice(originIndex + 1);
      const blockingPanel = removedPanels.find(
        (candidate) => !candidate.closable,
      );
      if (blockingPanel) {
        return Object.freeze({
          status: "rejected",
          reason: "not-closable",
          originId,
          panelId: blockingPanel.instanceId,
        });
      }
      const removedPanelIds = Object.freeze(
        removedPanels.map(({ instanceId: removedPanelId }) => removedPanelId),
      );
      const replacedPanel =
        definition.deduplication === "replace" && matchingIndex > originIndex
          ? snapshot.panels[matchingIndex]
          : undefined;
      const retainedPanels = snapshot.panels.slice(0, originIndex + 1);
      const childTitle = definition.title(panel.input);
      const commitOpen = (): OpenPanelOutcome => {
        const child = createPanel(panel, definition, childTitle);
        const childId = child.instanceId;
        publish([...retainedPanels, child], child.instanceId, "push");
        return replacedPanel
          ? Object.freeze({
              status: "replaced",
              instanceId: childId,
              replacedInstanceId: replacedPanel.instanceId,
              removedPanelIds,
            })
          : Object.freeze({
              status: "opened",
              instanceId: childId,
              removedPanelIds,
            });
      };
      const guarded = stageGuardedTransition(
        "open",
        removedPanels,
        commitOpen,
        Object.freeze({ command: "open", originId, panel }),
      );
      if (guarded.status === "block") {
        return Object.freeze({
          status: "rejected",
          reason: "transition-blocked",
          originId,
          panelId: guarded.panelId,
        });
      }
      if (guarded.status === "confirm") {
        return Object.freeze({
          status: "confirmation-required",
          command: "open",
          panelIds: guarded.panelIds,
        });
      }
      return commitOpen();
    },
    activate: ({ target }) => {
      const panelId = target.instanceId;
      if (target.workspaceId !== workspaceId) {
        return Object.freeze({
          status: "rejected",
          command: "activate",
          reason: "foreign-workspace",
          panelId,
        });
      }
      if (!issuedInstanceRefs.has(target)) {
        return Object.freeze({
          status: "rejected",
          command: "activate",
          reason: "invalid-panel-reference",
          panelId,
        });
      }

      const panel = snapshot.panels.find(
        (candidate) => candidate.instanceId === panelId,
      );
      if (!panel) {
        return Object.freeze({
          status: "rejected",
          command: "activate",
          reason: issuedPanelIds.has(panelId) ? "stale-panel" : "invalid-panel",
          panelId,
        });
      }
      if (panel.kind !== target.kind) {
        return Object.freeze({
          status: "rejected",
          command: "activate",
          reason: "invalid-panel-reference",
          panelId,
        });
      }
      if (snapshot.activePanelId === panelId) {
        return Object.freeze({
          status: "unchanged",
          command: "activate",
          panelId,
          navigationIntent: "none",
        });
      }

      publish(snapshot.panels, panelId, "replace");
      return Object.freeze({
        status: "activated",
        panelId,
        navigationIntent: "replace",
      });
    },
    update: ({ definition: requestedDefinition, target, update }) => {
      const panelId = target.instanceId;
      if (target.workspaceId !== workspaceId) {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "foreign-workspace",
          panelId,
        });
      }
      if (!issuedInstanceRefs.has(target)) {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "invalid-panel-reference",
          panelId,
        });
      }

      const index = snapshot.panels.findIndex(
        (panel) => panel.instanceId === panelId,
      );
      if (index < 0) {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: issuedPanelIds.has(panelId) ? "stale-panel" : "invalid-panel",
          panelId,
        });
      }

      const panel = snapshot.panels[index];
      const definition = definitions.get(requestedDefinition.kind);
      if (
        !panel ||
        panel.isRoot ||
        panel.kind !== target.kind ||
        panel.kind !== requestedDefinition.kind ||
        !definition ||
        definition.identity !== requestedDefinition
      ) {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "invalid-panel-reference",
          panelId,
        });
      }
      if (!definition.update) {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "not-updatable",
          panelId,
        });
      }
      let validUpdate = false;
      try {
        validUpdate = definition.update.validate(update);
      } catch {
        // Validation failures reject the proposed update without publication.
      }
      if (!validUpdate) {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "invalid-update",
          panelId,
        });
      }

      let nextInput: unknown;
      try {
        nextInput = definition.update.apply(panel.reference.input, update);
      } catch {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "invalid-update",
          panelId,
        });
      }
      let validResult = false;
      try {
        validResult = definition.update.validateResult(nextInput);
      } catch {
        // Result validation failures reject without publication.
      }
      if (!validResult) {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "invalid-update",
          panelId,
        });
      }
      if (Object.is(nextInput, panel.reference.input)) {
        return Object.freeze({
          status: "unchanged",
          command: "update",
          panelId,
          navigationIntent: "none",
        });
      }

      let nextReference: PanelReference;
      let nextTitle: string;
      try {
        nextReference = definition.reference(nextInput);
        nextTitle = definition.title(nextReference.input);
      } catch {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "invalid-update",
          panelId,
        });
      }
      if (nextReference.panelKey !== panel.panelKey) {
        return Object.freeze({
          status: "rejected",
          command: "update",
          reason: "identity-change",
          panelId,
        });
      }

      const nextPanel = Object.freeze({
        ...panel,
        title: nextTitle,
        reference: nextReference,
      });
      publish(
        [
          ...snapshot.panels.slice(0, index),
          nextPanel,
          ...snapshot.panels.slice(index + 1),
        ],
        snapshot.activePanelId,
        definition.update.navigation,
      );
      return Object.freeze({
        status: "updated",
        panelId,
        navigationIntent: definition.update.navigation,
      });
    },
    collapse: ({ target }) => {
      const panelId = target.instanceId;
      if (pendingTransition) {
        return Object.freeze({
          status: "rejected",
          command: "collapse",
          reason: "transition-in-progress",
          panelId,
        });
      }
      if (target.workspaceId !== workspaceId) {
        return Object.freeze({
          status: "rejected",
          command: "collapse",
          reason: "foreign-workspace",
          panelId,
        });
      }
      if (!issuedInstanceRefs.has(target)) {
        return Object.freeze({
          status: "rejected",
          command: "collapse",
          reason: "invalid-panel-reference",
          panelId,
        });
      }

      const index = snapshot.panels.findIndex(
        (panel) => panel.instanceId === panelId,
      );
      if (index < 0) {
        return Object.freeze({
          status: "rejected",
          command: "collapse",
          reason: issuedPanelIds.has(panelId) ? "stale-panel" : "invalid-panel",
          panelId,
        });
      }
      if (snapshot.panels[index]?.kind !== target.kind) {
        return Object.freeze({
          status: "rejected",
          command: "collapse",
          reason: "invalid-panel-reference",
          panelId,
        });
      }
      if (index === snapshot.panels.length - 1) {
        return Object.freeze({
          status: "unchanged",
          command: "collapse",
          panelId,
          navigationIntent: "none",
        });
      }

      const removedPanels = snapshot.panels.slice(index + 1);
      const blockingPanel = removedPanels.find(
        (candidate) => !candidate.closable,
      );
      if (blockingPanel) {
        return Object.freeze({
          status: "rejected",
          command: "collapse",
          reason: "not-closable",
          panelId: blockingPanel.instanceId,
        });
      }
      const removedPanelIds = Object.freeze(
        removedPanels.map(({ instanceId: removedPanelId }) => removedPanelId),
      );
      publish(snapshot.panels.slice(0, index + 1), panelId, "push");
      return Object.freeze({
        status: "collapsed",
        panelId,
        removedPanelIds,
        navigationIntent: "push",
      });
    },
    close: ({ target } = {}) => {
      const effectiveTarget =
        target ??
        snapshot.panels.find(
          (panel) => panel.instanceId === snapshot.activePanelId,
        )?.instanceRef;
      if (!effectiveTarget) throw new Error("Active Panel disappeared");
      const panelId = effectiveTarget.instanceId;
      if (effectiveTarget.workspaceId !== workspaceId) {
        return Object.freeze({
          status: "rejected",
          command: "close",
          reason: "foreign-workspace",
          panelId,
        });
      }
      if (!issuedInstanceRefs.has(effectiveTarget)) {
        return Object.freeze({
          status: "rejected",
          command: "close",
          reason: "invalid-panel-reference",
          panelId,
        });
      }
      if (pendingTransition) {
        if (
          pendingTransition.request.command === "close" &&
          pendingTransition.request.panelId === panelId
        ) {
          return Object.freeze({
            status: "confirmation-required",
            command: "close",
            panelIds: Object.freeze(
              pendingTransition.readModel.panels.map(
                ({ panelId: guardedPanelId }) => guardedPanelId,
              ),
            ),
          });
        }
        return Object.freeze({
          status: "rejected",
          command: "close",
          reason: "transition-in-progress",
          panelId,
        });
      }
      const index = snapshot.panels.findIndex(
        (panel) => panel.instanceId === panelId,
      );
      if (index < 0) {
        return Object.freeze({
          status: "rejected",
          command: "close",
          reason: issuedPanelIds.has(panelId) ? "stale-panel" : "invalid-panel",
          panelId,
        });
      }
      const panel = snapshot.panels[index];
      if (panel && panel.kind !== effectiveTarget.kind) {
        return Object.freeze({
          status: "rejected",
          command: "close",
          reason: "invalid-panel-reference",
          panelId,
        });
      }
      if (!panel || panel.isRoot) {
        return Object.freeze({
          status: "rejected",
          command: "close",
          reason: "root-panel",
          panelId,
        });
      }
      const removedPanels = snapshot.panels.slice(index);
      const blockingPanel = removedPanels.find(
        (candidate) => !candidate.closable,
      );
      if (blockingPanel) {
        return Object.freeze({
          status: "rejected",
          command: "close",
          reason: "not-closable",
          panelId: blockingPanel.instanceId,
        });
      }

      const retainedPanels = snapshot.panels.slice(0, index);
      const activePanel = retainedPanels.at(-1);
      if (!activePanel) throw new Error("Closing a Panel must retain Root");
      const removedPanelIds = Object.freeze(
        removedPanels.map(({ instanceId: removedPanelId }) => removedPanelId),
      );
      const commitClose = (): ClosePanelOutcome => {
        publish(retainedPanels, activePanel.instanceId, "push");
        return Object.freeze({
          status: "closed",
          panelId,
          removedPanelIds,
          activePanelId: activePanel.instanceId,
          navigationIntent: "push",
        });
      };
      const guarded = stageGuardedTransition(
        "close",
        removedPanels,
        commitClose,
        Object.freeze({ command: "close", panelId }),
      );
      if (guarded.status === "block") {
        return Object.freeze({
          status: "rejected",
          command: "close",
          reason: "transition-blocked",
          panelId: guarded.panelId,
        });
      }
      if (guarded.status === "confirm") {
        return Object.freeze({
          status: "confirmation-required",
          command: "close",
          panelIds: guarded.panelIds,
        });
      }
      return commitClose();
    },
    restoreStack: ({ references, navigationIntent = "push" }) => {
      if (pendingTransition) {
        return Object.freeze({
          status: "rejected",
          command: "restore",
          reason: "transition-in-progress",
        });
      }

      const targets: Array<
        Readonly<{
          reference: PanelReference;
          definition: RegisteredDefinition;
        }>
      > = [];
      for (const reference of references) {
        const definition = definitions.get(reference.kind);
        if (
          !definition ||
          referenceDefinitions.get(reference) !== definition.identity
        ) {
          return Object.freeze({
            status: "rejected",
            command: "restore",
            reason: "invalid-panel-reference",
            panelKind: reference.kind,
          });
        }
        targets.push(Object.freeze({ reference, definition }));
      }

      // Panels the target stack shares with the current one keep their identity
      // and are never guarded: restoration only disturbs what actually changes.
      const contextualPanels = snapshot.panels.slice(1);
      let sharedCount = 0;
      while (
        sharedCount < contextualPanels.length &&
        sharedCount < targets.length &&
        panelReferencesEqual(
          (contextualPanels[sharedCount] as OpenPanel).reference,
          (targets[sharedCount] as { reference: PanelReference }).reference,
        )
      ) {
        sharedCount += 1;
      }

      const removedPanels = snapshot.panels.slice(sharedCount + 1);
      const openedTargets = targets.slice(sharedCount);
      if (removedPanels.length === 0 && openedTargets.length === 0) {
        return Object.freeze({
          status: "unchanged",
          command: "restore",
          navigationIntent: "none",
        });
      }

      const blockingPanel = removedPanels.find(
        (candidate) => !candidate.closable,
      );
      if (blockingPanel) {
        return Object.freeze({
          status: "rejected",
          command: "restore",
          reason: "not-closable",
          panelId: blockingPanel.instanceId,
        });
      }

      const retainedPanels = snapshot.panels.slice(0, sharedCount + 1);
      const removedPanelIds = Object.freeze(
        removedPanels.map(({ instanceId: removedPanelId }) => removedPanelId),
      );
      // Titles are resolved before staging so a throwing title function cannot
      // strand a Guarded Transition it can never commit.
      const openedTitles = openedTargets.map(({ reference, definition }) =>
        definition.title(reference.input),
      );
      const commitRestore = (): RestoreStackOutcome => {
        const openedPanels = openedTargets.map(
          ({ reference, definition }, index) =>
            createPanel(reference, definition, openedTitles[index] as string),
        );
        const panels = [...retainedPanels, ...openedPanels];
        const activePanel = panels.at(-1);
        if (!activePanel) throw new Error("Restoration must retain Root");
        publish(panels, activePanel.instanceId, navigationIntent);
        return Object.freeze({
          status: "restored",
          removedPanelIds,
          openedPanelIds: Object.freeze(
            openedPanels.map(({ instanceId }) => instanceId),
          ),
          activePanelId: activePanel.instanceId,
          navigationIntent,
        });
      };

      if (removedPanels.length === 0) return commitRestore();

      const guarded = stageGuardedTransition(
        "close",
        removedPanels,
        commitRestore,
        Object.freeze({ command: "restore", references: [...references] }),
      );
      if (guarded.status === "block") {
        return Object.freeze({
          status: "rejected",
          command: "restore",
          reason: "transition-blocked",
          panelId: guarded.panelId,
        });
      }
      if (guarded.status === "confirm") {
        return Object.freeze({
          status: "confirmation-required",
          command: "restore",
          panelIds: guarded.panelIds,
        });
      }
      return commitRestore();
    },
  });
  return engineApi;
}
