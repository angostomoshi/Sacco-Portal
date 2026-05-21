// CreateAccount.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../log.png';

const CreateAccount = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    memberNo: '',
    mobileNo: '',
    email: '',
    password: '',
    confirmPassword: '',
    otp: ''
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOtpField, setShowOtpField] = useState(false);
  const [sentOtp, setSentOtp] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSendOtp = () => {
    if (!formData.memberNo.trim()) {
      setError('Please enter Member Number');
      return;
    }
    if (!formData.mobileNo.trim()) {
      setError('Please enter Mobile Number');
      return;
    }
    if (!formData.email.trim()) {
      setError('Please enter Email');
      return;
    }
    
    setLoading(true);
    setError('');
    
    setTimeout(() => {
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      setSentOtp(generatedOtp);
      setShowOtpField(true);
      setLoading(false);
      setSuccess('OTP sent successfully! Check your phone');
      
      setTimeout(() => setSuccess(''), 3000);
    }, 500);
  };

  const handleSignUp = (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.memberNo.trim()) {
      setError('Please enter Member Number');
      return;
    }
    
    if (!formData.mobileNo.trim()) {
      setError('Please enter Mobile Number');
      return;
    }
    
    if (!formData.email.trim()) {
      setError('Please enter Email');
      return;
    }
    
    if (!formData.otp.trim()) {
      setError('Please enter OTP');
      return;
    }
    
    if (formData.otp !== sentOtp) {
      setError('Invalid OTP. Please try again.');
      return;
    }
    
    if (!formData.password.trim()) {
      setError('Please enter password');
      return;
    }
    
    if (formData.password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    
    setTimeout(() => {
      setLoading(false);
      setSuccess('Account created successfully! Redirecting to login...');
      
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    }, 500);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-section">
          <img src={logo} alt="Sacco Logo" className="login-logo-image" />
        </div>
        
        <div className="login-header">
          <h2>Create an Account</h2>
          <p>Register as a new member</p>
        </div>
        
        <div className="login-body">
          {error && (
            <div style={{ 
              background: 'rgba(231, 76, 60, 0.08)', 
              borderLeft: '3px solid #e74c3c', 
              color: '#c0392b', 
              padding: '0.75rem', 
              borderRadius: '8px', 
              marginBottom: '1rem', 
              fontSize: '0.75rem' 
            }}>
              {error}
            </div>
          )}
          
          {success && (
            <div style={{ 
              background: 'rgba(72, 187, 120, 0.08)', 
              borderLeft: '3px solid #48bb78', 
              color: '#276749', 
              padding: '0.75rem', 
              borderRadius: '8px', 
              marginBottom: '1rem', 
              fontSize: '0.75rem' 
            }}>
              {success}
            </div>
          )}
          
          <form onSubmit={handleSignUp}>
            <div className="form-group">
              <label className="form-label required">Member Number</label>
              <input
                type="text"
                name="memberNo"
                className="form-control"
                value={formData.memberNo}
                onChange={handleChange}
                placeholder="Enter your member number"
                disabled={showOtpField}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Mobile Number</label>
              <input
                type="tel"
                name="mobileNo"
                className="form-control"
                value={formData.mobileNo}
                onChange={handleChange}
                placeholder="Enter your mobile number"
                disabled={showOtpField}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Email</label>
              <input
                type="email"
                name="email"
                className="form-control"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email address"
                disabled={showOtpField}
              />
            </div>

            {!showOtpField ? (
              <button 
                type="button"
                onClick={handleSendOtp}
                className="login-btn"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label required">OTP</label>
                  <input
                    type="text"
                    name="otp"
                    className="form-control"
                    value={formData.otp}
                    onChange={handleChange}
                    placeholder="Enter OTP"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Password</label>
                  <input
                    type="password"
                    name="password"
                    className="form-control"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create password"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Confirm Password</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    className="form-control"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                  />
                </div>

                <button 
                  type="submit" 
                  className="login-btn" 
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Sign Up'}
                </button>
              </>
            )}
          </form>
          
          <div className="login-links">
            <span className="back-link" onClick={() => navigate('/login')}>← Back to Login</span>
          </div>
        </div>
      </div>

      <style>{`
        .login-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: #00a3b5;
          padding: 1rem;
        }

        .login-card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 420px;
          overflow: hidden;
        }

        .login-logo-section {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2rem 2rem 1rem 2rem;
          background: white;
        }

        .login-logo-image {
          max-width: 120px;
          height: auto;
          object-fit: contain;
        }

        .login-header {
          text-align: center;
          padding: 1rem 2rem;
          background: #00a3b5;
        }

        .login-header h2 {
          font-size: 1.5rem;
          color: white;
          margin: 0 0 0.25rem 0;
          font-weight: 600;
        }

        .login-header p {
          font-size: 0.85rem;
          color: white;
          margin: 0;
          opacity: 0.9;
        }

        .login-body {
          padding: 2rem;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #4a5568;
          margin-bottom: 0.5rem;
        }

        .form-label.required::after {
          content: '*';
          color: #e74c3c;
          margin-left: 4px;
        }

        .form-control {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .form-control:focus {
          outline: none;
          border-color: #00a3b5;
          box-shadow: 0 0 0 3px rgba(0, 163, 181, 0.1);
        }

        .form-control:disabled {
          background-color: #f7fafc;
          color: #a0aec0;
        }

        .login-btn {
          width: 100%;
          padding: 0.75rem;
          background: #00a3b5;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }

        .login-btn:hover:not(:disabled) {
          background: #008a9a;
        }

        .login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-links {
          display: flex;
          justify-content: center;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }
        
        .back-link {
          color: #00a3b5;
          font-size: 0.8rem;
          cursor: pointer;
          font-weight: 500;
        }
        
        .back-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .login-body {
            padding: 1.5rem;
          }
          
          .login-header {
            padding: 1rem;
          }
          
          .login-logo-section {
            padding: 1.5rem 1.5rem 0.5rem 1.5rem;
          }
          
          .login-logo-image {
            max-width: 100px;
          }
        }
      `}</style>
    </div>
  );
};

export default CreateAccount;