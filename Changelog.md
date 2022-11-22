# 0.3.2
Use different technique to hide settings submenus when different algorithms are chosen, which should reduce weirdness in the settings menu.

Fix error when getting average token elevation.

Use an IgnoreCover class that can be different for different systems, and split ignoring cover into all, mwak, msak, rwak, and rsak. Allows for Spell Sniper and Sharpshooter designations using midi. Closes issue #8.

Add handling of limited angle vision for Area3d algorithm (closes issue #4).

# 0.3.1
Fix issue #7 (Welcome message).

# 0.3.0

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

# 0.2.1
Fix for `_hasLOS` not initialized error, which occurs sometimes with Levels installed.

# 0.2.0
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

# 0.1.3
Fix issue #1 (Area vision failing when area === 0).

# 0.1.2
Updates for compatibility with Foundry v10.286.

# 0.1.1
Update name to better distinguish from core Foundry functionality.

# 0.1
Initial release.

Calculate token visibility using actual token boundaries.
Settings to test visibility by percent area and to adjust the boundary size used for visibility.

Add API methods to allow testing for cover and testing for visibility.

# 0.0.1-alpha1
Initial release for testing.
