create table if not exists honor_content_views (
  id uuid primary key default gen_random_uuid(),
  content_id varchar(120) not null,
  user_id uuid references users(id) on delete set null,
  visitor_key varchar(120) not null,
  ip_address varchar(45),
  user_agent varchar(300),
  created_at timestamp not null default now(),
  last_seen_at timestamp not null default now()
);

create unique index if not exists honor_content_views_content_visitor_unique on honor_content_views(content_id, visitor_key);
create index if not exists honor_content_views_content_id_idx on honor_content_views(content_id);

create table if not exists honor_content_likes (
  id uuid primary key default gen_random_uuid(),
  content_id varchar(120) not null,
  user_id uuid references users(id) on delete set null,
  visitor_key varchar(120) not null,
  ip_address varchar(45),
  user_agent varchar(300),
  created_at timestamp not null default now()
);

create unique index if not exists honor_content_likes_content_visitor_unique on honor_content_likes(content_id, visitor_key);
create index if not exists honor_content_likes_content_id_idx on honor_content_likes(content_id);

insert into honor_content_views (content_id, user_id, visitor_key, ip_address, user_agent, created_at, last_seen_at)
select honor_id::text, user_id, visitor_key, ip_address, user_agent, created_at, last_seen_at
from honor_views
on conflict (content_id, visitor_key) do nothing;

insert into honor_content_likes (content_id, user_id, visitor_key, ip_address, user_agent, created_at)
select honor_id::text, user_id, visitor_key, ip_address, user_agent, created_at
from honor_likes
on conflict (content_id, visitor_key) do nothing;
