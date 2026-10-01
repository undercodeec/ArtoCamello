INSERT INTO "TenantDomain" ("id", "tenantId", "hostname", "isPrimary")
VALUES ('domain-admin-artocamello', 'artocamello', 'admin.artocamello.com', false)
ON CONFLICT ("hostname") DO NOTHING;
