import React, { useState, useEffect } from "react";

const Dashboard = ({ userData }) => {
  const brandColor = '#00a3b5';

  // Important Information Cards Data
  const infoCards = [
    {
      id: 1,
      title: 'ACCESS INFORMATION',
      content: 'Enter your ID No. to access Sacco info. Check Share, Dividend, Guarantorship, Loan statements.',
      icon: '🔑',
      badge: 'Essential',
      badgeColor: '#00a3b5'
    },
    {
      id: 2,
      title: 'SUPPORT CONTACT',
      content: 'Contact Dan on 0785278786 or email: sacco@metro-hospital.com.',
      icon: '📞',
      badge: 'Support',
      badgeColor: '#e53e3e'
    },
    {
      id: 3,
      title: 'DIVIDEND INFO',
      content: 'Dividends apply to LAST Year\'s shares, NOT current year shares.',
      icon: '💰',
      badge: 'Finance',
      badgeColor: '#38a169'
    },
    {
      id: 4,
      title: 'WHT INFORMATION',
      content: 'WHT only applies to those who tick to be paid dividends.',
      icon: '📊',
      badge: 'Tax',
      badgeColor: '#ed8936'
    },
    {
      id: 5,
      title: 'MOBILE NUMBER',
      content: 'Confirm your mobile number - dividends paid through indicated number.',
      icon: '✉️',
      badge: 'Profile',
      badgeColor: '#805ad5'
    },
    {
      id: 6,
      title: 'MEMBER BENEFITS',
      content: 'Access low-interest loans, earn competitive dividends, flexible repayment.',
      icon: '🎁',
      badge: 'Perks',
      badgeColor: '#d69e2e'
    }
  ];

  // Get member number safely
  const getMemberNumber = () => {
    if (userData?.memberNo) return userData.memberNo;
    if (userData?.memberNumber) return userData.memberNumber;
    if (userData?.accNo) return userData.accNo;
    return localStorage.getItem('memberNumber') || 'User';
  };

  useEffect(() => {
    if (userData) {
      console.log('Welcome back, Member:', getMemberNumber());
    } else {
      // Try to get from localStorage if not passed as prop
      const storedData = localStorage.getItem('userData');
      if (storedData) {
        try {
          const parsedData = JSON.parse(storedData);
          console.log('Welcome back, Member:', parsedData.memberNo || parsedData.memberNumber || 'User');
        } catch (e) {
          console.log('Welcome back, Member!');
        }
      }
    }
  }, [userData]);

  return (
    <div className="dashboard-wrapper">
      {/* Removed the welcome message from here - now it's in the top bar */}
      
      <div className="cards-grid">
        {infoCards.map((card, index) => (
          <div key={card.id} className="info-card" style={{ '--card-index': index }}>
            <div className="card-glow" style={{ background: `linear-gradient(90deg, ${card.badgeColor}40, ${brandColor}40, ${card.badgeColor}40)` }}></div>
            <div className="card-inner">
              <div className="card-top">
                <div className="card-icon-wrapper">
                  <div className="card-icon-bg" style={{ background: `linear-gradient(135deg, ${card.badgeColor}20, ${brandColor}20)` }}>
                    <span className="card-icon">{card.icon}</span>
                  </div>
                </div>
                <div className="card-badge" style={{ backgroundColor: card.badgeColor }}>
                  {card.badge}
                </div>
              </div>
              <h3 className="card-title">
                <span className="title-dot" style={{ backgroundColor: card.badgeColor }}></span>
                {card.title}
              </h3>
              <p className="card-content">{card.content}</p>
              <div className="card-hover-effect" style={{ background: `linear-gradient(135deg, ${card.badgeColor}08, ${brandColor}08)` }}></div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-footer">
        <p>© {new Date().getFullYear()} Metropolitan Hospital Sacco Ltd | Building Wealth Changing Lives</p>
      </div>

      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .dashboard-wrapper {
          min-height: 100vh;
          width: 100%;
          background: #f8f9fa;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* Cards Grid */
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        /* Modern Card Design */
        .info-card {
          position: relative;
          background: white;
          border-radius: 24px;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          animation: cardFloatIn 0.5s ease-out forwards;
          animation-delay: calc(var(--card-index) * 0.05s);
          opacity: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .info-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
          transition: left 0.5s;
          z-index: 2;
          pointer-events: none;
        }

        .info-card:hover::before {
          left: 100%;
        }

        .info-card:hover {
          transform: translateY(-8px) scale(1.02);
          box-shadow: 0 20px 30px -12px rgba(0, 0, 0, 0.15);
        }

        .card-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background-size: 200% 100%;
          animation: gradientShift 3s ease infinite;
          opacity: 0.8;
        }

        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        .card-inner {
          padding: 1.5rem;
          position: relative;
          z-index: 1;
        }

        /* Card Top Section */
        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
        }

        .card-icon-wrapper {
          position: relative;
        }

        .card-icon-bg {
          width: 56px;
          height: 56px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
        }

        .info-card:hover .card-icon-bg {
          transform: rotate(5deg) scale(1.05);
          box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
        }

        .card-icon {
          font-size: 1.8rem;
        }

        .card-badge {
          padding: 0.35rem 0.9rem;
          border-radius: 50px;
          font-size: 0.7rem;
          font-weight: 700;
          color: white;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s;
        }

        .info-card:hover .card-badge {
          transform: scale(1.05);
        }

        /* Card Title */
        .card-title {
          font-size: 1rem;
          font-weight: 800;
          color: #1a202c;
          margin-bottom: 0.75rem;
          line-height: 1.4;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .title-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          display: inline-block;
          animation: pulse 2s ease infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* Card Content */
        .card-content {
          font-size: 0.85rem;
          color: #4a5568;
          line-height: 1.6;
          margin: 0;
          position: relative;
          z-index: 1;
        }

        /* Hover Effect Line */
        .card-hover-effect {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 0;
          transition: height 0.3s ease;
          z-index: 0;
          pointer-events: none;
        }

        .info-card:hover .card-hover-effect {
          height: 100%;
        }

        /* Footer */
        .dashboard-footer {
          margin-top: 2rem;
          padding-top: 1rem;
          text-align: center;
          color: #a0aec0;
          font-size: 0.75rem;
          position: relative;
          z-index: 1;
          border-top: 1px solid #e2e8f0;
        }

        /* Animations */
        @keyframes cardFloatIn {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Responsive Design */
        @media (max-width: 1200px) {
          .cards-grid {
            gap: 1.25rem;
          }
        }

        @media (max-width: 968px) {
          .dashboard-wrapper {
            padding: 1.5rem;
          }
          
          .cards-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1.25rem;
          }
          
          .card-icon-bg {
            width: 48px;
            height: 48px;
          }
          
          .card-icon {
            font-size: 1.5rem;
          }
        }

        @media (max-width: 640px) {
          .dashboard-wrapper {
            padding: 1rem;
          }
          
          .cards-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .card-inner {
            padding: 1.25rem;
          }
          
          .card-title {
            font-size: 0.95rem;
          }
          
          .card-content {
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
