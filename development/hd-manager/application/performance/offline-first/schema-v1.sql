-- Development schema. Native integration MUST open an encrypted, per-account DB.
-- No credentials or plaintext passwords belong in these tables.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
CREATE TABLE IF NOT EXISTS local_commands (
 tenant_id TEXT NOT NULL,
 principal_id TEXT NOT NULL,
 command_id TEXT NOT NULL,
 session_id TEXT NOT NULL,
 permission_revision TEXT NOT NULL,
 device_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 base_revision INTEGER NOT NULL CHECK(base_revision >= 0),
 created_at INTEGER NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 idempotency_key TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('LOCAL_ONLY','PENDING_SYNC','SYNCING','SYNCED','SYNC_FAILED','CONFLICT_REQUIRES_REVIEW')),
 PRIMARY KEY(tenant_id, principal_id, command_id),
 UNIQUE(tenant_id, principal_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS outbox (
 tenant_id TEXT NOT NULL,
 principal_id TEXT NOT NULL,
 command_id TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 lease_owner TEXT,
 lease_until INTEGER,
 last_error_code TEXT,
 PRIMARY KEY(tenant_id, principal_id, command_id),
 FOREIGN KEY(tenant_id, principal_id, command_id)
 REFERENCES local_commands(tenant_id, principal_id, command_id)
);
CREATE TABLE IF NOT EXISTS command_dependencies (
 tenant_id TEXT NOT NULL,
 principal_id TEXT NOT NULL,
 command_id TEXT NOT NULL,
 depends_on TEXT NOT NULL,
 CHECK(command_id <> depends_on),
 PRIMARY KEY(tenant_id, principal_id, command_id, depends_on),
 FOREIGN KEY(tenant_id, principal_id, command_id) REFERENCES local_commands(tenant_id, principal_id, command_id),
 FOREIGN KEY(tenant_id, principal_id, depends_on) REFERENCES local_commands(tenant_id, principal_id, command_id)
);
CREATE TABLE IF NOT EXISTS command_events (
 event_id INTEGER PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 principal_id TEXT NOT NULL,
 command_id TEXT NOT NULL,
 at INTEGER NOT NULL,
 state TEXT NOT NULL,
 reason_code TEXT,
 FOREIGN KEY(tenant_id, principal_id, command_id) REFERENCES local_commands(tenant_id, principal_id, command_id)
);
CREATE INDEX IF NOT EXISTS outbox_due ON outbox(tenant_id, principal_id, next_attempt_at);
-- Durable intent and queue cannot be committed separately, even on process death.
CREATE TRIGGER IF NOT EXISTS enqueue_command AFTER INSERT ON local_commands
WHEN NEW.state = 'PENDING_SYNC'
BEGIN
 INSERT INTO outbox(tenant_id, principal_id, command_id)
 VALUES(NEW.tenant_id, NEW.principal_id, NEW.command_id);
END;
CREATE TRIGGER IF NOT EXISTS audit_command_insert AFTER INSERT ON local_commands
BEGIN
 INSERT INTO command_events(tenant_id, principal_id, command_id, at, state)
 VALUES(NEW.tenant_id, NEW.principal_id, NEW.command_id, NEW.created_at, NEW.state);
END;
CREATE TRIGGER IF NOT EXISTS enqueue_draft AFTER UPDATE OF state ON local_commands
WHEN OLD.state = 'LOCAL_ONLY' AND NEW.state = 'PENDING_SYNC'
BEGIN
 INSERT INTO outbox(tenant_id, principal_id, command_id)
 VALUES(NEW.tenant_id, NEW.principal_id, NEW.command_id);
END;
CREATE TRIGGER IF NOT EXISTS validate_sync_transition BEFORE UPDATE OF state ON local_commands
WHEN NOT (
 OLD.state = NEW.state OR
 (OLD.state = 'LOCAL_ONLY' AND NEW.state = 'PENDING_SYNC') OR
 (OLD.state = 'PENDING_SYNC' AND NEW.state IN ('SYNCING','SYNC_FAILED')) OR
 (OLD.state = 'SYNCING' AND NEW.state IN ('PENDING_SYNC','SYNCED','SYNC_FAILED','CONFLICT_REQUIRES_REVIEW')) OR
 (OLD.state = 'SYNC_FAILED' AND NEW.state = 'PENDING_SYNC')
)
BEGIN SELECT RAISE(ABORT, 'invalid-sync-transition'); END;
-- Once queued, intent is immutable. Corrections are new commands with new IDs.
CREATE TRIGGER IF NOT EXISTS immutable_command BEFORE UPDATE OF
 tenant_id, principal_id, command_id, session_id, permission_revision, device_id,
 kind, entity_id, base_revision, created_at, payload_json, idempotency_key
ON local_commands BEGIN SELECT RAISE(ABORT, 'immutable-command'); END;
