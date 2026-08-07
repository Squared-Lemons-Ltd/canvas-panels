import { copyFile, mkdir } from "node:fs/promises";

const destination = new URL("../dist/", import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(
  new URL("../src/styles.css", import.meta.url),
  new URL("styles.css", destination),
);
