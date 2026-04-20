import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

export async function GET() {
  const resultsDir = path.join(process.cwd(), "results");

  try {
    const allFiles = await readdir(resultsDir);
    const rawJsonFiles = allFiles
      .filter((f) => f.endsWith("-raw.json"))
      .sort()
      .reverse();
    return NextResponse.json({ files: rawJsonFiles });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
