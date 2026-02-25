export type LeadStatus = "New" | "In Review" | "Assigned" | "Duplicate Alert" | "Won" | "Lost";
export type LeadStage = "Planning" | "Tender" | "Construction" | "Completed";
export type ProjectType = "High-Rise" | "Industrial" | "Commercial" | "Infrastructure" | "Renovation";

export interface AIMatch {
  bu: string;
  score: number;
  color: string;
}

export interface BundleSuggestion {
  product: string;
  bu: string;
}

export interface Lead {
  id: string;
  projectName: string;
  location: string;
  value: number;
  stage: LeadStage;
  type: ProjectType;
  status: LeadStatus;
  matches: AIMatch[];
  crossSell: BundleSuggestion[];
  aiRationale: string;
  createdDate: string;
  developer: string;
  floors?: number;
  gfa?: number;
  isDuplicate?: boolean;
  duplicateOf?: string;
  assignedTo?: string;
}

export const leads: Lead[] = [
  {
    id: "L001",
    projectName: "Avantro Residences Phase 2",
    location: "Mont Kiara, KL",
    value: 50_000_000,
    stage: "Tender",
    type: "High-Rise",
    status: "In Review",
    developer: "Avantro Development Sdn Bhd",
    floors: 42,
    gfa: 85000,
    assignedTo: "Ahmad Razif",
    matches: [
      { bu: "Stucken", score: 92, color: "hsl(217, 91%, 50%)" },
      { bu: "Ajiya", score: 78, color: "hsl(199, 89%, 48%)" },
      { bu: "Fiamma", score: 61, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Starken AAC Blocks", bu: "Stucken" },
      { product: "Ajiya Glass Facade", bu: "Ajiya" },
      { product: "Signature Kitchen Sets", bu: "Signature" },
      { product: "Fiamma Sanitary Ware", bu: "Fiamma" },
    ],
    aiRationale: "Based on 47 historical High-Rise projects in Mont Kiara & KL Sentral corridor, AAC lightweight blocks are specified in 89% of cases. Glass facade demand is driven by GBI certification requirements. Cross-selling Signature Kitchen has yielded RM 3.2M in additional revenue from similar projects.",
    createdDate: "2025-06-01",
  },
  {
    id: "L002",
    projectName: "Eco-City Factory Hub",
    location: "Shah Alam, Selangor",
    value: 15_000_000,
    stage: "Planning",
    type: "Industrial",
    status: "New",
    developer: "Eco Holdings Bhd",
    floors: 4,
    gfa: 22000,
    matches: [
      { bu: "G-Cast", score: 85, color: "hsl(142, 76%, 36%)" },
      { bu: "Ajiya Metal", score: 80, color: "hsl(199, 89%, 48%)" },
      { bu: "Stucken", score: 55, color: "hsl(217, 91%, 50%)" },
    ],
    crossSell: [
      { product: "G-Cast Precast Panels", bu: "G-Cast" },
      { product: "Ajiya Metal Roofing", bu: "Ajiya" },
      { product: "Fire Protection Systems", bu: "Fiamma" },
    ],
    aiRationale: "Industrial parks in Shah Alam show 93% adoption of precast concrete panels for speed of construction. Ajiya metal roofing is the de-facto choice for warehouses above 10,000 sqft GFA. Fire protection systems are mandatory under BOMBA regulations for industrial facilities.",
    createdDate: "2025-06-05",
  },
  {
    id: "L003",
    projectName: "Twin Towers Reno",
    location: "KLCC, KL",
    value: 150_000_000,
    stage: "Construction",
    type: "Renovation",
    status: "Duplicate Alert",
    developer: "Petronas Properties Sdn Bhd",
    floors: 88,
    gfa: 400000,
    isDuplicate: true,
    duplicateOf: "L003-ORIG",
    matches: [
      { bu: "Stucken", score: 88, color: "hsl(217, 91%, 50%)" },
      { bu: "Ajiya", score: 72, color: "hsl(199, 89%, 48%)" },
    ],
    crossSell: [
      { product: "Premium AAC Blocks", bu: "Stucken" },
      { product: "Fire-Rated Glass", bu: "Ajiya" },
    ],
    aiRationale: "Large-scale renovation of iconic towers requires premium-grade fire-rated materials. Stucken's specialty products are certified for this class of building.",
    createdDate: "2025-06-08",
  },
  {
    id: "L004",
    projectName: "Damansara Nexus Mall",
    location: "Damansara, Selangor",
    value: 85_000_000,
    stage: "Tender",
    type: "Commercial",
    status: "Assigned",
    developer: "Nexus Property Group",
    floors: 8,
    gfa: 130000,
    assignedTo: "Liyana Hassan",
    matches: [
      { bu: "Ajiya", score: 79, color: "hsl(199, 89%, 48%)" },
      { bu: "Signature", score: 74, color: "hsl(262, 80%, 56%)" },
      { bu: "Fiamma", score: 68, color: "hsl(330, 80%, 55%)" },
    ],
    crossSell: [
      { product: "Ajiya Curtain Wall System", bu: "Ajiya" },
      { product: "Signature Flooring", bu: "Signature" },
      { product: "Fiamma Sanitary Collection", bu: "Fiamma" },
    ],
    aiRationale: "Retail malls in Damansara corridor consistently specify curtain wall systems for natural lighting. Signature flooring has 76% market share in premium retail.",
    createdDate: "2025-05-28",
  },
  {
    id: "L005",
    projectName: "Iskandar Waterfront Residences",
    location: "Johor Bahru, Johor",
    value: 220_000_000,
    stage: "Planning",
    type: "High-Rise",
    status: "In Review",
    developer: "Iskandar Waterfront Holdings",
    floors: 56,
    gfa: 210000,
    assignedTo: "Tan Wei Ming",
    matches: [
      { bu: "Stucken", score: 90, color: "hsl(217, 91%, 50%)" },
      { bu: "Ajiya", score: 82, color: "hsl(199, 89%, 48%)" },
      { bu: "G-Cast", score: 65, color: "hsl(142, 76%, 36%)" },
    ],
    crossSell: [
      { product: "Starken AAC Blocks", bu: "Stucken" },
      { product: "Ajiya Curtain Wall", bu: "Ajiya" },
      { product: "Signature Kitchen", bu: "Signature" },
    ],
    aiRationale: "High-value waterfront projects in Iskandar are Singapore-standard in specification. Premium AAC blocks and curtain wall systems are near-universal for this segment.",
    createdDate: "2025-06-10",
  },
  {
    id: "L006",
    projectName: "Putrajaya Federal Complex",
    location: "Putrajaya, WP",
    value: 310_000_000,
    stage: "Tender",
    type: "Infrastructure",
    status: "New",
    developer: "Jabatan Kerja Raya Malaysia",
    floors: 20,
    gfa: 320000,
    matches: [
      { bu: "G-Cast", score: 88, color: "hsl(142, 76%, 36%)" },
      { bu: "Stucken", score: 75, color: "hsl(217, 91%, 50%)" },
    ],
    crossSell: [
      { product: "G-Cast Structural Panels", bu: "G-Cast" },
      { product: "Starken Blocks", bu: "Stucken" },
      { product: "Fire Protection Grid", bu: "Fiamma" },
    ],
    aiRationale: "Government infrastructure projects above RM 300M mandate local certified precast for structural speed. G-Cast has won 7 of the last 9 federal tenders in Putrajaya.",
    createdDate: "2025-06-12",
  },
  {
    id: "L007",
    projectName: "KL Eco City Tower C",
    location: "KL Eco City, KL",
    value: 175_000_000,
    stage: "Construction",
    type: "Commercial",
    status: "Won",
    developer: "SP Setia Bhd",
    floors: 38,
    gfa: 155000,
    assignedTo: "Farah Nadia",
    matches: [
      { bu: "Ajiya", score: 91, color: "hsl(199, 89%, 48%)" },
      { bu: "Stucken", score: 83, color: "hsl(217, 91%, 50%)" },
      { bu: "Signature", score: 70, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Ajiya Low-E Glass", bu: "Ajiya" },
      { product: "Starken AAC", bu: "Stucken" },
      { product: "Signature Lobby Tiles", bu: "Signature" },
    ],
    aiRationale: "Green-rated commercial towers in KL Eco City demand Low-E glass for LEED compliance. Ajiya's thermal glass portfolio has 100% track record here.",
    createdDate: "2025-05-20",
  },
  {
    id: "L008",
    projectName: "Setia Alam Logistics Park",
    location: "Setia Alam, Selangor",
    value: 42_000_000,
    stage: "Planning",
    type: "Industrial",
    status: "New",
    developer: "Setia Industrial Park Sdn Bhd",
    floors: 3,
    gfa: 68000,
    matches: [
      { bu: "G-Cast", score: 82, color: "hsl(142, 76%, 36%)" },
      { bu: "Ajiya Metal", score: 78, color: "hsl(199, 89%, 48%)" },
    ],
    crossSell: [
      { product: "G-Cast Floor Slabs", bu: "G-Cast" },
      { product: "Ajiya Metal Cladding", bu: "Ajiya" },
      { product: "Fiamma Fire Suppression", bu: "Fiamma" },
    ],
    aiRationale: "Logistics parks above 50K sqft require heavy floor load capacity. G-Cast precast slabs rated for 10-tonne forklifts are standard. Sprinkler systems are DOSH-mandated.",
    createdDate: "2025-06-14",
  },
];

export const existingDuplicateLead = {
  id: "L003-ORIG",
  projectName: "KL Twin Towers Renovation",
  location: "Jalan Ampang, KLCC, Kuala Lumpur",
  value: 148_000_000,
  stage: "Construction" as LeadStage,
  developer: "Petronas Properties Sdn Bhd",
  status: "Assigned" as LeadStatus,
  createdDate: "2025-05-15",
};

export const kpiData = {
  totalLeads: { value: 842, trend: 15, label: "Total Leads", sublabel: "vs last quarter" },
  synergyPotential: { value: 320_000_000, trend: 22, label: "Synergy Potential", sublabel: "cross-sell revenue" },
  processingSpeed: { value: 10, trend: -97, label: "Processing Speed", sublabel: "reduced from 7 days", unit: "mins" },
  pendingActions: { value: 12, trend: -3, label: "Pending Actions", sublabel: "requires attention" },
};

export const leadsbyBU = [
  { bu: "Stucken", leads: 287, value: 142 },
  { bu: "Ajiya", leads: 234, value: 98 },
  { bu: "G-Cast", leads: 156, value: 67 },
  { bu: "Signature", leads: 112, value: 45 },
  { bu: "Fiamma", leads: 53, value: 28 },
];

export const projectStageData = [
  { stage: "Planning", count: 312, color: "hsl(217, 91%, 50%)" },
  { stage: "Tender", count: 287, color: "hsl(199, 89%, 48%)" },
  { stage: "Construction", count: 198, color: "hsl(262, 80%, 56%)" },
  { stage: "Completed", count: 45, color: "hsl(142, 76%, 36%)" },
];

export const recentActivity = [
  { id: 1, action: "Lead assigned", detail: "Avantro Residences → Stucken", time: "2 mins ago", type: "assign" },
  { id: 2, action: "Duplicate detected", detail: "Twin Towers Reno flagged", time: "18 mins ago", type: "alert" },
  { id: 3, action: "New lead ingested", detail: "Putrajaya Federal Complex", time: "1 hr ago", type: "new" },
  { id: 4, action: "Lead won", detail: "KL Eco City Tower C — RM 175M", time: "3 hrs ago", type: "win" },
  { id: 5, action: "CSV uploaded", detail: "BCI_June2025_export.csv — 127 leads", time: "5 hrs ago", type: "upload" },
  { id: 6, action: "Lead assigned", detail: "Damansara Nexus Mall → Ajiya", time: "Yesterday", type: "assign" },
];

export const notifications = [
  { id: 1, title: "Duplicate Alert", message: "Twin Towers Reno matches L003-ORIG at 94% similarity.", time: "18m ago", read: false, type: "alert" },
  { id: 2, title: "Lead Assigned", message: "KL Eco City Tower C assigned to Farah Nadia.", time: "3h ago", read: false, type: "success" },
  { id: 3, title: "New BCI Data", message: "127 new leads imported from June export.", time: "5h ago", read: true, type: "info" },
  { id: 4, title: "AI Score Updated", message: "Iskandar Waterfront score recalculated.", time: "1d ago", read: true, type: "info" },
];
