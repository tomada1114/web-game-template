import { describe, expect, it, vi } from "vitest";

import {
  SHARE_BOX_STYLE,
  bestKey,
  copyText,
  createSessionDay,
  dailyBoardSeed,
  readBest,
  recordBest,
  resultButtons,
  shareText,
  titleLines,
  utcDay,
} from "../../src/daily/daily.js";
import { type KeyValueStore } from "../../src/platform/platform.js";

const TITLE = "Test Game";
const SLUG = "test-game";
const DAY = "2026-11-05";
const KEY = "test-game:best:2026-11-05";

interface FakeStore extends KeyValueStore {
  readonly map: Map<string, string>;
  writes: number;
}

function fakeStore(entries: Record<string, string> = {}): FakeStore {
  const map = new Map(Object.entries(entries));
  const store: FakeStore = {
    map,
    writes: 0,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      store.writes += 1;
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
  return store;
}

function throwingStore(): KeyValueStore {
  const fail = (): never => {
    throw new DOMException("blocked", "SecurityError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

describe("utcDay", () => {
  it("returns the UTC date, not the local one", () => {
    expect(utcDay(new Date("2026-11-05T23:59:59-07:00"))).toBe("2026-11-06");
  });

  it("returns the date at both ends of a UTC day", () => {
    expect(utcDay(new Date("2026-11-05T00:00:00Z"))).toBe("2026-11-05");
    expect(utcDay(new Date("2026-11-05T23:59:59.999Z"))).toBe("2026-11-05");
  });
});

describe("createSessionDay", () => {
  it("reads the clock once and keeps that day past midnight", () => {
    const clock = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date("2026-11-05T23:59:59Z"))
      .mockReturnValue(new Date("2026-11-06T00:00:01Z"));
    const day = createSessionDay(clock);

    expect(day()).toBe("2026-11-05");
    expect(day()).toBe("2026-11-05");
    expect(clock).toHaveBeenCalledTimes(1);
  });
});

describe("dailyBoardSeed", () => {
  it("gives every player the same seed for a day and slug", () => {
    expect(dailyBoardSeed(DAY, SLUG)).toBe(dailyBoardSeed(DAY, SLUG));
    expect(dailyBoardSeed(DAY, SLUG)).toBe(1278630309);
  });

  it("changes with the day and with the slug", () => {
    expect(dailyBoardSeed("2026-11-06", SLUG)).not.toBe(dailyBoardSeed(DAY, SLUG));
    expect(dailyBoardSeed(DAY, "other-game")).not.toBe(dailyBoardSeed(DAY, SLUG));
  });
});

describe("bestKey", () => {
  it("joins the slug and the day", () => {
    expect(bestKey(SLUG, DAY)).toBe(KEY);
  });
});

describe("shareText", () => {
  it("formats a solved board in three lines with no trailing newline", () => {
    expect(shareText(TITLE, DAY, { score: 14, movesUsed: 7, maxScore: 20 })).toBe(
      "Test Game 2026-11-05\n14/20 · 7 moves\n▰▰▰▰▰▰▰▱▱▱",
    );
  });

  it("fills the bar at score 20 and floors an odd score", () => {
    expect(shareText(TITLE, DAY, { score: 20, movesUsed: 1, maxScore: 20 })).toBe(
      "Test Game 2026-11-05\n20/20 · 1 moves\n▰▰▰▰▰▰▰▰▰▰",
    );
    expect(
      shareText(TITLE, DAY, { score: 1, movesUsed: 20, maxScore: 20 }).split("\n")[2],
    ).toBe("▱▱▱▱▱▱▱▱▱▱");
  });

  it("says out of moves for an unsolved board", () => {
    expect(shareText(TITLE, DAY, { score: 0, movesUsed: 20, maxScore: 20 })).toBe(
      "Test Game 2026-11-05\n0/20 · out of moves\n▱▱▱▱▱▱▱▱▱▱",
    );
  });
});

describe("readBest", () => {
  it("returns the stored best, or null when none", () => {
    expect(readBest(fakeStore({ [KEY]: "14" }), KEY)).toBe(14);
    expect(readBest(fakeStore(), KEY)).toBeNull();
  });

  it("ignores a value that is not a positive integer", () => {
    for (const raw of ["0", "-3", "1.5", "abc", "", "07"]) {
      expect(readBest(fakeStore({ [KEY]: raw }), KEY)).toBeNull();
    }
  });

  it("returns null when the store throws", () => {
    expect(readBest(throwingStore(), KEY)).toBeNull();
  });
});

describe("recordBest", () => {
  it("writes a higher score and reports a new best", () => {
    const store = fakeStore({ [KEY]: "12" });
    expect(recordBest(store, KEY, 14)).toBe(true);
    expect(store.map.get(KEY)).toBe("14");
  });

  it("writes the first score of the day", () => {
    const store = fakeStore();
    expect(recordBest(store, KEY, 1)).toBe(true);
    expect(store.map.get(KEY)).toBe("1");
  });

  it("writes nothing for a lower or equal score", () => {
    const store = fakeStore({ [KEY]: "14" });
    expect(recordBest(store, KEY, 12)).toBe(false);
    expect(recordBest(store, KEY, 14)).toBe(false);
    expect(store.writes).toBe(0);
    expect(store.map.get(KEY)).toBe("14");
  });

  it("never stores 0", () => {
    const store = fakeStore();
    expect(recordBest(store, KEY, 0)).toBe(false);
    expect(store.writes).toBe(0);
  });

  it("reports no new best when the store throws", () => {
    expect(recordBest(throwingStore(), KEY, 14)).toBe(false);
  });
});

describe("titleLines", () => {
  it("shows the day and the stored best", () => {
    expect(titleLines(fakeStore({ [KEY]: "14" }), SLUG, DAY)).toEqual({
      daily: "Daily · 2026-11-05",
      best: "Best today: 14",
    });
  });

  it("hides the best line when none is stored or the store throws", () => {
    expect(titleLines(fakeStore(), SLUG, DAY).best).toBeNull();
    expect(titleLines(throwingStore(), SLUG, DAY)).toEqual({
      daily: "Daily · 2026-11-05",
      best: null,
    });
  });
});

describe("resultButtons", () => {
  it("starts a daily Result on Copy result", () => {
    expect(resultButtons(true)).toEqual(["Copy result", "Again", "Practice", "Title"]);
  });

  it("has no Copy result on a Practice Result", () => {
    expect(resultButtons(false)).toEqual(["Again", "Practice", "Title"]);
  });
});

describe("copyText", () => {
  it("writes the text through the clipboard", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    await expect(copyText("a\nb", { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("a\nb");
  });

  it("reports failure when the clipboard rejects", async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    await expect(copyText("a", { writeText })).resolves.toBe(false);
  });

  it("reports failure when there is no clipboard", async () => {
    await expect(copyText("a", undefined)).resolves.toBe(false);
  });
});

describe("SHARE_BOX_STYLE", () => {
  it("makes the box itself selectable", () => {
    expect(SHARE_BOX_STYLE).toEqual({
      "user-select": "text",
      "-webkit-user-select": "text",
    });
  });
});
