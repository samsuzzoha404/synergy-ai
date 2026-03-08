export type LeadStatus = "New" | "In Review" | "Under Review" | "Assigned" | "Duplicate Alert" | "Won" | "Lost" | "Merged" | "Discarded";
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
  /** Primary BU this lead is matched to — used for Sales_Rep RBAC filtering. */
  top_match_bu?: string;
}

// ── BU_Name values must exactly mirror the union in AuthContext.tsx ──────────
export const BU_NAMES = [
  'Stucken AAC',
  'Ajiya Metal / Glass',
  'PPG Hing',
  'Signature Alliance',
  'Signature Kitchen',
  'Fiamma Holding',
  'G-Cast',
] as const;

export const leads: Lead[] = [
  // ═══════════════════════════════════════════════════════════
  // BUSINESS UNIT: Stucken AAC
  // High-rise condos, massive residential blocks (RM 50M–100M)
  // ═══════════════════════════════════════════════════════════
  {
    id: "L001",
    projectName: "Avantro Residences Phase 2",
    location: "Mont Kiara, KL",
    value: 68_000_000,
    stage: "Tender",
    type: "High-Rise",
    status: "In Review",
    developer: "Avantro Development Sdn Bhd",
    floors: 42,
    gfa: 85000,
    assignedTo: "Ahmad Razif",
    matches: [
      { bu: "Stucken AAC", score: 92, color: "hsl(217, 91%, 50%)" },
      { bu: "Ajiya Metal / Glass", score: 78, color: "hsl(199, 89%, 48%)" },
      { bu: "Signature Kitchen", score: 65, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Starken AAC Blocks", bu: "Stucken AAC" },
      { product: "Ajiya Glass Facade", bu: "Ajiya Metal / Glass" },
      { product: "Signature Kitchen Sets", bu: "Signature Kitchen" },
      { product: "Fiamma Sanitary Ware", bu: "Fiamma Holding" },
    ],
    aiRationale: "Based on 47 historical High-Rise projects in Mont Kiara & KL Sentral corridor, AAC lightweight blocks are specified in 89% of cases. Glass facade demand is driven by GBI certification requirements. Cross-selling Signature Kitchen has yielded RM 3.2M in additional revenue from similar projects.",
    createdDate: "2025-06-01",
    top_match_bu: "Stucken AAC",
  },
  {
    id: "L002",
    projectName: "Twin Towers Grand Reno",
    location: "KLCC, KL",
    value: 98_000_000,
    stage: "Construction",
    type: "High-Rise",
    status: "Duplicate Alert",
    developer: "Petronas Properties Sdn Bhd",
    floors: 88,
    gfa: 400000,
    isDuplicate: true,
    duplicateOf: "L003-ORIG",
    matches: [
      { bu: "Stucken AAC", score: 88, color: "hsl(217, 91%, 50%)" },
      { bu: "Ajiya Metal / Glass", score: 72, color: "hsl(199, 89%, 48%)" },
    ],
    crossSell: [
      { product: "Premium AAC Blocks", bu: "Stucken AAC" },
      { product: "Fire-Rated Glass Panels", bu: "Ajiya Metal / Glass" },
    ],
    aiRationale: "Large-scale renovation of iconic towers requires premium-grade fire-rated materials. Stucken's specialty AAC products are certified for this class of building under MS1722.",
    createdDate: "2025-06-08",
    top_match_bu: "Stucken AAC",
  },
  {
    id: "L003",
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
      { bu: "Stucken AAC", score: 90, color: "hsl(217, 91%, 50%)" },
      { bu: "Ajiya Metal / Glass", score: 82, color: "hsl(199, 89%, 48%)" },
      { bu: "Signature Kitchen", score: 70, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Starken AAC Blocks", bu: "Stucken AAC" },
      { product: "Ajiya Curtain Wall System", bu: "Ajiya Metal / Glass" },
      { product: "Signature Kitchen Sets", bu: "Signature Kitchen" },
    ],
    aiRationale: "High-value waterfront projects in Iskandar are Singapore-standard in specification. Premium AAC blocks and curtain wall systems are near-universal for this segment.",
    createdDate: "2025-06-10",
    top_match_bu: "Stucken AAC",
  },
  {
    id: "L004",
    projectName: "Pavilion Damansara Heights Residences",
    location: "Damansara Heights, KL",
    value: 85_000_000,
    stage: "Planning",
    type: "High-Rise",
    status: "New",
    developer: "Pavilion Group Sdn Bhd",
    floors: 52,
    gfa: 118000,
    matches: [
      { bu: "Stucken AAC", score: 91, color: "hsl(217, 91%, 50%)" },
      { bu: "Signature Kitchen", score: 76, color: "hsl(262, 80%, 56%)" },
      { bu: "Fiamma Holding", score: 60, color: "hsl(330, 80%, 55%)" },
    ],
    crossSell: [
      { product: "Starken Premium Blocks", bu: "Stucken AAC" },
      { product: "Signature Kitchen Cabinets", bu: "Signature Kitchen" },
      { product: "Fiamma Appliance Bundle", bu: "Fiamma Holding" },
    ],
    aiRationale: "High-end residential towers in Damansara Heights command premium specifications. AAC lightweight blocks reduce structural load, enabling taller builds. Kitchen and appliance bundles are standard for GBI-certified luxury condos.",
    createdDate: "2025-07-01",
    top_match_bu: "Stucken AAC",
  },
  {
    id: "L005",
    projectName: "Tropicana Aman Parcel J",
    location: "Kota Kemuning, Selangor",
    value: 62_000_000,
    stage: "Tender",
    type: "High-Rise",
    status: "Assigned",
    developer: "Tropicana Corporation Bhd",
    floors: 38,
    gfa: 92000,
    assignedTo: "Nurul Aina",
    matches: [
      { bu: "Stucken AAC", score: 87, color: "hsl(217, 91%, 50%)" },
      { bu: "Signature Kitchen", score: 68, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Starken AAC Blocks", bu: "Stucken AAC" },
      { product: "Signature Kitchen Sets", bu: "Signature Kitchen" },
      { product: "Fiamma Home Appliances", bu: "Fiamma Holding" },
    ],
    aiRationale: "Tropicana residential parcels historically adopt AAC blocks for 91% of their high-rise towers. Kitchen packages from Signature yield strong bundled margins.",
    createdDate: "2025-07-05",
    top_match_bu: "Stucken AAC",
  },
  {
    id: "L006",
    projectName: "M Vertica Phase 3 — Tower B",
    location: "Cheras, KL",
    value: 75_000_000,
    stage: "Construction",
    type: "High-Rise",
    status: "In Review",
    developer: "Mah Sing Group Bhd",
    floors: 45,
    gfa: 102000,
    matches: [
      { bu: "Stucken AAC", score: 89, color: "hsl(217, 91%, 50%)" },
      { bu: "Ajiya Metal / Glass", score: 74, color: "hsl(199, 89%, 48%)" },
      { bu: "Fiamma Holding", score: 58, color: "hsl(330, 80%, 55%)" },
    ],
    crossSell: [
      { product: "Starken Lite AAC Blocks", bu: "Stucken AAC" },
      { product: "Ajiya Sliding Glass Doors", bu: "Ajiya Metal / Glass" },
      { product: "Fiamma Kitchen Appliances", bu: "Fiamma Holding" },
    ],
    aiRationale: "Mah Sing's M-series towers are AAC-first by internal specification mandate. Phase 3 construction offers prime window for early material binding.",
    createdDate: "2025-07-10",
    top_match_bu: "Stucken AAC",
  },

  // ═══════════════════════════════════════════════════════════
  // BUSINESS UNIT: Ajiya Metal / Glass
  // Commercial towers, industrial factories, roofing (RM 20M–80M)
  // ═══════════════════════════════════════════════════════════
  {
    id: "L007",
    projectName: "Menara SkyTech KL Sentral",
    location: "KL Sentral, KL",
    value: 55_000_000,
    stage: "Tender",
    type: "Commercial",
    status: "New",
    developer: "KL Sentral Development Sdn Bhd",
    floors: 35,
    gfa: 96000,
    matches: [
      { bu: "Ajiya Metal / Glass", score: 93, color: "hsl(199, 89%, 48%)" },
      { bu: "Signature Alliance", score: 71, color: "hsl(262, 80%, 56%)" },
      { bu: "Stucken AAC", score: 62, color: "hsl(217, 91%, 50%)" },
    ],
    crossSell: [
      { product: "Ajiya Curtain Wall System", bu: "Ajiya Metal / Glass" },
      { product: "Signature Lobby Fit-Out", bu: "Signature Alliance" },
      { product: "Starken AAC Blocks", bu: "Stucken AAC" },
    ],
    aiRationale: "Grade-A commercial towers in KL Sentral demand full curtain wall glazing for corporate image. Ajiya's low-e glass is LEED Gold compatible — mandatory for this precinct.",
    createdDate: "2025-06-15",
    top_match_bu: "Ajiya Metal / Glass",
  },
  {
    id: "L008",
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
      { bu: "Ajiya Metal / Glass", score: 91, color: "hsl(199, 89%, 48%)" },
      { bu: "Stucken AAC", score: 83, color: "hsl(217, 91%, 50%)" },
      { bu: "Signature Alliance", score: 70, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Ajiya Low-E Thermal Glass", bu: "Ajiya Metal / Glass" },
      { product: "Starken AAC Blocks", bu: "Stucken AAC" },
      { product: "Signature Lobby Tiles", bu: "Signature Alliance" },
    ],
    aiRationale: "Green-rated commercial towers in KL Eco City demand Low-E glass for LEED compliance. Ajiya's thermal glass portfolio has 100% track record here.",
    createdDate: "2025-05-20",
    top_match_bu: "Ajiya Metal / Glass",
  },
  {
    id: "L009",
    projectName: "Subang SkyPark Terminal 3 Extension",
    location: "Subang, Selangor",
    value: 58_000_000,
    stage: "Planning",
    type: "Commercial",
    status: "New",
    developer: "Subang Skypark Sdn Bhd",
    floors: 4,
    gfa: 48000,
    matches: [
      { bu: "Ajiya Metal / Glass", score: 89, color: "hsl(199, 89%, 48%)" },
      { bu: "G-Cast", score: 72, color: "hsl(142, 76%, 36%)" },
    ],
    crossSell: [
      { product: "Ajiya Structural Glass Facade", bu: "Ajiya Metal / Glass" },
      { product: "Ajiya Metal Roofing", bu: "Ajiya Metal / Glass" },
      { product: "G-Cast Structural Slabs", bu: "G-Cast" },
    ],
    aiRationale: "Aviation terminal extensions require large-span structural glass and metal roofing systems. Ajiya holds the DCA-approved supplier certification for this category.",
    createdDate: "2025-06-20",
    top_match_bu: "Ajiya Metal / Glass",
  },
  {
    id: "L010",
    projectName: "Gamuda Cove Retail & Lifestyle Hub",
    location: "Puncak Alam, Selangor",
    value: 38_000_000,
    stage: "Tender",
    type: "Commercial",
    status: "In Review",
    developer: "Gamuda Land Sdn Bhd",
    floors: 5,
    gfa: 62000,
    matches: [
      { bu: "Ajiya Metal / Glass", score: 85, color: "hsl(199, 89%, 48%)" },
      { bu: "Signature Alliance", score: 68, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Ajiya Aluminium Composite Panel", bu: "Ajiya Metal / Glass" },
      { product: "Signature Commercial Flooring", bu: "Signature Alliance" },
      { product: "PPG Hing Steel Framing", bu: "PPG Hing" },
    ],
    aiRationale: "Gamuda developments favour ACP cladding for distinct branding. Ajiya's MetalCoat series has been specified on 4 previous Gamuda commercial projects.",
    createdDate: "2025-07-02",
    top_match_bu: "Ajiya Metal / Glass",
  },
  {
    id: "L011",
    projectName: "Selangor Science Park Factory Block D",
    location: "Shah Alam, Selangor",
    value: 26_000_000,
    stage: "Planning",
    type: "Industrial",
    status: "New",
    developer: "Scientex Bhd",
    floors: 4,
    gfa: 22000,
    matches: [
      { bu: "Ajiya Metal / Glass", score: 82, color: "hsl(199, 89%, 48%)" },
      { bu: "G-Cast", score: 75, color: "hsl(142, 76%, 36%)" },
    ],
    crossSell: [
      { product: "Ajiya Metal Roofing Sheets", bu: "Ajiya Metal / Glass" },
      { product: "Ajiya IBR Cladding", bu: "Ajiya Metal / Glass" },
      { product: "G-Cast Precast Floor Slabs", bu: "G-Cast" },
    ],
    aiRationale: "Industrial factories in Shah Alam Science Park adopt metal roofing in 97% of builds. Ajiya's IBR profile is the market-leading supplier for PKNS-linked industrial estates.",
    createdDate: "2025-07-08",
    top_match_bu: "Ajiya Metal / Glass",
  },
  {
    id: "L012",
    projectName: "Port Klang Mega Warehouse Complex",
    location: "Port Klang, Selangor",
    value: 22_000_000,
    stage: "Construction",
    type: "Industrial",
    status: "Assigned",
    developer: "Westports Holdings Bhd",
    floors: 3,
    gfa: 38000,
    assignedTo: "Harvin Singh",
    matches: [
      { bu: "Ajiya Metal / Glass", score: 80, color: "hsl(199, 89%, 48%)" },
      { bu: "PPG Hing", score: 64, color: "hsl(38, 92%, 50%)" },
    ],
    crossSell: [
      { product: "Ajiya Colour-Coated Steel Roofing", bu: "Ajiya Metal / Glass" },
      { product: "PPG Hing Industrial Paint", bu: "PPG Hing" },
    ],
    aiRationale: "Port logistics warehouses require corrosion-resistant colour-coated roofing. Ajiya's marine-grade panel coating is certified for salt-air environments.",
    createdDate: "2025-07-12",
    top_match_bu: "Ajiya Metal / Glass",
  },

  // ═══════════════════════════════════════════════════════════
  // BUSINESS UNIT: G-Cast
  // Precast concrete for bridges, infrastructure, LRT (RM 100M+)
  // ═══════════════════════════════════════════════════════════
  {
    id: "L013",
    projectName: "MRT3 Circle Line — Sunway Section Viaduct",
    location: "Petaling Jaya, Selangor",
    value: 280_000_000,
    stage: "Tender",
    type: "Infrastructure",
    status: "In Review",
    developer: "Mass Rapid Transit Corp Sdn Bhd",
    matches: [
      { bu: "G-Cast", score: 96, color: "hsl(142, 76%, 36%)" },
      { bu: "Stucken AAC", score: 48, color: "hsl(217, 91%, 50%)" },
    ],
    crossSell: [
      { product: "G-Cast U-Beam Segments", bu: "G-Cast" },
      { product: "G-Cast Station Platform Slabs", bu: "G-Cast" },
    ],
    aiRationale: "MRT precast viaduct projects exclusively use certified precast U-beams. G-Cast holds MRT Corp's preferred vendor status for all Circle Line contracts, backed by RM 890M delivered across MRT1 & MRT2.",
    createdDate: "2025-06-18",
    top_match_bu: "G-Cast",
  },
  {
    id: "L014",
    projectName: "Putrajaya Federal Administrative Complex",
    location: "Putrajaya, WP Putrajaya",
    value: 310_000_000,
    stage: "Tender",
    type: "Infrastructure",
    status: "New",
    developer: "Jabatan Kerja Raya Malaysia",
    floors: 20,
    gfa: 320000,
    matches: [
      { bu: "G-Cast", score: 88, color: "hsl(142, 76%, 36%)" },
      { bu: "Stucken AAC", score: 75, color: "hsl(217, 91%, 50%)" },
    ],
    crossSell: [
      { product: "G-Cast Structural Wall Panels", bu: "G-Cast" },
      { product: "G-Cast Column Elements", bu: "G-Cast" },
      { product: "Starken Blocks — Partition", bu: "Stucken AAC" },
    ],
    aiRationale: "JKR infrastructure projects above RM 300M mandate CIDB-certified local precast for structural speed. G-Cast has won 7 of the last 9 federal tenders in Putrajaya precinct.",
    createdDate: "2025-06-12",
    top_match_bu: "G-Cast",
  },
  {
    id: "L015",
    projectName: "Penang Second Bridge Southern Approach Viaduct",
    location: "Batu Kawan, Penang",
    value: 450_000_000,
    stage: "Planning",
    type: "Infrastructure",
    status: "New",
    developer: "Penang Development Corporation",
    matches: [
      { bu: "G-Cast", score: 94, color: "hsl(142, 76%, 36%)" },
    ],
    crossSell: [
      { product: "G-Cast Box Girder Segments", bu: "G-Cast" },
      { product: "G-Cast Piling Elements", bu: "G-Cast" },
    ],
    aiRationale: "Marine bridge projects of this scale mandate pre-stressed precast box girders. G-Cast is one of only 2 CIDB Grade 7-certified precast suppliers in Malaysia with sea-zone coating capability.",
    createdDate: "2025-07-03",
    top_match_bu: "G-Cast",
  },
  {
    id: "L016",
    projectName: "LRT3 Bandar Utama Station Expansion",
    location: "Petaling Jaya, Selangor",
    value: 190_000_000,
    stage: "Construction",
    type: "Infrastructure",
    status: "Assigned",
    developer: "Prasarana Malaysia Bhd",
    assignedTo: "Rizal Hakim",
    matches: [
      { bu: "G-Cast", score: 91, color: "hsl(142, 76%, 36%)" },
      { bu: "Ajiya Metal / Glass", score: 65, color: "hsl(199, 89%, 48%)" },
    ],
    crossSell: [
      { product: "G-Cast Platform Edge Slab", bu: "G-Cast" },
      { product: "G-Cast Retaining Wall Panels", bu: "G-Cast" },
      { product: "Ajiya Station Canopy Glazing", bu: "Ajiya Metal / Glass" },
    ],
    aiRationale: "LRT station expansion requires precast platform slabs and retaining structures that can be installed within tight rail-possession windows. G-Cast's just-in-time delivery model is critical here.",
    createdDate: "2025-06-25",
    top_match_bu: "G-Cast",
  },
  {
    id: "L017",
    projectName: "Batu Pahat Flood Mitigation Barrage",
    location: "Batu Pahat, Johor",
    value: 125_000_000,
    stage: "Planning",
    type: "Infrastructure",
    status: "New",
    developer: "Jabatan Pengairan dan Saliran Johor",
    matches: [
      { bu: "G-Cast", score: 86, color: "hsl(142, 76%, 36%)" },
    ],
    crossSell: [
      { product: "G-Cast Precast Box Culverts", bu: "G-Cast" },
      { product: "G-Cast Flood Gate Pillars", bu: "G-Cast" },
    ],
    aiRationale: "DID flood infrastructure projects mandate precast concrete box culverts for speed and water-tightness. G-Cast's culvert systems have a 15-year track record with JPS nationwide.",
    createdDate: "2025-07-15",
    top_match_bu: "G-Cast",
  },

  // ═══════════════════════════════════════════════════════════
  // BUSINESS UNIT: Signature Alliance
  // Corporate office fit-outs, commercial interiors (RM 5M–15M)
  // ═══════════════════════════════════════════════════════════
  {
    id: "L018",
    projectName: "CIMB Group KL Sentral HQ — Full Floor Fit-Out",
    location: "KL Sentral, KL",
    value: 12_500_000,
    stage: "Tender",
    type: "Commercial",
    status: "In Review",
    developer: "CIMB Group Holdings Bhd",
    floors: 3,
    gfa: 14000,
    assignedTo: "Sherene Lim",
    matches: [
      { bu: "Signature Alliance", score: 94, color: "hsl(262, 80%, 56%)" },
      { bu: "Ajiya Metal / Glass", score: 58, color: "hsl(199, 89%, 48%)" },
    ],
    crossSell: [
      { product: "Signature Raised Access Flooring", bu: "Signature Alliance" },
      { product: "Signature Acoustic Partition System", bu: "Signature Alliance" },
      { product: "Ajiya Frameless Glass Partitions", bu: "Ajiya Metal / Glass" },
    ],
    aiRationale: "Banking sector fit-outs require Grade-A raised access flooring for data cable management. Signature Alliance's CIMB track record (3 previous floors) gives high conversion probability.",
    createdDate: "2025-06-22",
    top_match_bu: "Signature Alliance",
  },
  {
    id: "L019",
    projectName: "Sime Darby Regional Office — Section 16 PJ",
    location: "Petaling Jaya, Selangor",
    value: 8_200_000,
    stage: "Planning",
    type: "Commercial",
    status: "New",
    developer: "Sime Darby Property Bhd",
    floors: 2,
    gfa: 9500,
    matches: [
      { bu: "Signature Alliance", score: 89, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Signature Carpeting & Vinyl", bu: "Signature Alliance" },
      { product: "Signature Integrated Ceiling System", bu: "Signature Alliance" },
    ],
    aiRationale: "Plantation and property conglomerates consistently opt for Signature Alliance's mid-premium interior package — strong corporate brand alignment with neutral BIM-ready specifications.",
    createdDate: "2025-07-01",
    top_match_bu: "Signature Alliance",
  },
  {
    id: "L020",
    projectName: "Pavilion Hotel KLCC Lobby & Ballroom Reno",
    location: "KLCC, KL",
    value: 6_800_000,
    stage: "Construction",
    type: "Commercial",
    status: "Assigned",
    developer: "Urusharta Cemerlang Sdn Bhd",
    assignedTo: "Elaine Koh",
    matches: [
      { bu: "Signature Alliance", score: 92, color: "hsl(262, 80%, 56%)" },
      { bu: "Ajiya Metal / Glass", score: 62, color: "hsl(199, 89%, 48%)" },
    ],
    crossSell: [
      { product: "Signature Luxury Marble Tiles", bu: "Signature Alliance" },
      { product: "Signature Custom Millwork", bu: "Signature Alliance" },
      { product: "Ajiya Decorative Mirror Glass", bu: "Ajiya Metal / Glass" },
    ],
    aiRationale: "5-star hotel lobby renovations demand bespoke millwork and large-format stone tiles. Signature Alliance holds 3 active hotel references — strong conversion signal.",
    createdDate: "2025-06-28",
    top_match_bu: "Signature Alliance",
  },
  {
    id: "L021",
    projectName: "EcoWorld Commercial Park Phase 2 — Interiors",
    location: "Eco Botanic, Johor Bahru",
    value: 14_000_000,
    stage: "Tender",
    type: "Commercial",
    status: "New",
    developer: "Eco World Development Group Bhd",
    floors: 5,
    gfa: 16000,
    matches: [
      { bu: "Signature Alliance", score: 88, color: "hsl(262, 80%, 56%)" },
      { bu: "PPG Hing", score: 55, color: "hsl(38, 92%, 50%)" },
    ],
    crossSell: [
      { product: "Signature Commercial Flooring", bu: "Signature Alliance" },
      { product: "Signature Office Partitioning", bu: "Signature Alliance" },
      { product: "PPG Hing Ceiling Materials", bu: "PPG Hing" },
    ],
    aiRationale: "EcoWorld commercial parks are spec-built for corporate tenants with GBI certification targets. Signature's full-turnkey interior package aligns with their sustainability scoring.",
    createdDate: "2025-07-09",
    top_match_bu: "Signature Alliance",
  },
  {
    id: "L022",
    projectName: "IOI City Mall Office Tower Fit-Out",
    location: "Putrajaya, WP Putrajaya",
    value: 11_000_000,
    stage: "Planning",
    type: "Commercial",
    status: "New",
    developer: "IOI Properties Group Bhd",
    floors: 4,
    gfa: 12000,
    matches: [
      { bu: "Signature Alliance", score: 86, color: "hsl(262, 80%, 56%)" },
      { bu: "Ajiya Metal / Glass", score: 60, color: "hsl(199, 89%, 48%)" },
    ],
    crossSell: [
      { product: "Signature Raised Access Flooring", bu: "Signature Alliance" },
      { product: "Signature Feature Ceiling", bu: "Signature Alliance" },
      { product: "Ajiya Structural Glass Walls", bu: "Ajiya Metal / Glass" },
    ],
    aiRationale: "IOI's strata office towers target Fortune 500 tenants. Premium fit-out packages from Signature Alliance increase lettable value by an average of RM 12 psf.",
    createdDate: "2025-07-14",
    top_match_bu: "Signature Alliance",
  },

  // ═══════════════════════════════════════════════════════════
  // BUSINESS UNIT: Signature Kitchen
  // Luxury condo kitchen cabinets, residential development (RM 2M–10M)
  // ═══════════════════════════════════════════════════════════
  {
    id: "L023",
    projectName: "One Devonshire Luxury Condo — Kitchen Package",
    location: "Jalan Devonshire, KL",
    value: 4_200_000,
    stage: "Construction",
    type: "High-Rise",
    status: "Assigned",
    developer: "UEM Sunrise Bhd",
    floors: 40,
    gfa: 58000,
    assignedTo: "Priya Menon",
    matches: [
      { bu: "Signature Kitchen", score: 95, color: "hsl(262, 80%, 56%)" },
      { bu: "Fiamma Holding", score: 72, color: "hsl(330, 80%, 55%)" },
    ],
    crossSell: [
      { product: "Signature Designer Kitchen Cabinets", bu: "Signature Kitchen" },
      { product: "Signature Quartz Countertops", bu: "Signature Kitchen" },
      { product: "Fiamma Built-In Appliances Bundle", bu: "Fiamma Holding" },
    ],
    aiRationale: "UEM Sunrise premium condos in Jalan Devonshire command RM 1,800/sqft and above. Signature Kitchen's Italian-series cabinets are specified by the developer's ID partner for 100% of units.",
    createdDate: "2025-06-16",
    top_match_bu: "Signature Kitchen",
  },
  {
    id: "L024",
    projectName: "The Vyne @ Sunway South Quay Kitchen Package",
    location: "Subang Jaya, Selangor",
    value: 7_500_000,
    stage: "Tender",
    type: "High-Rise",
    status: "In Review",
    developer: "Sunway Bhd",
    floors: 48,
    gfa: 88000,
    matches: [
      { bu: "Signature Kitchen", score: 91, color: "hsl(262, 80%, 56%)" },
      { bu: "Fiamma Holding", score: 68, color: "hsl(330, 80%, 55%)" },
    ],
    crossSell: [
      { product: "Signature Modular Kitchen Sets", bu: "Signature Kitchen" },
      { product: "Signature Wardrobe Packages", bu: "Signature Kitchen" },
      { product: "Fiamma Appliance Packages", bu: "Fiamma Holding" },
    ],
    aiRationale: "Sunway's waterfront residential developments consistently use Signature Kitchen for its Sunway-group approved vendor status. Strong brand synergy with Signature Alliance for common area millwork.",
    createdDate: "2025-06-30",
    top_match_bu: "Signature Kitchen",
  },
  {
    id: "L025",
    projectName: "Desa ParkCity The Tuileries Kitchen Package",
    location: "Kepong, KL",
    value: 5_200_000,
    stage: "Planning",
    type: "High-Rise",
    status: "New",
    developer: "ParkCity Management Corporation",
    floors: 36,
    gfa: 70000,
    matches: [
      { bu: "Signature Kitchen", score: 88, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Signature Timber-Finish Cabinets", bu: "Signature Kitchen" },
      { product: "Fiamma Freestanding Appliances", bu: "Fiamma Holding" },
    ],
    aiRationale: "Desa ParkCity's master-planned community specifies natural-finish kitchen cabinets to complement its biophilic design ethos. Signature Kitchen is the only approved supplier with FSC-certified timber laminates.",
    createdDate: "2025-07-06",
    top_match_bu: "Signature Kitchen",
  },
  {
    id: "L026",
    projectName: "Setia Sky 88 JB — Kitchen & Wardrobe Package",
    location: "Johor Bahru, Johor",
    value: 8_000_000,
    stage: "Construction",
    type: "High-Rise",
    status: "Won",
    developer: "SP Setia Bhd",
    floors: 58,
    gfa: 115000,
    assignedTo: "James Loo",
    matches: [
      { bu: "Signature Kitchen", score: 93, color: "hsl(262, 80%, 56%)" },
      { bu: "Fiamma Holding", score: 75, color: "hsl(330, 80%, 55%)" },
    ],
    crossSell: [
      { product: "Signature Ultra Kitchen Cabinets", bu: "Signature Kitchen" },
      { product: "Signature Built-In Wardrobe", bu: "Signature Kitchen" },
      { product: "Fiamma Hob & Hood Package", bu: "Fiamma Holding" },
    ],
    aiRationale: "Sky 88 targets Singapore buyers and expats — ultra-premium kitchen finishes are non-negotiable. Signature's SG-listed showroom presence reinforces brand trust for this segment.",
    createdDate: "2025-05-25",
    top_match_bu: "Signature Kitchen",
  },
  {
    id: "L027",
    projectName: "Kota Damansara Luxury Villa Kitchen Supply",
    location: "Kota Damansara, Selangor",
    value: 3_000_000,
    stage: "Planning",
    type: "Commercial",
    status: "New",
    developer: "Dijaya Corporation Bhd",
    matches: [
      { bu: "Signature Kitchen", score: 84, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Signature Bespoke Island Kitchen", bu: "Signature Kitchen" },
      { product: "Fiamma Wine Cooler & Oven", bu: "Fiamma Holding" },
    ],
    aiRationale: "Luxury landed villa kitchens command larger per-unit kitchen budgets (avg RM 85K/unit). Signature's bespoke island tops are the flagship product for this segment.",
    createdDate: "2025-07-11",
    top_match_bu: "Signature Kitchen",
  },

  // ═══════════════════════════════════════════════════════════
  // BUSINESS UNIT: Fiamma Holding
  // Bulk home appliances for completed residential projects (RM 1M–5M)
  // ═══════════════════════════════════════════════════════════
  {
    id: "L028",
    projectName: "Hana Residences Bukit Jalil — Appliance Package",
    location: "Bukit Jalil, KL",
    value: 2_100_000,
    stage: "Construction",
    type: "High-Rise",
    status: "Assigned",
    developer: "Nusmetro Group Sdn Bhd",
    floors: 32,
    gfa: 44000,
    assignedTo: "Lee Mei Shan",
    matches: [
      { bu: "Fiamma Holding", score: 96, color: "hsl(330, 80%, 55%)" },
      { bu: "Signature Kitchen", score: 55, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Fiamma Slim Hob + Hood Package", bu: "Fiamma Holding" },
      { product: "Fiamma Water Heater (280 units)", bu: "Fiamma Holding" },
    ],
    aiRationale: "Developer-supplied appliance packages for affordable-luxury condos yield RM 7,500/unit average at high margin. Fiamma's bulk purchase programme is tailored for 200+ unit developments.",
    createdDate: "2025-06-23",
    top_match_bu: "Fiamma Holding",
  },
  {
    id: "L029",
    projectName: "Ativo Suites Mont Kiara — Appliance Bundle",
    location: "Mont Kiara, KL",
    value: 3_200_000,
    stage: "Tender",
    type: "High-Rise",
    status: "New",
    developer: "Ativo Properties Sdn Bhd",
    floors: 38,
    gfa: 62000,
    matches: [
      { bu: "Fiamma Holding", score: 91, color: "hsl(330, 80%, 55%)" },
      { bu: "Signature Kitchen", score: 65, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Fiamma Premium Built-In Oven", bu: "Fiamma Holding" },
      { product: "Fiamma Inverter Aircon Package", bu: "Fiamma Holding" },
      { product: "Signature Kitchen Cabinets", bu: "Signature Kitchen" },
    ],
    aiRationale: "Mont Kiara serviced suites target corporate tenants who expect Bosch or Miele-equivalent appliances. Fiamma's Euro-brand range meets this spec at a competitive bulk price.",
    createdDate: "2025-07-04",
    top_match_bu: "Fiamma Holding",
  },
  {
    id: "L030",
    projectName: "M Aruna @ Rawang Home Appliance Supply",
    location: "Rawang, Selangor",
    value: 1_800_000,
    stage: "Planning",
    type: "High-Rise",
    status: "New",
    developer: "Mah Sing Group Bhd",
    floors: 18,
    gfa: 28000,
    matches: [
      { bu: "Fiamma Holding", score: 88, color: "hsl(330, 80%, 55%)" },
    ],
    crossSell: [
      { product: "Fiamma Economy Hob & Hood", bu: "Fiamma Holding" },
      { product: "Fiamma Instant Water Heater", bu: "Fiamma Holding" },
    ],
    aiRationale: "Mah Sing's M-series mid-market projects have a standardised appliance procurement process. Fiamma is a registered Mah Sing preferred vendor — conversion probability is very high.",
    createdDate: "2025-07-10",
    top_match_bu: "Fiamma Holding",
  },
  {
    id: "L031",
    projectName: "EcoMajestic Semenyih Serviced Apts",
    location: "Semenyih, Selangor",
    value: 2_500_000,
    stage: "Construction",
    type: "High-Rise",
    status: "In Review",
    developer: "Eco World Development Group Bhd",
    floors: 22,
    gfa: 35000,
    matches: [
      { bu: "Fiamma Holding", score: 89, color: "hsl(330, 80%, 55%)" },
    ],
    crossSell: [
      { product: "Fiamma Smart Home Appliance Pack", bu: "Fiamma Holding" },
      { product: "Fiamma Aircon Multi-Split System", bu: "Fiamma Holding" },
    ],
    aiRationale: "EcoWorld's Semenyih township is marketed as a smart-living development. Fiamma's IoT-enabled appliance bundles are a strong upsell with EcoWorld's app-controlled unit management system.",
    createdDate: "2025-06-26",
    top_match_bu: "Fiamma Holding",
  },
  {
    id: "L032",
    projectName: "Altura KL South — Residential Appliance Pack",
    location: "Cheras, KL",
    value: 4_000_000,
    stage: "Tender",
    type: "High-Rise",
    status: "New",
    developer: "Bukit Kiara Properties Sdn Bhd",
    floors: 42,
    gfa: 72000,
    matches: [
      { bu: "Fiamma Holding", score: 87, color: "hsl(330, 80%, 55%)" },
      { bu: "Signature Kitchen", score: 60, color: "hsl(262, 80%, 56%)" },
    ],
    crossSell: [
      { product: "Fiamma Hybrid Series Appliances", bu: "Fiamma Holding" },
      { product: "Signature Kitchen Countertops", bu: "Signature Kitchen" },
    ],
    aiRationale: "Altura's 580-unit tower is a major volume opportunity. Fiamma's hybrid appliance series (energy-saving with developer warranty coverage) is positioned strongly for this mid-premium segment.",
    createdDate: "2025-07-13",
    top_match_bu: "Fiamma Holding",
  },

  // ═══════════════════════════════════════════════════════════
  // BUSINESS UNIT: PPG Hing
  // Trading materials for general construction (RM 3M–12M)
  // ═══════════════════════════════════════════════════════════
  {
    id: "L033",
    projectName: "Klang Valley Mixed Dev — General Materials Supply",
    location: "Klang, Selangor",
    value: 8_500_000,
    stage: "Planning",
    type: "Commercial",
    status: "New",
    developer: "Aset Kayamas Sdn Bhd",
    matches: [
      { bu: "PPG Hing", score: 90, color: "hsl(38, 92%, 50%)" },
      { bu: "Stucken AAC", score: 55, color: "hsl(217, 91%, 50%)" },
    ],
    crossSell: [
      { product: "PPG Hing Cement & Aggregate Supply", bu: "PPG Hing" },
      { product: "PPG Hing Rebar & Steel Wire Mesh", bu: "PPG Hing" },
      { product: "Starken Blocks (AAC Partition)", bu: "Stucken AAC" },
    ],
    aiRationale: "Mid-sized mixed developments in Klang require one-stop-shop trading material suppliers. PPG Hing's logistics hubs in Klang Valley ensure same-day delivery — a critical procurement KPI.",
    createdDate: "2025-06-19",
    top_match_bu: "PPG Hing",
  },
  {
    id: "L034",
    projectName: "Penang Hill Eco-Tourism Facility Build",
    location: "Penang Hill, Penang",
    value: 5_000_000,
    stage: "Construction",
    type: "Commercial",
    status: "In Review",
    developer: "Penang Hill Corporation",
    matches: [
      { bu: "PPG Hing", score: 85, color: "hsl(38, 92%, 50%)" },
    ],
    crossSell: [
      { product: "PPG Hing Lightweight Materials", bu: "PPG Hing" },
      { product: "PPG Hing Waterproofing Systems", bu: "PPG Hing" },
    ],
    aiRationale: "Heritage-zone eco-tourism builds require lightweight construction materials to comply with MBPP heritage building restrictions. PPG Hing's curated lightweight catalogue has been prequalified for this project.",
    createdDate: "2025-06-27",
    top_match_bu: "PPG Hing",
  },
  {
    id: "L035",
    projectName: "Perak SDC Affordable Housing — Phase 3 Materials",
    location: "Ipoh, Perak",
    value: 10_000_000,
    stage: "Tender",
    type: "High-Rise",
    status: "Assigned",
    developer: "Perak State Development Corporation",
    assignedTo: "Zulhelmi Abd Razak",
    matches: [
      { bu: "PPG Hing", score: 88, color: "hsl(38, 92%, 50%)" },
      { bu: "Stucken AAC", score: 60, color: "hsl(217, 91%, 50%)" },
    ],
    crossSell: [
      { product: "PPG Hing Cement & Sand Supply", bu: "PPG Hing" },
      { product: "PPG Hing PVC Piping Package", bu: "PPG Hing" },
      { product: "Starken Standard AAC Blocks", bu: "Stucken AAC" },
    ],
    aiRationale: "Government affordable housing tenders require locally-sourced materials via Bumiputera-owned trading companies. PPG Hing's CIDB-registered status and Perak depot gives strong tender eligibility.",
    createdDate: "2025-07-07",
    top_match_bu: "PPG Hing",
  },
  {
    id: "L036",
    projectName: "Sabah Affordable Housing Programme — Supply",
    location: "Kota Kinabalu, Sabah",
    value: 12_000_000,
    stage: "Planning",
    type: "High-Rise",
    status: "New",
    developer: "Sabah Housing & Development Board",
    matches: [
      { bu: "PPG Hing", score: 87, color: "hsl(38, 92%, 50%)" },
    ],
    crossSell: [
      { product: "PPG Hing Structural Cement", bu: "PPG Hing" },
      { product: "PPG Hing MS Steel Bars", bu: "PPG Hing" },
    ],
    aiRationale: "Sabah LHDNB affordable housing programmes favour national trading companies with East Malaysia logistics capability. PPG Hing's Kota Kinabalu depot offers a strategic supply advantage.",
    createdDate: "2025-07-16",
    top_match_bu: "PPG Hing",
  },
  {
    id: "L037",
    projectName: "Negeri Sembilan Township Dev — Hardware Supply",
    location: "Seremban, Negeri Sembilan",
    value: 6_000_000,
    stage: "Tender",
    type: "Commercial",
    status: "New",
    developer: "Seremban Properties Sdn Bhd",
    matches: [
      { bu: "PPG Hing", score: 83, color: "hsl(38, 92%, 50%)" },
      { bu: "Stucken AAC", score: 52, color: "hsl(217, 91%, 50%)" },
    ],
    crossSell: [
      { product: "PPG Hing Hardware & Fittings", bu: "PPG Hing" },
      { product: "PPG Hing Waterproof Paint", bu: "PPG Hing" },
      { product: "Starken Partition Blocks", bu: "Stucken AAC" },
    ],
    aiRationale: "Township developments require broad-range hardware supply contracts covering 50+ material SKUs. PPG Hing's e-procurement portal integrates directly with Seremban Properties' SAP procurement module.",
    createdDate: "2025-07-17",
    top_match_bu: "PPG Hing",
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

/**
 * MockConflict — same shape as the API Conflict interface but with an extra
 * `top_match_bu` field used only for frontend RBAC filtering before the data
 * is merged into the TanStack Query cache.
 */
export interface MockConflict {
  id: string;
  lead_id: string;
  matched_lead_id: string;
  similarity_score: number;
  status: string;
  /** BU used to filter which Sales_Rep sees this conflict. */
  top_match_bu: string;
}

/**
 * Mock conflict queue — shown when the backend is unavailable.
 * Each entry mirrors a real Cosmos DB conflict document so the ConflictResolution
 * UI renders identically whether the data is live or mocked.
 *
 * RBAC filtering (same rules as mockLeads):
 *   Admin      → sees all mock conflicts
 *   Sales_Rep  → only sees conflicts whose top_match_bu matches their BU
 */
export const mockConflicts: MockConflict[] = [
  {
    // L002 (Twin Towers Grand Reno) was ingested after L003-ORIG; AI flagged 94% similarity.
    id: "MOCK-CONFLICT-001",
    lead_id: "L002",
    matched_lead_id: "L003-ORIG",
    similarity_score: 0.94,
    status: "Pending",
    top_match_bu: "Stucken AAC",
  },
];

export const kpiData = {
  totalLeads: { value: 842, trend: 15, label: "Total Leads", sublabel: "vs last quarter" },
  synergyPotential: { value: 320_000_000, trend: 22, label: "Synergy Potential", sublabel: "cross-sell revenue" },
  processingSpeed: { value: 10, trend: -97, label: "Processing Speed", sublabel: "reduced from 7 days", unit: "mins" },
  pendingActions: { value: 12, trend: -3, label: "Pending Actions", sublabel: "requires attention" },
};

export const leadsbyBU = [
  { bu: "Stucken AAC", leads: 287, value: 142 },
  { bu: "Ajiya Metal / Glass", leads: 234, value: 98 },
  { bu: "G-Cast", leads: 156, value: 67 },
  { bu: "Signature Alliance", leads: 112, value: 45 },
  { bu: "Signature Kitchen", leads: 88, value: 36 },
  { bu: "Fiamma Holding", leads: 53, value: 28 },
  { bu: "PPG Hing", leads: 41, value: 18 },
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
