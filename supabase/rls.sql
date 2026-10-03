-- ==============================================================================
-- Brand Bucket Command Center — Supabase Row Level Security (RLS) Policies
-- Complete Production Security Specification (Fix 56c & 56j)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS FOR ROLE & BRAND CONTEXT
-- ------------------------------------------------------------------------------

-- Get current authenticated user's profile from users table
CREATE OR REPLACE FUNCTION auth.get_current_user()
RETURNS users AS $$
  SELECT * FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if current user is Super Admin or Admin
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
      AND active = TRUE 
      AND role IN ('SUPER_ADMIN', 'ADMIN')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if current user is Brand Manager for given brand
CREATE OR REPLACE FUNCTION auth.is_brand_manager_for(brand_code_check TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
      AND active = TRUE 
      AND role = 'BRAND_MANAGER' 
      AND brand_code_check = ANY(assigned_brands)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if current user is the owner / assigned sales officer
CREATE OR REPLACE FUNCTION auth.is_owner(officer_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT auth.uid() = officer_uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY ACROSS ALL TABLES
-- ------------------------------------------------------------------------------

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE beat_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheque_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE dynamic_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. ACTIVITY LOGS: IMMUTABLE APPEND-ONLY AUDIT TRAIL (Fix 56j)
-- No UPDATE or DELETE policy is defined. Ever. Even admins cannot edit history.
-- ------------------------------------------------------------------------------

-- Authenticated users can insert log entries
CREATE POLICY "activity_logs_insert" ON activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Super Admins and Admins can view full audit trail
CREATE POLICY "activity_logs_select_admin" ON activity_logs
  FOR SELECT TO authenticated
  USING (auth.is_admin());

-- Users can view their own activity entries
CREATE POLICY "activity_logs_select_own" ON activity_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 4. USERS TABLE POLICIES
-- ------------------------------------------------------------------------------

-- Admins can view all users
CREATE POLICY "users_select_admin" ON users
  FOR SELECT TO authenticated
  USING (auth.is_admin() OR id = auth.uid());

-- Super Admin and Admin can insert / update users
CREATE POLICY "users_write_admin" ON users
  FOR ALL TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- Users can update their own profile / password
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------------------------
-- 5. BRANDS & PRODUCTS CATALOG
-- ------------------------------------------------------------------------------

-- All active users can view brands
CREATE POLICY "brands_select_all" ON brands
  FOR SELECT TO authenticated
  USING (true);

-- Only Admins can modify brands
CREATE POLICY "brands_modify_admin" ON brands
  FOR ALL TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());

-- Products: Everyone can read active products
CREATE POLICY "products_select" ON products
  FOR SELECT TO authenticated
  USING (true);

-- Products: Admins & Brand Managers can manage products
CREATE POLICY "products_modify" ON products
  FOR ALL TO authenticated
  USING (
    auth.is_admin() OR 
    EXISTS (
      SELECT 1 FROM brands b 
      JOIN users u ON u.id = auth.uid() 
      WHERE b.id = products.brand_id 
        AND b.code = ANY(u.assigned_brands) 
        AND u.role = 'BRAND_MANAGER'
    )
  )
  WITH CHECK (
    auth.is_admin() OR 
    EXISTS (
      SELECT 1 FROM brands b 
      JOIN users u ON u.id = auth.uid() 
      WHERE b.id = products.brand_id 
        AND b.code = ANY(u.assigned_brands) 
        AND u.role = 'BRAND_MANAGER'
    )
  );

-- ------------------------------------------------------------------------------
-- 6. STORES, BRANCHES, RETAILERS
-- ------------------------------------------------------------------------------

CREATE POLICY "distributors_select" ON distributors FOR SELECT TO authenticated USING (true);
CREATE POLICY "distributors_modify" ON distributors FOR ALL TO authenticated USING (auth.is_admin()) WITH CHECK (auth.is_admin());

CREATE POLICY "branches_select" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "branches_modify" ON branches FOR ALL TO authenticated USING (auth.is_admin()) WITH CHECK (auth.is_admin());

CREATE POLICY "retailers_select" ON retailers FOR SELECT TO authenticated USING (true);
CREATE POLICY "retailers_modify" ON retailers FOR ALL TO authenticated USING (auth.is_admin()) WITH CHECK (auth.is_admin());

-- ------------------------------------------------------------------------------
-- 7. BEAT PLANS & GPS VISITS (Field Sales)
-- ------------------------------------------------------------------------------

-- Beat plans: Admin views all, Sales Officer only views own
CREATE POLICY "beat_plans_select" ON beat_plans
  FOR SELECT TO authenticated
  USING (
    auth.is_admin() OR 
    officer_id = auth.uid() OR 
    covering_officer_id = auth.uid()
  );

CREATE POLICY "beat_plans_modify" ON beat_plans
  FOR ALL TO authenticated
  USING (auth.is_admin() OR officer_id = auth.uid())
  WITH CHECK (auth.is_admin() OR officer_id = auth.uid());

-- Visits: Admin views all, Officer views & logs own
CREATE POLICY "visits_select" ON visits
  FOR SELECT TO authenticated
  USING (auth.is_admin() OR officer_id = auth.uid());

CREATE POLICY "visits_insert" ON visits
  FOR INSERT TO authenticated
  WITH CHECK (officer_id = auth.uid() OR auth.is_admin());

CREATE POLICY "visits_update" ON visits
  FOR UPDATE TO authenticated
  USING (officer_id = auth.uid() OR auth.is_admin())
  WITH CHECK (officer_id = auth.uid() OR auth.is_admin());

-- ------------------------------------------------------------------------------
-- 8. CHEQUES & TWO-STEP CUSTODY
-- ------------------------------------------------------------------------------

-- Cheques: Admin sees all, Sales Officer only sees cheques they collected
CREATE POLICY "cheques_select" ON cheques
  FOR SELECT TO authenticated
  USING (
    auth.is_admin() OR 
    officer_id = auth.uid() OR 
    handed_over_to = auth.uid()
  );

-- Field officers can insert cheques they collect
CREATE POLICY "cheques_insert" ON cheques
  FOR INSERT TO authenticated
  WITH CHECK (officer_id = auth.uid() OR auth.is_admin());

-- Field officer can update handover info; Admin can update cashing/status
CREATE POLICY "cheques_update" ON cheques
  FOR UPDATE TO authenticated
  USING (
    auth.is_admin() OR 
    (officer_id = auth.uid() AND status = 'COLLECTED_IN_FIELD')
  )
  WITH CHECK (
    auth.is_admin() OR 
    (officer_id = auth.uid() AND status IN ('COLLECTED_IN_FIELD', 'HANDED_OVER_AT_OFFICE'))
  );

-- Cheque history
CREATE POLICY "cheque_history_select" ON cheque_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "cheque_history_insert" ON cheque_history FOR INSERT TO authenticated WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 9. STOCK COUNTS, SHELF PHOTOS, CALLS
-- ------------------------------------------------------------------------------

-- Stock counts: Admins view all, Officers view & insert own
CREATE POLICY "stock_counts_select" ON stock_counts
  FOR SELECT TO authenticated
  USING (auth.is_admin() OR officer_id = auth.uid());

CREATE POLICY "stock_counts_insert" ON stock_counts
  FOR INSERT TO authenticated
  WITH CHECK (officer_id = auth.uid() OR auth.is_admin());

CREATE POLICY "stock_count_items_select" ON stock_count_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_count_items_insert" ON stock_count_items FOR INSERT TO authenticated WITH CHECK (true);

-- Shelf photos: Admins view all, Officers view & insert own
CREATE POLICY "shelf_photos_select" ON shelf_photos
  FOR SELECT TO authenticated
  USING (auth.is_admin() OR officer_id = auth.uid());

CREATE POLICY "shelf_photos_insert" ON shelf_photos
  FOR INSERT TO authenticated
  WITH CHECK (officer_id = auth.uid() OR auth.is_admin());

-- Calls: Admins view all, Officers view & insert own
CREATE POLICY "calls_select" ON calls
  FOR SELECT TO authenticated
  USING (auth.is_admin() OR officer_id = auth.uid());

CREATE POLICY "calls_insert" ON calls
  FOR INSERT TO authenticated
  WITH CHECK (officer_id = auth.uid() OR auth.is_admin());

-- ------------------------------------------------------------------------------
-- 10. ORDERS, RETURNS, DELIVERY FAILURES (D2C / Multi-Channel)
-- ------------------------------------------------------------------------------

-- Orders: Admin, Data Entry, and Brand Managers (filtered to brand)
CREATE POLICY "orders_select" ON orders
  FOR SELECT TO authenticated
  USING (
    auth.is_admin() OR
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() AND u.role IN ('DATA_ENTRY', 'VIEWER')
    ) OR
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() AND u.role = 'BRAND_MANAGER' AND orders.brand_code = ANY(u.assigned_brands)
    )
  );

CREATE POLICY "orders_insert" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.is_admin() OR
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() AND u.role IN ('DATA_ENTRY', 'BRAND_MANAGER')
    )
  );

CREATE POLICY "orders_update" ON orders
  FOR UPDATE TO authenticated
  USING (
    auth.is_admin() OR
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() AND u.role = 'DATA_ENTRY'
    )
  );

-- Delivery Failures
CREATE POLICY "delivery_failures_select" ON delivery_failures FOR SELECT TO authenticated USING (true);
CREATE POLICY "delivery_failures_write" ON delivery_failures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Returns
CREATE POLICY "returns_select" ON returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "returns_write" ON returns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Customers: Customer 360
CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_write" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 11. FEEDBACK, REVIEWS, COMPLAINTS
-- ------------------------------------------------------------------------------

CREATE POLICY "feedback_select" ON feedback_entries
  FOR SELECT TO authenticated
  USING (
    auth.is_admin() OR
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() AND u.role IN ('DATA_ENTRY', 'VIEWER')
    ) OR
    EXISTS (
      SELECT 1 FROM brands b
      JOIN users u ON u.id = auth.uid()
      WHERE b.id = feedback_entries.brand_id AND b.code = ANY(u.assigned_brands)
    )
  );

CREATE POLICY "feedback_write" ON feedback_entries
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 12. TASKS & NOTIFICATIONS
-- ------------------------------------------------------------------------------

-- Tasks: Admin manages all, Officers view & update tasks assigned to them
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT TO authenticated
  USING (
    auth.is_admin() OR 
    assigned_to = auth.uid() OR 
    created_by = auth.uid()
  );

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (auth.is_admin() OR created_by = auth.uid());

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE TO authenticated
  USING (auth.is_admin() OR assigned_to = auth.uid())
  WITH CHECK (auth.is_admin() OR assigned_to = auth.uid());

-- Notifications: User views and modifies only their own
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 13. STORAGE BUCKET RLS (Photos, Proofs, Documents)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    -- Public or authenticated read for command center assets
    CREATE POLICY "storage_read_authenticated" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id IN ('shelf-photos', 'cheque-photos', 'delivery-proofs', 'documents', 'brand-logos'));

    -- Authenticated uploads with verified bucket
    CREATE POLICY "storage_upload_authenticated" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id IN ('shelf-photos', 'cheque-photos', 'delivery-proofs', 'documents', 'brand-logos')
      );
  END IF;
END $$;
