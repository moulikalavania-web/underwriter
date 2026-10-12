/**
 * TEST FIXTURE: restricted users for the segregation suite (G31). The application ships only the Compliance Officer;
 * producers, program administrators and carrier auditors are added with registerExternalRole() when those people are
 * onboarded. These names are invented.
 */
registerExternalRole("broker_user", {
  name: "Jordan Reyes", title: "Producer, Marsh & McLennan Commercial Brokerage (External)", icon: "🤝",
  limit: 0, limitText: "External · own agency book only", description: "Broker user: sees only their own agency's submissions and quotes.",
  external: true, scope: { kind: "agency", agency: "Marsh & McLennan Commercial Brokerage" }
});
registerExternalRole("broker_user_2", {
  name: "Meera Arora", title: "Producer, Arora & Sons (External)", icon: "🤝",
  limit: 0, limitText: "External · own agency book only", description: "Broker user at a second agency; proves producers cannot see each other's business.",
  external: true, scope: { kind: "agency", agency: "Arora & Sons" }
});
registerExternalRole("mga_user", {
  name: "Taylor Brooks", title: "Program Administrator, Contractors GL Program (External)", icon: "🏗️",
  limit: 0, limitText: "External · program lines only", description: "Program or MGA administrator: sees only the lines of their program.",
  external: true, scope: { kind: "program", name: "Contractors GL Program", lobs: ["gl_cpc", "gl_cas"], states: null }
});
registerExternalRole("carrier_auditor", {
  name: "Helen Park", title: "Carrier Auditor, Vikram & Sons (External, read-only)", icon: "🔎",
  limit: 0, limitText: "External · read-only · carrier paper only", description: "Reads policies written on the carrier's paper; cannot change anything.",
  external: true, readOnly: true, scope: { kind: "carrier", carrier: "Vikram & Sons" }
});
