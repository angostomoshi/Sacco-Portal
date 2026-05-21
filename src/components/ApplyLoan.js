// ApplyLoan.js
import React, { useState, useEffect } from 'react';

function ApplyLoan() {
  const [memberData, setMemberData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loanAmount, setLoanAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [monthlyDeduction, setMonthlyDeduction] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitMessageType, setSubmitMessageType] = useState('');

  const brandColor = '#00a3b5';
  const INTEREST_RATE = 4.5; // 4.5% per month
  const MAX_AMOUNT = 50000;
  const MAX_PERIOD = 6;

  // Fetch member data on component mount
  useEffect(() => {
    const cachedProfile = localStorage.getItem('memberProfile');
    if (cachedProfile) {
      setMemberData(JSON.parse(cachedProfile));
      setLoading(false);
    }

    const fetchMemberData = async () => {
      try {
        let memberNumber = localStorage.getItem('memberNumber');
        
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
        
        const response = await fetch(`https://memberportal.metro-sacco.com/api/v1/member/${memberNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setMemberData(data);
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
  }, []);

  // Calculate loan with 4.5% monthly interest
  const calculateLoan = () => {
    const amount = parseFloat(loanAmount) || 0;
    const months = parseFloat(period) || 0;
    
    if (amount && months && months > 0) {
      // Calculate interest: Amount × Interest Rate (%) × Period
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

  // Auto-calculate when amount or period changes
  useEffect(() => {
    calculateLoan();
  }, [loanAmount, period]);

  const validateLoan = () => {
    const amount = parseFloat(loanAmount);
    const months = parseFloat(period);
    
    if (!amount || amount <= 0) {
      setSubmitMessage('Please enter a valid loan amount');
      setSubmitMessageType('error');
      return false;
    }
    
    if (!months || months <= 0) {
      setSubmitMessage('Please select a valid loan period');
      setSubmitMessageType('error');
      return false;
    }
    
    if (amount > MAX_AMOUNT) {
      setSubmitMessage(`Maximum loan amount is KES ${MAX_AMOUNT.toLocaleString()}`);
      setSubmitMessageType('error');
      return false;
    }
    
    if (months > MAX_PERIOD) {
      setSubmitMessage(`Maximum repayment period is ${MAX_PERIOD} months`);
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
    
    const interestAmount = parseFloat(loanAmount) * (INTEREST_RATE / 100) * parseFloat(period);
    
    const loanApplication = {
      memberNo: memberData?.accNo || localStorage.getItem('memberNumber') || 'MS967',
      memberName: memberData?.holdersName || 'ANGOSTO MOSHI',
      loanType: 'INSTANT LOAN',
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
      console.log('Submitting loan application:', loanApplication);
      
      const existingApplications = JSON.parse(localStorage.getItem('loanApplications') || '[]');
      existingApplications.push({
        ...loanApplication,
        id: Date.now(),
        applicationId: `IL${Date.now()}`
      });
      localStorage.setItem('loanApplications', JSON.stringify(existingApplications));
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setSubmitMessage(`✓ Instant Loan application submitted successfully! Application ID: IL${Date.now()}`);
      setSubmitMessageType('success');
      
      setTimeout(() => {
        setLoanAmount('');
        setPeriod('');
        setTotalAmount('');
        setMonthlyDeduction('');
        setShowResults(false);
        setSubmitMessage('');
      }, 3000);
      
    } catch (err) {
      console.error('Error submitting loan application:', err);
      setSubmitMessage('❌ Failed to submit application. Please try again.');
      setSubmitMessageType('error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '0';
    return parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <>
      <div className="loan-calculator">
        {/* Member Info Card */}
        <div className="member-card">
          <div className="member-info-row">
            <div className="member-info-item">
              <label>Name</label>
              <div className="member-value">
                {memberData?.holdersName || 'ANGOSTO MOSHI'}
              </div>
            </div>
            <div className="member-info-item">
              <label>Member No</label>
              <div className="member-value">
                {memberData?.accNo || localStorage.getItem('memberNumber') || 'MS967'}
              </div>
            </div>
          </div>
        </div>

        {/* Loan Calculator Card */}
        <div className="calculator-card">
          <div className="calculator-row">
            <div className="calculator-field">
              <label>Category</label>
              <div className="category-display">
                <span className="category-badge">INSTANT LOAN</span>
                <span className="category-limits">(Max: KES 50,000 | Max: 6 months | Interest: 4.5%/month)</span>
              </div>
            </div>
            
            <div className="calculator-field">
              <label>Amount (KES)</label>
              <input 
                type="number"
                className="calculator-input"
                placeholder={`Enter amount (max ${MAX_AMOUNT.toLocaleString()})`}
                value={loanAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value <= MAX_AMOUNT || value === '') {
                    setLoanAmount(value);
                  }
                }}
                max={MAX_AMOUNT}
              />
              {loanAmount > MAX_AMOUNT && (
                <small style={{ color: '#e53e3e' }}>Maximum amount is KES {MAX_AMOUNT.toLocaleString()}</small>
              )}
            </div>
            
            <div className="calculator-field">
              <label>Period (Months)</label>
              <select 
                className="calculator-select"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
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
          </div>

          {/* Instant Loan Info */}
          <div className="loan-info">
            <div className="info-icon">ℹ️</div>
            <div className="info-text">
              <strong>Instant Loan Features:</strong> Maximum loan KES 50,000 | Maximum repayment period 6 months | Interest rate 4.5% per month | Application available online
            </div>
          </div>

          {/* Results Section */}
          {showResults && (
            <div className="results-section">
              <div className="results-row">
                <div className="result-item">
                  <label>Total Amount (Principal + Interest)</label>
                  <div className="result-value">
                    KES {formatCurrency(totalAmount)}
                  </div>
                </div>
                <div className="result-item">
                  <label>Monthly Deduction</label>
                  <div className="result-value">
                    KES {formatCurrency(monthlyDeduction)}
                  </div>
                </div>
              </div>
              <div className="calculation-details">
                <small>
                  Calculation: {formatCurrency(loanAmount)} + ({formatCurrency(loanAmount)} × {INTEREST_RATE}% × {period} month{period > 1 ? 's' : ''}) = KES {formatCurrency(totalAmount)}
                </small>
              </div>
            </div>
          )}

          {/* Submit Message */}
          {submitMessage && (
            <div className={`submit-message ${submitMessageType}`}>
              {submitMessage}
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit"
            className="submit-btn"
            onClick={handleSubmit}
            disabled={submitting || !showResults}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>

      <style>{`
        .loan-calculator {
          max-width: 1000px;
          margin: 0 auto;
        }

        .member-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .member-info-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 2rem;
        }

        .member-info-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .member-info-item label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #718096;
        }

        .member-value {
          font-size: 1.125rem;
          font-weight: 600;
          color: #1a202c;
          padding: 0.25rem 0;
          border-bottom: 2px solid #e2e8f0;
        }

        .calculator-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .calculator-row {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          gap: 1rem;
          align-items: end;
        }

        .calculator-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .calculator-field label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #718096;
        }

        .category-display {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .category-badge {
          display: inline-block;
          font-size: 0.875rem;
          font-weight: 700;
          color: ${brandColor};
          padding: 0.5rem 0;
          border-bottom: 2px solid ${brandColor};
        }

        .category-limits {
          font-size: 0.7rem;
          color: #718096;
        }

        .calculator-input,
        .calculator-select {
          padding: 0.625rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.875rem;
          font-family: inherit;
          transition: all 0.2s;
        }

        .calculator-input:focus,
        .calculator-select:focus {
          outline: none;
          border-color: ${brandColor};
          box-shadow: 0 0 0 3px rgba(0, 163, 181, 0.1);
        }

        .loan-info {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #ebf8ff;
          border-radius: 8px;
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
        }

        .info-icon {
          font-size: 1rem;
        }

        .info-text {
          font-size: 0.75rem;
          color: #2c5282;
          line-height: 1.4;
        }

        .results-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #e2e8f0;
          animation: fadeIn 0.3s ease-in;
        }

        .results-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 2rem;
        }

        .result-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .result-item label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #718096;
        }

        .result-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: ${brandColor};
          padding: 0.5rem 0;
          border-bottom: 2px solid #e2e8f0;
        }

        .calculation-details {
          margin-top: 1rem;
          text-align: center;
          color: #718096;
          font-size: 0.7rem;
        }

        .submit-btn {
          width: 100%;
          margin-top: 1.5rem;
          padding: 0.875rem;
          background: ${brandColor};
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .submit-btn:hover:not(:disabled) {
          background: #008a9a;
          transform: translateY(-1px);
        }

        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .submit-message {
          margin-top: 1rem;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.875rem;
          animation: slideIn 0.3s ease-out;
        }

        .submit-message.success {
          background-color: #c6f6d5;
          color: #22543d;
        }

        .submit-message.error {
          background-color: #fed7d7;
          color: #742a2a;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 768px) {
          .calculator-row {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .member-info-row {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .results-row {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .result-value {
            font-size: 1.25rem;
          }
          
          .calculator-card,
          .member-card {
            padding: 1rem;
          }
        }
      `}</style>
    </>
  );
}

export default ApplyLoan;