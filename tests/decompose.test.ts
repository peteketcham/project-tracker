import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, modelConfig, parseModelPlan } from "../src/lib/decompose/model";
import { templatePlan } from "../src/lib/decompose/templates";
import { ApiError } from "../src/lib/errors";

const reply = (obj: unknown) => "Here is the plan:\n```json\n" + JSON.stringify(obj) + "\n```\nGood luck!";

test("005/US3.1: no model configured means templates", () => {
  assert.equal(modelConfig({}), null);
  assert.equal(modelConfig({ LLM_BASE_URL: "http://localhost:11434/v1" }), null);
  assert.deepEqual(
    modelConfig({ LLM_BASE_URL: "http://localhost:11434/v1/", LLM_MODEL: "llama3.1" }),
    { baseUrl: "http://localhost:11434/v1", model: "llama3.1", apiKey: "" }
  );
});

test("005/US3.2: a model reply with fences and prose becomes a validated plan", () => {
  const plan = parseModelPlan(
    reply({
      tasks: [
        { key: "A", title: "Mix dough", baseDurationMinutes: 20, setupMinutes: 5, takedownMinutes: 5, unattendedMinutes: 90, priority: "high" },
        { key: "B", title: "Bake", baseDurationMinutes: "10", unattendedMinutes: 35 },
      ],
      dependencies: [{ from: "A", to: "B", type: "fs" }],
    })
  );
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[0].unattendedMinutes, 90);
  assert.equal(plan.tasks[0].priority, "HIGH");
  assert.equal(plan.tasks[1].baseDurationMinutes, 10);
  assert.equal(plan.tasks[1].setupMinutes, 15); // default filled in
  assert.deepEqual(plan.dependencies[0], { predecessorKey: "A", successorKey: "B", type: "FS", lagMinutes: 0 });
});

test("005/US3.3: only whitelisted fields are taken from the model", () => {
  const plan = parseModelPlan(
    reply({
      tasks: [{ key: "A", title: "x", baseDurationMinutes: 30, status: "DONE", id: "evil", constraintType: "MUST_START_ON" }],
    })
  );
  assert.equal(plan.tasks[0].status, "SCHEDULED");
  assert.equal(plan.tasks[0].constraintType, "ASAP");
  assert.equal("id" in plan.tasks[0], false);
});

test("005/US3.4: unusable replies are refused with a 502 and nothing to save", () => {
  const is502 = (e: unknown) => e instanceof ApiError && e.status === 502;
  assert.throws(() => parseModelPlan("I cannot help with that."), is502);
  assert.throws(() => parseModelPlan(reply({ tasks: [] })), is502);
  assert.throws(() => parseModelPlan(reply({ tasks: [{ key: "A", title: "x", baseDurationMinutes: -5 }] })), is502);
  assert.throws(
    () =>
      parseModelPlan(
        reply({ tasks: [{ key: "A", title: "x", baseDurationMinutes: 5 }], dependencies: [{ from: "A", to: "Z" }] })
      ),
    is502
  );
  assert.throws(() => extractJson("no braces here"));
});

test("templates produce a valid sequential plan for any prompt", () => {
  for (const prompt of ["Thanksgiving dinner", "remodel the bathroom", "school play", "organize the garage"]) {
    const plan = templatePlan(prompt);
    assert.ok(plan.tasks.length >= 5, prompt);
    assert.equal(plan.dependencies.length, plan.tasks.length - 1);
  }
});
