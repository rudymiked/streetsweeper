import Constants from "expo-constants";
import { DebugSegmentScore } from "../../utils/debug/debugOverlay.types";
import { Coord } from "../core/geometry/base";
import { Activity, Street } from "./matcher_kdtree";
import { getEnv } from "../../utils/getEnv";
import pLimit from "p-limit";

const limit = pLimit(2);


// ------------------------------
// Types
// ------------------------------
export interface MatchResults {
  streets: {
    id: string;
    name: string;
    completed: boolean;
    coords: Coord[];
  }[];
  debug: {
    segments: DebugSegmentScore[];
  };
}

// ------------------------------
// Azure Setup
// ------------------------------
const extra = Constants.expoConfig?.extra ?? {};

const API_KEY = getEnv("EXPO_PUBLIC_AZURE_OPENAI_KEY");
const ENDPOINT = getEnv("EXPO_PUBLIC_AZURE_OPENAI_ENDPOINT");
const DEPLOYMENT = getEnv("EXPO_PUBLIC_AZURE_OPENAI_DEPLOYMENT");

// ------------------------------
// Helpers
// ------------------------------
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ------------------------------
// Azure Model Call (Expo-safe)
// ------------------------------
async function callAzureModel(
  streetsChunk: Street[],
  activities: Activity[]
): Promise<MatchResults> {
  const payload = { streets: streetsChunk, activities };

  const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
    },
    body: JSON.stringify({
      model: DEPLOYMENT,
      messages: [
        {
          role: "system",
          content: `
You are a geometry-aware street matcher.
Given streets[] and activities[], return ONLY valid JSON shaped like:

{
  "streets": StreetResult[],
  "debug": DebugOverlayData
}

Do not invent geometry. Use only the provided coordinates.
`,
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      temperature: 0,
    }),
  });

  const json = await response.json();
  console.log("Azure error:", json.error);
  const message = json.choices?.[0]?.message?.content;

  if (!message) {
    throw new Error("Azure returned an empty response");
  }

  return JSON.parse(message) as MatchResults;
}

// ------------------------------
// Main Matcher (Expo-safe)
// ------------------------------
export async function runMatcherAzure(
  streets: Street[],
  activities: Activity[]
): Promise<MatchResults> {
  try {
    const chunks = chunkArray(streets, 25);

    // Run all chunks in parallel
    const chunkResults = await Promise.all(
      chunks.map(chunk => limit(() => callAzureWithRetry(chunk, activities)))
    );

    // Merge results
    const allStreetResults: MatchResults["streets"] = [];
    const allDebugSegments: DebugSegmentScore[] = [];

    for (const result of chunkResults) {
      allStreetResults.push(...result.streets);
      allDebugSegments.push(...result.debug.segments);
    }

    return {
      streets: allStreetResults,
      debug: { segments: allDebugSegments },
    };
  } catch (err: any) {
    console.error(err);
    return {
      streets: [],
      debug: { segments: [] }
    };
  }
}

async function callAzureWithRetry(chunk: any, activities: any[], attempt = 1) {
  try {
    return await callAzureModel(chunk, activities);
  } catch (err) {
    if (attempt > 5) throw err;

    const delay = 500 * attempt; // 500ms, 1s, 1.5s, 2s, 2.5s
    console.log(`Retrying Azure call (attempt ${attempt}) after ${delay}ms`);

    await new Promise(res => setTimeout(res, delay));
    return callAzureWithRetry(chunk, activities, attempt + 1);
  }
}