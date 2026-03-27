# Tanish — Technical Debt & Future Improvements

## LOW Priority (Code Quality)

- [ ] `InterestWithCategory` extends `Interest` but just re-declares `category` — redundant, could just use `Interest` directly
- [ ] `api.upload.photo()` and `api.verification.submit()` bypass the `request()` helper for FormData — could unify with a `requestFormData()` helper
- [ ] `ProfileEditPage` has 590 lines — extract photo section, preferences, interests into sub-components
- [ ] `calculateCompleteness()` is duplicated between `MyProfilePage.tsx` and `ProfileEditPage.tsx` — extract to shared util
- [ ] Admin routes file is 700+ lines — split into `admin/users.ts`, `admin/reports.ts`, `admin/verifications.ts`, `admin/broadcast.ts`
- [ ] `DiscoveryPage.tsx` indentation inconsistency (tabs vs spaces) from earlier corruption fix

## INFO (Architectural Suggestions)

- [ ] Add Redis caching for interests list (rarely changes, queried on every profile edit)
- [ ] Add request deduplication in the API client (prevent double-tap submitting forms twice)
- [ ] Consider WebSocket or SSE for real-time intro notifications instead of polling
- [ ] Add structured logging (pino) with request IDs for debugging production issues
- [ ] Add health check endpoint that verifies R2 connectivity (currently only checks DB + Redis)
- [ ] Consider rate limiting per-endpoint instead of global 100/min (e.g., auth: 5/min, upload: 3/hour)
- [ ] Add OpenAPI/Swagger documentation generation from Zod schemas
- [ ] Photo compression should happen client-side before upload to save bandwidth on mobile networks
- [ ] Add automated tests — at minimum: auth flow, onboarding, discovery batch, intro lifecycle
- [ ] `CHAT_OPENED` event is defined but never written (chat happens in Telegram, no way to track)
- [ ] Consider adding `pausedAt` field to User model for profile pausing (currently removed from UI)
