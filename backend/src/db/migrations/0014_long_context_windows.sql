-- Bring context windows in line with the official pricing docs.
-- Opus 4.7, Opus 4.6, and Sonnet 4.6 ship with a 1M-token context window;
-- the rest of the catalog is still 200K. Source:
-- https://platform.claude.com/docs/en/about-claude/pricing#long-context-pricing

UPDATE models
SET context_window = 1000000
WHERE id IN ('claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6');
