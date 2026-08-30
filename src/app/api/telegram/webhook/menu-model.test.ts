import { describe, expect, it } from "vitest";

import {
  buildAccountMenu,
  buildEarnMenu,
  buildGameMenu,
  buildHelpMenu,
  buildHomeMenu,
  findGameHub,
  GAME_HUBS,
  parseGameCallback,
  type MenuButton,
} from "./menu-model";

const APP = "https://www.flexa1.ir";
const CHANNEL = "https://t.me/Flexa_games";

const flatten = (rows: MenuButton[][]) => rows.flat();
const callbacks = (rows: MenuButton[][]) =>
  flatten(rows)
    .map((b) => b.callback_data)
    .filter((v): v is string => Boolean(v));

describe("home menu", () => {
  it("is short enough to scan at a glance", () => {
    const rows = buildHomeMenu(APP, CHANNEL);
    // The old menu had 23 buttons. Anything near that is a regression.
    expect(flatten(rows).length).toBeLessThanOrEqual(12);
  });

  it("shows all three games as top-level entries", () => {
    const cbs = callbacks(buildHomeMenu(APP, CHANNEL));
    expect(cbs).toContain("game:clash_royale");
    expect(cbs).toContain("game:cod_mobile");
    expect(cbs).toContain("game:fortnite");
  });

  it("lists games before anything else", () => {
    const rows = buildHomeMenu(APP, CHANNEL);
    const firstThree = rows.slice(0, 3).map((r) => r[0].callback_data);
    expect(firstThree).toEqual(["game:clash_royale", "game:cod_mobile", "game:fortnite"]);
  });

  it("no longer shows the per-user clutter the owner asked to remove", () => {
    const cbs = callbacks(buildHomeMenu(APP, CHANNEL));
    const mustBeGone = [
      "menu:my_tournaments",
      "menu:matches",
      "clash1v1:status",
      "menu:clash_private",
      "menu:missions",
      "menu:quiz",
      "menu:affiliate",
      "menu:status",
      "menu:link",
      "mission:invite",
    ];
    for (const item of mustBeGone) {
      expect(cbs, `${item} should not be on the home screen`).not.toContain(item);
    }
  });

  it("no longer links straight to web profile / register from home", () => {
    const urls = flatten(buildHomeMenu(APP, CHANNEL))
      .map((b) => b.url)
      .filter(Boolean);
    expect(urls).not.toContain(`${APP}/profile`);
    expect(urls).not.toContain(`${APP}/register`);
  });

  it("keeps the mini app reachable", () => {
    const btns = flatten(buildHomeMenu(APP, CHANNEL));
    expect(btns.some((b) => b.web_app?.url === APP)).toBe(true);
  });

  it("omits the channel row when no channel is configured", () => {
    const urls = flatten(buildHomeMenu(APP, "")).map((b) => b.url);
    expect(urls).not.toContain(CHANNEL);
  });
});

describe("game hubs", () => {
  it.each(GAME_HUBS)("$label offers rooms and tournaments", (hub) => {
    const cbs = callbacks(buildGameMenu(hub, APP));
    expect(cbs).toContain(`game:${hub.id}:rooms`);
    expect(cbs).toContain(`game:${hub.id}:tournaments`);
  });

  it.each(GAME_HUBS)("$label can always get back home", (hub) => {
    expect(callbacks(buildGameMenu(hub, APP))).toContain("menu:home");
  });

  it("puts Clash 1v1 inside the Clash hub, not on the home screen", () => {
    const clash = findGameHub("clash_royale")!;
    const cbs = callbacks(buildGameMenu(clash, APP));
    expect(cbs).toContain("clash1v1:quick_register");
    expect(cbs).toContain("clash1v1:status");
    expect(cbs).toContain("menu:clash_private");
  });

  it("does not leak Clash-only actions into other games", () => {
    for (const hub of GAME_HUBS.filter((h) => h.id !== "clash_royale")) {
      const cbs = callbacks(buildGameMenu(hub, APP));
      expect(cbs).not.toContain("clash1v1:quick_register");
      expect(cbs).not.toContain("menu:clash_private");
    }
  });

  it("puts COD Arena inside the COD hub only", () => {
    const cod = buildGameMenu(findGameHub("cod_mobile")!, APP);
    expect(flatten(cod).some((b) => b.url === `${APP}/cod-arena`)).toBe(true);

    const fortnite = buildGameMenu(findGameHub("fortnite")!, APP);
    expect(flatten(fortnite).some((b) => b.url === `${APP}/cod-arena`)).toBe(false);
  });

  it("keeps each hub small", () => {
    for (const hub of GAME_HUBS) {
      expect(flatten(buildGameMenu(hub, APP)).length).toBeLessThanOrEqual(8);
    }
  });
});

describe("sections", () => {
  it("account section holds every personal item removed from home", () => {
    const cbs = callbacks(buildAccountMenu(APP));
    for (const item of [
      "menu:profile",
      "menu:wallet",
      "menu:my_tournaments",
      "menu:matches",
      "menu:checkin",
      "menu:status",
      "menu:link",
    ]) {
      expect(cbs).toContain(item);
    }
  });

  it("earn section holds missions, quiz, referral and affiliate", () => {
    const cbs = callbacks(buildEarnMenu());
    expect(cbs).toContain("menu:missions");
    expect(cbs).toContain("menu:quiz");
    expect(cbs).toContain("mission:invite");
    expect(cbs).toContain("menu:affiliate");
  });

  it("help section holds rules and support", () => {
    const cbs = callbacks(buildHelpMenu(CHANNEL));
    expect(cbs).toContain("menu:rules");
    expect(cbs).toContain("menu:support");
  });

  it("every section can get back home", () => {
    expect(callbacks(buildAccountMenu(APP))).toContain("menu:home");
    expect(callbacks(buildEarnMenu())).toContain("menu:home");
    expect(callbacks(buildHelpMenu(CHANNEL))).toContain("menu:home");
  });
});

describe("nothing is lost in the reorganisation", () => {
  it("every old destination is still reachable somewhere", () => {
    const everywhere = new Set([
      ...callbacks(buildHomeMenu(APP, CHANNEL)),
      ...callbacks(buildAccountMenu(APP)),
      ...callbacks(buildEarnMenu()),
      ...callbacks(buildHelpMenu(CHANNEL)),
      ...GAME_HUBS.flatMap((hub) => callbacks(buildGameMenu(hub, APP))),
    ]);

    // Exactly the interactive destinations the old 23-button menu had.
    const oldDestinations = [
      "clash1v1:quick_register",
      "menu:rooms",
      "menu:register",
      "menu:wallet",
      "menu:my_tournaments",
      "menu:checkin",
      "menu:matches",
      "menu:clash_private",
      "clash1v1:status",
      "menu:missions",
      "menu:quiz",
      "mission:invite",
      "menu:affiliate",
      "menu:rules",
      "menu:support",
      "menu:link",
      "menu:profile",
      "menu:status",
    ];

    const missing = oldDestinations.filter((d) => !everywhere.has(d));
    expect(missing, `these features became unreachable: ${missing.join(", ")}`).toEqual([]);
  });

  it("web links from the old menu survive", () => {
    const urls = new Set(
      [
        ...flatten(buildHomeMenu(APP, CHANNEL)),
        ...flatten(buildAccountMenu(APP)),
        ...GAME_HUBS.flatMap((hub) => flatten(buildGameMenu(hub, APP))),
      ]
        .map((b) => b.url)
        .filter((v): v is string => Boolean(v)),
    );
    expect(urls).toContain(`${APP}/cod-arena`);
    expect(urls).toContain(`${APP}/profile`);
    expect(urls).toContain(`${APP}/register`);
  });
});

describe("parseGameCallback", () => {
  it("parses a bare hub", () => {
    expect(parseGameCallback("game:fortnite")).toEqual({ gameId: "fortnite", action: "hub" });
  });

  it.each(["rooms", "tournaments", "register"] as const)("parses the %s action", (action) => {
    expect(parseGameCallback(`game:cod_mobile:${action}`)).toEqual({ gameId: "cod_mobile", action });
  });

  it("rejects unknown games and actions", () => {
    expect(parseGameCallback("game:minecraft")).toBeNull();
    expect(parseGameCallback("game:fortnite:delete_everything")).toBeNull();
    expect(parseGameCallback("menu:home")).toBeNull();
    expect(parseGameCallback("")).toBeNull();
  });

  it("round-trips every callback the menus emit", () => {
    for (const hub of GAME_HUBS) {
      for (const cb of callbacks(buildGameMenu(hub, APP))) {
        if (!cb.startsWith("game:")) continue;
        expect(parseGameCallback(cb), `${cb} must be routable`).not.toBeNull();
      }
      expect(parseGameCallback(`game:${hub.id}`)).toEqual({ gameId: hub.id, action: "hub" });
    }
  });
});
