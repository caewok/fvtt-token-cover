/* globals
canvas,
ChatMessage,
game,
*/
"use strict";

/* Cover options

1. Center to Center -- PF2e
Measure center of token to center of target

2.


/* Cover testing types:
1. Center to 4 Corners -- from the center point of the token to 4 corners
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
2. Corner to Four Corner -- DMG rules; vision from each occupied grid point
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
3. Center to Center -- PF2e version
3/4 (standard)
4. Area
Half trigger: % area
3/4 trigger: % area
full trigger: % area

3D versions ( same triggers )
5. Center to cube corners
6. Cube corner to cube corners
7. 3d Area


Other settings:
GM can provide the name of an active effect to apply when covered. Applies to the token with cover.
- low active effect
- medium active effect
- high active effect

Cover Names:
Generic: low, medium, high
PF2e: lesser, standard, greater
dnd5e: half, 3/4, full

*/

import { COVER, MODULE_ID } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { CoverDialog } from "./CoverDialog.js";


/**
 * Workflow to process cover for given token and targets.
 * Used by midi-qol and dnd5e functions.
 * @param {Token} token
 * @param {Set<Token>} targets    Targeted token set. May be modified by user choices.
 * @param {string} actionType
 * @returns {boolean} True if attack should continue; false otherwise.
 */
export async function coverWorkflow(token, targets, actionType) {
  // Construct dialogs, if applicable
  // tokenCoverCalculations will be:
  // - false if user canceled
  // - undefined if covercheck is set to NONE. NONE may still require chat display.
  // - Map otherwise
  const coverDialog = new CoverDialog(token, targets);
  const coverCalculations = await coverDialog.workflow(actionType);
  if ( coverCalculations === false ) return false;  // User canceled

  // Check if the user removed one or more targets.
  if ( coverCalculations && coverCalculations.size !== coverDialog.coverCalculations.size ) {
    if ( !coverCalculations.size ) return false; // All targets removed.

    // Drop the removed targets.
    const removed = coverDialog.targets.difference(new Set(coverCalculations.keys()));
    removed.forEach(t => targets.delete(t));
  }

  // Update targets' cover if some targets are present
  if ( coverCalculations && coverCalculations.size ) {
    await coverDialog.updateTargetsCover(coverCalculations);
  }

  // Display in chat if requested.
  let displayChat = getSetting(SETTINGS.COVER.CHAT);
  if ( displayChat && getSetting(SETTINGS.COVER.MIDIQOL.COVERCHECK_IF_CHANGED) ) {
    // Only display chat if the cover differs from what is already applied to tokens.
    displayChat = !coverDialog._targetCoversMatchCalculations(coverCalculations);
  }

  if ( displayChat ) {
    const opts = {
      actionType,
      coverCalculations
    };
    await coverDialog.sendCoverCalculationsToChat(opts);
  }

  return true;
}

/* Options for determining cover.
1. Any player can run the Cover macro to determine cover for each token--> target combo.

If no combat:
- selecting a single token and then targeting 1+ will impose status effects.
- selecting multiple tokens will remove status effects?

If combat:
- Cover switches to only the current user.
- cover calculated like the no combat scenario otherwise.
- cover calculated for the

Can manually set cover status but it will only last until targets change...
Provide setting for manual only
*/

/* System-specific cover

DND5e. Base system

On attack:
- Chat message displaying cover of targeted tokens

*/
