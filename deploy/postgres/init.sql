-- ApisCloud - 蜂云 数据库初始化
-- 阶段一：基础表结构

-- 车辆最新状态表（热数据，O(1) 读）
CREATE TABLE IF NOT EXISTS vehicle_latest (
  vehicle_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'offline',
  battery NUMERIC(5, 2),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  heading NUMERIC(6, 2),
  speed NUMERIC(6, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_latest_status
  ON vehicle_latest (status);
CREATE INDEX IF NOT EXISTS idx_vehicle_latest_updated_at
  ON vehicle_latest (updated_at DESC);

-- 车辆遥测表（时序数据）
CREATE TABLE IF NOT EXISTS vehicle_telemetry (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed NUMERIC(6, 2),
  battery NUMERIC(5, 2),
  heading NUMERIC(6, 2),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_vehicle_ts
  ON vehicle_telemetry (vehicle_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_ts
  ON vehicle_telemetry (ts DESC);

-- 告警表
CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id TEXT,
  alert_type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_vehicle_created
  ON alerts (vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_level_created
  ON alerts (level, created_at DESC);

-- 调度指令审计表（阶段三会用）
CREATE TABLE IF NOT EXISTS dispatch_commands (
  id BIGSERIAL PRIMARY KEY,
  command_id TEXT UNIQUE NOT NULL,
  vehicle_id TEXT,
  task_id TEXT,
  command_type TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dispatch_commands_vehicle_issued
  ON dispatch_commands (vehicle_id, issued_at DESC);

-- 健康检查视图
CREATE OR REPLACE VIEW health_check AS
SELECT
  now() AS checked_at,
  (SELECT count(*) FROM vehicle_latest) AS vehicle_count;
