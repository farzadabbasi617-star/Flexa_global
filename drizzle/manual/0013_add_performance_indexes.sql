-- Performance-only indexes for high-traffic public pages, wallet/admin panels,
-- Telegram automation and support. These statements do not modify or delete data.
-- NOTE: CREATE INDEX CONCURRENTLY must be run outside an explicit transaction.

create index concurrently if not exists site_images_active_category_sort_idx
  on site_images (is_active, category, sort_order);

create index concurrently if not exists notifications_user_read_created_idx
  on notifications (user_id, is_read, created_at desc);

create index concurrently if not exists tournaments_status_created_at_idx
  on tournaments (status, created_at desc);

create index concurrently if not exists tournaments_game_status_created_at_idx
  on tournaments (game, status, created_at desc);

create index concurrently if not exists tournaments_start_date_idx
  on tournaments (start_date)
  where start_date is not null;

create index concurrently if not exists registrations_user_registered_at_idx
  on registrations (user_id, registered_at desc);

create index concurrently if not exists registrations_tournament_checked_in_idx
  on registrations (tournament_id, checked_in_at);

create index concurrently if not exists matches_status_scheduled_at_idx
  on matches (status, scheduled_at)
  where scheduled_at is not null;

create index concurrently if not exists matches_tournament_status_idx
  on matches (tournament_id, status);

create index concurrently if not exists transactions_status_type_created_at_idx
  on transactions (status, type, created_at desc);

create index concurrently if not exists transactions_wallet_created_at_idx
  on transactions (wallet_id, created_at desc);

create index concurrently if not exists tickets_user_created_at_idx
  on tickets (user_id, created_at desc);

create index concurrently if not exists tickets_status_created_at_idx
  on tickets (status, created_at desc);

create index concurrently if not exists ticket_messages_ticket_created_at_idx
  on ticket_messages (ticket_id, created_at);

create index concurrently if not exists honors_status_highlight_published_idx
  on honors (status, highlight desc, published_at desc, created_at desc);

create index concurrently if not exists honors_status_game_created_idx
  on honors (status, game, created_at desc);

create index concurrently if not exists honor_content_views_content_created_idx
  on honor_content_views (content_id, created_at desc);

create index concurrently if not exists honor_content_likes_content_created_idx
  on honor_content_likes (content_id, created_at desc);

create index concurrently if not exists telegram_sent_notifications_type_created_idx
  on telegram_sent_notifications (type, created_at desc);
