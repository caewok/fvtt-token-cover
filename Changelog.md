## 0.9.3
### New Features
Added a toggle to enable cover measurement for templates. When enabled, hovering over a template will display cover for tokens. (Note that it currently does not test for whether the token is within the template area.) Closes #14.
When midi-qol module is active, a dropdown in the spell effects lets you apply cover to tokens from the template or from the caster when casting spells.

### Bug fixes
Remove specialized handling of DFred's cover effects. Instead, you can now drag DFred's effects to the Cover Book to create new cover effects. Closes #31, #30, #29.
Correct errors with provided macros when Walled Templates is active. Closes #27.
Added Russian translation. Thanks @VirusNik21! Closes #28.
Update libGeometry to v0.3.12.

## 0.9.2
Fix git workflow to include the json folder in the module zip. Closes issue #26.
Make reference to "settings.js" lowercase. Closes issue #25.

## 0.9.1

### New Features
Added a "Set Cover" region behavior. The GM can define a minimum cover that will be applied by that region. Defenders within that region gain at least that minimum cover (but may still gain greater cover due to walls, etc.) Options in Set Cover:
- Set a minimum distance, below which the minimum cover will not apply.
- Apply the cover to defenders outside the region if the attacker is within the region.
- Disable all other cover calculations within the region.

### Bug fixes / refactor
Substantial refactor of internal classes used to apply cover effects, borrowing from Terrain Mapper code.
Modified how default example covers are handled. For AE, default examples are stored in JSONs exported from cover objects. For item cover, like pf2e, still stored in compendium but simplified import.

## 0.9.0
Compatibility with FoundryVTT v12. Requires v12; use the v0.8 series if you are on v11.
Fixes application of cover items in pf2e. This fix may improve application of cover effects in dnd5e and other systems.

## 0.8.2
Remove call to `values().map` which does not work in some browsers.

## 0.8.1
Fix for cover not getting applied for tokens behind other tokens. Closes #24. In part to fix this, token cover settings moved to the cover rules for specific cover effects. So now a specific cover effect can be applied based on cover from live/dead/prone tokens.
Fix for new cover effect creation failing.
Fix for duplicate half cover effect appearing when DFred's CE is active.

## 0.8.0
Consolidated "Cover Type" and "Cover Effect" into simply "Cover Effect." A Cover Effect is an item or active effect that represents a type of cover. The rules previously in Cover Type are now flags on the Cover Effect. In some systems, the GM can edit these rules directly from the Active Effect config window. Otherwise, in the Cover Book, right-click on a Cover Effect and select "Edit Cover Rules." (Because I cannot override config templates for every system.)

All settings are now controlled by the GM.

Added a toggle to "Only Use Cover Icons." This will disable application of all cover effect items or active effects. Instead, flags are used to track cover on each token and only the token status icons are changed. This allows cover icons to work in systems (like PF2e) where application of items/active effects is unsupported.

When debugging cover with multiple view points, the debug should now display cover from the "best" point from point of view of the attacker. (Before, why the point was chosen was not easily discernable.)

## 0.7.5
Bug fixes. Avoid error if destroyed token does not have geometry data to destroy. Remove call to `_coverAlgorithmChanged`, which does not exist anymore. Remove statuses before applying cover effects to avoid duplication with the cover type icons. Fix module settings appearing in multiple tabs for the active effect config.

## 0.7.4
Bug fixes to attack workflow to address undefined method and handle updated cover types and effects application. Workflow now considers whether there were changes compared to the current cover types displayed on each target. Workflow now recognizes when GM has applied an override cover effect to a target.

Fix resetting to PF2e defaults in settings. Closes issue #19.

## 0.7.3
Improvements to speed by smarter caching to limit how often the cover calculation is updated and token cover icons/effects are applied during token movement. Enable settings cache for retrieving settings values.

When displaying cover during a token drag, use the snapped position of the token unless shift is held (or on gridless map). Thanks @aedif for the suggestion!

Dragging cover effects to a token will now be considered an override of the calculated cover. Thus, if the GM manually applies a cover effect (or DFred's cover) to a token, that token will continue to have that cover.

New settings: toggle display of cover book (closes issue #21) and toggle display of cover icons on secret tokens.

## 0.7.2
Bug fixes. Don't use map/filter/reduce with iterators b/c that is only supported with some browsers.

## 0.7.1
Bug fixes. Catch if module has not yet been initialized when the `TokenDocument.prototype._initialize` method is called. Ensure the desired CoverType class is initialized. Avoid error when map inadvertently modifies a Set.

## 0.7.0

Big refactor of how token cover is defined and applied.

CoverType and CoverEffect. CoverTypes are rules for applying cover, and control the icon that displays cover for a given token. CoverEffects are system-dependent active effects or items that are added to the token when the token has cover.

Local Application. Each user will see cover icons on tokens specific to the user, and cover effects are applied locally. This is dramatically faster, because there is no storage/retrieval from the document database. This also allows different users to see different things. For example, each user that selects a token might see the cover icons applied to all other enemy tokens within view—these icons are specific to each respective user's current token selection.

System compatibility. Items and Active Effects are both supported as cover effects. Thus, pf2e is now supported, and other systems should be easier to support.

DFred's Convenient Effects. If DFred's is active, the DFred's cover effects will be used.

Configurability. Cover types and cover effects can be added/deleted/modified by the GM. There is now a "Token Cover Book" in the token controls that can be used to change cover types and effects.

WARNING: While the underlying cover algorithms have not changed, this still represents a big update in terms of changes in settings and user-facing workflow. There will be bugs!

## 0.6.5

### New Feature

Add dropdown menu in token configuration to force the token to grant less than full cover. For example, ghosts might grant no cover; swarms may grant at most half cover. `tokencover.maximumCoverGrant` is the flag for this. Closes issue #12.

### Bug Fixes

Fix for token cover pop-up appearing even when set to only appear when the target cover differs from the current measured cover. Closes issue #16.
Fix for cover effect getting duplicated in `CONFIG.statusEffects` after low/medium/high cover gets configured in the settings.
Correct erroneous references to `tokenvisibility`.
Fix for token cover settings not being respected in some situations. Closes issue #11.
Pad potentially blocking token shapes by -2 pixels to avoid incorrectly labeling adjacent tokens as blocking. Closes issue #17.
Various fixes imported from ATV related to constrained token borders failing to be created properly.
Fix for Rideable module breaking cover measurements. Closes issue #18.
Only test for cover in dnd5e `rollAttack` workflow if the attack type is melee/ranged weapon or spell attack. Closes issue #15.
Don't treat tokens as blocking if they overlap the viewer or target.

Update lib geometry to v0.2.16.

## 0.6.4
Ignore riders and mounts if Rideable module is present for purposes of blocking vision.

## 0.6.3
Improve compatibility between Alternative Token Cover and Alternative Token Visibility. Closes issue #7.
Possible fix for issue #8 (`targetShapes.map` error).
Exclude the original token from the cover calculation of a dragged token. Closes issue #9.
Remove messages re "one viewablePoint." Closes issue #10.
Update the macro compendium.
Update lib geometry to v0.2.13.

## 0.6.2
Remove migration code, which has outlived its usefulness. Closes issue #6.
Catch if the algorithm setting is not defined or misdefined from an old version. Closes issue #5.
Fix documentation and reporting buttons appearing in multiple filters. Closes issue #2.
Fix error when updating a wall.

## 0.6.1
Update lib geometry to v0.2.12. Backend updates to settings and patch handling.

## 0.6.0
Split Alternative Token Visibility from Alternative Token Cover. This module handles token cover only. All vision-related features left in ATV.
- Refactor and reuse ATV code in ATC code.
- Use a submenu to organize and display most cover settings.
- Use the GM to monitor user targeting and update cover accordingly, instead of starting the update on the user side. This may help with latency issues when targeting in combat.
- Introduce new permutations of viewer/target cover testing that mirror ATV's approach.

Refactor the settings menu. Split viewer from target settings. Add two and three-point settings. Allow multiple viewer points to be used with Area2d and Area3d. Handle tile transparency with Area3d algorithm. A lot of backend work on patches and cover calculator.

## 0.5.8
- Correctly ignore tokens if the token cover settings do not consider tokens to be cover. Closes issue #58.

## 0.5.7
- Fix for midiqol workflow not triggering.
- Fix for some "id not found" errors when deleting active effects.

## 0.5.6
- Fix for Levels incompatibility error on startup. Closes issue #54.

## 0.5.5
- Slightly inset the token shape to avoid triggering cover when the cover line hits only the exact corner of a token square. Closes issue #49.
- Fix typo in `module.json` that prevented Starfinder cover items from loading. Closes issue #53.
- Add checks for when `actor.statuses` is undefined. Closes issue #52.
- Fix occasional error when tokens have limited angle vision. Closes issue #48.
- Update geometry lib to v0.2.9.

## 0.5.4
- Fixes to how cover status data id is handled. Switch from label to name to accommodate Foundry change. Migrate old cover status data objects.
- Better tests to prevent multiple cover statuses on a single token.
- Improve compatibility with DFred's Convenient Effects. Use DFred's total cover status.
- Added a CoverDialog class to handle various user dialogs.
- Change cover macros to only accept a single token from which to test cover, for simplicity.
- Add setting to use or ignore token for cover when token is prone. Closes issue #46.
- Add workflow option to notify user of cover calculations, and allow the user confirm/cancel only. Closes issue #45. Allow workflow to be used with dnd5e even without midiqol (workflow triggered on item attack roll).
- Add LOS option to use corners-->corners to measure token visibility. Closes issue #44.
- Added support for Starfinder RPG. Cover is added using items from the Compendium. Items with the flag `tokenvisibility.cover` are assumed to be cover, and the item folder for the system is checked before pulling from the compendium. Closes issue #43.
- Update geometry lib to v0.2.7.

### ### 0.5.3
Fix the possibly borked v0.5.1 and v0.5.2. (Amazing what a stray ";" can do!)

## 0.5.2
Update geometry lib to v0.2.2.

## 0.5.1
Update geometry lib to v0.2.1. Handle token prone and token height using geometry lib elevation getters.

## 0.5.0
Updated for Foundry v11. Update geometry lib to v0.2.0.

## 0.4.6
- Fix how token height was calculated in some situations.

## 0.4.5
- Fix for issue #40 (error with Area2d).
- Fix for issue #39 (failure to detect token cover using center to center in PF2e)

## 0.4.4
- Update to lib geometry v0.1.5.
- Possible fix for issue #33 (null error reading "length").
- Keep the high cover setting even when using DFred's (closes issue #31).
- Add setting for dnd5e 1/2 cover for tokens. Tokens in this setting will not contribute to cover, except that if tokens block they cause 1/2 cover at minimum. For area3d, token must block ≥ low cover area. Closes issue #30.
- Add setting to set token heights to half if the token is prone. Works for either live or dead tokens. The dead tokens are half-height setting is removed in favor of using prone status. This simplifies code dealing with half-height tokens.
- Fix for Area3d algorithm when testing a wall that does not reach the height of the token.
- Add changelog dialog on first load.

## 0.4.3
Update to lib geometry v0.1.4.

## 0.4.2
Update to lib geometry v0.1.3.

## 0.4.1
Area2d algorithm improvements:
- Fix area calculation when token shape is split in half by a wall
- Handle holes in the area calculation

Area3d algorithm improvements:
- Fix some errors in `constructFromWall` thrown when using Levels.
- Possible fix for issue #33 (getting length from null object in `Area3d.visionPolygon`).

## 0.4.0
Partial re-write of how the Area3d algorithm works, to better handle objects adjacent to the target. Might be a bit faster in some situations, as it devotes more effort to removing unneeded walls earlier.

Additional fixes for measuring cover using 2d area calculation when tokens block (#27).
Improvements to the 3d wall-intersection test (issues #24 and #25).
Better handling of terrain walls when they intersect a token shape for area3d.
Incorporate changes to improve Perfect Vision compatibility (thanks @dev7355608!) (issues #9, #17, #18).
Potential fix for `constrainedTokenBorder.toPolygon` error (issues #4 and #28).

## 0.3.8
Add token shapes to the 3d area calculation (issue #27)
Fixes for measuring cover using the 2d area calculation when tokens block.

## 0.3.7
Use a shared geometry submodule (issue #20).
Fix conflict with Force Client Settings (issue #23).
Fix for Dfred's cover getting applied repeatedly on the same token (issue #26).

## 0.3.6
Compatibility with DFred's Convenient Effects -- uses DFred 1/2 and 3/4 cover when that module is active. (Closes issue #12.)

## 0.3.5
Compatibility with Levels v3.5.7 (Fixes issues #19 and 13).
Light sources that grant visibility now respect the points algorithm setting for LOS. Fixes issue #16.
Catch when the range is less or equal to zero for testing visibility. Fixes issue #15 and aligns with [Foundry issue #8505](https://github.com/foundryvtt/foundryvtt/issues/8505).

## 0.3.4
Reset the settings cache when changing a setting value. Also fixes the welcome pop-up to avoid it repeating.

## 0.3.3
- Change name of property to token.ignoresCoverType to avoid naming conflict with Simbul's Cover Calculator. Fixes issue #11.
- Check if tests exist for testing range visibility. Possible fix to issue #10.
- Catch when spell sniper or sharpshooter flags don't exist, to avoid an error being thrown.

## 0.3.2
Use different technique to hide settings submenus when different algorithms are chosen, which should reduce weirdness in the settings menu.

Fix error when getting average token elevation.

Use an IgnoreCover class that can be different for different systems, and split ignoring cover into all, mwak, msak, rwak, and rsak. Allows for Spell Sniper and Sharpshooter designations using midi. Closes issue #8.

Add handling of limited angle vision for Area3d algorithm (closes issue #4).

## 0.3.1
Fix issue #7 (Welcome message).

## 0.3.0

*New Features*
- Use "move" wall restriction for cover, which more closely corresponds to typical physics for cover. Note that limited move walls (terrain walls) are possible, which would provide cover beyond the first wall.
- Consider tiles for visibility and cover if Levels module is active.
  - For Points or Area2d algorithms, transparent tile pixels are ignored.
  - For Area3d algorithm, drawings can be used to create holes in tiles. See Drawing config to set an ellipse, polygon, or rectangle as a hole.
- Add ability for tokens to ignore cover. (Closes issue #3.)
  - DND5e: Add an actor special feat menu to ignore certain levels of cover. This is the same as, and compatible with, Simbul's Cover Calculator. The flag `dnd5e.helpersIgnoreCover` stores this value.
  - Non-DND5e: Adds a flag, `tokenvisibility.ignoreCover`
  - Can set whether a token ignores cover using the `token.ignoresCover` property.
- Add "Cover Debug Tester" macro that turns on visualization of the cover algorithm.
- Add setting to count live tokens as cover
- Add setting to count dead tokens as cover or count half the height of dead tokens as cover. (Closes issue #2.)

*Bug Fixes*
- Fix for area algorithms where viewer and target tokens overlap.
- Improved handling of visibility and cover when Levels is active.
- Address issue #6 (warning message re los mapping)
- Possible fix for issue #5 (wall is over the tokens)
- Possible fix for issue #4 (tokens visible beyond LOS range)
- Improved handling of terrain walls for Area3d algorithm.

*Code improvements*
- Refactor the 3d points representation for Foundry tokens, tiles, drawings, walls.
- Add handling for terrain walls for Area3d algorithm.
- Add handling for tiles for Area3d algorithm.
- Add handling for tokens for Area3d algorithm.
- Add settings for using tokens (live or dead) for cover (all algorithms).
- Add tile handling for cover points algorithms. Transparent tile pixels do not provide cover, as expected for Levels holes.
- Improved handling of perspective transform for different Foundry objects.
- Cache the LOS value for a given point as is done in base Foundry.
- Cache settings

## 0.2.1
Fix for `_hasLOS` not initialized error, which occurs sometimes with Levels installed.

## 0.2.0
Revamp Range settings:
- Choice of single point, 5 points, or 9 points (Foundry default)
- Toggle to add additional "3d" points to measure token height and token elevation
- Toggle to perform 3d range distance measurements

Revamp Line-of-sight settings:
- Choice of points (same as number of range points), area2d, or area3d.
- For area2d and area3d, select percentage area that counts for visible
- New area3d measures based on the token ("viewer") perspective, looking directly at the target in 3d space

Add Cover calculations with settings:
- Customizable low, medium, high cover active effects and names.
- Status conditions for low, medium, high cover for those effects.
- Various options on calculating cover based on token or target corners or centers.
- Options to use the same area2d or area3d algorithms used by LOS.
- Toggle to display cover results to chat when targeting tokens for an attack.
- Options for handling cover check with midiqol.

Fixes to improve compatibility with Perfect Vision and Levels.

## 0.1.3
Fix issue #1 (Area vision failing when area === 0).

## 0.1.2
Updates for compatibility with Foundry v10.286.

## 0.1.1
Update name to better distinguish from core Foundry functionality.

## 0.1
Initial release.

Calculate token visibility using actual token boundaries.
Settings to test visibility by percent area and to adjust the boundary size used for visibility.

Add API methods to allow testing for cover and testing for visibility.

## 0.0.1-alpha1
Initial release for testing.
