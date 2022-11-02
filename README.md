[![Version (latest)](https://img.shields.io/github/v/release/caewok/fvtt-token-visibility)](https://github.com/caewok/fvtt-token-visibility/releases/latest)
[![Foundry Version](https://img.shields.io/badge/dynamic/json.svg?url=https://github.com/caewok/fvtt-token-visibility/releases/latest/download/module.json&label=Foundry%20Version&query=$.compatibleCoreVersion&colorB=blueviolet)](https://github.com/caewok/fvtt-token-visibility/releases/latest)
[![License](https://img.shields.io/github/license/caewok/fvtt-token-visibility)](LICENSE)

# Alternative Token Visibility

This module optionally replaces Foundry's default method of measuring visibility of tokens with a more precise, but (at times) more computationally expensive, method.

As of v0.2.0, this module also optionally assists with cover calculations in a (mostly) system-agnostic manner. Various cover measurement options are provided. A macro is also provided to allow any user to calculate cover from one or more selected tokens to one or more targeted tokens. (Import from the Macro compendium.)

By measuring the precise token boundary and by considering intersecting walls, Alt Token Visibility prevents tokens from being seen in situations where they partially overlap a wall. Alt Token Visibility provides additional customizations to control when partially obscured tokens can be seen.

Alt Token Visibility is particularly useful when dealing with token elevations and walls with limited heights or depth, because it focuses on approximating visibility in 3 dimensions.

# Installation

Add this [Manifest URL](https://github.com/caewok/fvtt-token-visibility/releases/latest/download/module.json) in Foundry to install.

## Dependencies
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib)

## Recommended module additions
- [Wall Height](https://github.com/theripper93/wall-height). Not only does Wall Height provide the ability to set elevation for wall tops and bottoms, it also gives tokens height based on their size. The Area3d option for Alt Token Visibility takes full advantage of token height.
- [Elevated Vision](https://github.com/caewok/fvtt-elevated-vision). Can assist with setting terrain and token elevations.
- [Token Lean](https://github.com/WesBelmont/token-lean). Useful when you want players to be able to "peer" over limited-height walls.
- [Midiqol](https://gitlab.com/tposney/midi-qol). If midiqol is installed, additional options are presented to allow cover calculations during an attack roll.

Alternative Token Visibility should also work with [Perfect Vision](https://github.com/dev7355608/perfect-vision/) and [Levels](https://github.com/theripper93/Levels). If either module is installed, measurement of range is left to those modules.

Alt Token Visibility attempts to adjust visibility based on tiles used by Levels, but edge cases may remain. For example, gaps in walls between levels can cause tokens to appear outside unexpectedly. I expect to add more sophisticated ways to deal with Levels tiles over time, but please feel to file an issue if you see a problem.

## Known conflicts
None yet! Feel free to file an issue if/when you find one!

# TLDR: Recommended settings for different styles

## I want the Foundry defaults!

- Range Points: Foundry default (9 points)
- Test Bottom and Top Token Points: unchecked
- Measure Range Distance in 3d: unchecked
- Line of Sight Algorithm: Points on token
- Combatant targeting applies cover: unchecked
- Display cover in chat: unchecked

## Make it faster!

- Range Points: Token center only (1 point)

Otherwise use the Foundry defaults, above.

<em>Note: Measure Range Distance in 3d has minimal performance impact. Depending on scene walls and token configuration, Area3d can be faster than Area2d.</em>

## 3d

- Measure Range Distance in 3d: checked
- Test Bottom and Top Token Points: checked
- Line of Sight Algorithm: Token area 3d
- Cover Algorithm: Area 3d

## dnd5e cover, no automation

- Cover Algorithm: Corner to corners of select target squares (dnd5e DMG)
- Low Cover Trigger: 0.5
- Medium Cover Trigger: 0.75
- High Cover Trigger: 1
- Combatant targeting applies cover: unchecked
- Display cover in chat: Your choice—--Use this and/or the Measure Cover macro.

## dnd5e cover with Midiqol automation

- Save as dnd5e cover, with the following changes:
- Confirm that Low, Medium and High Cover Active Effects are to your liking.
- Combatant targeting applies cover: Irrelevant if using Midiqol attack workflow.
- Display cover in chat: Your choice—--Use this and/or the Midi-qol Attack Workflow
- Midi-qol Attack Workflow: Your choice of GM decides, User decides, or Automatically apply

# Settings

## Range
<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/settings-range.jpg" width="400" alt="Range Settings for the Alt Token Visibility Module">

### Range Points
Base Foundry calculates token (and other object) visibility by considering 9 points arranged around the token: the center point plus 8 points spaced out in a rectangular shape.

<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/token_dots.jpg" width="200" alt="9 red dots inside a large token square">

Range Points lets you change that number:
- Token center ony (1 point)
- Token corners and center (5 points)
- Foundry default (9 points)

Note that the LOS algorithm, "Points on Token," will test the number of points chosen here.

### Test Bottom and Top Token Points
The [Wall Height](https://github.com/theripper93/wall-height) module sets a token height based on the token size. If the token has a height, this option will mirror the points from the bottom of the token to the top of the token, and also add an exact center point. If the token does not have a height, this option is ignored.

### Measure Range Distance in 3d
If enabled, all range measurements will be in three dimensions. Meaning that, for example, a token flying at 35 feet may be unable to view a target at 0 feet if the token only has 30 feet of darkvision and the scene is dark.

## Line-of-sight (LOS)
<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/settings-los.jpg" width="400" alt="LOS Settings for the Alt Token Visibility Module">

### Line of Sight Algorithm

Line of Sight Algorithm lets you select from:
- Points on Token. If Range Points is set to 9, this would be the Foundry default.
- Token Area
- Token Area 3d

#### Point on Token

By default, Foundry measures line-of-sight by drawing a line from the viewer to the 9 points on the target token. If at least one line is not obstructed, then the viewer has line-of-sight to the target.

https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/demo-los-points.mov

#### Token Area 2d

Token area works by intersecting the line-of-sight polygon for the viewer token with the 2d shape of the target token (overhead view). In the picture of the token above, this would be the area within the orange border of the token. As walls or wall shadows obscure more of the target token shape, less of its percentage area is viewable.

Note that if the target token is overlapping one or more walls, a "constrained" target shape is first constructed that approximates the portion of the target shape on the same side of the wall(s) as the center point of the target token. This prevents situations where a target token slightly overlapping a wall would otherwise be seen from the "wrong" side of the wall.

https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/demo-los-area2d.mov

#### Token Area 3d

Token area 3d constructs a view of the target from the perspective of the viewer token. It is basically equivalent to a first-person shooter view. The walls and the target token shape are then "flattened" in this 2d perspective. The target token area without any walls is compared to one with parts of the target token cut away where walls block.

As with Token Area 2d, the target token is trimmed if walls overlap the target.

This method is probably the most accurate way to determine if a token has visibility of another token, and should, in theory, work even in [Ripper's 3d Canvas](https://theripper93.com/).

https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/demo-los-area3d.mov

### Percent Token Area

For Area 2d and Area 3d, the GM can decide how much of the token must be viewable in order to be "visible." Usually, a low percentage—--say 10% or 20%—--works reasonably well.

The GM can change the percent area required for a token to be visibile, and change how large the token boundary appears for purposes of the visibility test.

Note that the area is calculated as a percentage based on the total area of the token that **could** be seen. Thus, if a token has an area of 100 but partially overlaps a wall such that 75% of the token rectangle is viewable, then the token only has an area of 75 for purposes of this calculation.

Setting the Percent Token Area to 1 means that the entire token area must be viewable for the token to be seen. Setting the Percent Token Area to 0 means that if any part of the token is viewable, then it is seen.

| <img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/visibility-area-100.jpg" width="300" alt="Settings for the Alt Token Visibility Module"> |
|:--:|
| <em>Area set to 1. Lizard only viewable once our wizard moves completely beyond the wall.<em> |

| <img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/visibility-area-50.jpg" width="300" alt="Settings for the Alt Token Visibility Module"> |
|:--:|
| <em>Area set to 0.5. Lizard viewable once our wizard can view half of it.</em> |

| <img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/visibility-area-10.jpg" width="300" alt="Settings for the Alt Token Visibility Module"> |
|:--:|
| <em>Area set to 0.1. Lizard viewable when nearly any of it can be seen beyond the wall.</em> |

## Cover

Cover is abstracted into three distinct levels: low, medium, and high. It is expected that these cover types are ordered, such that as a token becomes less viewable due to a portion of the token being behind an obstacle, the token goes from low --> medium --> high cover.

Settings allow the GM to define the precise limits for cover and the algorithm used. Use the active effet configuration settings to re-name the cover types and apply various active effects.

<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/settings-cover.jpg" width="400" alt="Cover Settings for the Alt Token Visibility Module">


### Cover Algorithm

Cover algorithm choices can be split into Points and Area.

Points algorithms draw lines from a point on the viewing token to a point on the targeting token. Either the center or the corner of the viewing token or targeting token can be used. In addition, for larger tokens, an option is available to use only one of the grid squares of the larger token. For this option, the square with the least cover is used.

Area algorithms use the Area 2d or Area 3d algorithms used by LOS, described above.

The following options are provided:
- Viewer center to target center (This is the PF2e default.)
- Viewer center to target corners
- Viewer corners to target corners
- Viewer center to corners of a select target square
- Viewer corners to corners of a select target square (This is the dnd5e DMG method.)
- Area 2d
- Area 3d

### Triggers

The GM can set the "trigger," representing the percent of the token that must not be visible in order to achieve the level of cover.

Center-to-center algorithm: As only one test is done using this algorithm, a single cover type must be selected by the GM.

Points-based algorithms: Percentage of lines blocked for a given grid square/hex test.

Area-based algorithm: Percentage of the token area that is obscured.

### Effects
<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/settings-cover-effects.jpg" width="400" alt="Cover effects Settings for the Alt Token Visibility Module">

The GM can define the name of each cover level, provide an icon, and define active effects for each cover type. Default active effects are provided for dnd5e low (half) and medium (three-quarters) cover. Cover effects can be set as status conditions on a token.

For PF2e, status effects are not added as status conditions. PF2e already has cover effects and the GM is advised to use those.

### Combatant targeting applies cover

When enabled, this option applies cover status to targeted tokens during combat. During combat only, if the user that owns the current combatant targets a token, cover is measured and, when applicable, a cover status condition is added to the targeted token.

### Display cover in chat

For dnd5e, enabling this will use the dnd5e attack hook to display cover of targeted tokens in the chat, when an attack is initiated. Targeted tokens without cover are not included in the chat message, and so if no targeted tokens have cover, nothing will be output to chat.

### Midi-qol Attack Workflow

If [Midiqol](https://gitlab.com/tposney/midi-qol) is active, the GM can choose whether cover status conditions should be applied to targeted tokens. Statuses are applied after targeting occurs in the midiqol workflow. Options:

- Do not test for cover
- Ask user to confirm.
- Ask GM to confirm.
- Apply automatically

For the confirmation options, this pops up a list of targets with calculated covers. Cover types can then be changed by the user or GM, respectively.

# Cover Macro

A compendium macro is provided to allow users to easily measure cover. Select one or more tokens and target one or more tokens. Cover will be measured for each token --> target combination and the results reported in a pop-up.

<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/settings-cover-macro.jpg" width="400" alt="Cover Macro for the Alt Token Visibility Module">

# Methodology
Base Foundry calculates token (and other object) visibility by considering 9 points arranged around the token: the center point plus 8 points spaced out in a rectangular shape.

<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/token_dots.jpg" width="200" alt="9 red dots inside a large token square">

Alt Token Visibility instead considers the whole token shape—the orange outline in the above image.

# Performance

Depending on settings and scene layout, Alternative Token Visibility may be faster or slower than the default Foundry approach. (The default Foundry approach is already very fast, so the speed improvement, if any, is minimal.) It is usually slower.

Setting area = 0 tends to be a bit faster than other area settings. When area is set to less than or equal to 50%, calculations for visible tokens tend to be faster. When area is set to greater than 50%, calculations for non-visible tokens tend to be faster. When a token partially overlaps a wall, Alt Token Visibility must re-construct the visible shape, which is slow.

Area3d can be faster than Area2d, depending on

You can test performance on a given scene by selecting a token on the scene and running the following code in the console. This will test whether the selected token can see every other token in the scene, and will test cover, for a variety of settings.

```js
api = game.modules.get('tokenvisibility').api;
N = 100; // Change if you want more iterations.
api.bench.benchAll(N)
```

# API

Various methods and classes are exposed at `game.modules.get('tokenvisibility').api`. These may change over time as this module evolves.

Of interest:

- Benchmarking methods, at `api.bench`.
- Cover calculator class: `api.CoverCalculator`.
- Area2d and 3d classes: `api.Area2d` and `api.Area3d`
- Debug toggles. `api.debug.range`, `api.debug.los`, `api.debug.cover`. This will draw various indicators on the screen to help understand what a given algorithm is doing.

Feel free to message me in Discord if you have questions about specific methods.
