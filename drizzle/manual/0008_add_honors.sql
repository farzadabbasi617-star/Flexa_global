-- Hall of Fame / Honors persistent storage
CREATE TABLE IF NOT EXISTS honors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(30) NOT NULL DEFAULT 'news',
  title varchar(255) NOT NULL,
  description text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  icon varchar(20) NOT NULL DEFAULT '🏆',
  image_url text,
  prize varchar(120),
  username varchar(100),
  level integer,
  highlight boolean NOT NULL DEFAULT false,
  game varchar(50),
  tournament_id uuid REFERENCES tournaments(id),
  user_id uuid REFERENCES users(id),
  created_by_id uuid REFERENCES users(id),
  approved_by_id uuid REFERENCES users(id),
  source varchar(50) NOT NULL DEFAULT 'manual',
  metadata jsonb,
  published_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS honors_status_idx ON honors(status);
CREATE INDEX IF NOT EXISTS honors_type_idx ON honors(type);
CREATE INDEX IF NOT EXISTS honors_game_idx ON honors(game);
CREATE INDEX IF NOT EXISTS honors_created_at_idx ON honors(created_at);
CREATE INDEX IF NOT EXISTS honors_published_at_idx ON honors(published_at);
