# Fix VSCode "Connection Rejected" Error (REST Client / Backend Not Running)

## Status: In Progress

### Steps:
- [ ] 1. Fix salon/backend/server.js (empty file)
- [ ] 2. cd f:/my-app/salon/salon/backend &amp;&amp; docker compose up -d
- [ ] 3. cd f:/my-app/salon/salon/backend &amp;&amp; npm install &amp;&amp; npm start
- [ ] 4. Test: Click "Send Request" on customer.http signin or GET /health
- [ ] 5. VSCode: Ctrl+Shift+P > "Preferences: Open User Settings (JSON)" - remove "http.proxy" if present
- [x] Done ✅

**Current Issue:** Backend server not running on port 3000 (confirmed no listener)

**Expected:** After step 3, localhost:3000/health returns OK JSON

