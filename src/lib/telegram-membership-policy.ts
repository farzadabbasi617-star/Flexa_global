export interface TelegramChatMemberLike {
  status?: string;
  is_member?: boolean;
}

/** Telegram statuses that prove the user currently belongs to the channel. */
export function isActiveTelegramChannelMember(member: TelegramChatMemberLike | null | undefined) {
  if (!member?.status) return false;
  if (["creator", "administrator", "member"].includes(member.status)) return true;
  // A restricted member can still belong to a supergroup. Telegram exposes the
  // explicit is_member flag for this status; never infer it from status alone.
  return member.status === "restricted" && member.is_member === true;
}

/** getChatMember is guaranteed for other users only while the bot is an admin. */
export function canBotVerifyTelegramMembership(member: TelegramChatMemberLike | null | undefined) {
  return member?.status === "creator" || member?.status === "administrator";
}
