declare const panelInstanceIdBrand: unique symbol;
declare const panelReferenceBrand: unique symbol;

export type PanelInstanceId = string & {
  readonly [panelInstanceIdBrand]: "PanelInstanceId";
};

export type PanelReference<
  Kind extends string = string,
  Input = unknown,
> = Readonly<{
  kind: Kind;
  input: Input;
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
  title: (input: Input) => string;
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
  title: (input: Input) => string;
}): PanelDefinition<Kind, Input> {
  return Object.freeze({
    role: "panel",
    kind: options.kind,
    title: options.title,
    reference: (input: Input) =>
      Object.freeze({ kind: options.kind, input }) as PanelReference<
        Kind,
        Input
      >,
  });
}

export function createPanelEngine<
  const Definitions extends readonly PanelDefinitionShape[],
>(options: {
  root: RootPanelDefinition;
  panels: Definitions;
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
    for (const listener of listeners) listener();
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: ({ originId, panel }) => {
      const originExists = snapshot.panels.some(
        (candidate) => candidate.instanceId === originId,
      );
      if (!originExists) {
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
      publish([...snapshot.panels, child]);
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
