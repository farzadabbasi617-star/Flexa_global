-- Price memory: learning cache of account valuations & real sales. Idempotent.

CREATE TABLE IF NOT EXISTS price_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game game_type NOT NULL,
  signature varchar(400) NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}',
  price_toman numeric(20, 0) NOT NULL,
  origin varchar(20) NOT NULL DEFAULT 'ai',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_memory_game_sig_idx ON price_memory (game, signature);
CREATE INDEX IF NOT EXISTS price_memory_game_origin_idx ON price_memory (game, origin);
