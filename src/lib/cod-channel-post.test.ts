import { describe, expect, it } from "vitest";
import { formatCodCheckInReminder, formatCodRoomChannelPost } from "./cod-channel-post";

const toRial = (toman: number) => String(BigInt(toman) * BigInt(10));

// The first real room, BR-ISO-001.
const brRoom = {
  id: "12b97a75-8095-4057-bef1-687b9b759890",
  title: "BR-ISO-001",
  map: "isolated",
  teamMode: "squad",
  capacity: 100,
  entryFeeRial: toRial(23_000),
  minCodLevel: 50,
  topPrizeRial: toRial(400_000),
  totalPrizeRial: toRial(1_590_000),
  startsAt: new Date("2026-08-01T17:30:00.000Z"),
};

describe("room announcement", () => {
  it("leads with the facts that decide whether to join", () => {
    const post = formatCodRoomChannelPost(brRoom);
    expect(post).toContain("BR-ISO-001");
    expect(post).toContain("۲۵ تیم چهار نفره");
    expect(post).toContain("۲۳٬۰۰۰ USDT");
    expect(post).toContain("جایزه تیم اول");
    expect(post).toContain("۴۰۰٬۰۰۰ USDT");
    expect(post).toContain("حداقل لول اکانت کالاف");
  });

  it("repeats the full-lobby caveat the room page shows", () => {
    // The channel must not promise more than the room page does.
    expect(formatCodRoomChannelPost(brRoom)).toContain("در صورت تکمیل ظرفیت");
  });

  it("says نفر اول for a solo room and counts seats, not squads", () => {
    const post = formatCodRoomChannelPost({ ...brRoom, teamMode: "solo", capacity: 40 });
    expect(post).toContain("۴۰ نفر");
    expect(post).toContain("جایزه نفر اول");
    expect(post).not.toContain("تیم اول");
  });

  it("counts duo lobbies in pairs", () => {
    expect(formatCodRoomChannelPost({ ...brRoom, teamMode: "duo", capacity: 40 }))
      .toContain("۲۰ تیم دو نفره");
  });

  it("adds urgency once seats start selling", () => {
    const post = formatCodRoomChannelPost({ ...brRoom, registeredCount: 72 });
    expect(post).toContain("۲۸ جایگاه");
  });

  it("stays quiet about remaining seats on an untouched or full room", () => {
    // "100 seats left" on a brand new room reads as nobody wants this.
    expect(formatCodRoomChannelPost({ ...brRoom, registeredCount: 0 })).not.toContain("باقی مانده");
    expect(formatCodRoomChannelPost({ ...brRoom, registeredCount: 100 })).not.toContain("باقی مانده");
  });

  it("omits optional lines rather than printing zeros", () => {
    const bare = formatCodRoomChannelPost({
      ...brRoom, minCodLevel: 0, topPrizeRial: "0",
    });
    expect(bare).not.toContain("حداقل لول");
    expect(bare).not.toContain("جایزه تیم اول");
  });

  it("escapes HTML so a room title cannot break the message", () => {
    const post = formatCodRoomChannelPost({ ...brRoom, title: "<b>hack</b> & run" });
    expect(post).toContain("&lt;b&gt;hack&lt;/b&gt; &amp; run");
    expect(post).not.toContain("<b>hack</b>");
  });

  it("renders the start time in Tehran time", () => {
    // 17:30 UTC is 21:00 in Tehran.
    expect(formatCodRoomChannelPost(brRoom)).toContain("۲۱:۰۰");
  });
});

describe("check-in reminder", () => {
  it("tells the player what happens if they ignore it", () => {
    const reminder = formatCodCheckInReminder(brRoom);
    expect(reminder).toContain("Check-in");
    expect(reminder).toContain("جایگاهت آزاد می‌شود");
    expect(reminder).toContain("۲۱:۰۰");
  });

  it("escapes the title here too", () => {
    expect(formatCodCheckInReminder({ ...brRoom, title: "<i>x</i>" })).toContain("&lt;i&gt;x&lt;/i&gt;");
  });
});
