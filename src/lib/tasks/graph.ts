export interface Edge {
  predecessorId: string;
  successorId: string;
}

/**
 * True if adding predecessor -> successor to `edges` would close a loop,
 * i.e. the predecessor is already reachable from the successor.
 */
export function wouldCreateCycle(edges: Edge[], predecessorId: string, successorId: string): boolean {
  if (predecessorId === successorId) return true;
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!out.has(e.predecessorId)) out.set(e.predecessorId, []);
    out.get(e.predecessorId)!.push(e.successorId);
  }
  const seen = new Set<string>();
  const stack = [successorId];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === predecessorId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of out.get(node) ?? []) stack.push(next);
  }
  return false;
}

/** Ids of every node that sits on at least one cycle (empty when the graph is a DAG). */
export function findCycleNodes(nodeIds: string[], edges: Edge[]): string[] {
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const out = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const e of edges) {
    if (!inDegree.has(e.predecessorId) || !inDegree.has(e.successorId)) continue;
    out.get(e.predecessorId)!.push(e.successorId);
    inDegree.set(e.successorId, inDegree.get(e.successorId)! + 1);
  }
  // Peel off everything that is not on or downstream of a cycle...
  const queue = nodeIds.filter((id) => inDegree.get(id) === 0);
  const remaining = new Set(nodeIds);
  while (queue.length > 0) {
    const id = queue.shift()!;
    remaining.delete(id);
    for (const next of out.get(id)!) {
      inDegree.set(next, inDegree.get(next)! - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }
  // ...then keep only the nodes that can reach themselves.
  return [...remaining].filter((id) =>
    (out.get(id) ?? []).some((next) => remaining.has(next) && reaches(out, remaining, next, id))
  );
}

function reaches(out: Map<string, string[]>, within: Set<string>, from: string, target: string) {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === target) return true;
    if (seen.has(node) || !within.has(node)) continue;
    seen.add(node);
    for (const next of out.get(node) ?? []) stack.push(next);
  }
  return false;
}
