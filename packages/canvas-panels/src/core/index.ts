declare const panelInstanceIdBrand: unique symbol;
declare const panelReferenceBrand: unique symbol;

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

export type PanelReference<
  Kind extends string = string,
  Input = unknown,
> = Readonly<{
  kind: Kind;
  input: DeepReadonly<Input>;
  readonly [panelReferenceBrand]: "PanelReference";
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
> = Readonly<{
  role: "panel";
  kind: Kind;
  title: (input: DeepReadonly<Input>) => string;
  reference: (input: Input) => PanelReference<Kind, Input>;
}>;

export type OpenPanel = Readonly<{
  instanceId: PanelInstanceId;
  kind: string;
  title: string;
  isRoot: boolean;
  reference: PanelReference;
}>;

export type PanelEngineSnapshot = Readonly<{
  panels: readonly OpenPanel[];
  activePanelId: PanelInstanceId;
}>;

export type OpenPanelCommand<
  Reference extends PanelReference = PanelReference,
> = Readonly<{
  originId: PanelInstanceId;
  panel: Reference;
}>;

export type PanelEngine<Reference extends PanelReference = PanelReference> =
  Readonly<{
    getSnapshot: () => PanelEngineSnapshot;
    subscribe: (listener: () => void) => () => void;
    open: (command: OpenPanelCommand<Reference>) => PanelInstanceId;
    close: (instanceId: PanelInstanceId) => boolean;
  }>;

type PanelDefinitionShape = Readonly<{
  role: "panel";
  kind: string;
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

export function definePanel<const Kind extends string, Input>(options: {
  kind: Kind;
  title: (input: DeepReadonly<Input>) => string;
}): PanelDefinition<Kind, Input> {
  return Object.freeze({
    role: "panel",
    kind: options.kind,
    title: options.title,
    reference: (input: Input) =>
      Object.freeze({
        kind: options.kind,
        input: cloneAndFreezePanelInput(input),
      }) as PanelReference<Kind, Input>,
  });
}

export function createPanelEngine<
  const Definitions extends readonly PanelDefinitionShape[],
>(options: {
  root: RootPanelDefinition;
  panels: Definitions;
  onSubscriberError?: (error: AggregateError) => void;
}): PanelEngine<ReferenceOf<Definitions[number]>> {
  let nextInstanceNumber = 1;
  const nextInstanceId = () =>
    `canvas-panel-${nextInstanceNumber++}` as PanelInstanceId;
  const instanceId = nextInstanceId();
  const rootPanel = Object.freeze({
    instanceId,
    kind: options.root.kind,
    title: options.root.title,
    isRoot: true,
    reference: options.root.reference,
  });
  let snapshot = Object.freeze({
    panels: Object.freeze([rootPanel]),
    activePanelId: instanceId,
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
      definition.title as (input: unknown) => string,
    ]),
  );

  const publish = (panels: readonly OpenPanel[]) => {
    const activePanel = panels.at(-1);
    if (!activePanel) {
      throw new Error("A Canvas Workspace must retain its Root Panel");
    }

    snapshot = Object.freeze({
      panels: Object.freeze(panels),
      activePanelId: activePanel.instanceId,
    });
    const subscriberErrors: unknown[] = [];
    for (const listener of listeners) {
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
    open: ({ originId, panel }) => {
      const originIndex = snapshot.panels.findIndex(
        (candidate) => candidate.instanceId === originId,
      );
      if (originIndex < 0) {
        throw new Error(`Unknown origin Panel Instance ID: ${originId}`);
      }

      const title = definitions.get(panel.kind);
      if (!title) {
        throw new Error(`Unknown Panel Kind: ${panel.kind}`);
      }

      const childId = nextInstanceId();
      const child = Object.freeze({
        instanceId: childId,
        kind: panel.kind,
        title: title(panel.input),
        isRoot: false,
        reference: panel,
      });
      publish([...snapshot.panels.slice(0, originIndex + 1), child]);
      return childId;
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
