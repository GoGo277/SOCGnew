-- SQL Schema for SOC Asset Guardian

-- Assets Table
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  ipv4 TEXT,
  ipv6 TEXT,
  mac TEXT,
  os TEXT,
  location TEXT,
  owner TEXT,
  status TEXT DEFAULT 'Active',
  criticality TEXT DEFAULT 'Medium',
  notes JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Incidents Table
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT DEFAULT 'New',
  source_ip TEXT,
  destination_ip TEXT,
  source_asset_name TEXT,
  destination_asset_name TEXT,
  description TEXT,
  response TEXT,
  assigned_to TEXT,
  notes JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Logs Table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Basic Policy: Allow authenticated users to read all
CREATE POLICY "Allow authenticated read" ON assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read" ON audit_logs FOR SELECT TO authenticated USING (true);

-- Basic Policy: Allow authenticated users to insert/update
CREATE POLICY "Allow authenticated insert" ON assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON assets FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON incidents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON incidents FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);
