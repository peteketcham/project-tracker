import { test } from "node:test";
import assert from "node:assert/strict";
import { findCycleNodes, wouldCreateCycle } from "../src/lib/tasks/graph";

const e = (predecessorId: string, successorId: string) => ({ predecessorId, successorId });

test("detects a link that would close a loop", () => {
  const edges = [e("a", "b"), e("b", "c")];
  assert.equal(wouldCreateCycle(edges, "c", "a"), true);
  assert.equal(wouldCreateCycle(edges, "a", "c"), false);
  assert.equal(wouldCreateCycle(edges, "c", "d"), false);
  assert.equal(wouldCreateCycle([], "a", "a"), true);
});

test("finds only the tasks that are on a cycle", () => {
  const nodes = ["a", "b", "c", "d", "x"];
  const edges = [e("a", "b"), e("b", "c"), e("c", "b"), e("c", "d")];
  assert.deepEqual(findCycleNodes(nodes, edges).sort(), ["b", "c"]);
  assert.deepEqual(findCycleNodes(nodes, [e("a", "b"), e("b", "c")]), []);
});
