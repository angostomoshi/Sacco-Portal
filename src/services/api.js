// API service to handle all backend communications
const API_BASE_URL = process.env.REACT_APP_API_URL || '';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Generic fetch method with error handling
  async fetch(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    };

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    };

    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      mergedOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, mergedOptions);
      const data = await response.json();
      
      return {
        ok: response.ok,
        status: response.status,
        data: data,
        headers: response.headers,
      };
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Authentication endpoints
  async authenticate(memberNo, password) {
    return this.fetch('/api/v1/auth/authenticate', {
      method: 'POST',
      body: JSON.stringify({ memberNo, password }),
    });
  }

  async createAccount(userData) {
    return this.fetch('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async forgotPassword(emailOrMemberNo) {
    return this.fetch('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier: emailOrMemberNo }),
    });
  }

  async resetPassword(token, newPassword) {
    return this.fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }

  async logout() {
    return this.fetch('/api/v1/auth/logout', {
      method: 'POST',
    });
  }

  // User endpoints
  async getUserProfile() {
    return this.fetch('/api/v1/user/profile');
  }

  async updateUserProfile(userData) {
    return this.fetch('/api/v1/user/profile', {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  // Account endpoints
  async getAccountSummary() {
    return this.fetch('/api/v1/account/summary');
  }

  async getTransactions(page = 1, limit = 10) {
    return this.fetch(`/api/v1/account/transactions?page=${page}&limit=${limit}`);
  }

  async getSavingsBalance() {
    return this.fetch('/api/v1/account/savings');
  }

  async getLoanBalance() {
    return this.fetch('/api/v1/account/loans');
  }

  // Loan endpoints
  async applyLoan(loanData) {
    return this.fetch('/api/v1/loans/apply', {
      method: 'POST',
      body: JSON.stringify(loanData),
    });
  }

  async getLoanStatus(loanId) {
    return this.fetch(`/api/v1/loans/${loanId}/status`);
  }

  async getLoanHistory() {
    return this.fetch('/api/v1/loans/history');
  }

  // Payment endpoints
  async makePayment(paymentData) {
    return this.fetch('/api/v1/payments/make', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  async getPaymentHistory() {
    return this.fetch('/api/v1/payments/history');
  }

  // Statement endpoints
  async getStatement(period = 'monthly') {
    return this.fetch(`/api/v1/statements/${period}`);
  }

  async downloadStatement(format = 'pdf', period = 'monthly') {
    return this.fetch(`/api/v1/statements/download?format=${format}&period=${period}`, {
      headers: {
        'Accept': format === 'pdf' ? 'application/pdf' : 'application/json',
      },
    });
  }
}

export default new ApiService();
