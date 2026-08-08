declare const panelInstanceIdBrand: unique symbol;
declare const panelKeyBrand: unique symbol;
declare const panelReferenceBrand: unique symbol;
declare const workspaceIdBrand: unique symbol;
declare const stackVersionBrand: unique symbol;

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
> = Readonly<{
  role: "panel";
  kind: Kind;
  deduplication: PanelDeduplication;
  closable: boolean;
  key?: (input: DeepReadonly<Input>) => string;
  title: (input: DeepReadonly<Input>) => string;
  reference: (input: Input) => PanelReference<Kind, Input>;
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

export type PanelEngineSnapshot = Readonly<{
  workspaceId: WorkspaceId;
  version: StackVersion;
  panels: readonly OpenPanel[];
  activePanelId: PanelInstanceId;
  deepestPanelId: PanelInstanceId;
  visiblePanelIds: readonly PanelInstanceId[];
}>;

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
      status: "rejected";
      reason: "stale-origin" | "invalid-origin";
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
        | "not-closable";
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
      status: "rejected";
      command: "close";
      reason:
        | "stale-panel"
        | "invalid-panel"
        | "invalid-panel-reference"
        | "foreign-workspace"
        | "root-panel"
        | "not-closable";
      panelId: PanelInstanceId;
    }>;

export type PanelEngine<Reference extends PanelReference = PanelReference> =
  Readonly<{
    getSnapshot: () => PanelEngineSnapshot;
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
  }>;

type PanelDefinitionShape = Readonly<{
  role: "panel";
  kind: string;
  deduplication: PanelDeduplication;
  closable: boolean;
  key?: (input: never) => string;
  title: (input: never) => string;
  reference: (input: never) => PanelReference<string, unknown>;
  update?: Readonly<{
    validate: (update: unknown) => boolean;
    validateResult: (value: unknown) => boolean;
    apply: (current: never, update: never) => unknown;
    navigation: "replace" | "none";
  }>;
}>;

type ReferenceOf<Definition> =
  Definition extends PanelDefinition<infer Kind, infer Input>
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

export function definePanel<const Kind extends string, Input, Update = never>(
  options: {
    kind: Kind;
    title: (input: DeepReadonly<Input>) => string;
    closable?: boolean;
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
): PanelDefinition<Kind, Input, Update> {
  const updatePolicy =
    options.update === undefined
      ? undefined
      : Object.freeze({
          validate: options.update.validate,
          validateResult: options.update.validateResult,
          apply: options.update.apply,
          navigation: options.update.navigation,
        });
  const definition = Object.freeze({
    role: "panel",
    kind: options.kind,
    deduplication: options.deduplication ?? "allow-many",
    closable: options.closable ?? true,
    ...(options.key === undefined ? {} : { key: options.key }),
    title: options.title,
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
  const engineNumber = nextEngineNumber++;
  const workspaceId = `canvas-workspace-${engineNumber}` as WorkspaceId;
  let nextInstanceNumber = 1;
  const nextInstanceId = () =>
    `canvas-panel-${engineNumber}-${nextInstanceNumber++}` as PanelInstanceId;
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
  }) as PanelEngineSnapshot;
  const listeners = new Set<() => void>();
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

  const publish = (
    panels: readonly OpenPanel[],
    activePanelId = panels.at(-1)?.instanceId,
  ) => {
    const deepestPanel = panels.at(-1);
    if (!deepestPanel || activePanelId === undefined) {
      throw new Error("A Canvas Workspace must retain its Root Panel");
    }
    if (!panels.some(({ instanceId }) => instanceId === activePanelId)) {
      throw new Error("The Active Panel must belong to the Canvas Workspace");
    }

    snapshot = Object.freeze({
      workspaceId,
      version: (snapshot.version + 1) as StackVersion,
      panels: Object.freeze(panels),
      activePanelId,
      deepestPanelId: deepestPanel.instanceId,
      visiblePanelIds: Object.freeze(
        panels.map(({ instanceId: visiblePanelId }) => visiblePanelId),
      ),
    });
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

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: ({ originId: requestedOriginId, panel }) => {
      const originId = requestedOriginId ?? snapshot.activePanelId;
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
        if (
          removedPanelIds.length > 0 ||
          snapshot.activePanelId !== matchedPanel.instanceId
        ) {
          publish(reusedPanels, matchedPanel.instanceId);
        }
        return Object.freeze({
          status: "reused",
          instanceId: matchedPanel.instanceId,
          removedPanelIds,
        });
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
      const childId = nextInstanceId();
      issuedPanelIds.add(childId);
      const child = Object.freeze({
        instanceId: childId,
        instanceRef: Object.freeze({
          workspaceId,
          instanceId: childId,
          kind: panel.kind,
        }),
        kind: panel.kind,
        title: definition.title(panel.input),
        isRoot: false,
        closable: definition.closable,
        ...(panel.panelKey === undefined ? {} : { panelKey: panel.panelKey }),
        reference: panel,
      });
      issuedInstanceRefs.add(child.instanceRef);
      const removedPanelIds = Object.freeze(
        removedPanels.map(({ instanceId: removedPanelId }) => removedPanelId),
      );
      const replacedPanel =
        definition.deduplication === "replace" && matchingIndex > originIndex
          ? snapshot.panels[matchingIndex]
          : undefined;
      publish([...snapshot.panels.slice(0, originIndex + 1), child]);
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

      publish(snapshot.panels, panelId);
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
      );
      return Object.freeze({
        status: "updated",
        panelId,
        navigationIntent: definition.update.navigation,
      });
    },
    collapse: ({ target }) => {
      const panelId = target.instanceId;
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
      publish(snapshot.panels.slice(0, index + 1), panelId);
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
      publish(retainedPanels, activePanel.instanceId);
      return Object.freeze({
        status: "closed",
        panelId,
        removedPanelIds,
        activePanelId: activePanel.instanceId,
        navigationIntent: "push",
      });
    },
  });
}
