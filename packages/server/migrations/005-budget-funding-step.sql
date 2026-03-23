-- Add funding_step column to budget_allocations for tracking auto-funding progress.
-- 0 = unfunded, 1 = first half funded (15th), 2 = fully funded (last day)

ALTER TABLE budget_allocations ADD COLUMN funding_step INTEGER NOT NULL DEFAULT 0;
