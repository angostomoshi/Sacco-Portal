import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import MemberProfile from './components/MemberProfile';
import ApplyLoan from './components/ApplyLoan';
import DividendList from './components/DividendList';
import LoanStatement from './components/LoanStatement';
import GuarantorList from './components/GuarantorList';
import ShareCapital from './components/ShareCapital';
import ShareStatement from './components/ShareStatement';
import WithdrawableStmt from './components/WithdrawableStmt';
import Login from './components/Login';
import CreateAccount from './components/CreateAccount';
import ChangePassword from './components/ChangePassword';
import './App.css';

// Import the logo image from src folder
import logo from './log.png';

// This is the ONLY sidebar - dark with green icons
const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Menu items exactly as you want
  const menuItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/profile', label: 'Member Profile', icon: '👤' },
    { path: '/apply-loan', label: 'Apply Instant Loan', icon: '💰' },
    { path: '/dividends', label: 'Dividend List', icon: '💵' },
    { path: '/loan-statement', label: 'Loan Stmt List', icon: '📄' },
    { path: '/guarantors', label: 'Guarantor List', icon: '🤝' },
    { path: '/share-capital', label: 'Share Capital List', icon: '🏦' },
    { path: '/share-statement', label: 'Share Statement', icon: '📈' },
    { path: '/withdrawable', label: 'W/drawable Stmt', icon: '💸' },
  ];

  const handleNavigation = (path) => {
    navigate(path);
    if (window.innerWidth <= 768) onClose();
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userData');
    localStorage.removeItem('userName');
    localStorage.removeItem('userInitials');
    localStorage.removeItem('accountNo');
    window.location.reload();
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}
      
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            {/* Logo image instead of text */}
            <img 
              src={logo} 
              alt="Sacco Logo" 
              className="logo-image"
            />
          </div>
        </div>

        <div className="nav-menu">
          {menuItems.map((item) => (
            <div
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => handleNavigation(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
          
          <div className="nav-item logout-item" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            <span>Log Out</span>
          </div>
        </div>
      </div>
    </>
  );
};

// Top Bar Component
const TopBar = ({ onMenuToggle }) => {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [accountNo, setAccountNo] = useState('');

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }));
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    
    // Get user data from localStorage
    const storedUserData = localStorage.getItem('userData');
    const storedUserName = localStorage.getItem('userName');
    const storedUserInitials = localStorage.getItem('userInitials');
    const storedAccountNo = localStorage.getItem('accountNo');
    
    if (storedUserData) {
      try {
        const userData = JSON.parse(storedUserData);
        setUserName(userData.holdersName || 'Member');
        setAccountNo(userData.accNo || '');
        // Create initials from holdersName
        if (userData.holdersName) {
          const names = userData.holdersName.split(' ');
          const initials = names.map(n => n[0]).join('').toUpperCase().substring(0, 2);
          setUserInitials(initials);
        } else {
          setUserInitials('MB');
        }
      } catch (e) {
        setUserName(storedUserName || 'Member');
        setUserInitials(storedUserInitials || 'MB');
        setAccountNo(storedAccountNo || '');
      }
    } else {
      setUserName(storedUserName || 'Member');
      setUserInitials(storedUserInitials || 'MB');
      setAccountNo(storedAccountNo || '');
    }
    
    return () => clearInterval(interval);
  }, []);

  // Get current page title
  const getPageTitle = () => {
    const path = window.location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/profile') return 'Member Profile';
    if (path === '/apply-loan') return 'Apply Instant Loan';
    if (path === '/dividends') return 'Dividend List';
    if (path === '/loan-statement') return 'Loan Statement';
    if (path === '/guarantors') return 'Guarantor List';
    if (path === '/share-capital') return 'Share Capital';
    if (path === '/share-statement') return 'Share Statement';
    if (path === '/withdrawable') return 'Withdrawable Statement';
    return 'Dashboard';
  };

  return (
    <div className="top-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="mobile-menu-toggle" onClick={onMenuToggle}>
          ☰
        </button>
        <div className="page-title">{getPageTitle()}</div>
      </div>
      <div className="header-right">
        <div className="datetime">
          <div className="time">{currentTime}</div>
          <div className="date">{currentDate}</div>
        </div>
        <div className="user-dropdown">
          <div className="user-info">
            <div className="name">{userName}</div>
            <div className="role">Member {accountNo && `- ${accountNo}`}</div>
          </div>
          <div className="user-avatar-sm">{userInitials}</div>
        </div>
      </div>
    </div>
  );
};

// Main Layout - Wraps all pages
const MainLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="dashboard-container">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <div className="content-wrapper">
          {children}
        </div>
      </div>
    </div>
  );
};

// App Component
function App() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });

  const handleLogin = async (identifier) => {
    try {
      // Fetch user data from your API using account number or ID
      // identifier can be accNo like "MS967" or id like 1143
      const response = await fetch(`http://localhost:3000/api/v1/member/${identifier}`);
      
      if (response.ok) {
        const userData = await response.json();
        
        // Store user data in localStorage
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userData', JSON.stringify(userData));
        localStorage.setItem('userName', userData.holdersName);
        localStorage.setItem('accountNo', userData.accNo);
        
        // Create initials from holdersName
        if (userData.holdersName) {
          const names = userData.holdersName.split(' ');
          const initials = names.map(n => n[0]).join('').toUpperCase().substring(0, 2);
          localStorage.setItem('userInitials', initials);
        } else {
          localStorage.setItem('userInitials', 'MB');
        }
        
        setIsAuthenticated(true);
        navigate('/');
      } else {
        console.error('Failed to fetch user data');
        // Fallback to default values if API fails
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userName', 'Member');
        localStorage.setItem('userInitials', 'MB');
        setIsAuthenticated(true);
        navigate('/');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Fallback to default values if API fails
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userName', 'Member');
      localStorage.setItem('userInitials', 'MB');
      setIsAuthenticated(true);
      navigate('/');
    }
  };

  const handleCreateAccount = () => {
    navigate('/create-account');
  };

  const handleForgotPassword = () => {
    navigate('/change-password');
  };

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={
          <Login 
            onLogin={handleLogin}
            onCreateAccount={handleCreateAccount}
            onForgotPassword={handleForgotPassword}
          />
        } />
      </Routes>
    );
  }

  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<MemberProfile />} />
        <Route path="/apply-loan" element={<ApplyLoan />} />
        <Route path="/dividends" element={<DividendList />} />
        <Route path="/loan-statement" element={<LoanStatement />} />
        <Route path="/guarantors" element={<GuarantorList />} />
        <Route path="/share-capital" element={<ShareCapital />} />
        <Route path="/share-statement" element={<ShareStatement />} />
        <Route path="/withdrawable" element={<WithdrawableStmt />} />
        <Route path="/create-account" element={<CreateAccount />} />
        <Route path="/change-password" element={<ChangePassword />} />
      </Routes>
    </MainLayout>
  );
}

export default App;