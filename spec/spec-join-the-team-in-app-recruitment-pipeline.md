# Spec: "Join the team" → in-app recruitment pipeline

## Problem
The landing page's "Join our team" button only opens an email to info@opulencesecurity.co.uk. Applications arrive as loose emails with attachments. Someone has to read each CV, check the SIA badge by eye, and type the person into the app by hand. Opulence wants applicants to apply directly. AI reads their CV and SIA badge, and they land in **Recruitment → Applicants**, ready for a manager to decide.

## Who it's for
- **Applicants:** members of the public, with no login. Mostly on a phone.
- **Company managers:** they review applicants, invite them to onboarding, or reject them.

## Decisions made
- **Roles offered:** door supervisor, security guard, CCTV operator, steward, close protection. The user chose all of these.
- **Right to work and ID** are *not* collected on the form. The applicant only ticks "I have the right to work in the UK". The documents are collected at onboarding, as today. (Recommended default.)
- **Rejecting an applicant** gives an optional polite email. The "Send email" tick is on by default. (Recommended default.)
- **Retention:** applications that are not progressed are deleted automatically after **6 months**, with their files. (Recommended default.)

## Requirements

### 1. Public Apply page
- The landing "Join our team" button opens the app's public **Apply** page instead of mailto. It is in Opulence branding and works well on mobile.
- **Fields:**
  - first name, last name, email, phone, postcode
  - roles wanted (multi-select from the list above)
  - availability (weekdays / weekends / nights / events, plus a free-text note)
  - "I have the right to work in the UK" tick
  - CV upload: PDF, Word, or a photo. Max 10 MB.
  - SIA badge photo: front required, back optional. Required unless the *only* role picked is Steward.
  - SIA licence number (optional; AI fills it from the badge if blank)
  - privacy notice and consent tick
- **Spam protection:**
  - a honeypot field
  - at most 5 applications per IP per hour, matching the existing demo-request form
  - one open application per email or SIA number. A repeat updates the existing applicant instead of creating a duplicate.
- After submitting:
  - The applicant sees a thank-you screen.
  - They get an email: "We've got your application".
- **Not included:** applicant login, application tracking, and right-to-work and ID uploads (all deferred to onboarding).

### 2. AI reads the files
This runs in the background right after the application is submitted. The applicant does not wait for it.
- **From the CV:**
  - a 2–3 sentence summary
  - years in security
  - recent employers and venues
  - relevant qualifications (first aid, CCTV, conflict management, close protection, etc.)
- **From the SIA badge:**
  - licence number, licence type(s), expiry date, and the name on the badge
- **Flags shown to the manager:**
  - badge expired or expiring within 60 days
  - name on the badge doesn't match the applicant
  - badge type doesn't cover the role(s) applied for
  - the badge couldn't be read
  - possible duplicate of an existing officer or applicant (same email, phone or SIA number)
- **If the AI fails or credits run out:** the application is still created, marked "Not read yet", and a manager can press "Read again".
- AI uses credits from the normal AI budget, in the same way the compliance document reading does.

### 3. Applicant in Recruitment
- A new applicant appears in **Recruitment → Applicants**, marked **New** and labelled "Applied online".
- Company managers get an in-app notification and an email: "New application from {name} — Door supervisor".
- **The applicant card / detail shows:**
  - their details, roles and availability
  - the AI summary and the extracted SIA details
  - flags
  - the CV and badge, which can be viewed or downloaded
- **Manager actions:**
  - **Check SIA register:** opens the official SIA public register search. A manager confirms the licence there by hand, because the SIA offers no app connection for this. "Mark SIA checked" records who checked it and when.
  - **Invite to onboarding:** moves them into the existing onboarding stage and sends the usual login invite. The CV and badge go onto their Documents tab. The SIA number, type and expiry go onto their profile.
  - **Reject:** an optional email ("Thank you for applying… not able to offer a role at this time"). The applicant is hidden from the Applicants list but kept until the retention period ends.
- Applicants added by hand (today's flow) keep working unchanged.
- Every action is audited.

### 4. Data protection
- **Retention:** applications that are still in Applicants or rejected are deleted after 6 months, with their files. This runs on the existing 5-minute schedule, at most once a day.
- People who were invited to onboarding are kept, as staff records are today.
- The privacy notice on the form states:
  - what is collected
  - why: to assess the application
  - that AI is used to read the documents
  - that data is deleted after 6 months if the application is not progressed
- The uploaded files are private. Only company managers can open them.

## Non-goals
- Applicant accounts and a status-tracking portal.
- Automated SIA register lookup.
- Interview scheduling.
- Job adverts for specific vacancies.
- Posting to job boards.

## Acceptance
- From the landing page, a visitor can apply on a phone with a CV and an SIA badge photo, and gets a confirmation email.
- The applicant appears in Recruitment → Applicants within a minute, with an AI summary, SIA details and any flags.
- A manager can invite the applicant to onboarding, and their documents and SIA details carry over. A manager can also reject the applicant, with or without an email.
- Spam limits work.
- Duplicates are merged.
- Applications that are not progressed are deleted after 6 months.
- Nothing is submitted against the live system during testing without the user's OK.
