-- Raha initial schema. PostgreSQL 14+ with PostGIS.
-- Enumerations are `text` + CHECK so they can evolve with a one-line migration.
-- Keep the lists below in sync with packages/contracts/src/enums.ts.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ───────────────────────────── identity & access ─────────────────────────────

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone            text NOT NULL UNIQUE,                       -- E.164, +2519XXXXXXXX
  email            text,
  full_name        text NOT NULL,
  language         text NOT NULL DEFAULT 'en' CHECK (language IN ('en','am')),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  is_staff         boolean NOT NULL DEFAULT false,             -- Raha operations
  staff_role       text CHECK (staff_role IN ('support','verifier','finance','admin')),
  password_hash    text,                                       -- staff only
  telegram_chat_id text,
  notify_telegram  boolean NOT NULL DEFAULT true,
  notify_sms       boolean NOT NULL DEFAULT true,
  notify_call      boolean NOT NULL DEFAULT false,
  data_saver       boolean NOT NULL DEFAULT true,
  app_last_seen_at timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_role_required CHECK (is_staff = false OR staff_role IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  purpose     text NOT NULL DEFAULT 'login',
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_idx ON otp_codes (phone, created_at DESC);

CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  app          text NOT NULL CHECK (app IN ('web','driver','ops')),
  device_name  text,
  user_agent   text,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE device_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  platform     text NOT NULL DEFAULT 'android',
  app_version  text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── organizations ─────────────────────────────

CREATE TABLE organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                text NOT NULL CHECK (type IN ('shipper','fleet','brokerage')),
  name                text NOT NULL,
  name_am             text,
  tin                 text,
  trade_licence_no    text,
  city                text,
  address             text,
  phone               text,
  verification_status text NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','pending','verified','rejected','expired')),
  verified_at         timestamptz,
  managed_by_org_id   uuid REFERENCES organizations(id),      -- shipper accounts a broker keeps for phone customers
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organizations_type_idx ON organizations (type);
CREATE INDEX organizations_managed_by_idx ON organizations (managed_by_org_id);

CREATE TABLE memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('owner','manager','staff','dispatcher','driver')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended','removed')),
  invited_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);
CREATE INDEX memberships_org_idx ON memberships (organization_id);

-- ───────────────────────────── geography ─────────────────────────────

CREATE TABLE places (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  name_am    text,
  kind       text NOT NULL DEFAULT 'town' CHECK (kind IN ('city','town','terminal','port')),
  region     text,
  location   geography(Point,4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX places_location_gix ON places USING GIST (location);

CREATE TABLE corridors (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL UNIQUE,                  -- ADD-HWS
  name                 text NOT NULL,                         -- Addis ⇄ Hawassa
  origin_place_id      uuid NOT NULL REFERENCES places(id),
  destination_place_id uuid NOT NULL REFERENCES places(id),
  distance_km          numeric(7,1) NOT NULL,
  via                  text,
  route                geography(LineString,4326),            -- built from stops, used for on-the-way matching
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX corridors_route_gix ON corridors USING GIST (route);

CREATE TABLE corridor_stops (
  corridor_id    uuid NOT NULL REFERENCES corridors(id) ON DELETE CASCADE,
  place_id       uuid NOT NULL REFERENCES places(id),
  seq            int  NOT NULL,
  km_from_origin numeric(7,1) NOT NULL,
  PRIMARY KEY (corridor_id, place_id),
  UNIQUE (corridor_id, seq)
);

-- ───────────────────────────── drivers & vehicles ─────────────────────────────

CREATE TABLE driver_profiles (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  licence_number      text,
  licence_grade       text,
  licence_expiry      date,
  fayda_id_last4      text,
  home_place_id       uuid REFERENCES places(id),
  available           boolean NOT NULL DEFAULT true,
  return_alerts       boolean NOT NULL DEFAULT true,               -- push when a load fits the empty return leg
  verification_status text NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','pending','verified','rejected','expired')),
  verified_at         timestamptz,
  trips_completed     int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_org_id        uuid NOT NULL REFERENCES organizations(id),
  plate               text NOT NULL UNIQUE,
  make_model          text NOT NULL,
  year                int,
  body_type           text NOT NULL DEFAULT 'dry_box'
                      CHECK (body_type IN ('dry_box','flatbed','tipper','refrigerated','tanker','container','pickup')),
  max_load_kg         int NOT NULL CHECK (max_load_kg > 0),
  box_volume_m3       numeric(6,1),
  current_load_kg     int NOT NULL DEFAULT 0 CHECK (current_load_kg >= 0),
  status              text NOT NULL DEFAULT 'available' CHECK (status IN ('available','on_trip','loading','off_road')),
  status_note         text,
  current_driver_id   uuid REFERENCES users(id),
  home_place_id       uuid REFERENCES places(id),
  verification_status text NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','pending','verified','rejected','expired')),
  verified_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_owner_idx ON vehicles (owner_org_id);
CREATE UNIQUE INDEX vehicles_one_vehicle_per_driver ON vehicles (current_driver_id) WHERE current_driver_id IS NOT NULL;

CREATE TABLE broker_network (
  broker_org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id    uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (broker_org_id, vehicle_id)
);

-- ───────────────────────────── verification ─────────────────────────────

CREATE TABLE verification_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type  text NOT NULL CHECK (subject_type IN ('driver','vehicle','organization')),
  subject_id    uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_review','approved','rejected','needs_reupload')),
  submitted_by  uuid REFERENCES users(id),
  assigned_to   uuid REFERENCES users(id),
  decided_by    uuid REFERENCES users(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_cases_queue_idx ON verification_cases (status, created_at);
CREATE INDEX verification_cases_subject_idx ON verification_cases (subject_type, subject_id);
-- at most one open case per subject
CREATE UNIQUE INDEX verification_cases_one_open ON verification_cases (subject_type, subject_id)
  WHERE status IN ('pending','in_review','needs_reupload');

CREATE TABLE verification_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id   uuid NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('driving_licence','fayda_id','selfie','insurance','libre','vehicle_photo','trade_licence','tin_certificate')),
  file_key     text,
  number       text,
  expires_on   date,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note  text,
  uploaded_by  uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_documents_case_idx ON verification_documents (case_id);
CREATE INDEX verification_documents_expiry_idx ON verification_documents (subject_type, subject_id, kind, expires_on);

-- ───────────────────────────── capacity, shipments, matches ─────────────────────────────

CREATE SEQUENCE shipment_ref_seq START 8800;
CREATE SEQUENCE trip_ref_seq START 5200;
CREATE SEQUENCE issue_ref_seq START 300;

CREATE TABLE capacity_posts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id           uuid NOT NULL REFERENCES vehicles(id),
  driver_id            uuid REFERENCES users(id),
  fleet_org_id         uuid NOT NULL REFERENCES organizations(id),
  broker_org_id        uuid REFERENCES organizations(id),     -- posted on behalf of an independent owner
  posted_by            uuid REFERENCES users(id),
  posted_via           text NOT NULL DEFAULT 'app' CHECK (posted_via IN ('app','fleet','broker','telegram','ops')),
  kind                 text NOT NULL CHECK (kind IN ('on_route','return_leg','dedicated')),
  corridor_id          uuid REFERENCES corridors(id),
  origin_place_id      uuid NOT NULL REFERENCES places(id),
  destination_place_id uuid NOT NULL REFERENCES places(id),
  route                geography(LineString,4326),            -- origin -> destination along the corridor; drives on-the-way matching
  route_km             numeric(7,1),                          -- road km origin -> destination (corridor km marks, or straight line x 1.35)
  departs_at           timestamptz NOT NULL,
  eta_at               timestamptz,
  total_capacity_kg    int NOT NULL CHECK (total_capacity_kg > 0),
  committed_kg         int NOT NULL DEFAULT 0 CHECK (committed_kg >= 0),   -- own contracts already aboard
  matched_kg           int NOT NULL DEFAULT 0 CHECK (matched_kg >= 0),     -- confirmed Raha matches
  free_volume_m3       numeric(6,1),
  asking_per_tonne_etb numeric(12,2),                         -- optional carrier rate; otherwise Raha reference pricing applies
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','full','departed','closed','expired','cancelled')),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capacity_not_overbooked CHECK (committed_kg + matched_kg <= total_capacity_kg),
  CONSTRAINT capacity_distinct_ends CHECK (origin_place_id <> destination_place_id)
);
CREATE INDEX capacity_posts_open_idx ON capacity_posts (status, departs_at);
CREATE INDEX capacity_posts_route_gix ON capacity_posts USING GIST (route);
CREATE INDEX capacity_posts_vehicle_idx ON capacity_posts (vehicle_id);
CREATE INDEX capacity_posts_fleet_idx ON capacity_posts (fleet_org_id);

CREATE TABLE trips (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                   text NOT NULL UNIQUE,
  vehicle_id            uuid NOT NULL REFERENCES vehicles(id),
  driver_id             uuid NOT NULL REFERENCES users(id),
  fleet_org_id          uuid NOT NULL REFERENCES organizations(id),
  capacity_post_id      uuid REFERENCES capacity_posts(id),
  corridor_id           uuid REFERENCES corridors(id),
  origin_place_id       uuid NOT NULL REFERENCES places(id),
  destination_place_id  uuid NOT NULL REFERENCES places(id),
  status                text NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned','to_pickup','loading','in_transit','completed','cancelled')),
  planned_departure_at  timestamptz,
  departed_at           timestamptz,
  completed_at          timestamptz,
  eta_at                timestamptz,
  last_place_id         uuid REFERENCES places(id),
  last_checkin_at       timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trips_status_idx ON trips (status);
CREATE INDEX trips_driver_idx ON trips (driver_id, status);
CREATE INDEX trips_fleet_idx ON trips (fleet_org_id, status);
CREATE INDEX trips_vehicle_idx ON trips (vehicle_id);

CREATE TABLE shipments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                  text NOT NULL UNIQUE,
  shipper_org_id       uuid NOT NULL REFERENCES organizations(id),
  created_by           uuid REFERENCES users(id),
  logged_by_org_id     uuid REFERENCES organizations(id),     -- broker that logged it (phone / Telegram)
  source               text NOT NULL DEFAULT 'app' CHECK (source IN ('app','phone','telegram','broker','fleet','ops')),
  pickup_place_id      uuid NOT NULL REFERENCES places(id),
  pickup_address       text NOT NULL,
  pickup_point         geography(Point,4326),
  pickup_contact_name  text,
  pickup_contact_phone text,
  dropoff_place_id     uuid NOT NULL REFERENCES places(id),
  dropoff_address      text NOT NULL,
  dropoff_point        geography(Point,4326),
  receiver_name        text NOT NULL,
  receiver_phone       text NOT NULL,
  cargo_type           text NOT NULL,
  cargo_description    text,
  pieces               int,
  weight_kg            int NOT NULL CHECK (weight_kg > 0),
  volume_m3            numeric(7,2),
  requirements         text[] NOT NULL DEFAULT '{}',
  ready_at             timestamptz NOT NULL,
  ready_until          timestamptz,
  status               text NOT NULL DEFAULT 'requested'
                       CHECK (status IN ('requested','matched','in_transit','delivered','cancelled')),
  agreed_price_etb     numeric(12,2),
  match_id             uuid,                                  -- confirmed match (FK added below)
  trip_id              uuid REFERENCES trips(id),
  receiver_code        text NOT NULL UNIQUE,                  -- unguessable id in raha.et/r/<code>
  pin_hash             text,
  pin_salt             text,
  pin_enc              text,                                  -- AES-GCM, lets support re-send the PIN
  pin_attempts         int NOT NULL DEFAULT 0,
  pin_verified_at      timestamptz,
  delivered_at         timestamptz,
  cancelled_at         timestamptz,
  cancel_reason        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_shipper_idx ON shipments (shipper_org_id, status);
CREATE INDEX shipments_open_idx ON shipments (status, ready_at);
CREATE INDEX shipments_logged_by_idx ON shipments (logged_by_org_id);
CREATE INDEX shipments_trip_idx ON shipments (trip_id);
CREATE INDEX shipments_pickup_gix ON shipments USING GIST (pickup_point);
CREATE INDEX shipments_dropoff_gix ON shipments USING GIST (dropoff_point);

CREATE TABLE matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id         uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  capacity_post_id    uuid NOT NULL REFERENCES capacity_posts(id),
  trip_id             uuid REFERENCES trips(id),
  status              text NOT NULL CHECK (status IN ('pending_carrier','pending_shipper','confirmed','declined','expired','cancelled')),
  proposed_by         text NOT NULL CHECK (proposed_by IN ('shipper','carrier','broker','fleet','system','ops')),
  proposed_by_user    uuid REFERENCES users(id),
  proposed_by_org     uuid REFERENCES organizations(id),
  price_etb           numeric(12,2) NOT NULL CHECK (price_etb >= 0),
  broker_fee_etb      numeric(12,2) NOT NULL DEFAULT 0,
  fit_kind            text NOT NULL CHECK (fit_kind IN ('same_trip','empty_return','partial','dedicated')),
  is_raha_match       boolean NOT NULL DEFAULT true,          -- false = the fleet's own contract load
  score               numeric(5,2),
  score_detail        jsonb,
  off_route_km        numeric(6,1),
  expires_at          timestamptz,
  responded_by        uuid REFERENCES users(id),
  responded_at        timestamptz,
  decline_reason      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX matches_one_live_per_pair ON matches (shipment_id, capacity_post_id)
  WHERE status IN ('pending_carrier','pending_shipper','confirmed');
CREATE UNIQUE INDEX matches_one_confirmed_per_shipment ON matches (shipment_id) WHERE status = 'confirmed';
CREATE INDEX matches_post_idx ON matches (capacity_post_id, status);
CREATE INDEX matches_status_idx ON matches (status, created_at);

ALTER TABLE shipments ADD CONSTRAINT shipments_match_fk FOREIGN KEY (match_id) REFERENCES matches(id);

CREATE TABLE trip_loads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  shipment_id      uuid NOT NULL UNIQUE REFERENCES shipments(id),
  match_id         uuid REFERENCES matches(id),
  is_raha_match    boolean NOT NULL DEFAULT true,
  weight_kg        int NOT NULL,
  drop_order       int NOT NULL DEFAULT 1,
  status           text NOT NULL DEFAULT 'assigned'
                   CHECK (status IN ('assigned','arrived_pickup','picked_up','in_transit','delivered','failed')),
  pickup_checklist jsonb,
  arrived_pickup_at timestamptz,
  picked_up_at     timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_loads_trip_idx ON trip_loads (trip_id, drop_order);

CREATE TABLE trip_checkins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  place_id      uuid NOT NULL REFERENCES places(id),
  client_id     uuid NOT NULL,                                -- idempotency key generated on the device
  channel       text NOT NULL DEFAULT 'app' CHECK (channel IN ('app','sms','telegram','ops')),
  checked_in_at timestamptz NOT NULL,                         -- device time
  received_at   timestamptz NOT NULL DEFAULT now(),           -- server time
  offline       boolean NOT NULL DEFAULT false,
  location      geography(Point,4326),                        -- one-shot fix at check-in only, never continuous
  note          text,
  UNIQUE (trip_id, client_id)
);
CREATE INDEX trip_checkins_trip_idx ON trip_checkins (trip_id, checked_in_at);

CREATE TABLE proofs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id   uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  trip_load_id  uuid REFERENCES trip_loads(id),
  kind          text NOT NULL CHECK (kind IN ('pickup_photo','waybill','delivery_photo','damage_photo')),
  file_key      text NOT NULL,
  client_id     uuid,
  bytes         int,
  taken_at      timestamptz NOT NULL,
  location      geography(Point,4326),
  uploaded_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, client_id)
);
CREATE INDEX proofs_shipment_idx ON proofs (shipment_id, kind);

CREATE TABLE deliveries (
  shipment_id    uuid PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
  trip_load_id   uuid REFERENCES trip_loads(id),
  delivered_at   timestamptz NOT NULL,
  confirmed_by   text NOT NULL CHECK (confirmed_by IN ('pin','receiver_link','shipper_manual','ops')),
  pin_verified   boolean NOT NULL DEFAULT false,
  condition      text NOT NULL DEFAULT 'all_good' CHECK (condition IN ('all_good','short_count','damaged')),
  received_count int,
  expected_count int,
  notes          text,
  offline_synced boolean NOT NULL DEFAULT false,
  review_flag    text,                                        -- e.g. 'photo_blurry', 'no_pin', 'short_count'
  reviewed_at    timestamptz,
  reviewed_by    uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_review_idx ON deliveries (review_flag) WHERE reviewed_at IS NULL AND review_flag IS NOT NULL;

-- ───────────────────────────── money (records, not a wallet) ─────────────────────────────

CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id   uuid NOT NULL REFERENCES shipments(id),
  trip_id       uuid REFERENCES trips(id),
  payer_org_id  uuid NOT NULL REFERENCES organizations(id),
  payee_org_id  uuid NOT NULL REFERENCES organizations(id),
  recorded_by   uuid REFERENCES users(id),
  amount_etb    numeric(12,2) NOT NULL CHECK (amount_etb >= 0),
  method        text CHECK (method IN ('telebirr','cbe','bank','cash','other')),
  reference     text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','disputed','cancelled')),
  due_at        timestamptz,
  paid_at       timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_shipment_idx ON payments (shipment_id);
CREATE INDEX payments_payee_idx ON payments (payee_org_id, status);
CREATE INDEX payments_payer_idx ON payments (payer_org_id, status);

-- ───────────────────────────── communication ─────────────────────────────

CREATE TABLE notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
  recipient_phone text,                                       -- for receivers who have no account
  channel         text NOT NULL CHECK (channel IN ('in_app','push','sms','telegram','email')),
  type            text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','read','skipped')),
  attempts        int NOT NULL DEFAULT 0,
  error           text,
  send_after      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  read_at         timestamptz,
  dedupe_key      text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_has_recipient CHECK (user_id IS NOT NULL OR recipient_phone IS NOT NULL)
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_queue_idx ON notifications (status, send_after) WHERE status = 'queued';

CREATE TABLE shipment_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id    uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id),
  sender_name    text NOT NULL,
  sender_label   text,                                        -- "Driver", "Raha Ops", "Sheba Agro"
  channel        text NOT NULL DEFAULT 'app' CHECK (channel IN ('app','sms','telegram','system')),
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipment_messages_idx ON shipment_messages (shipment_id, created_at);

CREATE TABLE inbound_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id),              -- the broker whose inbox it lands in
  channel     text NOT NULL CHECK (channel IN ('telegram','sms','call','app')),
  from_name   text,
  from_phone  text,
  body        text NOT NULL,
  parsed      jsonb,
  handled_at  timestamptz,
  handled_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbound_messages_inbox_idx ON inbound_messages (org_id, handled_at, created_at DESC);

-- ───────────────────────────── support & audit ─────────────────────────────

CREATE TABLE issues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref             text NOT NULL UNIQUE,
  kind            text NOT NULL CHECK (kind IN ('dispute','late','match','support','safety','document')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','resolved','closed')),
  priority        int NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),   -- 1 = most urgent
  title           text NOT NULL,
  body            text,
  shipment_id     uuid REFERENCES shipments(id),
  trip_id         uuid REFERENCES trips(id),
  raised_by       uuid REFERENCES users(id),
  raised_by_org   uuid REFERENCES organizations(id),
  assigned_to     uuid REFERENCES users(id),
  resolution      text,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_hint     text,                                       -- 'Call driver', 'Verify & resend' ...
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX issues_queue_idx ON issues (status, priority, created_at);
CREATE INDEX issues_shipment_idx ON issues (shipment_id);

CREATE TABLE issue_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES users(id),
  body       text NOT NULL,
  internal   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  actor_id     uuid REFERENCES users(id),
  actor_type   text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user','staff','system')),
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
