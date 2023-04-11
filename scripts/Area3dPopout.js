/* globals
Application
*/
"use strict";

import { MODULE_ID } from "./const.js";

// const area3dpopout_data = {
//   hooked: false,
//   shown: false,
//   savedTop: null,
//   savedLeft: null
// };

export class Area3dPopout extends Application {

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    const options = super.defaultOptions;

    // Default positioning
    // let h = window.innerHeight * 0.9,
    // w = Math.min(window.innerWidth * 0.9, 1200);
    // options.top = area3dpopout_data.savedTop;
//     options.left = area3dpopout_data.savedLeft;
    // options.top = (window.innertop - this.h) / 2;
    // options.left = (window.innerleft - this.w) / 2;
    options.id = "area3dpopout";
    options.template = `modules/${MODULE_ID}/templates/area3d_popout.html`;
    options.popOut = true;
    options.minimizable = true;
    return options;
  }

  /* -------------------------------------------- */

  /** @override */
  render(force=false, options={}) {
    super.render(force, options);

    // Add pixi app
    //this.pixiApp = new PIXI.Application({width: 400, height: 400, view: document.getElementById("area3dcanvas"), backgroundColor: 0xD3D3D3 });
    // this.pixiApp = new PIXI.Application({width: 400, height: 400, view: document.getElementById("area3dcanvas"), backgroundColor: 0xD3D3D3 });

    return this;
  }


  //   /* -------------------------------------------- */
  /** @override */
  close() {
//     area3dpopout_data.shown = false;
//     area3dpopout_data.savedTop = this.position.top;
//     area3dpopout_data.savedLeft = this.position.left;
    super.close();
  }
}

Hooks.on("renderArea3dPopout", function(app, html, data) {
  app.pixiApp = new PIXI.Application({width: 400, height: 400, view: document.getElementById("area3dcanvas"), backgroundColor: 0xD3D3D3 });
});

/*

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
