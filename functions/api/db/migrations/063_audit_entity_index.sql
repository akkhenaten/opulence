-- Look up one record's audit trail quickly (timesheet history and the changed-after-signing line)
CREATE INDEX IF NOT EXISTS audit_log_entity ON audit_log (entity, entity_id);
