-- Price estimator: admin-configurable unit prices per game/field.
-- Idempotent.

CREATE TABLE IF NOT EXISTS price_estimator_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game game_type NOT NULL,
  field_key varchar(60) NOT NULL,
  unit_price_rial numeric(20, 0) NOT NULL DEFAULT '0',
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS price_estimator_rates_game_field_idx
  ON price_estimator_rates (game, field_key);
