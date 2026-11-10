import { modelConfig, requestPlan } from "../decompose/model";
import { templatePlan } from "../decompose/templates";
import { createPlan } from "./tasks";

export function decomposeMode() {
  const config = modelConfig();
  return config
    ? { mode: "model" as const, model: config.model }
    : { mode: "templates" as const, model: null };
}

/** Breaks a goal into tasks: with the configured model if there is one, else from a built-in template. */
export async function decompose(prompt: string, targetDays?: number) {
  const config = modelConfig();
  const plan = config ? await requestPlan(config, prompt, targetDays) : templatePlan(prompt);
  const { tasks, dependencyCount } = await createPlan(plan);
  return {
    source: config ? ("model" as const) : ("template" as const),
    model: config?.model ?? null,
    taskCount: tasks.length,
    dependencyCount,
    tasks,
  };
}
