import {
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";

export type ClassInput = Readonly<{ classId: string; name: string }>;
export type StudentInput = Readonly<{ studentId: string; name: string }>;

type ClassDescriptor = { classId: string; name: string };
type StudentDescriptor = { studentId: string; name: string };

function isStringRecord<Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    keys.every(
      (key) => typeof (value as Record<string, unknown>)[key] === "string",
    )
  );
}

export const classesRoot = defineRootPanel({
  kind: "classes",
  title: "Classes",
});

export const classPanel = definePanel({
  kind: "class",
  deduplication: "reuse",
  key: ({ classId }: ClassInput) => classId,
  title: ({ name }: ClassInput) => name,
  persistence: {
    mode: "navigation",
    version: 1,
    codec: {
      encode: ({ classId, name }) => ({ classId, name }),
      validate: (descriptor): descriptor is ClassDescriptor =>
        isStringRecord(descriptor, ["classId", "name"]),
      decode: ({ classId, name }) => ({ classId, name }),
      migrations: [],
    },
  },
});

export const studentPanel = definePanel({
  kind: "student",
  deduplication: "allow-many",
  title: ({ name }: StudentInput) => name,
  persistence: {
    mode: "navigation",
    version: 1,
    codec: {
      encode: ({ studentId, name }) => ({ studentId, name }),
      validate: (descriptor): descriptor is StudentDescriptor =>
        isStringRecord(descriptor, ["studentId", "name"]),
      decode: ({ studentId, name }) => ({ studentId, name }),
      migrations: [],
    },
  },
});

export const classes: readonly ClassInput[] = [
  { classId: "class-a", name: "Class A" },
  { classId: "class-b", name: "Class B" },
];

export const students: readonly StudentInput[] = [
  { studentId: "student-1", name: "Synthetic Learner One" },
  { studentId: "student-2", name: "Synthetic Learner Two" },
];
