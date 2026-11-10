import { NextResponse } from "next/server";
import { createPlan } from "@/lib/services/tasks";
import { route, readJson } from "@/lib/api";
import { decomposeRequestSchema, planSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  {
    const { prompt } = await readJson(req, decomposeRequestSchema);

    const keywords = prompt.toLowerCase();
    let decomposedTasks: Array<{
      title: string;
      description: string;
      baseDuration: number;
      setup: number;
      takedown: number;
      priority: string;
      color: string;
    }> = [];

    if (
      keywords.includes("thanksgiving") ||
      keywords.includes("dinner") ||
      keywords.includes("meal") ||
      keywords.includes("feast") ||
      keywords.includes("cook")
    ) {
      decomposedTasks = [
        {
          title: "Thaw, Brine & Season Turkey",
          description: "Submerge turkey in herb-citrus brine, rinse, and air-dry skin in refrigerator.",
          baseDuration: 60,
          setup: 20,
          takedown: 20,
          priority: "HIGH",
          color: "#059669",
        },
        {
          title: "Bake Pumpkin & Pecan Pies",
          description: "Roll out pie crusts, mix custards, bake in oven, and transfer to wire cooling racks.",
          baseDuration: 90,
          setup: 15,
          takedown: 15,
          priority: "MEDIUM",
          color: "#d97706",
        },
        {
          title: "Roast Turkey in Main Oven",
          description: "Truss bird, baste hourly, monitor thermometer to 165°F, and rest on carving board.",
          baseDuration: 210,
          setup: 25,
          takedown: 30,
          priority: "URGENT",
          color: "#dc2626",
        },
        {
          title: "Chop Aromatics & Sauté Stuffing",
          description: "Dice celery, onions, toast bread cubes, and fold with sage broth in casserole dish.",
          baseDuration: 75,
          setup: 15,
          takedown: 15,
          priority: "HIGH",
          color: "#ca8a04",
        },
        {
          title: "Peel, Boil & Rice Yukon Gold Potatoes",
          description: "Boil potatoes in salted water, rice with warm cream and roasted garlic butter.",
          baseDuration: 60,
          setup: 15,
          takedown: 10,
          priority: "HIGH",
          color: "#2563eb",
        },
        {
          title: "Whisk Pan-Dripping Gravy & Heat Rolls",
          description: "Deglaze roasting pan drippings with wine and broth, thicken roux, and warm dinner rolls.",
          baseDuration: 35,
          setup: 10,
          takedown: 10,
          priority: "URGENT",
          color: "#9333ea",
        },
        {
          title: "Carve Turkey & Serve Holiday Feast",
          description: "Carve breast and dark meat, plate hot sides, and gather everyone at dining table.",
          baseDuration: 45,
          setup: 15,
          takedown: 25,
          priority: "URGENT",
          color: "#ea580c",
        },
      ];
    } else if (
      keywords.includes("bath") ||
      keywords.includes("remodel") ||
      keywords.includes("renovat") ||
      keywords.includes("kitchen") ||
      keywords.includes("house")
    ) {
      decomposedTasks = [
        {
          title: "Floor Protection & Fixture Demolition",
          description: "Lay heavy floor runners, shut off supply valves, demo old tub, vanity, and wall tile.",
          baseDuration: 180,
          setup: 30,
          takedown: 30,
          priority: "HIGH",
          color: "#dc2626",
        },
        {
          title: "Rough-in Plumbing & Electrical Lines",
          description: "Relocate shower mixer valve, adjust drain pitch, and install GFCI receptacle wiring.",
          baseDuration: 150,
          setup: 25,
          takedown: 20,
          priority: "URGENT",
          color: "#2563eb",
        },
        {
          title: "Hang Cement Board & Apply Waterproofing",
          description: "Screw backer boards to studs, tape seams, and roll on 2 coats of elastomeric membrane.",
          baseDuration: 120,
          setup: 20,
          takedown: 25,
          priority: "HIGH",
          color: "#059669",
        },
        {
          title: "Tile Shower Enclosure & Floor",
          description: "Mix thinset mortar, set wall subway tiles with spacers, cut edges, and cure for 24h.",
          baseDuration: 240,
          setup: 30,
          takedown: 30,
          priority: "URGENT",
          color: "#d97706",
        },
        {
          title: "Grout Tile Seams & Apply Silicone Sealant",
          description: "Pack grout into joints, sponge clean with water haze wipe, and caulk corners.",
          baseDuration: 90,
          setup: 15,
          takedown: 20,
          priority: "MEDIUM",
          color: "#9333ea",
        },
        {
          title: "Install Double Vanity, Faucets & Mirror",
          description: "Secure vanity cabinet to wall studs, connect P-trap, mount hardware and framed mirror.",
          baseDuration: 120,
          setup: 20,
          takedown: 15,
          priority: "HIGH",
          color: "#0284c7",
        },
      ];
    } else if (
      keywords.includes("play") ||
      keywords.includes("theater") ||
      keywords.includes("theatre") ||
      keywords.includes("kid") ||
      keywords.includes("school") ||
      keywords.includes("spring")
    ) {
      decomposedTasks = [
        {
          title: "Auditions, Cast Roles & Script Distribution",
          description: "Conduct student readings, assign speaking parts, and highlight individual script lines.",
          baseDuration: 120,
          setup: 20,
          takedown: 15,
          priority: "HIGH",
          color: "#9333ea",
        },
        {
          title: "Measure Costumes & Source Props",
          description: "Take cast measurements, source vintage clothing pieces, and catalog handheld stage props.",
          baseDuration: 90,
          setup: 15,
          takedown: 15,
          priority: "MEDIUM",
          color: "#db2777",
        },
        {
          title: "Construct Wooden Backdrops & Scenery Painting",
          description: "Build 2x4 stage flats, paint scenery backdrops with tempera paint, and dry in gym.",
          baseDuration: 180,
          setup: 30,
          takedown: 30,
          priority: "HIGH",
          color: "#ca8a04",
        },
        {
          title: "Stage Blocking & Scene Transition Rehearsals",
          description: "Direct student movement on stage, coordinate stagehand backdrop changes between Act 1 & 2.",
          baseDuration: 150,
          setup: 20,
          takedown: 15,
          priority: "URGENT",
          color: "#2563eb",
        },
        {
          title: "Full Dress Rehearsal with Microphones & Lights",
          description: "Complete uninterrupted run of the play with costumes, wireless mics, and spotlight cues.",
          baseDuration: 120,
          setup: 30,
          takedown: 20,
          priority: "URGENT",
          color: "#dc2626",
        },
        {
          title: "Opening Night Performance & Cast Celebration",
          description: "House doors open, stage call, 90-minute live performance, and flower presentations.",
          baseDuration: 120,
          setup: 45,
          takedown: 45,
          priority: "URGENT",
          color: "#059669",
        },
      ];
    } else {
      // General Real-World Activity Decomposer
      decomposedTasks = [
        {
          title: `Project Setup & Planning for: ${prompt.slice(0, 32)}...`,
          description: `Gather materials, read instructions, checklist supplies, and clear workspace for: ${prompt}`,
          baseDuration: 60,
          setup: 15,
          takedown: 10,
          priority: "HIGH",
          color: "#2563eb",
        },
        {
          title: "Preparation & Workstation Setup",
          description: "Assemble required tools, prep work surfaces, and lay safety/protective coverings.",
          baseDuration: 90,
          setup: 20,
          takedown: 15,
          priority: "HIGH",
          color: "#ca8a04",
        },
        {
          title: "Core Execution: Phase 1",
          description: "Carry out the primary foundational build or preparation steps.",
          baseDuration: 180,
          setup: 20,
          takedown: 20,
          priority: "URGENT",
          color: "#dc2626",
        },
        {
          title: "Core Execution: Phase 2 & Assembly",
          description: "Finish main components, fit pieces together, and apply fine adjustments.",
          baseDuration: 150,
          setup: 15,
          takedown: 15,
          priority: "HIGH",
          color: "#059669",
        },
        {
          title: "Quality Review, Cleanup & Pack-Away",
          description: "Inspect completed work, clean and sanitize tools, return equipment, and celebrate.",
          baseDuration: 60,
          setup: 10,
          takedown: 20,
          priority: "MEDIUM",
          color: "#9333ea",
        },
      ];
    }

    const { tasks } = await createPlan(
      planSchema.parse({
        tasks: decomposedTasks.map((item, i) => ({
          tempKey: `T${i + 1}`,
          title: item.title.slice(0, 200),
          description: item.description,
          priority: item.priority,
          baseDurationMinutes: item.baseDuration,
          setupMinutes: item.setup,
          takedownMinutes: item.takedown,
          color: item.color,
        })),
        // Link sequentially with Finish-to-Start dependencies
        dependencies: decomposedTasks.slice(1).map((_, i) => ({
          predecessorKey: `T${i + 1}`,
          successorKey: `T${i + 2}`,
        })),
      })
    );

    return NextResponse.json({
      success: true,
      message: `Decomposed into ${tasks.length} sequenced tasks with setup and takedown buffers`,
      tasks,
    });
  }
});
