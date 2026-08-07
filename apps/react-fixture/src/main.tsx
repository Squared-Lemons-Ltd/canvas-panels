import {
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import "@squaredlemons/canvas-panels/styles.css";
import { createCanvasModule } from "@squaredlemons/canvas-panels/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const classes = defineRootPanel({ kind: "classes", title: "Classes" });
const student = definePanel({
  kind: "student",
  title: (input: { name: string }) => input.name,
});
const Canvas = createCanvasModule({
  root: classes,
  panels: [student],
  renderers: {
    classes: ({ open, panel }) => (
      <button
        onClick={() =>
          open({
            originId: panel.instanceId,
            panel: student.reference({ name: "Ada Lovelace" }),
          })
        }
        type="button"
      >
        Open Ada Lovelace
      </button>
    ),
    student: ({ panel }) => <p>Student record: {panel.title}</p>,
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
        <Canvas.Workspace label="Student records" />
      </Canvas.Provider>
    </main>
  </StrictMode>,
);
