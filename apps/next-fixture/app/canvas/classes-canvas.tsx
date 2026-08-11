"use client";

import { createPanelEngine } from "@squaredlemons/canvas-panels/core";
import {
  type CanvasNavigationState,
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "@squaredlemons/canvas-panels/next";
import { createCanvasModule } from "@squaredlemons/canvas-panels/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  classes,
  classPanel,
  classesRoot,
  students,
  studentPanel,
} from "./panels";

const Canvas = createCanvasModule({
  root: classesRoot,
  panels: [classPanel, studentPanel],
  renderers: {
    classes: () => {
      const navigation = Canvas.useNavigation();
      return (
        <ul>
          {classes.map((input) => (
            <li key={input.classId}>
              <button
                onClick={() => navigation.open(classPanel, input)}
                type="button"
              >
                {input.name}
              </button>
            </li>
          ))}
        </ul>
      );
    },
    class: () => {
      const navigation = Canvas.useNavigation();
      return (
        <ul>
          {students.map((input) => (
            <li key={input.studentId}>
              <button
                onClick={() => navigation.open(studentPanel, input)}
                type="button"
              >
                {input.name}
              </button>
            </li>
          ))}
        </ul>
      );
    },
    student: ({ descriptor }) => <p>Student record: {descriptor.name}</p>,
  },
});

export function ClassesCanvas({
  initialState,
}: Readonly<{ initialState: CanvasNavigationState }>) {
  // Seeding happens with the engine, before the first render, so the deep-linked
  // stack paints in one pass instead of flashing the Root Panel.
  const [engine] = useState(() => {
    const created = createPanelEngine({
      root: classesRoot,
      panels: [classPanel, studentPanel],
    });
    seedCanvasNavigation(created, initialState);
    return created;
  });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useCanvasNavigationSync({
    engine,
    router,
    location: { pathname, search: searchParams.toString() },
    initialState,
  });

  return (
    <Canvas.Provider engine={engine}>
      <Canvas.Workspace label="Classes Canvas" />
    </Canvas.Provider>
  );
}
