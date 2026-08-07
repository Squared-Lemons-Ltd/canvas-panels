"use client";

import {
  createPanelEngine,
  type OpenPanel,
  type PanelDefinition,
  type PanelEngine,
  type PanelInstanceId,
  type PanelReference,
  type RootPanelDefinition,
} from "../core/index.js";
import {
  type CanvasBinding,
  CanvasProvider,
  useCanvas,
} from "../react/index.js";
import { createElement, useId, useState } from "react";
import type { ComponentType, ReactNode } from "react";

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

type AllowedReference<Definitions extends readonly PanelDefinitionShape[]> =
  ReferenceOf<Definitions[number]>;

export type CanvasPanelRenderProps<
  Reference extends PanelReference = PanelReference,
> = Readonly<{
  panel: OpenPanel;
  open: (command: {
    originId: PanelInstanceId;
    panel: Reference;
  }) => PanelInstanceId;
  close: (instanceId: PanelInstanceId) => boolean;
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
  renderers: Readonly<
    Record<
      Root["kind"] | Definitions[number]["kind"],
      ComponentType<CanvasPanelRenderProps<AllowedReference<Definitions>>>
    >
  >;
}): BoundCanvasModule<AllowedReference<Definitions>> {
  type Reference = AllowedReference<Definitions>;
  const createEngine = () =>
    createPanelEngine({ root: config.root, panels: config.panels });

  function Provider({
    children,
    engine: suppliedEngine,
  }: CanvasModuleProviderProps<Reference>) {
    const [engine] = useState(() => suppliedEngine ?? createEngine());
    return createElement(CanvasProvider<Reference>, { children, engine });
  }

  function Workspace({ label }: CanvasWorkspaceProps) {
    const { snapshot, open, close } = useCanvas<Reference>();
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
      snapshot.panels.map((panel) => {
        const headingId = `${workspaceId}-${panel.instanceId}-heading`;
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
            panel.isRoot
              ? null
              : createElement(
                  "button",
                  {
                    "aria-label": `Close ${panel.title}`,
                    onClick: () => close(panel.instanceId),
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
    useCanvas: () => useCanvas<Reference>(),
  });
}
