import { fileURLToPath } from "node:url";

export const isCliEntryPoint = (import_meta_url: string) =>
  process.argv[1] !== undefined &&
  fileURLToPath(import_meta_url) === process.argv[1];
