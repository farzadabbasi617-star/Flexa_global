import { describe, expect, it } from "vitest";
import { codMatchSettingChips, codMatchSettingsSummary } from "./cod-match-settings-display";
import { normalizeCodMatchSettings } from "./cod-room-policy";

describe("match setting chips", () => {
  it("renders the settings a published room actually declares", () => {
    // The exact combination on the first real room, BR-ISO-001.
    const chips = codMatchSettingChips(normalizeCodMatchSettings({
      revive: "enabled",
      limitedAmmo: false,
      zoneSpeed: "fast",
      doubleGroundLoot: true,
      vehiclesEnabled: true,
    }));
    expect(chips.map((chip) => `${chip.label}: ${chip.value}`)).toEqual([
      "ریوایو: فعال",
      "لیمیتد امو: خاموش (تیر بی‌نهایت)",
      "سرعت زون: فست",
      "گان‌های روی زمین: دوبل",
      "وسائل نقلیه: فعال",
    ]);
  });

  it("omits settings the operator left unspecified instead of inventing a default", () => {
    // An unset toggle must not silently read as "off" on the room page.
    const chips = codMatchSettingChips(normalizeCodMatchSettings({ zoneSpeed: "normal" }));
    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe("zoneSpeed");
  });

  it("distinguishes false from absent for boolean toggles", () => {
    const explicitlyOff = codMatchSettingChips(normalizeCodMatchSettings({ vehiclesEnabled: false }));
    expect(explicitlyOff).toHaveLength(1);
    expect(explicitlyOff[0].value).toBe("غیرفعال");
    expect(codMatchSettingChips(normalizeCodMatchSettings({}))).toHaveLength(0);
  });

  it("highlights the settings that change how the match is played", () => {
    const chips = codMatchSettingChips(normalizeCodMatchSettings({
      revive: "disabled", zoneSpeed: "fast", vehiclesEnabled: false, limitedAmmo: true,
    }));
    const emphasised = chips.filter((chip) => chip.emphasis).map((chip) => chip.key);
    // No revives, a fast zone and no vehicles all change the game plan.
    // Limited ammo being on is the game's normal state, so it is not flagged.
    expect(emphasised).toEqual(["revive", "zoneSpeed", "vehiclesEnabled"]);
  });

  it("flags unlimited ammo, which is the setting players misread most", () => {
    // "limitedAmmo: false" means infinite ammo. Rendering that as an ordinary
    // grey chip loses the one lobby toggle players most need to notice.
    const byKey = Object.fromEntries(
      codMatchSettingChips(normalizeCodMatchSettings({ limitedAmmo: false })).map((c) => [c.key, c]),
    );
    expect(byKey.limitedAmmo.emphasis).toBe(true);
    const normalAmmo = Object.fromEntries(
      codMatchSettingChips(normalizeCodMatchSettings({ limitedAmmo: true })).map((c) => [c.key, c]),
    );
    expect(normalAmmo.limitedAmmo.emphasis).toBe(false);
  });

  it("flags every non-default toggle and leaves defaults quiet", () => {
    const emphasisOf = (settings: Record<string, unknown>) =>
      Object.fromEntries(codMatchSettingChips(normalizeCodMatchSettings(settings)).map((c) => [c.key, c.emphasis]));
    expect(emphasisOf({ revive: "enabled" })).toEqual({ revive: false });
    expect(emphasisOf({ revive: "auto" })).toEqual({ revive: true });
    expect(emphasisOf({ zoneSpeed: "normal" })).toEqual({ zoneSpeed: false });
    expect(emphasisOf({ doubleGroundLoot: true })).toEqual({ doubleGroundLoot: true });
    expect(emphasisOf({ doubleGroundLoot: false })).toEqual({ doubleGroundLoot: false });
    expect(emphasisOf({ vehiclesEnabled: true })).toEqual({ vehiclesEnabled: false });
  });

  it("survives garbage without throwing on a room page render", () => {
    expect(codMatchSettingChips(null)).toEqual([]);
    expect(codMatchSettingChips("nonsense")).toEqual([]);
    expect(codMatchSettingChips({ revive: "sometimes" })).toEqual([]);
  });

  it("produces a one-line summary for compact layouts", () => {
    const summary = codMatchSettingsSummary(normalizeCodMatchSettings({ revive: "auto", zoneSpeed: "fast" }));
    expect(summary).toBe("ریوایو: اتو ریوایو · سرعت زون: فست");
  });

  it("round-trips what the admin form submits", () => {
    // The form posts booleans derived from "on"/"off" selects and omits blanks.
    const submitted = { revive: "auto", limitedAmmo: false, doubleGroundLoot: true };
    const chips = codMatchSettingChips(normalizeCodMatchSettings(submitted));
    expect(chips.map((chip) => chip.key)).toEqual(["revive", "limitedAmmo", "doubleGroundLoot"]);
  });
});

describe("admin form to room page round trip", () => {
  /**
   * The admin form models each boolean toggle as ""/"on"/"off" so an operator can
   * leave a setting unstated. This mirrors the exact transform the form applies
   * before POSTing, then asserts what the room page will render.
   */
  function submitFromForm(form: {
    revive?: string; limitedAmmo?: string; zoneSpeed?: string;
    doubleGroundLoot?: string; vehiclesEnabled?: string;
  }) {
    return {
      ...(form.revive ? { revive: form.revive } : {}),
      ...(form.limitedAmmo ? { limitedAmmo: form.limitedAmmo === "on" } : {}),
      ...(form.zoneSpeed ? { zoneSpeed: form.zoneSpeed } : {}),
      ...(form.doubleGroundLoot ? { doubleGroundLoot: form.doubleGroundLoot === "on" } : {}),
      ...(form.vehiclesEnabled ? { vehiclesEnabled: form.vehiclesEnabled === "on" } : {}),
    };
  }

  it("carries every filled field through to a chip", () => {
    const chips = codMatchSettingChips(normalizeCodMatchSettings(submitFromForm({
      revive: "auto", limitedAmmo: "off", zoneSpeed: "fast", doubleGroundLoot: "on", vehiclesEnabled: "off",
    })));
    expect(chips.map((chip) => chip.key)).toEqual([
      "revive", "limitedAmmo", "zoneSpeed", "doubleGroundLoot", "vehiclesEnabled",
    ]);
  });

  it("shows nothing at all when the operator fills nothing in", () => {
    // A blank settings section must not render an empty card on the room page.
    expect(codMatchSettingChips(normalizeCodMatchSettings(submitFromForm({})))).toEqual([]);
  });

  it("keeps an explicit 'off' distinct from a blank field", () => {
    const off = codMatchSettingChips(normalizeCodMatchSettings(submitFromForm({ doubleGroundLoot: "off" })));
    expect(off).toHaveLength(1);
    expect(off[0].value).toBe("معمولی");
    expect(codMatchSettingChips(normalizeCodMatchSettings(submitFromForm({ doubleGroundLoot: "" })))).toHaveLength(0);
  });
});
