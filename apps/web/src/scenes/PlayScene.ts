import * as Phaser from "phaser";

import {
  SAMPLE_CONFIG,
  applyMove,
  createGame,
  isOver,
  type Move,
  type State,
} from "@my-game/core";

import { type Platform } from "../platform/platform.js";
import { colors, layout, motion, radius, space, type } from "../theme/tokens.js";
import {
  CURSOR_START,
  boardRect,
  moveCursor,
  resultLines,
  toView,
  type Direction,
} from "../view/board-view.js";

import { SceneKey, type PlayData, type ResultData } from "./keys.js";
import { FocusRing, addButton, addPanel, addText, fadeIn, fadeTo } from "./ui.js";

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
  private state!: State;
  /** The moves played on this board; with the seed, they make the replay record. */
  readonly moves: Move[] = [];
  private tiles: Tile[] = [];
  private cursor = CURSOR_START;
  private counter!: Phaser.GameObjects.Text;
  private ring!: FocusRing;
  private leaving = false;

  private readonly platform: Platform;

  constructor(platform: Platform) {
    super(SceneKey.play);
    this.platform = platform;
  }

  init(data: PlayData): void {
    this.state = createGame(data.seed, SAMPLE_CONFIG);
    this.moves.length = 0;
    this.tiles = [];
    this.cursor = CURSOR_START;
    this.leaving = false;
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
      .text(layout.designWidth - space.unit * 4, top, "", {
        fontFamily: type.font,
        fontSize: `${String(type.body)}px`,
        color: colors.text.css,
      })
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
        .text(cell.x, cell.y, "", {
          fontFamily: type.font,
          fontSize: `${String(type.heading)}px`,
          color: colors.glyphOnTile.css,
        })
        .setOrigin(0.5);
      this.add
        .zone(cell.x, cell.y, layout.tileSize, layout.tileSize)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.POINTER_UP, () => {
          this.cursor = cell.cell;
          this.play(cell.cell);
        });
      this.tiles.push({ body, glyph });
    }
    this.ring = new FocusRing(this);
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      this.onKey(event.key);
    });

    this.draw();
    this.platform.gameplayStart();
  }

  private onKey(key: string): void {
    const direction = ARROWS[key];
    if (direction !== undefined) {
      this.cursor = moveCursor(this.cursor, direction);
    } else if (key === "Enter" || key === " ") {
      this.play(this.cursor);
    } else if (key === "Escape") {
      this.back();
      return;
    }
    const view = toView(this.state).cells[this.cursor];
    if (view) {
      this.ring.show(view.x, view.y, layout.tileSize, layout.tileSize, radius.tile);
    }
  }

  /** Pointer and keyboard both land here, so the two cannot disagree about a move. */
  private play(cell: number): void {
    if (this.leaving || isOver(this.state)) return;
    const before = this.state.cells;
    const move = { cell } satisfies Move;
    this.state = applyMove(this.state, move);
    this.moves.push(move);
    this.draw();
    this.state.cells.forEach((kind, index) => {
      const tile = this.tiles[index];
      if (tile && kind !== before[index]) {
        this.tweens.add({
          targets: [tile.body, tile.glyph],
          scale: layout.movePopScale,
          duration: motion.moveMs / 2,
          ease: motion.moveEase,
          yoyo: true,
        });
      }
    });
    if (isOver(this.state)) {
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
    const mirror = document.getElementById("debug-moves");
    if (mirror) mirror.textContent = String(view.movesUsed);
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

  private finish(finished: State): void {
    if (this.leaving) return;
    this.leaving = true;
    this.platform.gameplayStop();
    const lines = resultLines(finished);
    fadeTo(this, SceneKey.result, {
      seed: finished.seed,
      headline: lines.headline,
      score: lines.score,
    } satisfies ResultData);
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.platform.gameplayStop();
    fadeTo(this, SceneKey.title);
  }
}
