import { useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowUpRight, Bell, ChevronDown, CircleHelp,
  CreditCard, LayoutDashboard, LifeBuoy, LockKeyhole, Menu, Moon,
  Search, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Sparkles, Sun, Wallet, X, Check, Clock3, Plus, MoreHorizontal
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

type Page = 'Overview' | 'AI Shopping' | 'Approvals' | 'Activity' | 'Spending rules' | 'Integrations' | 'Settings';

const navigation: { label: Page; icon: typeof LayoutDashboard; section: string }[] = [
  { label: 'Overview', icon: LayoutDashboard, section: 'WORKSPACE' },
  { label: 'AI Shopping', icon: ShoppingBag, section: 'WORKSPACE' },
  { label: 'Approvals', icon: ShieldCheck, section: 'WORKSPACE' },
  { label: 'Activity', icon: Activity, section: 'MANAGE' },
  { label: 'Spending rules', icon: SlidersHorizontal, section: 'MANAGE' },
  { label: 'Integrations', icon: CreditCard, section: 'MANAGE' },
  { label: 'Settings', icon: Settings, section: 'PREFERENCES' },
];

const spendData = [
  { day: 'Mon', amount: 240 }, { day: 'Tue', amount: 390 },
  { day: 'Wed', amount: 310 }, { day: 'Thu', amount: 520 },
  { day: 'Fri', amount: 430 }, { day: 'Sat', amount: 680 },
  { day: 'Sun', amount: 560 },
];

const transactions = [
  { name: 'Notion', detail: 'Software · Today, 10:42 AM', amount: '₹800.00', status: 'Completed', initials: 'N', tone: 'violet' },
  { name: 'Amazon', detail: 'Shopping · Yesterday', amount: '₹2,499.00', status: 'Completed', initials: 'a', tone: 'amber' },
  { name: 'Figma', detail: 'Software · Nov 08, 2026', amount: '₹1,200.00', status: 'Pending', initials: 'F', tone: 'rose' },
];

function App() {
  const [page, setPage] = useState<Page>('Overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState('');
  const [showApproval, setShowApproval] = useState(false);
  const [approved, setApproved] = useState(false);
  const [search, setSearch] = useState('');

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  };

  const handleNav = (label: Page) => {
    setPage(label);
    setMobileOpen(false);
  };

  return (
    <div className={dark ? 'app-shell dark' : 'app-shell'}>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={mobileOpen ? 'sidebar sidebar-open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark"><span>p</span></div>
          <span className="brand-name">paypilot<span className="brand-ai">AI</span></span>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar">M</div>
          <div className="workspace-copy"><strong>My workspace</strong><span>Personal account</span></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>
        <nav className="side-nav">
          {(['WORKSPACE', 'MANAGE', 'PREFERENCES'] as const).map(section => (
            <div className="nav-group" key={section}>
              <p className="nav-heading">{section}</p>
              {navigation.filter(item => item.section === section).map(item => {
                const Icon = item.icon;
                return <button key={item.label} className={page === item.label ? 'nav-item active' : 'nav-item'} onClick={() => handleNav(item.label)}>
                  <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>
                  {item.label === 'Approvals' && <span className="nav-count">2</span>}
                </button>;
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><div className="security-icon"><LockKeyhole size={15} /></div><div><strong>Your money, your rules.</strong><span>Payments always need your OK.</span></div></div>
          <button className="nav-item help-link" onClick={() => showNotice('Help center is coming soon.')}><CircleHelp size={17} /><span>Help center</span><LifeBuoy size={15} className="help-trailing" /></button>
          <div className="profile-row"><div className="profile-avatar">MM</div><div className="profile-copy"><strong>Mounika Madupoju</strong><span>Free plan</span></div><MoreHorizontal size={18} className="muted-icon" /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div></div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search anything..." /></label>
            <button className="icon-button theme-toggle" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="icon-button notification-button" onClick={() => showNotice('You’re all caught up.')} aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="top-avatar">MM</div>
          </div>
        </header>

        <div className="page-content">
          {page === 'Overview' ? <>
            <div className="page-heading">
              <div><div className="eyebrow">{greeting.toUpperCase()}</div><h1>Your finances, in focus.</h1><p>Here’s what’s happening with your money today.</p></div>
              <button className="primary-button" onClick={() => setPage('AI Shopping')}><Sparkles size={16} /> Explore AI shopping</button>
            </div>

            <section className="metric-grid">
              <article className="metric-card"><div className="metric-top"><span>Total spending</span><span className="metric-icon blue"><Wallet size={17} /></span></div><div className="metric-value">₹24,680<span className="metric-period">.00</span></div><div className="metric-foot"><span className="trend positive"><ArrowDownLeft size={13} /> 8.2%</span><span>vs. last month</span></div></article>
              <article className="metric-card"><div className="metric-top"><span>Available budget</span><span className="metric-icon green"><ShieldCheck size={17} /></span></div><div className="metric-value">₹15,320<span className="metric-period">.00</span></div><div className="metric-foot"><span className="budget-label">61.7% used</span><span>of ₹40,000</span></div><div className="progress-track"><span style={{ width: '61.7%' }} /></div></article>
              <article className="metric-card"><div className="metric-top"><span>Pending approvals</span><span className="metric-icon orange"><Clock3 size={17} /></span></div><div className="metric-value">02</div><div className="metric-foot"><span className="pending-label">Needs your attention</span><button className="text-action" onClick={() => setPage('Approvals')}>Review <ArrowUpRight size={13} /></button></div></article>
              <article className="metric-card"><div className="metric-top"><span>Saved with AI</span><span className="metric-icon violet"><Sparkles size={17} /></span></div><div className="metric-value">₹3,450<span className="metric-period">.00</span></div><div className="metric-foot"><span className="trend positive"><ArrowUpRight size={13} /> 12.4%</span><span>this month</span></div></article>
            </section>

            <section className="content-grid">
              <article className="panel spending-panel">
                <div className="panel-heading"><div><h2>Spending overview</h2><p>Your spending activity this week</p></div><button className="select-button" onClick={() => showNotice('Showing this week’s demo data.')}>This week <ChevronDown size={14} /></button></div>
                <div className="chart-legend"><span className="legend-dot" /> Total spending <strong>₹3,130.00</strong></div>
                <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={spendData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}><defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3978ee" stopOpacity={0.18} /><stop offset="100%" stopColor="#3978ee" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => '₹' + v} /><Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} formatter={(value) => ['₹' + value, 'Spent']} /><Area type="monotone" dataKey="amount" stroke="#3978ee" strokeWidth={2.5} fill="url(#spendFill)" /></AreaChart></ResponsiveContainer></div>
              </article>

              <article className="panel permission-panel">
                <div className="panel-heading"><div><h2>Permission center</h2><p>Your AI boundaries at a glance</p></div><span className="live-pill"><i /> ACTIVE</span></div>
                <div className="permission-hero"><div className="permission-shield"><ShieldCheck size={22} /></div><div><strong>You're in control</strong><span>PayPilot follows your rules.</span></div></div>
                <div className="permission-row"><span>Daily spending limit</span><strong>₹5,000</strong></div>
                <div className="permission-row"><span>Auto-purchase</span><span className="status-off">Disabled</span></div>
                <div className="permission-row"><span>Human approval</span><span className="status-on"><Check size={13} /> Required</span></div>
                <button className="secondary-button full-button" onClick={() => setPage('Spending rules')}>Manage spending rules <ArrowUpRight size={14} /></button>
              </article>
            </section>

            <section className="panel transactions-panel">
              <div className="panel-heading"><div><h2>Recent activity</h2><p>A look at your latest transactions</p></div><button className="text-action view-all" onClick={() => setPage('Activity')}>View all activity <ArrowUpRight size={14} /></button></div>
              <div className="transaction-table"><div className="transaction-head"><span>MERCHANT</span><span>AMOUNT</span><span>STATUS</span><span /></div>
                {transactions.filter(t => (t.name + t.detail).toLowerCase().includes(search.toLowerCase())).map(t => <div className="transaction-row" key={t.name}><div className="merchant-cell"><div className={'merchant-logo ' + t.tone}>{t.initials}</div><div><strong>{t.name}</strong><span>{t.detail}</span></div></div><strong className="amount-cell">− {t.amount}</strong><span className={t.status === 'Pending' ? 'status-badge pending' : 'status-badge complete'}><i />{t.status}</span><button className="row-more" onClick={() => showNotice(t.name + ' transaction details are in demo mode.')} aria-label={'More about ' + t.name}><MoreHorizontal size={18} /></button></div>)}
                {transactions.filter(t => (t.name + t.detail).toLowerCase().includes(search.toLowerCase())).length === 0 && <div className="empty-search">No matching activity found.</div>}
              </div>
            </section>
            <div className="demo-footnote"><ShieldCheck size={14} /> Demo workspace · No real payments are being made.</div>
          </> : <section className="panel placeholder-panel"><div className="placeholder-icon"><Sparkles size={23} /></div><div className="eyebrow">PAYPILOT WORKSPACE</div><h1>{page}</h1><p>This section is part of the product roadmap. The interface and interactions are being built step by step.</p>{page === 'Approvals' && <div className="approval-preview"><div><div className="merchant-logo rose">F</div><span><strong>Figma Professional</strong><small>₹1,200 · Monthly subscription</small></span><span className="status-badge pending"><i /> Awaiting approval</span><button className="secondary-button" onClick={() => setShowApproval(true)}>Review request</button></div><div><div className="merchant-logo amber">a</div><span><strong>Amazon · Wireless keyboard</strong><small>₹2,499 · Shopping</small></span><span className="status-badge pending"><i /> Awaiting approval</span><button className="secondary-button" onClick={() => setShowApproval(true)}>Review request</button></div></div>}{page !== 'Approvals' && <button className="primary-button" onClick={() => setPage('Overview')}>Back to overview</button>}</section>}
        </div>
      </main>

      {showApproval && <div className="modal-backdrop" onClick={() => setShowApproval(false)}><div className="approval-modal" onClick={e => e.stopPropagation()}><button className="modal-close icon-button" onClick={() => setShowApproval(false)}><X size={18} /></button><div className="modal-icon"><ShieldCheck size={22} /></div><div className="eyebrow">PAYMENT APPROVAL</div><h2>Figma Professional</h2><p className="modal-subtitle">PayPilot is asking for your approval before proceeding.</p><div className="approval-amount">₹1,200.00</div><div className="modal-detail"><span>Merchant</span><strong>Figma, Inc.</strong></div><div className="modal-detail"><span>Payment method</span><strong>Demo wallet · •••• 4242</strong></div><div className="modal-detail"><span>Permission check</span><span className="status-on"><Check size={13} /> Within your rules</span></div><div className="modal-warning"><LockKeyhole size={15} /> This is a simulated approval. No payment will be sent.</div>{approved ? <div className="approved-message"><Check size={16} /> Demo request approved</div> : <div className="modal-actions"><button className="secondary-button" onClick={() => { setShowApproval(false); showNotice('Request declined in demo mode.'); }}>Decline</button><button className="primary-button" onClick={() => setApproved(true)}>Approve demo request</button></div>}</div></div>}
      {notice && <div className="toast"><Check size={16} />{notice}</div>}
    </div>
  );
}

export default App;
