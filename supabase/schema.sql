-- Brand Bucket Command Center — Supabase Schema
-- Complete Platform Specification Database Migration

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Brands Table
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- 'FORYA', 'PEE_SAFE', 'FURR', 'RENEE'
    name VARCHAR(100) NOT NULL,
    logo_url TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Users Table (Aligned with NextAuth / Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER', 'SALES_OFFICER', 'DATA_ENTRY', 'VIEWER'
    assigned_brands TEXT[] DEFAULT '{}', -- Brand codes: 'FORYA', etc.
    assigned_area VARCHAR(100), -- Area name or ID
    phone VARCHAR(50),
    active BOOLEAN DEFAULT TRUE,
    custom_permissions JSONB DEFAULT '{}'::jsonb,
    permissions JSONB DEFAULT '{}'::jsonb,
    deactivated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Products Catalog
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    mrp NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    threshold_qty INT DEFAULT 10,
    keywords TEXT[] DEFAULT '{}', -- For WhatsApp Extractor matching
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Distributors (e.g. Bhatbhateni, BigMart, Saleways)
CREATE TABLE IF NOT EXISTS distributors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) DEFAULT 'Distributor', -- 'Distributor', 'Retail Chain', 'Pharmacy Chain', 'Wholesale'
    city VARCHAR(100) NOT NULL,
    contact_name VARCHAR(255),
    contact_role VARCHAR(100),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    brands_carried TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Branches under Distributors
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    distributor_id UUID REFERENCES distributors(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- e.g. 'Maharajgunj', 'Koteshwor'
    address TEXT NOT NULL,
    lat NUMERIC(10, 6),
    lng NUMERIC(10, 6),
    assigned_officer_id UUID REFERENCES users(id),
    contact_name VARCHAR(255),
    contact_role VARCHAR(100),
    contact_phone VARCHAR(50),
    brands_available TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Standalone GT Retailers
CREATE TABLE IF NOT EXISTS retailers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) DEFAULT 'GT', -- 'GT', 'Kirana', 'Pharmacy', 'Cosmetics', 'Other'
    city VARCHAR(100) NOT NULL,
    area VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    lat NUMERIC(10, 6),
    lng NUMERIC(10, 6),
    contact_name VARCHAR(255),
    contact_role VARCHAR(100),
    contact_phone VARCHAR(50),
    distributor_id UUID REFERENCES distributors(id), -- If falls under distributor
    assigned_officer_id UUID REFERENCES users(id),
    brands_stocked TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Beat Plans (Daily Store Route Schedules)
CREATE TABLE IF NOT EXISTS beat_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date_ad DATE NOT NULL,
    date_bs VARCHAR(50) NOT NULL,
    sequence INT NOT NULL DEFAULT 1,
    entity_type VARCHAR(20) NOT NULL, -- 'BRANCH' or 'RETAILER'
    entity_id UUID NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'VISITED', 'SKIPPED'
    skip_reason VARCHAR(100), -- 'Other task assigned', 'Store closed', 'Travel issue', 'No time', 'Already visited yesterday'
    skip_notes TEXT,
    covering_officer_id UUID REFERENCES users(id), -- For leave coverage
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. GPS Store Visits & Check-in
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(20) NOT NULL, -- 'BRANCH' or 'RETAILER'
    entity_id UUID NOT NULL,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out_time TIMESTAMPTZ,
    duration_minutes INT,
    check_in_lat NUMERIC(10, 6) NOT NULL,
    check_in_lng NUMERIC(10, 6) NOT NULL,
    distance_meters NUMERIC(10, 2),
    override_flag BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    date_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    date_bs VARCHAR(50) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Dispatches to Distributors
CREATE TABLE IF NOT EXISTS dispatches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    distributor_id UUID REFERENCES distributors(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id), -- Optional, NULL = HQ dispatch
    dispatch_date_ad DATE NOT NULL,
    dispatch_date_bs VARCHAR(50) NOT NULL,
    document_url TEXT,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispatch_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispatch_id UUID REFERENCES dispatches(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS dispatch_edits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispatch_id UUID REFERENCES dispatches(id) ON DELETE CASCADE,
    dispatch_item_id UUID REFERENCES dispatch_items(id) ON DELETE CASCADE,
    old_qty INT NOT NULL,
    new_qty INT NOT NULL,
    changed_by UUID REFERENCES users(id),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Multi-Brand Shelf Stock Counts
CREATE TABLE IF NOT EXISTS stock_counts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    officer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(20) NOT NULL, -- 'BRANCH' or 'RETAILER'
    entity_id UUID NOT NULL,
    date_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    date_bs VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_count_id UUID REFERENCES stock_counts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    shelf_qty INT NOT NULL CHECK (shelf_qty >= 0),
    previous_qty INT DEFAULT 0,
    flagged_drop BOOLEAN DEFAULT FALSE -- Drop > 50%
);

-- 11. Shelf Photos (Before / After Evidence)
CREATE TABLE IF NOT EXISTS shelf_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
    officer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(20) NOT NULL,
    entity_id UUID NOT NULL,
    before_photo_url TEXT NOT NULL,
    after_photo_url TEXT NOT NULL,
    date_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    date_bs VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Call Tracking
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(20),
    entity_id UUID,
    contact_name VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50) NOT NULL,
    duration_seconds INT DEFAULT 0,
    label VARCHAR(50) NOT NULL, -- 'Order Taking', 'Payment Follow-up', 'Stock Inquiry', 'Complaint Resolution', 'General Check-in', 'No Answer', 'Meeting Scheduled'
    outcome VARCHAR(50) NOT NULL, -- 'Order Received', 'Payment Promised', 'Issue Resolved', 'Follow-up Needed', 'Callback Requested', 'No Outcome'
    is_manual BOOLEAN DEFAULT FALSE,
    screenshot_url TEXT,
    notes TEXT,
    date_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    date_bs VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Cheque Tracker (Two-Step Handover)
CREATE TABLE IF NOT EXISTS cheques (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(20) NOT NULL,
    entity_id UUID NOT NULL,
    officer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    cheque_number VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    bank_name VARCHAR(150) NOT NULL,
    received_date_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    received_date_bs VARCHAR(50) NOT NULL,
    cash_date_ad DATE NOT NULL,
    cash_date_bs VARCHAR(50) NOT NULL,
    photo_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'COLLECTED_IN_FIELD', 
    -- 'COLLECTED_IN_FIELD', 'HANDED_OVER_AT_OFFICE', 'PENDING', 'CASHED', 'DELAYED', 'BOUNCED', 'LOST'
    handed_over_to UUID REFERENCES users(id),
    handover_timestamp TIMESTAMPTZ,
    delayed_reason VARCHAR(100),
    new_expected_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cheque_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cheque_id UUID REFERENCES cheques(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Document Handover
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(20) NOT NULL,
    entity_id UUID NOT NULL,
    officer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL, -- 'Purchase Order', 'Signed Invoice', 'Delivery Receipt', 'Stock Acknowledgment', 'Return Authorization', 'Credit Note', 'Other'
    doc_date_ad DATE NOT NULL,
    doc_date_bs VARCHAR(50) NOT NULL,
    reference_number VARCHAR(100),
    photo_urls TEXT[] DEFAULT '{}',
    handed_to_user_id UUID REFERENCES users(id),
    handover_date DATE,
    status VARCHAR(50) DEFAULT 'COLLECTED', -- 'COLLECTED', 'HANDED_OVER', 'FILED', 'MISSING'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Customers & Customer 360
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(50) UNIQUE NOT NULL, -- Unique identifier across all brands
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    province VARCHAR(100),
    first_order_date DATE,
    last_order_date DATE,
    total_orders INT DEFAULT 0,
    total_delivered INT DEFAULT 0,
    total_returns INT DEFAULT 0,
    total_delivery_failures INT DEFAULT 0,
    total_cancellations INT DEFAULT 0,
    total_complaints INT DEFAULT 0,
    total_reviews INT DEFAULT 0,
    karma_score INT DEFAULT 70,
    segment VARCHAR(50) DEFAULT 'NEW', -- 'VIP', 'LOYAL', 'REGULAR', 'NEW', 'AT_RISK', 'BLACKLISTED'
    active_flags TEXT[] DEFAULT '{}', -- 'Serial Returner', 'Non-Receiver', 'Order Canceller'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS karma_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone VARCHAR(50) REFERENCES customers(phone) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    points INT NOT NULL,
    balance_after INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Orders (OrderFlow)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(100) UNIQUE NOT NULL,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    order_date_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    order_date_bs VARCHAR(50) NOT NULL,
    platform VARCHAR(50) NOT NULL, -- 'Instagram', 'Messenger', 'WhatsApp', 'Website', 'TikTok', 'Walk-in', 'Pathao Bazaar', 'Phone Call'
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    province VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    delivery_method VARCHAR(50) NOT NULL, -- 'Standard', 'Pathao', 'InDrive', 'Yango', 'Pick-up'
    payment_terms VARCHAR(50) DEFAULT 'COD', -- 'COD', 'Prepaid', 'Credit 15 days', 'Credit 30 days', 'Advance'
    order_type VARCHAR(20) DEFAULT 'NEW', -- 'NEW' or 'REPEAT'
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'DISPATCHED', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED', 'EXCHANGED'
    source VARCHAR(50) DEFAULT 'MANUAL', -- 'WHATSAPP_EXTRACTOR', 'MANUAL', 'FIELD_CALL'
    linked_call_id UUID REFERENCES calls(id),
    order_doc_url TEXT,
    notes TEXT,
    is_marketing BOOLEAN DEFAULT FALSE,
    influencer_id TEXT,
    influencer_handle VARCHAR(100),
    content_received BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL
);

-- 17. Delivery Failures (Separated from Returns)
CREATE TABLE IF NOT EXISTS delivery_failures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    date_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    date_bs VARCHAR(50) NOT NULL,
    reason VARCHAR(100) NOT NULL, -- 'Call not received', 'Address not found', 'Customer refused delivery', 'Customer unavailable'
    valley VARCHAR(20) NOT NULL, -- 'Inside', 'Outside'
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Actual Returns
CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    date_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    date_bs VARCHAR(50) NOT NULL,
    order_processed_date_ad DATE,
    order_processed_date_bs VARCHAR(50),
    platform VARCHAR(50) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    reason_category VARCHAR(100) NOT NULL, -- 'Damage', 'Wrong product sent', 'Product not as described', 'Allergic reaction', 'Quality defect', 'Size issue', 'Color mismatch', 'Changed mind'
    order_status VARCHAR(50) NOT NULL, -- 'Exchanged', 'Returned', 'Refunded'
    valley VARCHAR(20) NOT NULL, -- 'Inside', 'Outside'
    issue_categories TEXT[] DEFAULT '{}',
    evidence_url TEXT,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. Dynamic Checkbox Library
CREATE TABLE IF NOT EXISTS review_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_by UUID REFERENCES users(id),
    is_archived BOOLEAN DEFAULT FALSE,
    merged_into_id UUID REFERENCES review_categories(id),
    tick_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. Customer & Brand Feedback / Reviews / Complaints
CREATE TABLE IF NOT EXISTS feedback_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'REVIEW', 'FEEDBACK', 'COMPLAINT'
    channel VARCHAR(50) NOT NULL, -- 'Instagram DM', 'WhatsApp', 'Messenger', 'TikTok Comment', 'Website Review', 'Daraz Review', 'Google Review', 'In-Store', 'Phone Call', 'Other'
    order_id UUID REFERENCES orders(id),
    date_received_ad DATE NOT NULL DEFAULT CURRENT_DATE,
    date_received_bs VARCHAR(50) NOT NULL,
    full_text TEXT NOT NULL,
    screenshot_urls TEXT[] DEFAULT '{}',
    issue_categories TEXT[] DEFAULT '{}',
    sentiment VARCHAR(20) NOT NULL DEFAULT 'NEUTRAL', -- 'POSITIVE', 'NEUTRAL', 'NEGATIVE'
    has_screenshot BOOLEAN DEFAULT FALSE,
    used_in_design BOOLEAN DEFAULT FALSE,
    posted_on_website BOOLEAN DEFAULT FALSE,
    priority VARCHAR(20) DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
    assigned_to UUID REFERENCES users(id),
    complaint_status VARCHAR(30) DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. OpsCore Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
    due_date_ad DATE NOT NULL,
    due_date_bs VARCHAR(50) NOT NULL,
    related_to VARCHAR(50), -- 'Store visit', 'Cheque collection', 'Order follow-up', 'Stock count', 'Document collection', 'Other'
    related_id UUID,
    status VARCHAR(30) DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'COMPLETED'
    auto_created BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
    read BOOLEAN DEFAULT FALSE,
    entity_type VARCHAR(50),
    entity_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. Activity Trail
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. Influencers Directory & Seeding (Fix 61)
CREATE TABLE IF NOT EXISTS influencers (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    platforms JSONB DEFAULT '[]', -- [{platform, handle, followers}]
    city VARCHAR(100),
    category VARCHAR(50) DEFAULT 'General',
    quality_rating VARCHAR(30) DEFAULT 'NOT_RATED', -- 'GREAT', 'AVERAGE', 'POOR', 'NOT_RATED'
    total_sends INTEGER DEFAULT 0,
    total_content INTEGER DEFAULT 0,
    last_send_date DATE,
    last_content_date DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. Influencer Content Links (Fix 61d)
CREATE TABLE IF NOT EXISTS influencer_content (
    id TEXT PRIMARY KEY,
    influencer_id TEXT REFERENCES influencers(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    platform VARCHAR(50) DEFAULT 'Instagram',
    content_type VARCHAR(30) DEFAULT 'REEL',
    brand_code VARCHAR(30),
    product_name VARCHAR(255),
    date_posted DATE NOT NULL DEFAULT CURRENT_DATE,
    date_posted_bs VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 26. Custom Shared Access Links (Fix 63)
CREATE TABLE IF NOT EXISTS shared_access_links (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    brand_filter TEXT[] DEFAULT '{}',
    allowed_pages TEXT[] DEFAULT '{}',
    show_customer_details BOOLEAN DEFAULT FALSE,
    show_staff_details BOOLEAN DEFAULT FALSE,
    show_order_rows BOOLEAN DEFAULT TRUE,
    show_product_names BOOLEAN DEFAULT TRUE,
    show_combo_details BOOLEAN DEFAULT TRUE,
    date_range_type VARCHAR(20) DEFAULT 'LIVE',
    date_from DATE,
    date_to DATE,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 27. Combos Catalog (Fix 67 & Fix 72)
CREATE TABLE IF NOT EXISTS combos (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    brand_code VARCHAR(30) REFERENCES brands(code),
    component_product_ids TEXT[] NOT NULL DEFAULT '{}',
    combo_mrp NUMERIC(12, 2) NOT NULL,
    extractor_keywords TEXT[] DEFAULT '{}',
    price_detection_enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    edit_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extractor keywords migration
ALTER TABLE products ADD COLUMN IF NOT EXISTS extractor_keywords TEXT[] DEFAULT '{}';

-- =========================================================================
-- FIX 59b & 60-63: PRODUCTION PERFORMANCE INDEXES
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_orders_brand_date ON orders(brand_id, order_date_ad DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(platform);
CREATE INDEX IF NOT EXISTS idx_orders_marketing ON orders(is_marketing, influencer_id);
CREATE INDEX IF NOT EXISTS idx_influencers_rating ON influencers(quality_rating);
CREATE INDEX IF NOT EXISTS idx_influencer_content_influencer ON influencer_content(influencer_id);
CREATE INDEX IF NOT EXISTS idx_shared_access_token ON shared_access_links(token);
CREATE INDEX IF NOT EXISTS idx_combos_brand ON combos(brand_code);
CREATE INDEX IF NOT EXISTS idx_combos_sku ON combos(sku);
CREATE INDEX IF NOT EXISTS idx_delivery_failures_date ON delivery_failures(date_ad DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_failures_reason ON delivery_failures(reason);
CREATE INDEX IF NOT EXISTS idx_returns_brand_date ON returns(brand_id, date_ad DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_brand_sentiment ON feedback_entries(brand_id, sentiment);
CREATE INDEX IF NOT EXISTS idx_cheques_status_cash_date ON cheques(status, cash_date_ad);
CREATE INDEX IF NOT EXISTS idx_cheques_store ON cheques(store_id);
CREATE INDEX IF NOT EXISTS idx_beat_officer_date ON beat_plans(officer_id, date_ad);
CREATE INDEX IF NOT EXISTS idx_beat_status ON beat_plans(status);
CREATE INDEX IF NOT EXISTS idx_stock_counts_entity_date ON stock_counts(entity_id, date_ad DESC);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_karma ON customers(karma_score);
CREATE INDEX IF NOT EXISTS idx_activity_trail_entity ON activity_logs(entity_type, entity_id);

-- 28. GPS Pings (Field Staff Live Tracking)
CREATE TABLE IF NOT EXISTS gps_pings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    officer_name VARCHAR(255),
    lat NUMERIC(10, 6) NOT NULL,
    lng NUMERIC(10, 6) NOT NULL,
    status VARCHAR(50) DEFAULT 'ONLINE',
    current_store_name VARCHAR(255),
    battery_level INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gps_pings_officer_created ON gps_pings(officer_id, created_at DESC);
