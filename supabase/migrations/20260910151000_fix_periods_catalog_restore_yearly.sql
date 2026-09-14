-- Phase 2-revision-2, actually applied here (TODO.md had marked it done, but
-- the dev DB never got the migration): delete the deleted-per-decision
-- אחת לשלוש שנים row, restore plain שנתי. Final catalog: שבועי/חודשי/שנתי/תלת שנתי.

DELETE FROM maintenance_periods WHERE name = 'אחת לשלוש שנים';

INSERT INTO maintenance_periods (name, schedule_kind, interval_years, sort_order)
VALUES ('שנתי', 'yearly', 1, 3);

UPDATE maintenance_periods SET sort_order = 4 WHERE name = 'תלת שנתי';
