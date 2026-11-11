import * as Phaser from "phaser";

import { GAME_TITLE } from "../game-info.js";
import { type Platform } from "../platform/platform.js";
import { colors, layout, radius, type } from "../theme/tokens.js";
import { moveFocus } from "../view/board-view.js";

import { SceneKey, practiceSeed, type PlayData } from "./keys.js";
import {
  FocusRing,
  addButton,
  addPanel,
  addText,
  fadeIn,
  fadeTo,
  type Button,
} from "./ui.js";

/** The game's name, the Practice button and one line of how to play. */
export class TitleScene extends Phaser.Scene {
  private loadingStopped = false;
  private leaving = false;

  private readonly platform: Platform;

  constructor(platform: Platform) {
    super(SceneKey.title);
    this.platform = platform;
  }

  create(): void {
    this.leaving = false;
    fadeIn(this);
    const cx = layout.designWidth / 2;
    const cy = layout.designHeight / 2;
    addText(this, cx, cy - layout.tileSize * 2, GAME_TITLE, type.title);

    addPanel(
      this,
      cx - layout.buttonWidth / 2,
      cy - layout.tapMin / 2,
      layout.buttonWidth,
      layout.tapMin,
    );
    const buttons: Button[] = [
      addButton(this, cx, cy, layout.buttonWidth, "Practice", true, () => {
        this.leave({ seed: practiceSeed() });
      }),
    ];
    addText(
      this,
      cx,
      cy + layout.tileSize * 2,
      "Tap a tile to turn it and its neighbours.\nMake every tile the same.",
      type.caption,
      colors.textMuted.css,
    ).setAlign("center");

    let focused = 0;
    const ring = new FocusRing(this);
    const focus = (index: number): void => {
      focused = index;
      const button = buttons[focused];
      if (button)
        ring.show(button.x, button.y, button.width, button.height, radius.button);
    };
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowUp":
          focus(moveFocus(focused, -1, buttons.length));
          break;
        case "ArrowDown":
          focus(moveFocus(focused, 1, buttons.length));
          break;
        case "Enter":
        case " ":
          buttons[focused]?.activate();
          break;
        default:
          focus(focused);
      }
    });

    if (!this.loadingStopped) {
      this.loadingStopped = true;
      this.platform.loadingStop();
    }
    document.body.dataset["ready"] = "true";
  }

  private leave(data: PlayData): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeTo(this, SceneKey.play, data);
  }
}
