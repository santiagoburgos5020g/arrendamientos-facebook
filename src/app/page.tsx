"use client";

import { useState, useEffect } from "react";
import { filterPosts, type FilteredResult, type RawPost } from "@/lib/keywordFilter";
import ResultsTable from "@/components/ResultsTable";

export default function Home() {
  const [useExistingJson, setUseExistingJson] = useState(false);
  const [jsonFiles, setJsonFiles] = useState<string[]>([]);
  const [selectedJsonFiles, setSelectedJsonFiles] = useState<string[]>([]);
  const [facebookUrls, setFacebookUrls] = useState("");
  const [apartamentos, setApartamentos] = useState(false);
  const [apartaestudios, setApartaestudios] = useState(false);
  const [habitaciones, setHabitaciones] = useState(false);
  const [ubicacion, setUbicacion] = useState("");
  const [distanciaMaxima, setDistanciaMaxima] = useState("sin_limite");
  const [presupuestoMaximo, setPresupuestoMaximo] = useState("");
  const [banoPrivado, setBanoPrivado] = useState(false);
  const [bano, setBano] = useState(false);
  const [lavanderia, setLavanderia] = useState(false);
  const [serviciosPublicos, setServiciosPublicos] = useState(false);
  const [fechaPublicacion, setFechaPublicacion] = useState("cualquier_fecha");
  const [numeroResultados, setNumeroResultados] = useState("10");
  const [cantidadPostsPorGrupo, setCantidadPostsPorGrupo] = useState("100");
  const [status, setStatus] = useState("Listo para buscar.");
  const [keywordResults, setKeywordResults] = useState<FilteredResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [isKeywordSearching, setIsKeywordSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (useExistingJson) {
      fetch("/api/json-files")
        .then((res) => res.json())
        .then((data) => setJsonFiles(data.files || []))
        .catch(() => setJsonFiles([]));
    }
  }, [useExistingJson]);

  const handleJsonFileSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
    setSelectedJsonFiles(selected);
  };

  const handleSearch = async () => {
    setStatus(useExistingJson ? "Enviando filtros..." : "Enviando búsqueda...");

    const urls = facebookUrls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const payload = {
      mode: useExistingJson ? "json_filter" : "apify",
      timestamp: new Date().toISOString(),
      facebookGroupUrls: useExistingJson ? [] : urls,
      selectedJsonFiles: useExistingJson ? selectedJsonFiles : [],
      filters: {
        tipoPropiedad: {
          apartamentos,
          apartaestudios,
          habitaciones,
        },
        ubicacion,
        distanciaMaxima,
        presupuestoMaximo: presupuestoMaximo
          ? Number(presupuestoMaximo)
          : null,
        servicios: {
          banoPrivado,
          bano,
          lavanderia,
          serviciosPublicos,
        },
        fechaPublicacion,
        numeroResultados: Number(numeroResultados) || 10,
        cantidadPostsPorGrupo: Number(cantidadPostsPorGrupo) || 100,
      },
    };

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus(
          useExistingJson
            ? "Filtros enviados. Revisa la terminal de Claude."
            : "Búsqueda enviada. Revisa la terminal de Claude."
        );
      } else {
        setStatus("Error al enviar la solicitud.");
      }
    } catch {
      setStatus("Error de conexión.");
    }
  };

  const handleKeywordSearch = async () => {
    if (selectedJsonFiles.length === 0) {
      setStatus("Selecciona al menos un archivo JSON");
      return;
    }

    setIsKeywordSearching(true);
    setShowResults(false);
    setStatus("Filtrando posts localmente...");

    try {
      const fetchPromises = selectedJsonFiles.map(async (filename) => {
        const res = await fetch(`/api/json-files/${filename}`);
        if (!res.ok) throw new Error(`Error al cargar el archivo: ${filename}`);
        return res.json() as Promise<RawPost[]>;
      });
      const allPostArrays = await Promise.all(fetchPromises);

      const seenUrls = new Set<string>();
      const allPosts: RawPost[] = [];
      for (const posts of allPostArrays) {
        for (const post of posts) {
          if (post.url && !seenUrls.has(post.url)) {
            seenUrls.add(post.url);
            allPosts.push(post);
          }
        }
      }

      const params = {
        tipoPropiedad: { apartamentos, apartaestudios, habitaciones },
        ubicacion,
        presupuestoMaximo: presupuestoMaximo ? Number(presupuestoMaximo) : null,
        servicios: { banoPrivado, bano, lavanderia, serviciosPublicos },
        fechaPublicacion,
        numeroResultados: Number(numeroResultados) || 40,
      };

      const { results, totalMatches: total } = filterPosts(allPosts, params);

      setKeywordResults(results);
      setTotalMatches(total);
      setShowResults(true);
      setStatus(
        results.length === 0
          ? "No se encontraron resultados que coincidan con los filtros."
          : `Búsqueda completada. ${total} resultados encontrados.`
      );
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : "Error al procesar los archivos."
      );
    } finally {
      setIsKeywordSearching(false);
    }
  };

  const handleStop = async () => {
    setStatus("Deteniendo búsqueda...");
    try {
      const res = await fetch("/api/stop", { method: "POST" });
      if (res.ok) {
        setStatus("Solicitud de detención enviada.");
      } else {
        setStatus("Error al detener.");
      }
    } catch {
      setStatus("Error de conexión.");
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">
        Búsqueda de Arriendos en Valle de Aburrá (Apify)
      </h1>

      {/* Fuente de Datos */}
      <fieldset className="border border-blue-200 rounded-lg p-4 mb-6 bg-blue-50">
        <legend className="text-lg font-semibold text-amber-800 px-2">
          Fuente de Datos
        </legend>
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={useExistingJson}
            onChange={(e) => {
              setUseExistingJson(e.target.checked);
              if (!e.target.checked) setShowResults(false);
            }}
            className="w-4 h-4"
          />
          Buscar sobre archivos JSON existentes (sin llamar a Apify)
        </label>

        {useExistingJson && (
          <div className="mt-3">
            <p className="text-sm text-gray-600 mb-1">
              Selecciona uno o más archivos JSON (Ctrl+clic para seleccionar
              varios):
            </p>
            <select
              multiple
              value={selectedJsonFiles}
              onChange={handleJsonFileSelect}
              className="w-full border border-gray-300 rounded p-2 min-h-[100px]"
            >
              {jsonFiles.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      {/* URLs de Grupos de Facebook (Mode 1 only) */}
      {!useExistingJson && (
        <fieldset className="border border-gray-300 rounded-lg p-4 mb-6">
          <legend className="text-lg font-semibold text-amber-800 px-2">
            URLs de Grupos de Facebook
          </legend>
          <p className="text-sm text-gray-600 mb-2">
            Ingresa las URLs de grupos públicos (una por línea). Si se deja
            vacío, se buscarán grupos en Google.
          </p>
          <textarea
            value={facebookUrls}
            onChange={(e) => setFacebookUrls(e.target.value)}
            placeholder={"https://www.facebook.com/groups/ejemplo1\nhttps://www.facebook.com/groups/ejemplo2"}
            rows={5}
            className="w-full border border-gray-300 rounded p-2 text-sm"
          />
        </fieldset>
      )}

      {/* Tipo de Propiedad */}
      <fieldset className="border border-gray-300 rounded-lg p-4 mb-6">
        <legend className="text-lg font-semibold text-amber-800 px-2">
          Tipo de Propiedad
        </legend>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={apartamentos}
              onChange={(e) => setApartamentos(e.target.checked)}
              className="w-4 h-4"
            />
            Apartamentos
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={apartaestudios}
              onChange={(e) => setApartaestudios(e.target.checked)}
              className="w-4 h-4"
            />
            Apartaestudios
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={habitaciones}
              onChange={(e) => setHabitaciones(e.target.checked)}
              className="w-4 h-4"
            />
            Habitaciones
          </label>
        </div>
      </fieldset>

      {/* Filtros de Búsqueda */}
      <fieldset className="border border-gray-300 rounded-lg p-4 mb-6">
        <legend className="text-lg font-semibold text-amber-800 px-2">
          Filtros de Búsqueda
        </legend>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Ubicación (ej: belén, sabaneta, laureles):
            </label>
            <input
              type="text"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="cerca de medellín"
              className="w-full border border-gray-300 rounded p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Distancia máxima desde la ubicación:
            </label>
            <select
              value={distanciaMaxima}
              onChange={(e) => setDistanciaMaxima(e.target.value)}
              className="w-full border border-gray-300 rounded p-2"
            >
              <option value="sin_limite">Sin límite de distancia</option>
              <option value="500m">500 metros</option>
              <option value="1km">1 km</option>
              <option value="2km">2 km</option>
              <option value="5km">5 km</option>
              <option value="10km">10 km</option>
              <option value="20km">20 km</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Presupuesto Máximo (COP):
            </label>
            <input
              type="number"
              value={presupuestoMaximo}
              onChange={(e) => setPresupuestoMaximo(e.target.value)}
              placeholder="1500000"
              className="w-full border border-gray-300 rounded p-2"
            />
          </div>
        </div>
      </fieldset>

      {/* Servicios y Amenidades */}
      <fieldset className="border border-gray-300 rounded-lg p-4 mb-6">
        <legend className="text-lg font-semibold text-amber-800 px-2">
          Servicios y Amenidades
        </legend>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={banoPrivado}
              onChange={(e) => setBanoPrivado(e.target.checked)}
              className="w-4 h-4"
            />
            Incluye baño privado
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bano}
              onChange={(e) => setBano(e.target.checked)}
              className="w-4 h-4"
            />
            Incluye baño
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={lavanderia}
              onChange={(e) => setLavanderia(e.target.checked)}
              className="w-4 h-4"
            />
            Incluir servicio de lavandería
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={serviciosPublicos}
              onChange={(e) => setServiciosPublicos(e.target.checked)}
              className="w-4 h-4"
            />
            Incluir servicios públicos
          </label>
        </div>
      </fieldset>

      {/* Opciones de Búsqueda */}
      <fieldset className="border border-gray-300 rounded-lg p-4 mb-6">
        <legend className="text-lg font-semibold text-amber-800 px-2">
          Opciones de Búsqueda
        </legend>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Fecha de Publicación:
            </label>
            <select
              value={fechaPublicacion}
              onChange={(e) => setFechaPublicacion(e.target.value)}
              className="w-full border border-gray-300 rounded p-2"
            >
              <option value="cualquier_fecha">Cualquier fecha</option>
              <option value="ultimas_24h">Últimas 24 horas</option>
              <option value="1_dia">Hace 1 día</option>
              <option value="2_dias">Hace 2 días</option>
              <option value="3_dias">Hace 3 días</option>
              <option value="4_dias">Hace 4 días</option>
              <option value="5_dias">Hace 5 días</option>
              <option value="6_dias">Hace 6 días</option>
              <option value="1_semana">Hace 1 semana</option>
              <option value="2_semanas">Hace 2 semanas</option>
              <option value="3_semanas">Hace 3 semanas</option>
              <option value="1_mes">Hace 1 mes</option>
              <option value="2_meses">Hace 2 meses</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Número de Resultados:
            </label>
            <input
              type="number"
              value={numeroResultados}
              onChange={(e) => setNumeroResultados(e.target.value)}
              className="w-full border border-gray-300 rounded p-2"
            />
          </div>
          {!useExistingJson && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Cantidad de Posts por Grupo:
              </label>
              <input
                type="number"
                value={cantidadPostsPorGrupo}
                onChange={(e) => setCantidadPostsPorGrupo(e.target.value)}
                className="w-full border border-gray-300 rounded p-2"
              />
            </div>
          )}
        </div>
      </fieldset>

      {/* Buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={handleSearch}
          className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-2 rounded"
        >
          {useExistingJson ? "Filtrar JSON" : "Buscar"}
        </button>
        <button
          onClick={handleKeywordSearch}
          disabled={!useExistingJson || isKeywordSearching}
          className={`font-semibold px-6 py-2 rounded ${
            !useExistingJson
              ? "bg-blue-300 opacity-50 cursor-not-allowed text-white"
              : isKeywordSearching
                ? "bg-blue-400 opacity-70 cursor-not-allowed text-white"
                : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
        >
          {isKeywordSearching ? "Buscando..." : "Buscar sin AI"}
        </button>
        <button
          onClick={handleStop}
          className="bg-gray-400 hover:bg-gray-500 text-white font-semibold px-6 py-2 rounded"
        >
          Detener Búsqueda
        </button>
      </div>

      {/* Status */}
      <div className="border border-gray-300 rounded p-3 bg-white text-sm text-gray-700">
        {status}
      </div>

      {/* Keyword Search Results */}
      {showResults && (
        <div className="mt-6">
          <ResultsTable results={keywordResults} totalMatches={totalMatches} />
        </div>
      )}
    </main>
  );
}
