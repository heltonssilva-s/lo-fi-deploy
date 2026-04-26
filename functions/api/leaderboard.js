import {
    clearLeaderboard,
    corsHeaders,
    insertLeaderboardRow,
    isAdminRequest,
    jsonResponse,
    parseJsonBody,
    parseLimit,
    selectLeaderboardRows,
    textResponse
} from './leaderboard/_shared.js';

async function handleGet(context) {
    const limit = parseLimit(new URL(context.request.url));
    const rows = await selectLeaderboardRows(context.env, limit);
    return jsonResponse(rows);
}

async function handlePost(context) {
    const body = await parseJsonBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return jsonResponse({ error: 'Corpo JSON inválido.' }, 400);
    }

    const result = await insertLeaderboardRow(context.env, body, context.request.url);
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

async function handleDelete(context) {
    if (!isAdminRequest(context)) {
        return jsonResponse({ error: 'Acesso negado.' }, 403);
    }

    const deleted = await clearLeaderboard(context.env);
    return jsonResponse({ deleted });
}

export async function onRequest(context) {
    const method = String(context.request.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (method === 'GET') return handleGet(context);
    if (method === 'POST') return handlePost(context);
    if (method === 'DELETE') return handleDelete(context);
    return textResponse('Método não permitido.', 405);
}
