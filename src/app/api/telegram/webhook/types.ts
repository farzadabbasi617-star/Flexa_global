export type BotState =
  | "idle"
  | "full_name"
  | "gamer_tag"
  | "phone"
  | "flexa_id"
  | "city"
  | "team"
  | "confirm"
  | "support_subject"
  | "support_message"
  | "wallet_deposit_amount"
  | "wallet_online_amount"
  | "wallet_deposit_tracking"
  | "wallet_deposit_receipt"
  | "clash_qr_submission"
  | "clash_1v1_qr_submission"
  | "dispute_reason"
  | "evidence_upload"
  | "cod_evidence_upload"
  | "cod_report_upload"
  | "cod_lobby_check";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type?: string;
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  contact?: {
    phone_number: string;
    user_id?: number;
  };
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
  }>;
  caption?: string;
  video?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
    duration?: number;
  };
  document?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface SessionData {
  game?: string;
  platform?: string;
  fullName?: string;
  gamerTag?: string;
  phoneNumber?: string;
  flexaId?: string;
  city?: string;
  teamName?: string;
  supportSubject?: string;
  walletDepositAmountToman?: string;
  walletDepositTracking?: string;
  disputeMatchId?: string;
  evidenceMatchId?: string;
  codRoomId?: string;
  codEvidenceKind?: string;
  codReportCategory?: string;
  qrTournamentId?: string;
  qrRegistrationId?: string;
  clash1v1EntryId?: string;
  selectedAdIds?: string[];
  pendingStartPayload?: string;
}

export interface BotSession {
  state: BotState;
  data: SessionData;
}
