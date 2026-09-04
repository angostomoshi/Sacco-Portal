# Metropolitan Hospital Sacco Member Portal Walkthrough

Prepared for shareholder and stakeholder demonstration.

This walkthrough shows how a member uses the web portal to view account information, review reports, apply for services, and make Sacco payments through M-Pesa. Screenshots were captured using member `MS041` for demonstration only. No payment, loan application, account creation, password change, or PDF download action was submitted while preparing these screenshots.

## 1. Secure Member Login

![Login screen](screenshots/01-login.png)

Members sign in using their member number and password. The portal then loads a personalized workspace with their balances, profile, statements, loans, and self-service actions.

## 2. Dashboard Overview

![Dashboard](screenshots/02-dashboard.png)

The dashboard is the member's main control center. It summarizes savings, share capital, dividend payable, and loan balances, while also giving quick access to loan applications, profile review, statements, guarantor details, and M-Pesa payments.

## 3. Member Profile

![Member profile](screenshots/03-member-profile.png)

The profile section lets the member confirm personal details such as name, member number, phone, email, and identification information. This is important because M-Pesa prompts, statements, and notifications depend on accurate member information.

## 4. Deposit Via M-Pesa

![Deposit via M-Pesa](screenshots/04-deposit-mpesa.png)

The M-Pesa payment screen lets a member choose the correct payment destination before initiating a transaction. The available destinations include savings deposits, withdrawable deposits, and loan repayment. The interface shows the reference to be used so money is posted to the right Sacco account after Safaricom confirms the callback.

## 5. Savings Statement

![Savings statement](screenshots/05-savings-statement.png)

The savings statement shows the latest savings transactions and running balance. It includes successful M-Pesa savings deposits once Daraja confirms the payment and the backend posts the transaction to the Sacco ledger.

## 6. Withdrawable Statement

![Withdrawable statement](screenshots/06-withdrawable-statement.png)

The withdrawable statement separates withdrawable deposits from member savings. This helps members and the Sacco avoid confusing long-term member savings with funds available under withdrawable deposit accounts.

## 7. Loan Statement

![Loan statement](screenshots/07-loan-statement.png)

The loan statement screen shows active loan facilities, principal, interest, monthly repayment, outstanding balance, and repayment options. Members can review their loan position before choosing to repay through M-Pesa.

## 8. Instant Loan Application

![Instant loan application](screenshots/08-apply-loan.png)

The instant loan screen allows eligible members to preview loan terms before submission. The system calculates expected deductions and repayment values so the member understands the obligation before applying.

## 9. Dividends

![Dividends](screenshots/09-dividends.png)

The dividends page shows dividend information for the member. It gives shareholders visibility into benefit distribution and helps members confirm dividend-related entries.

## 10. Guarantors

![Guarantors](screenshots/10-guarantors.png)

The guarantors page helps members view loans where they appear as guarantors. This improves transparency and helps members understand their guarantee exposure.

## 11. Share Capital

![Share capital](screenshots/11-share-capital.png)

The share capital report shows the member's ownership contribution. This is separate from savings and withdrawable deposits and supports shareholder reporting.

## 12. Account Creation

![Create account](screenshots/12-create-account.png)

The account creation flow supports member self-onboarding into the portal. The screenshot only shows the form screen; no new account was submitted.

## 13. Password Change

![Change password](screenshots/13-change-password.png)

Members can update their password through the portal. This supports self-service security without requiring manual office assistance. The screenshot only shows the form screen; no password change was submitted.

## M-Pesa Integration Summary

The portal uses M-Pesa C2B through Daraja STK Push for member payments. The member chooses the payment purpose, confirms the amount and phone number, then approves the prompt on their phone. Safaricom sends a callback to the Sacco backend. After a successful callback, the system marks the transaction successful, posts it to the correct ledger, stores the M-Pesa receipt number, and refreshes balances and statements for live reporting.

For financial safety, the app separates:

- Savings deposits using the member number reference.
- Withdrawable deposits using the withdrawable account reference.
- Loan repayments using the loan number reference.

This separation helps prevent payments from appearing in the wrong report or ledger.

## Shareholder Value

The portal improves member service by giving shareholders and members direct access to balances, statements, loan information, guarantor exposure, dividends, and digital payments. It reduces manual follow-up, improves transparency, and gives the Sacco a stronger digital foundation for future services such as B2C emergency disbursements.
