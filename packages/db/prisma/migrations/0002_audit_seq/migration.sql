ALTER TABLE "AuditEvent" ADD COLUMN "seq" BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX "AuditEvent_seq_key" ON "AuditEvent"("seq");
