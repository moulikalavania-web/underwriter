/**
 * TEST FIXTURE: the fictional producer registry and sanctions watchlist that used to be built into the application.
 * The application ships neither (a real deployment connects NIPR / state licensing data and a licensed sanctions list).
 * The names, NPNs and licence numbers below are invented.
 */
SANCTIONS_WATCHLIST.length = 0;
[
  { name: "Northwind Demo Sanctioned Holdings", aliases: ["Northwind DSH"], type: "entity", program: "DEMO-A" },
  { name: "Zarvan Trading Demo", aliases: ["Zarvan Demo Trading Co"], type: "entity", program: "DEMO-A" },
  { name: "Crimson Harbor Shipping Demo", aliases: [], type: "entity", program: "DEMO-B" },
  { name: "Ivan Demoff", aliases: ["Ivan Demov"], type: "individual", program: "DEMO-B" },
  { name: "Test Blocked Person", aliases: [], type: "individual", program: "DEMO-C" },
  { name: "Obsidian Freight Demo Group", aliases: ["Obsidian Freight Demo"], type: "entity", program: "DEMO-C" }
].forEach(function (e) { SANCTIONS_WATCHLIST.push(e); });
SANCTIONS_LIST_NAME = "TEST WATCHLIST (fictional — not the OFAC SDN list)";
SANCTIONS_LIST_VERSION = "test-2026-10";

PRODUCER_REGISTRY.length = 0;
[
  {
    names: ["Marsh & McLennan Commercial Brokerage", "Marsh & McLennan"],
    npn: "90000001",
    licenses: [
      { state: "TX", number: "TX-DEMO-100001", lines: ["Property & Casualty", "Surplus Lines"], status: "Active", expires: "2027-03-31" },
      { state: "CA", number: "CA-DEMO-100001", lines: ["Property & Casualty", "Surplus Lines"], status: "Active", expires: "2027-01-31" }
    ],
    appointments: [
      { carrier: "Vikram & Sons", state: "TX", lobs: ["trucking", "property", "mpl", "gl_cpc", "gl_cas"], status: "Active", effective: "2026-01-01" },
      { carrier: "Vikram & Sons", state: "CA", lobs: ["gl_cas"], status: "Active", effective: "2026-01-01" }
    ]
  },
  {
    names: ["Arora & Sons"],
    npn: "90000002",
    licenses: [{ state: "TX", number: "TX-DEMO-200002", lines: ["Property & Casualty"], status: "Active", expires: "2027-06-30" }],
    appointments: [{ carrier: "Vikram & Sons", state: "TX", lobs: ["trucking"], status: "Active", effective: "2026-01-01" }]
  },
  {
    // Licensed, but appointed only for GL CPC — a property submission fails on appointment.
    names: ["Aon Commercial Risk Solutions"],
    npn: "90000003",
    licenses: [{ state: "TX", number: "TX-DEMO-300003", lines: ["Property & Casualty", "Surplus Lines"], status: "Active", expires: "2027-02-28" }],
    appointments: [{ carrier: "Vikram & Sons", state: "TX", lobs: ["gl_cpc"], status: "Active", effective: "2026-03-01" }]
  },
  {
    // Licence lapsed — fails on licence even though the appointment is active.
    names: ["Willis Towers Watson Commercial"],
    npn: "90000004",
    licenses: [{ state: "MA", number: "MA-DEMO-400004", lines: ["Property & Casualty", "Surplus Lines"], status: "Active", expires: "2026-06-30" }],
    appointments: [{ carrier: "Vikram & Sons", state: "MA", lobs: ["mpl"], status: "Active", effective: "2026-01-01" }]
  },
  {
    names: ["Gallagher Commercial Brokers"],
    npn: "90000005",
    licenses: [{ state: "OH", number: "OH-DEMO-500005", lines: ["Property & Casualty", "Surplus Lines"], status: "Active", expires: "2027-04-30" }],
    appointments: [{ carrier: "Vikram & Sons", state: "OH", lobs: ["gl_cpc"], status: "Active", effective: "2026-02-01" }]
  },
  {
    // Licensed in Texas, no appointment on file with the carrier.
    names: ["Amwins Specialty Wholesale Brokerage"],
    npn: "90000006",
    licenses: [{ state: "TX", number: "TX-DEMO-600006", lines: ["Property & Casualty", "Surplus Lines"], status: "Active", expires: "2027-05-31" }],
    appointments: []
  }
].forEach(function (r) { PRODUCER_REGISTRY.push(r); });
