import * as Phaser from "phaser";

import { dailyBoardSeed, titleLines } from "../daily/daily.js";
import { GAME_SLUG, GAME_TITLE } from "../game-info.js";
import { type Platform } from "../platform/platform.js";
import { colors, layout, radius, space, type } from "../theme/tokens.js";
import { isActivation, moveFocus } from "../view/board-view.js";

import { SceneKey, practiceSeed, type PlayData } from "./keys.js";
import {
  CAPTURED_KEYS,
  FocusRing,
  addButton,
  addPanel,
  addText,
  fadeIn,
  fadeTo,
  type Button,
} from "./ui.js";

/** The game's name, the day and its best, Play daily and Practice, and one line of how to play. */
export class TitleScene extends Phaser.Scene {
  private loadingStopped = false;
  private leaving = false;

  private readonly platform: Platform;
  private readonly sessionDay: () => string;

  constructor(platform: Platform, sessionDay: () => string) {
    super(SceneKey.title);
    this.platform = platform;
    this.sessionDay = sessionDay;
  }

  create(): void {
    this.leaving = false;
    fadeIn(this);
    const cx = layout.designWidth / 2;
    const cy = layout.designHeight / 2;
    const day = this.sessionDay();
    const lines = titleLines(this.platform.storage, GAME_SLUG, day);
    addText(this, cx, cy - layout.tileSize * 3, GAME_TITLE, type.title);
    addText(this, cx, cy - layout.tileSize * 2, lines.daily, type.body);
    if (lines.best !== null) {
      addText(
        this,
        cx,
        cy - layout.tileSize * 1.5,
        lines.best,
        type.caption,
        colors.textMuted.css,
      );
    }

    const pitch = layout.tapMin + space.unit * 2;
    const top = cy - pitch / 2;
    addPanel(
      this,
      cx - layout.buttonWidth / 2,
      top - layout.tapMin / 2,
      layout.buttonWidth,
      layout.tapMin + pitch,
    );
    const buttons: Button[] = [
      addButton(this, cx, top, layout.buttonWidth, "Play daily", true, () => {
        this.leave({ seed: dailyBoardSeed(day, GAME_SLUG), day });
      }),
      addButton(this, cx, top + pitch, layout.buttonWidth, "Practice", false, () => {
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
    this.input.keyboard?.addCapture(CAPTURED_KEYS);
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (isActivation(event)) {
        buttons[focused]?.activate();
        return;
      }
      switch (event.key) {
        case "ArrowUp":
          focus(moveFocus(focused, -1, buttons.length));
          break;
        case "ArrowDown":
          focus(moveFocus(focused, 1, buttons.length));
          break;
        case "Enter":
        case " ":
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
    delete document.body.dataset["ready"];
    fadeTo(this, SceneKey.play, data);
  }
}
