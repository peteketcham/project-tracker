import { route } from "@/lib/api";
import { getInsights } from "@/lib/services/insights";

export const GET = route(async () => getInsights());
