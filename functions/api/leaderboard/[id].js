import {
    corsHeaders,
    deleteLeaderboardById,
    isAdminRequest,
    jsonResponse,
    parseJsonBody,
    selectLeaderboardById,
    textResponse,
    updateLeaderboardName
} from '../leaderboard/_shared.js';

function parseId(context) {
    const raw = context?.params?.id;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function handlePatch(context, id) {
    if (!isAdminRequest(context)) {
        return jsonResponse({ error: 'Acesso negado.' }, 403);
    }

    const body = await parseJsonBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return jsonResponse({ error: 'Corpo JSON inválido.' }, 400);
    }

    const result = await updateLeaderboardName(context.env, id, body.name, context.request.url);
    if (result?.error) {
        return jsonResponse({ error: result.error }, result.status || 400);
    }

    return jsonResponse({ data: result });
}

async function handleDelete(context, id) {
    if (!isAdminRequest(context)) {
        return jsonResponse({ error: 'Acesso negado.' }, 403);
    }

    const existing = await selectLeaderboardById(context.env, id);
    if (!existing) {
        return jsonResponse({ error: 'Registro não encontrado.' }, 404);
    }

    const deleted = await deleteLeaderboardById(context.env, id);
    return jsonResponse({ deleted, data: existing });
}

export async function onRequest(context) {
    const id = parseId(context);
    if (!id) {
        return jsonResponse({ error: 'Identificador inválido.' }, 400);
    }

    const method = String(context.request.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (method === 'PATCH') return handlePatch(context, id);
    if (method === 'DELETE') return handleDelete(context, id);
    if (method === 'GET') {
        const row = await selectLeaderboardById(context.env, id);
        return row ? jsonResponse({ data: row }) : jsonResponse({ error: 'Registro não encontrado.' }, 404);
    }
    return textResponse('Método não permitido.', 405);
}
