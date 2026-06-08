# PrioraScan Frontend Architecture

## 1. Frontend Goal

The PrioraScan frontend should allow technicians and advisors to quickly create diagnostic sessions, enter or upload scan data, view AI analysis, generate reports, and optionally send results to PrioraFlow.

The UI must be simple, fast, and workshop-friendly.

---

# 2. Recommended Stack

* Next.js
* TypeScript
* TailwindCSS
* shadcn/ui
* TanStack Query
* React Hook Form
* Zod
* Axios

---

# 3. App Routes

```text
/
├── login
├── dashboard
├── vehicles
│   ├── new
│   └── [id]
├── sessions
│   ├── new
│   └── [id]
├── fault-codes
├── reports
│   └── [id]
├── integrations
├── settings
└── admin
```

---

# 4. Sidebar Navigation

```text
Dashboard

Diagnostics
├── Sessions
├── New Scan
├── Fault Code Library

Vehicles
├── Vehicles

Reports
├── Reports

Integrations
├── PrioraFlow
├── Webhooks

Administration
├── Users
├── Settings
├── Subscription
```

---

# 5. Main Pages

## Login Page

Purpose:

Allow user to sign in.

Fields:

* Email
* Password

Actions:

* Login
* Forgot password

---

## Dashboard Page

Purpose:

Give quick overview.

Cards:

* Total scans
* Scans this month
* Open sessions
* Reports generated

Sections:

* Recent diagnostic sessions
* Recent vehicles
* Recent AI analyses

---

## Vehicles List Page

Purpose:

Manage vehicles.

Table columns:

* VIN
* Make
* Model
* Year
* Plate Number
* Last Scan Date
* Actions

Actions:

* View
* Create Vehicle
* Search

Filters:

* Make
* Model
* Plate
* VIN

---

## Vehicle Details Page

Purpose:

Show vehicle profile and history.

Sections:

* Vehicle information
* Diagnostic history
* Reports
* Attachments

Actions:

* Create new diagnostic session
* Edit vehicle
* View previous scan

---

## New Diagnostic Session Page

Purpose:

Start a new diagnostic scan session.

Steps:

```text
1. Select vehicle
2. Enter mileage
3. Add complaint/symptoms
4. Choose data source
5. Submit
```

Data source options:

* Manual fault code entry
* Upload scan report

---

## Session Details Page

Purpose:

Main working page for diagnosis.

Sections:

* Session summary
* Vehicle details
* Customer complaint
* Fault codes
* Uploaded reports
* AI analysis
* Recommended tests
* Reports

Actions:

* Add fault code
* Upload scan report
* Run AI analysis
* Generate report
* Send to PrioraFlow
* Close session

---

## Fault Code Library Page

Purpose:

Search and understand fault codes.

Table columns:

* Code
* Description
* System
* Severity
* Common Causes

Actions:

* Search code
* View details

---

## Report Details Page

Purpose:

Preview generated report.

Sections:

* Workshop info
* Vehicle info
* Fault codes
* AI explanation
* Recommended tests
* Technician notes
* Disclaimer

Actions:

* Download PDF
* Share link
* Send to PrioraFlow

---

## Integrations Page

Purpose:

Manage external connections.

Sections:

* PrioraFlow integration
* Webhook settings
* API keys

Actions:

* Connect PrioraFlow
* Test webhook
* Generate API key

---

## Settings Page

Purpose:

Manage account/workshop settings.

Sections:

* Profile
* Workshop details
* Report branding
* Language
* Notification settings

---

## Admin Page

Purpose:

Manage users and roles.

Sections:

* Users
* Roles
* Permissions
* Subscription

---

# 6. Core Components

```text
components/
├── layout/
│   ├── AppSidebar.tsx
│   ├── AppHeader.tsx
│   └── PageContainer.tsx
│
├── vehicles/
│   ├── VehicleForm.tsx
│   ├── VehicleTable.tsx
│   └── VehicleSummaryCard.tsx
│
├── sessions/
│   ├── SessionForm.tsx
│   ├── SessionTable.tsx
│   ├── FaultCodeInput.tsx
│   ├── UploadScanReport.tsx
│   ├── AIAnalysisPanel.tsx
│   └── SessionStatusBadge.tsx
│
├── reports/
│   ├── ReportPreview.tsx
│   └── ReportActions.tsx
│
├── integrations/
│   ├── PrioraFlowIntegrationCard.tsx
│   └── WebhookSettingsForm.tsx
│
└── shared/
    ├── DataTable.tsx
    ├── EmptyState.tsx
    ├── LoadingState.tsx
    └── ConfirmDialog.tsx
```

---

# 7. Suggested Frontend Folder Structure

```text
src/
├── app/
│   ├── login/
│   ├── dashboard/
│   ├── vehicles/
│   ├── sessions/
│   ├── fault-codes/
│   ├── reports/
│   ├── integrations/
│   ├── settings/
│   └── admin/
│
├── components/
├── hooks/
├── lib/
├── services/
├── stores/
├── types/
└── constants/
```

---

# 8. Types

```ts
export type Vehicle = {
  id: string;
  vin?: string;
  plateNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
};

export type DiagnosticSession = {
  id: string;
  vehicleId: string;
  status: "OPEN" | "ANALYZED" | "REPORTED" | "CLOSED";
  mileage?: number;
  complaint?: string;
  symptoms?: string;
  createdAt: string;
};

export type FaultCode = {
  id: string;
  code: string;
  description: string;
  system?: "ENGINE" | "TRANSMISSION" | "ABS" | "SRS" | "BODY" | "UNKNOWN";
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export type AIAnalysis = {
  id: string;
  sessionId: string;
  summary: string;
  possibleCauses: string[];
  recommendedTests: string[];
  suggestedRepairs: string[];
};
```

---

# 9. API Service Layer

```text
services/
├── auth.service.ts
├── vehicles.service.ts
├── sessions.service.ts
├── fault-codes.service.ts
├── reports.service.ts
├── integrations.service.ts
└── api-client.ts
```

Example:

```ts
export const sessionsService = {
  getAll: () => api.get("/sessions"),
  getById: (id: string) => api.get(`/sessions/${id}`),
  create: (payload: CreateSessionDto) => api.post("/sessions", payload),
  analyze: (id: string) => api.post(`/sessions/${id}/analyze`),
  generateReport: (id: string) => api.post(`/sessions/${id}/report`),
};
```

---

# 10. UX Rules

* Technician should create a session in less than 60 seconds.
* Fault code entry must be very fast.
* Upload report should support drag and drop.
* AI analysis must be shown in simple sections.
* Report preview should be clean and customer-friendly.
* Do not overload the technician with too many fields.
* Keep mobile/tablet layout in mind from the beginning.

---

# 11. MVP Frontend Priority

Build in this order:

```text
1. App layout + sidebar
2. Login page
3. Dashboard
4. Vehicles CRUD
5. Diagnostic sessions CRUD
6. Manual fault code entry
7. Upload scan report UI
8. AI analysis panel
9. Report preview
10. PrioraFlow integration button
```

---

# 12. Important Design Principle

PrioraScan is not a workshop ERP.

The frontend should feel like a fast diagnostic assistant:

```text
Vehicle
→ Symptoms
→ Codes / Report Upload
→ AI Analysis
→ Report
```

Avoid building too many admin screens before the core scan workflow works.
