-- Smart EV Charging Station Reservation System
-- MySQL 8.0+
-- Run db/schema.sql and db/seed.sql first, then execute this file.
-- DDL demo uses a TEMPORARY table; DML demo rolls back its test records.

USE smart_ev_charging_test;

-- ---------------------------------------------------------------------------
-- 1. DDL: CREATE, ALTER and DROP (safe temporary-table demonstration)
-- ---------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS dbms_ddl_demo;

CREATE TEMPORARY TABLE dbms_ddl_demo (
    demo_id INT PRIMARY KEY,
    demo_value VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

ALTER TABLE dbms_ddl_demo
    ADD COLUMN note VARCHAR(100) NULL;

INSERT INTO dbms_ddl_demo (demo_id, demo_value, note)
VALUES (1, 'DDL demonstration', 'Temporary table only');

SELECT demo_id, demo_value, note
FROM dbms_ddl_demo;

DROP TEMPORARY TABLE dbms_ddl_demo;

-- ---------------------------------------------------------------------------
-- 2. DML: INSERT, SELECT, UPDATE and DELETE (all changes are rolled back)
-- ---------------------------------------------------------------------------
START TRANSACTION;

INSERT INTO charging_stations (station_name, location, city)
VALUES ('DBMS DML Demo Station', 'Temporary test location', 'Bengaluru');
SET @demo_station_id = LAST_INSERT_ID();

INSERT INTO charging_points (station_id, point_code, connector_type, power_kw, status)
VALUES (@demo_station_id, 'SQLDEMO-01', 'CCS2', 50.00, 'Available');
SET @demo_point_id = LAST_INSERT_ID();

UPDATE charging_points
SET status = 'Maintenance'
WHERE point_id = @demo_point_id;

SELECT
    cs.station_name,
    cp.point_id,
    cp.connector_type,
    cp.power_kw,
    cp.status
FROM charging_stations AS cs
JOIN charging_points AS cp
    ON cp.station_id = cs.station_id
WHERE cs.station_id = @demo_station_id;

DELETE FROM charging_points
WHERE point_id = @demo_point_id;

DELETE FROM charging_stations
WHERE station_id = @demo_station_id;

ROLLBACK;

-- Confirm that the temporary DML station was not retained.
SELECT station_id, station_name
FROM charging_stations
WHERE station_name = 'DBMS DML Demo Station';

-- ---------------------------------------------------------------------------
-- 3. JOIN + ORDER BY: reservation details across related tables
-- ---------------------------------------------------------------------------
SELECT
    r.reservation_id,
    u.name AS customer_name,
    e.vehicle_number,
    e.model AS vehicle_model,
    s.station_name,
    s.city,
    p.point_id,
    r.start_time,
    r.end_time,
    r.status
FROM reservations AS r
JOIN users AS u
    ON u.user_id = r.user_id
JOIN evs AS e
    ON e.ev_id = r.ev_id
JOIN charging_points AS p
    ON p.point_id = r.point_id
JOIN charging_stations AS s
    ON s.station_id = p.station_id
ORDER BY r.start_time DESC;

-- ---------------------------------------------------------------------------
-- 4. GROUP BY + HAVING + aggregate functions + ORDER BY
-- ---------------------------------------------------------------------------
SELECT
    s.station_id,
    s.station_name,
    COUNT(r.reservation_id) AS reservation_count,
    COALESCE(AVG(TIMESTAMPDIFF(MINUTE, r.start_time, r.end_time)), 0)
        AS average_duration_minutes
FROM charging_stations AS s
JOIN charging_points AS p
    ON p.station_id = s.station_id
LEFT JOIN reservations AS r
    ON r.point_id = p.point_id
GROUP BY s.station_id, s.station_name
HAVING COUNT(r.reservation_id) >= 1
ORDER BY reservation_count DESC, s.station_name;

-- ---------------------------------------------------------------------------
-- 5. Subquery: stations with at least one active reservation
-- ---------------------------------------------------------------------------
SELECT
    s.station_id,
    s.station_name,
    s.city
FROM charging_stations AS s
WHERE s.station_id IN (
    SELECT p.station_id
    FROM charging_points AS p
    JOIN reservations AS r
        ON r.point_id = p.point_id
    WHERE r.status IN ('Booked', 'Confirmed')
)
ORDER BY s.city, s.station_name;

-- ---------------------------------------------------------------------------
-- 6. View: create with db/views.sql, then query it here
-- ---------------------------------------------------------------------------
SELECT *
FROM advanced_reservation_details
ORDER BY start_time DESC;

-- ---------------------------------------------------------------------------
-- 7. Indexes: these are declared in schema.sql
-- ---------------------------------------------------------------------------
SHOW INDEX FROM reservations;

EXPLAIN
SELECT reservation_id, start_time, end_time, status
FROM reservations
WHERE user_id = 1
  AND start_time >= '2026-11-01 00:00:00'
ORDER BY start_time;

EXPLAIN
SELECT reservation_id, start_time, end_time, status
FROM reservations
WHERE point_id = 1
  AND start_time < '2026-11-06 12:00:00'
  AND end_time > '2026-11-06 10:00:00';

-- ---------------------------------------------------------------------------
-- 8. Transaction in the application
-- ---------------------------------------------------------------------------
-- POST /api/reservations locks the selected charging-point row, checks
-- availability, tariff ownership, EV ownership and time conflicts, then
-- inserts the reservation and its Pending payment in one MySQL transaction.
-- If either INSERT fails, the API rolls back both changes. MongoDB logging
-- occurs after commit and is best-effort, so a MongoDB outage cannot undo a
-- committed MySQL reservation.
