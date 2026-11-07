# Close-out: the platform admin's venue editing works; no further changes

## Context
- **The question:** last time I asked which email the platform admin signs in with. If it wasn't on the platform list (`PLATFORM_ADMINS`), I would have added it and redeployed.
- **The answer:** the platform admin signs in with **info@orbsolutions.co.uk**. That email is already on the list (it is the default in `functions/api/lib/platform.mjs`).
- **Why it works now:**
  - The server makes this login a full Company manager on every request (`ensurePlatformRole` and `resolveActing` in `functions/api/lib/auth.mjs`).
  - The app reads that role from `auth.me`.
- **Your check:** you opened a venue as info@ after the v125 release and confirmed "All fixed now". Client, Address, Invoice cycle, Website and Charge rates all show and can be edited.

## Plan
- **No code change.**
- **No secret change:** `PLATFORM_ADMINS` stays as it is.
- **No deploy.**
- The Orb venue lookups, the "Let Orb fill this in" button and the venue logos are already live (v125) and pushed.

## Verification
- Already done: you checked as info@ on the live app.
- Already done: the stand-in server check earlier showed the platform admin (stored role security) as Company manager, with Charge rates and the Client and Invoice fields.
