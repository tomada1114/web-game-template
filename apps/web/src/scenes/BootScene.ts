import * as Phaser from "phaser";

import { GAME_TITLE } from "../game-info.js";
import { type Platform } from "../platform/platform.js";
import { colors, layout, type } from "../theme/tokens.js";

import { SceneKey } from "./keys.js";
import { addText } from "./ui.js";

interface BootData {
  readonly retry?: boolean;
}

/** Loads the assets behind a progress bar, then opens Title. */
export class BootScene extends Phaser.Scene {
  private failed = false;
  private retrying = false;

  private readonly platform: Platform;

  constructor(platform: Platform) {
    super(SceneKey.boot);
    this.platform = platform;
  }

  init(data: BootData): void {
    this.failed = false;
    this.retrying = data.retry === true;
  }

  preload(): void {
    // A retry reruns the same preload; the portal already heard that loading started.
    if (!this.retrying) this.platform.loadingStart();
    const cx = layout.designWidth / 2;
    const cy = layout.designHeight / 2;
    addText(this, cx, cy - layout.tapMin, GAME_TITLE, type.title);
    const left = cx - layout.progressWidth / 2;
    this.add
      .rectangle(
        left,
        cy,
        layout.progressWidth,
        layout.progressHeight,
        colors.surface.hex,
      )
      .setOrigin(0, 0.5);
    const bar = this.add
      .rectangle(
        left,
        cy,
        layout.progressWidth,
        layout.progressHeight,
        colors.accent.hex,
      )
      .setOrigin(0, 0.5)
      .setScale(0, 1);
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      bar.setScale(value, 1);
    });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      this.failed = true;
    });
    // The sample has no assets; a game that adds them loads them here.
  }

  create(): void {
    if (!this.failed) {
      this.scene.start(SceneKey.title);
      return;
    }
    addText(
      this,
      layout.designWidth / 2,
      layout.designHeight / 2 + layout.tapMin,
      "Couldn't load. Tap to retry.",
      type.body,
    );
    const retry = (): void => {
      this.scene.restart({ retry: true } satisfies BootData);
    };
    this.input.once(Phaser.Input.Events.POINTER_UP, retry);
    this.input.keyboard?.once("keydown-ENTER", retry);
    this.input.keyboard?.once("keydown-SPACE", retry);
  }
}
