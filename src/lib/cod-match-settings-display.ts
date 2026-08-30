import type { CodMatchSettings } from "./cod-room-policy";

/**
 * Turns the structured lobby toggles into the short Persian phrases players
 * expect to read on a room page.
 *
 * Kept out of the component so both the room page and the admin preview render
 * identical wording, and so the mapping is unit-testable.
 */
export interface CodMatchSettingChip {
  key: keyof CodMatchSettings;
  label: string;
  value: string;
  /** True when the setting materially changes how the match is played. */
  emphasis: boolean;
}

const REVIVE_LABELS: Record<string, { value: string; emphasis: boolean }> = {
  disabled: { value: "غیرفعال", emphasis: true },
  enabled: { value: "فعال", emphasis: false },
  auto: { value: "اتو ریوایو", emphasis: true },
};

const ZONE_LABELS: Record<string, { value: string; emphasis: boolean }> = {
  slow: { value: "کند", emphasis: false },
  normal: { value: "نرمال", emphasis: false },
  fast: { value: "فست", emphasis: true },
};

export function codMatchSettingChips(input: unknown): CodMatchSettingChip[] {
  const settings = (input && typeof input === "object" ? input : {}) as Partial<CodMatchSettings>;
  const chips: CodMatchSettingChip[] = [];

  if (settings.revive) {
    const mapped = REVIVE_LABELS[settings.revive];
    if (mapped) chips.push({ key: "revive", label: "ریوایو", ...mapped });
  }
  if (typeof settings.limitedAmmo === "boolean") {
    chips.push({
      key: "limitedAmmo",
      label: "لیمیتد امو",
      value: settings.limitedAmmo ? "روشن" : "خاموش (تیر بی‌نهایت)",
      emphasis: !settings.limitedAmmo,
    });
  }
  if (settings.zoneSpeed) {
    const mapped = ZONE_LABELS[settings.zoneSpeed];
    if (mapped) chips.push({ key: "zoneSpeed", label: "سرعت زون", ...mapped });
  }
  if (typeof settings.doubleGroundLoot === "boolean") {
    chips.push({
      key: "doubleGroundLoot",
      label: "گان‌های روی زمین",
      value: settings.doubleGroundLoot ? "دوبل" : "معمولی",
      emphasis: settings.doubleGroundLoot,
    });
  }
  if (typeof settings.vehiclesEnabled === "boolean") {
    chips.push({
      key: "vehiclesEnabled",
      label: "وسائل نقلیه",
      value: settings.vehiclesEnabled ? "فعال" : "غیرفعال",
      emphasis: !settings.vehiclesEnabled,
    });
  }

  return chips;
}

/** One-line summary for a room card, where a chip grid would not fit. */
export function codMatchSettingsSummary(input: unknown) {
  return codMatchSettingChips(input).map((chip) => `${chip.label}: ${chip.value}`).join(" · ");
}
