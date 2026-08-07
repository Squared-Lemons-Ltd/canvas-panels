import {
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import "@squaredlemons/canvas-panels/styles.css";
import { createCanvasModule } from "@squaredlemons/canvas-panels/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const classes = defineRootPanel({ kind: "classes", title: "Classes" });
const classPanel = definePanel({
  kind: "class",
  deduplication: "reuse",
  key: (input: { classId: string; name: string }) => input.classId,
  title: (input: { classId: string; name: string }) => input.name,
});
const learner = definePanel({
  kind: "learner",
  deduplication: "allow-many",
  title: (input: { name: string }) => input.name,
});
const Canvas = createCanvasModule({
  root: classes,
  panels: [classPanel, learner],
  renderers: {
    classes: ({ open, panel }) => (
      <div>
        {[
          { classId: "class-a", name: "Class A" },
          { classId: "class-b", name: "Class B" },
        ].map((input) => (
          <button
            key={input.classId}
            onClick={() =>
              open({
                originId: panel.instanceId,
                panel: classPanel.reference(input),
              })
            }
            type="button"
          >
            Open {input.name}
          </button>
        ))}
      </div>
    ),
    class: ({ open, panel }) => (
      <button
        onClick={() =>
          open({
            originId: panel.instanceId,
            panel: learner.reference({ name: "Ada Lovelace" }),
          })
        }
        type="button"
      >
        Open Ada Lovelace
      </button>
    ),
    learner: ({ panel }) => <p>Learner record: {panel.title}</p>,
  },
});
const root = document.getElementById("root");

if (!root) {
  throw new Error("React fixture root is missing");
}

createRoot(root).render(
  <StrictMode>
    <main>
      <h1>Canvas Panels package fixture</h1>
      <Canvas.Provider>
        <Canvas.Workspace label="Class and learner records" />
      </Canvas.Provider>
    </main>
  </StrictMode>,
);
