# Final Demonstration Checklist

Use this order to show the connection between the project problem, database design, database implementation and the web application.

## 1. Problem and design

- [ ] Explain the EV charging reservation problem and project objectives.
- [ ] Show the [ER diagram](./er-diagram.md), entities, attributes, primary keys, foreign keys and cardinalities.
- [ ] Explain the relational schema and refer to the [data dictionary](./data-dictionary.md).
- [ ] Explain why MySQL is used for related transactional records and MongoDB for flexible activity events.

## 2. SQL implementation

- [ ] Show the eight MySQL tables and important primary/foreign-key and check constraints.
- [ ] Execute the safe CREATE, ALTER and DROP temporary-table demonstration in `db/advanced_queries.sql`.
- [ ] Execute the rollback-protected INSERT, SELECT, UPDATE and DELETE demonstration.
- [ ] Show the JOIN, GROUP BY, HAVING, ORDER BY, aggregate and subquery examples.
- [ ] Query `advanced_reservation_details` from the view.
- [x] Show the overlap-prevention INSERT and UPDATE triggers.
- [x] Show reservation indexes and the corresponding EXPLAIN plans.
- [ ] Explain the reservation-plus-pending-payment transaction and how a failure rolls back both inserts.

## 3. MongoDB implementation

- [ ] Show sample documents in `activity_logs`.
- [ ] Show the timestamp, user/timestamp and action/timestamp indexes.
- [x] Run `db/mongodb_activity_aggregation.js` in `mongosh` and explain the group/count result.
- [x] Sign in as two customers and show that each customer sees only their own activity.
- [x] Sign in as admin and show the application-wide activity view.

## 4. Web application

- [ ] Open the Sign in / Create account page from the main application's account panel.
- [ ] Register a customer and sign in.
- [x] Show the signed-in user's name, email and role in the sidebar; sign out using the in-app button and sign in again.
- [ ] Browse charging stations and booking options.
- [ ] Register an EV, edit it, and show duplicate-number validation.
- [x] Create a reservation and show the saved reservation and Pending payment row in MySQL.
- [x] Attempt an overlapping reservation and show that the request is rejected.
- [ ] Cancel an eligible reservation and show the updated status; the corresponding local MongoDB cancellation event still needs verification.
- [x] Sign in as admin and create a station with multiple charging points; show persistent point codes in MySQL.
- [x] Edit station details and change its point count; show the updated MySQL records.
- [x] Attempt to remove a station referenced by reservation history and show the reservation-history protection.
- [ ] Attempt admin station access as a customer and show HTTP 403.

## 5. Quality and submission evidence

- [x] Run `npm run lint` and `npm run build`.
- [ ] Run the pending test cases in [test-cases.md](./test-cases.md) and update their status only with actual results.
- [ ] Capture screenshots of the UI, SQL outputs, ER diagram, MongoDB documents/aggregation and test results.
- [ ] Explain each team member's individual code and database contributions.
- [ ] Present the conclusion and known limitations honestly.
