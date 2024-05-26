/* globals
Hooks,
game,
showdown,
Dialog
*/
"use strict";

import { MODULE_ID, DOCUMENTATION_URL } from "./const.js";
import { Settings } from "./settings.js";

// From Perfect Vision
// https://github.com/dev7355608/perfect-vision/blob/cdf03ae7e4b5969efaee8e742bf9dd11d18ba8b7/scripts/changelog.js


Hooks.once("ready", () => {
  if (!game.user.isGM) {
    return;
  }

  game.settings.register(
    MODULE_ID,
    Settings.KEYS.CHANGELOG,
    {
      scope: "client",
      config: false,
      type: Number,
      default: 0
    }
  );

  new ChangelogBuilder()
    .addEntry({
      version: "0.4.4",
      title: "Prone and dnd5e token cover",
      body: `\
          - **Prone status:** Added a setting to allow the GM to identify a "prone" status for tokens.
            Tokens with the prone status will be treated as half-height for vision and cover.
            As a result, there is not longer a separate dead token setting for half height cover.
            Setting dead tokens to prone will cause them to be treated as half-height.
          - **dnd5e cover:** Added option to treat tokens as providing a maximum of low (half) cover.
            Under this option, tokens will not otherwise contribute to cover. For area algorithms,
            the token must provide at least low cover to count for cover.
          - **Updated Settings:** Settings have been updated accordingly.
            You may need to update your preferred default settings accordingly.`
    })

    .addEntry({
      version: "0.5.4",
      title: "DFred's compatibility and new features",
      body: `\
          - **DFred's:** If DFred's Convenient Effects module is loaded, all three cover effects from DFred's
            (half, three-quarters, total) will be used instead of this module's defaults. Requires
            DFred's version 5.1.1.
          - **Macros:** Existing macros were improved and new macros added. If you were previously using
            the Alternative Token Visibility macros, you will need to reinstall them from the compendium.
            Added a Set Cover macro to allow the user to confirm or change cover choices and apply
            the active effects for the chosen cover(s) for targets. Added a Vision Debug that
            displays debug lines similar to the Cover Debug Tester.
          - **Ignore Prone:** New setting will ignore prone tokens for purposes of cover.
          - **Modified Cover Workflow:** You can now choose to have a dialog appear for the GM or the
            user when the attack button is used for an item. Previously, this workflow was limited to
            when the midiqol module was present.
          - **New Vision Option:** You can now select "Corner to Corner" as a line-of-sight vision option.
            This will allow tokens to be seen by other tokens if the corner of a token has line-of-sight to
            the corner of another token, which mimics the dnd5e DMG rule. This is equivalent to the corner-to-corner
            cover option.`
    })

    .addEntry({
      version: "0.6.0",
      title: "Welcome to Token Cover!",
      body: `\
          To simplify the module and improve debugging, I have split out token cover from
          token visibility. There are now two modules: [Alternative Token Visibility](https://github.com/caewok/fvtt-token-visibility) and
          [Alternative Token Cover](https://github.com/caewok/fvtt-token-cover). You can use one module without
          the other, or both in combination.

          - **Refactored Settings:** New settings configuration submenu and reorganized settings. Sorry, I did not attempt
            to transfer over your old settings! Many settings have changed so you will want to review anew.
          - **Revised Area3d Algorithm:** Area3d and Points algorithms both now handle handle transparent tiles. Area3d will
            automatically switch to webGL to render a 3d view with tiles when necessary to determine cover.
          `
    })

    .addEntry({
      version: "0.6.5",
      title: "Per-Token Maximum Cover",
      body: `\
        I have added a dropdown menu in the token configuration to force the token to grant less than total cover.
        If changed to something less than "total cover," when only the token is blocking, it will grant cover to the
        target that does not exceed this setting. For example, you could set ghosts to grant no cover; swarms might grant at most half cover.

        Contributions to cover from multiple tokens are prorated based on the total token contribution to cover. Thus,
        the presence of walls or other token obstacles still may result in higher cover than this setting.

        When set, a flag, "tokencover.maximumCoverGrant," is added to the token's flags.
      `
    })

     .addEntry({
      version: "0.7.0",
      title: "Per-User Cover",
      body: `\
        Big interface changes! Cover is now applied locally, per-user. Select one or more
        tokens to be "attackers" and the other tokens will have cover displayed, depending on your settings.
        Each user can decide if they want cover icons to display on tokens all the time or during combat only.
        Optionally display cover only when targeting. Cover icons will display for that user only.

        Cover effects are also applied only locally, resulting in big performance boost and hopefully less confusion.
        Magically, this still lets the cover effects

        There is a new Alt. Token Cover book in the GM token controls that allows the GM to define or edit cover
        effects and, optionally, the underlying rules ("cover types") that determine what effects should apply.

        Displaying cover now works in pf2e. Applying the actual cover effects still needs a bit of work, unfortunately.

        Check out the Git documentation for more details. Report any bugs (and there will be bugs) by opening a Git issue.
      `
    })

    .addEntry({
      version: "0.7.3",
      title: "Speed",
      body: `\
        This version should increase performance of displaying cover icons and applying cover effects. See discussion of
        performance in the Github for this module.

        New settings!
        - Display cover book. Choose whether to display the cover book in the token controls.
        - Display cover icons on secret tokens.

        Cover is now calculated from the snapped position of the token when dragging, unless shift is held.

        Dragging a cover effect (or a DFred's cover) is now considered an "override" that stops other cover icons or effects
        from being added to the token.
      `
    })

    .addEntry({
      version: "0.8.0",
      title: "Consolidation",
      body: `\
        Consolidated "Cover Type" and "Cover Effect" into simply "Cover Effect." A Cover Effect is an
        item or active effect that represents a type of cover. The rules previously in Cover Type are
        now flags on the Cover Effect. In some systems, the GM can edit these rules directly from the Active Effect
        config window. Otherwise, in the Cover Book, right-click on a Cover Effect and select "Edit Cover Rules."

        Cover icons now generally appear whenever the cover effect is applied, and you can determine when
        to apply cover effects in the GM Cover Settings.

        I added a toggle in settings to "Only Use Cover Icons." This will disable application of all cover effect items
        or active effects. Only status icons will be added to tokens (as well as flags on the token document.)
        This allows cover icons to work in systems (like PF2e) where application of items/active effects is unsupported.
      `
    })

    .addEntry({
      version: "0.8.1",
      title: "Token Half-Cover",
      body: `\
        I removed the settings concerning applying cover for live/dead/prone tokens. You can now find these
        in the configuration for each cover effect. (Open any effect in the Cover Book.)

        In the default dnd5e cover effects, the Half (Token Only) cover effect applies half cover based solely on
        whether intervening tokens provide cover. The default is that live or live prone tokens block,
        but not dead tokens. You can change that in the Half (Token Only) configuration.

        This change means it is possible to apply a specific cover effect when, say, dead tokens
        provide cover versus when live tokens provide cover.
      `
    })

    .build()
    ?.render(true);
});


/**
 * Display a dialog with changes; store changes as entries.
 */
class ChangelogBuilder {
  #entries = [];

  addEntry({ version, title = "", body }) {
    this.#entries.push({ version, title, body });
    return this;
  }

  build() {
    const converter = new showdown.Converter();
    const curr = Settings.get(Settings.KEYS.CHANGELOG);
    const next = this.#entries.length;
    let content = "";

    if (curr >= next) {
      return;
    }

    for (let [index, { version, title, body }] of this.#entries.entries()) {
      let entry = `<strong>v${version}</strong>${title ? ": " + title : ""}`;

      if (index < curr) {
        entry = `<summary>${entry}</summary>`;
      } else {
        entry = `<h3>${entry}</h3>`;
      }

      let indentation = 0;

      while (body[indentation] === " ") indentation++;

      if (indentation) {
        body = body.replace(new RegExp(`^ {0,${indentation}}`, "gm"), "");
      }

      entry += converter.makeHtml(body);

      if (index < curr) {
        entry = `<details>${entry}</details><hr>`;
      } else if (index === curr) {
        entry += "<hr><hr>";
      }

      content = entry + content;
    }

    return new Dialog({
      title: "Alt Token Cover: Changelog",
      content,
      buttons: {
        view_documentation: {
          icon: "<i class='fas fa-book'></i>",
          label: "View documentation",
          callback: () => window.open(DOCUMENTATION_URL)
        },
        dont_show_again: {
          icon: "<i class='fas fa-times'></i>",
          label: "Don't show again",
          callback: () => Settings.set(Settings.KEYS.CHANGELOG, next)
        }
      },
      default: "dont_show_again"
    });
  }
}
