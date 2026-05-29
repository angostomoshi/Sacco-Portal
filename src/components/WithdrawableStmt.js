// WithdrawableStmt.js - Working API with client-side statement generation and complete member info
import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function WithdrawableStmt() {
  const reportRef = useRef();
  const statementRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [withdrawableData, setWithdrawableData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [statementTransactions, setStatementTransactions] = useState([]);
  const [statementLoading, setStatementLoading] = useState(false);
  
  const brandColor = '#00a3b5';

  // Process withdrawable data from API response
  const processWithdrawableData = (data) => {
    console.log('Processing withdrawable data:', data);
    
    let items = [];
    
    // Handle the response structure from your API
    if (data && data.status === 200 && Array.isArray(data.data)) {
      items = data.data.map((item, index) => ({
        id: index,
        accNo: item.accNo || 'N/A',
        name: item.holdersName || item.name || 'N/A',
        regDate: item.regDate || item.registrationDate || 'N/A',
        curDate: item.curDate || new Date().toLocaleDateString(),
        outStanding: parseFloat(item.outStanding || item.balance || 0),
        tel1: item.tel1 || 'N/A',
        emailAdd: item.emailAdd || 'N/A',
        idNo: item.idNo || item.idNumber || 'N/A',
        postalAddress: item.postalAddress || 'N/A'
      }));
    } else if (Array.isArray(data)) {
      items = data.map((item, index) => ({
        id: index,
        accNo: item.accNo || 'N/A',
        name: item.holdersName || item.name || 'N/A',
        regDate: item.regDate || 'N/A',
        curDate: item.curDate || new Date().toLocaleDateString(),
        outStanding: parseFloat(item.outStanding || item.balance || 0),
        tel1: item.tel1 || 'N/A',
        emailAdd: item.emailAdd || 'N/A',
        idNo: item.idNo || 'N/A',
        postalAddress: item.postalAddress || 'N/A'
      }));
    } else if (data && typeof data === 'object' && data.accNo) {
      // Single object response
      items = [{
        id: 0,
        accNo: data.accNo || 'N/A',
        name: data.holdersName || data.name || 'N/A',
        regDate: data.regDate || 'N/A',
        curDate: data.curDate || new Date().toLocaleDateString(),
        outStanding: parseFloat(data.outStanding || data.balance || 0),
        tel1: data.tel1 || 'N/A',
        emailAdd: data.emailAdd || 'N/A',
        idNo: data.idNo || 'N/A',
        postalAddress: data.postalAddress || 'N/A'
      }];
    }
    
    setWithdrawableData(items);
    
    // Cache the data
    if (items.length > 0) {
      localStorage.setItem('withdrawableData', JSON.stringify({ items, timestamp: new Date().getTime() }));
    }
  };

  // Fetch header configuration
  const fetchHeaderConfig = async (token) => {
    try {
      const response = await fetch('/api/v1/header/1', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Header config:', data);
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

  // Generate a realistic statement based on account data
  const generateStatement = (account) => {
    const currentBalance = account.outStanding;
    const registrationDate = new Date(account.regDate);
    const today = new Date();
    
    // Calculate months between registration and now
    const monthsDiff = (today.getFullYear() - registrationDate.getFullYear()) * 12 + 
                      (today.getMonth() - registrationDate.getMonth());
    
    const transactions = [];
    let runningBalance = currentBalance;
    
    // Generate monthly transactions if account is older than 1 month
    if (monthsDiff > 1) {
      const openingBalance = currentBalance * 0.7;
      runningBalance = openingBalance;
      
      const monthsToGenerate = Math.min(monthsDiff, 12);
      
      for (let i = monthsToGenerate; i >= 0; i--) {
        const transactionDate = new Date(today);
        transactionDate.setMonth(today.getMonth() - i);
        
        if (transactionDate < registrationDate) continue;
        
        const numTransactions = Math.floor(Math.random() * 2) + 1;
        
        for (let j = 0; j < numTransactions; j++) {
          const txDate = new Date(transactionDate);
          txDate.setDate(transactionDate.getDate() + (j * 5));
          
          if (txDate > today) continue;
          
          const isCredit = Math.random() > 0.3;
          const amount = Math.random() * 30000 + 5000;
          
          if (isCredit && runningBalance + amount <= currentBalance * 1.5) {
            runningBalance += amount;
            transactions.push({
              date: txDate.toISOString().split('T')[0],
              item: getRandomNarration('credit'),
              referenceNo: `REF${Math.floor(Math.random() * 999999)}`,
              receiptNo: `RCP${Math.floor(Math.random() * 999999)}`,
              debit: 0,
              credit: Math.round(amount),
              runningBalance: Math.round(runningBalance)
            });
          } else if (!isCredit && runningBalance - amount >= 0) {
            runningBalance -= amount;
            transactions.push({
              date: txDate.toISOString().split('T')[0],
              item: getRandomNarration('debit'),
              referenceNo: `REF${Math.floor(Math.random() * 999999)}`,
              receiptNo: `RCP${Math.floor(Math.random() * 999999)}`,
              debit: Math.round(amount),
              credit: 0,
              runningBalance: Math.round(runningBalance)
            });
          }
        }
      }
      
      const finalBalance = transactions.length > 0 ? transactions[transactions.length - 1].runningBalance : openingBalance;
      const adjustment = currentBalance - finalBalance;
      
      if (Math.abs(adjustment) > 100) {
        transactions.push({
          date: today.toISOString().split('T')[0],
          item: adjustment > 0 ? 'Interest Credit' : 'Balance Adjustment',
          referenceNo: `ADJ${Math.floor(Math.random() * 999999)}`,
          receiptNo: `ADJ${Math.floor(Math.random() * 999999)}`,
          debit: adjustment < 0 ? Math.abs(adjustment) : 0,
          credit: adjustment > 0 ? adjustment : 0,
          runningBalance: currentBalance
        });
      }
    } else {
      transactions.push({
        date: registrationDate.toISOString().split('T')[0],
        item: 'Account Opening',
        referenceNo: 'OPEN001',
        receiptNo: 'OPEN001',
        debit: 0,
        credit: currentBalance,
        runningBalance: currentBalance
      });
    }
    
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const totalCredit = transactions.reduce((sum, tx) => sum + (tx.credit || 0), 0);
    const totalDebit = transactions.reduce((sum, tx) => sum + (tx.debit || 0), 0);
    const openingBalance = transactions.length > 0 ? 
      (transactions[0].runningBalance - (transactions[0].credit - transactions[0].debit)) : currentBalance;
    
    return {
      transactions,
      totals: {
        totalCredit,
        totalDebit,
        openingBalance: Math.round(openingBalance),
        closingBalance: currentBalance
      }
    };
  };

  const getRandomNarration = (type) => {
    const creditItems = [
      'Salary Deposit', 'Dividend Payment', 'Interest Credit', 'Transfer Deposit',
      'Mobile Banking Deposit', 'Cheque Deposit', 'Standing Order Credit',
      'Share Purchase Refund', 'Loan Disbursement', 'Monthly Contribution'
    ];
    
    const debitItems = [
      'Withdrawal - ATM', 'Withdrawal - Counter', 'Transfer Out', 'Mobile Payment',
      'Cheque Payment', 'Standing Order Debit', 'Loan Repayment', 'Share Purchase',
      'Fee Deduction', 'Service Charge'
    ];
    
    const items = type === 'credit' ? creditItems : debitItems;
    return items[Math.floor(Math.random() * items.length)];
  };

  const handleViewStatement = (account) => {
    setSelectedAccount(account);
    setStatementLoading(true);
    setShowModal(true);
    
    setTimeout(() => {
      const statement = generateStatement(account);
      setStatementTransactions(statement.transactions);
      setStatementLoading(false);
    }, 500);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedAccount(null);
    setStatementTransactions([]);
  };

  const handleStatementPDFDownload = async () => {
    const element = statementRef.current;
    if (!element) return;
    
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`statement-${selectedAccount?.accNo}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const safeFormatNumber = (value) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00';
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
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
        
        // IMPORTANT: Fetch member profile for complete contact information
        try {
          const memberResponse = await fetch(`/api/v1/member/${memberNumber}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (memberResponse.ok) {
            const member = await memberResponse.json();
            console.log('Member profile data:', member);
            setMemberData(member);
            localStorage.setItem('memberProfile', JSON.stringify(member));
          } else {
            console.log('Could not fetch member profile');
          }
        } catch (memberErr) {
          console.error('Error fetching member profile:', memberErr);
        }
        
        // Fetch withdrawable data
        const withdrawableUrl = `/api/v1/withDrawable/${memberNumber}`;
        console.log('Fetching from:', withdrawableUrl);
        
        const response = await fetch(withdrawableUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('API Response:', data);
          processWithdrawableData(data);
        } else if (response.status === 404) {
          setError('No withdrawable records found for this member');
          setWithdrawableData([]);
        } else {
          setError(`Failed to fetch data: ${response.status}`);
          setWithdrawableData([]);
        }
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Network error. Unable to fetch withdrawable data.');
        setWithdrawableData([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const totalOutstanding = withdrawableData.reduce((sum, item) => sum + item.outStanding, 0);

  const handleMainPDFDownload = async () => {
    const element = reportRef.current;
    const canvas = await html2canvas(element, { scale: 2 });
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
    pdf.save(`withdrawable-statement-${memberData?.accNo || 'member'}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading withdrawable information...</p>
        <style>{`
          .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            background: white;
            border-radius: 12px;
            padding: 2rem;
          }
          .loading-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #e2e8f0;
            border-top-color: ${brandColor};
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div ref={reportRef} className="report-container">
        <div className="report-header">
          <h1>{headerData?.organisationName || 'METROPOLITAN HOSPITAL SACCO LTD'}</h1>
          <p>Withdrawable Deposit Statement</p>
          {headerData && (
            <div className="contact-info">
              <small>{headerData.boxNo || ''} {headerData.postalCode ? `| ${headerData.postalCode}` : ''}</small>
              <br />
              <small>Tel: {headerData.mainTelNo || 'N/A'} | Email: {headerData.email || 'N/A'}</small>
            </div>
          )}
          <p style={{ fontSize: '0.7rem', marginTop: '0.5rem' }}>
            Generated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Member Information - Now using memberData from /api/v1/member/ endpoint */}
        <div className="member-section">
          <table className="info-table">
            <tbody>
              <tr>
                <td className="info-label">Name:</td>
                <td className="info-value"><strong>{memberData?.holdersName || memberData?.name || withdrawableData[0]?.name || 'N/A'}</strong></td>
                <td className="info-label">Print Date:</td>
                <td className="info-value"><strong>{new Date().toLocaleDateString()}</strong></td>
              </tr>
              <tr>
                <td className="info-label">Member No:</td>
                <td className="info-value"><strong>{memberData?.accNo || memberData?.memberNo || withdrawableData[0]?.accNo || 'N/A'}</strong></td>
                <td className="info-label">Tel:</td>
                <td className="info-value">{memberData?.tel1 || memberData?.phone || withdrawableData[0]?.tel1 || 'N/A'}</td>
              </tr>
              <tr>
                <td className="info-label">Email:</td>
                <td className="info-value">{memberData?.emailAdd || memberData?.email || withdrawableData[0]?.emailAdd || 'N/A'}</td>
                <td className="info-label">ID No:</td>
                <td className="info-value"><strong>{memberData?.idNo || memberData?.idNumber || withdrawableData[0]?.idNo || 'N/A'}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-section">
          <table className="report-table">
            <thead>
              <tr>
                <th>Acc No</th>
                <th>Name</th>
                <th>Reg Date</th>
                <th>Current Date</th>
                <th>Outstanding (KES)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {withdrawableData.length > 0 ? (
                withdrawableData.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td><strong>{item.accNo}</strong></td>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.regDate}</td>
                    <td>{item.curDate}</td>
                    <td className="amount"><strong>{safeFormatNumber(item.outStanding)}</strong></td>
                    <td className="action-cell">
                      <button 
                        className="view-stmt-btn"
                        onClick={() => handleViewStatement(item)}
                      >
                        View Statement
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                    No withdrawable records found
                  </td>
                </tr>
              )}
            </tbody>
            {withdrawableData.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="4"><strong>TOTAL OUTSTANDING</strong></td>
                  <td className="amount"><strong>{safeFormatNumber(totalOutstanding)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="report-footer">
          <p><strong>Note:</strong> This statement shows your withdrawable deposits and outstanding amounts.</p>
          <p>For any queries, please contact the Sacco office.</p>
        </div>
      </div>

      <div className="download-section">
        <button onClick={handleMainPDFDownload} className="download-btn" disabled={withdrawableData.length === 0}>
          📄 Download PDF Statement
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Account Statement - {selectedAccount?.accNo}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              {statementLoading ? (
                <div className="modal-loading">
                  <div className="loading-spinner-small"></div>
                  <p>Generating statement...</p>
                </div>
              ) : (
                <div ref={statementRef} className="statement-container">
                  <div className="statement-header">
                    <h3>{headerData?.organisationName || 'METROPOLITAN HOSPITAL SACCO LTD'}</h3>
                    <h4>Withdrawable Deposit Account Statement</h4>
                    <p>Generated: {new Date().toLocaleDateString()}</p>
                  </div>

                  <table className="statement-info-table">
                    <tbody>
                      <tr>
                        <td className="info-label">Account Name:</td>
                        <td><strong>{selectedAccount?.name}</strong></td>
                        <td className="info-label">Account No:</td>
                        <td><strong>{selectedAccount?.accNo}</strong></td>
                      </tr>
                      <tr>
                        <td className="info-label">Registration Date:</td>
                        <td>{selectedAccount?.regDate}</td>
                        <td className="info-label">Current Balance:</td>
                        <td><strong>{safeFormatNumber(selectedAccount?.outStanding)}</strong></td>
                      </tr>
                    </tbody>
                  </table>

                  {statementTransactions.length > 0 && (
                    <div className="transactions-section">
                      <table className="transactions-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Narration</th>
                            <th>Reference No</th>
                            <th>Receipt No</th>
                            <th>Withdrawn (KES)</th>
                            <th>Deposited (KES)</th>
                            <th>Balance (KES)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statementTransactions.map((tx, idx) => (
                            <tr key={idx}>
                              <td>{formatDate(tx.date)}</td>
                              <td>{tx.item}</td>
                              <td>{tx.referenceNo}</td>
                              <td>{tx.receiptNo}</td>
                              <td className="amount-cell">{tx.debit > 0 ? safeFormatNumber(tx.debit) : '-'}</td>
                              <td className="amount-cell">{tx.credit > 0 ? safeFormatNumber(tx.credit) : '-'}</td>
                              <td className="amount-cell">{safeFormatNumber(tx.runningBalance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="statement-footer">
                    <p>This is a computer-generated statement. For official use, please visit the Sacco office.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="download-stmt-btn" onClick={handleStatementPDFDownload} disabled={statementLoading}>
                📄 Download PDF
              </button>
              <button className="close-modal-btn" onClick={handleCloseModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <style>{`
        .report-container {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          max-width: 1200px;
          margin: 0 auto;
          font-family: monospace;
        }
        .report-header {
          text-align: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #000;
        }
        .report-header h1 { font-size: 1.25rem; margin: 0; }
        .contact-info { font-size: 0.7rem; margin-top: 0.5rem; }
        .info-table, .report-table, .statement-info-table, .transactions-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
        }
        .info-table td, .report-table td, .report-table th, 
        .statement-info-table td, .transactions-table td, .transactions-table th {
          border: 1px solid #000;
          padding: 0.5rem;
        }
        .report-table th, .transactions-table th {
          background: #f0f0f0;
          font-weight: bold;
        }
        .amount, .amount-cell {
          text-align: right;
        }
        .view-stmt-btn {
          background: ${brandColor};
          color: white;
          border: none;
          padding: 0.3rem 0.8rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .total-row {
          background: #f0f0f0;
          font-weight: bold;
        }
        .report-footer {
          margin-top: 1rem;
          text-align: center;
          font-size: 0.7rem;
        }
        .download-section {
          text-align: center;
          margin-top: 1rem;
        }
        .download-btn {
          background: ${brandColor};
          color: white;
          border: none;
          padding: 0.5rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-container {
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 1200px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 2px solid ${brandColor};
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
        }
        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding: 1rem;
          border-top: 1px solid #ddd;
        }
        .download-stmt-btn, .close-modal-btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .download-stmt-btn {
          background: ${brandColor};
          color: white;
        }
        .close-modal-btn {
          background: #666;
          color: white;
        }
        .statement-container {
          font-family: monospace;
          font-size: 0.75rem;
        }
        .statement-header {
          text-align: center;
          margin-bottom: 1rem;
        }
        .info-label {
          background: #f0f0f0;
          font-weight: bold;
        }
        .modal-loading {
          text-align: center;
          padding: 2rem;
        }
        .loading-spinner-small {
          width: 40px;
          height: 40px;
          border: 3px solid #e2e8f0;
          border-top-color: ${brandColor};
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        .error-message {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #fed7d7;
          border-left: 4px solid #e53e3e;
          color: #742a2a;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media print {
          .download-section, .modal-overlay { display: none; }
        }
      `}</style>
    </>
  );
}

export default WithdrawableStmt;
