# Plan: get orbsec.orbsolutions.co.uk loading, and keep email verified

## Context
The user says the subdomain is with IONOS and the site doesn't load. Read-only checks today (22 Oct 2026) show the following.

**The app itself is ready**
- `openkbs domain info` reports orbsec.orbsolutions.co.uk as `active`, with its own CloudFront distribution and certificate.
- Requesting `https://orbsec.orbsolutions.co.uk/app/` directly from CloudFront, without public DNS, returns **200**.

**Public DNS doesn't know the subdomain**
- `orbsec.orbsolutions.co.uk` returns "not found" everywhere, so browsers can't find it.

**The live DNS for orbsolutions.co.uk is no longer Wix**
- The domain now answers from `ns-160.awsdns-20.com`, `ns-1162.awsdns-17.org`, `ns-1814.awsdns-34.co.uk` and `ns-537.awsdns-03.net`. This is the zone the user manages through IONOS.
- The Wix panel the user pasted earlier is no longer in use. That's why the DKIM records they added in Wix no longer show publicly.
- In the live zone:
  - the root site is served from S3/CloudFront;
  - **MX points to IONOS** (`mx00/mx01.ionos.co.uk`), not Google Workspace;
  - `test.orbsolutions.co.uk` and the SendGrid records don't exist.

**Our project's zone was recreated**
- It now uses **new name servers**:
  - `ns-1309.awsdns-35.org`
  - `ns-601.awsdns-11.net`
  - `ns-393.awsdns-49.com`
  - `ns-1748.awsdns-26.co.uk`
  These are not the ns-1965/… set given earlier.
- The email records (3 DKIM CNAMEs and `_amazonses` TXT) are no longer in it.
- SES still says "verified", but with no DKIM records live anywhere it will eventually lapse and sending will stop.

**What's missing:** one NS record for `orbsec` in the IONOS-managed zone. It hands the subdomain to our zone, which then serves both the site and the email records.

## Status, 22 Oct (after `openkbs domain verify`)
- **Steps 1–2 are done.** The `orbsec` NS delegation is live. Google and Cloudflare both resolve orbsec to CloudFront, and `https://orbsec.orbsolutions.co.uk` returns 200. `domain verify` reports active.
- Opening it from this container still fails to connect, but going straight to the CloudFront IP returns 200 for `/app/`. This container's own DNS is behind; the public internet is fine.
- **Email:** SES verify-status says Success (DKIM Success). But `_amazonses.orbsec…` doesn't exist publicly, so the email records still have to go back into our zone (step 3). Without them, SES will eventually drop the verification.
- **Next to run, after the plan is approved:** step 3, then step 4 (ask about APP_URL), then step 5.

## Steps

### 1. The user adds one record in the zone that actually serves orbsolutions.co.uk

**Update, 22 Oct:** the user's screenshot was the IONOS **domain-level "Edit name server"** page.
- It shows ns-1162/ns-160/ns-1814/ns-537, so IONOS is only the registrar.
- The DNS zone is an **AWS Route 53 hosted zone**, and the root site is also on AWS (S3/CloudFront).
- The user was told to **Cancel** and not change those name servers: that would break the main site and the IONOS mail.
- The `orbsec` NS record must be added inside that Route 53 zone, by whoever controls it: their own AWS account, another OpenKBS project (another studio project or account), or a developer/agency.
- If the zone is in an OpenKBS project the user can open, that project's agent can run `openkbs domain records set orbsec NS <4 values>`, after a records listing and the user's yes there.
- If it's their own AWS account: Route 53 → Hosted zones → orbsolutions.co.uk → Create record → name `orbsec`, type NS, the 4 values, TTL 300.

**The user confirmed the zone is in another OpenKBS project.** In that project, the user asks its agent to run (after `openkbs domain records` and their yes there):
`openkbs domain records set orbsec NS ns-1309.awsdns-35.org ns-601.awsdns-11.net ns-393.awsdns-49.com ns-1748.awsdns-26.co.uk --ttl 300`
- It adds only the `orbsec` record; nothing else in that zone changes.
- I can't do it from here: this account only sees the Orb Security project.

The record:
- **Type:** NS
- **Host / name:** `orbsec`
- **Values:** the 4 current name servers (one record with 4 values, or 4 records, as IONOS prefers):
  - `ns-1309.awsdns-35.org`
  - `ns-601.awsdns-11.net`
  - `ns-393.awsdns-49.com`
  - `ns-1748.awsdns-26.co.uk`
- **Not the old set:** the ns-1965… name servers given earlier must not be used.
- **No other `orbsec` records:** there must be no A, CNAME or other record named `orbsec`, because it conflicts with NS.
- Nothing else in IONOS changes.

### 2. Confirm delegation (read-only)
- Use the Node resolver script (`/tmp/sitecheck.mjs`) against 8.8.8.8: `orbsec.orbsolutions.co.uk` NS should return the 4 servers, and A should resolve to CloudFront.
- Run `openkbs domain verify`.
- `https://orbsec.orbsolutions.co.uk/app/` returns 200 and shows the sign-in page.

### 3. Put the email records back in our zone (after the user approves)
- Run `openkbs email verify-domain orbsec.orbsolutions.co.uk` again. It recreates `_amazonses` TXT and 3 DKIM CNAMEs in our zone. These are records in our own zone; the user's DNS doesn't change.
- If verify-domain refuses because the domain is already verified, use the fallback: show the user the 4 records first, then add them with `openkbs domain records set` after their yes.
- `openkbs email verify-status` must show DKIM Success, and the records must be publicly visible via 8.8.8.8.
- After this, **no email records are needed at IONOS or Wix**. The user can delete the 4 records they added at Wix (harmless either way).

### 4. Links in emails point at the new address
- `functions/api/lib/notify.mjs` builds email links from `process.env.APP_URL`.
- Check the current value via `openkbs fn list` or the config (without printing secrets).
- If it isn't `https://orbsec.orbsolutions.co.uk`, ask the user before changing it, because existing links in sent emails would still use the old address.
- If they say yes, redeploy with `openkbs fn deploy api -e APP_URL=https://orbsec.orbsolutions.co.uk`, keeping all existing env values. The CloudFront URL keeps working.

### 5. Test email
Send a test email and a real password reset to an address the user gives, and confirm they arrive (inbox, not spam).

## Flag to the user (not ours to change)
- The live MX for orbsolutions.co.uk now goes to **IONOS mail**, not Google Workspace.
- The SendGrid records and `test.orbsolutions.co.uk` are gone.
- If they still rely on Google Workspace mailboxes or SendGrid, that changed when the DNS moved. They should check it was intended.
- We won't touch the root domain.

## Rules
- No DNS change on our side without the user's explicit yes in that turn.
- No purchase.
- Don't print secrets.

## Verification
- `orbsec.orbsolutions.co.uk` resolves publicly.
- `/app/` loads the sign-in page at 390 px and 1440 px.
- `openkbs domain verify` shows active.
- `openkbs email verify-status` shows DKIM Success with the records publicly visible.
- The test email and the reset email arrive, and links in them open the new address.
- Close agent-browser afterwards.
