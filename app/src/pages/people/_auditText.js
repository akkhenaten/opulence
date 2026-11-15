import { titleCase } from '../../ui/index.jsx';

/* Audit wording shared by the Audit log and a person's access history */
export const actionTone = (a = '') => (/delete|void|cancel|offboard|remove|dispute|credit/.test(a) ? 'red'
  : /create|invite|generate|publish|issue|sign|approve|verify|paid|rehire/.test(a) ? 'green' : 'blue');
// What happened, in words; codes with no wording yet fall back to the code in title case
export const ACTION_TEXT = {
  'invoice.generate': 'Invoice drafted', 'invoice.issue': 'Invoice issued', 'invoice.paid': 'Invoice marked paid', 'invoice.credit': 'Credit note issued',
  'invoice.delete': 'Draft invoice deleted', 'invoice.add_line': 'Invoice line added', 'invoice.update_line': 'Invoice line changed', 'invoice.remove_line': 'Invoice line removed',
  'pay.generate': 'Pay statements drafted', 'pay.issue': 'Pay statement issued', 'pay.mark_paid': 'Pay marked as sent', 'pay.delete': 'Pay statement deleted',
  'pay.add_line': 'Pay line added', 'pay.remove_line': 'Pay line removed', 'pay.review_approve': 'Pay statement approved', 'pay.review_dispute': 'Pay statement queried',
  'pay_run.issue': 'Pay run issued', 'pay_run.finalise': 'Pay run finalised', 'pay_run.release': 'Pay statement released', 'pay_run.send_for_review': 'Pay run sent for review',
  'pay_run.delete': 'Pay run deleted', 'pay_run.resolve_dispute': 'Pay query resolved',
  'timesheet.approve': 'Timesheet approved', 'timesheet.sign': 'Timesheet signed', 'timesheet.dispute': 'Timesheet queried', 'timesheet.decline': 'Timesheet declined',
  'timesheet.edit': 'Timesheet hours changed', 'timesheet.reopen': 'Timesheet reopened', 'timesheet.rate': 'Timesheet rate set', 'timesheet.answer': 'Timesheet query answered',
  'shift.create': 'Shift added', 'shift.bulk_create': 'Shifts added', 'shift.copy_week': 'Week of shifts copied', 'shift.update': 'Shift changed', 'shift.publish': 'Shift published',
  'shift.cancel': 'Shift cancelled', 'shift.assign': 'Officer booked on a shift', 'shift.unassign': 'Officer taken off a shift', 'shift.reassign': 'Shift given to another officer',
  'shift.set_lead': 'Shift lead set', 'shift.swap_ask': 'Shift swap asked for',
  'shiftlog.sign': 'Shift log signed off', 'shiftlog.reopen': 'Shift log reopened', 'shiftlog.add': 'Shift log entry added', 'shiftlog.instruct': 'Instruction sent to the shift',
  'shiftlog.ack': 'Instruction read', 'shiftlog.curate': 'Shift log entry edited', 'shiftlog.customers': 'Customer count saved',
  'officer.create': 'Officer added', 'officer.update': 'Officer details changed', 'officer.self_update': 'Officer changed their own details', 'officer.status': 'Officer status changed',
  'officer.offboard': 'Officer offboarded', 'officer.rehire': 'Officer rehired', 'officer.rate': 'Officer pay rate set', 'officer.rate_delete': 'Officer pay rate removed',
  'officer.rtw_check': 'Right to work checked', 'officer.ban': 'Officer barred', 'officer.face_consent': 'Face check consent recorded',
  'applicant.invite': 'Applicant invited', 'applicant.reject': 'Applicant turned down', 'applicant.purge': 'Applicant data deleted', 'applicant.sia_checked': 'Applicant SIA licence checked',
  'doc.create': 'Document added', 'doc.update': 'Document changed', 'doc.delete': 'Document deleted', 'doc.verify': 'Document checked', 'doc.request': 'Document asked for',
  'contract.send': 'Contract sent', 'contract.sign': 'Contract signed', 'contract.amend': 'Contract amended', 'contract.void': 'Contract voided', 'link.sign': 'Contract signed by link',
  'agreement.send': 'Pay agreement sent', 'agreement.sign': 'Pay agreement signed', 'agreement.void': 'Pay agreement voided',
  'incident.create': 'Incident reported', 'incident.update': 'Incident report changed', 'incident.attach': 'File added to an incident', 'incident.attachment_remove': 'File removed from an incident',
  'incident.remind_venue': 'Venue reminded to sign an incident',
  'venue.update': 'Venue details changed', 'venue.rate': 'Venue charge rate set', 'venue.rate_delete': 'Venue charge rate removed', 'venue.logo': 'Venue logo changed',
  'cover.create': 'Cover requested', 'cover.accept': 'Cover request accepted', 'cover.decline': 'Cover request declined', 'cover.update': 'Cover request changed',
  'cover.change_requested': 'Change to cover asked for', 'cover.change_approved': 'Change to cover approved', 'cover.change_declined': 'Change to cover declined',
  'ban.update': 'Customer ban changed', 'ban.revoke': 'Customer ban lifted', 'feedback.dont_send': "Venue asked not to send an officer",
  'user.invite': 'Login invited', 'user.invite_sent': 'Login invite sent', 'user.update': 'Login changed', 'user.self_update': 'Person changed their own login',
  'user.reset_link': 'Password reset link sent', 'user.platform_role': 'Access level changed',
  'settings.update': 'Settings changed', 'academy.assign': 'Course assigned', 'academy.unassign': 'Course unassigned', 'training.remind': 'Training reminder sent',
  'compliance.grace_grant': 'Grace period given', 'compliance.grace_renew': 'Grace period extended', 'compliance.dismiss': 'Compliance alert dismissed',
  'clock.manual': 'Clock time entered by hand', 'device.register': 'Phone registered', 'device.revoke': 'Phone removed',
  'messages.safeguarding_view': 'Conversation opened for safeguarding', 'messages.delete': 'Message deleted', 'messages.report': 'Message reported',
  'review.create': 'Review published', 'review.update': 'Review changed', 'review.delete': 'Review removed',
};
export const actionLabel = (a = '') => ACTION_TEXT[a] || titleCase(a.replace(/[._]/g, ' '));


// A login change in words: the venues gained and lost, then each field as old → new
const FIELD = { name: 'name', goes_by: 'goes by', email: 'sign-in email', phone: 'phone', can_see_pay: 'can see pay', status: 'status', client_id: 'client' };
const val = (k, v) => (k === 'can_see_pay' ? (v ? 'yes' : 'no') : k === 'status' ? ({ active: 'active', invited: 'invited', disabled: 'deactivated' }[v] || v) : v || 'none');
const names = (a) => (a.length < 3 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
export function changeLine(r) {
  const d = r?.detail;
  if (!d || typeof d !== 'object') return '';
  const parts = [];
  if (d.venues_added?.length) parts.push(`added ${names(d.venues_added)}`);
  if (d.venues_removed?.length) parts.push(`removed ${names(d.venues_removed)}`);
  for (const [k, old] of Object.entries(d.before || {})) {
    if (!FIELD[k]) continue;
    parts.push(k === 'client_id' ? 'client changed' : `${FIELD[k]} ${val(k, old)} → ${val(k, d[k])}`);
  }
  const line = parts.join(' · ');
  return line && line[0].toUpperCase() + line.slice(1);
}
