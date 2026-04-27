const LEADERBOARD_NAME_MAX_LENGTH = 25;
const LEADERBOARD_SCORE_MAX = 99999999;
const LEADERBOARD_DEFAULT_LIMIT = 100;
const ADMIN_HEADER_NAME = 'x-admin-password';

let forbiddenWordsCache = null;
let forbiddenWordsLoadPromise = null;

function normalizeForFilter(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function translateLeetspeak(str) {
    const map = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };
    return String(str || '').replace(/[013457]/g, (m) => map[m] || m);
}

async function loadForbiddenWords(env, requestUrl = 'https://cloudflare.local/') {
    if (Array.isArray(forbiddenWordsCache)) return forbiddenWordsCache;
    if (forbiddenWordsLoadPromise) return forbiddenWordsLoadPromise;

    forbiddenWordsLoadPromise = (async () => {
        try {
            const envWords = typeof env?.FORBIDDEN_WORDS === 'string'
                ? env.FORBIDDEN_WORDS
                : '';
            if (envWords.trim().length > 0) {
                forbiddenWordsCache = envWords
                    .split(/\r?\n/)
                    .map((w) => w.trim().toLowerCase())
                    .filter((w) => w.length > 0);
                return forbiddenWordsCache;
            }

            const assets = env?.ASSETS;
            if (!assets || typeof assets.fetch !== 'function') {
                forbiddenWordsCache = [];
                return forbiddenWordsCache;
            }

            const assetUrl = new URL('/etc/lista_palavras.txt', requestUrl);
            const res = await assets.fetch(assetUrl);
            if (!res || !res.ok) {
                forbiddenWordsCache = [];
                return forbiddenWordsCache;
            }

            const text = await res.text();
            forbiddenWordsCache = text
                .split(/\r?\n/)
                .map((w) => w.trim().toLowerCase())
                .filter((w) => w.length > 0);
            return forbiddenWordsCache;
        } catch (_) {
            forbiddenWordsCache = [];
            return forbiddenWordsCache;
        } finally {
            forbiddenWordsLoadPromise = null;
        }
    })();

    return forbiddenWordsLoadPromise;
}

async function containsForbiddenWord(env, name, requestUrl = 'https://cloudflare.local/') {
    if (!name) return false;
    const words = await loadForbiddenWords(env, requestUrl);
    if (!Array.isArray(words) || words.length === 0) return false;

    const nRaw = String(name).toLowerCase();
    const nClean = normalizeForFilter(nRaw);
    const nLeet = translateLeetspeak(nClean);
    const nNoSymbols = nLeet.replace(/[^a-z0-9]/g, '');

    return words.some((word) => {
        const wClean = normalizeForFilter(word);
        const wNoSymbols = wClean.replace(/[^a-z0-9]/g, '');
        if (!wNoSymbols) return false;
        if (wNoSymbols.length <= 3) {
            const regex = new RegExp(`\\b${wNoSymbols}\\b`, 'i');
            return regex.test(nLeet) || nNoSymbols === wNoSymbols;
        }
        return nNoSymbols.includes(wNoSymbols);
    });
}

function normalizeName(name) {
    return String(name || '').trim().slice(0, LEADERBOARD_NAME_MAX_LENGTH) || 'Anon';
}

function normalizeScore(value) {
    if (!Number.isFinite(value)) return null;
    const next = Math.floor(value);
    return next >= 0 && next <= LEADERBOARD_SCORE_MAX ? next : null;
}

function normalizeDistance(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
}

function leaderboardEntryKey(entry) {
    const name = normalizeName(entry?.name).toLowerCase();
    const score = normalizeScore(entry?.score);
    const distance = normalizeDistance(entry?.distance);
    return `${name}_${score ?? 0}_${distance}`;
}

function formatDateOnly(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function formatCreatedAt(date = new Date()) {
    return date.toISOString();
}

function parseLimit(url, fallback = LEADERBOARD_DEFAULT_LIMIT) {
    const parsedUrl = url instanceof URL
        ? url
        : new URL(String(url || 'https://cloudflare.local/'));
    const rawValue = parsedUrl.searchParams.get('limit');
    if (rawValue === null || rawValue.trim() === '') return fallback;
    const raw = Number(rawValue);
    if (!Number.isFinite(raw) || raw <= 0) return fallback;
    return Math.max(1, Math.min(LEADERBOARD_DEFAULT_LIMIT, Math.floor(raw)));
}

function corsHeaders(extra = {}) {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Cache-Control': 'no-store',
        ...extra
    };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
    return Response.json(payload, { status, headers: corsHeaders(extraHeaders) });
}

function textResponse(message, status = 400, extraHeaders = {}) {
    return new Response(message, {
        status,
        headers: corsHeaders({
            'Content-Type': 'text/plain; charset=utf-8',
            ...extraHeaders
        })
    });
}

function parseJsonBody(request) {
    return request.json().catch(() => null);
}

function isAdminRequest(context) {
    const expected = String(context?.env?.LEADERBOARD_ADMIN_PASSWORD || '').trim();
    if (!expected) return false;
    const received = String(context?.request?.headers?.get(ADMIN_HEADER_NAME) || '').trim();
    return received.length > 0 && received === expected;
}

function mapLeaderboardRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        entry_key: row.entry_key,
        name: row.name,
        score: Number(row.score),
        distance: normalizeDistance(row.distance),
        date: row.date,
        created_at: row.created_at
    };
}

async function selectLeaderboardRows(env, limit = LEADERBOARD_DEFAULT_LIMIT) {
    const stmt = env.LEADERBOARD_DB.prepare(
        'SELECT id, entry_key, name, score, distance, date, created_at ' +
        'FROM leaderboard ' +
        'ORDER BY score DESC, distance DESC, created_at ASC, id ASC ' +
        'LIMIT ?'
    );
    const result = await stmt.bind(limit).all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows.map(mapLeaderboardRow).filter(Boolean);
}

async function selectLeaderboardById(env, id) {
    const stmt = env.LEADERBOARD_DB.prepare(
        'SELECT id, entry_key, name, score, distance, date, created_at FROM leaderboard WHERE id = ? LIMIT 1'
    );
    const row = await stmt.bind(id).first();
    return mapLeaderboardRow(row);
}

async function selectLeaderboardByKey(env, entryKey) {
    const stmt = env.LEADERBOARD_DB.prepare(
        'SELECT id, entry_key, name, score, distance, date, created_at FROM leaderboard WHERE entry_key = ? LIMIT 1'
    );
    const row = await stmt.bind(entryKey).first();
    return mapLeaderboardRow(row);
}

async function insertLeaderboardRow(env, entry, requestUrl = 'https://cloudflare.local/') {
    const cleanName = normalizeName(entry?.name);
    const score = normalizeScore(entry?.score);
    const distance = normalizeDistance(entry?.distance);
    if (score === null) {
        return { error: 'Score inválido.', status: 400 };
    }
    if (await containsForbiddenWord(env, cleanName, requestUrl)) {
        return { error: 'Nome contém termos inválidos.', status: 400 };
    }

    const date = typeof entry?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
        ? entry.date
        : formatDateOnly();
    const createdAt = typeof entry?.created_at === 'string' && entry.created_at.trim().length > 0
        ? entry.created_at
        : formatCreatedAt();
    const entryKey = leaderboardEntryKey({ name: cleanName, score, distance });

    const stmt = env.LEADERBOARD_DB.prepare(
        'INSERT OR IGNORE INTO leaderboard (entry_key, name, score, distance, date, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = await stmt.bind(entryKey, cleanName, score, distance, date, createdAt).run();
    const row = await selectLeaderboardByKey(env, entryKey);

    return {
        inserted: Boolean(result?.meta?.changes),
        row: row || {
            id: null,
            entry_key: entryKey,
            name: cleanName,
            score,
            distance,
            date,
            created_at: createdAt
        }
    };
}

async function updateLeaderboardName(env, id, name, requestUrl = 'https://cloudflare.local/') {
    const cleanName = normalizeName(name);
    if (!cleanName) return { error: 'Nome inválido.', status: 400 };
    if (await containsForbiddenWord(env, cleanName, requestUrl)) {
        return { error: 'Nome contém termos inválidos.', status: 400 };
    }

    const existing = await selectLeaderboardById(env, id);
    if (!existing) {
        return { error: 'Registro não encontrado.', status: 404 };
    }

    const entryKey = leaderboardEntryKey({
        name: cleanName,
        score: existing.score,
        distance: existing.distance
    });
    const conflict = await selectLeaderboardByKey(env, entryKey);
    if (conflict && conflict.id !== id) {
        return { error: 'Já existe uma entrada com este nome para esse placar.', status: 409 };
    }
    const stmt = env.LEADERBOARD_DB.prepare(
        'UPDATE leaderboard SET name = ?, entry_key = ? WHERE id = ?'
    );
    try {
        await stmt.bind(cleanName, entryKey, id).run();
    } catch (err) {
        const message = String(err?.message || err || '');
        if (message.includes('UNIQUE') || message.includes('constraint')) {
            return { error: 'Já existe uma entrada com este nome para esse placar.', status: 409 };
        }
        throw err;
    }
    return selectLeaderboardById(env, id);
}

async function deleteLeaderboardById(env, id) {
    const stmt = env.LEADERBOARD_DB.prepare('DELETE FROM leaderboard WHERE id = ?');
    const result = await stmt.bind(id).run();
    return Number(result?.meta?.changes || 0);
}

async function clearLeaderboard(env) {
    const result = await env.LEADERBOARD_DB.prepare('DELETE FROM leaderboard').run();
    return Number(result?.meta?.changes || 0);
}

export {
    ADMIN_HEADER_NAME,
    LEADERBOARD_DEFAULT_LIMIT,
    LEADERBOARD_NAME_MAX_LENGTH,
    LEADERBOARD_SCORE_MAX,
    clearLeaderboard,
    containsForbiddenWord,
    corsHeaders,
    deleteLeaderboardById,
    formatCreatedAt,
    formatDateOnly,
    insertLeaderboardRow,
    isAdminRequest,
    jsonResponse,
    leaderboardEntryKey,
    mapLeaderboardRow,
    normalizeDistance,
    normalizeName,
    normalizeScore,
    parseJsonBody,
    parseLimit,
    selectLeaderboardById,
    selectLeaderboardRows,
    textResponse,
    updateLeaderboardName
};
