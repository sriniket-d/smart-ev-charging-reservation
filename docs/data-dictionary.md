\# Smart EV Charging Station Reservation System

\## Database Data Dictionary



\### 1. Overview

The system uses MySQL 8.0 to store users, electric vehicles, charging stations, charging points, tariff plans, reservations, charging sessions, and payments.



\### 2. Tables and Attributes



\#### 2.1 `users`

Stores customer and administrator account details.



| Column | Type | Constraints | Description |

|---|---|---|---|

| user\_id | INT | Primary key, auto-increment | Unique user identifier |

| name | VARCHAR(100) | NOT NULL | User's name |

| email | VARCHAR(255) | UNIQUE, NOT NULL | Email address |

| phone | VARCHAR(20) | UNIQUE, NOT NULL | Phone number |

| password\_hash | VARCHAR(255) | NOT NULL | Password hash |

| address | VARCHAR(255) | NULL | User's address |

| role | ENUM | NOT NULL, default customer | customer or admin |

| created\_at | TIMESTAMP | Default current timestamp | Account creation time |



\#### 2.2 `evs`

Stores electric vehicles registered by users.



| Column | Type | Constraints | Description |

|---|---|---|---|

| ev\_id | INT | Primary key, auto-increment | Unique vehicle identifier |

| user\_id | INT | Foreign key, NOT NULL | Vehicle owner |

| vehicle\_number | VARCHAR(20) | UNIQUE, NOT NULL | Vehicle registration number |

| model | VARCHAR(100) | NOT NULL | Vehicle model |

| battery\_capacity | DECIMAL(6,2) | CHECK greater than 0 | Battery capacity |

| connector\_type | VARCHAR(50) | NOT NULL | Vehicle connector type |



\#### 2.3 `charging\_stations`

Stores charging station locations.



| Column | Type | Constraints | Description |

|---|---|---|---|

| station\_id | INT | Primary key, auto-increment | Unique station identifier |

| station\_name | VARCHAR(150) | NOT NULL | Station name |

| location | VARCHAR(255) | NOT NULL | Street or campus location |

| city | VARCHAR(100) | NOT NULL | City |

| latitude | DECIMAL(10,7) | CHECK from -90 to 90, nullable | Latitude |

| longitude | DECIMAL(10,7) | CHECK from -180 to 180, nullable | Longitude |



\#### 2.4 `charging\_points`

Stores individual charging points at stations.



| Column | Type | Constraints | Description |

|---|---|---|---|

| point\_id | INT | Primary key, auto-increment | Unique charging point identifier |

| point\_code | VARCHAR(20) | UNIQUE, NOT NULL | Human-readable charging-point code, such as PES-01 |

| station\_id | INT | Foreign key, NOT NULL | Parent station |

| connector\_type | VARCHAR(50) | NOT NULL | Supported connector |

| power\_kw | DECIMAL(6,2) | CHECK greater than 0 | Charging power in kW |

| status | ENUM | NOT NULL, default Available | Available, Occupied, Unavailable, or Maintenance |



\#### 2.5 `tariff\_plans`

Stores charging prices associated with stations.



| Column | Type | Constraints | Description |

|---|---|---|---|

| tariff\_id | INT | Primary key, auto-increment | Unique tariff identifier |

| station\_id | INT | Foreign key, NOT NULL | Associated station |

| rate\_per\_kwh | DECIMAL(8,2) | CHECK at least 0 | Price per kWh |



\#### 2.6 `reservations`

Stores charging bookings made by users.



| Column | Type | Constraints | Description |

|---|---|---|---|

| reservation\_id | INT | Primary key, auto-increment | Unique reservation identifier |

| user\_id | INT | Foreign key, NOT NULL | User who made the booking |

| ev\_id | INT | Foreign key, NOT NULL | Vehicle being charged |

| point\_id | INT | Foreign key, NOT NULL | Reserved charging point |

| tariff\_id | INT | Foreign key, NOT NULL | Applied tariff |

| start\_time | DATETIME | NOT NULL | Scheduled start |

| end\_time | DATETIME | CHECK greater than start time | Scheduled end |

| status | ENUM | NOT NULL, default Booked | Booked, Confirmed, Cancelled, Completed, or No-show |

| created\_at | TIMESTAMP | Default current timestamp | Booking creation time |



\#### 2.7 `charging\_sessions`

Stores actual charging session measurements and costs.



| Column | Type | Constraints | Description |

|---|---|---|---|

| session\_id | INT | Primary key, auto-increment | Unique session identifier |

| reservation\_id | INT | Unique foreign key, NOT NULL | Related reservation; at most one session per reservation |

| actual\_start | DATETIME | Nullable | Actual session start |

| actual\_end | DATETIME | Nullable, CHECK not before actual start when both exist | Actual session end |

| energy\_delivered | DECIMAL(8,2) | Nullable, CHECK at least 0 | Energy delivered in kWh |

| total\_cost | DECIMAL(10,2) | Nullable, CHECK at least 0 | Total session cost |



\#### 2.8 `payments`

Stores payment information for reservations.



| Column | Type | Constraints | Description |

|---|---|---|---|

| payment\_id | INT | Primary key, auto-increment | Unique payment identifier |

| reservation\_id | INT | Foreign key, NOT NULL | Related reservation |

| amount | DECIMAL(10,2) | CHECK at least 0 | Payment amount |

| payment\_method | VARCHAR(50) | NOT NULL | Payment method |

| payment\_status | ENUM | NOT NULL, default Pending | Pending, Completed, Failed

