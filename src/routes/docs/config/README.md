[](<?register=recipe(path)&region=remap(,$release,_angle_path_unangle__slash_sweater-vest-suede,_)>)

# Configuration

Sweater vests test all run in the same _group_ by default.

[](<./none/+page.svelte?apply=recipe(path)>)

Tests in the same group will be rendered within the same [grid-view](https://dockview.dev/docs/other/gridview/overview) and run in parallel.

However, the `<Sweater>` component can also be used to configure and group similar tests.

## With Nesting

The most intuitive way to group and configure tests is to _nest_ them under a `<Sweater>` component with the `config` attribute.

[](<./nested/+page.svelte?apply=recipe(path)>)

> [!TIP]
> As you can see above, the parent `<Sweater>` can also be used to style the container of the group's [grid-view](https://dockview.dev/docs/other/gridview/overview) with both `class` and `style` props.

> [!IMPORTANT]  
> Only `<Sweater>` components should be childed under other `<Sweater>` components\*\*</ins> (it likely won't cause errors, but won't behave as expected).

## Sequentially

You can also sequentially group tests, which reduces nesting and can make code more readable (but perhaps slightly more complex to reason about).

To do so, simply breakup tests with a leading `<Sweater>` component with the `config` attribute.

[](<./sequential/+page.svelte?apply=recipe(path)>)

## Mixed

You can also mix configuration strategies. Any tests appearing before a `<Sweater>` component with the `config` attribute will be placed into the _default_ group.

[](<./mixed/+page.svelte?apply=recipe(path)>)

> [!CAUTION]
> Avoid [Dangling Tests](#dangling-tests)

## Dangling Tests

You cannot have tests that are not directly associated with a specific group (outside of the _default_ group at the top of your markup).

[](<./mixed-wrong/+page.svelte?apply=recipe(path)>)
