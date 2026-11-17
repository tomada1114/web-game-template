import { describe, expect, it } from "vitest";

import {
  ConfigMismatchError,
  InvalidMoveError,
  RULES_VERSION,
  RulesVersionError,
  SAMPLE_CONFIG,
  applyMove,
  createGame,
  replay,
  type ReplayRecord,
} from "../src/index.js";

import { thrownBy } from "./thrown-by.js";

function recordOf(cells: readonly number[], seed = 1): ReplayRecord {
  return { v: 1, seed, config: SAMPLE_CONFIG, moves: cells.map((cell) => ({ cell })) };
}

// The ten cells seed 1 scrambles its board with.
const SOLVING_CELLS = [5, 19, 14, 13, 19, 10, 24, 0, 16, 11];

// A record arrives as JSON, so a test builds one the same way, config of any shape.
function parsedRecord(config: unknown, cells: readonly number[] = []): ReplayRecord {
  const json = JSON.stringify({
    v: 1,
    seed: 1,
    config,
    moves: cells.map((cell) => ({ cell })),
  });
  return JSON.parse(json) as ReplayRecord;
}

describe("replay", () => {
  it("returns the start state and a score of 0 for a record with no move", () => {
    expect(replay(recordOf([]))).toStrictEqual({
      state: createGame(1, SAMPLE_CONFIG),
      score: 0,
    });
  });

  it("applies the recorded moves in order", () => {
    const start = createGame(1, SAMPLE_CONFIG);
    const afterTwo = applyMove(applyMove(start, { cell: 0 }), { cell: 12 });

    expect(replay(recordOf([0, 12]))).toStrictEqual({ state: afterTwo, score: 0 });
  });

  it("scores a solved run", () => {
    const result = replay(recordOf(SOLVING_CELLS));

    expect(result.state.cells).toEqual(Array.from({ length: 25 }, () => 0));
    expect(result.score).toBe(11);
  });

  it("creates the game from the record's seed", () => {
    const record: ReplayRecord = { v: 1, seed: 77, config: SAMPLE_CONFIG, moves: [] };

    expect(replay(record).state).toStrictEqual(createGame(77, SAMPLE_CONFIG));
    expect(replay(record).state.limit).toBe(20);
  });

  it("throws ERR_CONFIG_MISMATCH for a config createGame rejects", () => {
    const record: ReplayRecord = {
      v: 1,
      seed: 1,
      config: { ...SAMPLE_CONFIG, moveLimit: 0 },
      moves: [],
    };

    expect(thrownBy(() => replay(record))).toBeInstanceOf(ConfigMismatchError);
  });

  it("throws ERR_CONFIG_MISMATCH for a record that sets its own move limit", () => {
    const error = thrownBy(() =>
      replay({
        ...recordOf(SOLVING_CELLS),
        config: { ...SAMPLE_CONFIG, moveLimit: 1_000_000 },
      }),
    );

    expect(error).toBeInstanceOf(ConfigMismatchError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "ConfigMismatchError",
      code: "ERR_CONFIG_MISMATCH",
    });
  });

  it.each([
    { size: 6 },
    { kinds: 3 },
    { moveLimit: 21 },
    { moveLimit: 19 },
    { scrambleMin: 5 },
    { scrambleMax: 11 },
  ])("throws ERR_CONFIG_MISMATCH for a config with %o", (change) => {
    const error = thrownBy(() => replay(parsedRecord({ ...SAMPLE_CONFIG, ...change })));

    expect(error).toBeInstanceOf(ConfigMismatchError);
  });

  const withoutScrambleMax = Object.fromEntries(
    Object.entries(SAMPLE_CONFIG).filter(([key]) => key !== "scrambleMax"),
  );

  it.each([
    ["missing", undefined],
    ["null", null],
    ["a string", "sample"],
    ["an array", []],
    ["an empty object", {}],
    ["a field of another type", { ...SAMPLE_CONFIG, moveLimit: "20" }],
    ["a missing field", withoutScrambleMax],
  ])("throws ERR_CONFIG_MISMATCH for a config that is %s", (_name, config) => {
    const error = thrownBy(() => replay(parsedRecord(config)));

    expect(error).toBeInstanceOf(ConfigMismatchError);
  });

  it("accepts a config equal by value to SAMPLE_CONFIG", () => {
    const spread = replay({ ...recordOf(SOLVING_CELLS), config: { ...SAMPLE_CONFIG } });
    const parsed = replay(parsedRecord(SAMPLE_CONFIG, SOLVING_CELLS));

    for (const result of [spread, parsed]) {
      expect(result.score).toBe(11);
      expect(result.state.limit).toBe(20);
    }
  });

  it("ignores a config key SAMPLE_CONFIG does not have", () => {
    const result = replay(
      parsedRecord({ ...SAMPLE_CONFIG, bonus: 1000 }, SOLVING_CELLS),
    );

    expect(result.score).toBe(11);
    expect(result.state.limit).toBe(20);
  });

  it("checks the version before the config", () => {
    const record = parsedRecord({ ...SAMPLE_CONFIG, moveLimit: 1_000_000 });

    expect(thrownBy(() => replay({ ...record, v: 2 }))).toBeInstanceOf(
      RulesVersionError,
    );
  });

  it("checks the config before the moves", () => {
    const record = parsedRecord({ ...SAMPLE_CONFIG, moveLimit: 1_000_000 }, [25]);

    expect(thrownBy(() => replay(record))).toBeInstanceOf(ConfigMismatchError);
  });

  it("leaves the record unchanged", () => {
    const record = recordOf([0, 12]);
    const copy: unknown = JSON.parse(JSON.stringify(record));

    replay(record);

    expect(record).toStrictEqual(copy);
  });

  it("starts the rules history at the version it accepts", () => {
    expect(() => replay({ ...recordOf([]), v: RULES_VERSION })).not.toThrow();
  });

  it.each([2, 0, -1, 1.5, Number.NaN])(
    "throws ERR_RULES_VERSION for a record of version %d",
    (v) => {
      const error = thrownBy(() =>
        replay({ v, seed: 1, config: SAMPLE_CONFIG, moves: [] }),
      );

      expect(error).toBeInstanceOf(RulesVersionError);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        name: "RulesVersionError",
        code: "ERR_RULES_VERSION",
        expected: 1,
      });
    },
  );

  it("checks the version before it reads the moves", () => {
    const error = thrownBy(() => replay({ ...recordOf([25]), v: 2 }));

    expect(error).toBeInstanceOf(RulesVersionError);
  });

  it("throws ERR_INVALID_MOVE for a recorded cell off the board", () => {
    const error = thrownBy(() => replay(recordOf([0, 25])));

    expect(error).toBeInstanceOf(InvalidMoveError);
    expect(error).toMatchObject({
      code: "ERR_INVALID_MOVE",
      reason: "cell-out-of-range",
    });
  });

  it("throws ERR_INVALID_MOVE for a move recorded after the limit", () => {
    const full = Array.from({ length: 20 }, () => 0);

    expect(replay(recordOf(full)).state.movesUsed).toBe(20);

    const error = thrownBy(() => replay(recordOf([...full, 0])));

    expect(error).toBeInstanceOf(InvalidMoveError);
    expect(error).toMatchObject({ code: "ERR_INVALID_MOVE", reason: "game-over" });
  });
});
