import { PrismaClient } from "@prisma/client";
import { addDays, setHours, setMinutes } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding project tracker with real-world non-technical projects...");

  // Clean existing records
  await prisma.interruptionLog.deleteMany();
  await prisma.workSession.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectSettings.deleteMany();

  // Thanksgiving Day dinner target: Thursday at 4:30 PM
  const now = new Date();
  const baseStart = setMinutes(setHours(now, 8), 0); // Start day at 8:00 AM

  // Project Settings
  await prisma.projectSettings.create({
    data: {
      id: "default",
      workingHoursStart: "08:00",
      workingHoursEnd: "18:00",
      workDays: "1,2,3,4,5,6,0", // All days active for holiday/home project planning
      defaultSetupMinutes: 15,
      defaultTakedownMinutes: 15,
      autoCascade: true,
      highlightCriticalPath: true,
      projectStartDate: baseStart,
    },
  });

  // Thanksgiving Meal Preparation Tasks
  const task1 = await prisma.task.create({
    data: {
      title: "Thaw, Brine & Season Turkey",
      description: "Remove giblets, prepare herb-citrus brine, soak turkey, and air-dry skin in refrigerator for crispiness.",
      status: "DONE",
      priority: "HIGH",
      baseDurationMinutes: 60,
      setupMinutes: 20, // Sanitizing prep surface & gathering herbs
      takedownMinutes: 20, // Deep cleaning raw poultry station
      constraintType: "ASAP",
      color: "#059669", // emerald
      order: 1,
      actualStart: baseStart,
      actualEnd: new Date(baseStart.getTime() + 100 * 60 * 1000),
    },
  });

  const task2 = await prisma.task.create({
    data: {
      title: "Bake Pumpkin & Dutch Apple Pies",
      description: "Blind-bake crusts, whisk spiced pumpkin custard, bake pies, and clear oven before turkey enters.",
      status: "DONE",
      priority: "MEDIUM",
      baseDurationMinutes: 90,
      setupMinutes: 15, // Rolling pin, flour station
      takedownMinutes: 15, // Cooling racks setup & flour sweep
      constraintType: "ASAP",
      color: "#d97706", // amber
      order: 2,
      actualStart: new Date(baseStart.getTime() + 105 * 60 * 1000),
      actualEnd: new Date(baseStart.getTime() + 225 * 60 * 1000),
    },
  });

  const task3 = await prisma.task.create({
    data: {
      title: "Roast Turkey in Main Oven",
      description: "Stuff aromatics, truss bird, baste hourly, check internal temp reaches 165°F, and rest on carving board.",
      status: "IN_PROGRESS",
      priority: "URGENT",
      baseDurationMinutes: 30, // Trussing, stuffing aromatics, getting it in the oven
      unattendedMinutes: 180, // 3 hours in the oven: other dishes fit in here
      setupMinutes: 25, // Oven preheat, roasting pan rack positioning
      takedownMinutes: 30, // Turkey resting buffer (crucial context takedown!)
      constraintType: "ASAP",
      color: "#dc2626", // red
      order: 3,
      actualStart: new Date(baseStart.getTime() + 230 * 60 * 1000),
    },
  });

  const task4 = await prisma.task.create({
    data: {
      title: "Chop Aromatics & Sauté Herb Stuffing",
      description: "Dice celery, onions, apples; toast sourdough cubes; fold with turkey broth and fresh sage in casserole dish.",
      status: "SCHEDULED",
      priority: "HIGH",
      baseDurationMinutes: 75,
      setupMinutes: 15, // Knife sharpening & cutting boards
      takedownMinutes: 15, // Casserole dish wrapping
      constraintType: "ASAP",
      color: "#ca8a04", // yellow
      order: 4,
    },
  });

  const task5 = await prisma.task.create({
    data: {
      title: "Simmer Orange-Spiced Cranberry Sauce",
      description: "Simmer fresh cranberries with orange zest, cinnamon stick, and brown sugar until thickened.",
      status: "PAUSED",
      priority: "MEDIUM",
      baseDurationMinutes: 40,
      setupMinutes: 10,
      takedownMinutes: 10,
      constraintType: "ASAP",
      color: "#db2777", // pink
      order: 5,
    },
  });

  const task6 = await prisma.task.create({
    data: {
      title: "Peel, Boil & Mash Yukon Gold Potatoes",
      description: "Peel 10 lbs potatoes, boil until fork-tender, rice with warm melted butter, heavy cream, and roasted garlic.",
      status: "SCHEDULED",
      priority: "HIGH",
      baseDurationMinutes: 60,
      setupMinutes: 15, // Stockpot water boil, ricer assembly
      takedownMinutes: 10, // Keep-warm bain-marie setup
      constraintType: "ASAP",
      color: "#2563eb", // blue
      order: 6,
    },
  });

  const task7 = await prisma.task.create({
    data: {
      title: "Make Pan-Dripping Giblet Gravy",
      description: "Deglaze roasting pan drippings with dry white wine, whisk roux, simmer until velvety smooth.",
      status: "SCHEDULED",
      priority: "URGENT",
      baseDurationMinutes: 35,
      setupMinutes: 10, // Sieve, fat separator
      takedownMinutes: 10, // Warm gravy boat transfer
      constraintType: "ASAP",
      color: "#9333ea", // purple
      order: 7,
    },
  });

  const task8 = await prisma.task.create({
    data: {
      title: "Carve Turkey & Holiday Dinner Service",
      description: "Carve breast and dark meat, plate piping-hot sides, and gather 12 guests for dinner feast.",
      status: "SCHEDULED",
      priority: "URGENT",
      baseDurationMinutes: 45,
      setupMinutes: 15, // Electric carving knife, platters
      takedownMinutes: 20, // Food coverings & toast
      constraintType: "MUST_FINISH_ON",
      pinnedDate: addDays(baseStart, 1), // Pinned holiday target
      color: "#ea580c", // orange
      order: 8,
    },
  });

  await prisma.task.create({
    data: {
      title: "After-Dinner Dishwashing & Leftover Packing",
      description: "Scrape china, run dishwasher cycles, portion turkey and sides into glass storage containers.",
      status: "BACKLOG",
      priority: "LOW",
      baseDurationMinutes: 90,
      setupMinutes: 10,
      takedownMinutes: 15,
      constraintType: "ASAP",
      color: "#4b5563", // gray
      order: 9,
    },
  });

  // Dependencies:
  // 1. Thaw/Brine (task1) -> Roast Turkey (task3) (FS)
  await prisma.taskDependency.create({
    data: {
      predecessorId: task1.id,
      successorId: task3.id,
      type: "FS",
      lagMinutes: 0,
    },
  });

  // 2. Pies (task2) -> Roast Turkey (task3) (FS - oven contention: pies must leave oven before turkey goes in!)
  await prisma.taskDependency.create({
    data: {
      predecessorId: task2.id,
      successorId: task3.id,
      type: "FS",
      lagMinutes: 10, // 10 min oven temperature changeover
    },
  });

  // 3. Roast Turkey (task3) -> Pan Gravy (task7) (FS - pan gravy requires turkey drippings from roasted bird)
  await prisma.taskDependency.create({
    data: {
      predecessorId: task3.id,
      successorId: task7.id,
      type: "FS",
      lagMinutes: 0,
    },
  });

  // 4. Roast Turkey (task3) -> Stuffing (task4) (SS with 60 min lag - start stuffing after turkey is midway through roast)
  await prisma.taskDependency.create({
    data: {
      predecessorId: task3.id,
      successorId: task4.id,
      type: "SS",
      lagMinutes: 60,
    },
  });

  // 5. Mashed Potatoes (task6) -> Dinner Service (task8) (FS)
  await prisma.taskDependency.create({
    data: {
      predecessorId: task6.id,
      successorId: task8.id,
      type: "FS",
      lagMinutes: 0,
    },
  });

  // 6. Pan Gravy (task7) -> Dinner Service (task8) (FS)
  await prisma.taskDependency.create({
    data: {
      predecessorId: task7.id,
      successorId: task8.id,
      type: "FS",
      lagMinutes: 0,
    },
  });

  // The turkey is under way: setup, then an open work session
  await prisma.workSession.create({
    data: {
      taskId: task3.id,
      sessionType: "SETUP",
      startTime: new Date(baseStart.getTime() + 230 * 60 * 1000),
      endTime: new Date(baseStart.getTime() + 255 * 60 * 1000),
      durationMinutes: 25,
    },
  });
  await prisma.workSession.create({
    data: {
      taskId: task3.id,
      sessionType: "WORK",
      startTime: new Date(baseStart.getTime() + 255 * 60 * 1000),
    },
  });

  // Interruption Session for Cranberry Sauce (interrupted because of stovetop burner contention)
  await prisma.workSession.create({
    data: {
      taskId: task5.id,
      sessionType: "SETUP",
      startTime: new Date(baseStart.getTime() + 120 * 60 * 1000),
      endTime: new Date(baseStart.getTime() + 130 * 60 * 1000),
      durationMinutes: 10,
    },
  });

  await prisma.workSession.create({
    data: {
      taskId: task5.id,
      sessionType: "WORK",
      startTime: new Date(baseStart.getTime() + 130 * 60 * 1000),
      endTime: new Date(baseStart.getTime() + 150 * 60 * 1000),
      durationMinutes: 20,
    },
  });

  await prisma.workSession.create({
    data: {
      taskId: task5.id,
      sessionType: "TAKEDOWN",
      startTime: new Date(baseStart.getTime() + 150 * 60 * 1000),
      endTime: new Date(baseStart.getTime() + 160 * 60 * 1000),
      durationMinutes: 10,
    },
  });

  await prisma.interruptionLog.create({
    data: {
      taskId: task5.id,
      pausedAt: new Date(baseStart.getTime() + 150 * 60 * 1000),
      reason: "Burner taken over to boil potato water; had to cool saucepan & stash in fridge",
      overheadAddedMinutes: 20, // 10m takedown + 10m setup when resumed
    },
  });

  console.log("Database seeded successfully with Thanksgiving dinner tasks, dependencies, and kitchen interruptions.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
