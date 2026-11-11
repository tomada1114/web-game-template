import * as Phaser from "phaser";

import { createSessionDay } from "./daily/daily.js";
import { selectPlatform } from "./platform/select.js";
import { BootScene } from "./scenes/BootScene.js";
import { PlayScene } from "./scenes/PlayScene.js";
import { ResultScene } from "./scenes/ResultScene.js";
import { TitleScene } from "./scenes/TitleScene.js";
import { colors, layout } from "./theme/tokens.js";

document.body.style.backgroundColor = colors.bg.css;

// init() never rejects: a portal SDK that fails or times out falls back to local itself.
const platform = await selectPlatform();
await platform.init();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: layout.designWidth,
  height: layout.designHeight,
  backgroundColor: colors.bg.css,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    new BootScene(platform),
    new TitleScene(
      platform,
      createSessionDay(() => new Date()),
    ),
    new PlayScene(platform),
    new ResultScene(platform),
  ],
});
