import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const projectRoot = path.resolve(process.cwd());
  const filePath = path.join(projectRoot, "search-request.json");

  await writeFile(filePath, JSON.stringify(body, null, 2), "utf-8");

  return NextResponse.json({ success: true });
}
