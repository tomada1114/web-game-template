import * as Phaser from "phaser";

import { layout, radius, space, type } from "../theme/tokens.js";
import { moveFocus } from "../view/board-view.js";

import { SceneKey, practiceSeed, type PlayData, type ResultData } from "./keys.js";
import {
  FocusRing,
  addButton,
  addPanel,
  addText,
  fadeIn,
  fadeTo,
  type Button,
} from "./ui.js";

/** The outcome and score of a Practice board, with Again, Practice and Title. */
export class ResultScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super(SceneKey.result);
  }

  create(data: ResultData): void {
    this.leaving = false;
    fadeIn(this);
    const cx = layout.designWidth / 2;
    const cy = layout.designHeight / 2;
    addText(this, cx, cy - layout.tileSize * 2, data.headline, type.title);
    addText(this, cx, cy - layout.tileSize, data.score, type.heading);

    const pitch = layout.rowButtonWidth + space.unit * 2;
    const rowWidth = layout.rowButtonWidth * 3 + space.unit * 4;
    const y = cy + layout.tileSize;
    addPanel(this, cx - rowWidth / 2, y - layout.tapMin / 2, rowWidth, layout.tapMin);
    const buttons: Button[] = [
      addButton(this, cx - pitch, y, layout.rowButtonWidth, "Again", true, () => {
        this.leave(SceneKey.play, { seed: data.seed } satisfies PlayData);
      }),
      addButton(this, cx, y, layout.rowButtonWidth, "Practice", false, () => {
        this.leave(SceneKey.play, { seed: practiceSeed() } satisfies PlayData);
      }),
      // Leaving Result for Title sends no platform event: Play already sent gameplayStop.
      addButton(this, cx + pitch, y, layout.rowButtonWidth, "Title", false, () => {
        this.leave(SceneKey.title);
      }),
    ];

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
        case "ArrowLeft":
        case "ArrowUp":
          focus(moveFocus(focused, -1, buttons.length));
          break;
        case "ArrowRight":
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
  }

  private leave(key: string, data?: PlayData): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeTo(this, key, data);
  }
}
