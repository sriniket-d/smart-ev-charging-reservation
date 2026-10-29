-- Smart EV Charging Station Reservation System
-- MySQL 8.0+
-- Run against the database after applying schema.sql.
-- USE smart_ev_charging_test;

-- 1. Join reservations to the user, EV, charging point, and station.
-- SELECT
--     r.reservation_id,
--     u.name,
--     e.vehicle_number,
--     s.station_name,
--     p.point_id,
--     r.start_time,
--     r.end_time,
--     r.status
-- FROM reservations AS r
-- JOIN users AS u
--     ON u.user_id = r.user_id
-- JOIN evs AS e
--     ON e.ev_id = r.ev_id
-- JOIN charging_points AS p
--     ON p.point_id = r.point_id
-- JOIN charging_stations AS s
--     ON s.station_id = p.station_id
-- ORDER BY r.start_time;

-- 2. Aggregate reservation counts and average durations by station.
-- HAVING filters the groups after aggregation; ORDER BY ranks the results.
-- SELECT
--     s.station_name,
--     COUNT(r.reservation_id),
--     AVG(TIMESTAMPDIFF(MINUTE, r.start_time, r.end_time))
-- FROM charging_stations AS s
-- JOIN charging_points AS p
--     ON p.station_id = s.station_id
-- JOIN reservations AS r
--     ON r.point_id = p.point_id
-- GROUP BY s.station_id, s.station_name
-- HAVING COUNT(r.reservation_id) >= 1
-- ORDER BY COUNT(r.reservation_id) DESC, s.station_name;

-- 3. Subquery: find stations that have at least one active reservation.
-- SELECT
--     s.station_id,
--     s.station_name,
--     s.city
-- FROM charging_stations AS s
-- WHERE s.station_id IN (
--     SELECT p.station_id
--     FROM charging_points AS p
--     JOIN reservations AS r
--         ON r.point_id = p.point_id
--     WHERE r.status IN ('Booked', 'Confirmed')
-- )
-- ORDER BY s.city, s.station_name;

-- 4. Useful view for listing reservations with customer, EV, point, and station.
-- CREATE OR REPLACE VIEW advanced_reservation_details AS
-- SELECT
--     r.reservation_id,
--     r.user_id,
--     u.name,
--     r.ev_id,
--     e.vehicle_number,
--     r.point_id,
--     p.station_id,
--     s.station_name,
--     r.tariff_id,
--     r.start_time,
--     r.end_time,
--     r.status
-- FROM reservations AS r
-- JOIN users AS u
--     ON u.user_id = r.user_id
-- JOIN evs AS e
--     ON e.ev_id = r.ev_id
-- JOIN charging_points AS p
--     ON p.point_id = r.point_id
-- JOIN charging_stations AS s
--     ON s.station_id = p.station_id;

-- Example use of the view.
-- SELECT *
-- FROM advanced_reservation_details
-- ORDER BY start_time;

-- 5. Index demonstrations: these indexes already exist in schema.sql.
-- idx_reservations_user_start covers user_id followed by start_time.
-- EXPLAIN
-- SELECT reservation_id, start_time, end_time, status
-- FROM reservations FORCE INDEX (idx_reservations_user_start)
-- WHERE user_id = 1
--   AND start_time >= '2026-11-01 00:00:00'
-- ORDER BY start_time;

-- idx_reservations_point_time covers point_id, start_time, and end_time.
-- EXPLAIN
-- SELECT reservation_id, start_time, end_time, status
-- FROM reservations FORCE INDEX (idx_reservations_point_time)
-- WHERE point_id = 1
--   AND start_time < '2026-11-06 12:00:00'
--   AND end_time > '2026-11-06 10:00:00';

-- 6. Transaction control examples.
-- Use a temporary InnoDB table so the transaction demonstration never changes
-- permanent project data. The temporary table is dropped at the end.
-- CREATE TEMPORARY TABLE transaction_demo (
--     demo_id INT PRIMARY KEY,
--     demo_value VARCHAR(50) NOT NULL
-- ) ENGINE=InnoDB;

-- START TRANSACTION;
-- INSERT INTO transaction_demo (demo_id, demo_value)
-- VALUES (1, 'rolled back');
-- ROLLBACK;

-- The rolled-back row is absent.
-- SELECT *
-- FROM transaction_demo
-- WHERE demo_id = 1;

-- START TRANSACTION;
-- INSERT INTO transaction_demo (demo_id, demo_value)
-- VALUES (2, 'committed');
-- COMMIT;

-- The committed row remains.
-- SELECT *
-- FROM transaction_demo
-- WHERE demo_id = 2;

-- DROP TEMPORARY TABLE transaction_demo;

-- 7. Prevent overlapping active reservations on the same charging point.
-- Active reservations are Booked or Confirmed. Time intervals overlap when
-- existing.start_time < new.end_time and existing.end_time > new.start_time.
-- Locking the point row serializes concurrent checks for that point.
DELIMITER //

-- DROP TRIGGER IF EXISTS reservations_prevent_overlap_insert//
-- CREATE TRIGGER reservations_prevent_overlap_insert
-- BEFORE INSERT ON reservations
-- FOR EACH ROW
-- BEGIN
--     DECLARE conflicting_reservation_id INT DEFAULT NULL;
--     DECLARE locked_point_id INT;
--     DECLARE CONTINUE HANDLER FOR NOT FOUND
--         SET conflicting_reservation_id = NULL;

--     IF NEW.status IN ('Booked', 'Confirmed') THEN
--         SET conflicting_reservation_id = NULL;

--         SELECT charging_points.point_id
--         INTO locked_point_id
--         FROM charging_points
--         WHERE charging_points.point_id = NEW.point_id
--         FOR UPDATE;

--         SELECT reservation_id
--         INTO conflicting_reservation_id
--         FROM reservations
--         WHERE point_id = NEW.point_id
--           AND status IN ('Booked', 'Confirmed')
--           AND start_time < NEW.end_time
--           AND end_time > NEW.start_time
--         LIMIT 1;

--         IF conflicting_reservation_id IS NOT NULL THEN
--             SIGNAL SQLSTATE '45000'
--                 SET MESSAGE_TEXT = 'Charging point already has an overlapping active reservation';
--         END IF;
--     END IF;
-- END//

-- DROP TRIGGER IF EXISTS reservations_prevent_overlap_update//
-- CREATE TRIGGER reservations_prevent_overlap_update
-- BEFORE UPDATE ON reservations
-- FOR EACH ROW
-- BEGIN
--     DECLARE conflicting_reservation_id INT DEFAULT NULL;
--     DECLARE locked_point_id INT;
--     DECLARE CONTINUE HANDLER FOR NOT FOUND
--         SET conflicting_reservation_id = NULL;

--     IF NEW.status IN ('Booked', 'Confirmed') THEN
--         SET conflicting_reservation_id = NULL;

--         SELECT charging_points.point_id
--         INTO locked_point_id
--         FROM charging_points
--         WHERE charging_points.point_id = NEW.point_id
--         FOR UPDATE;

--         SELECT reservation_id
--         INTO conflicting_reservation_id
--         FROM reservations
--         WHERE point_id = NEW.point_id
--           AND reservation_id <> OLD.reservation_id
--           AND status IN ('Booked', 'Confirmed')
--           AND start_time < NEW.end_time
--           AND end_time > NEW.start_time
--         LIMIT 1;

--         IF conflicting_reservation_id IS NOT NULL THEN
--             SIGNAL SQLSTATE '45000'
--                 SET MESSAGE_TEXT = 'Charging point already has an overlapping active reservation';
--         END IF;
--     END IF;
-- END//

DELIMITER ;

-- 8. Optional ALTER example: add an index using existing columns.
-- Run only if this index is desired and does not already exist.
-- ALTER TABLE reservations
--     ADD INDEX idx_reservations_status_start (status, start_time);

-- 9. Optional destructive DDL example: drops the view created above.
-- This does not delete table data, but removes the view definition.
-- DROP VIEW IF EXISTS advanced_reservation_details;
