import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortCampaigns, sumCampaignRaisedSol } from "./campaign-list.mjs";

const funds = [
  {
    id: 1,
    title: "Community garden",
    description: "Grow vegetables with local families.",
    experienceTitle: "Saturday planting",
    status: "active",
    createdAt: "2026-10-01T10:00:00.000Z",
    raisedSol: "0.100000001",
    goalSol: 1,
  },
  {
    id: 2,
    title: "Learning kits",
    description: "Provide materials for local learners.",
    experienceTitle: null,
    status: "closed",
    createdAt: "2026-10-05T10:00:00.000Z",
    raisedSol: "0.500000000",
    goalSol: 10,
  },
  {
    id: 3,
    title: "Park clean-up",
    description: "Bring neighbours together outdoors.",
    experienceTitle: "Saturday clean-up",
    status: "active",
    createdAt: "2026-10-03T10:00:00.000Z",
    raisedSol: "0.9",
    goalSol: 1,
  },
];

test("filters campaigns by status and searches their title, description, and linked experience", () => {
  assert.deepEqual(
    filterAndSortCampaigns(funds, { filter: "active", query: "  SATURDAY  " }).map((fund) => fund.id),
    [3, 1],
  );
  assert.deepEqual(
    filterAndSortCampaigns(funds, { filter: "closed" }).map((fund) => fund.id),
    [2],
  );
  assert.deepEqual(
    filterAndSortCampaigns(funds, { query: "learners" }).map((fund) => fund.id),
    [2],
  );
});

test("sorts by most raised, funding progress, and most recent without floating-point totals", () => {
  assert.deepEqual(filterAndSortCampaigns(funds, { sort: "raised" }).map((fund) => fund.id), [3, 2, 1]);
  assert.deepEqual(filterAndSortCampaigns(funds, { sort: "progress" }).map((fund) => fund.id), [3, 1, 2]);
  assert.deepEqual(filterAndSortCampaigns(funds).map((fund) => fund.id), [2, 3, 1]);
  assert.equal(sumCampaignRaisedSol(funds), "1.500000001");
});

test("returns unavailable totals instead of silently treating malformed amounts as zero", () => {
  assert.equal(sumCampaignRaisedSol([{ raisedSol: "not a SOL amount" }]), null);
});

test("keeps invalid amounts and dates at the end of their sort without disrupting valid campaigns", () => {
  const mixedFunds = [
    { ...funds[0], id: 7, raisedSol: "0.5", goalSol: 1, createdAt: "2026-11-01T10:00:00.000Z" },
    { ...funds[1], id: 4, raisedSol: "0.2", goalSol: 0.4, createdAt: "2026-10-20T10:00:00.000Z" },
    { ...funds[0], id: 6, raisedSol: "unknown", goalSol: 1, createdAt: "2026-10-10T10:00:00.000Z" },
    { ...funds[0], id: 5, raisedSol: "0.5", goalSol: 0, createdAt: "invalid date" },
  ];

  assert.deepEqual(filterAndSortCampaigns(mixedFunds, { sort: "raised" }).map((fund) => fund.id), [7, 5, 4, 6]);
  assert.deepEqual(filterAndSortCampaigns(mixedFunds, { sort: "progress" }).map((fund) => fund.id), [7, 4, 6, 5]);
  assert.deepEqual(filterAndSortCampaigns(mixedFunds).map((fund) => fund.id), [7, 4, 6, 5]);
});
