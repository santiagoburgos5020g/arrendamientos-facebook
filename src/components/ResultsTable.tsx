"use client";

import type { FilteredResult } from "@/lib/keywordFilter";

interface ResultsTableProps {
  results: FilteredResult[];
  totalMatches: number;
}

export default function ResultsTable({ results, totalMatches }: ResultsTableProps) {
  if (results.length === 0) {
    return (
      <p className="text-gray-600 text-center py-4">
        No se encontraron resultados que coincidan con los filtros.
      </p>
    );
  }

  const countText =
    results.length < totalMatches
      ? `Mostrando ${results.length} de ${totalMatches} resultados`
      : `Se encontraron ${results.length} resultados`;

  return (
    <div>
      <p className="font-semibold text-gray-700 mb-3">{countText}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-blue-700 text-white text-left text-sm">
              <th className="px-3 py-3">Teléfono</th>
              <th className="px-3 py-3">Descripción</th>
              <th className="px-3 py-3">Costo</th>
              <th className="px-3 py-3">Grupo</th>
              <th className="px-3 py-3">Enlace</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2 border-b border-gray-200 text-sm align-top whitespace-nowrap">
                  <a
                    href={result.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {result.phone}
                  </a>
                </td>
                <td className="px-3 py-2 border-b border-gray-200 text-sm align-top max-w-md">
                  {result.description}
                </td>
                <td className="px-3 py-2 border-b border-gray-200 text-sm align-top font-bold text-green-700 whitespace-nowrap">
                  {result.price}
                </td>
                <td className="px-3 py-2 border-b border-gray-200 text-sm align-top">
                  {result.group}
                </td>
                <td className="px-3 py-2 border-b border-gray-200 text-sm align-top whitespace-nowrap">
                  <a
                    href={result.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Ver publicación
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
