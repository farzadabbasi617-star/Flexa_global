import { Api, GrammyError, HttpError, type RawApi } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import logger from "@/lib/logger";

export interface TelegramApiSuccess<T = unknown> {
  ok: true;
  result: T;
}

export interface TelegramApiFailure {
  ok: false;
  error_code?: number;
  description: string;
  parameters?: Record<string, unknown>;
}

export type TelegramApiResult<T = unknown> = TelegramApiSuccess<T> | TelegramApiFailure;

// The raw API exposes these methods without a payload argument. Existing Flexa
// call sites pass `{}` to every method, so the adapter strips it for this set.
const NO_PAYLOAD_METHODS = new Set([
  "close",
  "getAvailableGifts",
  "getForumTopicIconStickers",
  "getMe",
  "getMyStarBalance",
  "getWebhookInfo",
  "logOut",
  "removeMyProfilePhoto",
]);

let cachedToken = "";
let cachedApi: Api | null = null;

/**
 * Build the shared outgoing Telegram API client.
 *
 * - throttler: queues calls per chat and keeps broadcasts within Telegram's
 *   documented flood limits;
 * - autoRetry: handles retry_after, transient 5xx responses and network errors;
 * - bounded retries: a bad Telegram outage cannot keep a Render request alive
 *   forever.
 */
export function createTelegramApiClient(token: string): Api {
  const api = new Api(token, {
    // Never include the bot token in networking error logs.
    sensitiveLogs: false,
  });

  api.config.use(apiThrottler());
  api.config.use(autoRetry({
    maxDelaySeconds: 20,
    maxRetryAttempts: 3,
  }));

  return api;
}

function getTelegramApiClient(token: string): Api {
  if (!cachedApi || cachedToken !== token) {
    cachedApi = createTelegramApiClient(token);
    cachedToken = token;
  }
  return cachedApi;
}

type DynamicRawApi = Record<string, (payload?: Record<string, unknown>) => Promise<unknown>>;

/**
 * Backwards-compatible adapter for the project's existing `telegramApi(method,
 * payload)` calls. Keeping the old result envelope lets us add grammY safely
 * without rewriting the large webhook in one risky deploy.
 */
export async function telegramApi<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {}
): Promise<TelegramApiResult<T>> {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    logger.warn("BOT_TOKEN is missing; cannot call Telegram API");
    return { ok: false, description: "BOT_TOKEN is missing" };
  }

  try {
    const api = getTelegramApiClient(token);
    const raw = api.raw as RawApi as unknown as DynamicRawApi;
    const operation = raw[method];

    if (typeof operation !== "function") {
      logger.warn({ method }, "Unknown Telegram API method");
      return { ok: false, description: `Unknown Telegram API method: ${method}` };
    }

    const result = NO_PAYLOAD_METHODS.has(method)
      ? await operation()
      : await operation(payload);

    return { ok: true, result: result as T };
  } catch (error) {
    if (error instanceof GrammyError) {
      logger.warn(
        { method, errorCode: error.error_code, description: error.description },
        "Telegram API call rejected"
      );
      return {
        ok: false,
        error_code: error.error_code,
        description: error.description,
        parameters: error.parameters as Record<string, unknown>,
      };
    }

    if (error instanceof HttpError) {
      logger.warn({ method, error: error.message }, "Telegram API network failure");
      return { ok: false, description: "Telegram API network failure" };
    }

    logger.error({ method, error }, "Unexpected Telegram API failure");
    return { ok: false, description: "Unexpected Telegram API failure" };
  }
}
