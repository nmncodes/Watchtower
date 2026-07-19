import { prisma } from "@/lib/prisma";

export async function detectCycle(
  monitorId: string,
  newDependencyIds: string[]
): Promise<boolean> {
  // If no dependencies, no cycle
  if (newDependencyIds.length === 0) return false;

  // Set of monitors we've visited to detect cycles
  const visited = new Set<string>();
  const stack = [...newDependencyIds];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    
    // Cycle detected
    if (currentId === monitorId) {
      return true;
    }

    if (!visited.has(currentId)) {
      visited.add(currentId);
      
      const currentMonitor = await prisma.monitor.findUnique({
        where: { id: currentId },
        include: { dependencies: { select: { id: true } } },
      });

      if (currentMonitor && currentMonitor.dependencies.length > 0) {
        stack.push(...currentMonitor.dependencies.map((d) => d.id));
      }
    }
  }

  return false;
}

export async function findRootCause(monitorId: string): Promise<string> {
  // Start with the current monitor
  let currentId = monitorId;
  const visited = new Set<string>();

  while (true) {
    visited.add(currentId);

    const monitor = await prisma.monitor.findUnique({
      where: { id: currentId },
      include: { dependencies: true },
    });

    if (!monitor) break;

    // Find the first dependency that is also DOWN
    const failingDependency = monitor.dependencies.find(
      (dep) => dep.status === "DOWN" || dep.status === "DEGRADED"
    );

    if (failingDependency && !visited.has(failingDependency.id)) {
      currentId = failingDependency.id;
    } else {
      break;
    }
  }

  return currentId;
}
