# Sweater-vest-suede

Sweater vest (<span style="color:#aa1e1e"><span>**S**</span><sup style="color:grey">weater</sup> <span style="color:#aa1e1e">**v**</span><sub style="color:#aa1e1e">_elte_</sub></span> <sub style="">_t_</sub><span style="text-">est</span>) is a [svelte](https://svelte.dev/) utility that simplifies testing svelte components in browser environments, specifically when you're testing multiple components together and/or within complex markup.

This repo is a [suede dependency](https://github.com/pmalacho-mit/suede).

To see the installable source code, please checkout the [dist branch](https://github.com/pmalacho-mit/sweater-vest-suede/tree/dist).

## Installation (SSH)

```bash
git subrepo clone --branch dist git@github.com:pmalacho-mit/sweater-vest-suede.git ./sweater-vest-suede
```

## Installation (HTTPS)

```bash
git subrepo clone --branch dist https://github.com/pmalacho-mit/sweater-vest-suede.git ./sweater-vest-suede
```

[](./src/routes/docs/anatomy/README.md)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 253 chars: 7277 -->

[](<?register=recipe(path)&region=remap(,$dist,_angle_path_unangle__slash_sweater-vest-suede,_)>)

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
<!-- p↓ length lines: 16 chars: 142 -->

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

The `Sweater` component expects a `vest` snippet to be defined which takes a single argument (which is called `pocket` as a convention).

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
- Additional utilities like `delay`, `preventRender`, `capture`, and more are available on the harness.

[](<src/routes/docs/anatomy/+page.svelte?region=extract(script,component),replace(snippet,...),splice-start(body,1)&apply=recipe(no-import)>)

<!-- p↓ BEGIN -->
<!-- p↓ length lines: 24 chars: 438 -->

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
<!-- p↓ length lines: 29 chars: 600 -->

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
