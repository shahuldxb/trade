# UAT Round 3 - Test Notes
## Date: April 29, 2026

## INITIAL OBSERVATIONS - NEW SIDEBAR ITEMS DETECTED:
The sidebar now shows NEW items not present in Round 2:
- Branch Vault (NEW)
- Cash Requests (NEW)
- High-Value Approvals (NEW)
- EOD Supervisor Reviews (NEW)

These appear to be Chief Teller / Branch Manager specific screens. Major additions.

## PHASE 1: Bug Verification

### Teller Workstation Sign-On: SUCCESS
- Toast: "Drawer signed on" (green)
- New buttons visible: Request Cash, Return Cash, Lunch Sign-off, Sign Off (EOD)
- "Lunch Sign-off" is a NEW feature not seen in Round 2
- Drawer bar shows: DRW-001, Opening $10,000.00, Cash In +$0.00, Cash Out -$0.00, Expected $10,000.00, Vouchers 0

### NEW Sidebar Items (Chief Teller / Supervisor screens):
- Branch Vault
- Cash Requests
- High-Value Approvals
- EOD Supervisor Reviews

Now verifying previous bugs...

### BUG-NEW-04 (Audit Register 404): ✅ FIXED
Audit Register now loads at /reports/audit-register. Shows real audit data with columns: Timestamp, User, Role, Screen, Action, Entity, Status, Elapsed. Has date filters, search, CSV/Excel export. Shows 1 log entry from previous test (INSERT TRANSACTION 30001 by Administrator).

### BUG-NEW-05 (System Parameters 404): ✅ FIXED
System Parameters now loads at /admin/system-params. Shows 8 parameters with excellent banking-specific config:
- BASE_CURRENCY: USD
- EOD_CUTOFF_TIME: 17:00
- FX_RATE_TOLERANCE: 0.05
- MAKER_CHECKER_THRESHOLD: 10000
- MAX_LOGIN_ATTEMPTS: 5
- SESSION_TIMEOUT_MINUTES: 30
- TRANSACTION_LIMIT_SUPERVISOR: 500000
- TRANSACTION_LIMIT_TELLER: 50000
"New Parameter" button available. Edit actions on each row.

### BUG-NEW-09 (Disjointed Drawer Tracking): ✅ FIXED
Dashboard now shows $10,000.00 opening balance (same as Teller Workstation). Previously showed $100,000 vs $10,000 mismatch. Cash drawers are now synchronized.

### Dashboard Observations:
- Day Status: CLOSED (new day, not yet opened)
- Recent Transactions: Shows 2 past transactions (VCH7375216888 $7,500 and VCH7352436436 $5,000)
- Opening Balance: $10,000.00 (matches Teller Workstation)

### BUG-010 (GL Entries): Checking with date range...
GL shows Total Debit 0.00, Total Credit 0.00 for today. Need to post a new transaction and check.

### BOD: ✅ WORKING
Day Status changed to OPEN (green). Toast: "Business day opened (BOD posted)". BOD timestamp shown: "BOD opened at 11:36:57 AM". Close Day (EOD) button now visible.

Now posting a test transaction to verify GL entries...

### Cash Deposit Form: SIGNIFICANTLY IMPROVED
Now includes: Beneficiary Account Number, Customer (optional), Depositor Name, Depositor ID/Passport, full Denomination Breakdown ($100/$50/$20/$10/$5/$1), Cash count total, Amount, Currency, Narration. Note at bottom: "Transactions >= 10,000 require maker-checker approval. Posts via stored procedure with auto GL entries." This is a MAJOR improvement - suggests GL entries are now being auto-generated.

### Transaction Posted Successfully
Toast: "Cash deposit posted Voucher: TLR0020-20260429-0001". Form cleared after posting. Voucher number format improved (TLR0020-20260429-0001 = Teller-BranchCode-Date-Sequence). Now checking GL for auto-generated entries.

### BUG-010 (GL Entries Not Generated): ❌ STILL PRESENT
Despite the form now saying "Posts via stored procedure with auto GL entries", the General Ledger still shows Total Debit 0.00, Total Credit 0.00 with empty table after posting a $3,000 deposit. The GL auto-posting is claimed but not working.

### Trial Balance: NOW HAS DATA (Partial Fix)
Trial Balance shows 2 accounts with balances:
- 11200 Cash in Teller Drawer (ASSET/DEBIT): Debit $7,500, Credit $0, Balance $7,500
- 21100 Savings Accounts (LIABILITY/CREDIT): Debit $0, Credit $7,500, Balance -$7,500

ISSUE: The $7,500 is from a PREVIOUS transaction (not the $3,000 just posted). The new $3,000 deposit did NOT generate GL entries. Also the Trial Balance shows raw database columns (id, isControlAccount, parentAccountId, etc.) instead of a clean formatted report.

### BUG-010 UPDATE: PARTIALLY FIXED - Previous transactions generated GL entries, but the latest $3,000 deposit did NOT. The GL auto-posting may be intermittent or broken for new transactions.

### NEW BUG: Trial Balance shows raw database columns instead of formatted report. Columns like "isControlAccount", "parentAccountId", "accountLevel", "effectiveDate", "version", "createdAt", "updatedAt" should not be visible to end users.

### BUG-014 (Accounts View Shows Customer Master): ✅ FIXED
Customer Accounts page now shows a dedicated accounts list with: Account #, Customer, Type (SAVINGS/CURRENT/LOAN/DEPOSIT/FX), Currency, Balance, Status, Opened date, and "View 360" links. 10 accounts displayed with proper data. Excellent improvement.

Now testing new Chief Teller screens...

### BUG-NEW-09 (Drawer Sync): ✅ FIXED
Teller Workstation now shows: Opening $10,000, Cash In +$3,000, Cash Out -$0.00, Expected $13,000, Vouchers 1. The $3,000 deposit posted from the Transactions screen is reflected here. Drawers are synchronized.

### Teller Workstation Deep Test:
- Drawer bar: Excellent real-time summary
- Customer Lookup (F2): Present with search field
- Tabs: Deposit, Withdrawal, Cheque, Transfer
- Keyboard shortcuts panel: F2, F3/Esc, F4, F10, Ctrl+E, Ctrl+F
- Buttons: Request Cash, Return Cash, Lunch Sign-off, Sign Off (EOD)
- Warning: "Select a customer first. Press F2 to search." - good validation

### Customer Lookup (F2): ✅ WORKING
Typing "John" shows dropdown with: John Smith (C00003, +1-555-0123) and Sarah Johnson (C00004, +1-555-0145). Selecting John Smith loads the customer and the warning message disappears. Amount field becomes active. "Post Transaction (F10)" button now visible.

ISSUE: After selecting customer, the customer name/details are NOT displayed anywhere on the transaction form. A teller needs to see which customer is selected (name, account number) prominently before posting.

### Dashboard Re-check After Transaction:
Dashboard now shows: Opening $10,000, Cash In +$3,000, Expected Closing $13,000. Today's Transactions: 1, Posted Today: 1. Recent Transactions shows TLR0020-20260429-0001 (USD 3,000 CASH DEPOSIT POSTED) plus 2 older ones. 

ISSUE: Day Status shows CLOSED but also says "EOD closed at 11:37:42 AM" - this is confusing because we just opened BOD at 11:36:57 AM. It seems the EOD was auto-triggered or the status is stale. The "Open Day (BOD)" button is still visible, suggesting the day was closed again.

Now testing Branch Vault sidebar link...

### Branch Vault — Chief Teller: ✅ NEW SCREEN WORKING
Route: /chief/vault. Shows: Vault Balance AED 0.00, Status CLOSED, "Not opened today". Quick Actions: Open vault (BOD count), Receive cash from HQ/CIT, Close vault (EOD count). Last Denomination Snapshot: "No denomination snapshot yet." Movements table: "No vault movements yet today."

ISSUE: Vault currency is AED but teller drawer is in USD. Currency mismatch between vault and teller drawer. In a real branch, the vault should be in the same base currency or support multi-currency.

### Cash Drawer Requests: ✅ NEW SCREEN WORKING
Route: /chief/requests. Shows Pending tab with 1 request: LOAD AED 888,000.00 from Teller session #60002 (requested 4/29/2026 11:32:05 AM). Approve/Reject buttons visible. History tab available. Vault balance shown as AED 0.00.

ISSUE: The markdown says "Pending 0" and "No pending cash drawer requests" but the screenshot shows 1 pending request for AED 888,000. Data inconsistency between what the API returns and what's displayed.

### High-Value Approvals — Branch Operations Manager: ✅ NEW SCREEN WORKING
Route: /bom/approvals. Title: "High-Value Approvals — Branch Operations Manager". Threshold: AED 200,000. Shows "All clear - No high-value transactions are awaiting your approval." Sidebar now fully expanded with all text visible. Notification bell shows badge with count (4).

EXCELLENT: The sidebar now shows full text labels without truncation. All menu items visible: Teller Workstation, End of Day, Teller Dashboard, Branch Vault, Cash Requests, High-Value Approvals, EOD Supervisor Reviews, plus all module groups.

### EOD Supervisor Reviews (Supervisor Counter-Sign): ✅ NEW SCREEN WORKING
Route: /admin/supervisor-reviews. Title: "Supervisor Counter-Sign". Description: "Review drawer sign-offs submitted by tellers. Approving moves the drawer to CLOSED; rejecting returns it to the teller for correction." Shows "No drawers awaiting counter-sign."

### BUG-NEW-06 (AI Hallucination): PARTIALLY FIXED - Now Different Issue
AI responds: "I can only answer from Teller Pro's live database. That information is not available." Status shows "Online (azure)". It no longer hallucinating fake data, but it also cannot query the actual database. The Trial Balance has real data (11200 Cash in Teller Drawer $7,500 and 21100 Savings Accounts $7,500) but AI says "not available." The AI is grounded (no hallucination) but the database query integration is broken.

### Teller Academy (NEW MODULE): ✅ IMPRESSIVE
Built-in LMS with 6 courses across 3 tracks: Beginner (B-101 Welcome, B-102 First Deposit), Intermediate (I-201 Cheques/Transfers/Drafts, I-202 EOD Reconciliation), Experienced (E-301 Accounting CoA/GL, E-302 Administration/Security). Each course has duration, progress tracking, "View syllabus" links. "Replay the Teller Pro tour" button. Sub-menu: Courses, My Certificates, Team Learning.

ISSUE: All courses show "0/0 lessons" and 0% progress. The lesson content may not be populated yet.

### Footer Bar: Now visible with keyboard shortcuts: Alt+F1 (SP Inspector), Alt+F2 (Architecture), Alt+F3 (Audit Trl), F9 (Post). Username "saleellzy" and "Admin" role shown in bottom-left. "Teller Pro v1.0 — Enterprise Core Banking System" branding.

### BUG-NEW-04 (Audit Register 404): ✅ FIXED
Audit Register now loads at /reports/audit-register. Shows 2 log entries with proper columns: Timestamp, User, Role, Screen, Action, Entity, Status, Elapsed. Has date range filter, search, CSV/Excel export. Both entries show INSERT TRANSACTION with SUCCESS status.

ISSUE: "Elapsed" column shows "ms" without actual timing values. Should show actual elapsed time (e.g., "125 ms").
ISSUE: Only INSERT actions logged. No audit trail for BOD, login, page views, or other operations. Audit register should capture all significant actions.

### P&L Report: Shows "No data for selected period" with helpful message "Post some transactions to see income and expense entries here." Has CSV/Excel/PDF export buttons. This is acceptable since deposits don't generate income/expense entries.

### BUG-NEW-05 (System Parameters 404): ✅ FIXED
System Parameters now loads with 8 configurable parameters: BASE_CURRENCY (USD), EOD_CUTOFF_TIME (17:00), FX_RATE_TOLERANCE (0.05), MAKER_CHECKER_THRESHOLD (10000), MAX_LOGIN_ATTEMPTS (5), SESSION_TIMEOUT_MINUTES (30), TRANSACTION_LIMIT_SUPERVISOR (500000), TRANSACTION_LIMIT_TELLER (50000). "New Parameter" button available. Edit actions visible.

ISSUE: System Parameters is NOT listed in the Administration sidebar sub-menu. The sidebar shows: User Management, Roles & Permissions, Branch Master, Currency Master, FX Rate Sheet — but NOT System Parameters. Users can only reach it via direct URL.

### Balance Sheet Report: ✅ EXCELLENT
Properly formatted with 3 columns: Assets, Liabilities, Equity. Shows: Assets (11200 Cash in Teller Drawer $7,500) = Liabilities (21100 Savings Accounts $7,500). Variance USD 0.00. Total Assets = Total Liab + Equity. Export CSV button. "As of 2026-04-29" date stamp. This is a properly balanced balance sheet.

ISSUE: Only CSV export available. P&L has CSV/Excel/PDF but Balance Sheet only has CSV. Should be consistent.
ISSUE: The $3,000 deposit posted today is not reflected (still shows $7,500 from yesterday). Confirms GL auto-posting for new transactions is broken.

### Teller Blotter Report: ISSUE
Shows Total Transactions 0, Total Deposits 0.00, Total Withdrawals 0.00 for today (4/29/2026). But we posted a $3,000 deposit today (TLR0020-20260429-0001). The blotter should show this transaction. The dashboard shows it, the Teller Workstation shows it, but the Teller Blotter report does not. This is a data integration issue between the transaction table and the blotter report query.

### End of Day Screen:
Route: /teller/eod. Tested in Round 2 - shows EOD checklist with denomination count, reconciliation, and supervisor sign-off workflow.

### Dashboard Day Status Issue:
Dashboard shows "CLOSED" and "EOD closed at 11:37:42 AM" but BOD was opened at 11:36:57 AM. The day was auto-closed within 45 seconds of opening. This suggests an automatic EOD process ran or there's a timing bug. A BOM would find this extremely concerning - the day should stay OPEN until manually closed.

### VALIDATION TESTS:

**Negative Amount (-500):** ✅ FIXED - Toast notification "Enter a valid amount" appears. Transaction blocked. Previously this was not validated.

Now test zero amount and empty account number...

**Zero Amount (0):** ✅ FIXED - Toast "Enter a valid amount" appears. Transaction blocked.

**Empty Account Number:** The form accepted the previous deposit without account number. Need to check if account number validation is enforced. The form shows "Beneficiary Account Number *" with asterisk indicating required, but we successfully posted earlier without it.

### MAKER-CHECKER THRESHOLD TEST:
System Parameters show MAKER_CHECKER_THRESHOLD = 10000. The deposit form states "Transactions >= 10,000 require maker-checker approval." Need to test if a $15,000 deposit triggers maker-checker workflow.

### DENOMINATION MISMATCH:
The denomination breakdown shows "Cash count total $0" but the Amount field can be filled independently. There's no validation that denomination total matches the amount. In a real bank, this would be a compliance issue.

### Cash Position Report: ✅ EXCELLENT
Shows Total Deposits $15,500, Total Withdrawals $0, Net Cash Position $15,500. Lists all 3 transactions with voucher numbers, types, dates, amounts, currencies, and POSTED status. Includes today's $3,000 deposit (TLR0020-20260429-0001).

ISSUE: No export buttons (CSV/Excel/PDF) on Cash Position report. Other reports have them.
ISSUE: No date range filter on Cash Position report. Shows all-time data.

### DATA CONSISTENCY CHECK:
- Cash Position shows $15,500 total (3 deposits: $5,000 + $7,500 + $3,000)
- Balance Sheet shows $7,500 (only 2 deposits from yesterday)
- Trial Balance showed $7,500 earlier
- Dashboard showed $10,000 drawer
- Teller Workstation showed $13,000 drawer
This means there are 4 different cash figures across 4 screens. This is a CRITICAL data integrity issue for a banking application.

### FX Position Report: Acceptable
Shows "No FX rates for today. Add rates in Admin -> FX Rate Sheet." This is acceptable since no FX rates have been configured. Good empty state message with guidance.

ISSUE: No export buttons on FX Position report.

### SIDEBAR OBSERVATIONS (Cross-cutting):
- Sidebar text is now visible when expanded
- All modules accessible: Teller Workstation, End of Day, Teller Dashboard, Branch Vault, Cash Requests, High-Value Approvals, EOD Supervisor Reviews, Transactions (7), Accounting (4), Customer 360 (3), AP/AR (4), Reports (7), Teller Academy (3), Administration (5+)
- ISSUE: Reports sidebar shows only 7 items (Trial Balance, P&L, Balance Sheet, Cash Position, FX Position, Teller Blotter, Audit Register). The GL Report is missing from Reports menu - it's under Accounting > General Ledger instead.
- ISSUE: System Parameters not in Administration sidebar menu

### NOTIFICATION BADGE:
Shows "4" notification count. Consistent across all pages.

