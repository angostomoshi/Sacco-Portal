import React, { useState, useEffect } from "react";

const Dashboard = ({ userData }) => {
  const brandColor = '#00a3b5';

  // Important Information Cards Data
  const infoCards = [
    {
      id: 1,
      title: '🔑 ACCESS INFORMATION',
      content: 'Enter your ID No. to access Sacco info. Check Share, Dividend, Guarantorship, Loan statements.',
      icon: '🔑',
      badge: 'Essential',
      badgeColor: '#00a3b5'
    },
    {
      id: 2,
      title: '📞 SUPPORT CONTACT',
      content: 'Contact Dan on 0785278786 or email: sacco@metro-hospital.com.',
      icon: '📱',
      badge: 'Support',
      badgeColor: '#e53e3e'
    },
    {
      id: 3,
      title: '📈 DIVIDEND INFO',
      content: 'Dividends apply to LAST Year\'s shares, NOT current year shares.',
      icon: '💰',
      badge: 'Finance',
      badgeColor: '#38a169'
    },
    {
      id: 4,
      title: '📋 WHT INFORMATION',
      content: 'WHT only applies to those who tick to be paid dividends.',
      icon: '📊',
      badge: 'Tax',
      badgeColor: '#ed8936'
    },
    {
      id: 5,
      title: '📱 MOBILE NUMBER',
      content: 'Confirm your mobile number - dividends paid through indicated number.',
      icon: '✉️',
      badge: 'Profile',
      badgeColor: '#805ad5'
    },
    {
      id: 6,
      title: '⭐ MEMBER BENEFITS',
      content: 'Access low-interest loans, earn competitive dividends, flexible repayment.',
      icon: '🎁',
      badge: 'Perks',
      badgeColor: '#d69e2e'
    }
  ];

  useEffect(() => {
    if (userData) {
      console.log('Welcome back, Member:', userData.memberNo || 'User');
    }
  }, [userData]);

  return (
    <div className="dashboard-wrapper">
      {/* Header - Minimal spacing to keep cards high */}
      <div className="dashboard-header">
        {userData && (
          <p className="welcome-text">
            Welcome back, Member {userData.memberNo || userData.memberNumber || 'User'}
          </p>
        )}
      </div>

      {/* Cards Grid - Positioned at the very top */}
      <div className="cards-grid">
        {infoCards.map((card) => (
          <div key={card.id} className="info-card">
            <div className="card-top">
              <div className="card-icon" style={{ backgroundColor: `${brandColor}10`, color: brandColor }}>
                {card.icon}
              </div>
              <div className="card-badge" style={{ backgroundColor: card.badgeColor }}>
                {card.badge}
              </div>
            </div>
            <h3 className="card-title">{card.title}</h3>
            <p className="card-content">{card.content}</p>
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
          background: linear-gradient(135deg, #f5f7fa 0%, #eef2f7 100%);
          padding: 0.75rem 2rem 2rem 2rem;  /* Minimal top padding */
          display: flex;
          flex-direction: column;
        }

        /* Header Styles - Almost no margin */
        .dashboard-header {
          text-align: center;
          margin-bottom: 0.25rem;  /* Very small margin */
        }

        .dashboard-title {
          font-size: 1.8rem;
          font-weight: 800;
          background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.5px;
          margin-bottom: 0.5rem;
        }

        .welcome-text {
          color: #4a5568;
          font-size: 0.85rem;
          font-weight: 500;
        }

        /* Cards Grid - No top margin, flush with header */
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;  /* No top margin */
        }

        /* Individual Card */
        .info-card {
          background: white;
          border-radius: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
          border: 1px solid rgba(0, 163, 181, 0.1);
          display: flex;
          flex-direction: column;
          padding: 1.25rem;
        }

        .info-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 24px rgba(0, 163, 181, 0.12);
          border-color: rgba(0, 163, 181, 0.2);
        }

        /* Card Top Section */
        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .card-icon {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          transition: transform 0.2s ease;
        }

        .info-card:hover .card-icon {
          transform: scale(1.05);
        }

        .card-badge {
          padding: 0.3rem 0.8rem;
          border-radius: 30px;
          font-size: 0.65rem;
          font-weight: 700;
          color: white;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* Card Title */
        .card-title {
          font-size: 1rem;
          font-weight: 800;
          color: #1a202c;
          margin-bottom: 0.75rem;
          line-height: 1.3;
        }

        /* Card Content */
        .card-content {
          font-size: 0.85rem;
          color: #4a5568;
          line-height: 1.5;
          margin: 0;
        }

        /* Footer */
        .dashboard-footer {
          margin-top: 1.5rem;
          padding-top: 1rem;
          text-align: center;
          color: #a0aec0;
          font-size: 0.7rem;
          border-top: 1px solid #e2e8f0;
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .dashboard-wrapper {
            padding: 0.5rem 1.5rem 1.5rem 1.5rem;
          }
          
          .cards-grid {
            gap: 1.25rem;
          }
          
          .dashboard-title {
            font-size: 1.5rem;
          }
          
          .dashboard-header {
            margin-bottom: 0.2rem;
          }
        }

        @media (max-width: 900px) {
          .cards-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
          }
          
          .card-icon {
            width: 44px;
            height: 44px;
            font-size: 1.3rem;
          }
          
          .card-title {
            font-size: 0.95rem;
          }
          
          .card-content {
            font-size: 0.8rem;
          }
          
          .dashboard-wrapper {
            padding: 0.5rem 1rem 1rem 1rem;
          }
        }

        @media (max-width: 550px) {
          .dashboard-wrapper {
            padding: 0.35rem 1rem 1rem 1rem;
          }
          
          .cards-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .dashboard-title {
            font-size: 1.3rem;
          }
          
          .welcome-text {
            font-size: 0.75rem;
          }
          
          .dashboard-header {
            margin-bottom: 0.15rem;
          }
          
          .card-icon {
            width: 42px;
            height: 42px;
            font-size: 1.2rem;
          }
          
          .card-title {
            font-size: 0.9rem;
          }
          
          .card-content {
            font-size: 0.8rem;
          }
          
          .info-card {
            padding: 1rem;
          }
          
          .dashboard-footer {
            margin-top: 1rem;
            padding-top: 0.75rem;
          }
        }

        @media (min-width: 1400px) {
          .cards-grid {
            max-width: 1400px;
            gap: 1.75rem;
          }
          
          .card-icon {
            width: 52px;
            height: 52px;
            font-size: 1.5rem;
          }
          
          .card-title {
            font-size: 1.1rem;
          }
          
          .card-content {
            font-size: 0.9rem;
          }
        }

        /* Animation */
        @keyframes cardFadeIn {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .info-card {
          animation: cardFadeIn 0.35s ease-out forwards;
          opacity: 0;
        }

        .info-card:nth-child(1) { animation-delay: 0.05s; }
        .info-card:nth-child(2) { animation-delay: 0.1s; }
        .info-card:nth-child(3) { animation-delay: 0.15s; }
        .info-card:nth-child(4) { animation-delay: 0.2s; }
        .info-card:nth-child(5) { animation-delay: 0.25s; }
        .info-card:nth-child(6) { animation-delay: 0.3s; }
      `}</style>
    </div>
  );
};

export default Dashboard;