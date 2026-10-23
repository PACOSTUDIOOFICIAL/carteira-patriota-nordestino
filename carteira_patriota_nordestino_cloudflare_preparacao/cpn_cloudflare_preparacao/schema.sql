-- Execute este arquivo no banco D1 de PRODUÇÃO depois de criar o banco.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_code TEXT UNIQUE,
  full_name TEXT NOT NULL CHECK(length(full_name) BETWEEN 2 AND 100),
  phone TEXT NOT NULL,
  state TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_registrations_name ON registrations(full_name);
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON registrations(phone);
CREATE INDEX IF NOT EXISTS idx_registrations_created ON registrations(created_at);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  registration_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
