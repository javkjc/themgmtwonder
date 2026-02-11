-- Rollback ML Model Versions
DROP INDEX IF EXISTS "ml_model_versions_is_active_idx";
DROP TABLE IF EXISTS "ml_model_versions";
