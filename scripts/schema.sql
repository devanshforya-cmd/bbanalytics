-- ============================================================================
-- BRAND BUCKET COMMAND CENTER — MASTER SUPABASE SQL SCHEMA
-- 30+ Core Operational Tables with Foreign Keys, Indexes & Row Level Security
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. BRANDS MASTER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY DEFAULT ('brand_' || substr(md5(random()::text), 1, 8)),
  code TEXT UNIQUE NOT NULL, -- 'FORYA', 'PEESAFE', 'FURR', 'RENEE'
  name TEXT NOT NULL,
  color TEXT DEFAULT '#10b981',
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. USERS & STAFF MANAGEMENT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT ('user_' || substr(md5(random()::text), 1, 8)),
  name TEXT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SALES_OFFICER', -- 'SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'SALES_OFFICER', 'DATA_ENTRY', 'VIEWER'
  duty_status TEXT DEFAULT 'ONLINE', -- 'ONLINE', 'IN_FIELD', 'ON_BREAK', 'OFFLINE', 'ON_LEAVE'
  is_super_admin BOOLEAN DEFAULT false,
  reports_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_brands TEXT[] DEFAULT ARRAY['ALL'],
  assigned_territory TEXT,
  territory TEXT,
  permissions JSONB DEFAULT '{}',
  custom_permissions JSONB DEFAULT '{}',
  calendar_preference TEXT DEFAULT 'BS', -- 'BS' or 'AD'
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. PRODUCTS CATALOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY DEFAULT ('prod_' || substr(md5(random()::text), 1, 8)),
  brand_id TEXT REFERENCES brands(id) ON DELETE CASCADE,
  brand_code TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  size TEXT,
  mrp NUMERIC(12, 2) NOT NULL DEFAULT 0,
  case_size INTEGER NOT NULL DEFAULT 1,
  cost_price NUMERIC(12, 2) DEFAULT 0,
  stock_pieces INTEGER DEFAULT 0,
  stock_threshold INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. COMBOS CATALOG (D2C Bundles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY DEFAULT ('combo_' || substr(md5(random()::text), 1, 8)),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  brand_code TEXT NOT NULL,
  mrp NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  items JSONB DEFAULT '[]', -- Array of { productId, sku, name, quantity }
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. DISTRIBUTORS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distributors (
  id TEXT PRIMARY KEY DEFAULT ('dist_' || substr(md5(random()::text), 1, 8)),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  district TEXT,
  payment_terms TEXT DEFAULT '15_DAYS_CREDIT',
  credit_limit NUMERIC(12, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. DISTRIBUTOR BRANCHES / MODERN TRADE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY DEFAULT ('br_' || substr(md5(random()::text), 1, 8)),
  distributor_id TEXT REFERENCES distributors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  city TEXT,
  area TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  contact_person TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. RETAILERS (General Trade & Standalone)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retailers (
  id TEXT PRIMARY KEY DEFAULT ('ret_' || substr(md5(random()::text), 1, 8)),
  name TEXT NOT NULL,
  code TEXT,
  distributor_id TEXT REFERENCES distributors(id) ON DELETE SET NULL,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'STANDALONE_RETAILER', -- 'DISTRIBUTOR', 'CHAIN_STORE', 'STANDALONE_RETAILER'
  category TEXT DEFAULT 'COSMETIC_SHOP',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  area TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  primary_contact JSONB, -- { name, phone, designation }
  contacts JSONB DEFAULT '[]', -- [{ name, phone, designation, isPrimary }]
  credit_terms TEXT DEFAULT 'COD',
  credit_days INTEGER DEFAULT 0,
  credit_limit NUMERIC(12, 2) DEFAULT 0,
  assigned_officer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8. BEAT PLANS & DAILY ROUTES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beat_plans (
  id TEXT PRIMARY KEY DEFAULT ('beat_' || substr(md5(random()::text), 1, 8)),
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'RETAILER', -- 'DISTRIBUTOR', 'BRANCH', 'RETAILER'
  entity_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  date_bs TEXT NOT NULL,
  date_ad TEXT NOT NULL,
  day_of_week TEXT, -- 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
  sequence INTEGER DEFAULT 1,
  priority TEXT DEFAULT 'ROUTINE', -- 'HIGH', 'MEDIUM', 'ROUTINE'
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'VISITED', 'SKIPPED'
  manager_notes TEXT,
  skip_reason TEXT,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 9. STORE VISITS & GPS TELEMETRY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY DEFAULT ('vis_' || substr(md5(random()::text), 1, 8)),
  beat_item_id TEXT REFERENCES beat_plans(id) ON DELETE SET NULL,
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  check_in_time TIMESTAMPTZ NOT NULL,
  check_out_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  check_in_lat DOUBLE PRECISION,
  check_in_lng DOUBLE PRECISION,
  check_out_lat DOUBLE PRECISION,
  check_out_lng DOUBLE PRECISION,
  is_gps_verified BOOLEAN DEFAULT true,
  distance_from_store_meters NUMERIC(10, 2),
  entrance_photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. ONLINE ORDERS (OrderFlow Extractor & Manual Entry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY DEFAULT ('ord_' || substr(md5(random()::text), 1, 8)),
  order_no TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL, -- 'INSTAGRAM', 'WHATSAPP', 'FACEBOOK', 'TIKTOK', 'WEBSITE', 'WALK_IN'
  order_type TEXT DEFAULT 'NEW', -- 'NEW' or 'REPEAT'
  brand_code TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_id TEXT,
  province TEXT,
  district TEXT,
  delivery_address TEXT,
  items JSONB DEFAULT '[]', -- [{ productId, productName, sku, qty, price }]
  total_amount NUMERIC(12, 2) DEFAULT 0,
  delivery_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'DISPATCHED', 'DELIVERED', 'RETURNED', 'CANCELLED'
  order_date_bs TEXT NOT NULL,
  order_date_ad TEXT NOT NULL,
  remarks TEXT,
  delivery_proof_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 11. SECONDARY ORDERS (Field Bookings by Sales Officers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secondary_orders (
  id TEXT PRIMARY KEY DEFAULT ('sec_ord_' || substr(md5(random()::text), 1, 8)),
  visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_code TEXT DEFAULT 'FORYA',
  items JSONB DEFAULT '[]', -- [{ productId, sku, name, qtyPieces, qtyCases, caseSize, mrp, storePayable, lineTotal }]
  total_units INTEGER DEFAULT 0,
  total_value NUMERIC(12, 2) DEFAULT 0,
  photo_url TEXT,
  signature_url TEXT,
  order_image_url TEXT,
  status TEXT DEFAULT 'SUBMITTED', -- 'SUBMITTED', 'CONFIRMED', 'DISPATCHED'
  date_bs TEXT NOT NULL,
  date_ad TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 12. STOCK COUNTS (Audit counts at Retailers/Branches)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY DEFAULT ('stk_' || substr(md5(random()::text), 1, 8)),
  visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  count_pieces INTEGER NOT NULL DEFAULT 0,
  date_bs TEXT NOT NULL,
  date_ad TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 13. SHELF PHOTOS (Before / After Merchandising Audits)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shelf_photos (
  id TEXT PRIMARY KEY DEFAULT ('shelf_' || substr(md5(random()::text), 1, 8)),
  visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_code TEXT DEFAULT 'ALL',
  before_photo_url TEXT,
  after_photo_url TEXT,
  notes TEXT,
  date_bs TEXT NOT NULL,
  date_ad TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 14. CALL LOGS (Field Officer Outbound Calls)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY DEFAULT ('call_' || substr(md5(random()::text), 1, 8)),
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id TEXT,
  store_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  call_type TEXT DEFAULT 'ROUTINE_FOLLOWUP',
  outcome TEXT NOT NULL, -- 'ORDER_PLACED', 'PAYMENT_PROMISED', 'BUSY', 'NO_ANSWER', 'FOLLOW_UP_NEEDED'
  notes TEXT,
  date_bs TEXT NOT NULL,
  date_ad TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 15. CHEQUES TRACKER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cheques (
  id TEXT PRIMARY KEY DEFAULT ('chq_' || substr(md5(random()::text), 1, 8)),
  cheque_no TEXT NOT NULL,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  cash_date_bs TEXT NOT NULL,
  cash_date_ad TEXT NOT NULL,
  collected_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collected_date_bs TEXT NOT NULL,
  collected_date_ad TEXT NOT NULL,
  handed_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  handover_date_bs TEXT,
  handover_date_ad TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'COLLECTED', -- 'COLLECTED', 'HANDED_TO_OFFICE', 'DEPOSITED', 'CASHED', 'BOUNCED'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 16. HANDOVER DOCUMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS handover_documents (
  id TEXT PRIMARY KEY DEFAULT ('doc_' || substr(md5(random()::text), 1, 8)),
  doc_type TEXT NOT NULL, -- 'TAX_INVOICE', 'PURCHASE_ORDER', 'DELIVERY_CHALLAN', 'RECEIPT', 'OTHER'
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handed_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  handed_to_user_name TEXT,
  photo_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'COLLECTED', -- 'COLLECTED', 'HANDED_OVER'
  collected_date_bs TEXT NOT NULL,
  collected_date_ad TEXT NOT NULL,
  handover_date_bs TEXT,
  handover_date_ad TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 17. DISPATCHES MANAGEMENT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY DEFAULT ('disp_' || substr(md5(random()::text), 1, 8)),
  dispatch_no TEXT UNIQUE NOT NULL,
  store_type TEXT NOT NULL, -- 'DISTRIBUTOR', 'BRANCH', 'RETAILER'
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  items JSONB DEFAULT '[]', -- [{ productId, sku, name, brandCode, qtyPieces, caseSize }]
  challan_photo_url TEXT,
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'DISPATCHED', 'RECEIVED'
  dispatch_date_bs TEXT NOT NULL,
  dispatch_date_ad TEXT NOT NULL,
  payment_terms TEXT DEFAULT '15_DAYS_CREDIT',
  payment_due_date_bs TEXT,
  payment_due_date_ad TEXT,
  payment_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'PARTIAL', 'COLLECTED', 'OVERDUE'
  created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 18. CUSTOMERS (Customer Intelligence 360)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY DEFAULT ('cust_' || substr(md5(random()::text), 1, 8)),
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  province TEXT,
  district TEXT,
  karma_score INTEGER DEFAULT 100,
  total_orders INTEGER DEFAULT 0,
  last_order_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 19. CUSTOMER TIMELINE EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_timeline (
  id TEXT PRIMARY KEY DEFAULT ('event_' || substr(md5(random()::text), 1, 8)),
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'ORDER_PLACED', 'DELIVERY_SUCCESS', 'DELIVERY_FAILURE', 'RETURN_REQUESTED', 'FEEDBACK_SUBMITTED'
  description TEXT NOT NULL,
  karma_delta INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  date_bs TEXT NOT NULL,
  date_ad TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 20. DELIVERY FAILURES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_failures (
  id TEXT PRIMARY KEY DEFAULT ('fail_' || substr(md5(random()::text), 1, 8)),
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  order_no TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  platform TEXT NOT NULL,
  brand_code TEXT NOT NULL,
  reason TEXT NOT NULL, -- 'CALL_NOT_RECEIVED', 'DOOR_LOCKED', 'ADDRESS_NOT_FOUND', 'REFUSED'
  failure_date_bs TEXT NOT NULL,
  failure_date_ad TEXT NOT NULL,
  reattempt_scheduled BOOLEAN DEFAULT false,
  reattempt_date_bs TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 21. ACTUAL RETURNS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY DEFAULT ('ret_entry_' || substr(md5(random()::text), 1, 8)),
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  platform TEXT NOT NULL,
  brand_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  qty INTEGER DEFAULT 1,
  reason_category TEXT NOT NULL, -- 'DAMAGED_PRODUCT', 'WRONG_ITEM', 'LEAKING', 'EXPIRED'
  return_type TEXT DEFAULT 'ACTUAL_RETURN', -- 'ACTUAL_RETURN', 'DELIVERY_FAILURE', 'CANCELLATION'
  resolution_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'EXCHANGED', 'REFUNDED'
  valley TEXT DEFAULT 'INSIDE', -- 'INSIDE' or 'OUTSIDE'
  return_date_bs TEXT NOT NULL,
  return_date_ad TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 22. FEEDBACK & REVIEWS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_entries (
  id TEXT PRIMARY KEY DEFAULT ('fb_' || substr(md5(random()::text), 1, 8)),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  platform TEXT NOT NULL,
  brand_code TEXT NOT NULL,
  product_name TEXT,
  type TEXT NOT NULL DEFAULT 'REVIEW', -- 'REVIEW', 'FEEDBACK', 'COMPLAINT'
  rating INTEGER,
  category TEXT,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
  status TEXT DEFAULT 'NEW', -- 'NEW', 'IN_PROGRESS', 'RESOLVED'
  assigned_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  before_photo_url TEXT,
  after_photo_url TEXT,
  date_bs TEXT NOT NULL,
  date_ad TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 23. REVIEW CATEGORIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_categories (
  id TEXT PRIMARY KEY DEFAULT ('cat_' || substr(md5(random()::text), 1, 8)),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'COMPLAINT',
  brand_code TEXT DEFAULT 'ALL',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 24. TASKS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT ('tsk_' || substr(md5(random()::text), 1, 8)),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  assigned_to_name TEXT,
  priority TEXT DEFAULT 'MEDIUM', -- 'HIGH', 'MEDIUM', 'LOW'
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'COMPLETED'
  due_date_bs TEXT NOT NULL,
  due_date_ad TEXT NOT NULL,
  related_entity_type TEXT, -- 'STORE', 'CHEQUE', 'COMPLAINT', 'CUSTOMER'
  related_entity_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 25. ACTIVITY AUDIT TRAIL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY DEFAULT ('act_' || substr(md5(random()::text), 1, 8)),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 26. NOTIFICATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT ('notif_' || substr(md5(random()::text), 1, 8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'INFO', -- 'RED_ALERT', 'AMBER_ALERT', 'INFO'
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 27. TASK TEMPLATES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY DEFAULT ('tt_' || substr(md5(random()::text), 1, 8)),
  title TEXT NOT NULL,
  description TEXT,
  target_role TEXT DEFAULT 'SALES_OFFICER',
  steps JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 28. PROMOTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY DEFAULT ('promo_' || substr(md5(random()::text), 1, 8)),
  title TEXT NOT NULL,
  brand_code TEXT NOT NULL,
  offer_type TEXT NOT NULL, -- 'BUY_X_GET_Y', 'PERCENTAGE_DISCOUNT', 'COMBO_DEAL'
  valid_from_bs TEXT NOT NULL,
  valid_to_bs TEXT NOT NULL,
  applicable_stores TEXT DEFAULT 'ALL',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 29. SEASONAL PATTERNS & INSIGHTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seasonal_patterns (
  id TEXT PRIMARY KEY DEFAULT ('sp_' || substr(md5(random()::text), 1, 8)),
  metric TEXT NOT NULL,
  product_name TEXT,
  direction TEXT DEFAULT 'UP',
  pct_change NUMERIC(5, 2) DEFAULT 0,
  peak_months_bs TEXT[] DEFAULT ARRAY[]::TEXT[],
  trough_months_bs TEXT[] DEFAULT ARRAY[]::TEXT[],
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 30. SYSTEM SETTINGS & CONFIGURATION
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 31. RECURRING SCHEDULES (Field Sales Route Templates)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recurring_schedules (
  id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 8)),
  officer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'RETAILER',
  days_of_week TEXT[] DEFAULT ARRAY['MON', 'WED', 'FRI'],
  priority TEXT DEFAULT 'ROUTINE',
  manager_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_products_brand_code ON products(brand_code);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_retailers_officer ON retailers(assigned_officer_id);
CREATE INDEX IF NOT EXISTS idx_beat_plans_officer_date ON beat_plans(officer_id, date_bs);
CREATE INDEX IF NOT EXISTS idx_visits_officer_time ON visits(officer_id, check_in_time);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_brand_date ON orders(brand_code, order_date_bs);
CREATE INDEX IF NOT EXISTS idx_secondary_orders_officer ON secondary_orders(officer_id, date_bs);
CREATE INDEX IF NOT EXISTS idx_cheques_status_date ON cheques(status, cash_date_bs);
CREATE INDEX IF NOT EXISTS idx_cheques_collected_by ON cheques(collected_by_id);
CREATE INDEX IF NOT EXISTS idx_feedback_brand_status ON feedback_entries(brand_code, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_time ON activity_logs(user_id, created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE beat_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE secondary_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_schedules ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users access (and public read where needed)
CREATE POLICY "Allow authenticated read/write for all tables" ON brands FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for users" ON users FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for products" ON products FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for combos" ON combos FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for distributors" ON distributors FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for branches" ON branches FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for retailers" ON retailers FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for beat_plans" ON beat_plans FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for visits" ON visits FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for orders" ON orders FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for secondary_orders" ON secondary_orders FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for stock_counts" ON stock_counts FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for shelf_photos" ON shelf_photos FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for call_logs" ON call_logs FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for cheques" ON cheques FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for handover_documents" ON handover_documents FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for dispatches" ON dispatches FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for customers" ON customers FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for customer_timeline" ON customer_timeline FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for delivery_failures" ON delivery_failures FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for returns" ON returns FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for feedback_entries" ON feedback_entries FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for review_categories" ON review_categories FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for tasks" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for activity_logs" ON activity_logs FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for notifications" ON notifications FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for task_templates" ON task_templates FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for promotions" ON promotions FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for seasonal_patterns" ON seasonal_patterns FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for system_settings" ON system_settings FOR ALL USING (true);
CREATE POLICY "Allow authenticated read/write for recurring_schedules" ON recurring_schedules FOR ALL USING (true);
