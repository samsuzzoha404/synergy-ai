# Synergy Sales Genius — Frontend UI Design Analysis

> **Project:** Synergy Sales Genius — Chin Hin Group  
> **Stack:** React 18 + TypeScript · Vite · Tailwind CSS · shadcn/ui · Framer Motion · Recharts  
> **Analysis Date:** March 2026

---

## 1. Design System ও থিম

### 1.1 রঙের প্যালেট (Color Palette)

প্রজেক্টটি একটি **"Royal Blue Enterprise"** থিম ব্যবহার করে, যেখানে Light ও Dark উভয় মোড সাপোর্ট করা হয়েছে।

| টোকেন | Light Mode (HSL) | Dark Mode (HSL) | ব্যবহার |
|--|--|--|--|
| `--primary` | `217 91% 50%` | `217 91% 60%` | প্রাইমারি বাটন, লিংক, অ্যাকটিভ নেভ |
| `--background` | `210 20% 98%` | `222 47% 8%` | পেজ ব্যাকগ্রাউন্ড |
| `--card` | `0 0% 100%` | `222 47% 11%` | কার্ড সারফেস |
| `--sidebar-background` | `222 47% 11%` | `222 47% 11%` | সাইডবার (সর্বদা ডার্ক) |
| `--success` | `142 76% 36%` | একই | সাফল্য / won leads |
| `--warning` | `38 92% 50%` | একই | কনফ্লিক্ট ব্যাজ, সতর্কতা |
| `--destructive` | `0 84% 60%` | একই | ডুপ্লিকেট অ্যালার্ট, এরর |
| `--info` | `199 89% 48%` | একই | তথ্যসূচক ব্যাজ |

**AI Match Score রঙ:**
- `--match-high` → সবুজ (142 76% 36%)
- `--match-medium` → হলুদ (38 92% 50%)
- `--match-low` → লাল (0 84% 60%)

### 1.2 টাইপোগ্রাফি (Typography)

- **ফন্ট ফ্যামিলি:** `Inter` (Google Fonts, weight: 300–800) — fallback: `system-ui`, `-apple-system`, `sans-serif`
- **হেডিং:** `font-bold` / `font-extrabold` `text-xl` থেকে `text-5xl`
- **বডি টেক্সট:** `text-sm` (14px) — স্বাভাবিক পেজ কন্টেন্ট
- **লেবেল / ক্যাপশন:** `text-xs` (12px), uppercase + tracking-wide — সেকশন হেডার ও টেবিল হেডার
- **KPI ভ্যালু:** `text-2xl font-black` — ড্যাশবোর্ড মেট্রিক্স

### 1.3 স্পেসিং ও লেআউট

- **বর্ডার রেডিয়াস:** `0.625rem` (base) — কম্পোনেন্ট: `sm` (0.375rem), `md` (0.5rem), `lg` (0.625rem)
- **কন্টেইনার:** centered, `2rem` padding, max-width `1400px` (`2xl`)
- **গ্রিড:** Tailwind responsive grid — `grid-cols-1` → `sm:grid-cols-2` → `xl:grid-cols-4`

### 1.4 শ্যাডো সিস্টেম (Shadow System)

```
--shadow-card  : হালকা কার্ড এলিভেশন
--shadow-sm    : ছোট সারফেস
--shadow-md    : মিডিয়াম পপওভার
--shadow-lg    : বড় মোডাল / ড্রপডাউন
--shadow-drawer: স্মার্ট ড্রয়ার (বাম থেকে -10px 0 40px)
```

### 1.5 গ্র্যাডিয়েন্ট

- `--gradient-primary`: `135deg, hsl(217 91% 50%) → hsl(217 91% 40%)` — বাটন, লোগো, অ্যাভাটার
- `--gradient-sidebar`: `180deg, hsl(222 47% 11%) → hsl(222 47% 8%)` — সাইডবার ব্যাকগ্রাউন্ড
- `--gradient-card-top`: সাবটেল ব্লু টিন্ট — কার্ড টপ ডেকোরেশন

### 1.6 অ্যানিমেশন (Animations)

| নাম | বিবরণ |
|--|--|
| `fade-in` | `opacity 0→1` + `translateY 8px→0` — পেজ লোড |
| `slide-in-right` | `translateX(100%)→0` — স্মার্ট ড্রয়ার |
| `shimmer` | ব্যাকগ্রাউন্ড পজিশন লুপ — স্কেলেটন লোডার |
| `accordion-down/up` | height expand/collapse — অ্যাকর্ডিয়ন |
| Framer Motion | spring/ease — ড্রপডাউন, ড্রয়ার, নোটিফ প্যানেল |

---

## 2. অ্যাপ্লিকেশন আর্কিটেকচার

```
App.tsx
 ├── QueryClientProvider   (TanStack Query)
 ├── AuthProvider          (JWT context)
 ├── TooltipProvider
 ├── Toaster + Sonner      (নোটিফিকেশন)
 └── BrowserRouter
      ├── /           → Auth (public)
      ├── /auth       → Auth (public)
      └── ProtectedRoute → Layout
           ├── /dashboard  → Dashboard
           ├── /leads      → LeadWorkbench
           ├── /conflicts  → ConflictResolution
           ├── /ingest     → DataIngestion
           ├── /reports    → Reports & Export
           └── /admin/users → AdminUsers (Admin only)
```

**রাউট সুরক্ষা:** `ProtectedRoute` কম্পোনেন্ট — `isAuthenticated` false হলে সরাসরি `/auth` রিডাইরেক্ট।

---

## 3. লেআউট কাঠামো

### 3.1 মেইন লেআউট (`Layout.tsx`)

```
┌─────────────────────────────────────────────────────┐
│  AppSidebar (fixed, w-60 / w-16 collapsed)          │
│  ┌────────────────────────────────────────────────┐ │
│  │ Top Header (h-14, border-b)                    │ │
│  │  [☰ mobile] [🔍 Search max-w-md] [☀️][🔔][👤] │ │
│  ├────────────────────────────────────────────────┤ │
│  │                                                │ │
│  │    <Outlet /> — পেজ কন্টেন্ট                  │ │
│  │    (overflow-y-auto, scrollbar-thin)           │ │
│  │                                                │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 3.2 টপ হেডার ফিচার

| এলিমেন্ট | বিবরণ |
|--|--|
| মোবাইল হ্যামবার্গার | `md:hidden` — সাইডবার ওপেন করে |
| সার্চ বার | `hidden sm:flex` — placeholder "Search leads, projects…", `⌘K` কীবোর্ড হিন্ট |
| থিম টগল | Sun/Moon আইকন — Light/Dark মোড সুইচ |
| নোটিফিকেশন বেল | আনরিড কাউন্ট — লাল ডট ইন্ডিকেটর, অ্যানিমেটেড ড্রপডাউন (w-80) |
| ইউজার অ্যাভাটার | ইনিশিয়াল অ্যাভাটার, নাম + রোল, ড্রপডাউন মেনু (Profile/Settings/Logout) |

---

## 4. সাইডবার (`AppSidebar.tsx`)

### 4.1 স্ট্রাকচার

- **সর্বদা ডার্ক** সারফেস (`sidebar-background: 222 47% 11%`)
- কোল্যাপসিবল: `w-60` (expanded) ↔ `w-16` (collapsed) — `ChevronLeft/Right` বাটন
- মোবাইলে: ওভারলে + স্লাইড-ইন drawer

### 4.2 লোগো / ব্র্যান্ড

```
[⚡ Zap icon (gradient-primary)] "Synergy Sales"
                                 "Genius · Chin Hin Group"
```

### 4.3 নেভিগেশন আইটেম

| রুট | আইকন | লেবেল | বিশেষত্ব |
|--|--|--|--|
| `/dashboard` | `LayoutDashboard` | Executive Dashboard | — |
| `/leads` | `TableProperties` | Lead Workbench | — |
| `/conflicts` | `AlertTriangle` | Conflict Resolution | **Dynamic badge** — pending conflict count (warning রঙে) |
| `/ingest` | `Upload` | Data Ingestion | — |
| `/reports` | `BarChart3` | Reports & Export | — |
| `/admin/users` | `Users` | User Management | **Admin only** — সেকশন লেবেল "ADMIN" |

**অ্যাকটিভ স্টেট:** `bg-sidebar-primary text-sidebar-primary-foreground` — রয়্যাল ব্লু হাইলাইট

### 4.4 ফুটার

Settings + Help & Docs বাটন — muted icon + label (collapsed হলে শুধু icon)

---

## 5. পেজ বিশ্লেষণ

---

### 5.1 Auth পেজ (`/auth`)

**লেআউট:** দুই কলাম — বাম ব্র্যান্ড প্যানেল (52–54% width) + ডান ফর্ম প্যানেল

#### বাম প্যানেল (Brand Panel)
- **ব্যাকগ্রাউন্ড:** গভীর নেভি `hsl(222 47% 7%)` + তিনটি radial gradient glow (primary blue)
- **প্যাটার্ন:** subtle dot-grid (28px) + diagonal stripe (45deg, 14px)
- **কন্টেন্ট (উপর থেকে নিচে):**
  - Logo: `[⚡]` + "Synergy Sales Genius" + "CHIN HIN GROUP" (Framer Motion fade-in)
  - Eyebrow pill: "ENTERPRISE AI CRM" badge
  - Hero headline: `text-5xl font-extrabold` — "Close more deals," + gradient text "together."
  - Subtext: `text-white/45`
  - Feature list: 3টি আইটেম (ShieldCheck, Sparkles, BarChart3)
  - Stats row: 3টি গ্লাস কার্ড — Active Leads / Synergy Matches / Pipeline Growth
  - Footer: copyright + Privacy/Terms/Support লিংক

#### ডান প্যানেল (Form Panel)
- **ব্যাকগ্রাউন্ড:** `hsl(222 47% 8%)` + subtle corner glows
- **গ্লাস কার্ড:** `rounded-3xl`, `backdrop-filter: blur(12px)`, `box-shadow: 0 24px 80px -12px rgba(0,0,0,0.5)`
- **ফর্ম ফিচার:**
  - Mode badge: "Returning Member" / "New Account" pill
  - `AnimatePresence` দিয়ে Sign In ↔ Sign Up সুইচ
  - `PremiumInput` custom component: focus glow effect, icon left, transition border
  - Submit button: gradient background, shimmer hover overlay, spinner loading state
- **ডেমো অ্যাকাউন্ট:**
  - Admin (Marvis) — full-width ব্লু বাটন + ShieldCheck icon
  - BU Sales Reps — 4-column grid (7টি বাটন)
- **ট্রাস্ট ব্যাজ:** SOC 2 Compliant + 256-bit Encrypted (footer)

---

### 5.2 Executive Dashboard (`/dashboard`)

**পেজ হেডার:**
- সময়-ভিত্তিক greeting: "Good morning/afternoon/evening, {name}"
- **Live ব্যাজ:** সবুজ pulse dot + "Live · {X}m ago"

#### KPI Cards (4টি — `xl:grid-cols-4`)

| কার্ড | আইকন ব্যাকগ্রাউন্ড | ডেটা |
|--|--|--|
| Total Leads | `bg-primary` (ব্লু) | live count |
| Synergy Potential | `bg-success` (সবুজ) | cross-sell leads মোট মূল্য (RM) |
| Processing Speed | `bg-info` (সায়ান) | মিনিট |
| Pending Actions | `bg-warning` (হলুদ) | Under Review + New লিডস |

প্রতিটি কার্ডে: লেবেল, সাবলেবেল, বড় ভ্যালু (`text-2xl font-black`), trend badge (↑/↓ with %QoQ)

#### চার্ট রো (Charts Row) — `lg:grid-cols-3`

**Area Trend Chart (col-span-2):**
- Recharts `AreaChart` — শেষ ৬ মাসের লিড কাউন্ট
- Blue gradient fill, `CartesianGrid` horizontal lines
- QoQ ব্যাজ: সবুজ TrendingUp / লাল TrendingDown

**Donut / Pie Chart (col-span-1):**
- Pipeline stage distribution: Planning / Tender / Construction / Completed
- `innerRadius=42, outerRadius=65` — donut আকৃতি
- নিচে: stage legend + মিনি প্রোগ্রেস বার + count

#### দ্বিতীয় রো — `lg:grid-cols-5`

**Leads by Business Unit Bar Chart (col-span-3):**
- Recharts stacked `BarChart` — ব্লু (lead count) + সায়ান (value RM M)
- `LabelList` — বার উপরে count লেবেল
- Custom `CustomBarTooltip` — styled card tooltip

**Recent Activity Feed (col-span-2):**
- সর্বশেষ ৫টি লিড থেকে derived — assign / alert / new / win / upload
- আইকন + color per type, relative time ("2h ago", "3d ago")

#### Recent Leads Table

- Header: "Recent Leads" + "View all →" লিংক
- কলাম: Project | Value | Stage | AI Match | Status
- ক্লিকযোগ্য রো → SmartDrawer খোলে
- ডুপ্লিকেট লিড: `bg-destructive/5` হাইলাইট + "Conflict pending" ইন্ডিকেটর

---

### 5.3 Lead Workbench (`/leads`)

**পেজ হেডার:**
- `TableProperties` আইকন সহ "Lead Workbench" শিরোনাম
- **View Toggle:** List ↔ Pipeline (segmented control — `bg-muted rounded-lg`)
- Loading badge: pulse dot + "Syncing…"

#### Quick Stats (4টি — `sm:grid-cols-4`)

| স্ট্যাট | রঙ | ডেটা |
|--|--|--|
| Total Leads | primary (ব্লু) | total count + page info |
| Pipeline Value | success (সবুজ) | gross dev. value (RM) |
| Closed Won | info (সায়ান) | won leads count |
| Conflicts | destructive (লাল) | pending conflict count |

Skeleton লোডার: `<Skeleton className="h-[72px] rounded-xl" />` — লোডিং অবস্থায়

#### Info Banner

Royal blue `bg-primary-light` banner — "Tribal Knowledge Engine active" — দর্শনমাত্র context  message, view অনুযায়ী ম্যাসেজ পরিবর্তন হয়

#### List View → `<LeadsTable />`

- AI-scored lead rows
- ক্লিকেবল রো → SmartDrawer
- ডুপ্লিকেট → ConflictResolution রিডাইরেক্ট

#### Pagination (multi-page)

- "Showing X–Y of Z leads"
- Prev / Next বাটন (disabled state) + page indicator

#### Pipeline View → `<LeadPipeline />`

- Kanban-style column layout — stage per column
- ড্র্যাগ করে lead card সরানো যায়
- Card ক্লিক → SmartDrawer

---

### 5.4 Smart Recommendation Drawer (`SmartDrawer.tsx`)

ডানদিক থেকে স্লাইড-ইন প্যানেল — `max-w-[520px]`, Framer Motion spring transition

**হেডার:**
- Royal blue gradient strip (top 1px)
- StatusBadge + lead ID (monospace)
- প্রজেক্ট নাম + location / type / date
- X বাটন (close)

**4টি ট্যাব:** Overview | Contact | Activities | Audit

**Overview ট্যাব:**
- Lead details: value, stage, developer, floors, GFA
- **AI Match Scores:** ম্যাচ থেকে score bar — green/yellow/red
- Cross-sell bundle
- "Assign to BU" বাটন → API call + toast

**Contact ট্যাব:**
- BU contact info (partial-match করে bu_contacts.json থেকে)
- ফোন, email, address

**Activities ট্যাব:**
- Timeline — Note / Call / Email এন্ট্রি
- Note type toggle + textarea + Submit বাটন
- Realtime API (useCreateActivity)

**Audit ট্যাব:**
- চেঞ্জ লগ — timestamp + user + field changed
- `useAuditLogs` hook

---

### 5.5 Conflict Resolution (`/conflicts`)

**লোডিং স্টেট:** centered spinner + "Checking conflict queue…"

**কনফ্লিক্ট নেই হলে:**
- বড় সবুজ চেকমার্ক সার্কেল
- "No Conflicts Detected" + "All leads are unique. Great work!"

**কনফ্লিক্ট রেজোলভড হলে:**
- সাফল্য অ্যানিমেশন (Framer Motion)

**সক্রিয় কনফ্লিক্ট View:**

```
┌────────────────────────────────────────────────────┐
│  Header: Alert badge + "X Conflict(s) Detected"   │
├───────────────────┬────────────────────────────────┤
│  New Lead (বাম)   │  Existing Record (ডান)          │
├───────────────────┴────────────────────────────────┤
│  Field-by-field comparison rows:                   │
│   - Project Name   (Match badge যদি মিলে)          │
│   - Location                                        │
│   - Value                                           │
│   - Stage                                           │
│   - Developer                                       │
└────────────────────────────────────────────────────┘
│  Action Buttons:                                    │
│  [🔀 Merge]  [🗑️ Discard New]  [📋 Keep Both]     │
└────────────────────────────────────────────────────┘
```

**HighlightText:** মিলে যাওয়া টেক্সট `<mark>` দিয়ে warning/amber highlight
**FieldRow:** matching ফিল্ডে `bg-warning/5` সাবটেল ব্যাকগ্রাউন্ড + "Match" badge

---

### 5.6 Data Ingestion (`/ingest`)

**হেডার:** Upload আইকন + শিরোনাম + সাবটেক্সট

#### AI Processing Pipeline Visualizer

4 ধাপ — horizontal scrollable row:

```
[📤 File Upload] → [🖥️ AI Scoring] → [💾 Stored] → [📊 Dashboard]
```

- Idle: `bg-muted` (ধূসর)
- Active: `bg-primary-light border-primary/30 text-primary` (ব্লু)
- Done: `bg-success-light border-success/30 text-success` + CheckCircle2 আইকন

#### CSV/PDF Drag & Drop Zone

- বড় dashed border বক্স
- Drag hover → border glow change
- ফাইল সীমা: ৫০ MB
- সাপোর্টেড ফরম্যাট: `.csv`, `.pdf`

**আপলোড সাকসেস:**
- imported count + flagged count ডিসপ্লে
- error list (থাকলে)

#### Manual Lead Entry Form

দুই কলাম গ্রিড ফর্ম:
- Project Name, Location, Value (RM), Developer
- Stage (Planning/Tender/Construction/Completed)
- Type (Commercial/Residential/Industrial)
- Floors, GFA (sqft)

Submit → `useCreateLead` → AI scoring result toast (BU + match score)

---

### 5.7 Reports & Export (`/reports`)

**হেডার:** BarChart3 আইকন + শিরোনাম + Refresh বাটন

#### ফিল্টার প্যানেল

4টি ফিল্টার ইনলাইন:
- Status dropdown (All / New / Assigned / Won / … ১০টি অপশন)
- BU dropdown (All + ৭টি BU নাম)
- Date From / Date To (date input)

#### Summary Cards (4টি)

| কার্ড | আইকন | মেট্রিক |
|--|--|--|
| Total Leads | Filter | filtered count |
| Pipeline Value | DollarSign | RM (M/B format) |
| Avg AI Score | TrendingUp | % |
| Flagged Duplicates | AlertTriangle | count |

#### BU Breakdown Bar Chart

- Recharts `BarChart` — প্রতিটি BU-র count
- `CHART_COLORS` array — ৭টি রঙ (ব্লু, সবুজ, কমলা, বেগুনি, লাল, সায়ান)
- কাস্টম tooltip

#### Status Breakdown Table

- Status | Count | Progress bar (relative to max)

#### Export অপশন

| বাটন | বিবরণ |
|--|--|
| **Server Export** (Download) | `/api/leads/export` → authenticated blob download |
| **Client CSV** | ফিল্টার করা leads থেকে browser-side CSV generation |
| **Print** | `window.print()` |

---

### 5.8 Admin User Management (`/admin/users`)

**শুধুমাত্র Admin রোলের জন্য দৃশ্যমান**

#### User List Table

| কলাম | বিবরণ |
|--|--|
| Name | ব্যবহারকারীর নাম |
| Email | ওয়ার্ক ইমেইল |
| Role | `RoleBadge` — Admin (ব্লু) / Sales_Rep (সবুজ) |
| BU | বিজনেস ইউনিট |
| Actions | Edit (Pencil) + Delete (Trash2) আইকন বাটন |

**বর্তমান লগড-ইন ইউজার:** নিজেকে ডিলিট করা যায় না

#### Create User Dialog (shadcn Dialog)

ফর্ম ফিল্ড:
- Full Name (`Input`)
- Email (`Input`)
- Role (`Select` — Admin / Sales_Rep)
- Business Unit (`Select` — ৭টি BU, Sales_Rep হলে দৃশ্যমান)
- Password — show/hide toggle (Eye/EyeOff আইকন)

#### Edit User Dialog

একই ফর্ম, email পরিবর্তনযোগ্য নয় (read-only)

#### Delete Confirmation (shadcn AlertDialog)

"Are you sure?" — Cancel + Delete (destructive বাটন)

#### RoleBadge Component

```
Admin:     [🛡️ Admin]   — bg-primary/10 text-primary border-primary/20
Sales_Rep: [✅ Sales Rep] — bg-success/10 text-success border-success/20
```

---

## 6. পুনর্ব্যবহারযোগ্য কম্পোনেন্ট

### 6.1 `KPICard`

```
┌──────────────────────────────────────┐
│  LABEL (uppercase, xs)    [Icon bg]  │
│  sublabel (muted, xs)                │
│                                      │
│  VALUE (2xl font-black)              │
│  [↑ X% increase] badge               │
└──────────────────────────────────────┘
```
Hover: `shadow-md`, `border-primary/20`  
Loading: shimmer skeleton

### 6.2 `StatusBadge`

লিড স্ট্যাটাস অনুযায়ী রঙিন বেজ:
- `New` → info (সায়ান)
- `Assigned` → primary (ব্লু)  
- `Won` → success (সবুজ)
- `Lost` → destructive (লাল)
- `Duplicate Alert` → warning (হলুদ) + pulse dot
- `Under Review` → warning
- `Merged` / `Discarded` → muted

### 6.3 `MatchScoreBadge`

AI match score ভিজুয়ালাইজেশন:
- Score ≥ 70 → green (`match-high`)
- Score 40–69 → yellow (`match-medium`)
- Score < 40 → red (`match-low`)
- BU নাম সহ প্রদর্শিত

### 6.4 `LeadsTable`

সম্পূর্ণ overflow-x-auto টেবিল:
- কলাম: Project / Developer / Location / Value / Stage / AI Match / Status / Date
- ক্লিকযোগ্য রো → SmartDrawer
- ডুপ্লিকেট রো: `bg-destructive/5` হাইলাইট

### 6.5 `LeadPipeline`

Kanban বোর্ড — ৪ স্টেজ কলাম (Planning / Tender / Construction / Completed)

### 6.6 shadcn/ui কম্পোনেন্ট লাইব্রেরি

প্রজেক্টে ব্যবহৃত সম্পূর্ণ shadcn/ui কম্পোনেন্ট তালিকা:

`accordion` · `alert-dialog` · `alert` · `aspect-ratio` · `avatar` · `badge` · `breadcrumb` · `button` · `calendar` · `card` · `carousel` · `chart` · `checkbox` · `collapsible` · `command` · `context-menu` · `dialog` · `drawer` · `dropdown-menu` · `form` · `hover-card` · `input-otp` · `input` · `label` · `menubar` · `navigation-menu` · `pagination` · `popover` · `progress` · `radio-group` · `resizable` · `scroll-area` · `select` · `separator` · `sheet` · `sidebar` · `skeleton` · `slider` · `sonner` · `switch` · `table` · `tabs` · `textarea` · `toast` · `toaster` · `toggle-group` · `toggle` · `tooltip`

---

## 7. রেসপন্সিভ ডিজাইন (Responsive Design)

| ব্রেকপয়েন্ট | আচরণ |
|--|--|
| `< sm` (< 640px) | সার্চ লুকানো, KPI single column, সাইডবার overlay |
| `sm` (640px+) | সার্চ দৃশ্যমান, KPI 2 column |
| `md` (768px+) | হ্যামবার্গার লুকানো, ইউজার নাম/রোল দৃশ্যমান |
| `lg` (1024px+) | চার্ট side-by-side, Auth দুই কলাম |
| `xl` (1280px+) | KPI 4 column, বড় হেডার ফন্ট |

---

## 8. স্টেট ম্যানেজমেন্ট ও ডেটা ফ্লো

| স্তর | টেকনোলজি | ব্যবহার |
|--|--|--|
| সার্ভার স্টেট | TanStack Query v5 | API fetch, cache, refetch |
| অথ স্টেট | React Context (`AuthContext`) | JWT token, user info, login/logout |
| UI লোকাল স্টেট | `useState` | ড্রয়ার ওপেন, পেজ নম্বর, ভিউ টগল |
| ফর্ম স্টেট | `react-hook-form` | DataIngestion manual form |
| থিম | `next-themes` | light/dark toggle |
| নোটিফিকেশন | sonner + shadcn Toaster | টোস্ট মেসেজ |

---

## 9. বিশেষ UI প্যাটার্ন

### 9.1 Auth পেজের "PremiumInput"

Custom input — focus glow, icon transition, glassmorphism feel:
```css
border: focused ? "1.5px solid hsl(217 91% 60% / 0.7)" : "1.5px solid rgba(255,255,255,0.08)"
boxShadow: focused ? "0 0 0 3px hsl(217 91% 60% / 0.12)" : "none"
```

### 9.2 গ্লাস মরফিজম (Glassmorphism)

Auth ফর্ম কার্ড:
```css
background: rgba(255,255,255,0.03)
border: 1px solid rgba(255,255,255,0.08)
backdropFilter: blur(12px)
boxShadow: 0 24px 80px -12px rgba(0,0,0,0.5)
```

### 9.3 Skeleton Loader

`<Skeleton />` shadcn কম্পোনেন্ট + কাস্টম shimmer animation — LeadWorkbench Quick Stats লোডিং সময়

### 9.4 Animated Dropdowns

`AnimatePresence` + Framer Motion:
```
initial: { opacity: 0, y: -8, scale: 0.97 }
animate: { opacity: 1, y: 0, scale: 1 }
exit:    { opacity: 0, y: -8, scale: 0.97 }
transition: { duration: 0.15 }
```
→ Notification panel, User menu উভয়ে ব্যবহৃত

### 9.5 Spring Drawer

Smart Drawer স্লাইড-ইন:
```
initial: { x: "100%" }
animate: { x: 0 }
type: "spring", damping: 28, stiffness: 280
```

---

## 10. আইকন লাইব্রেরি

সমস্ত আইকন **Lucide React** থেকে — একটি consistent, outline-style আইকন সেট।

বহুল ব্যবহৃত:
`LayoutDashboard` · `TableProperties` · `AlertTriangle` · `Upload` · `Zap` · `Bell` · `Search` · `Users` · `BarChart3` · `Brain` · `Sparkles` · `CheckCircle2` · `TrendingUp` · `TrendingDown` · `Shield` · `Settings` · `HelpCircle`

---

## 11. পারফরমেন্স ও UX বিবেচনা

| বৈশিষ্ট্য | বাস্তবায়ন |
|--|--|
| `useMemo` | Dashboard সব chart data computation |
| Pagination | LeadWorkbench — `PAGE_SIZE` ভিত্তিক server-side |
| Skeleton UI | লোডিং সময় layout shift এড়ানো |
| `animate-fade-in` | পেজ লোডে জার্কি transition এড়ানো |
| `scrollbar-thin` | `tailwind-scrollbar` plugin — custom scrollbar |
| Accessible `sr-only` | notification count screen reader সাপোর্ট |
| Keyboard shortcut hint | `⌘K` kbd badge — সার্চ বারে |
| Toast notifications | সব async action-এর পরে User feedback |
| AnimatePresence exit | ড্রপডাউন close smooth animation |

---

## 12. সংক্ষিপ্ত সারাংশ

**Synergy Sales Genius** প্রজেক্টের ফ্রন্টেন্ড একটি **enterprise-grade, dark-navy + royal blue** ডিজাইন ল্যাঙ্গুয়েজ অনুসরণ করে। মূল বৈশিষ্ট্যগুলি:

1. **সাইডবার-ড্রিভেন লেআউট** — collapse সাপোর্ট সহ ডার্ক সাইডবার
2. **ডেটা-ডেন্স ড্যাশবোর্ড** — KPI card + area/donut/bar chart + activity feed + table
3. **AI-focused UX** — match score badge, tribal knowledge engine banner, smart drawer
4. **প্রিমিয়াম Auth পেজ** — glassmorphism, gradient glow, animated brand panel
5. **Framer Motion everywhere** — drawer, dropdown, page fade — smooth transitions
6. **সম্পূর্ণ RBAC-aware UI** — Admin-only nav item, admin-only pages
7. **লাইভ ডেটা indicators** — pulse dot, "Syncing…" badge, relative timestamp
8. **দ্বৈত থিম** — light/dark, একই সাইডবার সর্বদা ডার্ক
