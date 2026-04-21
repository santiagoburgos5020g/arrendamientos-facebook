import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

const APIFY_API_BASE = "https://api.apify.com/v2";

function getColombiaTimestamp(): string {
  const now = new Date();
  const co = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${co.getFullYear()}-${pad(co.getMonth() + 1)}-${pad(co.getDate())}-${pad(co.getHours())}-${pad(co.getMinutes())}-${pad(co.getSeconds())}`;
}

async function startApifyRun(actorId: string, input: Record<string, unknown>, token: string) {
  const res = await fetch(`${APIFY_API_BASE}/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify start failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function pollApifyRun(runId: string, token: string, maxWaitMs = 300000): Promise<{ status: string; defaultDatasetId: string }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}?token=${token}`);
    if (!res.ok) throw new Error(`Apify poll failed (${res.status})`);
    const data = await res.json();
    const status = data.data?.status;
    if (status === "SUCCEEDED") return data.data;
    if (status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED") {
      throw new Error(`Apify run ${status}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Apify run timed out waiting for completion");
}

async function getDatasetItems(datasetId: string, token: string) {
  const res = await fetch(`${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token}`);
  if (!res.ok) throw new Error(`Apify dataset fetch failed (${res.status})`);
  return res.json();
}

async function discoverFacebookGroups(
  tipoPropiedad: { apartamentos: boolean; apartaestudios: boolean; habitaciones: boolean },
  ubicacion: string,
  token: string,
): Promise<string[]> {
  const types: string[] = [];
  if (tipoPropiedad.apartamentos) types.push("apartamentos");
  if (tipoPropiedad.apartaestudios) types.push("apartaestudios");
  if (tipoPropiedad.habitaciones) types.push("habitaciones");
  const typeStr = types.length > 0 ? types.join(" ") : "arriendos";
  const loc = ubicacion || "medellín";
  const query = `grupos facebook arriendos ${typeStr} ${loc} valle de aburrá`;

  const runData = await startApifyRun("apify~google-search-scraper", {
    queries: query,
    maxPagesPerQuery: 1,
    resultsPerPage: 20,
  }, token);

  const runId = runData.data?.id;
  if (!runId) throw new Error("No run ID from Google Search Scraper");

  const completedRun = await pollApifyRun(runId, token, 60000);
  const items = await getDatasetItems(completedRun.defaultDatasetId, token);

  const groupUrls: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const results = item.organicResults || [];
    for (const result of results) {
      const url = result.url || "";
      const match = url.match(/https:\/\/(?:www\.)?facebook\.com\/groups\/([^/?]+)/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        groupUrls.push(`https://www.facebook.com/groups/${match[1]}`);
      }
    }
  }
  return groupUrls;
}

export async function POST(request: NextRequest) {
  const token = process.env.APIFY_API_KEY;
  if (!token) {
    return NextResponse.json({ error: "APIFY_API_KEY no configurada en .env" }, { status: 500 });
  }

  const body = await request.json();
  const { facebookGroupUrls, filters } = body;
  const tipoPropiedad = filters?.tipoPropiedad || { apartamentos: false, apartaestudios: false, habitaciones: false };
  const ubicacion = filters?.ubicacion || "";
  const maxPosts = filters?.cantidadPostsPorGrupo || 100;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let groupUrls: string[] = facebookGroupUrls || [];

        if (groupUrls.length === 0) {
          send({ step: "discovering", message: "Buscando grupos de Facebook en Google..." });
          groupUrls = await discoverFacebookGroups(tipoPropiedad, ubicacion, token);
          if (groupUrls.length === 0) {
            send({ step: "error", message: "No se encontraron grupos de Facebook. Intenta agregar URLs manualmente." });
            controller.close();
            return;
          }
          send({ step: "discovered", message: `${groupUrls.length} grupos encontrados`, groups: groupUrls });
        }

        send({ step: "scraping", message: `Extrayendo publicaciones de ${groupUrls.length} grupo(s)...` });

        const startUrls = groupUrls.map((url: string) => ({ url }));
        const runData = await startApifyRun("apify~facebook-groups-scraper", {
          startUrls,
          maxPosts: maxPosts,
          maxComments: 0,
        }, token);

        const runId = runData.data?.id;
        if (!runId) throw new Error("No run ID from Facebook Groups Scraper");

        send({ step: "polling", message: "Esperando resultados de Apify..." });
        const completedRun = await pollApifyRun(runId, token);

        send({ step: "downloading", message: "Descargando publicaciones..." });
        const posts = await getDatasetItems(completedRun.defaultDatasetId, token);

        const timestamp = getColombiaTimestamp();
        const filename = `${timestamp}-raw.json`;
        const resultsDir = path.join(process.cwd(), "results");
        const filePath = path.join(resultsDir, filename);

        await writeFile(filePath, JSON.stringify(posts, null, 2), "utf-8");

        send({
          step: "complete",
          message: `Extracción completada. ${posts.length} publicaciones guardadas.`,
          filename,
          totalPosts: posts.length,
          groupsScraped: groupUrls.length,
        });
      } catch (err) {
        send({ step: "error", message: err instanceof Error ? err.message : "Error desconocido" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
