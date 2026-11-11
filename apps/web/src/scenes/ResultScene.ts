import * as Phaser from "phaser";

import {
  SHARE_BOX_STYLE,
  bestKey,
  copyText,
  recordBest,
  resultButtons,
  shareText,
} from "../daily/daily.js";
import { GAME_SLUG, GAME_TITLE } from "../game-info.js";
import { type Platform } from "../platform/platform.js";
import { colors, layout, radius, space, type } from "../theme/tokens.js";
import { isActivation, moveFocus, resultLines } from "../view/board-view.js";

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
  private capturesReleased = false;

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
    const lines = resultLines(data.points, data.limit);
    addText(this, cx, cy - layout.tileSize * 2, lines.headline, type.title);
    addText(this, cx, cy - layout.tileSize, lines.score, type.heading);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeShareBox();
    });

    const { day } = data;
    let share = "";
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
      share = shareText(GAME_TITLE, day, {
        score: data.points,
        movesUsed: data.movesUsed,
        maxScore: data.limit,
      });
    }
    const replay: PlayData = day === undefined ? { seed: data.seed } : { day };
    const actions: Readonly<Record<string, () => void>> = {
      "Copy result": () => {
        void copyText(share, globalThis.navigator.clipboard).then((copied) => {
          if (!copied && !this.leaving && this.sys.isActive()) this.showShareBox(share);
        });
      },
      Again: () => {
        this.leave(SceneKey.play, replay);
      },
      Practice: () => {
        this.leave(SceneKey.play, { seed: practiceSeed() } satisfies PlayData);
      },
      // Leaving Result for Title sends no platform event: Play already sent gameplayStop.
      Title: () => {
        this.leave(SceneKey.title);
      },
    };

    const labels = resultButtons(day !== undefined);
    const rowLabels = labels.filter((label) => label !== "Copy result");
    const pitch = layout.rowButtonWidth + space.unit * 2;
    const rowWidth =
      layout.rowButtonWidth * rowLabels.length +
      space.unit * 2 * (rowLabels.length - 1);
    const copyY = cy + layout.tileSize / 2;
    const rowY = cy + layout.tileSize * (day === undefined ? 1 : 2);
    if (labels.includes("Copy result")) {
      addPanel(
        this,
        cx - layout.buttonWidth / 2,
        copyY - layout.tapMin / 2,
        layout.buttonWidth,
        layout.tapMin,
      );
    }
    addPanel(
      this,
      cx - rowWidth / 2,
      rowY - layout.tapMin / 2,
      rowWidth,
      layout.tapMin,
    );
    const buttons: Button[] = labels.map((label, index) => {
      const action = actions[label] ?? (() => undefined);
      const primary = index === 0;
      if (label === "Copy result") {
        return addButton(this, cx, copyY, layout.buttonWidth, label, primary, action);
      }
      const slot = rowLabels.indexOf(label) - (rowLabels.length - 1) / 2;
      return addButton(
        this,
        cx + slot * pitch,
        rowY,
        layout.rowButtonWidth,
        label,
        primary,
        action,
      );
    });

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
      if (this.shareBox !== null && event.target === this.shareBox) return;
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
    // While the box has focus the browser must see arrows, Space and Enter so
    // the player can select text; the scene's captures would swallow them.
    box.addEventListener("focus", () => {
      this.releaseCaptures();
    });
    box.addEventListener("blur", () => {
      this.restoreCaptures();
    });
    document.body.append(box);
    this.shareBox = box;
    box.focus();
    box.select();
  }

  private releaseCaptures(): void {
    if (this.capturesReleased) return;
    this.capturesReleased = true;
    this.input.keyboard?.removeCapture(CAPTURED_KEYS);
  }

  private restoreCaptures(): void {
    if (!this.capturesReleased) return;
    this.capturesReleased = false;
    this.input.keyboard?.addCapture(CAPTURED_KEYS);
  }

  private removeShareBox(): void {
    const box = this.shareBox;
    this.shareBox = null;
    box?.remove();
    this.restoreCaptures();
  }

  private leave(key: string, data?: PlayData): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeTo(this, key, data);
  }
}
