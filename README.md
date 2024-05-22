[![Version (latest)](https://img.shields.io/github/v/release/caewok/fvtt-token-cover)](https://github.com/caewok/fvtt-token-cover/releases/latest)
[![Foundry Version](https://img.shields.io/badge/dynamic/json.svg?url=https://github.com/caewok/fvtt-token-cover/releases/latest/download/module.json&label=Foundry%20Version&query=$.compatibleCoreVersion&colorB=blueviolet)](https://github.com/caewok/fvtt-token-cover/releases/latest)
[![License](https://img.shields.io/github/license/caewok/fvtt-token-cover)](LICENSE)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H2H3Y7IJW)

# Alternative Token Cover

This module provides options to calculate how much cover a targeted token has, with respect to a viewer token. The GM can choose between several algorithms to determine how cover is physically measured. The GM can also define a set of rules for when cover should apply and define a set of active effects or items (depending on the system) that should be applied to tokens that have cover. Users can select between different methods of displaying cover on tokens.

As of version 0.7.0, cover icons and effects are applied locally, per user. In other words, the cover icons and effects are not saved in the server database. This dramatically improves speed and allows different users to see different things. For example, if the user chooses to view cover icons all the time, that user will see cover icons for all other visible tokens based on the token they selected. Meanwhile, this user's selection will not affect the display of cover icons for other users.

This module is closely related to [Alternative Token Visibility](https://github.com/caewok/fvtt-token-visibility). Both rely on the same underlying algorithms to determine whether there are obstacles between the viewer and the target.

_Cover Algorithms_:
- Points. Test whether a 3d ray from a point on the viewer token to a point on the target token is blocked by an obstacle. Multiple points on the target can be tested to determine whether a threshold percentage of rays is met for cover. For overhead tiles, considers them to block unless the ray passes through a transparent portion of the tile.
- Area2d. Test the percentage of the overhead view of a target token that is viewable from the perspective of a point on the viewer token. For overhead tiles, does not consider transparency.
- Area3d. Test the percentage of the 3d view of a target token that is viewable from the perspective of a point on the viewer token. For overhead tiles, uses webGL to test transparency.

# Installation

Add this [Manifest URL](https://github.com/caewok/fvtt-token-cover/releases/latest/download/module.json) in Foundry to install.

## Dependencies
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib)

## Known Issues

In Pathfinder 2e, the setting "Only Use Cover Icons" must be enabled for cover icons to appear. Cover effects (items in pf2e) are unsupported.

(For the technically inclined, if you turn off "Only Use Cover Icons," the module correctly adds a Cover Effect item to a pf2e defender token with cover. But I cannot find a way to convince the pf2e system to update the actor sheet or the token status icon to indicate that cover is applied. I strongly suspect that the cover bonuses are also not being correctly applied. Compare this to Starfinder RPG, which also uses items but the module can trigger an update to the actor sheet and token status icons. If you know what might be wrong, feel free to submit a PR!)

## Recommended module additions
- [Alternative Token Visibility](https://github.com/caewok/fvtt-token-visibility). Needed if you want token vision to exactly match token cover.
- [Wall Height](https://github.com/theripper93/wall-height). Not only does Wall Height provide the ability to set elevation for wall tops and bottoms, it also gives tokens height based on their size. The Area3d option for Alt Token Visibility takes full advantage of token height.
- [Elevated Vision](https://github.com/caewok/fvtt-elevated-vision). Can assist with setting terrain and token elevations.
- [Midiqol](https://gitlab.com/tposney/midi-qol). If midiqol is installed, additional options are presented to allow cover calculations during an attack roll.

## Levels

Alternative Token Cover is intended to work with the [Levels](https://github.com/theripper93/Levels) module. Both the Points and the Area3d algorithms will ignore transparent portions of tiles as expected in Levels. The Area2d algorithm treats overhead tiles as blocking regardless of transparency and thus may not work in all cases with Levels.

# Measuring cover

"Cover" is measured by testing for obstacles between a viewer (attacking token) and a target (defending token). Different algorithms, set in the GM Cover Settings Menu (discussed below) control exactly how such obstacles are determined. Each algorithm considers points on or shape of the attacking and defending tokens and determines how much of the defender is obscured from the point of view of the attacker. The algorithm considers walls, tokens, or other obstacles and estimates the percent "cover" the defender has from the attacker.

A point or points on the attacker serve as the "eyes" of the attacker. The height of these points, for purposes of measuring vision, can be changed using the [Wall Height](https://github.com/theripper93/wall-height) module. Token height is otherwise set based on scale of the token—namely,the number of grid squares it occupies.

Note that very large tokens can be quite tall, and may poke through an overhead tile. Depending on your settings, this may cause large tokens to be visible if a sufficient portion of the token is visible.

By default, cover algorithms uses the "move" wall restriction when considering whether walls block. This is intended to be consistent with how walls that would physically block movement are most likely to provide cover. Using the API, it is possible to change this for a given calculation.

# Cover Effect

A cover effect represents an active effect (or, for some systems, an item representing an effect) that is applied to a defender with cover. Some cover effects are already defined, but the GM can edit those using the "Alt. Token Cover" book icon in the token controls.

## Cover Effect Rules

The GM can set certain rules that define when a cover effect should be applied. These are preset for certain systems, but the GM can edit those by right-clicking on an effect in the Cover Book and clicking "Edit Cover Rules." For some systems, the GM can also edit the rules by editing the cover effect directly, by double-clicking the effect in the Cover Book to open its configuration window.

 Key parameters include:
- Percent threshold: The percent by which the defender must be obscured from the attacker in order to be considered to have this cover effect.
- Include walls: Whether to include walls as potential obstacles.
- Include tokens: Whether to include other tokens as potential obstacles.
- Priority: In what order to test if a cover effect applies. Typically, only a single cover effect applies to a token. The first cover effect to apply "wins." Priority is tested from highest to lowest. "0" priority cover effect are omitted and considered only after all other priorities.
- Overlap: If the cover effect overlaps, it can be applied in addition to any other. Typically, overlapping cover effects should have a 0 priority.

For example, the Starfinder system defines a "soft" cover, meaning there is a token between the defender and the attacker. In addition, a token gets partial cover from any obstacle that obscures more than 25%. Regular cover is more than 50%. This might look like:
- Soft. Threshold ≥ 0.01. Includes tokens but not walls. Priority = 0. Overlaps.
- Partial. Threshold ≥ 0.25. Includes tokens and walls. Priority = 1.
- Regular. Threshold ≥ 0.50. Includes tokens and walls. Priority = 2.

If a defender has 50% cover, it would be assigned the regular cover effect because that is the highest priority. Then the overlapping "soft" cover would be tested. If a token occluded the defender, it would also gain the "soft" cover effect. A defender with 30% cover, on the other hand, would fail the test for the regular cover effect and instead be assigned the partial cover effect. Again, the overlapping "soft" cover effect would be tested separately.

## Overlap and Priority rules

Overlap and priority in combination work as follows:
- Priority, no overlap: Of all effects that could apply to the token given the percent cover, the highest priority effect is assigned.
- Priority, overlap: Moving from highest to lowest priority, if an effect would take priority but can overlap, that effect is assigned but the priority list continues to be evaluated. So if A, B, and C are in priority order, and A can overlap, A and B would be assigned.
- No priority, no overlap: This effect will only be assigned if no priority effect is assigned. If there are multiple no-priority effects, it is not guaranteed that this one will be chosen.
- No priority, overlap: This effect will only be assigned if no priority effect is assigned. If there are multiple no-priority effects, this one will be assigned along with potentially others.


# "Alt. Token Cover" token control (book icon)

<img width="479" alt="Screenshot 2024-05-07 at 3 52 26 PM" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/3830e745-78e4-4eb8-82f4-84bc8c3b5507">

The GM can view and edit the Cover Effects using the book icon in the token controls. Right-click a cover effect to import/export/duplicate/delete.

# Performance

Performance is inevitably a function of the number of tokens present on the scene and, to a lesser extent, the number of walls.

For cover effect "use" settings, least to most performant is:
1. Always
2. During combat
3. Combatant only
4. During attack
5. Never.

Enabling application of cover effects only while targeting (again, in settings) should also improve performance, possibly quite a bit for scenes with a lot of tokens.

Performance is also a function of the cover calculation algorithm chosen, and its settings. The Points algorithm is generally faster than 2d or 3d, unless you are testing a lot of points on the target. And it will always be faster to test a single viewer point rather than multiple viewer points.

# Main Settings Menu
<img width="559" alt="ATC Main Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/63bd7a8e-b7d8-446e-985e-a435d5efe459">

## Display Cover Book

The GM can choose whether the Cover Book is added to the Token Controls. The Cover Book is used to define specific cover rules and effect bonuses. The GM can also drag cover effects to tokens to override the automatic cover calculation for that token.

If you are using DFred's Convenient Effects in dnd5e, you can use DFred's cover effects instead of the effects in the Cover Book.

## Display Cover on Secret Tokens

If disabled, cover icons will not be shown on tokens with secret disposition. The cover effect (with any applicable bonuses) will still be applied to that token.

## Only Use Cover Icons

If enabled, only cover icons will be displayed; no cover effects (active effects or items) will be added to tokens. This setting is primarily for use with systems where the cover effects are unsupported. You can also use this if you don't want any active effects (e.g., defender bonuses) applied to tokens.

## Debug Cover

Enable this to create a display on the canvas indicating how cover is being tested. This is specific to the different cover algorithms. You generally will need to select a token to be the attacker and target one or more defending tokens.

# GM Cover Settings Menu
The more complex ATC module settings appear in a popout when you hit the "GM Cover Settings" button in the main settings menu. The menu is split into four tabs: Viewer, Target, Cover Workflow, and Cover Options. The first two control how cover is physically measured between the viewer (attacking) token and the target (defending) token that potentially has cover. Workflow determines if and when cover effects should be applied to the target. And options contain other miscellaneous less used options that affect the physical calculation for cover.

## Viewer
Settings relevant to the viewing, or attacking, token.

<img width="700" alt="ATC Viewer Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/310d547b-bcea-4602-8478-7fe2b124b4b1">

### Points
The viewing points are the viewing token's "eyes." If more than one viewing point, the target will have cover if none of the viewer points have line-of-sight to the target.  If two points are used, they are set to the token's front-facing direction.

### Inset
When more than one point is used, an "inset" allows you to determine how far each point lies on a line between the viewer center and the viewer border. The greater the inset, the closer to the center the point is.

## Target
Settings relevant to the target, or defending, token. This is the token that may have cover.

<img width="702" alt="ATC Target Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/2d185540-87a6-4244-82eb-912a0fc346f2">

### Large Token Subtargeting
If enabled, tokens larger than a grid square will be considered to have no cover if at least one grid square's worth of the token is unobstructed from the viewer. For the Points algorithm, each grid square that the target occupies is tested separately as if it were a single token. For the Area2d and Area3d algorithms, the percentage area required is based on the size of a single grid square instead of the size of the entire target. The result is that tokens larger than a grid square can have less than 0% cover.

This setting is slightly less performant but very useful for larger tokens. For example, without large token subtargeting, 3 out of 4 grid squares of a dragon could be visible and—depending on your cover threshold setting—this may still provide cover to the dragon.

### Points Algorithm
The points algorithm tests whether a 3d ray from the viewing point to a point on the target token is blocked by an obstacle. As with the viewer, the offset determines how close each point is to the center of the target token. If 3d points are enabled, additional points at the top and bottom of the target token will be tested.

### Area2d Algorithm
The Area2d algorithm tests how much of the overhead target token shape is obstructed. It usually is very performant, but less intuitive and less accurate than the Area3d algorithm. It treats all overhead tiles as opaque.

### Area3d Algorithm
The Area3d algorithm constructs a simplistic 3d model of the scene from the point of view of the viewing token looking toward the target token. It then measures the obstructed area of the 3d target. This can be faster than the Points algorithm in certain scenes.

If overhead tiles are encountered within the viewing triangle, the Area3d algorithm switches to webGL to construct its 3d model. This allows it to take into account transparent portions of the overhead tile. The webGL is much slower, however, so it only uses it when necessary. (The slowdown is primarily because the webGL scene must be converted back into pixels that Javascript can then summarize to determine the obstructed area.)

## Workflow
Settings relevant to automated workflow for applying cover effects to targeted tokens.

<img width="700" alt="ATC Workflow Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/f6d44b2c-b8a5-4313-998b-ec4a76bae571">

### Apply Cover Effects

Cover effects can be applied at different stages of the workflow. When applied, a cover icon will be displayed on the token that has the cover.

Generally, if a user has selected a token, that token will be considered an "attacker" for purposes of cover, _for that user's view only_. Selecting multiple tokens will apply cover only if the defending token has that cover (or better) from every attacker. Generally, defending tokens are all non-selected tokens.

The GM can select between different options for displaying cover:
- Never: Don't display
- During Combat: Only display if combat is present.
- Current Combatant Only: Overrides selection rule to treat only the current combatant as the attacker.
- During Attack: For systems like dnd5e only. The cover effect is only displayed during the attack sequence.
- Always: Always display, regardless of combat status.

### Apply Cover Effects only when targeting

When enabled, cover effects will be applied only to targeted defenders. In other words, the user must control one or more tokens and target one or more other tokens to have cover be applied. This should increase performance for scenes with many tokens.

## Workflow: System-specific attack settings

<img width="700" alt="Screenshot 2024-05-07 at 11 48 06 AM" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/dc058e34-a40a-483f-8c23-b57111ee5bfd">

Additional settings are available for systems like dnd5e for which ATC knows how to modify the system's attack workflow.

### Display cover in chat
Enabling this will display cover of targeted tokens in the chat, when an attack is initiated. Targeted tokens without cover are not included in the chat message, and so if no targeted tokens have cover, nothing will be output to chat.

## Confirm cover
Should the attack workflow be paused to confirm cover?
- Show the user, but only allow the user to cancel.
- Ask user to confirm.
- Ask GM to confirm.
- Apply automatically; no dialog.

The confirmation dialog pops up a list of targets with calculated covers. Cover effects can then be changed by the user or GM, respectively.

## Confirm no cover
If the defender is deemed to have no cover, should the confirmation dialog still be presented?

## Confirm only on change
Should the confirmation dialog be skipped if the cover matches what was displayed to the user? Sometimes, the attack workflow can modify cover. For example, the attacker may be able to ignore cover based on the type of attack. As this is only known at the time of attack, it is possible for cover to change at that time.

## Other
Other settings that affect the line-of-sight calculation.

<img width="699" alt="ATV Settings - Other" src="https://github.com/caewok/fvtt-token-visibility/assets/1267134/8cbc98d8-9dc7-4e67-b5d1-d23c0e6c2c9f">

Optionally, you can have live or dead tokens be treated as obstacles for the purposes of cover. Prone tokens can also optionally grant cover. For these settings to work, you must tell ATC what the prone status is for your system, and where to find the hit points attribute. (It is assumed that 0 or below means "dead" for purposes of defining dead tokens.)

The vision height multiplier allows you to change the height at which a viewing token observes the scene. Think of this as the height of the eyes of the token above the ground, as a percentage of the total token height.

Note that if Alternative Token Visibility is present, it will take over control of the multiplier and prone status.

## Ignoring Cover

A token can be set to ignore cover less than or equal to some amount. For example, a token set to ignore Medium cover (3/4 cover in DND5e) will also ignore Low cover (1/2 cover in DND5e). Tokens can be set to ignore cover for all attacks (all), or any of the following: melee weapon (mwak), ranged weapon (rwak), melee spell (msak), or ranged spell (rsak).

To set ignoring cover on a specific token, use, for example:
```js
api = game.modules.get('tokencover').api;
cover_type = api.COVER_TYPES;

_token.ignoresCoverType.all = cover_type.LOW;
_token.ignoresCoverType.rwak = cover_type.MEDIUM;

rangedWeaponIgnored = _token.ignoresCoverType.rwak;
```

For linked actors, these values will be set on the actor.

In dnd5e, tokens can also be set to ignore cover for all attacks using the Special Traits token configuration menu.

For Midiqol workflows, the special flags for sharpshooter and spell sniper will be checked when using `_token.ignoresCoverType` and during the midi workflow if cover checking is enabled in the midiqol attack workflow setting, described above.

# Cover Macro

A compendium macro, "Measure Cover" is provided to allow users to easily measure cover. Select one or more tokens and target one or more tokens. Cover will be measured for each token --> target combination and the results reported in a pop-up.

<img src="https://raw.githubusercontent.com/caewok/fvtt-token-cover/feature/screenshots/screenshots/settings-cover-macro.jpg" width="400" alt="Cover Macro for the Alt Token Visibility Module">

A second version of this macro, "Cover Debug Tester" temporarily enables the debug visibility so you can get a better sense of what the cover algorithm is detecting.

If a token is set to ignore cover, that information will be provided in the pop-up display. It is assumed the GM or user will than take that information into account as needed.

Feel free to message me in Discord if you have questions about specific methods.

# API

If you want specific cover effects or support for your system's attack workflow, please feel free to open a Git issue. Please include details about where I can find your system's rules regarding cover and, preferably, where I can go with questions about how the system works.

If you would like to modify or extend this module, the following may be helpful:
- You can access various classes at `game.modules.get("tokencover").api`.
- Some defined values are at `CONFIG.tokencover`.
- `CONFIG.tokencover.CoverEffect.coverObjectsMap` stores all active cover effects. Note that `CoverEffect` is a singleton class, with a single cover effect per id. Subclasses are used for some systems.
- Various methods for testing token cover are present on the token: `token.tokencover`. The `token.tokencover.coverCalculator` determines cover from the perspective of the token as the attacker. Methods like `token.tokencover.coverPercentFromAttacker` determine cover from the perspective of the token as defender.
