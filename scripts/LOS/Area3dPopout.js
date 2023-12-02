/* globals
Application,
PIXI
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Base folder
import { MODULE_ID } from "../const.js";

export const OPEN_POPOUTS = new Set();

export class Area3dPopout extends Application {

  #savedTop = null;

  #savedLeft = null;

  /** @type {PIXI.Application} */
  pixiApp;

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    const options = super.defaultOptions;

    // Default positioning
    // If width calc is necessary:
    // let h = window.innerHeight * 0.9,
    // w = Math.min(window.innerWidth * 0.9, 1200);
    // options.top = area3dPopoutData.savedTop;
    // options.left = area3dPopoutData.savedLeft;
    // Other possible options:
    // options.top = (window.innertop - this.h) / 2;
    // options.left = (window.innerleft - this.w) / 2;
    options.template = `modules/${MODULE_ID}/templates/area3d_popout.html`;
    options.popOut = true;
    options.minimizable = true;
    options.title ??= `${MODULE_ID} Debug`;
    return options;
  }

  getData(options = {}) {
    return { id: `${this.id}_canvas` };
  }

  /* -------------------------------------------- */

  /** @override */
  async _render(force=false, options={}) {
    await super._render(force, options);
    const pixiApp = this.pixiApp = new PIXI.Application({
      width: 400,
      height: 400,
      view: document.getElementById(`${this.id}_canvas`),
      backgroundColor: 0xD3D3D3
    });

    // Center of window should be 0,0
    pixiApp.stage.position.x = 200;  // 200 for width 400
    pixiApp.stage.position.y = 200;  // 200 for height 400

    // Scale to give a bit more room in the popout
    pixiApp.stage.scale.x = 1;
    pixiApp.stage.scale.y = 1;

    OPEN_POPOUTS.add(this);

    // Add pixi app
    // this.pixiApp = new PIXI.Application({
    // width: 400, height: 400, view: document.getElementById("area3dcanvas"), backgroundColor: 0xD3D3D3 });
    // this.pixiApp = new PIXI.Application({
    // width: 400, height: 400, view: document.getElementById("area3dcanvas"), backgroundColor: 0xD3D3D3 });

    return this;
  }


  //   /* -------------------------------------------- */
  /** @override */
  close() {
    this.#savedTop = this.position.top;
    this.#savedLeft = this.position.left;
    if ( !this.closing ) this.pixiApp?.destroy();
    super.close();
    OPEN_POPOUTS.delete(this);
  }
}

// Hooks.on("canvasReady", function() {
//   for ( const [key, obj] of Object.entries(AREA3D_POPOUTS) ) {
//     obj.app = new Area3dPopout({ title: `Area3d Debug: ${key}`, type: key });
//   }
// });

// Hooks.on("renderArea3dPopout", function(app, _html, _data) {
//   const id = `${app.options.id}_canvas`;
//   app.pixiApp = new PIXI.Application({width: 400, height: 400, view: document.getElementById(id), backgroundColor: 0xD3D3D3 });
//
//   // Center of window should be 0,0
//   app.pixiApp.stage.position.x = 200;  // 200 for width 400
//   app.pixiApp.stage.position.y = 200;  // 200 for height 400
//
//   // Scale to give a bit more room in the popout
//   app.pixiApp.stage.scale.x = 1;
//   app.pixiApp.stage.scale.y = 1;
// });

/* Testing
api = game.modules.get("tokenvisibility").api
Area3dPopout = api.Area3dPopout
popout = new Area3dPopout()
popout.render(true)

gr  = new PIXI.Graphics();
gr.beginFill(0x6200EE);
gr.lineStyle(3, 0xff0000);
gr.drawCircle(100, 100, 50);
gr.endFill();

popout.pixiApp.stage.addChild(gr)


class Popout extends Application {
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.popOut = true;
    options.id = "popout";
    options.template = `modules/tokenvisibility/templates/area3d_popout.html`;
    return options;
  }
}

app = new Popout()
app.render(true)

pixiApp = new PIXI.Application({width: 400, height: 400, view: document.getElementById("area3dcanvas")})

gr  = new PIXI.Graphics();
gr.beginFill(0x6200EE);
gr.lineStyle(3, 0xff0000);
gr.drawCircle(100, 100, 50);
gr.endFill();
pixiApp.stage.addChild(gr)

*/
