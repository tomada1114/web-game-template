import * as Phaser from "phaser";

import { channels, focusRect } from "../view/board-view.js";
import { colors, layout, motion, radius, space, type } from "../theme/tokens.js";

/** A text style from the tokens. */
export function textStyle(
  size: number,
  fill: string = colors.text.css,
): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: type.font, fontSize: `${String(size)}px`, color: fill };
}

/** Adds a centred text object. */
export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  fill?: string,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, textStyle(size, fill)).setOrigin(0.5);
}

/** A tappable, keyboard-focusable button. */
export interface Button {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly activate: () => void;
}

/** Draws a button of at least `layout.tapMin` in each direction and wires its tap. */
export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  label: string,
  primary: boolean,
  activate: () => void,
): Button {
  const w = Math.max(width, layout.tapMin);
  const h = layout.tapMin;
  scene.add
    .graphics()
    .fillStyle(primary ? colors.accent.hex : colors.bg.hex)
    .fillRoundedRect(x - w / 2, y - h / 2, w, h, radius.button);
  addText(
    scene,
    x,
    y,
    label,
    type.body,
    primary ? colors.onAccent.css : colors.text.css,
  );
  scene.add
    .zone(x, y, w, h)
    .setInteractive({ useHandCursor: true })
    .on(Phaser.Input.Events.POINTER_UP, activate);
  return { x, y, width: w, height: h, activate };
}

/** Draws a `surface` panel that holds the board or a group of buttons. */
export function addPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
): Phaser.GameObjects.Graphics {
  const pad = space.unit * 3;
  return scene.add
    .graphics()
    .fillStyle(colors.surface.hex)
    .fillRoundedRect(
      x - pad,
      y - pad,
      width + pad * 2,
      height + pad * 2,
      radius.button,
    );
}

/**
 * The keyboard focus ring: hidden until a key is pressed, hidden again by a
 * pointer press.
 */
export class FocusRing {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private keyboardUsed = false;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(1);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.keyboardUsed = false;
      this.graphics.clear();
    });
  }

  /** Records keyboard use and draws the ring around a control centred at `x`, `y`. */
  show(
    x: number,
    y: number,
    width: number,
    height: number,
    cornerRadius: number,
  ): void {
    this.keyboardUsed = true;
    this.moveTo(x, y, width, height, cornerRadius);
  }

  /** Moves the ring; draws it only when the keyboard is in use. */
  moveTo(
    x: number,
    y: number,
    width: number,
    height: number,
    cornerRadius: number,
  ): void {
    this.graphics.clear();
    if (!this.keyboardUsed) return;
    const ring = focusRect(x, y, width, height);
    this.graphics
      .lineStyle(layout.focusRing, colors.accent.hex)
      .strokeRoundedRect(
        ring.x,
        ring.y,
        ring.width,
        ring.height,
        cornerRadius + layout.focusOffset,
      );
  }
}

/** Fades the camera out to `bg`, then starts `key` with `data`. */
export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  const [r, g, b] = channels(colors.bg.hex);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });
  scene.cameras.main.fadeOut(motion.sceneFadeMs, r, g, b);
}

/** Fades the camera in from `bg` as a scene opens. */
export function fadeIn(scene: Phaser.Scene): void {
  const [r, g, b] = channels(colors.bg.hex);
  scene.cameras.main.fadeIn(motion.sceneFadeMs, r, g, b);
}
