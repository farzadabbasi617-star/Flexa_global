-- One-time privacy migration. Runtime deployment performs the same guarded
-- operation through ensurePublicIdentitySeparation(); this file documents it
-- for operators and disaster recovery.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM site_settings WHERE key = 'public_identity_separation_v1'
  ) THEN
    INSERT INTO site_settings (id, key, value, updated_at)
    VALUES (gen_random_uuid(), 'public_identity_separation_v1', now()::text, now());

    UPDATE users
    SET display_name = username
    WHERE username IS NOT NULL
      AND btrim(username) <> ''
      AND btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))) <> ''
      AND lower(btrim(display_name)) = lower(btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))));

    UPDATE players AS player
    SET display_name = app_user.display_name,
        avatar_url = app_user.avatar_url
    FROM users AS app_user
    WHERE player.user_id = app_user.id
      AND (
        player.display_name IS DISTINCT FROM app_user.display_name
        OR player.avatar_url IS DISTINCT FROM app_user.avatar_url
      );
  END IF;
END $$;

COMMIT;
