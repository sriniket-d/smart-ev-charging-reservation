# Entity–Relationship Diagram

This ER diagram reflects the eight tables defined in `db/schema.sql`. Mermaid renders it in the GitHub Markdown preview.

```mermaid
erDiagram
    users ||--o{ evs : owns
    users ||--o{ reservations : places
    evs ||--o{ reservations : used_for
    charging_stations ||--o{ charging_points : contains
    charging_stations ||--o{ tariff_plans : defines
    charging_points ||--o{ reservations : reserved_for
    tariff_plans ||--o{ reservations : prices
    reservations ||--o| charging_sessions : may_have
    reservations ||--o{ payments : has

    users {
        INT user_id PK
        VARCHAR name
        VARCHAR email UK
        VARCHAR phone UK
        VARCHAR password_hash
        VARCHAR address
        ENUM role
        TIMESTAMP created_at
    }

    evs {
        INT ev_id PK
        INT user_id FK
        VARCHAR vehicle_number UK
        VARCHAR model
        DECIMAL battery_capacity
        VARCHAR connector_type
    }

    charging_stations {
        INT station_id PK
        VARCHAR station_name
        VARCHAR location
        VARCHAR city
        DECIMAL latitude
        DECIMAL longitude
    }

    charging_points {
        INT point_id PK
        VARCHAR point_code UK
        INT station_id FK
        VARCHAR connector_type
        DECIMAL power_kw
        ENUM status
    }

    tariff_plans {
        INT tariff_id PK
        INT station_id FK
        DECIMAL rate_per_kwh
    }

    reservations {
        INT reservation_id PK
        INT user_id FK
        INT ev_id FK
        INT point_id FK
        INT tariff_id FK
        DATETIME start_time
        DATETIME end_time
        ENUM status
        TIMESTAMP created_at
    }

    charging_sessions {
        INT session_id PK
        INT reservation_id FK,UK
        DATETIME actual_start
        DATETIME actual_end
        DECIMAL energy_delivered
        DECIMAL total_cost
    }

    payments {
        INT payment_id PK
        INT reservation_id FK
        DECIMAL amount
        VARCHAR payment_method
        ENUM payment_status
        TIMESTAMP payment_time
    }
```

## Relationship notes

- One user can own multiple EVs and create multiple reservations.
- One charging station contains multiple charging points and can define multiple tariff plans.
- Each reservation references exactly one user, EV, charging point and tariff plan.
- A reservation can have zero or one charging session because `charging_sessions.reservation_id` is unique.
- A reservation can have multiple payment records because `payments.reservation_id` is not unique.
- Foreign keys use restrictive deletion rules where historical records must be preserved.
- Vehicle registration number, user email and phone are unique.

## Relational schema

The authoritative relational schema is implemented in `db/schema.sql`; table attributes and constraints are described in [data-dictionary.md](./data-dictionary.md). Re-run this diagram against the schema if columns or relationships change.
