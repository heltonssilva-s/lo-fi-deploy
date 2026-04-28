import {
  clearLeaderboard,
  corsHeaders,
  deleteLeaderboardById,
  insertLeaderboardRow,
  isAdminRequest,
  jsonResponse,
  parseJsonBody,
  parseLimit,
  selectLeaderboardById,
  selectLeaderboardRows,
  textResponse,
  updateLeaderboardName
} from "./functions/api/leaderboard/_shared.js";

function parseLeaderboardId(pathname) {
  const match = pathname.match(/^\/api\/leaderboard\/(\d+)\/?$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function handleLeaderboardCollection(request, env) {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (method === "GET") {
    const limit = parseLimit(new URL(request.url));
    const rows = await selectLeaderboardRows(env, limit);
    return jsonResponse(rows);
  }

  if (method === "POST") {
    const body = await parseJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Corpo JSON inválido." }, 400);
    }

    const result = await insertLeaderboardRow(env, body, request.url);
    if (result?.error) {
      return jsonResponse({ error: result.error }, result.status || 400);
    }

    return jsonResponse(
      {
        inserted: Boolean(result.inserted),
        data: result.row
      },
      result.inserted ? 201 : 200
    );
  }

  if (method === "DELETE") {
    if (!isAdminRequest({ env, request })) {
      return jsonResponse({ error: "Acesso negado." }, 403);
    }

    const deleted = await clearLeaderboard(env);
    return jsonResponse({ deleted });
  }

  return textResponse("Método não permitido.", 405);
}

async function handleLeaderboardEntry(request, env, id) {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (method === "GET") {
    const row = await selectLeaderboardById(env, id);
    return row
      ? jsonResponse({ data: row })
      : jsonResponse({ error: "Registro não encontrado." }, 404);
  }

  if (method === "PATCH") {
    if (!isAdminRequest({ env, request })) {
      return jsonResponse({ error: "Acesso negado." }, 403);
    }

    const body = await parseJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Corpo JSON inválido." }, 400);
    }

    const result = await updateLeaderboardName(env, id, body.name, request.url);
    if (result?.error) {
      return jsonResponse({ error: result.error }, result.status || 400);
    }

    return jsonResponse({ data: result });
  }

  if (method === "DELETE") {
    if (!isAdminRequest({ env, request })) {
      return jsonResponse({ error: "Acesso negado." }, 403);
    }

    const existing = await selectLeaderboardById(env, id);
    if (!existing) {
      return jsonResponse({ error: "Registro não encontrado." }, 404);
    }

    const deleted = await deleteLeaderboardById(env, id);
    return jsonResponse({ deleted, data: existing });
  }

  return textResponse("Método não permitido.", 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/leaderboard" || url.pathname === "/api/leaderboard/") {
      return handleLeaderboardCollection(request, env);
    }

    if (url.pathname.startsWith("/api/leaderboard/")) {
      const id = parseLeaderboardId(url.pathname);
      if (!id) {
        return jsonResponse({ error: "Identificador inválido." }, 400);
      }
      return handleLeaderboardEntry(request, env, id);
    }

    if (env?.ASSETS?.fetch) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};
