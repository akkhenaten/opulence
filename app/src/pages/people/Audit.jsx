import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronDown, Download, History, Sparkles } from 'lucide-react';
import { downloadAction } from '../../api.js';
import { WhatsNew } from './_whatsnew.jsx';
import { Avatar, cx, dateTime, dayLabel, Empty, isoDate, List, Load, MoreMenu, Page, Pill, Pressable, relative, SearchInput, Section, Segmented, Select, time, titleCase, ToolField, ToolMenu, useApi, useUrlState } from '../../ui/index.jsx';

const ENTITIES = ['officer', 'document', 'contract', 'hr_note', 'officer_rate', 'shift', 'assignment', 'cover_request', 'timesheet',
  'incident', 'venue', 'venue_rate', 'invoice', 'invoice_line', 'statement', 'statement_line', 'user', 'settings'];
const LINK = { officer: 'staff', venue: 'venues', invoice: 'invoices', statement: 'pay', incident: 'incidents' };

const actionTone = (a = '') => (/delete|void|cancel|offboard|remove|dispute|credit/.test(a) ? 'red'
  : /create|invite|generate|publish|issue|sign|approve|verify|paid|rehire/.test(a) ? 'green' : 'blue');
// What happened, in words; codes with no wording yet fall back to the code in title case
const ACTION_TEXT = {
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
const actionLabel = (a = '') => ACTION_TEXT[a] || titleCase(a.replace(/[._]/g, ' '));

export default function Audit() {
  // Tab, search, record type and how many to load all live in the address
  const [url, setUrl] = useUrlState({ tab: 'activity', q: '', entity: '', limit: '200' });
  const tab = url.tab === 'new' ? 'new' : 'activity';
  const setTab = (t) => setUrl({ tab: t });
  const entity = ENTITIES.includes(url.entity) ? url.entity : '';
  const limit = url.limit === '500' ? 500 : 200;
  const search = url.q;
  const q = useApi('audit.list', { entity: entity || undefined, limit }, { skip: tab !== 'activity' });

  const days = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = (q.data || []).filter((r) => !s || [r.action, actionLabel(r.action), r.record_name, r.user_name, r.entity, r.entity_id, JSON.stringify(r.detail || '')].join(' ').toLowerCase().includes(s));
    const out = [];
    for (const r of rows) {
      const key = isoDate(r.created_at);
      if (out.at(-1)?.key !== key) out.push({ key, rows: [] });
      out.at(-1).rows.push(r);
    }
    return out;
  }, [q.data, search]);

  // Activity · What's new and the search sit on the tab line; record type and how many under Filters
  const tools = <>
    <Segmented value={tab} onChange={setTab} options={[{ value: 'activity', label: 'Activity', icon: History }, { value: 'new', label: 'What’s new', icon: Sparkles }]} iconOnly="phone" />
    {tab === 'activity' && <>
      <SearchInput className="min-w-0 flex-1 sm:w-56 sm:flex-none" aria-label="Search" placeholder="Search action, person or detail" value={search} onChange={(e) => setUrl({ q: e.target.value })} />
      <ToolMenu count={!!entity + (limit !== 200)} onClear={() => setUrl({ entity: '', limit: '200' })}>
        <ToolField label="Record type"><Select aria-label="Record type" value={entity} onChange={(e) => setUrl({ entity: e.target.value })} placeholder="All records" options={ENTITIES.map((e) => ({ value: e, label: titleCase(e.replace(/_/g, ' ')) }))} /></ToolField>
        <ToolField label="Show"><Segmented value={limit} onChange={(v) => setUrl({ limit: v })} options={[{ value: 200, label: 'Last 200' }, { value: 500, label: 'Last 500' }]} /></ToolField>
      </ToolMenu>
    </>}
  </>;

  return (
    <Page title="Audit log" subtitle={tab === 'new' ? 'Every upgrade to your platform' : 'Who changed what, and when'} tools={tools}
      actions={tab === 'activity' && <MoreMenu items={[{ icon: Download, label: 'Export to spreadsheet', hint: `The last ${limit}${entity ? ` ${entity.replace(/_/g, ' ')}` : ''} changes, as CSV`, onClick: () => downloadAction('audit.exportCsv', { entity: entity || undefined, limit }).catch(() => {}) }]} />}>
      {tab === 'new' ? <WhatsNew /> : <>
      <Load q={q}>
        {() => (days.length ? days.map((d) => (
          <Section key={d.key} title={dayLabel(d.key)} icon={CalendarDays} count={d.rows.length}>
            <List>{d.rows.map((r) => <Entry key={r.id} r={r} />)}</List>
          </Section>
        )) : <Empty icon={History} title="No activity" body={search ? 'Nothing matches your search.' : 'Changes will appear here.'} />)}
      </Load>
      </>}
    </Page>
  );
}

function Entry({ r }) {
  const [open, setOpen] = useState(false);
  const detail = r.detail && typeof r.detail === 'object' && Object.keys(r.detail).length ? r.detail : null;
  const to = LINK[r.entity] && r.entity_id ? `/company/${LINK[r.entity]}/${r.entity_id}` : null;
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <Avatar name={r.user_name || 'System'} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-body font-semibold">{r.user_name || 'System'}</span>
            <Pill tone={actionTone(r.action)}>{actionLabel(r.action)}</Pill>
          </div>
          <div className="mt-0.5 truncate text-footnote text-muted">
            {/* The record's name or number when it still exists, else its type and short id */}
            {r.record_name ? (to ? <Link to={to} className="font-medium text-blue">{r.record_name}</Link> : r.record_name) : <>
              {titleCase((r.entity || '').replace(/_/g, ' '))}
              {r.entity_id && (to ? <Link to={to} className="ml-1 font-medium text-blue">{short(r.entity_id)}</Link> : <span className="ml-1">{short(r.entity_id)}</span>)}
            </>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-caption text-muted" title={dateTime(r.created_at)}>{relative(r.created_at)}</div>
          <div className="num text-caption text-faint">{time(r.created_at)}</div>
        </div>
      </div>
      {detail && (
        <>
          <Pressable press onClick={() => setOpen((x) => !x)} className="relative ml-12 mt-1 inline-flex before:absolute before:-inset-x-2 before:-inset-y-3 items-center gap-1 text-caption font-semibold text-blue">
            {open ? 'Hide detail' : 'Show detail'}<ChevronDown size={14} className={cx('transition', open && 'rotate-180')} />
          </Pressable>
          {open && <DetailView detail={detail} />}
        </>
      )}
    </div>
  );
}

function DetailView({ detail }) {
  return (
    <dl className="ml-12 mt-2 grid gap-x-4 gap-y-1 rounded-xl bg-bg p-3 text-caption sm:grid-cols-[auto_1fr]">
      {Object.entries(detail).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-muted">{titleCase(k.replace(/_/g, ' '))}</dt>
          <dd className="min-w-0 break-words font-mono text-ink">{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

const short = (id) => (String(id).length > 12 ? `#${String(id).slice(0, 8)}` : `#${id}`);
