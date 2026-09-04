

// ApplyLoan.js
import React, { useState, useEffect } from 'react';
import Alert from './Alert';

function ApplyLoan() {
  const [memberData, setMemberData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loanAmount, setLoanAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [payMode, setPayMode] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [monthlyDeduction, setMonthlyDeduction] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitMessageType, setSubmitMessageType] = useState('');
  const [productType, setProductType] = useState('instant');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyDays, setEmergencyDays] = useState('7');
  const [emergencyReceipt, setEmergencyReceipt] = useState(null);

  const brandColor = '#00a3b5';
  const INTEREST_RATE = 4.5;
  const MIN_AMOUNT = 1000;
  const MAX_AMOUNT = 50000;
  const MAX_PERIOD = 6;
  const EMERGENCY_MAX_AMOUNT = 5000;
  const EMERGENCY_LIMIT_SAVINGS_RATE = 10;
  const EMERGENCY_MONTHLY_RATE = 10;
  const EMERGENCY_PERIOD_OPTIONS = [7, 14, 21];
  const PAY_MODES = [
    { value: 'N/A', label: 'N/A' },
    { value: 'checkoff', label: 'Check off' },
    { value: 'offline', label: 'Offline' },
    { value: 'hybrid', label: 'Hybrid' },
    { value: 'dividend', label: 'Dividend' },
  ];

  // Format pay mode for display - keep backend values stable while showing friendly labels.
  const formatPayMode = (mode) => {
    if (!mode) return '';
    if (mode === 'N/A') return 'N/A';
    if (String(mode).toLowerCase() === 'checkoff') return 'Check off';
    return mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
  };

  // Use relative URL - this will go through the proxy
  const API_BASE_URL = '/api/v1';

  const pollEmergencyAdvanceStatus = (conversationId, token) => {
    let attempts = 0;
    const maxAttempts = 30;

    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`${API_BASE_URL}/mpesa/b2c/status/${encodeURIComponent(conversationId)}`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          }
        });
        const result = await response.json();

        if (response.ok && result.status === 'success') {
          setEmergencyReceipt(result);
          setSubmitMessage('Emergency Advance disbursed successfully. Your receipt is ready.');
          setSubmitMessageType('success');
          return;
        }

        if (response.ok && ['failed', 'timeout'].includes(result.status)) {
          setSubmitMessage(result.message || 'M-Pesa could not complete the Emergency Advance disbursement. Please try again later.');
          setSubmitMessageType('error');
          return;
        }
      } catch (err) {
        console.error('Error checking emergency advance status:', err);
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 3000);
      }
    };

    setTimeout(poll, 3000);
  };

  useEffect(() => {
    const cachedProfile = localStorage.getItem('memberProfile');
    if (cachedProfile) {
      const parsedProfile = JSON.parse(cachedProfile);
      setMemberData(parsedProfile);
      setEmergencyPhone(parsedProfile?.tel1 || parsedProfile?.phone || '');
      setLoading(false);
    }

    const fetchMemberData = async () => {
      try {
        let memberNumber = localStorage.getItem('memberNumber');
        const token = localStorage.getItem('authToken');

        if (!memberNumber) {
          const storedMemberData = localStorage.getItem('memberData');
          if (storedMemberData) {
            const parsed = JSON.parse(storedMemberData);
            memberNumber = parsed.accNo || parsed.memberNo || parsed.memberNumber;
          }
        }

        if (!memberNumber) {
          console.error('Member number not found');
          return;
        }

        const response = await fetch(`${API_BASE_URL}/member/${memberNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          }
        });

        if (response.ok) {
          const data = await response.json();
          setMemberData(data);
          setEmergencyPhone(data?.tel1 || data?.phone || '');
          localStorage.setItem('memberProfile', JSON.stringify(data));
        } else {
          if (!cachedProfile) {
            const cachedProfileFallback = localStorage.getItem('memberProfile');
            if (cachedProfileFallback) {
              setMemberData(JSON.parse(cachedProfileFallback));
            }
          }
        }
      } catch (err) {
        console.error('Error fetching member data:', err);
        if (!cachedProfile) {
          const cachedProfileFallback = localStorage.getItem('memberProfile');
          if (cachedProfileFallback) {
            setMemberData(JSON.parse(cachedProfileFallback));
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMemberData();
  }, [API_BASE_URL]);

  const calculateLoan = () => {
    const amount = parseFloat(loanAmount) || 0;
    const months = parseFloat(period) || 0;

    if (productType === 'emergency') {
      if (amount > 0) {
        const days = parseFloat(emergencyDays) || 7;
        const roundedAmount = Math.round(amount);
        const charge = Math.round(roundedAmount * (days / 30) * (EMERGENCY_MONTHLY_RATE / 100));
        const total = roundedAmount + charge;
        setTotalAmount(total.toFixed(2));
        setMonthlyDeduction(charge.toFixed(2));
        setShowResults(true);
      } else {
        setShowResults(false);
        setTotalAmount('');
        setMonthlyDeduction('');
      }
      return;
    }

    if (amount && months && months > 0) {
      const interest = amount * (INTEREST_RATE / 100) * months;
      const total = amount + interest;
      const monthly = total / months;

      setTotalAmount(total.toFixed(2));
      setMonthlyDeduction(monthly.toFixed(2));
      setShowResults(true);
    } else {
      setShowResults(false);
      setTotalAmount('');
      setMonthlyDeduction('');
    }
  };

  useEffect(() => {
    calculateLoan();
  }, [loanAmount, period, productType, emergencyDays]);

  const validateLoan = () => {
    const amount = parseFloat(loanAmount);
    const months = parseFloat(period);

    if (!amount || amount <= 0) {
      setSubmitMessage('Please enter a loan amount.');
      setSubmitMessageType('error');
      return false;
    }

    if (productType === 'emergency') {
      const days = parseFloat(emergencyDays);
      if (amount > EMERGENCY_MAX_AMOUNT) {
        setSubmitMessage(`Emergency Advance is capped at KES ${EMERGENCY_MAX_AMOUNT.toLocaleString()}.`);
        setSubmitMessageType('error');
        return false;
      }

      if (!EMERGENCY_PERIOD_OPTIONS.includes(days)) {
        setSubmitMessage('Please select a repayment period of 7, 14, or 21 days.');
        setSubmitMessageType('error');
        return false;
      }

      const normalizedPhone = String(emergencyPhone || memberData?.tel1 || memberData?.phone || '').replace(/\D/g, '');
      if (!normalizedPhone) {
        setSubmitMessage('Please confirm the M-Pesa phone number for disbursement.');
        setSubmitMessageType('error');
        return false;
      }

      return true;
    }

    if (amount < MIN_AMOUNT) {
      setSubmitMessage(`The minimum instant loan amount is KES ${MIN_AMOUNT.toLocaleString()}.`);
      setSubmitMessageType('error');
      return false;
    }

    if (amount > MAX_AMOUNT) {
      setSubmitMessage(`Instant loans are capped at KES ${MAX_AMOUNT.toLocaleString()}. For higher loan amounts, please contact the Sacco office for guidance.`);
      setSubmitMessageType('error');
      return false;
    }

    if (!months || months <= 0) {
      setSubmitMessage('Please select a repayment period.');
      setSubmitMessageType('error');
      return false;
    }

    if (months > MAX_PERIOD) {
      setSubmitMessage(`The maximum repayment period is ${MAX_PERIOD} months.`);
      setSubmitMessageType('error');
      return false;
    }

    if (!payMode) {
      setSubmitMessage('Please select a pay mode.');
      setSubmitMessageType('error');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateLoan()) {
      setTimeout(() => {
        setSubmitMessage('');
      }, 5000);
      return;
    }

    setSubmitting(true);
    setSubmitMessage('');

    const token = localStorage.getItem('proxyAuthToken') || localStorage.getItem('authToken');
    const memberNumber = memberData?.accNo || localStorage.getItem('memberNumber') || 'MS967';
    const memberName = memberData?.holdersName || localStorage.getItem('userName') || 'ANGOSTO MOSHI';

    if (productType === 'emergency') {
      try {
        const response = await fetch(`${API_BASE_URL}/emergency-advance/apply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({
            memberNo: memberNumber,
            amount: parseFloat(loanAmount),
            periodDays: parseFloat(emergencyDays),
          })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || 'We could not submit the Emergency Advance right now.');
        }

        setSubmitMessage(`Emergency Advance accepted. Loan number: ${result.loanNumber || result.loanNo || 'Processing'}. M-Pesa disbursement confirmation is pending.`);
        setSubmitMessageType('success');
        const b2cReference = result.originatorConversationId || result.conversationId;
        if (b2cReference) {
          pollEmergencyAdvanceStatus(b2cReference, token);
        }
        setTimeout(() => {
          setLoanAmount('');
          setTotalAmount('');
          setMonthlyDeduction('');
          setShowResults(false);
          setSubmitMessage('');
        }, 4000);
      } catch (err) {
        console.error('Error submitting emergency advance:', err);
        setSubmitMessage(err.message || 'We could not submit the Emergency Advance right now. Please try again.');
        setSubmitMessageType('error');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const interestAmount = parseFloat(loanAmount) * (INTEREST_RATE / 100) * parseFloat(period);

    const loanApplication = {
      memberNo: memberNumber,
      memberName: memberName,
      loanType: 'METRO SACCO INSTANT LOAN',
      loanPurpose: 'METRO SACCO INSTANT LOAN',
      purpose: 'METRO SACCO INSTANT LOAN',
      lpurpose: 'METRO SACCO INSTANT LOAN',
      payMode: payMode,
      wstation: formatPayMode(payMode),
      loanAmount: parseFloat(loanAmount),
      periodMonths: parseFloat(period),
      interestRate: INTEREST_RATE,
      interestAmount: interestAmount,
      totalAmount: parseFloat(totalAmount),
      monthlyDeduction: parseFloat(monthlyDeduction),
      applicationDate: new Date().toISOString(),
      status: 'Pending'
    };

    try {
      const pendingResponse = await fetch(`${API_BASE_URL}/loan-applications/${memberNumber}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json();
        const pendingLoans = Array.isArray(pendingData?.data) ? pendingData.data : [];
        const existingPendingInstantLoan = pendingLoans.find((loan) => {
          const purpose = String(loan.loanPurpose || loan.purpose || '').toUpperCase();
          return purpose.includes('INSTANT LOAN');
        });

        if (existingPendingInstantLoan) {
          throw new Error(`You already have a pending instant loan application (${existingPendingInstantLoan.loanNo || 'awaiting approval'}). Please wait for approval before applying again.`);
        }
      }

      console.log('=== LOAN APPLICATION DEBUG ===');
      console.log('Submitting loan application to API:', loanApplication);
      console.log('API URL:', `${API_BASE_URL}/loan/apply`);
      console.log('Token exists:', !!token);

      // Send to proxy backend API (which forwards to live server)
      const response = await fetch(`${API_BASE_URL}/loan/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(loanApplication)
      });

      const result = await response.json();
      console.log('Response status:', response.status);
      console.log('Response data:', result);

      if (response.ok) {
        // Save to localStorage as backup
        const existingApplications = JSON.parse(localStorage.getItem('loanApplications') || '[]');
        existingApplications.push({
          ...loanApplication,
          id: Date.now(),
          applicationId: result.loanNumber || result.loanNo || `IL${Date.now()}`,
          loanNumber: result.loanNumber || result.loanNo,
          submittedAt: new Date().toISOString()
        });
        localStorage.setItem('loanApplications', JSON.stringify(existingApplications));

        setSubmitMessage(`Your instant loan application has been submitted. Loan number: ${result.loanNumber || 'Processing'}.`);
        setSubmitMessageType('success');

        setTimeout(() => {
          setLoanAmount('');
          setPeriod('');
          setPayMode('');
          setTotalAmount('');
          setMonthlyDeduction('');
          setShowResults(false);
          setSubmitMessage('');
        }, 3000);
      } else {
        throw new Error(result.message || result.error || 'We could not submit the application right now.');
      }

    } catch (err) {
      console.error('Error submitting loan application:', err);
      setSubmitMessage(err.message || 'We could not submit the application right now. Please try again.');
      setSubmitMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '0';
    return parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
        <style>{`
          .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; }
          .loading-spinner { width: 50px; height: 50px; border: 4px solid #e2e8f0; border-top-color: ${brandColor}; border-radius: 50%; animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div className="loan-calculator">
        <div className="member-card">
          <div className="member-info-row">
            <div className="member-info-item">
              <label>Name</label>
              <div className="member-value">
                {memberData?.holdersName || memberData?.name || 'ANGOSTO MOSHI'}
              </div>
            </div>
            <div className="member-info-item">
              <label>Member No</label>
              <div className="member-value">
                {memberData?.accNo || localStorage.getItem('memberNumber') || 'MS967'}
              </div>
            </div>
          </div>
          <div className="member-info-row" style={{ marginTop: '1rem' }}>
            <div className="member-info-item">
              <label>ID Number</label>
              <div className="member-value">
                {memberData?.idNo || memberData?.idNumber || 'N/A'}
              </div>
            </div>
            <div className="member-info-item">
              <label>Phone</label>
              <div className="member-value">
                {memberData?.tel1 || memberData?.phone || 'N/A'}
              </div>
            </div>
          </div>
        </div>

        <div className="product-tabs" aria-label="Loan product type">
          <button
            type="button"
            className={`product-tab ${productType === 'instant' ? 'active' : ''}`}
            onClick={() => {
              setProductType('instant');
              setSubmitMessage('');
            }}
          >
            Instant Loan
          </button>
          <button
            type="button"
            className={`product-tab ${productType === 'emergency' ? 'active' : ''}`}
            onClick={() => {
              setProductType('emergency');
              setPeriod('');
              setPayMode('offline');
              setSubmitMessage('');
            }}
          >
            Emergency Advance
          </button>
        </div>

        <div className="calculator-card">
          <form onSubmit={handleSubmit}>
            <div className={`calculator-row ${productType === 'emergency' ? 'emergency-row' : ''}`}>
              <div className="calculator-field">
                <label>Amount (KES)</label>
                <input
                  type="number"
                  className="calculator-input"
                  placeholder={productType === 'emergency' ? `Enter amount up to KES ${EMERGENCY_MAX_AMOUNT.toLocaleString()}` : `Enter amount (KES ${MIN_AMOUNT.toLocaleString()} - ${MAX_AMOUNT.toLocaleString()})`}
                  value={loanAmount}
                  onChange={(e) => {
                    // Allow free typing; validation runs on submit.
                    setLoanAmount(e.target.value);
                  }}
                  step="1"
                  min={productType === 'emergency' ? 1 : MIN_AMOUNT}
                  max={productType === 'emergency' ? EMERGENCY_MAX_AMOUNT : MAX_AMOUNT}
                  required
                />
              </div>

              {productType === 'instant' ? (
                <>
                  <div className="calculator-field">
                    <label>Period (Months)</label>
                    <select
                      className="calculator-select"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      required
                    >
                      <option value="">Select period</option>
                      <option value="1">1 month</option>
                      <option value="2">2 months</option>
                      <option value="3">3 months</option>
                      <option value="4">4 months</option>
                      <option value="5">5 months</option>
                      <option value="6">6 months</option>
                    </select>
                  </div>

                  <div className="calculator-field">
                    <label>Pay Mode</label>
                    <select
                      className="calculator-select"
                      value={payMode}
                      onChange={(e) => setPayMode(e.target.value)}
                      required
                    >
                      <option value="">Select pay mode</option>
                      {PAY_MODES.map((mode) => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="calculator-field">
                    <label>Period (Days)</label>
                    <select
                      className="calculator-select"
                      value={emergencyDays}
                      onChange={(e) => setEmergencyDays(e.target.value)}
                      required
                    >
                      {EMERGENCY_PERIOD_OPTIONS.map((days) => (
                        <option key={days} value={days}>{days} days</option>
                      ))}
                    </select>
                  </div>

                  <div className="calculator-field">
                    <label>Registered M-Pesa Number</label>
                    <div className="readonly-value">
                      {emergencyPhone || memberData?.tel1 || memberData?.phone || 'Not available'}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="loan-info">
              <div className="info-icon">i</div>
              <div className="info-text">
                {productType === 'emergency' ? (
                  <>
                    <strong>Emergency Advance Terms:</strong> Limit is 10% of savings, capped at KES {EMERGENCY_MAX_AMOUNT.toLocaleString()} | Select 7, 14, or 21 days | Charge is prorated at 10% per 30 days | Disbursed to the registered M-Pesa number after approval
                  </>
                ) : (
                  <>
                    <strong>Instant Loan Terms:</strong> Minimum KES 1,000 | Maximum KES 50,000 | Maximum repayment period 6 months | Interest rate 4.5% per month | For higher amounts, please contact the Sacco office
                  </>
                )}
              </div>
            </div>

            {showResults && (
              <div className="results-section">
                <div className="results-row">
                  <div className="result-item">
                    <label>{productType === 'emergency' ? 'Total Repayable' : 'Total Amount'}</label>
                    <div className="result-value">
                      KES {formatCurrency(totalAmount)}
                    </div>
                  </div>
                  <div className="result-item">
                    <label>{productType === 'emergency' ? 'Advance Charge' : 'Monthly Deduction'}</label>
                    <div className="result-value">
                      KES {formatCurrency(monthlyDeduction)}
                    </div>
                  </div>
                </div>
                <div className="calculation-details">
                  <small>
                    {productType === 'emergency'
                      ? `Calculation: ${formatCurrency(loanAmount)} + (${formatCurrency(loanAmount)} x ${emergencyDays}/30 x ${EMERGENCY_MONTHLY_RATE}%) = KES ${formatCurrency(totalAmount)}`
                      : `Calculation: ${formatCurrency(loanAmount)} + (${formatCurrency(loanAmount)} x ${INTEREST_RATE}% x ${period}) = KES ${formatCurrency(totalAmount)}`}
                  </small>
                </div>
              </div>
            )}

            {submitMessage && (
              <Alert
                type={submitMessageType === 'success' ? 'success' : 'error'}
                title={submitMessageType === 'success' ? 'Application received' : 'Please review your application'}
                className="submit-message"
              >
                {submitMessage}
              </Alert>
            )}

            <button
              type="submit"
              className="submit-btn"
              disabled={submitting || !showResults}
            >
              {submitting
                ? 'Submitting...'
                : productType === 'emergency'
                  ? 'Request Emergency Advance'
                  : 'Submit Application'}
            </button>
          </form>
        </div>
      </div>

      {emergencyReceipt && (
        <div className="receipt-backdrop" role="dialog" aria-modal="true" aria-label="Emergency Advance receipt">
          <div className="receipt-modal">
            <div className="receipt-header">
              <div>
                <span>Emergency Advance</span>
                <h3>Disbursement Successful</h3>
              </div>
              <button type="button" className="receipt-close" onClick={() => setEmergencyReceipt(null)} aria-label="Close receipt">
                x
              </button>
            </div>
            <div className="receipt-grid">
              <div><span>Loan No</span><strong>{emergencyReceipt.loanNo}</strong></div>
              <div><span>M-Pesa Receipt</span><strong>{emergencyReceipt.mpesaReceiptNo || 'Pending'}</strong></div>
              <div><span>Amount Sent</span><strong>KES {formatCurrency(emergencyReceipt.amount)}</strong></div>
              <div><span>Period</span><strong>{emergencyReceipt.periodDays} days</strong></div>
              <div><span>Advance Charge</span><strong>KES {formatCurrency(emergencyReceipt.charge)}</strong></div>
              <div><span>Total Repayable</span><strong>KES {formatCurrency(emergencyReceipt.totalRepayable)}</strong></div>
            </div>
            <div className="receipt-note">
              A PDF receipt has been sent to your registered email address.
            </div>
            <button type="button" className="receipt-done" onClick={() => setEmergencyReceipt(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        .loan-calculator { max-width: 1000px; margin: 0 auto; }
        .member-card { background: white; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .member-info-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; }
        .member-info-item { display: flex; flex-direction: column; gap: 0.5rem; }
        .member-info-item label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: #718096; }
        .member-value { font-size: 1.125rem; font-weight: 600; color: #1a202c; padding: 0.25rem 0; border-bottom: 2px solid #e2e8f0; }
        .product-tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; background: #ffffff; border-radius: 12px; padding: 0.35rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .product-tab { flex: 1; border: 0; border-radius: 8px; padding: 0.8rem 1rem; background: transparent; color: #4a5568; font-size: 0.875rem; font-weight: 700; cursor: pointer; }
        .product-tab.active { background: ${brandColor}; color: #ffffff; box-shadow: 0 8px 18px rgba(0,163,181,0.18); }
        .calculator-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .calculator-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 1rem; align-items: end; }
        .calculator-row.emergency-row { grid-template-columns: 1.2fr 0.8fr 1fr; }
        .calculator-field { display: flex; flex-direction: column; gap: 0.5rem; }
        .calculator-field label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: #718096; }

        .calculator-input, .calculator-select { width: 100%; min-width: 0; padding: 0.7rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; background: #ffffff; }
        .calculator-input:focus, .calculator-select:focus { outline: none; border-color: ${brandColor}; }
        .readonly-value { width: 100%; min-height: 42px; padding: 0.7rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; background: #f7fafc; color: #1a202c; font-weight: 700; }
        .loan-info { margin-top: 1rem; padding: 0.85rem 1rem; background: #ebf8ff; border: 1px solid #bee3f8; border-radius: 10px; display: flex; align-items: flex-start; gap: 0.75rem; }
        .info-icon { width: 22px; height: 22px; border-radius: 50%; background: ${brandColor}; color: #ffffff; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; font-size: 0.75rem; font-weight: 800; line-height: 1; }
        .info-text { font-size: 0.78rem; color: #2c5282; line-height: 1.55; }
        .results-section { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; }
        .results-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; }
        .result-value { font-size: 1.5rem; font-weight: 700; color: ${brandColor}; padding: 0.5rem 0; border-bottom: 2px solid #e2e8f0; }
        .submit-btn { width: 100%; margin-top: 1.5rem; padding: 0.875rem; background: ${brandColor}; color: white; border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
        .submit-btn:hover:not(:disabled) { background: #008a9a; }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .receipt-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.48); display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 1000; }
        .receipt-modal { width: min(520px, 100%); background: #ffffff; border-radius: 12px; box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28); overflow: hidden; }
        .receipt-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; padding: 1.25rem 1.5rem; background: ${brandColor}; color: #ffffff; }
        .receipt-header span { display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; opacity: 0.85; }
        .receipt-header h3 { margin: 0.15rem 0 0; font-size: 1.2rem; letter-spacing: 0; }
        .receipt-close { width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255,255,255,0.18); color: #ffffff; font-size: 1rem; line-height: 1; cursor: pointer; }
        .receipt-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; padding: 1rem 1.5rem; }
        .receipt-grid div { padding: 0.8rem 0; border-bottom: 1px solid #edf2f7; }
        .receipt-grid span { display: block; color: #718096; font-size: 0.72rem; text-transform: uppercase; font-weight: 700; margin-bottom: 0.25rem; }
        .receipt-grid strong { color: #1a202c; font-size: 0.98rem; word-break: break-word; }
        .receipt-note { margin: 0 1.5rem 1rem; padding: 0.85rem 1rem; background: #f0fff4; color: #276749; border: 1px solid #c6f6d5; border-radius: 8px; font-size: 0.85rem; }
        .receipt-done { width: calc(100% - 3rem); margin: 0 1.5rem 1.5rem; padding: 0.8rem 1rem; border: 0; border-radius: 8px; background: #1a202c; color: #ffffff; font-weight: 700; cursor: pointer; }
        @media (max-width: 768px) {
          .product-tabs { flex-direction: column; }
          .calculator-row { grid-template-columns: 1fr; }
          .calculator-row.emergency-row { grid-template-columns: 1fr; }
          .member-info-row { grid-template-columns: 1fr; }
          .results-row { grid-template-columns: 1fr; }
          .receipt-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}

export default ApplyLoan;

