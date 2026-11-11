import * as Phaser from "phaser";

import * as core from "@my-game/core";

import { GAME_SLUG } from "../game-info.js";
import { type Platform } from "../platform/platform.js";
import { colors, layout, motion, radius, space, type } from "../theme/tokens.js";
import {
  CURSOR_START,
  boardRect,
  cellCenter,
  isActivation,
  moveCursor,
  toView,
  type Direction,
} from "../view/board-view.js";

import { SceneKey, type PlayData, type ResultData } from "./keys.js";
import {
  CAPTURED_KEYS,
  FocusRing,
  addButton,
  addPanel,
  addText,
  fadeIn,
  fadeTo,
  onTap,
  textStyle,
} from "./ui.js";

interface Tile {
  readonly body: Phaser.GameObjects.Graphics;
  readonly glyph: Phaser.GameObjects.Text;
}

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Runs one board: holds the core state and the moves played, and draws `toView(state)`. */
export class PlayScene extends Phaser.Scene {
  private state!: core.State;
  /** The moves played on this board; with the seed, they make the replay record. */
  readonly moves: core.Move[] = [];
  private tiles: Tile[] = [];
  private cursor = CURSOR_START;
  private counter!: Phaser.GameObjects.Text;
  private ring!: FocusRing;
  private mirror: HTMLElement | null = null;
  private leaving = false;
  private day: string | undefined;

  private readonly platform: Platform;

  constructor(platform: Platform) {
    super(SceneKey.play);
    this.platform = platform;
  }

  init(data: PlayData): void {
    const seed = "day" in data ? core.dailySeed(data.day, GAME_SLUG) : data.seed;
    this.state = core.createGame(seed, core.SAMPLE_CONFIG);
    this.moves.length = 0;
    this.tiles = [];
    this.cursor = CURSOR_START;
    this.leaving = false;
    this.day = "day" in data ? data.day : undefined;
  }

  create(): void {
    fadeIn(this);
    const top = space.unit * 2 + layout.tapMin / 2;
    addButton(
      this,
      space.unit * 2 + layout.buttonWidth / 4,
      top,
      layout.buttonWidth / 2,
      "← Back",
      false,
      () => {
        this.back();
      },
    );
    this.counter = this.add
      .text(layout.designWidth - space.unit * 4, top, "", textStyle(type.body))
      .setOrigin(1, 0.5);
    addText(
      this,
      layout.designWidth / 2,
      boardRect.y + boardRect.height + layout.tapMin,
      "Make every tile the same",
      type.body,
      colors.textMuted.css,
    );

    addPanel(this, boardRect.x, boardRect.y, boardRect.width, boardRect.height);
    for (const cell of toView(this.state).cells) {
      const body = this.add.graphics({ x: cell.x, y: cell.y });
      const glyph = this.add
        .text(cell.x, cell.y, "", textStyle(type.heading, colors.glyphOnTile.css))
        .setOrigin(0.5);
      onTap(this.add.zone(cell.x, cell.y, layout.tileSize, layout.tileSize), () => {
        this.cursor = cell.cell;
        this.play(cell.cell);
      });
      this.tiles.push({ body, glyph });
    }
    this.ring = new FocusRing(this);
    this.mirror = document.getElementById("debug-moves");
    this.input.keyboard?.addCapture(CAPTURED_KEYS);
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      this.onKey(event);
    });

    this.draw();
    this.platform.gameplayStart();
    document.body.dataset["scene"] = "play";
  }

  private onKey(event: KeyboardEvent): void {
    const direction = ARROWS[event.key];
    if (direction !== undefined) {
      this.cursor = moveCursor(this.cursor, direction);
    } else if (isActivation(event)) {
      this.play(this.cursor);
    } else if (event.key === "Escape") {
      this.back();
      return;
    }
    const center = cellCenter(this.cursor);
    this.ring.show(center.x, center.y, layout.tileSize, layout.tileSize, radius.tile);
  }

  /** Pointer and keyboard both land here, so the two cannot disagree about a move. */
  private play(cell: number): void {
    if (this.leaving || core.isOver(this.state)) return;
    const before = this.state.cells;
    const move = { cell } satisfies core.Move;
    this.state = core.applyMove(this.state, move);
    this.moves.push(move);
    this.draw();
    this.state.cells.forEach((kind, index) => {
      const tile = this.tiles[index];
      if (tile && kind !== before[index]) {
        const targets = [tile.body, tile.glyph];
        this.tweens.killTweensOf(targets);
        for (const target of targets) target.setScale(1);
        this.tweens.add({
          targets,
          scale: layout.movePopScale,
          duration: motion.moveMs / 2,
          ease: motion.moveEase,
          yoyo: true,
        });
      }
    });
    if (core.isOver(this.state)) {
      const finished = this.state;
      this.time.delayedCall(layout.resultPauseMs, () => {
        this.finish(finished);
      });
    }
  }

  private draw(): void {
    const view = toView(this.state);
    const half = layout.tileSize / 2;
    view.cells.forEach((cell, index) => {
      const tile = this.tiles[index];
      if (!tile) return;
      tile.body
        .clear()
        .fillStyle(cell.fill)
        .fillRoundedRect(-half, -half, layout.tileSize, layout.tileSize, radius.tile);
      tile.glyph.setText(cell.glyph);
    });
    this.counter.setText(view.movesLabel);
    if (this.mirror) this.mirror.textContent = String(view.movesUsed);
    const focused = view.cells[this.cursor];
    if (focused) {
      this.ring.moveTo(
        focused.x,
        focused.y,
        layout.tileSize,
        layout.tileSize,
        radius.tile,
      );
    }
  }

  private finish(finished: core.State): void {
    if (this.leaving) return;
    this.leaving = true;
    delete document.body.dataset["scene"];
    this.platform.gameplayStop();
    fadeTo(this, SceneKey.result, {
      seed: finished.seed,
      ...(this.day === undefined ? {} : { day: this.day }),
      points: core.score(finished),
      movesUsed: finished.movesUsed,
      limit: finished.limit,
    } satisfies ResultData);
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    delete document.body.dataset["scene"];
    this.platform.gameplayStop();
    fadeTo(this, SceneKey.title);
  }
}
