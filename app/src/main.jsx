import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';
import { AuthProvider, HOME, useAuth } from './auth.jsx';
import Shell from './layouts/Shell.jsx';
import { ConfirmProvider, Spinner, ToastProvider } from './ui/index.jsx';
import { AcceptInvite, Forgot, Login, Reset } from './pages/auth/AuthPages.jsx';

const P = (f) => lazy(f);
// Managers (company + security share most screens; components check role for extras)
const ManagerDashboard = P(() => import('./pages/manager/Dashboard.jsx'));
const Live = P(() => import('./pages/shared/Live.jsx'));
const Rota = P(() => import('./pages/manager/Rota.jsx'));
const CoverManage = P(() => import('./pages/manager/Cover.jsx'));
const Exceptions = P(() => import('./pages/manager/Exceptions.jsx'));
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
const VenueDetail = P(() => import('./pages/money/VenueDetail.jsx'));
const Pay = P(() => import('./pages/money/Pay.jsx'));
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
const IncidentForm = P(() => import('./pages/officer/IncidentForm.jsx'));

function Guard({ role }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner className="min-h-screen" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!role.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <Outlet />;
}
function Root() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner className="min-h-screen" />;
  return <Navigate to={user ? HOME[user.role] : '/login'} replace />;
}
function PublicOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner className="min-h-screen" />;
  return user ? <Navigate to={HOME[user.role]} replace /> : children;
}

// Screens shared by company and security managers, mounted under each prefix
const managerRoutes = (
  <>
    <Route path="live" element={<Live />} />
    <Route path="rota" element={<Rota />} />
    <Route path="cover" element={<CoverManage />} />
    <Route path="timesheets" element={<Timesheets />} />
    <Route path="exceptions" element={<Exceptions />} />
    <Route path="incidents" element={<Incidents />} />
    <Route path="incidents/:id" element={<IncidentDetail />} />
    <Route path="staff" element={<Staff />} />
    <Route path="staff/:id" element={<StaffProfile />} />
  </>
);

function App() {
  return (
    <Suspense fallback={<Spinner className="min-h-[60vh]" />}>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset/:token" element={<Reset />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />

        <Route element={<Guard role={['company']} />}>
          <Route path="/company" element={<Shell />}>
            <Route index element={<ManagerDashboard />} />
            {managerRoutes}
            <Route path="recruitment" element={<Recruitment />} />
            <Route path="hr/time-off" element={<TimeOff />} />
            <Route path="venues" element={<Venues />} />
            <Route path="venues/:id" element={<VenueDetail />} />
            <Route path="pay" element={<Pay />} />
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
            <Route path="pay" element={<Pay />} />
            <Route path="pay/:id" element={<StatementDetail />} />
          </Route>
        </Route>

        <Route element={<Guard role={['venue']} />}>
          <Route path="/venue" element={<Shell />}>
            <Route index element={<VenueDashboard />} />
            <Route path="live" element={<Live />} />
            <Route path="cover" element={<VenueCover />} />
            <Route path="timesheets" element={<Timesheets />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:id" element={<InvoiceDetail />} />
          </Route>
        </Route>

        <Route element={<Guard role={['officer']} />}>
          <Route path="/officer" element={<Shell />}>
            <Route index element={<OfficerHome />} />
            <Route path="shifts" element={<OfficerShifts />} />
            <Route path="clock" element={<OfficerClock />} />
            <Route path="pay" element={<OfficerPay />} />
            <Route path="pay/:id" element={<OfficerPay />} />
            <Route path="me" element={<OfficerMe />} />
            <Route path="documents" element={<OfficerDocuments />} />
            <Route path="time-off" element={<OfficerTimeOff />} />
            <Route path="profile" element={<OfficerProfile />} />
            <Route path="contracts/:id" element={<OfficerContract />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/new" element={<IncidentForm />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="incidents/:id/edit" element={<IncidentForm />} />
          </Route>
        </Route>
        <Route path="*" element={<Root />} />
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/app">
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

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => {});
