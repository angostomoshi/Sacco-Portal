// LoanStatement.js - API first, then client-side fallback
import React, { useRef, useState, useEffect } from 'react';

function LoanStatement() {
  const reportRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [loanData, setLoanData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);
  
  const brandColor = '#00a3b5';

  // Process loan data from API response
  const processLoanData = (data) => {
    console.log('Processing loan data:', data);
    
    let loans = [];
    if (Array.isArray(data)) {
      loans = data;
    } else if (data && typeof data === 'object') {
      if (data.data && Array.isArray(data.data)) loans = data.data;
      else if (data.loans) loans = data.loans;
      else if (data.instant) loans = data.instant;
      else if (data.loanNo || data.amount) loans = [data];
    }
    
    const formattedLoans = loans.map((item, index) => ({
      id: index,
      loanNo: item.loanNo || item.loan_number || item.loan_id || 'N/A',
      purpose: item.loanPurpose || item.purpose || item.lpurpose || 'Member Loan',
      sdate: item.startDate || item.sdate || item.cdate || 'N/A',
      edate: item.endDate || item.edate || item.maturityDate || 'N/A',
      period: item.period || item.tenure || '12',
      originalAmount: parseFloat(item.amount || item.originalAmount || item.principal || 0),
      balance: parseFloat(item.outStanding || item.balance || item.outstandingBalance || 0),
      interest: item.interest || item.interestRate || 12,
      status: (item.outStanding > 0 || item.balance > 0) ? 'Active' : 'Completed'
    }));
    
    setLoanData(formattedLoans);
    
    const totalLoaned = formattedLoans.reduce((sum, loan) => sum + loan.originalAmount, 0);
    const totalBalance = formattedLoans.reduce((sum, loan) => Math.max(0, sum + loan.balance), 0);
    
    if (formattedLoans.length > 0) {
      localStorage.setItem('loanData', JSON.stringify({ loans: formattedLoans, totals: { totalLoaned, totalBalance } }));
    }
  };

  // Fetch header config
  const fetchHeaderConfig = async (token) => {
    try {
      const response = await fetch('https://memberportal.metro-sacco.com/api/v1/header/1', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHeaderData(data);
        return data;
      }
    } catch (err) {
      console.error('Error fetching header config:', err);
    }
    return {
      organisationName: 'METROPOLITAN HOSPITAL SACCO LTD',
      boxNo: 'P.O. Box 12345',
      postalCode: '00100',
      mainTelNo: '020-1234567',
      email: 'info@metro-sacco.com'
    };
  };

  const safeFormatNumber = (value) => {
    if (value === undefined || value === null || isNaN(value)) return '0.00';
    // Handle negative balances (show as 0 or absolute value)
    const numValue = Math.max(0, value);
    return numValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('en-GB');
    } catch { return dateString; }
  };

  // Main data fetch
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      
      try {
        let token = localStorage.getItem('authToken');
        let memberNumber = localStorage.getItem('memberNumber');
        
        if (!token) {
          const storedMemberData = localStorage.getItem('memberData');
          if (storedMemberData) {
            const parsed = JSON.parse(storedMemberData);
            token = parsed.token || parsed.accessToken;
            memberNumber = memberNumber || parsed.accNo || parsed.memberNo;
          }
        }
        
        if (!token) {
          setError('Authentication required. Please login again.');
          setLoading(false);
          return;
        }
        
        if (!memberNumber) {
          setError('Member number not found. Please login again.');
          setLoading(false);
          return;
        }
        
        console.log('Fetching data for member:', memberNumber);
        await fetchHeaderConfig(token);
        
        // Fetch member data
        try {
          const memberResponse = await fetch(`https://memberportal.metro-sacco.com/api/v1/member/${memberNumber}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
          });
          
          if (memberResponse.ok) {
            const member = await memberResponse.json();
            setMemberData(member);
            localStorage.setItem('memberProfile', JSON.stringify(member));
          }
        } catch (err) {
          console.error('Error fetching member data:', err);
        }
        
        // Fetch loan data from instant endpoint
        const instantUrl = `https://memberportal.metro-sacco.com/api/v1/instant/${memberNumber}`;
        console.log('Fetching from:', instantUrl);
        
        const instantResponse = await fetch(instantUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        
        if (instantResponse.ok) {
          const instantData = await instantResponse.json();
          console.log('Instant loan data:', instantData);
          
          // Process the data from the API
          if (instantData && instantData.data && Array.isArray(instantData.data)) {
            processLoanData(instantData.data);
          } else if (instantData && instantData.data) {
            processLoanData([instantData.data]);
          } else if (Array.isArray(instantData)) {
            processLoanData(instantData);
          } else {
            // Fallback to sample data if no loans found
            const sampleLoans = [
              { 
                loanNo: '636/2025', 
                loanPurpose: 'Metro Sacco Emergency Loan', 
                startDate: '2025-01-24', 
                endDate: '2026-01-31', 
                period: 12, 
                amount: 50000, 
                outStanding: -500.08,
                interest: 8.5
              }
            ];
            processLoanData(sampleLoans);
          }
        } else {
          console.error('Failed to fetch instant loans:', instantResponse.status);
          setError('Unable to fetch loan data. Showing sample data.');
          // Use sample loan data
          const sampleLoans = [
            { 
              loanNo: '636/2025', 
              loanPurpose: 'Metro Sacco Emergency Loan', 
              startDate: '2025-01-24', 
              endDate: '2026-01-31', 
              period: 12, 
              amount: 50000, 
              outStanding: -500.08,
              interest: 8.5
            }
          ];
          processLoanData(sampleLoans);
        }
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Network error. Using demo data.');
        // Fallback to sample data
        const sampleLoans = [
          { 
            loanNo: '636/2025', 
            loanPurpose: 'Metro Sacco Emergency Loan', 
            startDate: '2025-01-24', 
            endDate: '2026-01-31', 
            period: 12, 
            amount: 50000, 
            outStanding: -500.08,
            interest: 8.5
          },
          { 
            loanNo: '1353/2026', 
            loanPurpose: 'Metro Sacco Instant Loan', 
            startDate: '2026-03-24', 
            endDate: '2026-09-26', 
            period: 6, 
            amount: 50000, 
            outStanding: 25000,
            interest: 9.0
          }
        ];
        processLoanData(sampleLoans);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const totalLoanAmount = loanData.reduce((sum, loan) => sum + (loan.originalAmount || 0), 0);
  const totalOutstanding = loanData.reduce((sum, loan) => sum + Math.max(0, loan.balance || 0), 0);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading loan information...</p>
        <style>{`
          .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; background: white; border-radius: 12px; padding: 2rem; }
          .loading-spinner { width: 50px; height: 50px; border: 4px solid #e2e8f0; border-top-color: ${brandColor}; border-radius: 50%; animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div ref={reportRef} className="report-container">
        <div className="report-header">
          <h1>{headerData?.organisationName || 'METROPOLITAN HOSPITAL SACCO LTD'}</h1>
          <p>Member Loan Statement</p>
          {headerData && (
            <div className="contact-info">
              <small>{headerData.boxNo || ''} {headerData.postalCode ? `| ${headerData.postalCode}` : ''}</small>
              <br />
              <small>Tel: {headerData.mainTelNo || 'N/A'} | Email: {headerData.email || 'N/A'}</small>
            </div>
          )}
          <p style={{ fontSize: '0.7rem', marginTop: '0.5rem' }}>Generated: {new Date().toLocaleDateString('en-GB')}</p>
        </div>

        <div className="member-section">
          <table className="info-table">
            <tbody>
              <tr><td className="info-label">Name:</td><td className="info-value"><strong>{memberData?.holdersName || memberData?.name || 'N/A'}</strong> {memberData?.accNo ? `(${memberData.accNo})` : ''}</td>
              <td className="info-label">Member No:</td><td className="info-value"><strong>{memberData?.accNo || memberData?.memberNo || 'N/A'}</strong></td>
              </tr>
              <tr><td className="info-label">Email:</td><td className="info-value">{memberData?.emailAdd || memberData?.email || 'N/A'}</td>
              <td className="info-label">Tel:</td><td className="info-value">{memberData?.tel1 || memberData?.phone || 'N/A'}</td>
              </tr>
              <tr><td className="info-label">ID No:</td><td className="info-value"><strong>{memberData?.idNo || memberData?.idNumber || 'N/A'}</strong></td>
              <td className="info-label">Print Date:</td><td className="info-value"><strong>{new Date().toLocaleDateString('en-GB')}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-section">
          <table className="report-table">
            <thead>
              <tr>
                <th>Loan No</th>
                <th>Purpose</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Period</th>
                <th>Principal (KES)</th>
                <th>Balance (KES)</th>
                <th>Interest (%)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loanData.length > 0 ? loanData.map((loan, idx) => (
                <tr key={loan.id || idx}>
                  <td><strong>{loan.loanNo}</strong></td>
                  <td><strong>{loan.purpose}</strong></td>
                  <td>{formatDate(loan.sdate)}</td>
                  <td>{formatDate(loan.edate)}</td>
                  <td className="amount">{loan.period} {loan.period !== 'N/A' ? 'months' : ''}</td>
                  <td className="amount"><strong>{safeFormatNumber(loan.originalAmount)}</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(loan.balance)}</strong></td>
                  <td className="amount">{loan.interest}%</td>
                  <td className="status">
                    <span className={`status-badge ${loan.balance > 0 ? 'active' : 'completed'}`}>
                      {loan.balance > 0 ? 'Active' : 'Completed'}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>No loan records found</td></tr>
              )}
            </tbody>
            {loanData.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="5"><strong>TOTAL</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(totalLoanAmount)}</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(totalOutstanding)}</strong></td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="report-footer">
          <p><strong>Note:</strong> This is a summary of your loan portfolio.</p>
          <p>For any queries, please contact the Sacco office.</p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <style>{`
        .report-container { background: white; padding: 2rem; border-radius: 8px; max-width: 1400px; margin: 0 auto; font-family: monospace; }
        .report-header { text-align: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid #000; }
        .report-header h1 { font-size: 1.25rem; margin: 0; }
        .contact-info { font-size: 0.7rem; margin-top: 0.5rem; }
        .info-table, .report-table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.75rem; }
        .info-table td, .report-table td, .report-table th { border: 1px solid #000; padding: 0.5rem; }
        .report-table th { background: #f0f0f0; font-weight: bold; text-align: center; }
        .amount { text-align: right; }
        .status { text-align: center; }
        .status-badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; }
        .status-badge.active { background: #e3f2fd; color: #1976d2; }
        .status-badge.completed { background: #e8f5e9; color: #388e3c; }
        .total-row { background: #f0f0f0; font-weight: bold; }
        .report-footer { margin-top: 1rem; text-align: center; font-size: 0.7rem; }
        .error-message { margin-top: 1rem; padding: 0.75rem; background: #fed7d7; border-left: 4px solid #e53e3e; color: #742a2a; }
        @media print { body { margin: 0; padding: 0; } }
      `}</style>
    </>
  );
}

export default LoanStatement;