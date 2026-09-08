(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.JalDataUtils = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const JST_TIME_ZONE = 'Asia/Tokyo';
    const STANDARD_COMPLETED_STATUS = '済';
    const COMPLETED_STATUS_ALIASES = new Set(['済', '済み', '搭乗済', '搭乗済み', '完了']);

    function formatDateParts(year, month, day) {
        const y = Number(year), m = Number(month), d = Number(day);
        if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return '';
        const date = new Date(Date.UTC(y, m - 1, d));
        if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    function toJstDateString(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: JST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date).reduce((result, part) => {
            if (part.type !== 'literal') result[part.type] = part.value;
            return result;
        }, {});
        return `${parts.year}-${parts.month}-${parts.day}`;
    }

    function parseDate(value) {
        if (value === undefined || value === null || value === '') return '';
        if (value instanceof Date) return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
        if (typeof value === 'number' && Number.isFinite(value)) {
            const excelEpoch = Date.UTC(1899, 11, 30);
            return toJstDateString(excelEpoch + Math.round(value * 86400000));
        }
        const text = String(value).replace(/[\s\u00A0]/g, '').trim();
        if (!text || text.includes('まで')) return '';
        const match = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:T.*)?$/);
        return match ? formatDateParts(match[1], match[2], match[3]) : '';
    }

    function normalizeStatus(value) {
        const raw = String(value || '').trim();
        if (!raw) return { value: '予定', isCompleted: false, isStandard: true, warning: '' };
        if (COMPLETED_STATUS_ALIASES.has(raw)) {
            return {
                value: STANDARD_COMPLETED_STATUS,
                isCompleted: true,
                isStandard: raw === STANDARD_COMPLETED_STATUS,
                warning: raw === STANDARD_COMPLETED_STATUS ? '' : `状態「${raw}」は非標準値です。標準値「済」を使用してください。`
            };
        }
        if (raw === '予定') return { value: raw, isCompleted: false, isStandard: true, warning: '' };
        return { value: raw, isCompleted: false, isStandard: false, warning: `状態「${raw}」は想定外の値です。` };
    }

    function isCompletedStatus(value) { return normalizeStatus(value).isCompleted; }
    function todayJst(now = new Date()) { return toJstDateString(now); }
    function isToday(dateString, now = new Date()) { return dateString === todayJst(now); }
    function isFutureDate(dateString, now = new Date()) { return Boolean(dateString) && dateString > todayJst(now); }

    function getRequiredColumnErrors(headers, definitions) {
        const normalized = (headers || []).map(header => String(header || '').replace(/[\s\u00A0\t\n]/g, '').toLowerCase());
        return definitions.filter(definition => !definition.aliases.some(alias => normalized.some(header => header.includes(alias.toLowerCase()))))
            .map(definition => `必須列「${definition.label}」が見つかりません`);
    }

    function getRequiredSheetErrors(sheetNames, requiredSheets) {
        const normalized = (sheetNames || []).map(name => String(name || '').toLowerCase());
        return requiredSheets.filter(sheet => !normalized.some(name => name.includes(sheet.keyword.toLowerCase())))
            .map(sheet => `必須シート「${sheet.label}」が見つかりません`);
    }

    function parseNumberStrict(value) {
        if (value === undefined || value === null || String(value).trim() === '') return { valid: true, value: 0 };
        const normalized = String(value).replace(/[０-９．－]/g, char => ({ '．': '.', '－': '-' }[char] || String.fromCharCode(char.charCodeAt(0) - 0xFEE0))).replace(/[\s\u00A0,]/g, '');
        const number = Number(normalized);
        return { valid: Number.isFinite(number), value: Number.isFinite(number) ? number : 0 };
    }

    return { JST_TIME_ZONE, STANDARD_COMPLETED_STATUS, parseDate, todayJst, toJstDateString, isToday, isFutureDate, normalizeStatus, isCompletedStatus, getRequiredColumnErrors, getRequiredSheetErrors, parseNumberStrict };
});
