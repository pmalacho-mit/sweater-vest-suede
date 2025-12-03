# Sweater-vest-suede

Sweater vest (<ins style="color:white"><span style="color:#aa1e1e"><span>**S**</span><sup style="color:grey">weater</sup> <span style="color:#aa1e1e">**v**</span><sub style="color:#aa1e1e">_elte_</sub></span> <sub style="">_t_</sub><span style="text-">est</span></ins>) is a [svelte](https://svelte.dev/) utility that simplifies testing svelte components in browser environments, specifically when you're testing multiple components together and/or within complex markup.

This repo is a [suede dependency](https://github.com/pmalacho-mit/suede).

To see the installable source code, please checkout the [release branch](https://github.com/pmalacho-mit/sweater-vest-suede/tree/release).

## Installation

```bash
bash <(curl https://suede.sh/install-release) --repo pmalacho-mit/sweater-vest-suede
```

<details>
<summary>
See alternative to using <a href="https://github.com/pmalacho-mit/suede#suedesh">suede.sh</a> script proxy
</summary>

```bash
bash <(curl https://raw.githubusercontent.com/pmalacho-mit/suede/refs/heads/main/scripts/install-release.sh) --repo pmalacho-mit/sweater-vest-suede
```

</details>

[](./src/routes/docs/anatomy/README.md)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 317 chars: 9532 -->

[](<?register=recipe(path)&region=remap(,$release,_angle_path_unangle__slash_sweater-vest-suede,_)>)

[](<?register=recipe(no-body)&region=splice-end(body,5),splice-start(body,-6),replace(body,'...')>)

[](<?register=recipe(no-snippet)&region=replace(snippet,'...')>)

[](<?register=recipe(no-model)&region=replace(model,...)>)

[](<?register=recipe(trim-pocket)&region=trim(pocket)>)

[](<?register=recipe(no-pocket-type)&region=splice-end(type,1),replace(type,...)>)

[](<?register=recipe(no-markup)&region=replace(markup,...)>)

[](<?register=recipe(no-template)&region=replace(templated,...)>)

[](<?register=recipe(no-import)&region=replace(import,...)>)

### Anatomy of a Sweater Vest Test

Jump to the [complete example](#complete) below if you want to see what a Sweater Vest test looks like in its entirety.

#### `Sweater` Component

Begin a [Sweater Vest](https://www.npmjs.com/package/sweater-vest) test by utilizing the `Sweater` component imported from wherever you've installed the source code (the below assumes it's in a `sweater-vest-suede` folder).

[](<src/routes/docs/anatomy/+page.svelte?apply=recipe(path,no-body,no-snippet,no-model)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 15 chars: 141 -->

```svelte
<script lang="ts">
  import { Sweater } from "<path>/sweater-vest-suede";

  ...
</script>

<Sweater
  ...
>
  ...
</Sweater>
```

<!-- p↓ END -->

#### `vest` Snippet

The `Sweater` component expects a `vest` [snippet](https://svelte.dev/docs/svelte/snippet) to be defined which takes a single argument (which is called `pocket` as a convention).

[](<src/routes/docs/anatomy/+page.svelte?region=extract(component)&apply=recipe(no-body,no-pocket-type,trim-pocket,no-markup)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 11 chars: 95 -->

```svelte
<Sweater
  ...
>
  {#snippet vest(pocket: ...)}
    ...
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

#### `Pocket` Model Class / `pocket` Argument Type

Within the script tag of your test, you should define a [model class](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller#Model), which will be passed to the [`vest` snippet](#vest-snippet) as it's only argument.

[](<src/routes/docs/anatomy/+page.svelte?region=extract(script,component),replace(container,...),remove(value)&apply=recipe(no-body,trim-pocket,no-markup,no-import)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 19 chars: 164 -->

```svelte
<script lang="ts">
  ...

  class Pocket {
    ...
  }
</script>

<Sweater
  ...
>
  {#snippet vest(pocket: Pocket)}
    ...
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

Similiar to the [`vest` snippet's](#vest-snippet) `pocket` argument, this class is named `Pocket` as a convention.

You as the test author will determine the fields of `Pocket` based on the requirements of your test.

If you expect the values of a field to change over the course of a test (including and especially being [`bind`ed](https://svelte.dev/docs/svelte/bind) to within the [`vest` snippet's](#vest-snippet) markup), you should make it a [`$state` rune class field](https://svelte.dev/docs/svelte/$state#Classes), as is demonstrated in the below examples.

`Pocket` should define fields for:

- Any elements and/or componets within your markup that you want to `bind:this` to in order to interact with in your test's [body](#body-function-prop). For example:

[](<src/routes/docs/anatomy/+page.svelte?region=extract(script,component),replace(value,...),trim-start(bind)&apply=recipe(no-body,trim-pocket,no-template,no-import)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 22 chars: 258 -->

```svelte
<script lang="ts">
  ...

  class Pocket {
    container = $state<HTMLDivElement>();
    ...
  }
</script>

<Sweater
  ...
>
  {#snippet vest(pocket: Pocket)}
    <div bind:this={pocket.container}>
      ...
    </div>
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

- Any data that will be utilized within your markup (which will be initilalized / manipulated by your test's [body](#body-function-prop)). For example:

[](<src/routes/docs/anatomy/+page.svelte?region=extract(script,component-no-markup-open,templated,component-no-markup-close),replace(container,...),splice-start(templated,-1,--...),splice-end(templated,-1,...),single-line(templated)&apply=recipe(no-body,trim-pocket,no-import)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 20 chars: 207 -->

```svelte
<script lang="ts">
  ...

  class Pocket {
    ...
    value = $state("");
  }
</script>

<Sweater
  ...
>
  {#snippet vest(pocket: Pocket)}
    ... {pocket.value} ...
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

#### `body` Function Prop

The `body` prop is an async function that contains your test logic. It receives a single argument called `harness` (as a convention), which provides utilities for interacting with your test.

[](<src/routes/docs/anatomy/+page.svelte?region=extract(component),replace(snippet,...),replace(implementation,...),splice-start(body,1)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 11 chars: 85 -->

```svelte
<Sweater
  body={async (harness) => {
    ...
  }}
>
  ...
</Sweater>
```

<!-- p↓ END -->

##### `body` implementation

The `harness` argument provides several utilities that help you write your test:

- **`set`** - Sets the value that will be passed to the [`vest` snippet](#vest-snippet). By convention, this value is called `pocket` and should be an instance of your `Pocket` class.
- **`definition`** - An async function that waits for elements in your `Pocket` model to be defined (i.e., not null nor undefined). Pass the names of the fields you want to wait for, and it returns a promise that resolves when all those fields are populated by the markup.
- **`expect`** - The assertion function from `@storybook/test` used to set up your test expectations.
- Additional utilities like `preventRender` and `capture`, and more are available on the harness.

[](<release/Runner.svelte?region=extract(harness-docs)&wrap=dropdown(See-all-utilities-on-harness.)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 59 chars: 1873 -->

<details>
<summary>
See all utilities on harness.
</summary>

```svelte
export type TestHarness<Pocket extends Record<string, any>> = {
  /**
   * Sets the pocket instance passed to the vest snippet.
   * Returns the pocket for convenience.
   */
  set: (pocket: Pocket) => Pocket;
  /**
   * The container element holding the rendered vest snippet.
   */
  container: HTMLElement;
  /**
   * Prevents rendering until the returned function is called.
   * Invoke before any `await` within test body to prevent initial render.
   */
  preventRender: () => () => void;
  /**
   * Registers a callback to run when the test is aborted.
   */
  onAbort: (fn: (this: AbortSignal) => void) => void;
  /**
   * Utilities for capturing the visual state of the `container` element.
   * @returns `{ toPng(), toSvg(), toJpeg(), toBlob(), toCanvas(), toPixelData() }`
   */
  capture: ReturnType<typeof createCapturer>;
  /**
   * Utility for awaiting a specified amount of time.
   * @example await harness.delay({ seconds: 2 });
   */
  delay: (amount: Delay) => Promise<void>;
  /**
   * Waits for specified `Pocket` fields to be defined (not null/undefined).
   * **NOTE:** fields must be `$state` runes to work correctly.
   * @example const { a, b } = await harness.definition("a", "b");
   */
  definition: <Keys extends keyof Pocket>(
    ...keys: Keys[]
  ) => Promise<{ [K in Keys]: NonNullable<Pocket[K]> }>;
  /**
   * Queues user interactions to run serially with access to userEvent.
   * @example await harness.withUserFocus(async (userEvent) => {
   *            await userEvent.click(button);
   *          });
   * This should be used in place of `import("@storybook/test").userEvent`.
   */
  withUserFocus: (
    fn: (userEvent: typeof test.userEvent) => Promise<void>
  ) => Promise<void>;
} & Omit<typeof import("@storybook/test"), "userEvent">;
```

</details>

<!-- p↓ END -->

[](<src/routes/docs/anatomy/+page.svelte?region=extract(script,component),replace(snippet,...),splice-start(body,1)&apply=recipe(no-import)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 25 chars: 525 -->

```svelte
<script lang="ts">
  ...

  class Pocket {
    container = $state<HTMLDivElement>();
    value = $state("");
  }
</script>

<Sweater
  body={async (harness) => {
    const { set, definition, expect } = harness;
    const pocket = set(new Pocket());
    pocket.value = "Hello, world!";
    // NOTE: rendering happens here (effectively whenever you call your first `await`)
    const { container } = await definition("container");
    expect(container.textContent).toBe("Hello, world!");
  }}
>
  ...
</Sweater>
```

<!-- p↓ END -->

#### Complete

[](<src/routes/docs/anatomy/+page.svelte?apply=recipe(trim-pocket,path)&region=splice-start(body,1),single-line(pocket),splice-end(pocket,-1),splice-start(bind,1)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 29 chars: 686 -->

```svelte
<script lang="ts">
  import { Sweater } from "<path>/sweater-vest-suede";

  class Pocket {
    container = $state<HTMLDivElement>();
    value = $state("");
  }
</script>

<Sweater
  body={async (harness) => {
    const { set, definition, expect } = harness;
    const pocket = set(new Pocket());
    pocket.value = "Hello, world!";
    // NOTE: rendering happens here (effectively whenever you call your first `await`)
    const { container } = await definition("container");
    expect(container.textContent).toBe("Hello, world!");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <div bind:this={pocket.container}>
      {pocket.value}
    </div>
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

<!-- p↓ END -->

[](./src/routes/docs/config/README.md)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 242 chars: 5870 -->

[](<?register=recipe(path)&region=remap(,$release,_angle_path_unangle__slash_sweater-vest-suede,_)>)

### Configuration

Sweater vests test all run in the same _group_ by default.

[](<src/routes/docs/config/none/+page.svelte?apply=recipe(path)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 21 chars: 380 -->

```svelte
<script lang="ts">
  import { Sweater } from "<path>/sweater-vest-suede";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Test 1 (Default Group)...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Test 2 (Default Group)...
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

Tests in the same group will be rendered within the same [grid-view](https://dockview.dev/docs/other/gridview/overview) and run in parallel.

However, the `<Sweater>` component can also be used to configure and group similar tests.

#### With Nesting

The most intuitive way to group and configure tests is to _nest_ them under a `<Sweater>` component with the `config` attribute.

[](<src/routes/docs/config/nested/+page.svelte?apply=recipe(path)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 41 chars: 884 -->

```svelte
<script lang="ts">
  import { Sweater } from "<path>/sweater-vest-suede";

  class Pocket {}
</script>

<Sweater config>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Group 1, Test 1 (nested)...
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Group 1, Test 2 (nested)...
    {/snippet}
  </Sweater>
</Sweater>

<Sweater config class="custom-config-class" style="color: blue;">
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Group 2, Test 1 (nested)...
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Group 2, Test 2 (nested)...
    {/snippet}
  </Sweater>
</Sweater>

<style>
  :global(.custom-config-class) {
    background-color: greenyellow;
  }
</style>
```

<!-- p↓ END -->

> [!TIP]
> As you can see above, the parent `<Sweater>` can also be used to style the container of the group's [grid-view](https://dockview.dev/docs/other/gridview/overview) with both `class` and `style` props.

> [!IMPORTANT]  
> Only `<Sweater>` components should be childed under other `<Sweater>` components\*\*</ins> (it likely won't cause errors, but won't behave as expected).

#### Sequentially

You can also sequentially group tests, which reduces nesting and can make code more readable (but perhaps slightly more complex to reason about).

To do so, simply breakup tests with a leading `<Sweater>` component with the `config` attribute.

[](<src/routes/docs/config/sequential/+page.svelte?apply=recipe(path)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 37 chars: 654 -->

```svelte
<script lang="ts">
  import { Sweater } from "<path>/sweater-vest-suede";

  class Pocket {}
</script>

<Sweater config />

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Group 1, Test 1...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Group 1, Test 2...
  {/snippet}
</Sweater>

<Sweater config />

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Group 2, Test 1...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Group 2, Test 2...
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

#### Mixed

You can also mix configuration strategies. Any tests appearing before a `<Sweater>` component with the `config` attribute will be placed into the _default_ group.

[](<src/routes/docs/config/mixed/+page.svelte?apply=recipe(path)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 48 chars: 967 -->

```svelte
<script lang="ts">
  import { Sweater } from "<path>/sweater-vest-suede";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Defaul Group, Test 1...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Defaul Group, Test 2...
  {/snippet}
</Sweater>

<Sweater config>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Nested Group, Test 1...
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Nested Group, Test 2...
    {/snippet}
  </Sweater>
</Sweater>

<Sweater config />

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Sequential Group, Test 1...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Sequential Group, Test 2...
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

> [!CAUTION]
> Avoid [Dangling Tests](#dangling-tests)

#### Dangling Tests

You cannot have tests that are not directly associated with a specific group (outside of the _default_ group at the top of your markup).

[](<src/routes/docs/config/mixed-wrong/+page.svelte?apply=recipe(path)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 33 chars: 672 -->

```svelte
<script lang="ts">
  import { Sweater } from "<path>/sweater-vest-suede";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Default Group Test...
  {/snippet}
</Sweater>

<Sweater config>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Nested Group Test...
    {/snippet}
  </Sweater>
</Sweater>

<!--
This test can't be associated with a config and is therefore "danling".
This will cause your test to error out or not load at all.
-->
<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    !!!DANGLING TEST!!!
  {/snippet}
</Sweater>
```

<!-- p↓ END -->

<!-- p↓ END -->
