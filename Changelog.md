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
