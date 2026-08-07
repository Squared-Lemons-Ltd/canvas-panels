declare const panelInstanceIdBrand: unique symbol;
declare const panelKeyBrand: unique symbol;
declare const panelReferenceBrand: unique symbol;

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
> = Readonly<{
  role: "panel";
  kind: Kind;
  deduplication: PanelDeduplication;
  key?: (input: DeepReadonly<Input>) => string;
  title: (input: DeepReadonly<Input>) => string;
  reference: (input: Input) => PanelReference<Kind, Input>;
}>;

export type OpenPanel = Readonly<{
  instanceId: PanelInstanceId;
  kind: string;
  title: string;
  isRoot: boolean;
  panelKey?: PanelKey;
  reference: PanelReference;
}>;

export type PanelEngineSnapshot = Readonly<{
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
    }>;

export type PanelEngine<Reference extends PanelReference = PanelReference> =
  Readonly<{
    getSnapshot: () => PanelEngineSnapshot;
    subscribe: (listener: () => void) => () => void;
    open: (command: OpenPanelCommand<Reference>) => OpenPanelOutcome;
    close: (instanceId: PanelInstanceId) => boolean;
  }>;

type PanelDefinitionShape = Readonly<{
  role: "panel";
  kind: string;
  deduplication: PanelDeduplication;
  key?: (input: never) => string;
  title: (input: never) => string;
  reference: (input: never) => PanelReference<string, unknown>;
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

export function definePanel<const Kind extends string, Input>(
  options: {
    kind: Kind;
    title: (input: DeepReadonly<Input>) => string;
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
): PanelDefinition<Kind, Input> {
  const definition = Object.freeze({
    role: "panel",
    kind: options.kind,
    deduplication: options.deduplication ?? "allow-many",
    ...(options.key === undefined ? {} : { key: options.key }),
    title: options.title,
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
  let nextInstanceNumber = 1;
  const nextInstanceId = () =>
    `canvas-panel-${engineNumber}-${nextInstanceNumber++}` as PanelInstanceId;
  const instanceId = nextInstanceId();
  const rootPanel = Object.freeze({
    instanceId,
    kind: options.root.kind,
    title: options.root.title,
    isRoot: true,
    reference: options.root.reference,
  });
  const issuedPanelIds = new Set<PanelInstanceId>([instanceId]);
  let snapshot = Object.freeze({
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
        deduplication: definition.deduplication,
        identity: definition,
        title: definition.title as (input: unknown) => string,
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
        const removedPanelIds = Object.freeze(
          snapshot.panels
            .slice(reusedPanels.length)
            .map(({ instanceId: removedPanelId }) => removedPanelId),
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

      const childId = nextInstanceId();
      issuedPanelIds.add(childId);
      const child = Object.freeze({
        instanceId: childId,
        kind: panel.kind,
        title: definition.title(panel.input),
        isRoot: false,
        ...(panel.panelKey === undefined ? {} : { panelKey: panel.panelKey }),
        reference: panel,
      });
      const removedPanels = snapshot.panels.slice(originIndex + 1);
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
    close: (panelId) => {
      const index = snapshot.panels.findIndex(
        (panel) => panel.instanceId === panelId,
      );
      if (index <= 0) return false;

      publish(snapshot.panels.slice(0, index));
      return true;
    },
  });
}
