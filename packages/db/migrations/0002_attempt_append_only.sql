-- attempt is append-only: the source of truth for grading and mastery is never rewritten.
CREATE FUNCTION attempt_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'attempt is append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER attempt_no_update BEFORE UPDATE OR DELETE ON attempt
  FOR EACH ROW EXECUTE FUNCTION attempt_append_only();
