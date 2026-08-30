import { db } from "@/db";
import { sql } from "drizzle-orm";

export {
  PRIVATE_CHECKIN_GRACE_MINUTES,
  PRIVATE_CHECKIN_OPENS_MINUTES,
  PRIVATE_NO_SHOW_POLICY_TEXT,
  privateCancellationKeepsEntryFee,
  privateCheckInWindow,
} from "@/lib/private-tournament-attendance-policy";

let ensurePromise: Promise<void> | null = null;

async function createSchema(client: any) {
  await client.execute(sql.raw(`ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS attendance_status varchar(20) NOT NULL DEFAULT 'registered',
    ADD COLUMN IF NOT EXISTS no_show_at timestamp,
    ADD COLUMN IF NOT EXISTS cancellation_policy_accepted_at timestamp`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS registrations_tournament_attendance_idx ON registrations(tournament_id, attendance_status)`));
  await client.execute(sql.raw(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS end_date timestamp`));
}

export function ensurePrivateTournamentAttendanceSchema(client: any = db) {
  if (client !== db) return createSchema(client);
  if (!ensurePromise) {
    ensurePromise = createSchema(client).catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}
