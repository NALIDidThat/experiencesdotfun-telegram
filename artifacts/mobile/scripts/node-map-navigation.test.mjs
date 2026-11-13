import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const [exploreSource, googleMapSource, appSource, nodeProfileSource, prioritiesSource] = await Promise.all([
  readFile(new URL("../components/ExploreGlobe.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ExploreMapGoogle3D.web.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/index.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/NodeProfileScreen.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/home-priority.ts", import.meta.url), "utf8"),
]);

test("verified Node map pins are visibly and accessibly selectable", () => {
  assert.match(exploreSource, /accessibilityLabel=\{`Open \$\{node\.name\}.*?`}/);
  assert.match(exploreSource, /testID=\{`explore-node-pin-\$\{node\.nodeId\}`\}/);
  assert.match(exploreSource, /onPress=\{\(\) => onSelectNode\?\.\(node\.nodeId\)\}/);
  assert.match(exploreSource, /nodeLocationHitTarget: \{[^}]*width: 48, height: 48/);
  assert.match(googleMapSource, /testID=\{`explore-node-pin-\$\{node\.nodeId\}`\}/);
  assert.match(googleMapSource, /nodeMarker: \{[^}]*width: 48, height: 48/);
  assert.match(googleMapSource, /nodes=\{props\.nodes\}/);
  assert.match(googleMapSource, /onSelectNode=\{props\.onSelectNode\}/);
  assert.match(googleMapSource, /accessibilityLabel=\{`Open \$\{node\.name\}, an Experiences\.fun Node/);
  assert.match(appSource, /onSelectNode=\{\(nodeId\) => go\('node-profile', \{ nodeId: String\(nodeId\) \}\)\}/);
  assert.match(appSource, /pointerEvents="box-none"\s+testID="explore-glass-header"/);
  assert.match(appSource, /Tap purple pins to open verified Nodes and their Experiences/);
});

test("Node Experience cards always open the selected Experience", () => {
  assert.match(nodeProfileSource, /onOpenExperience: \(experienceId: number\) => void/);
  assert.match(nodeProfileSource, /testID=\{`node-experience-\$\{experience\.id\}`\}/);
  assert.match(nodeProfileSource, /onPress=\{\(\) => onOpenExperience\(experience\.id\)\}/);
  assert.doesNotMatch(nodeProfileSource, /disabled=\{!onOpenExperience\}/);
  assert.match(appSource, /onOpenExperience=\{\(id\) => go\('experience', \{ id: String\(id\) \}\)\}/);
});

test("the participant Home action names and opens the experience list", () => {
  assert.match(prioritiesSource, /buttonLabel: "View my experiences"/);
  assert.match(appSource, /else \{\s*go\('experiences'\);\s*\}/);
});
