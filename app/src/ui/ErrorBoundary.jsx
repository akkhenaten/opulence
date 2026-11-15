import { Component } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, TriangleAlert } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { APP_BUILD } from './AppFeedback.jsx';
import { previousEntry } from './nav.js';
import { Button, Empty, Page } from './index.jsx';

// Where Back goes when the report was opened fresh (a notification, a reload)
const FALLBACK = { officer: '/officer/shifts', company: '/company/incidents', security: '/security/incidents', venue: '/venue/incidents' };

class Guard extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, at: props.locKey };
  }

  static getDerivedStateFromError() { return { failed: true }; }

  // Moving to another page clears the fault
  static getDerivedStateFromProps(props, state) {
    return props.locKey !== state.at ? { failed: false, at: props.locKey } : null;
  }

  componentDidCatch(err) {
    const { page, type } = this.props;
    // Logged for the developer; never gets in the way of the screen below
    api('appFeedback.clientError', { page, type, message: String(err?.message || err), stack: String(err?.stack || '').slice(0, 1000), app_version: APP_BUILD }).catch(() => {});
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { onBack } = this.props;
    return (
      <Page title="Report">
        <Empty icon={TriangleAlert} title="Something went wrong with this report" body="Anything you'd written is saved as a draft."
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>Back</Button>
              <Button icon={RotateCcw} onClick={() => this.setState({ failed: false })}>Try again</Button>
            </div>
          )} />
      </Page>
    );
  }
}

/** Report pages show a way back instead of a blank screen when something fails while drawing. */
export function ReportGuard({ children }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();
  // The portal comes from the address: a manager who also works shifts reports from /officer
  const side = loc.pathname.split('/')[1];
  const onBack = () => (previousEntry() ? nav(-1) : nav(FALLBACK[side] || FALLBACK[user?.role] || '/'));
  const type = new URLSearchParams(loc.search).get('type') || '';
  return <Guard locKey={loc.key} page={loc.pathname + loc.search} type={type} onBack={onBack}>{children}</Guard>;
}
