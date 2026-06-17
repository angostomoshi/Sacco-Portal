// MemberProfile.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from './Alert';

const MemberProfile = () => {
  const navigate = useNavigate();
  const [memberData, setMemberData] = useState(null);
  const [savings, setSavings] = useState(null);
  const [shareCapital, setShareCapital] = useState(null);
  const [dividendPayable, setDividendPayable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const brandColor = '#00a3b5';

  // Helper function to get auth headers
  const getAuthHeaders = () => {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    const authToken = localStorage.getItem('authToken');
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    } else {
      const storedData = localStorage.getItem('memberData');
      if (storedData) {
        const parsed = JSON.parse(storedData);
        if (parsed.token) {
          headers['Authorization'] = `Bearer ${parsed.token}`;
        }
      }
    }
    
    return headers;
  };

  // Helper function to get member number
  const getMemberNumber = () => {
    let memberNumber = localStorage.getItem('memberNumber');
    
    if (!memberNumber) {
      const storedMemberData = localStorage.getItem('memberData');
      if (storedMemberData) {
        const parsed = JSON.parse(storedMemberData);
        memberNumber = parsed.accNo || parsed.memberNo || parsed.memberNumber || parsed.memberNo;
      }
    }
    
    return memberNumber;
  };

  useEffect(() => {
    // First, try to load cached data immediately
    const cachedProfile = localStorage.getItem('memberProfile');
    if (cachedProfile) {
      setMemberData(JSON.parse(cachedProfile));
    }

    const fetchAllData = async () => {
      setError('');
      
      try {
        const memberNumber = getMemberNumber();
        
        if (!memberNumber) {
          setError('Member number not found. Please login again.');
          setTimeout(() => navigate('/login'), 2000);
          setLoading(false);
          return;
        }
        
        const headers = getAuthHeaders();
        
        // Fetch all four endpoints in parallel
        const [profileResponse, savingsResponse, shareCapitalResponse, dividendResponse] = await Promise.allSettled([
          fetch(`/api/v1/member/${memberNumber}`, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
          }),
          fetch(`/api/v1/savings/sumTotal/${memberNumber}`, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
          }),
          fetch(`/api/v1/shareCapital/sumTotal/${memberNumber}`, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
          }),
          fetch(`/api/v1/dividendPayable/sumTotal/${memberNumber}`, {
            method: 'GET',
            headers: headers,
            credentials: 'include'
          })
        ]);
        
        // Handle Profile Data
        if (profileResponse.status === 'fulfilled' && profileResponse.value.ok) {
          const profileData = await profileResponse.value.json();
          setMemberData(profileData);
          localStorage.setItem('memberProfile', JSON.stringify(profileData));
        } else if (profileResponse.status === 'fulfilled' && (profileResponse.value.status === 401 || profileResponse.value.status === 403)) {
          // Session expired
          localStorage.clear();
          setError('Session expired. Please login again.');
          setTimeout(() => navigate('/login'), 2000);
          setLoading(false);
          return;
        } else {
          console.error('Failed to fetch profile');
          const cached = localStorage.getItem('memberProfile');
          if (cached) {
            setMemberData(JSON.parse(cached));
          } else {
            setError('Failed to load profile data');
          }
        }
        
        // Handle Savings Data
        if (savingsResponse.status === 'fulfilled' && savingsResponse.value.ok) {
          const savingsData = await savingsResponse.value.json();
          // The API might return a number directly or an object with a sumTotal property
          setSavings(typeof savingsData === 'number' ? savingsData : savingsData?.sumTotal || savingsData?.total || 0);
        } else {
          console.error('Failed to fetch savings');
          setSavings(0);
        }
        
        // Handle Share Capital Data
        if (shareCapitalResponse.status === 'fulfilled' && shareCapitalResponse.value.ok) {
          const shareCapitalData = await shareCapitalResponse.value.json();
          setShareCapital(typeof shareCapitalData === 'number' ? shareCapitalData : shareCapitalData?.sumTotal || shareCapitalData?.total || 0);
        } else {
          console.error('Failed to fetch share capital');
          setShareCapital(0);
        }
        
        // Handle Dividend Data
        if (dividendResponse.status === 'fulfilled' && dividendResponse.value.ok) {
          const dividendData = await dividendResponse.value.json();
          setDividendPayable(typeof dividendData === 'number' ? dividendData : dividendData?.sumTotal || dividendData?.total || 0);
        } else {
          console.error('Failed to fetch dividend payable');
          setDividendPayable(0);
        }
        
      } catch (err) {
        console.error('Error fetching data:', err);
        if (!localStorage.getItem('memberProfile')) {
          setError(err.message || 'Failed to load member profile');
        } else {
          setError('Unable to refresh data. Showing cached data.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchAllData();
  }, [navigate]);

  // Format date function
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `KES ${(amount || 0).toLocaleString()}`;
  };

  // If no data at all (no cached, no fetched)
  if (!memberData && !loading) {
    return (
      <div className="profile-error">
        <div className="error-icon">⚠️</div>
        <h3>Unable to Load Profile</h3>
        <p>{error || 'No profile data available'}</p>
        <button onClick={() => window.location.reload()} className="retry-btn">
          Try Again
        </button>
        <style>{`
          .profile-error {
            text-align: center;
            padding: 3rem;
            background: white;
            border-radius: 12px;
          }
          .error-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
          .profile-error h3 {
            color: #1a202c;
            margin-bottom: 0.5rem;
          }
          .profile-error p {
            color: #718096;
            margin-bottom: 1.5rem;
          }
          .retry-btn {
            background: ${brandColor};
            color: white;
            border: none;
            padding: 0.6rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          }
          .retry-btn:hover {
            background: #008a9a;
          }
        `}</style>
      </div>
    );
  }

  // Show loading state
  if (loading && !memberData) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading profile data...</p>
        <style>{`
          .loading-container {
            text-align: center;
            padding: 3rem;
            background: white;
            border-radius: 12px;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #e2e8f0;
            border-top-color: ${brandColor};
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 1rem;
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
      <div className="card">
        <div className="card-header">
          <h3>Personal Information</h3>
          {error && (
            <span style={{ fontSize: '0.7rem', color: '#f39c12' }}>
              ⚠️ {error}
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="profile-info-grid three-columns">
            <div className="profile-info-item">
              <label>Full Name</label>
              <div className="value">
                {memberData?.holdersName || memberData?.fullName || memberData?.name || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Member Number</label>
              <div className="value">
                {memberData?.accNo || memberData?.memberNo || memberData?.memberNumber || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>ID Number</label>
              <div className="value">
                {memberData?.idNo || memberData?.idNumber || memberData?.nationalId || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Email Address</label>
              <div className="value">
                {memberData?.emailAdd || memberData?.email || memberData?.emailAddress || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Phone Number</label>
              <div className="value">
                {memberData?.tel1 || memberData?.phone || memberData?.phoneNumber || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Postal Address</label>
              <div className="value">
                {memberData?.postalAddress || 'Not provided'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Member ID</label>
              <div className="value">
                {memberData?.id || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>KRA PIN</label>
              <div className="value">
                {memberData?.kraPin || memberData?.pin || 'Not registered'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Status</label>
              <div className="value">
                <span className="status-badge" style={{ backgroundColor: brandColor + '20', color: brandColor }}>
                  ✓ Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: '1rem' }}>
          <Alert type="warning" title="Showing the best available profile data">
            {error}
          </Alert>
        </div>
      )}

      {(memberData?.nok1 || memberData?.nok2 || memberData?.nok3) && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header">
            <h3>Next of Kin Information</h3>
          </div>
          <div className="card-body">
            <div className="profile-info-grid three-columns">
              {memberData?.nok1 && (
                <div className="profile-info-item">
                  <label>Next of Kin 1</label>
                  <div className="value">{memberData.nok1}</div>
                </div>
              )}
              {memberData?.nok2 && (
                <div className="profile-info-item">
                  <label>Next of Kin 2</label>
                  <div className="value">{memberData.nok2}</div>
                </div>
              )}
              {memberData?.nok3 && (
                <div className="profile-info-item">
                  <label>Next of Kin 3</label>
                  <div className="value">{memberData.nok3}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3>Account Summary</h3>
        </div>
        <div className="card-body">
          <div className="profile-info-grid three-columns">
            <div className="profile-info-item">
              <label>Account Number</label>
              <div className="value">
                {memberData?.accNo || 'N/A'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Member Since</label>
              <div className="value">
                {formatDate(memberData?.createdAt || memberData?.joinDate) || 'Information not available'}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Savings</label>
              <div className="value financial">
                {formatCurrency(savings)}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Share Capital</label>
              <div className="value financial">
                {formatCurrency(shareCapital)}
              </div>
            </div>
            <div className="profile-info-item">
              <label>Dividend Payable</label>
              <div className="value financial">
                {formatCurrency(dividendPayable)}
              </div>
            </div>
          </div>
          
          <div className="info-note">
            <small>💡 Loan information will be available in the loans section.</small>
          </div>
        </div>
      </div>

      <style>{`
        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          margin-bottom: 1rem;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .card-header h3 {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 600;
          color: #1a202c;
        }

        .card-body {
          padding: 1.25rem;
        }

        .profile-info-grid {
          display: grid;
          gap: 1.5rem;
        }

        .profile-info-grid.three-columns {
          grid-template-columns: repeat(3, 1fr);
        }

        .profile-info-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .profile-info-item label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #718096;
        }

        .profile-info-item .value {
          font-size: 1rem;
          color: #1a202c;
          font-weight: 500;
          padding: 0.5rem 0;
          border-bottom: 2px solid #e2e8f0;
          word-break: break-word;
        }

        .profile-info-item .value.financial {
          color: ${brandColor};
          font-weight: 700;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .info-note {
          margin-top: 1rem;
          padding: 0.75rem;
          background: #ebf8ff;
          border-radius: 8px;
          color: #2c5282;
          font-size: 0.75rem;
          text-align: center;
        }

        @media (max-width: 992px) {
          .profile-info-grid.three-columns {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .profile-info-grid.three-columns {
            grid-template-columns: 1fr;
          }
          
          .card-body {
            padding: 1rem;
          }
        }
      `}</style>
    </>
  );
};

export default MemberProfile;
