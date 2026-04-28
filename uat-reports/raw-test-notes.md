# UAT Test Notes - Teller Management System

## Test Date: April 28, 2026

## 1. Login Page
- URL: https://3000-iwtilow9goqntpy5e2xd6-5f0c80da.sg1.manus.computer
- Login page loads correctly with dark navy/gold theme
- "Sign In to Continue" button redirects to Manus OAuth
- OAuth flow works - signed in as saleellzy
- Screenshot: 01-login-page.png

## 2. Dashboard (SCR-DASH-001)
- Greeting: "Good morning, saleellzy" with date "Tuesday, April 28, 2026"
- Day Status: CLOSED (red text)
- Pending Approvals: 0
- Today Transactions: 0
- Posted: 0
- Pending Approvals section: "No pending approvals"
- Recent Transactions section: "No transactions today"
- Quick Actions: Cash Deposit, Cash Withdrawal, Fund Transfer, New Customer
- Open Day (BOD) button visible in top-right
- Screen ID badge: SCR-DASH-001 visible
- Sidebar: Teller Dashboard, Transactions (expanded), Accounting, Customer 360, AP/AR, Reports, AI Assistant
- AI Assistant link in top-right header
- Notification bell icon in top-right
- OBSERVATIONS:
  - Sidebar text is truncated (e.g., "Cash De...", "Cash Wi...", "Cheque O...", "Fund Tran...", "Demand D...", "FX Trans...", "Transactio...ersal")
  - Sidebar items overlap with index numbers in collapsed state
  - No cash position widget visible on dashboard (mentioned in spec)
  - No maker-checker queue widget visible (mentioned in spec)
  - Administration module not visible in sidebar (mentioned in spec as 6 screens)
  - Notifications module not visible as separate sidebar item

## 3. Dashboard - BOD Test
- Clicked "Open Day (BOD)" button
- Toast notification appeared: "Business day opened successfully" (green)
- BUG: Day Status still shows "CLOSED" even after successful BOD - should update to "OPEN"
- BOD button still shows "Open Day (BOD)" - should change to "Close Day (EOD)" after opening
- AI Assistant link and notification bell visible in top-right header area
- Sidebar text truncation issue confirmed - sidebar is too narrow for menu text

## Issues Found So Far:
1. [BUG-001] Day Status remains "CLOSED" after successful BOD operation
2. [BUG-002] BOD button doesn't toggle to EOD after day is opened
3. [UI-001] Sidebar menu text is truncated - items like "Cash De...", "Cheque O...", "Transactio...ersal"
4. [UI-002] No cash position widget on dashboard (mentioned in spec)
5. [UI-003] No maker-checker queue widget on dashboard (mentioned in spec)
6. [MISS-001] Administration module (6 screens) not visible in sidebar
7. [MISS-002] Notifications not visible as separate sidebar module

## 4. Cash Deposit (SCR-TXN-CASH-DEP)
- Screen loads with fields: Amount*, Currency (dropdown), Customer ID (optional), Description/Narration
- Currency defaults to "USD — US Dollar"
- Maker-checker note: "Transactions >= 10,000 require maker-checker approval"
- Post Transaction (F9) button present
- TEST: Entered 5000 amount, narration "UAT Test Deposit"
- RESULT: Transaction posted successfully - Voucher: VCH7352436436
- Toast: "Transaction posted successfully Voucher: VCH7352436436"
- Confirmation panel at bottom: "Transaction Posted" with Voucher number and "POSTED" badge
- Form resets after posting (amount back to 0.00)
- OBSERVATIONS:
  - [UI-004] No account number field - banking deposits typically require an account number
  - [UI-005] No denomination breakdown for cash deposits
  - [UI-006] Form uses inline drawer as specified (good)
  - [UI-007] Notification bell shows "1" badge after transaction (good)
  - Sidebar collapsed state still truncates text

## 5. Cash Withdrawal (SCR-TXN-CASH-WDL)
- Screen ID: SCR-TXN-CASH-WDL
- Same layout as Cash Deposit: Amount*, Currency, Customer ID (optional), Description/Narration
- Post Transaction (F9) button present
- OBSERVATION: Identical form structure to Cash Deposit - no differentiation for withdrawal-specific fields
- [UI-008] No account number/balance check for withdrawal
- [UI-009] No withdrawal limit validation visible

## 6. Cheque Operations (SCR-TXN-CHQ-DEP)
- Same generic form: Amount*, Currency, Customer ID, Description/Narration
- [BUG-003] Missing cheque-specific fields: cheque number, bank name, branch, date, payee name
- [UI-010] Form is identical to Cash Deposit - no differentiation for cheque operations

## 7. Fund Transfer (SCR-TXN-FT-001)
- Same generic form layout
- [BUG-004] Missing fund transfer fields: From Account, To Account, Beneficiary details
- [UI-011] No source/destination account fields for fund transfer

## 8. Demand Draft (SCR-TXN-DD-001)
- Same generic form layout
- [BUG-005] Missing DD-specific fields: Payee name, Payable at (city), DD number, Issuing bank
- [UI-012] Form identical to Cash Deposit

## 9. FX Transaction (SCR-TXN-FX-001)
- Same generic form layout
- [BUG-006] Missing FX-specific fields: Buy/Sell currency pair, Exchange rate, Settlement amount, Value date
- [UI-013] Only one currency selector - FX needs source and target currencies

## 10. Transaction Reversal (SCR-TXN-REV-001)
- Same generic form layout
- [BUG-007] Missing reversal-specific fields: Original voucher number, Reason for reversal, Approval reference
- [UI-014] Should lookup original transaction to reverse, not create new entry

## CRITICAL FINDING - ALL TRANSACTION SCREENS:
- [BUG-008] ALL 7 transaction screens share the EXACT SAME form template (Amount, Currency, Customer ID, Description)
- Each transaction type should have unique fields specific to its operation
- This is a major functional gap - forms are generic placeholders, not banking-grade transaction screens

## 11. Chart of Accounts (SCR-COA-001)
- Screen loads with table: Code, Name, Type, Normal Balance, Level, Status, Actions
- Search bar and "New Account" button present
- Table is empty - no pre-seeded chart of accounts
- New Account drawer opens on right side (inline drawer - good)
- Fields: Account Code*, Level (number), Account Name*, Account Type (ASSET dropdown), Normal Balance (DEBIT dropdown), Effective Date
- Sidebar now fully visible with text not truncated (sidebar expanded when drawer opened)
- Footer shows keyboard shortcuts: Alt+F1 SP Inspector, Alt+F2 Architecture, Alt+F3 Audit Trail, F9 Post
- OBSERVATIONS:
  - [UI-015] Table is empty - no default/seed data for Chart of Accounts (banking system should have standard CoA)
  - [UI-016] "Actions" column header visible but no action buttons since table is empty
  - [UI-017] New Account drawer partially overlaps with table area - layout could be improved
  - [GOOD] Sidebar text fully visible when expanded: "Chart of Accounts", "Cost Centers", "GL Posting Rules", "General Ledger"
  - [GOOD] Inline drawer for data entry as per spec

## 12. Cost Centers (SCR-CC-001)
- Table columns: Code, Name, Description, Status, Actions
- "New Cost Center" button present
- Table empty - no seed data
- [UI-018] No search bar on Cost Centers (unlike CoA which has one)

## 13. GL Posting Rules (SCR-GLR-001)
- Table columns: Transaction Type, Rule Name, Debit Account, Credit Account, Status, Actions
- "New Rule" button present
- Table empty - no default GL posting rules configured
- [BUG-009] No pre-configured GL posting rules for standard transaction types (deposit, withdrawal, etc.)

## 14. General Ledger (SCR-GL-001)
- Filter fields: From Date, To Date, Account (dropdown: "All Accounts")
- Summary cards: Total Debit (0.00), Total Credit (0.00), Net Balance (0.00)
- Table columns: Date, Voucher, Account, Description, Debit, Credit, Currency
- Table empty despite having posted a Cash Deposit transaction earlier
- [BUG-010] General Ledger shows no entries even though a Cash Deposit (VCH7352436436) was posted - GL entries not being created from transactions
- [BUG-011] "Date" column header partially hidden behind sidebar

## 15. Customer Master (SCR-CRM-CUST-001)
- Table columns: Code, Name, Phone, Email, KYC, Risk, Segment, Actions
- Search bar and "New Customer" button present
- New Customer drawer has comprehensive fields: First Name*, Middle Name, Last Name, Email, Phone, Date of Birth, Gender, KYC Status, Risk Rating, Segment, PAN, Address, City, State, Country
- [GOOD] Customer form is well-designed with proper KYC/AML fields
- [UI-019] Escape key does NOT close the drawer - drawer stays open
- [UI-020] No "Gen AI" button for auto-populating test data (per user requirements)
- Table empty - no seed data

## 16. Accounts (CRM > Accounts)
- [BUG-012] Navigating to /crm/accounts shows Customer Master screen (SCR-CRM-CUST-001) instead of a separate Accounts screen
- The "Accounts" menu item appears to be a duplicate/alias of Customer Master
- Spec mentions "360 view" as one of the 3 screens - this should be a separate account/360 view screen

## 17. Leads & Opportunities (SCR-CRM-LEAD-001)
- Table columns: Code, Type, Amount, Status, Notes, Actions
- "New Lead" button present
- Table empty - no seed data
- [UI-021] No search bar on Leads & Opportunities screen
- [UI-022] "Leads & O..." truncated in sidebar

## 18. Vendor Master (SCR-APAR-VEN-001)
- Table columns: Code, Name, Contact, Email, Phone, Payment Terms, Status, Actions
- "New Vendor" button present
- Table empty - no seed data
- [UI-023] No search bar on Vendor Master

## 19. Bills & Invoices (SCR-APAR-BILL-001)
- Table columns: Bill #, Type, Vendor, Date, Due Date, Amount, Paid, Status, Actions
- "New Bill" button present
- Table empty - no seed data

## 20. Payments (SCR-APAR-PAY-001)
- Table columns: Payment #, Bill, Date, Amount, Method, Reference, Status
- "Record Payment" button present
- Table empty
- [UI-024] No "Actions" column on Payments table (unlike other tables)
- [GOOD] Sidebar fully visible when expanded showing all AP/AR sub-items

## 21. Aging Report (SCR-APAR-AGE-001)
- Summary cards: Days Current (0.00, 0 bills), Days 1-30, Days 31-60, Days 61-90, Days 90+
- Table columns: Bill #, Due Date, Days Overdue, Amount, Paid, Outstanding, Bucket
- [GOOD] Well-structured aging buckets with color-coded amounts (orange/red)
- Table empty - no data to display

## 22. Trial Balance (SCR-RPT-TB-001)
- Date filters: From Date (31-03-2026), To Date (28-04-2026)
- "Export CSV" button present
- "No data for selected period" message
- [BUG-013] Trial Balance shows no data despite having posted a Cash Deposit transaction

## 23. Profit and Loss (SCR-RPT-PNL-001)
- Same layout as Trial Balance: date filters + Export CSV
- "No data for selected period"
- [BUG-014] P&L shows no data despite posted transactions

## 24. Balance Sheet (SCR-RPT-BS-001)
- Same layout: date filters + Export CSV
- "No data for selected period"
- [BUG-015] Balance Sheet shows no data

## 25. General Ledger (Reports section)
- Same as Accounting > General Ledger - appears to be duplicate
- [UI-025] General Ledger appears in both Accounting and Reports sections - should be consolidated

## 26. Cash Position (SCR-RPT-CASH-001)
- Summary cards: Total Deposits (5,000.00), Total Withdrawals (0.00), Net Cash Position (5,000.00)
- Table shows: VCH7352436436, CASH DEPOSIT, 4/28/2026, 5,000, USD, POSTED
- [GOOD] Cash Position correctly reflects the posted deposit transaction
- [BUG-016] "Voucher" column text partially hidden behind sidebar (starts with "CH7352436436" - missing "V")

## 27. FX Position (SCR-RPT-FX-001)
- Table columns: From, To, Rate, Type, Date
- "No FX rates for today. Add rates in Admin → FX Rate Sheet."
- [GOOD] Helpful message directing user to configure FX rates in Admin

## 28. Teller Blotter (SCR-RPT-BLOT-001)
- Date filters: From/To
- Summary cards: Total Transactions (0), Total Deposits (0.00), Total Withdrawals (0.00)
- Table columns: Voucher, Type, Date, Amount, Currency, Status, Approval
- [BUG-017] Teller Blotter shows 0 transactions despite having posted a Cash Deposit
- [BUG-018] "Total Tra..." text truncated in summary card header (should be "Total Transactions")
- Export button present

## 29. Audit Register (SCR-RPT-AUD-001)
- [BUG-019] Sidebar link for "Audit Register" navigates to /reports/audit-register which returns 404
- Correct URL is /reports/audit - route mismatch
- Table columns: Timestamp, User, Role, Screen, Action, Entity, Status, Elapsed
- "No audit logs found"
- [BUG-020] No audit logs recorded despite multiple actions (login, BOD, transaction posting)
- [UI-026] No date filter on Audit Register (unlike other reports)
- [UI-027] No Export button on Audit Register

## 30. Administration Module
- [CRITICAL-001] Administration module is COMPLETELY MISSING from the sidebar navigation
- Spec lists 6 screens: User/Role management, Branch/Currency master, FX Rate Sheet, System Parameters
- Tried /admin and /administration URLs - both return 404
- The sidebar only shows: Teller Dashboard, Transactions, Accounting, Customer 360, AP/AR, Reports, AI Assistant
- No Administration section visible even after scrolling sidebar
- This means RBAC admin-only sections mentioned in spec are not accessible
- FX Rate Sheet referenced in FX Position report ("Add rates in Admin → FX Rate Sheet") is unreachable

## Dashboard Revisit Observations:
- Today Transactions now shows "1" and Posted shows "1" (correctly updated after deposit)
- Recent Transactions shows VCH7352436436 CASH DEPOSIT USD 5,000 POSTED (correct)
- Day Status still shows "CLOSED" despite earlier BOD success message
- [BUG-001 CONFIRMED] Day Status not updating after BOD
- [GOOD] Dashboard correctly reflects transaction count and recent transactions

## 31. AI Financial Assistant (SCR-AI-001)
- Header: "AI Financial Assistant" with "Powered by Azure OpenAI GPT-4o" subtitle
- Status indicator: "Online" (green badge)
- Chat interface with message input and send button
- 4 quick-prompt buttons: "Summarize today's cash position across all branches", "Are there any unusual transaction patterns in the last 7 days?", "What is the current trial balance for asset accounts?", "Explain the pending maker-checker approvals"
- TEST: Clicked "Summarize today's cash position across all branches"
- User message appears with timestamp 10:40:52 AM
- [BUG-021] AI responds: "AI assistant is temporarily unavailable. Please try again later." at 10:40:53 AM
- Status shows "Online" but AI is not functional
- [BUG-022] Status indicator contradicts actual availability - shows "Online" when service is down
- [GOOD] Chat UI is well-designed with user/bot message bubbles and timestamps

## 32. Notifications (SCR-NOTIF-001)
- Header: "Notifications (1 unread)" with "Mark All Read" button
- Notification entry: "Business Day Opened" with "NEW" badge, "Branch 1 business day opened successfully.", timestamp "4/28/2026, 10:29:21 AM", role "TELLER"
- [GOOD] Notifications working - BOD action created a notification
- [BUG-023] Only BOD notification present - Cash Deposit transaction did not generate a notification
- [UI-028] Notification bell badge shows "1" correctly
- [GOOD] Mark All Read button available

## 33. Cross-Cutting Concerns

### Keyboard Shortcuts
- Alt+F1 (SP Inspector): WORKS - Shows toast "SP Inspector / Alt+F1: Stored Procedure Inspector" in top-right
- Alt+F2 (Architecture): WORKS - Shows toast "Architecture Diagram / Alt+F2: System Architecture"
- Alt+F3 (Audit Trail): WORKS - Shows toast "Audit Trail / Alt+F3: Audit Trail Viewer"
- F9 (Post): No visible effect on dashboard (expected - only works on transaction screens)
- [GOOD] All keyboard shortcuts are functional and show informative toasts

### Input Validation
- Negative amount (-500): BLOCKED with toast "Please enter a valid amount" (red)
- Zero amount (0): BLOCKED with toast "Please enter a valid amount" (red)
- [GOOD] Basic amount validation works correctly

### Sidebar Navigation
- [UI-029] Sidebar text truncation: "Cash De...", "Cash Wi...", "Cheque O...", "Fund Tran...", "Demand D...", "FX Trans...", "Transactio...ersal"
- Sidebar is collapsible (collapse button visible at bottom)
- [UI-030] When sidebar is collapsed, text is still partially visible and truncated - should show only icons
- [UI-031] User profile at bottom: "S saleellzy User" with settings icon

### Footer
- "Teller Pro v1.0 — Enterprise Core Banking System"
- Keyboard shortcut labels: Alt+F1, SP Inspector, Alt+F2, Architecture, Alt+F3, Audit Trail, F9, Post
- [GOOD] Footer consistently visible across all screens

### Auth/Session
- OAuth login works correctly
- User identified as "saleellzy" with "User" role
- [BUG-024] No logout button visible anywhere in the UI
- [BUG-025] User role shows "User" not "Admin" - Administration module may be hidden due to RBAC but this isn't communicated

### Screen IDs
- [GOOD] Every screen has a unique Screen ID badge (e.g., SCR-DASH-001, SCR-TXN-CASH-DEP, etc.)
- Screen IDs are consistently positioned next to the page title

### Toast Notifications
- [GOOD] Toast notifications appear in top-right corner
- [UI-032] Multiple toasts can stack up and overlap with header elements
- Toasts auto-dismiss after a few seconds
