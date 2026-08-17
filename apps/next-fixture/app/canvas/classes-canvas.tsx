"use client";

import { createPanelEngine } from "@squared-lemons-ltd/canvas-panels/core";
import {
  type CanvasNavigationState,
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "@squared-lemons-ltd/canvas-panels/next";
import { createCanvasModule } from "@squared-lemons-ltd/canvas-panels/ui";
import { usePathname, useSearchParams } from "next/navigation";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // No router is passed: the Canvas writes through the History API so its entry
  // metadata survives, and Next.js keeps `usePathname`/`useSearchParams` in step
  // with those writes itself.
  useCanvasNavigationSync({
    engine,
    location: {
      pathname,
      search: searchParams.toString(),
      // The App Router never sees the fragment, so it is read from the browser
      // directly. It is only ever used inside effects, so it cannot desync
      // server and client rendering.
      hash: typeof window === "undefined" ? "" : window.location.hash,
    },
    initialState,
  });

  return (
    <Canvas.Provider engine={engine}>
      <Canvas.Workspace label="Classes Canvas" />
    </Canvas.Provider>
  );
}
