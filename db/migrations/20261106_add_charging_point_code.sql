-- Add persistent human-readable charging-point codes.
-- Safe to run against an existing development database. The script checks
-- whether the column and named unique index already exist before adding them.

USE smart_ev_charging_test;

SET @point_code_column_exists = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'charging_points'
      AND column_name = 'point_code'
);

SET @add_point_code_sql = IF(
    @point_code_column_exists = 0,
    'ALTER TABLE charging_points ADD COLUMN point_code VARCHAR(20) NULL AFTER point_id',
    'SELECT 1'
);
PREPARE add_point_code_stmt FROM @add_point_code_sql;
EXECUTE add_point_code_stmt;
DEALLOCATE PREPARE add_point_code_stmt;

UPDATE charging_points
SET point_code = CONCAT('CP-', LPAD(point_id, 2, '0'))
WHERE point_code IS NULL OR TRIM(point_code) = '';

SET @point_code_index_exists = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'charging_points'
      AND index_name = 'uq_charging_points_point_code'
);

SET @add_point_code_index_sql = IF(
    @point_code_index_exists = 0,
    'CREATE UNIQUE INDEX uq_charging_points_point_code ON charging_points(point_code)',
    'SELECT 1'
);
PREPARE add_point_code_index_stmt FROM @add_point_code_index_sql;
EXECUTE add_point_code_index_stmt;
DEALLOCATE PREPARE add_point_code_index_stmt;

ALTER TABLE charging_points
    MODIFY point_code VARCHAR(20) NOT NULL;
