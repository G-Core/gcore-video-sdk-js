<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@gcorevideo/player](./player.md) &gt; [LevelSelector](./player.levelselector.md)

## LevelSelector class

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

A [media control](./player.mediacontrol.md) plugin that provides a UI to control the quality level of the playback.

**Signature:**

```typescript
export declare class LevelSelector extends UICorePlugin 
```
**Extends:** UICorePlugin

## Remarks

Depends on:

- [MediaControl](./player.mediacontrol.md)

- [BottomGear](./player.bottomgear.md)

The plugin is rendered as an item in the gear menu.

When clicked, it shows a list of quality levels to choose from.

Configuration options:

- `labels`<!-- -->: The labels to show in the level selector. \[video resolution\]: string

- `restrictResolution`<!-- -->: The maximum resolution to allow in the level selector.

## Example


```ts
new Player({
  levelSelector: {
    restrictResolution: 360,
    labels: { 360: 'SD', 720: 'HD' },
  },
})
```

## Properties

<table><thead><tr><th>

Property


</th><th>

Modifiers


</th><th>

Type


</th><th>

Description


</th></tr></thead>
<tbody><tr><td>

[events](./player.levelselector.events.md)


</td><td>

`readonly`


</td><td>

{ 'click .gear-sub-menu\_btn': string; 'click .gear-option': string; 'click .go-back': string; }


</td><td>

**_(BETA)_**


</td></tr>
</tbody></table>
