-- Offer / Request Marketplace schema (draft)

create table users (
  id uuid primary key,
  role text not null check (role in ('customer', 'vendor', 'admin')),
  email text not null unique,
  full_name text not null,
  password_hash text,
  auth_provider text default 'local',
  created_at timestamptz not null default now()
);

create table vendor_profiles (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  business_name text not null,
  city text,
  website_url text,
  portfolio_url text,
  business_intro text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'rejected')),
  document_url text,
  created_at timestamptz not null default now()
);

create table service_requests (
  id uuid primary key,
  customer_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  budget numeric(12,2) not null check (budget > 0),
  event_date date,
  status text not null default 'open'
    check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table request_services (
  id uuid primary key,
  request_id uuid not null references service_requests(id) on delete cascade,
  category text not null
    check (category in ('dj', 'catering', 'makeup', 'decorations', 'photography')),
  guest_count integer
);

create table vendor_offers (
  id uuid primary key,
  request_id uuid not null references service_requests(id) on delete cascade,
  vendor_id uuid not null references users(id) on delete cascade,
  price numeric(12,2) not null check (price > 0),
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'ignored', 'withdrawn')),
  created_at timestamptz not null default now()
);

-- If one offer is accepted, request should be closed in app logic.
-- Also set all other pending offers on same request to ignored.

