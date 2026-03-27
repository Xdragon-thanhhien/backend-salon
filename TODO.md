# Auth HTTP Testing & Fix TODO

## Fix identified issues first
- [x] Fix `UnauthorizedError` usage in `src/controllers/auth.controller.js` (use exported `AuthFailureError`)
- [x] Remove `Gender` from register payload in `src/postmain/auth.http`
- [x] Fix model-name collision risk in `src/models/baber.models.js` (`User` -> `Barber`)
- [x] Fix model-name collision risk in `src/models/customer.models.js` (`User` -> `Customer`)
- [x] Create and run DB repair script to clean legacy `users` conflicts and ensure auth user baseline in `Users`

## Critical-path testing
- [x] Test Register endpoint (`POST /api/v1/auth/register`) *(result: 409 Conflict expected for existing repaired user email)*
- [x] Test Login endpoint (`POST /api/v1/auth/login`)
- [x] Test Me endpoint (`GET /api/v1/auth/me`)
- [x] Test Wrong-password endpoint behavior (`POST /api/v1/auth/login`, expect 401)
- [ ] Summarize final critical-path test results
