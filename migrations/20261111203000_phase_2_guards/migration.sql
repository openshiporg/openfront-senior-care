-- Phase 2 guards (SCHEMA G7, G9): evidence that is never updated or deleted, ledger uniqueness and balance checks.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['MedicationSupplyMovement', 'MedicationAdministration', 'ShiftCountEntry'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sc_forbid_change()', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION sc_forbid_change()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- One position in a supply's ledger, so two concurrent postings can never both claim it.
CREATE UNIQUE INDEX "MedicationSupplyMovement_supply_seq_key" ON "MedicationSupplyMovement" ("supply", "seq");

ALTER TABLE "MedicationSupply" ADD CONSTRAINT "MedicationSupply_balance_nonnegative" CHECK ("balance" >= 0);
ALTER TABLE "MedicationSupplyMovement" ADD CONSTRAINT "MedicationSupplyMovement_balance_nonnegative" CHECK ("balanceAfter" >= 0);
ALTER TABLE "ShiftCountEntry" ADD CONSTRAINT "ShiftCountEntry_counted_nonnegative" CHECK ("counted" >= 0);
