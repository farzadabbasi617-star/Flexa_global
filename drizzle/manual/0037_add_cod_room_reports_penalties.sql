-- COD Arena trust & safety layer.
-- Adds player reports, admin resolutions and penalties/fines/bans for custom rooms.

CREATE TABLE IF NOT EXISTS cod_room_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES cod_rooms(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  accused_entry_id uuid REFERENCES cod_room_entries(id),
  accused_user_id uuid REFERENCES users(id),
  accused_cod_username varchar(100),
  category varchar(32) NOT NULL,
  description text NOT NULL,
  evidence_url text,
  status varchar(24) NOT NULL DEFAULT 'pending',
  resolution varchar(40),
  admin_note text,
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cod_room_reports_category_check CHECK (category IN (
    'cheat', 'teaming', 'no_recording', 'banned_item', 'toxic_behavior', 'wrong_result', 'no_show', 'other'
  )),
  CONSTRAINT cod_room_reports_status_check CHECK (status IN ('pending', 'in_review', 'resolved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS cod_room_reports_room_status_idx ON cod_room_reports(room_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cod_room_reports_reporter_idx ON cod_room_reports(reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cod_room_reports_accused_user_idx ON cod_room_reports(accused_user_id, created_at DESC) WHERE accused_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cod_room_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES cod_rooms(id),
  report_id uuid REFERENCES cod_room_reports(id),
  entry_id uuid REFERENCES cod_room_entries(id),
  user_id uuid NOT NULL REFERENCES users(id),
  type varchar(24) NOT NULL,
  reason text NOT NULL,
  fine_rial numeric(20,0) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'active',
  starts_at timestamp NOT NULL DEFAULT now(),
  ends_at timestamp,
  created_by_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT cod_room_penalties_type_check CHECK (type IN ('warning', 'fine', 'temp_ban', 'permanent_ban', 'result_void')),
  CONSTRAINT cod_room_penalties_status_check CHECK (status IN ('active', 'paid', 'reversed', 'expired')),
  CONSTRAINT cod_room_penalties_fine_check CHECK (fine_rial >= 0)
);
CREATE INDEX IF NOT EXISTS cod_room_penalties_user_active_idx ON cod_room_penalties(user_id, status, starts_at DESC);
CREATE INDEX IF NOT EXISTS cod_room_penalties_room_idx ON cod_room_penalties(room_id, created_at DESC) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cod_room_penalties_report_idx ON cod_room_penalties(report_id) WHERE report_id IS NOT NULL;
