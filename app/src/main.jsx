import { lazy, StrictMode, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import './styles.css';
import { AuthProvider, HOME, otherSide, portalLink, useAuth } from './auth.jsx';
import Shell from './layouts/Shell.jsx';
import { ConfirmProvider, Spinner, ToastProvider } from './ui/index.jsx';
import { AcceptInvite, Forgot, Login, Reset, Verify } from './pages/auth/AuthPages.jsx';

const P = (f) => lazy(f);
// Managers (company + security share most screens; components check role for extras)
const ManagerDashboard = P(() => import('./pages/manager/Dashboard.jsx'));
const Live = P(() => import('./pages/shared/Live.jsx'));
const Rota = P(() => import('./pages/manager/Rota.jsx'));
const CoverManage = P(() => import('./pages/manager/Cover.jsx'));
const Exceptions = P(() => import('./pages/manager/Exceptions.jsx'));
const OpsAI = P(() => import('./pages/manager/OpsAI.jsx'));
const Messages = P(() => import('./pages/messages/Messages.jsx'));
const VenueSite = P(() => import('./pages/venue/Site.jsx'));
const Timesheets = P(() => import('./pages/shared/Timesheets.jsx'));
const Incidents = P(() => import('./pages/shared/Incidents.jsx'));
const IncidentDetail = P(() => import('./pages/shared/IncidentDetail.jsx'));
const Staff = P(() => import('./pages/people/Staff.jsx'));
const StaffProfile = P(() => import('./pages/people/StaffProfile.jsx'));
const Recruitment = P(() => import('./pages/people/Recruitment.jsx'));
const TimeOff = P(() => import('./pages/people/TimeOff.jsx'));
const Settings = P(() => import('./pages/people/Settings.jsx'));
const Audit = P(() => import('./pages/people/Audit.jsx'));
const Venues = P(() => import('./pages/money/Venues.jsx'));
const Clients = P(() => import('./pages/money/Venues.jsx').then((m) => ({ default: m.Clients })));
const StaffContracts = P(() => import('./pages/people/StaffContracts.jsx'));
const ContractWorkspace = P(() => import('./pages/people/contracts/Workspace.jsx'));
const EverydayRedirect = P(() => import('./pages/manager/Dashboard.jsx').then((m) => ({ default: m.EverydayRedirect })));
const VenueDetail = P(() => import('./pages/money/VenueDetail.jsx'));
const Pay = P(() => import('./pages/money/Pay.jsx'));
const PayRun = P(() => import('./pages/money/PayRuns.jsx'));
const StatementDetail = P(() => import('./pages/money/StatementDetail.jsx'));
const Invoices = P(() => import('./pages/money/Invoices.jsx'));
const InvoiceDetail = P(() => import('./pages/money/InvoiceDetail.jsx'));
const Reports = P(() => import('./pages/money/Reports.jsx'));
// Venue manager
const VenueDashboard = P(() => import('./pages/money/VenueDashboard.jsx'));
const VenueCover = P(() => import('./pages/manager/VenueCover.jsx'));
// Officer
const OfficerHome = P(() => import('./pages/officer/Home.jsx'));
const OfficerShifts = P(() => import('./pages/officer/Shifts.jsx'));
const OfficerClock = P(() => import('./pages/officer/Clock.jsx'));
const OfficerPay = P(() => import('./pages/officer/Pay.jsx'));
const OfficerMe = P(() => import('./pages/officer/Me.jsx'));
const OfficerDocuments = P(() => import('./pages/officer/Documents.jsx'));
const OfficerTimeOff = P(() => import('./pages/officer/TimeOff.jsx'));
const OfficerProfile = P(() => import('./pages/officer/Profile.jsx'));
const OfficerContract = P(() => import('./pages/officer/Contract.jsx'));
const OfficerAgreement = P(() => import('./pages/officer/Agreement.jsx'));
const OfficerGrowth = P(() => import('./pages/officer/Growth.jsx'));
const IncidentForm = P(() => import('./pages/officer/IncidentForm.jsx'));
// The shift page, shift logs and the ban register (everyone on a shift, managers and venues)
const ShiftView = P(() => import('./pages/shift/ShiftView.jsx'));
const ShiftLogs = P(() => import('./pages/shift/ShiftLogs.jsx'));
const Bans = P(() => import('./pages/shift/Bans.jsx'));
// Learn (officers; managers reuse Course and Certificate as previews)
const Learn = P(() => import('./pages/learn/Learn.jsx'));
const LearnToolbox = P(() => import('./pages/learn/Toolbox.jsx'));
const LearnCard = P(() => import('./pages/learn/Card.jsx'));
const Revise = P(() => import('./pages/learn/Revise.jsx'));
const Course = P(() => import('./pages/learn/Course.jsx'));
const Quiz = P(() => import('./pages/learn/Quiz.jsx'));
const Certificate = P(() => import('./pages/learn/Certificate.jsx'));
// Team (managers)
const Academy = P(() => import('./pages/team/Academy.jsx'));
const Compliance = P(() => import('./pages/people/Compliance.jsx'));
const CourseEditor = P(() => import('./pages/team/CourseEditor.jsx'));
const Everyday = P(() => import('./pages/everyday/Feed.jsx'));
const ToolboxAdmin = P(() => import('./pages/team/ToolboxAdmin.jsx'));
const CardEditor = P(() => import('./pages/team/CardEditor.jsx'));
const Help = P(() => import('./pages/shared/Help.jsx'));

function Guard({ role }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!role.includes(user.role)) {
    // A manager who also works shifts opening a page from their other side (a link, a bookmark): switch, don't bounce
    if (role.includes(otherSide(user))) return <SwitchTo side={otherSide(user) === 'officer' ? 'officer' : 'manager'} />;
    return <Navigate to={HOME[user.role]} replace />;
  }
  return <Outlet />;
}
function SwitchTo({ side }) {
  const { switchSide } = useAuth();
  useEffect(() => { switchSide(side).catch(() => {}); }, [side, switchSide]);
  return <Spinner className="min-h-dvh" />;
}
function Root() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner className="min-h-dvh" />;
  return <Navigate to={user ? HOME[user.role] : '/login'} replace />;
}
// Home-screen shortcuts (manifest) are the same for everyone: open the right page for the person's role
const SHORTCUTS = {
  clock: { officer: '/officer/clock', company: '/company/live', security: '/security/live', venue: '/venue/live' },
  rota: { officer: '/officer/shifts', company: '/company/rota', security: '/security/rota', venue: '/venue/logs' },
  incidents: { officer: '/officer/incidents', company: '/company/incidents', security: '/security/incidents', venue: '/venue/incidents' },
};
// Tapping a phone notification lands here: send the person to the link inside their own portal
function Open() {
  const { user, ready } = useAuth();
  const [sp] = useSearchParams();
  if (!ready) return <Spinner className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace />;
  const to = sp.get('to') || '';
  if (SHORTCUTS[to]) return <Navigate to={SHORTCUTS[to][user.role] || HOME[user.role]} replace />;
  // Someone on both sides: an officer link opens "My shifts", a manager link opens "Manager" (Guard switches)
  const path = to.replace(/^\/app/, '');
  const role = !user.dual ? user.role : /^\/officer(\/|$)/.test(path) ? 'officer' : /^\/(company|security)(\/|$)/.test(path) ? user.login_role || user.role : user.role;
  return <Navigate to={portalLink(path, role) || HOME[user.role]} replace />;
}
function PublicOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner className="min-h-dvh" />;
  return user ? <Navigate to={HOME[user.role]} replace /> : children;
}

// Screens shared by company and security managers, mounted under each prefix
const managerRoutes = (
  <>
    <Route path="ops" element={<OpsAI />} />
    <Route path="live" element={<Live />} />
    <Route path="rota" element={<Rota />} />
    <Route path="shifts/:id" element={<ShiftView />} />
    <Route path="cover" element={<CoverManage />} />
    <Route path="timesheets" element={<Timesheets />} />
    <Route path="exceptions" element={<Exceptions />} />
    <Route path="incidents" element={<Incidents />} />
    <Route path="incidents/:id" element={<IncidentDetail />} />
    <Route path="staff" element={<Staff />} />
    <Route path="staff/:id" element={<StaffProfile />} />
    <Route path="team/academy" element={<Academy />} />
    <Route path="team/training" element={<Academy />} />
    <Route path="people/compliance" element={<Compliance />} />
    <Route path="team/academy/:id" element={<CourseEditor />} />
    <Route path="team/academy/:id/preview" element={<Course />} />
    <Route path="team/toolbox" element={<ToolboxAdmin />} />
    <Route path="team/toolbox/:id" element={<CardEditor />} />
    <Route path="team/certificates/:id" element={<Certificate />} />
    <Route path="everyday" element={<EverydayRedirect />} />
    <Route path="messages" element={<Messages />} />
    <Route path="messages/:id" element={<Messages />} />
    <Route path="help" element={<Help />} />
  </>
);

function App() {
  return (
    <Suspense fallback={<Spinner className="min-h-[60dvh]" />}>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/open" element={<Open />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset/:token" element={<Reset />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/verify/:ref" element={<Verify />} />

        <Route element={<Guard role={['company']} />}>
          <Route path="/company" element={<Shell />}>
            <Route index element={<ManagerDashboard />} />
            {managerRoutes}
            <Route path="recruitment" element={<Recruitment />} />
            <Route path="hr/time-off" element={<TimeOff />} />
            <Route path="people/contracts" element={<StaffContracts />} />
            <Route path="people/contracts/draft/:id" element={<ContractWorkspace />} />
            <Route path="clients" element={<Clients />} />
            <Route path="venues" element={<Venues />} />
            <Route path="venues/:id" element={<VenueDetail />} />
            <Route path="pay" element={<Pay />} />
            <Route path="pay/runs/:id" element={<PayRun />} />
            <Route path="pay/:id" element={<StatementDetail />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:id" element={<InvoiceDetail />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="audit" element={<Audit />} />
          </Route>
        </Route>

        <Route element={<Guard role={['security']} />}>
          <Route path="/security" element={<Shell />}>
            <Route index element={<ManagerDashboard />} />
            {managerRoutes}
            <Route path="venues" element={<Venues />} />
            <Route path="venues/:id" element={<VenueDetail />} />
            <Route path="pay" element={<Pay />} />
            <Route path="pay/runs/:id" element={<PayRun />} />
            <Route path="pay/:id" element={<StatementDetail />} />
          </Route>
        </Route>

        <Route element={<Guard role={['venue']} />}>
          <Route path="/venue" element={<Shell />}>
            <Route index element={<VenueDashboard />} />
            <Route path="live" element={<Live />} />
            <Route path="cover" element={<VenueCover />} />
            <Route path="requests" element={<Navigate to="/venue/messages" replace />} />
            <Route path="messages" element={<Messages />} />
            <Route path="messages/:id" element={<Messages />} />
            <Route path="site" element={<VenueSite />} />
            <Route path="logs" element={<ShiftLogs />} />
            <Route path="logs/:id" element={<ShiftView />} />
            <Route path="bans" element={<Bans />} />
            <Route path="timesheets" element={<Timesheets />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:id" element={<InvoiceDetail />} />
            <Route path="help" element={<Help />} />
          </Route>
        </Route>

        <Route element={<Guard role={['officer']} />}>
          <Route path="/officer" element={<Shell />}>
            <Route index element={<OfficerHome />} />
            <Route path="shifts" element={<OfficerShifts />} />
            <Route path="shifts/:id" element={<ShiftView />} />
            <Route path="clock" element={<OfficerClock />} />
            <Route path="pay" element={<OfficerPay />} />
            <Route path="everyday" element={<Everyday />} />
            <Route path="messages" element={<Messages />} />
            <Route path="messages/:id" element={<Messages />} />
            <Route path="pay/:id" element={<OfficerPay />} />
            <Route path="me" element={<OfficerMe />} />
            <Route path="help" element={<Help />} />
            <Route path="documents" element={<OfficerDocuments />} />
            <Route path="time-off" element={<OfficerTimeOff />} />
            <Route path="profile" element={<OfficerProfile />} />
            <Route path="contracts/:id" element={<OfficerContract />} />
            <Route path="agreements/:id" element={<OfficerAgreement />} />
            <Route path="me/growth" element={<OfficerGrowth />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/new" element={<IncidentForm />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="incidents/:id/edit" element={<IncidentForm />} />
            <Route path="learn" element={<Learn />} />
            <Route path="learn/toolbox" element={<LearnToolbox />} />
            <Route path="learn/toolbox/:id" element={<LearnCard />} />
            <Route path="learn/revise" element={<Revise />} />
            <Route path="learn/academy/:id" element={<Course />} />
            <Route path="learn/academy/:id/quiz" element={<Quiz />} />
            <Route path="learn/certificates/:id" element={<Certificate />} />
          </Route>
        </Route>
        <Route path="*" element={<Root />} />
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/app" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // A new release takes over an open app (skipWaiting): offer a refresh, but not on the very first install
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) window.dispatchEvent(new Event('orb:update')); });
  navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).then((r) => r.update()).catch(() => {});
}
