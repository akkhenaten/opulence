# API reference (auto-generated). POST JSON {action, ...fields} with Authorization: Bearer <token>

A company or security manager with a linked staff record (`user.dual`) adds `_as: 'officer'` to act on the "My shifts" side (officer role, own record only). Without it they act as a manager, `officer_id` is null and `self_officer_id` is their record. Rows on approval lists carry `is_self`, `self_locked` (another manager must approve) and `self_approved`.

## auth.mjs
- auth.needsBootstrap [public] fields: -
- auth.bootstrap [public] fields: password, email, name, company_name
- auth.login [public] fields: email, password
- auth.me [ALL] fields: -
- auth.landing [ALL] fields: - → {side: 'officer'|'manager'} (officer when clocked in or due on within 2 hours)
- auth.inviteInfo [public] fields: token
- auth.acceptInvite [public] fields: password, token
- auth.requestReset [public] fields: email
- auth.reset [public] fields: password, token
- auth.changePassword [ALL] fields: password, current

## clock.mjs
- clock.status [['officer']] fields: -
- clock.punch [['officer']] fields: kind, assignment_id, lat, lng, accuracy, qr, exception_reason
- clock.exceptions [MGR] fields: include_decided
- clock.decide [MGR] fields: id, approve
- clock.manual [MGR] fields: end, start, assignment_id, reason, break_minutes, venue_id

## dashboard.mjs
- dashboard.get [ALL] fields: -

## documents.mjs
- files.uploadUrl [ALL] fields: purpose, filename, content_type
- docs.list [ALL] fields: owner_type, owner_id
- docs.create [ALL] fields: owner_type, owner_id, s, kind, title, number, expiry, mime
- docs.url [ALL] fields: id
- docs.verify [CO] fields: id
- docs.delete [ALL] fields: id
- docs.expiring [CO] fields: days

## hr.mjs
- timeoff.decide [MGR] fields: status, id, officer_id, kind
- hrnotes.create [MGR] fields: kind, officer_id, title, body, level, visible_to_officer
- hrnotes.delete [CO] fields: id
- onboarding.pipeline [CO] fields: officer_id
- onboarding.toggle [CO] fields: officer_id, code, done
- onboarding.setStatus [CO] fields: status, officer_id, force
- contracts.templates [CO] fields: -
- contracts.saveTemplate [CO] fields: id, title, body, active
- contracts.send [CO] fields: template_id, officer_id, id
- contracts.sign [['officer']] fields: signature, id, signed_name
- contracts.void [CO] fields: id
- offboarding.save [CO] fields: officer_id, leave_date, reason, kit_returned, rehire_eligible, notes, disable_login
- offboarding.rehire [CO] fields: officer_id

## incidents.mjs
- incidents.types [ALL] fields: -
- incidents.list [ALL] fields: officer_id, status, severity, type, venue_id, from, to, search, limit
- incidents.get [ALL] fields: id
- incidents.version [MGR] fields: id, venue_id, officer_id, shift_id, occurred_at, witnesses, attachments
- incidents.review [MGR] fields: decision, comment, id
- incidents.pdf [ALL] fields: id, from, to, venue_id

## money.mjs
- pay.suggestPeriod [CO] fields: -
- pay.preview [CO] fields: start, end
- pay.generate [CO] fields: start, end
- pay.list [ALL] fields: officer_id, status, period_start, id
- pay.addLine [CO] fields: kind, statement_id, amount, description
- pay.removeLine [CO] fields: id
- pay.delete [CO] fields: id
- pay.issue [CO] fields: ids
- pay.markPaid [CO] fields: ids
- pay.exportCsv [CO] fields: ids, period_start
- invoices.generate [CO] fields: start, end, venue_id, status, id
- invoices.addLine [CO] fields: invoice_id, description, hours, rate, amount
- invoices.updateLine [CO] fields: id, hours, rate, amount, description
- invoices.removeLine [CO] fields: id
- invoices.update [CO] fields: id, notes
- invoices.delete [CO] fields: id
- invoices.issue [CO] fields: id
- invoices.markPaid [CO] fields: id, paid_at
- invoices.credit [CO] fields: id, amount, reason
- invoices.exportCsv [CO] fields: from, to
- reports.margin [CO] fields: from, to
- reports.hours [CO] fields: from, to
- reports.overdue [CO] fields: -

## notifications.mjs
- notifications.list [ALL] fields: unread, before
- notifications.unreadCount [ALL] fields: -
- notifications.markRead [ALL] fields: ids

## officers.mjs
- officers.list [MGR] fields: status, role, q
- officers.get [ALL] fields: id, venue_id, invite, email, first_name, last_name, phone
- officers.inviteLogin [CO] fields: id (409 {can_link, user_name} when the email is a manager login)
- officers.linkLogin [CO] fields: id
- officers.save also takes link_user (link to the manager login with this email) and keep_separate
- officers.saveRate [CO] fields: venue_id, officer_id
- officers.deleteRate [CO] fields: id, officer_id, contacts
- officers.saveBan [CO] fields: remove, officer_id, venue_id, reason, days

## rota.mjs
- cover.accept [MGR] fields: id, open
- cover.decline [MGR] fields: id, reason
- shifts.list [ALL] fields: from, to, venue_id, include_cancelled, officer_id
- shifts.get [MGR] fields: id
- shifts.save [MGR] fields: venue_id, ends_at, starts_at, id
- shifts.bulkCreate [MGR] fields: venue_id, dates, start_time, end_time, role, headcount, break_minutes, open, status, notes
- shifts.publish [MGR] fields: ids
- shifts.cancel [MGR] fields: id, reason
- shifts.delete [MGR] fields: id
- shifts.copyWeek [MGR] fields: to_week, from_week, venue_id
- shifts.candidates [MGR] fields: shift_id
- shifts.assign [MGR] fields: shift_id, officer_id, override
- shifts.unassign [MGR] fields: id
- shifts.decideRequest [MGR] fields: id, approve
- shifts.pendingRequests [MGR] fields: -
- shifts.mine [['officer']] fields: from, to
- shifts.open [['officer']] fields: officer_id, venue_id
- shifts.request [['officer']] fields: shift_id
- shifts.respond [['officer']] fields: assignment_id, accept, reason

## settings.mjs
- settings.get [ALL] fields: -
- settings.update [CO] fields: -
- roles.list [ALL] fields: day, name

## timesheets.mjs
- timesheets.approve [MGR] fields: ids, id, comment
- timesheets.edit [MGR] fields: id, actual_start, actual_end, break_minutes, hours, reason
- timesheets.missing [MGR] fields: -
- timesheets.venueCheck [['venue']] fields: venue_id

## users.mjs
- users.list [CO] fields: role
- users.invite [CO] fields: role, venue_ids
- users.update [CO] fields: id, status, venue_ids
- users.resetLink [CO] fields: id
- users.resendInvite [CO] fields: id
- users.setWorksShifts [CO] fields: id, on, officer_id
- users.mergeOfficerLogin [CO] fields: manager_id, officer_user_id
- users.managers [ALL] fields: -
- audit.list [CO] fields: entity, entity_id, limit

## venues.mjs
- venues.save [CO] fields: id, venue_id
- venues.saveRate [CO] fields: venue_id
- venues.deleteRate [CO] fields: id
- venues.qr [MGR] fields: id
- venues.qrRegenerate [CO] fields: id
- venues.qrPoster [MGR] fields: id
- clients.list [CO] fields: -
- clients.save [CO] fields: id
