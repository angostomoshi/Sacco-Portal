import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCoins, FaFileInvoiceDollar, FaPiggyBank, FaUniversity } from 'react-icons/fa';
import Alert from './Alert';

const Dashboard = ({ userData }) => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(() => readStoredJson('dashboardMetrics', {
    savings: 0,
    shareCapital: 0,
    dividend: 0,
    loanBalance: 0,
    loading: true,
    notice: ''
  }));
  const [profile, setProfile] = useState(() => {
    const passedProfile = userData && Object.keys(userData).length ? userData : null;
    return passedProfile || readStoredJson('memberProfile', readStoredJson('memberData', {}));
  });

  const memberName = profile?.holdersName || profile?.name || localStorage.getItem('userName') || 'Member';
  const memberNo = profile?.accNo || profile?.memberNo || profile?.memberNumber || localStorage.getItem('memberNumber') || 'N/A';

  useEffect(() => {
    let mounted = true;

    const fetchDashboardData = async () => {
      const token = localStorage.getItem('authToken');
      const storedMemberData = readStoredJson('memberData', {});
      const currentMemberNo = memberNo !== 'N/A'
        ? memberNo
        : storedMemberData.accNo || storedMemberData.memberNo || localStorage.getItem('memberNumber');

      if (!currentMemberNo) {
        setMetrics((current) => ({
          ...current,
          loading: false,
          notice: 'We could not find your member number. Please log in again if the dashboard looks incomplete.'
        }));
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      };

      try {
        const [profileResponse, savingsResponse, shareCapitalResponse, dividendResponse, dividendTransactionsResponse, activeLoansResponse, pendingLoansResponse] = await Promise.allSettled([
          fetch(`/api/v1/member/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/savings/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/shareCapital/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/dividendPayable/sumTotal/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/dividend/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/instant/${currentMemberNo}`, { headers, credentials: 'include' }),
          fetch(`/api/v1/loan-applications/${currentMemberNo}`, { headers, credentials: 'include' })
        ]);

        const nextProfile = await responseJson(profileResponse);
        const savings = extractTotal(await responseJson(savingsResponse));
        const shareCapital = extractTotal(await responseJson(shareCapitalResponse));
        const payableDividend = extractTotal(await responseJson(dividendResponse));
        const transactionDividend = extractDividendTotal(await responseJson(dividendTransactionsResponse));
        const cachedDividend = extractCachedDividendTotal();
        const dividend = payableDividend || transactionDividend || cachedDividend;
        const loanBalance = extractLoanBalance([
          await responseJson(activeLoansResponse),
          await responseJson(pendingLoansResponse)
        ]);

        if (!mounted) return;

        if (nextProfile && Object.keys(nextProfile).length) {
          setProfile(nextProfile);
          localStorage.setItem('memberProfile', JSON.stringify(nextProfile));
        }

        const nextMetrics = {
          savings,
          shareCapital,
          dividend,
          loanBalance,
          loading: false,
          notice: ''
        };

        setMetrics(nextMetrics);
        localStorage.setItem('dashboardMetrics', JSON.stringify(nextMetrics));
      } catch (error) {
        console.error('Error loading dashboard metrics:', error);
        if (!mounted) return;
        setMetrics((current) => ({
          ...current,
          loading: false,
          notice: 'We could not refresh your dashboard right now. Showing the last saved figures where available.'
        }));
      }
    };

    fetchDashboardData();

    return () => {
      mounted = false;
    };
  }, [memberNo]);

  const summaryCards = useMemo(() => [
    {
      label: 'Savings Balance',
      value: formatCurrency(metrics.savings),
      hint: metrics.loading ? 'Refreshing deposits...' : 'Your member deposits',
      path: '/share-statement',
      accent: 'cyan',
      icon: FaPiggyBank
    },
    {
      label: 'Share Capital',
      value: formatCurrency(metrics.shareCapital),
      hint: metrics.loading ? 'Refreshing capital...' : 'Ownership contribution',
      path: '/share-capital',
      accent: 'green',
      icon: FaUniversity
    },
    {
      label: 'Dividend Payable',
      value: formatCurrency(metrics.dividend),
      hint: metrics.loading ? 'Refreshing dividends...' : 'Latest dividend estimate',
      path: '/dividends',
      accent: 'amber',
      icon: FaCoins
    },
    {
      label: 'Loan Balance',
      value: formatCurrency(metrics.loanBalance),
      hint: metrics.loading ? 'Refreshing loans...' : 'Active and pending loans',
      path: '/loan-statement',
      accent: 'violet',
      icon: FaFileInvoiceDollar
    }
  ], [metrics]);

  const quickActions = [
    { label: 'Apply for instant loan', description: 'Preview repayment, interest, and monthly deduction.', path: '/apply-loan' },
    { label: 'Download savings statement', description: 'Export a clean PDF for your records.', path: '/share-statement' },
    { label: 'Review guarantor position', description: 'See loans where you appear as guarantor.', path: '/guarantors' }
  ];

  const timelineItems = [
    { label: 'Profile check', text: 'Confirm your phone and email are current before payment periods.' },
    { label: 'Dividend rule', text: 'Dividends are calculated from last year’s eligible shares.' },
    { label: 'Support', text: 'For help, email sacco@metro-hospital.com with your member number.' }
  ];

  return (
    <div className="modern-dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Metropolitan Hospital Sacco</span>
          <h1>Financial overview</h1>
          <p>
            A clean command center for member balances, statements, loan actions,
            and the key updates members need most.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={() => navigate('/apply-loan')}>Apply for loan</button>
            <button type="button" className="secondary" onClick={() => navigate('/profile')}>View profile</button>
          </div>
        </div>
        <div className="hero-card">
          <span>Member status</span>
          <strong>Active</strong>
          <p>Balances, statements, loans, and member actions in one clear workspace.</p>
          <small>Member {memberNo}</small>
        </div>
      </section>

      {metrics.notice && (
        <Alert type="warning" title="Dashboard notice" actionLabel="Refresh" onAction={() => window.location.reload()}>
          {metrics.notice}
        </Alert>
      )}

      <div className="summary-grid">
        {summaryCards.map((card) => (
          <MetricCard
            key={card.label}
            card={card}
            loading={metrics.loading}
            onClick={() => navigate(card.path)}
          />
        ))}
      </div>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Quick actions</span>
              <h2>Move faster from the dashboard</h2>
            </div>
          </div>
          <div className="action-list">
            {quickActions.map((action) => (
              <button type="button" key={action.label} onClick={() => navigate(action.path)}>
                <div>
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                </div>
                <span className="action-arrow">→</span>
              </button>
            ))}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Member guidance</span>
              <h2>Good to know</h2>
            </div>
          </div>
          <div className="timeline-list">
            {timelineItems.map((item) => (
              <div className="timeline-item" key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
          <Alert type="info" title="Need help?">
            If something looks off, contact the Sacco office and include your member number so they can assist faster.
          </Alert>
        </section>
      </div>

      <footer className="dashboard-footer">
        © {new Date().getFullYear()} Metropolitan Hospital Sacco Ltd · Building Wealth, Changing Lives
      </footer>
    </div>
  );
};

const readStoredJson = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const MetricCard = ({ card, loading, onClick }) => {
  const Icon = card.icon;

  return (
    <button
      type="button"
      className={`summary-card summary-card-${card.accent} ${loading ? 'is-loading' : ''}`}
      onClick={onClick}
    >
      <div className="summary-card-top">
        <span>{card.label}</span>
        <div className="summary-card-icon"><Icon /></div>
      </div>
      {loading ? (
        <>
          <strong className="metric-skeleton"></strong>
          <small className="metric-skeleton short"></small>
        </>
      ) : (
        <>
          <strong>{card.value}</strong>
          <small>{card.hint}</small>
        </>
      )}
    </button>
  );
};

const responseJson = async (settledResponse) => {
  if (settledResponse.status !== 'fulfilled' || !settledResponse.value.ok) return null;
  return settledResponse.value.json();
};

const extractTotal = (data) => {
  if (typeof data === 'number') return data;
  if (!data || typeof data !== 'object') return 0;

  const candidates = [
    data.sumTotal,
    data.total,
    data.amount,
    data.balance,
    data.data?.sumTotal,
    data.data?.total,
    data.data?.amount,
    data.data?.balance
  ];

  const found = candidates.find((value) => value !== undefined && value !== null && value !== '');
  return Number(found || 0);
};

const extractDividendTotal = (data) => {
  if (!data) return 0;
  if (typeof data === 'number') return data;

  const directTotal = extractTotal(data);
  if (directTotal) return directTotal;

  const transactions = Array.isArray(data)
    ? data
    : data.dividends || data.transactions || data.data || data.records || [];

  if (!Array.isArray(transactions)) return 0;

  return transactions.reduce((sum, item) => {
    const amount = Number(item?.dividend || item?.dividendAmount || item?.amount || item?.credit || 0);
    return sum + amount;
  }, 0);
};

const extractCachedDividendTotal = () => {
  const cached = readStoredJson('dividendTransactions', null);
  if (!cached) return 0;

  if (cached.totals?.totalDividends) return Number(cached.totals.totalDividends);
  if (cached.totals?.netDividend) return Number(cached.totals.netDividend);

  return extractDividendTotal(cached.transactions || cached);
};

const extractLoanBalance = (responses) => {
  return responses.reduce((sum, response) => {
    if (!response) return sum;

    const loans = Array.isArray(response)
      ? response
      : Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.loans)
          ? response.loans
          : [];

    return sum + loans.reduce((loanSum, loan) => {
      const balance = loan?.outStanding ?? loan?.outstandingBalance ?? loan?.balance ?? loan?.total ?? loan?.amount ?? 0;
      return loanSum + Number(balance || 0);
    }, 0);
  }, 0);
};

const formatCurrency = (amount) => {
  const value = Number(amount || 0);
  return `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export default Dashboard;
