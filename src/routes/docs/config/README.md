[](<?register=recipe(path)&region=remap(,$dist,_angle_path_unangle__slash_sweater-vest-suede,_)>)

# Configuration

Sweater vests test all run in the same "group" by default.

[](<./none/+page.svelte?apply=recipe(path)>)

Tests in the "same" group will be rendered within the same [grid-view](https://dockview.dev/docs/other/gridview/overview) and all run in parallel.

However, the `<Sweater>` component can also be used to configure and group similar tests.

## With Nesting

The most intuitive way to group and configure tests is to _nest_ them under a `<Sweater>` component with the `config` attribute.

[](<./nested/+page.svelte?apply=recipe(path)>)

As you can see above, the parent `<Sweater>` can also be used to style the container of the group's [grid-view](https://dockview.dev/docs/other/gridview/overview) with both `class` and `style` props.

This is useful, as <ins>**only `<Sweater>` components should be childed under other `<Sweater>` components**</ins> (it likely won't cause errors, but won't behave as expected).

## Sequentially

You can also sequentially group tests, which is offered simply to reduce nesting and make the code more readable.

To do so, simply breakup tests with a leading `<Sweater>` component that has the `config` attribute.

[](<./sequential/+page.svelte?apply=recipe(path)>)

## Mixed

You can also mix configuration strategies. Any tests appearing before a `<Sweater>` component with the `config` attribute will be placed into the "default" group.

[](<./mixed/+page.svelte?apply=recipe(path)>)

### **Warning:** Avoid Dangling Tests

> [!CAUTION]
> Avoid Dangling Tests

You cannot have tests that are not directly associated with a specific group.

[](<./mixed-wrong/+page.svelte?apply=recipe(path)>)
