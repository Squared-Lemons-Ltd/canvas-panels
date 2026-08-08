"use client";

import {
  createPanelEngine,
  type OpenPanel,
  type PanelDeduplication,
  type PanelDefinition,
  type PanelEngine,
  type PanelReference,
  type RootPanelDefinition,
} from "../core/index.js";
import { type CanvasBinding, createCanvasBindings } from "../react/index.js";
import { createElement, useId, useState } from "react";
import type { ComponentType, ReactNode } from "react";

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

type AllowedReference<Definitions extends readonly PanelDefinitionShape[]> =
  ReferenceOf<Definitions[number]>;

type OpenPanelForDefinition<Definition> =
  Definition extends RootPanelDefinition<infer Kind>
    ? Omit<OpenPanel, "isRoot" | "kind" | "reference"> &
        Readonly<{
          isRoot: true;
          kind: Kind;
          reference: PanelReference<Kind, undefined>;
        }>
    : Definition extends PanelDefinition<infer Kind, infer Input>
      ? Omit<OpenPanel, "isRoot" | "kind" | "reference"> &
          Readonly<{
            isRoot: false;
            kind: Kind;
            reference: PanelReference<Kind, Input>;
          }>
      : never;

export type CanvasPanelRenderProps<
  Reference extends PanelReference = PanelReference,
  Panel extends OpenPanel = OpenPanel,
> = Readonly<{
  panel: Panel;
  open: PanelEngine<Reference>["open"];
  close: CanvasBinding<Reference>["close"];
}>;

type CanvasRendererMap<
  Root extends RootPanelDefinition,
  Definitions extends readonly PanelDefinitionShape[],
> = Readonly<{
  [Definition in
    | Root
    | Definitions[number] as Definition["kind"]]: ComponentType<
    CanvasPanelRenderProps<
      AllowedReference<Definitions>,
      OpenPanelForDefinition<Definition>
    >
  >;
}>;

export type CanvasWorkspaceProps = Readonly<{
  label: string;
}>;

export type CanvasModuleProviderProps<
  Reference extends PanelReference = PanelReference,
> = Readonly<{
  children: ReactNode;
  engine?: PanelEngine<Reference>;
}>;

export type BoundCanvasModule<Reference extends PanelReference> = Readonly<{
  Provider: ComponentType<CanvasModuleProviderProps<Reference>>;
  Workspace: ComponentType<CanvasWorkspaceProps>;
  createEngine: () => PanelEngine<Reference>;
  useCanvas: () => CanvasBinding<Reference>;
}>;

export function createCanvasModule<
  const Root extends RootPanelDefinition,
  const Definitions extends readonly PanelDefinitionShape[],
>(config: {
  root: Root;
  panels: Definitions;
  renderers: CanvasRendererMap<Root, Definitions>;
}): BoundCanvasModule<AllowedReference<Definitions>> {
  type Reference = AllowedReference<Definitions>;
  const bindings = createCanvasBindings<Reference>();
  const createEngine = () =>
    createPanelEngine({ root: config.root, panels: config.panels });

  function Provider({
    children,
    engine: suppliedEngine,
  }: CanvasModuleProviderProps<Reference>) {
    const [engine] = useState(() => suppliedEngine ?? createEngine());
    return createElement(bindings.Provider, { children, engine });
  }

  function Workspace({ label }: CanvasWorkspaceProps) {
    const { snapshot, open, close } = bindings.useCanvas();
    const workspaceId = useId();
    const renderers = config.renderers as Readonly<
      Record<string, ComponentType<CanvasPanelRenderProps<Reference>>>
    >;

    return createElement(
      "div",
      {
        "aria-label": label,
        "data-canvas-workspace": "",
        role: "region",
      },
      snapshot.panels.map((panel, panelIndex) => {
        const headingId = `${workspaceId}-panel-${panelIndex}-heading`;
        const Renderer = renderers[panel.kind];
        if (!Renderer) {
          throw new Error(
            `No renderer registered for Panel Kind: ${panel.kind}`,
          );
        }

        return createElement(
          "section",
          {
            "aria-labelledby": headingId,
            "data-active":
              panel.instanceId === snapshot.activePanelId ? "" : undefined,
            "data-canvas-panel": "",
            "data-panel-kind": panel.kind,
            key: panel.instanceId,
            role: "region",
          },
          createElement(
            "header",
            { "data-canvas-panel-header": "" },
            createElement("h2", { id: headingId }, panel.title),
            !panel.closable
              ? null
              : createElement(
                  "button",
                  {
                    "aria-label": `Close ${panel.title}`,
                    onClick: () => close(panel.instanceRef),
                    type: "button",
                  },
                  "Close",
                ),
          ),
          createElement(Renderer, { panel, open, close }),
        );
      }),
    );
  }

  return Object.freeze({
    Provider,
    Workspace,
    createEngine,
    useCanvas: bindings.useCanvas,
  });
}
