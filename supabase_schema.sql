-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "username" TEXT NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "password" TEXT,
  "role" TEXT NOT NULL CHECK ("role" IN ('Admin', 'L1', 'L2')),
  "profilePic" TEXT,
  "bio" TEXT,
  "lastSeen" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Assets Table
CREATE TABLE IF NOT EXISTS assets (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "identity" TEXT,
  "ipv4" TEXT,
  "ipv6" TEXT,
  "rackNumber" TEXT,
  "location" TEXT,
  "description" TEXT,
  "notes" JSONB DEFAULT '[]'::jsonb,
  "criticality" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "eventName" TEXT NOT NULL,
  "sourceIp" TEXT,
  "destinationIp" TEXT,
  "sourceAssetName" TEXT,
  "destinationAssetName" TEXT,
  "description" TEXT,
  "response" TEXT,
  "tags" JSONB DEFAULT '[]'::jsonb,
  "notes" JSONB DEFAULT '[]'::jsonb,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "assignedTo" UUID REFERENCES users("id") ON DELETE SET NULL,
  "creatorId" UUID REFERENCES users("id") ON DELETE SET NULL,
  "dueDate" TIMESTAMP WITH TIME ZONE,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guidelines Table
CREATE TABLE IF NOT EXISTS guidelines (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "visibleTo" JSONB DEFAULT '[]'::jsonb,
  "author" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Approval Requests Table
CREATE TABLE IF NOT EXISTS approval_requests (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "requesterId" UUID REFERENCES users("id") ON DELETE CASCADE,
  "requesterName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "resolvedAt" TIMESTAMP WITH TIME ZONE,
  "resolvedBy" UUID REFERENCES users("id") ON DELETE SET NULL
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID REFERENCES users("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "read" BOOLEAN DEFAULT FALSE,
  "requestId" UUID REFERENCES approval_requests("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat Rooms Table
CREATE TABLE IF NOT EXISTS chat_rooms (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "participants" JSONB DEFAULT '[]'::jsonb,
  "lastMessage" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "roomId" UUID REFERENCES chat_rooms("id") ON DELETE CASCADE,
  "senderId" UUID REFERENCES users("id") ON DELETE SET NULL,
  "senderName" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "mediaType" TEXT,
  "timestamp" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "authorId" UUID REFERENCES users("id") ON DELETE SET NULL,
  "authorName" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID REFERENCES users("id") ON DELETE SET NULL,
  "username" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target" JSONB,
  "details" JSONB,
  "timestamp" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Media Vault Table
CREATE TABLE IF NOT EXISTS media_vault (
  "id" TEXT PRIMARY KEY,
  "data" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- App Settings Table
CREATE TABLE IF NOT EXISTS app_settings (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "appName" TEXT NOT NULL,
  "logoUrl" TEXT,
  "rolePermissions" JSONB NOT NULL,
  "language" TEXT NOT NULL,
  "navOrder" JSONB NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
