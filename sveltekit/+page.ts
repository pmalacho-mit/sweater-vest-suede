import type { PageLoad } from "./$types";

const extension = ".test.svelte";
/** (assumes this file is located in src/routes/tests/[...path], and thus lib is 3 levels down) */
const relativeLib = "../../../lib";

const pathToTestComponent = (path: string) => {
  path = path.split("lib")[1];
  if (path.startsWith("/")) path = path.slice(1);
  if (path.endsWith("/")) path = path.slice(0, -1);
  if (!path.includes(extension)) path = path.replace(".svelte", extension);
  path = `${relativeLib}/${path}`;
  return path;
};

export const load = (async ({ params: { path } }) => {
  return {
    component: pathToTestComponent(path),
  };
}) satisfies PageLoad;
