import * as Phaser from "phaser";

import {
  SHARE_BOX_STYLE,
  bestKey,
  copyText,
  recordBest,
  shareText,
} from "../daily/daily.js";
import { GAME_SLUG, GAME_TITLE } from "../game-info.js";
import { type Platform } from "../platform/platform.js";
import { colors, layout, radius, space, type } from "../theme/tokens.js";
import { isActivation, moveFocus } from "../view/board-view.js";

import { SceneKey, practiceSeed, type PlayData, type ResultData } from "./keys.js";
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

/**
 * The outcome and score of a board, with Again, Practice and Title; a daily board
 * also records its best and offers Copy result.
 */
export class ResultScene extends Phaser.Scene {
  private leaving = false;
  private shareBox: HTMLTextAreaElement | null = null;

  private readonly platform: Platform;

  constructor(platform: Platform) {
    super(SceneKey.result);
    this.platform = platform;
  }

  create(data: ResultData): void {
    this.leaving = false;
    fadeIn(this);
    const cx = layout.designWidth / 2;
    const cy = layout.designHeight / 2;
    addText(this, cx, cy - layout.tileSize * 2, data.headline, type.title);
    addText(this, cx, cy - layout.tileSize, data.score, type.heading);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeShareBox();
    });

    const { day } = data;
    const buttons: Button[] = [];
    if (day !== undefined) {
      if (recordBest(this.platform.storage, bestKey(GAME_SLUG, day), data.points)) {
        this.platform.happytime();
        addText(
          this,
          cx,
          cy - layout.tileSize / 2,
          "New best!",
          type.body,
          colors.accent.css,
        );
      }
      const text = shareText(GAME_TITLE, day, {
        score: data.points,
        movesUsed: data.movesUsed,
        maxScore: data.limit,
      });
      const copyY = cy + layout.tileSize / 2;
      addPanel(
        this,
        cx - layout.buttonWidth / 2,
        copyY - layout.tapMin / 2,
        layout.buttonWidth,
        layout.tapMin,
      );
      buttons.push(
        addButton(this, cx, copyY, layout.buttonWidth, "Copy result", true, () => {
          void copyText(text, globalThis.navigator.clipboard).then((copied) => {
            if (!copied) this.showShareBox(text);
          });
        }),
      );
    }
    const replay: PlayData =
      day === undefined ? { seed: data.seed } : { seed: data.seed, day };

    const pitch = layout.rowButtonWidth + space.unit * 2;
    const rowWidth = layout.rowButtonWidth * 3 + space.unit * 4;
    const y = cy + layout.tileSize * (day === undefined ? 1 : 2);
    addPanel(this, cx - rowWidth / 2, y - layout.tapMin / 2, rowWidth, layout.tapMin);
    buttons.push(
      addButton(
        this,
        cx - pitch,
        y,
        layout.rowButtonWidth,
        "Again",
        day === undefined,
        () => {
          this.leave(SceneKey.play, replay);
        },
      ),
      addButton(this, cx, y, layout.rowButtonWidth, "Practice", false, () => {
        this.leave(SceneKey.play, { seed: practiceSeed() } satisfies PlayData);
      }),
      // Leaving Result for Title sends no platform event: Play already sent gameplayStop.
      addButton(this, cx + pitch, y, layout.rowButtonWidth, "Title", false, () => {
        this.leave(SceneKey.title);
      }),
    );

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
          break;
        default:
          focus(focused);
      }
    });
  }

  /** Shows `text` in a box the player can select and copy by hand. */
  private showShareBox(text: string): void {
    if (this.shareBox) return;
    const box = document.createElement("textarea");
    box.readOnly = true;
    box.value = text;
    box.rows = 3;
    box.setAttribute("aria-label", "Result to copy");
    for (const [property, value] of Object.entries(SHARE_BOX_STYLE)) {
      box.style.setProperty(property, value);
    }
    Object.assign(box.style, {
      position: "absolute",
      left: "50%",
      bottom: `${String(space.unit * 2)}px`,
      transform: "translateX(-50%)",
      font: `${String(type.body / 2)}px ${type.font}`,
    });
    document.body.append(box);
    this.shareBox = box;
    box.focus();
    box.select();
  }

  private removeShareBox(): void {
    this.shareBox?.remove();
    this.shareBox = null;
  }

  private leave(key: string, data?: PlayData): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeTo(this, key, data);
  }
}
