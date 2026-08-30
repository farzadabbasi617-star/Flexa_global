import logger from "@/lib/logger";

const N8N_BASE = process.env.N8N_WEBHOOK_BASE || process.env.N8N_WEBHOOK_URL || "";
const N8N_SECRET = process.env.N8N_WEBHOOK_SECRET || "";

interface N8nTriggerPayload {
  event: string;
  tournamentId?: string;
  data?: Record<string, any>;
  timestamp?: string;
}

export async function triggerN8nWorkflow(
  workflowPath: string,
  payload: N8nTriggerPayload
): Promise<{ success: boolean; error?: string }> {
  if (!N8N_BASE) {
    logger.debug("N8N_WEBHOOK_BASE not configured. Skipping n8n trigger.");
    return { success: true, error: "n8n not configured" };
  }

  const url = `${N8N_BASE.replace(/\/$/, "")}${workflowPath.startsWith("/") ? workflowPath : "/" + workflowPath}`;

  try {
    const body = {
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
      source: "flexa",
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(N8N_SECRET ? { "x-n8n-secret": N8N_SECRET } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, url, text }, "n8n webhook call failed");
      return { success: false, error: `HTTP ${res.status}` };
    }

    logger.info({ event: payload.event, tournamentId: payload.tournamentId, url }, "n8n workflow triggered successfully");
    return { success: true };
  } catch (err: any) {
    logger.error({ err, url }, "Failed to trigger n8n workflow");
    return { success: false, error: err.message };
  }
}

export const N8N_EVENTS = {
  TOURNAMENT_CREATED: "/flexa-tournament-created",
  TOURNAMENT_UPDATED: "/flexa-tournament-updated",
  TOURNAMENT_STARTED: "/flexa-tournament-started",
  TOURNAMENT_COMPLETED: "/flexa-tournament-completed",
  REMINDER_24H: "/flexa-reminder-24h",
  REMINDER_1H: "/flexa-reminder-1h",
} as const;

export async function notifyN8nTournamentCreated(tournament: any) {
  return triggerN8nWorkflow(N8N_EVENTS.TOURNAMENT_CREATED, {
    event: "tournament.created",
    tournamentId: tournament.id,
    data: {
      id: tournament.id,
      name: tournament.name,
      game: tournament.game,
      startDate: tournament.startDate,
      entryFee: tournament.entryFee,
      prizePool: tournament.prizePool,
      maxPlayers: tournament.maxPlayers,
      bannerUrl: tournament.bannerUrl,
      description: tournament.description,
    },
  });
}

export async function notifyN8nTournamentStatusChange(tournamentId: string, newStatus: string, oldStatus?: string) {
  const event = newStatus === "in_progress" 
    ? N8N_EVENTS.TOURNAMENT_STARTED 
    : newStatus === "completed" 
      ? N8N_EVENTS.TOURNAMENT_COMPLETED 
      : N8N_EVENTS.TOURNAMENT_UPDATED;

  return triggerN8nWorkflow(event, {
    event: `tournament.${newStatus}`,
    tournamentId,
    data: { status: newStatus, previousStatus: oldStatus },
  });
}

// New: Trigger specific reminder
export async function triggerTournamentReminder(tournamentId: string, type: '24h' | '1h') {
  const path = type === '24h' ? N8N_EVENTS.REMINDER_24H : N8N_EVENTS.REMINDER_1H;
  return triggerN8nWorkflow(path, {
    event: `tournament.reminder.${type}`,
    tournamentId,
    data: { reminderType: type },
  });
}
