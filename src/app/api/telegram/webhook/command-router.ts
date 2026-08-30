export interface ParsedTelegramCommand {
  command: string;
  args: string[];
}

/** Parse `/command@BotName arg...` into a stable lowercase command key. */
export function parseTelegramCommand(text: string): ParsedTelegramCommand | null {
  const [rawCommand, ...args] = text.trim().split(/\s+/);
  if (!rawCommand?.startsWith("/")) return null;
  const command = rawCommand.split("@")[0].toLowerCase();
  if (!/^\/[a-z0-9_]+$/.test(command)) return null;
  return { command, args };
}
