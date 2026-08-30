create table if not exists honor_views (
  id uuid primary key default gen_random_uuid(),
  honor_id uuid not null references honors(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  visitor_key varchar(120) not null,
  ip_address varchar(45),
  user_agent varchar(300),
  created_at timestamp not null default now(),
  last_seen_at timestamp not null default now()
);

create unique index if not exists honor_views_honor_visitor_unique on honor_views(honor_id, visitor_key);
create index if not exists honor_views_honor_id_idx on honor_views(honor_id);
create index if not exists honor_views_user_id_idx on honor_views(user_id);

create table if not exists honor_likes (
  id uuid primary key default gen_random_uuid(),
  honor_id uuid not null references honors(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  visitor_key varchar(120) not null,
  ip_address varchar(45),
  user_agent varchar(300),
  created_at timestamp not null default now()
);

create unique index if not exists honor_likes_honor_visitor_unique on honor_likes(honor_id, visitor_key);
create index if not exists honor_likes_honor_id_idx on honor_likes(honor_id);
create index if not exists honor_likes_user_id_idx on honor_likes(user_id);
