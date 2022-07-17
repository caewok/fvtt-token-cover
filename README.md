[![Version (latest)](https://img.shields.io/github/v/release/caewok/fvtt-token-visibility)](https://github.com/caewok/fvtt-token-visibility/releases/latest)
[![Foundry Version](https://img.shields.io/badge/dynamic/json.svg?url=https://github.com/caewok/fvtt-token-visibility/releases/latest/download/module.json&label=Foundry%20Version&query=$.compatibleCoreVersion&colorB=blueviolet)](https://github.com/caewok/fvtt-token-visibility/releases/latest)
[![License](https://img.shields.io/github/license/caewok/fvtt-token-visibility)](LICENSE)

# Alternative Token Visibility

This module replaces Foundry's default method of measuring visibility of tokens with a more precise, but (at times) more computationally expensive, method.

By measuring the precise token boundary and by considering intersecting walls, Alt Token Visibility prevents tokens from being seen in situations where they partially overlap a wall. Alt Token Visibility provides additional customizations to control when partially obscured tokens can be seen.

# Installation

Add this [Manifest URL](https://github.com/caewok/fvtt-token-visibility/releases/latest/download/module.json) in Foundry to install.

## Dependencies
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)

## Known conflicts
None yet! Feel free to file an issue if/when you find one!

# Methodology
Base Foundry calculates token (and other object) visibility by considering 9 points arranged around the token: the center point plus 8 points spaced out in a rectangular shape.

<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/token_dots.jpg" width="200" alt="9 red dots inside a large token square">

Alt Token Visibility instead considers the whole token shape—the orange outline in the above image.

# Settings

The GM can change the percent area required for a token to be visibile, and change how large the token boundary appears for purposes of the visibility test.

<img src="https://raw.githubusercontent.com/caewok/fvtt-token-visibility/feature/screenshots/screenshots/settings.jpg" width="400" alt="Settings for the Alt Token Visibility Module">

Currently, Percent Token Size and Percent Token Area are GM world settings only. Please submit an issue in this Github if you have a use case that would warrant a more nuanced approach.

## Percent Token Size
Width and height of the token boundary are multiplied by the Token Size Percentage to determine the initial boundary shape of the token.

The token boundary is the orange rectangle in the above image of the token with the dots. In that example, the token image goes beyond the boundary—the toes and the snout. If you wanted those to count, you might increase the Token Size Percentage to 1.1. Decreasing Token Size Percentage below 1 would "shrink" the token boundary accordingly—meaning that a token that sticks out only slightly from a wall is less likely to be visible.

## Percent Token Area

Token Area indicates how much of the token must be viewable to be seen. Note that the area is calculated as a percentage based on the total area of the token that **could** be seen. Thus, if a token has an area of 100 but partially overlaps a wall such that 75% of the token rectangle is viewable, then the token only has an area of 75 for purposes of this calculation.

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

# API

The API for this module exposes two functions that other modules and macro creators may find useful. Access both functions by calling the api:

```js
api = game.modules.get('tokenvisibility').api;
api.objectHasCoverFromToken;
api.objectIsVisible;
```

## objectHasCoverFromToken

`objectHasCoverFromToken` assumes that the token provided has field-of-vision to the object and only tests if there is line-of-sight. By changing the `percentArea` option, one can approximate cover rules for different systems.

```js
/**
 * Test if a token has cover with regard to another token by checking the vision of
 * the first. Assumes FOV and just tests for LOS to the object.
 * @param {Token} token
 * @param {Token|Object}
 *
 * @param {Object} [options]               Additional options which modify visibility testing.
 * @param {number} [options.percentArea]   Percent of the token that must be visible to count.
 * @param {number} [options.boundsScale]   Scale the bounds of the token before considering visibility.
 *
 * @returns {boolean} True if object is visible
 */
export function objectHasCoverFromToken(token, object, {
  percentArea = getSetting(SETTINGS.PERCENT_AREA),
  boundsScale = getSetting(SETTINGS.BOUNDS_SCALE) } = {})
```

## objectIsVisible

`objectIsVisible` is the function used in place of Foundry's default `testVisibility` for tokens.

```js
/**
 * Test if an object is visible from a given token.
 * Useful for checking visibility for cover under various limits.
 * Separately checks for line-of-sight and field-of-view.
 * @param {PointSource} source
 * @param {Token}       token
 *
 * @param {Object} [options]                        Additional options which modify visibility testing.
 * @param {boolean} [options.hasFOV]                Assume that the token has unlimited field of vision?
 * @param {number} [options.percentArea]            Percent of the token that must be visible to count.
 * @param {number} [options.boundsScale]            Scale the bounds of the token before considering visibility.
 * @param {VisionSource[]} [options.visionSources]  Sources of vision to test
 * @param {LightSource[]} [options.lightSources]    Sources of light to test
 *
 * @returns {boolean} True if object is visible
 */
export function objectIsVisible(point, object, {
  hasFOV = canvas.scene.globalLight,
  percentArea = getSetting(SETTINGS.PERCENT_AREA),
  boundsScale = getSetting(SETTINGS.BOUNDS_SCALE),
  visionSources = canvas.effects.visionSources,
  lightSources = canvas.effects.lightSources } = {})
```

# Performance

Depending on settings and scene layout, Alternative Token Visibility may be faster or slower than the default Foundry approach. (The default Foundry approach is already very fast, so the speed improvement, if any, is minimal.) It is usually slower.

Setting area = 0 tends to be a bit faster than other area settings. When area is set to less than or equal to 50%, calculations for visible tokens tend to be faster. When area is set to greater than 50%, calculations for non-visible tokens tend to be faster. When a token partially overlaps a wall, Alt Token Visibility must re-construct the visible shape, which is slow.

You can test performance on a given scene by selecting a token on the scene and running the following code in the console. This will test whether the selected token can see every other token in the scene for a variety of area settings.

```js
api = game.modules.get('tokenvisibility').api;
api.bench.benchTokenVisibility()
```
