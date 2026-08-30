ALTER TABLE public.clash_1v1_entries
  ADD COLUMN IF NOT EXISTS qr_file_id varchar(255);

CREATE INDEX IF NOT EXISTS clash_1v1_entries_queue_artifact_idx
  ON public.clash_1v1_entries (status, submitted_at)
  WHERE invite_link IS NOT NULL OR qr_file_id IS NOT NULL;

-- Legacy hand-made 1v1 rooms are not the automated matchmaking queue.
UPDATE public.tournaments
SET status = 'cancelled',
    room_id = NULL,
    room_password = NULL,
    room_visible_at = NULL,
    updated_at = now()
WHERE game = 'clash_royale'
  AND category_label IS DISTINCT FROM 'clash_1v1_queue'
  AND lower(replace(name, ' ', '')) IN ('1v1', '1v1کلشرویال');
