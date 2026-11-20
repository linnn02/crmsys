ALTER TABLE "AttendanceHistory" ADD CONSTRAINT "AttendanceHistory_actor_fk" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_actor_fk" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recorder_fk" FOREIGN KEY ("recordedBy") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_recorder_fk" FOREIGN KEY ("recordedBy") REFERENCES "User"(id) ON DELETE RESTRICT;
CREATE FUNCTION prevent_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial and audit history is append-only';
END;
$$;
CREATE TRIGGER payment_immutable BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
CREATE TRIGGER refund_immutable BEFORE UPDATE OR DELETE ON "Refund" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
CREATE TRIGGER allocation_immutable BEFORE UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
CREATE TRIGGER invoice_immutable BEFORE UPDATE OR DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
CREATE TRIGGER attendance_history_immutable BEFORE UPDATE OR DELETE ON "AttendanceHistory" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
CREATE TRIGGER subscription_history_immutable BEFORE UPDATE OR DELETE ON "SubscriptionHistory" FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
