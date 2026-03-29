-- ============================================================
-- Canopy MVP — Initial Schema Migration
-- ============================================================

-- 1. CUSTOM ENUM TYPES

CREATE TYPE user_role AS ENUM (
  'reporter',
  'worker',
  'utility_admin',
  'super_admin'
);

CREATE TYPE report_status AS ENUM (
  'submitted',
  'dispatched',
  'verified',
  'rejected',
  'work_order_created',
  'resolved'
);

CREATE TYPE bounty_status AS ENUM (
  'pending',
  'earned',
  'paid'
);

CREATE TYPE verification_status AS ENUM (
  'offered',
  'accepted',
  'declined',
  'en_route',
  'arrived',
  'completed',
  'failed'
);

CREATE TYPE errand_status AS ENUM (
  'open',
  'offered',
  'accepted',
  'picked_up',
  'delivered',
  'completed',
  'cancelled'
);

CREATE TYPE errand_photo_type AS ENUM (
  'pickup',
  'dropoff'
);

CREATE TYPE work_order_status AS ENUM (
  'open',
  'in_progress',
  'completed'
);

-- 2. TABLES

CREATE TABLE public.users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  phone         text,
  role          user_role NOT NULL DEFAULT 'reporter',
  full_name     text NOT NULL,
  is_online     boolean NOT NULL DEFAULT false,
  expo_push_token text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name    text NOT NULL UNIQUE,
  icon    text,
  active  boolean NOT NULL DEFAULT true
);

CREATE TABLE public.reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES public.categories(id),
  description     text,
  latitude        double precision NOT NULL,
  longitude       double precision NOT NULL,
  address         text,
  photo_url       text NOT NULL,
  status          report_status NOT NULL DEFAULT 'submitted',
  bounty_amount   numeric(10,2) NOT NULL DEFAULT 5.00,
  bounty_status   bounty_status NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  worker_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status        verification_status NOT NULL DEFAULT 'offered',
  photo_url     text,
  notes         text,
  offered_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.errands (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  item_description      text,
  item_quantity          integer NOT NULL DEFAULT 1,
  pickup_name           text,
  pickup_address        text NOT NULL,
  pickup_latitude       double precision NOT NULL,
  pickup_longitude      double precision NOT NULL,
  pickup_window_start   timestamptz,
  pickup_window_end     timestamptz,
  pickup_instructions   text,
  dropoff_address       text NOT NULL,
  dropoff_latitude      double precision NOT NULL,
  dropoff_longitude     double precision NOT NULL,
  dropoff_instructions  text,
  payout_amount         numeric(10,2) NOT NULL,
  distance_miles        numeric(6,2),
  status                errand_status NOT NULL DEFAULT 'open',
  worker_id             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.errand_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id   uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  worker_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        errand_photo_type NOT NULL,
  photo_url   text NOT NULL,
  latitude    double precision,
  longitude   double precision,
  taken_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.work_orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id                 uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  errand_id                 uuid REFERENCES public.errands(id) ON DELETE SET NULL,
  created_by                uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  utility_company           text,
  estimated_resolution_date date,
  notes                     text,
  status                    work_order_status NOT NULL DEFAULT 'open',
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- 3. INDEXES

CREATE INDEX idx_reports_reporter    ON public.reports(reporter_id);
CREATE INDEX idx_reports_status      ON public.reports(status);
CREATE INDEX idx_reports_location    ON public.reports(latitude, longitude);
CREATE INDEX idx_reports_created     ON public.reports(created_at DESC);

CREATE INDEX idx_verifications_report ON public.verifications(report_id);
CREATE INDEX idx_verifications_worker ON public.verifications(worker_id);
CREATE INDEX idx_verifications_status ON public.verifications(status);

CREATE INDEX idx_errands_status      ON public.errands(status);
CREATE INDEX idx_errands_worker      ON public.errands(worker_id);
CREATE INDEX idx_errands_posted_by   ON public.errands(posted_by);

CREATE INDEX idx_errand_photos_errand ON public.errand_photos(errand_id);

CREATE INDEX idx_work_orders_report  ON public.work_orders(report_id);
CREATE INDEX idx_work_orders_errand  ON public.work_orders(errand_id);
CREATE INDEX idx_work_orders_status  ON public.work_orders(status);

CREATE INDEX idx_users_role          ON public.users(role);
CREATE INDEX idx_users_online_workers ON public.users(is_online) WHERE role = 'worker';

-- 4. UPDATED_AT TRIGGER

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_errands_updated_at
  BEFORE UPDATE ON public.errands
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. ROW LEVEL SECURITY (RLS)

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.errands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.errand_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- USERS
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_select_admin" ON public.users FOR SELECT USING (current_user_role() IN ('utility_admin', 'super_admin'));
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK (id = auth.uid());

-- CATEGORIES
CREATE POLICY "categories_select_all" ON public.categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "categories_manage_admin" ON public.categories FOR ALL USING (current_user_role() = 'super_admin') WITH CHECK (current_user_role() = 'super_admin');

-- REPORTS
CREATE POLICY "reports_select_own" ON public.reports FOR SELECT USING (reporter_id = auth.uid());
CREATE POLICY "reports_select_workers" ON public.reports FOR SELECT USING (current_user_role() = 'worker' AND status IN ('submitted', 'dispatched'));
CREATE POLICY "reports_select_admin" ON public.reports FOR SELECT USING (current_user_role() IN ('utility_admin', 'super_admin'));
CREATE POLICY "reports_insert_reporter" ON public.reports FOR INSERT WITH CHECK (reporter_id = auth.uid() AND current_user_role() = 'reporter');
CREATE POLICY "reports_update_worker" ON public.reports FOR UPDATE USING (current_user_role() = 'worker' AND status IN ('submitted', 'dispatched'));
CREATE POLICY "reports_update_admin" ON public.reports FOR UPDATE USING (current_user_role() IN ('utility_admin', 'super_admin'));

-- VERIFICATIONS
CREATE POLICY "verifications_select_own" ON public.verifications FOR SELECT USING (worker_id = auth.uid());
CREATE POLICY "verifications_select_admin" ON public.verifications FOR SELECT USING (current_user_role() IN ('utility_admin', 'super_admin'));
CREATE POLICY "verifications_insert_worker" ON public.verifications FOR INSERT WITH CHECK (worker_id = auth.uid() AND current_user_role() = 'worker');
CREATE POLICY "verifications_update_own" ON public.verifications FOR UPDATE USING (worker_id = auth.uid());
CREATE POLICY "verifications_update_admin" ON public.verifications FOR UPDATE USING (current_user_role() IN ('utility_admin', 'super_admin'));

-- ERRANDS
CREATE POLICY "errands_select_worker" ON public.errands FOR SELECT USING (current_user_role() = 'worker' AND (status IN ('open', 'offered') OR worker_id = auth.uid()));
CREATE POLICY "errands_select_utility" ON public.errands FOR SELECT USING (current_user_role() = 'utility_admin' AND posted_by = auth.uid());
CREATE POLICY "errands_select_super" ON public.errands FOR SELECT USING (current_user_role() = 'super_admin');
CREATE POLICY "errands_insert_utility" ON public.errands FOR INSERT WITH CHECK (posted_by = auth.uid() AND current_user_role() IN ('utility_admin', 'super_admin'));
CREATE POLICY "errands_update_worker" ON public.errands FOR UPDATE USING (current_user_role() = 'worker' AND (worker_id = auth.uid() OR status IN ('open', 'offered')));
CREATE POLICY "errands_update_admin" ON public.errands FOR UPDATE USING (current_user_role() IN ('utility_admin', 'super_admin'));

-- ERRAND PHOTOS
CREATE POLICY "errand_photos_select_own" ON public.errand_photos FOR SELECT USING (worker_id = auth.uid());
CREATE POLICY "errand_photos_select_admin" ON public.errand_photos FOR SELECT USING (current_user_role() IN ('utility_admin', 'super_admin'));
CREATE POLICY "errand_photos_insert_worker" ON public.errand_photos FOR INSERT WITH CHECK (worker_id = auth.uid() AND current_user_role() = 'worker');

-- WORK ORDERS
CREATE POLICY "work_orders_select_utility" ON public.work_orders FOR SELECT USING (current_user_role() = 'utility_admin' AND created_by = auth.uid());
CREATE POLICY "work_orders_select_super" ON public.work_orders FOR SELECT USING (current_user_role() = 'super_admin');
CREATE POLICY "work_orders_insert_admin" ON public.work_orders FOR INSERT WITH CHECK (created_by = auth.uid() AND current_user_role() IN ('utility_admin', 'super_admin'));
CREATE POLICY "work_orders_update_admin" ON public.work_orders FOR UPDATE USING (current_user_role() IN ('utility_admin', 'super_admin'));

-- 6. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.verifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.errands;

-- 7. SEED DATA
INSERT INTO public.categories (name, icon, active) VALUES
  ('Downed Branch',      'tree',          true),
  ('Pothole',            'alert-circle',  true),
  ('Power Line Hazard',  'zap',           true),
  ('Street Light Out',   'lightbulb-off', true),
  ('Storm Damage',       'cloud-rain',    true),
  ('Other',              'help-circle',   true);
