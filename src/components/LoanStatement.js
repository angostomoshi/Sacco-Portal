// LoanStatement.js - With proper API response handling, date formatting (no time), improved PDF handling
import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function LoanStatement() {
  const reportRef = useRef();
  const [memberData, setMemberData] = useState(null);
  const [loanData, setLoanData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerData, setHeaderData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  
  const brandColor = '#00a3b5';

 // Replace the formatDateOnly function with this version:
const formatDateOnly = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    // Extract just the date part from ISO string (YYYY-MM-DD)
    if (dateString.includes('T')) {
      const datePart = dateString.split('T')[0]; // Gets "2026-06-04"
      const [year, month, day] = datePart.split('-');
      return `${day}/${month}/${year}`; // Returns "04/06/2026"
    }
    
    // For other formats, try normal parsing
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-GB');
  } catch {
    return dateString;
  }
};

  // Process loan data from API response
  const processLoanData = (responseData) => {
    console.log('Processing API response:', responseData);
    
    let loans = [];
    
    // Handle the actual API response structure: { success: true, data: [...], source: "local", count: 17 }
    if (responseData && responseData.success === true && Array.isArray(responseData.data)) {
      loans = responseData.data;
    } 
    // Fallback for other possible structures
    else if (Array.isArray(responseData)) {
      loans = responseData;
    } 
    else if (responseData && responseData.data && Array.isArray(responseData.data)) {
      loans = responseData.data;
    }
    else if (responseData && responseData.loans && Array.isArray(responseData.loans)) {
      loans = responseData.loans;
    }
    else if (responseData && responseData.instant && Array.isArray(responseData.instant)) {
      loans = responseData.instant;
    }
    else if (responseData && (responseData.loanNo || responseData.amount)) {
      loans = [responseData];
    }
    
    console.log('Extracted loans array:', loans);
    
    // Format the loans for display
    const formattedLoans = loans.map((item, index) => ({
      id: index,
      loanNo: item.loanNo || 'N/A',
      purpose: item.loanPurpose || 'N/A',
      sdate: formatDateOnly(item.startDate),
      edate: formatDateOnly(item.endDate),
      period: item.period !== null && item.period !== undefined ? item.period : 'N/A',
      originalAmount: parseFloat(item.amount) || 0,
      balance: parseFloat(item.outStanding) || 0,
    }));
    
    console.log('Formatted loans:', formattedLoans);
    setLoanData(formattedLoans);
  };

  // Fetch header config
  const fetchHeaderConfig = async (token) => {
    try {
      const response = await fetch('/api/v1/header/1', {
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

  const handleViewStatement = async (loan) => {
    setSelectedLoan(loan);
    setStatementLoading(true);
    setShowModal(true);
    
    // Clear previous PDF URL and blob
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setPdfBlob(null);
    
    try {
      const token = localStorage.getItem('authToken');
      const memberNumber = localStorage.getItem('memberNumber');
      
      console.log('Generating statement for loan:', loan.loanNo);
      
      const response = await fetch('/api/v1/loan-statement-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          loanNo: loan.loanNo,
          memberNo: memberNumber,
          startDate: loan.sdate,
          endDate: loan.edate
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        setPdfBlob(blob);
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || 'Failed to generate statement');
      }
    } catch (err) {
      console.error('Error generating statement:', err);
      setError('Failed to generate loan statement. Please try again.');
    } finally {
      setStatementLoading(false);
    }
  };

  const handleDownloadStatement = () => {
    if (pdfBlob && selectedLoan) {
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `loan-statement-${selectedLoan.loanNo}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } else if (pdfUrl) {
      fetch(pdfUrl)
        .then(res => res.blob())
        .then(blob => {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `loan-statement-${selectedLoan.loanNo}-${new Date().toISOString().split('T')[0]}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(downloadUrl);
        })
        .catch(err => console.error('Download failed:', err));
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedLoan(null);
    setPdfBlob(null);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  };

  const handleMainPDFDownload = async () => {
    const element = reportRef.current;
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
      pdf.save(`loan-summary-${memberData?.accNo || 'member'}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const formatCurrency = (value) => {
    if (value === undefined || value === null) return 'N/A';
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
          const memberResponse = await fetch(`/api/v1/member/${memberNumber}`, {
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
        const instantUrl = `/api/v1/instant/${memberNumber}`;
        console.log('Fetching from:', instantUrl);
        
        const instantResponse = await fetch(instantUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        
        if (instantResponse.ok) {
          const instantData = await instantResponse.json();
          console.log('RAW API RESPONSE:', JSON.stringify(instantData, null, 2));
          
          if (instantData && instantData.data && instantData.data.length > 0) {
            processLoanData(instantData);
          } else if (Array.isArray(instantData) && instantData.length > 0) {
            processLoanData({ success: true, data: instantData });
          } else {
            setError('No loan records found');
            setLoanData([]);
          }
        } else {
          console.error('Failed to fetch instant loans:', instantResponse.status);
          setError('Unable to fetch loan data.');
          setLoanData([]);
        }
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Network error. Unable to fetch loan data.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, []);

  // Calculate totals
  const totalLoanAmount = loanData.reduce((sum, loan) => sum + (loan.originalAmount || 0), 0);
  const totalOutstanding = loanData.reduce((sum, loan) => sum + (loan.balance || 0), 0);

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
              <tr>
                <td className="info-label">Name:</td>
                <td className="info-value"><strong>{memberData?.holdersName || memberData?.name || 'N/A'}</strong> {memberData?.accNo ? `(${memberData.accNo})` : ''}</td>
                <td className="info-label">Member No:</td>
                <td className="info-value"><strong>{memberData?.accNo || memberData?.memberNo || 'N/A'}</strong></td>
              </tr>
              <tr>
                <td className="info-label">Email:</td>
                <td className="info-value">{memberData?.emailAdd || memberData?.email || 'N/A'}</td>
                <td className="info-label">Tel:</td>
                <td className="info-value">{memberData?.tel1 || memberData?.phone || 'N/A'}</td>
              </tr>
              <tr>
                <td className="info-label">ID No:</td>
                <td className="info-value"><strong>{memberData?.idNo || memberData?.idNumber || 'N/A'}</strong></td>
                <td className="info-label">Print Date:</td>
                <td className="info-value"><strong>{new Date().toLocaleDateString('en-GB')}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-section">
          <div className="table-responsive">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Loan No</th>
                  <th>Purpose</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Period (Months)</th>
                  <th>Principal (KES)</th>
                  <th>Balance (KES)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loanData.length > 0 ? loanData.map((loan, idx) => (
                  <tr key={loan.id || idx}>
                    <td data-label="Loan No"><strong>{loan.loanNo}</strong></td>
                    <td data-label="Purpose"><strong>{loan.purpose}</strong></td>
                    <td data-label="Start Date">{loan.sdate}</td>
                    <td data-label="End Date">{loan.edate}</td>
                    <td data-label="Period">{loan.period}</td>
                    <td data-label="Principal" className="amount"><strong>{formatCurrency(loan.originalAmount)}</strong></td>
                    <td data-label="Balance" className="amount"><strong>{formatCurrency(loan.balance)}</strong></td>
                    <td data-label="Action" className="action-cell">
                      <button 
                        className="view-stmt-btn"
                        onClick={() => handleViewStatement(loan)}
                        style={{ backgroundColor: brandColor }}
                      >
                        View Statement
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No loan records found</td></tr>
                )}
              </tbody>
              {loanData.length > 0 && (
                <tfoot>
                  <tr className="total-row">
                    <td colSpan="5"><strong>TOTAL</strong></td>
                    <td className="amount"><strong>{formatCurrency(totalLoanAmount)}</strong></td>
                    <td className="amount"><strong>{formatCurrency(totalOutstanding)}</strong></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="report-footer">
          <p><strong>Note:</strong> This is a summary of your loan portfolio.</p>
          <p>For any queries, please contact the Sacco office.</p>
        </div>
      </div>

      <div className="download-section">
        <button onClick={handleMainPDFDownload} className="download-btn" disabled={loanData.length === 0}>
          📄 Download PDF Summary
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Modal for displaying PDF statement */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Loan Statement - {selectedLoan?.loanNo}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              {statementLoading ? (
                <div className="modal-loading">
                  <div className="loading-spinner-small"></div>
                  <p>Generating statement...</p>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                  title={`Loan Statement ${selectedLoan?.loanNo}`}
                  className="pdf-viewer"
                  frameBorder="0"
                />
              ) : (
                <div className="error-container">
                  <p>Failed to load statement. Please try again.</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {pdfBlob && (
                <button onClick={handleDownloadStatement} className="download-stmt-btn">
                  📄 Download PDF
                </button>
              )}
              <button className="close-modal-btn" onClick={handleCloseModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .report-container {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          max-width: 1400px;
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
        
        .table-responsive {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        
        .info-table, .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
        }
        
        .info-table td, .report-table td, .report-table th {
          border: 1px solid #000;
          padding: 0.5rem;
        }
        
        .report-table th {
          background: #f0f0f0;
          font-weight: bold;
          white-space: nowrap;
        }
        
        .report-table td {
          word-break: break-word;
        }
        
        .amount {
          text-align: right;
        }
        
        .view-stmt-btn {
          background: ${brandColor};
          color: white;
          border: none;
          padding: 0.3rem 0.8rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.7rem;
          white-space: nowrap;
        }
        
        .view-stmt-btn:hover {
          opacity: 0.9;
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
        
        .download-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
          height: 90vh;
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
        
        .modal-header h2 {
          margin: 0;
          font-size: 1.2rem;
        }
        
        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          font-weight: bold;
        }
        
        .modal-close:hover {
          color: ${brandColor};
        }
        
        .modal-body {
          flex: 1;
          overflow: auto;
          padding: 0;
          min-height: 0;
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
          font-size: 0.9rem;
        }
        
        .download-stmt-btn {
          background: ${brandColor};
          color: white;
        }
        
        .close-modal-btn {
          background: #666;
          color: white;
        }
        
        .close-modal-btn:hover {
          background: #555;
        }
        
        .pdf-viewer {
          width: 100%;
          height: 100%;
          border: none;
        }
        
        .modal-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 1rem;
        }
        
        .loading-spinner-small {
          width: 40px;
          height: 40px;
          border: 3px solid #e2e8f0;
          border-top-color: ${brandColor};
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        .error-container {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #e53e3e;
        }
        
        .error-message {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #fed7d7;
          border-left: 4px solid #e53e3e;
          color: #742a2a;
        }
        
        .action-cell {
          text-align: center;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
          .report-container {
            padding: 1rem;
          }
          
          .report-table thead {
            display: none;
          }
          
          .report-table,
          .report-table tbody,
          .report-table tr,
          .report-table td {
            display: block;
          }
          
          .report-table tr {
            margin-bottom: 1rem;
            border: 1px solid #000;
            border-radius: 8px;
            padding: 0.5rem;
          }
          
          .report-table td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem;
            border: none;
            border-bottom: 1px solid #eee;
          }
          
          .report-table td:last-child {
            border-bottom: none;
          }
          
          .report-table td::before {
            content: attr(data-label);
            font-weight: bold;
            width: 40%;
            min-width: 120px;
          }
          
          .report-table td.amount {
            justify-content: flex-end;
          }
          
          .report-table td.amount::before {
            text-align: left;
          }
          
          .action-cell {
            justify-content: center;
          }
          
          .modal-container {
            width: 95%;
            height: 85vh;
          }
        }
        
        @media print {
          .download-section, .modal-overlay { display: none; }
        }
      `}</style>
    </>
  );
}

export default LoanStatement;