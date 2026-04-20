import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST() {
  const projectRoot = path.resolve(process.cwd());
  const filePath = path.join(projectRoot, "stop-request.json");

  const payload = {
    action: "stop",
    timestamp: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

  return NextResponse.json({ success: true });
}
