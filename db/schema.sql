
-- Smart EV Charging Station Reservation System
-- MySQL 8.0+
-- Run against the smart_ev_charging database.

CREATE DATABASE IF NOT EXISTS smart_ev_charging_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE smart_ev_charging_test;

-- Drop tables in reverse dependency order.
-- WARNING: This removes existing data in these tables.
-- Only run this reset script when you intend to recreate the schema.
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS charging_sessions;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS charging_points;
DROP TABLE IF EXISTS tariff_plans;
DROP TABLE IF EXISTS evs;
DROP TABLE IF EXISTS charging_stations;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE evs (
    ev_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    vehicle_number VARCHAR(20) NOT NULL UNIQUE,
    model VARCHAR(100) NOT NULL,
    battery_capacity DECIMAL(6,2) NOT NULL,
    connector_type VARCHAR(50) NOT NULL,
    CONSTRAINT chk_evs_battery_capacity CHECK (battery_capacity > 0),
    CONSTRAINT fk_evs_user FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE charging_stations (
    station_id INT AUTO_INCREMENT PRIMARY KEY,
    station_name VARCHAR(150) NOT NULL,
    location VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    CONSTRAINT chk_station_latitude
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_station_longitude
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

CREATE TABLE charging_points (
    point_id INT AUTO_INCREMENT PRIMARY KEY,
    point_code VARCHAR(20) NOT NULL,
    station_id INT NOT NULL,
    connector_type VARCHAR(50) NOT NULL,
    power_kw DECIMAL(6,2) NOT NULL,
    status ENUM('Available', 'Occupied', 'Unavailable', 'Maintenance')
        NOT NULL DEFAULT 'Available',
    CONSTRAINT chk_point_power CHECK (power_kw > 0),
    CONSTRAINT uq_charging_points_point_code UNIQUE (point_code),
    CONSTRAINT fk_points_station FOREIGN KEY (station_id)
        REFERENCES charging_stations(station_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE tariff_plans (
    tariff_id INT AUTO_INCREMENT PRIMARY KEY,
    station_id INT NOT NULL,
    rate_per_kwh DECIMAL(8,2) NOT NULL,
    CONSTRAINT chk_tariff_rate CHECK (rate_per_kwh >= 0),
    CONSTRAINT fk_tariffs_station FOREIGN KEY (station_id)
        REFERENCES charging_stations(station_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE reservations (
    reservation_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    ev_id INT NOT NULL,
    point_id INT NOT NULL,
    tariff_id INT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status ENUM('Booked', 'Confirmed', 'Cancelled', 'Completed', 'No-show')
        NOT NULL DEFAULT 'Booked',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_reservation_time CHECK (end_time > start_time),
    CONSTRAINT fk_reservations_user FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_reservations_ev FOREIGN KEY (ev_id)
        REFERENCES evs(ev_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_reservations_point FOREIGN KEY (point_id)
        REFERENCES charging_points(point_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_reservations_tariff FOREIGN KEY (tariff_id)
        REFERENCES tariff_plans(tariff_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_reservations_user_start (user_id, start_time),
    INDEX idx_reservations_point_time (point_id, start_time, end_time)
) ENGINE=InnoDB;

CREATE TABLE charging_sessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    reservation_id INT NOT NULL UNIQUE,
    actual_start DATETIME,
    actual_end DATETIME,
    energy_delivered DECIMAL(8,2),
    total_cost DECIMAL(10,2),
    CONSTRAINT chk_session_energy
        CHECK (energy_delivered IS NULL OR energy_delivered >= 0),
    CONSTRAINT chk_session_cost
        CHECK (total_cost IS NULL OR total_cost >= 0),
    CONSTRAINT chk_session_time
        CHECK (actual_end IS NULL OR actual_start IS NULL
               OR actual_end >= actual_start),
    CONSTRAINT fk_sessions_reservation FOREIGN KEY (reservation_id)
        REFERENCES reservations(reservation_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    reservation_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_status ENUM('Pending', 'Completed', 'Failed', 'Refunded')
        NOT NULL DEFAULT 'Pending',
    payment_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_amount CHECK (amount >= 0),
    CONSTRAINT fk_payments_reservation FOREIGN KEY (reservation_id)
        REFERENCES reservations(reservation_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_payments_reservation (reservation_id)
) ENGINE=InnoDB;
