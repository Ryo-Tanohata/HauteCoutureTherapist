// セラピスト向け顧客管理アプリ：UI・DOM操作制御モジュール

import {
    getCustomers, addCustomer, addRecord, updateCustomer, updateRecord, deleteRecord, deleteCustomer,
    archiveCustomer, unarchiveCustomer,
    getSoulColors, getMainSoulColor, MAX_SOUL_COLORS, SOUL_COLOR_DEFS, TC_COLOR_DEFS, ADVANCE_COLOR_DEFS,
    getColorMasters,
    getAdvanceSetPreference, saveAdvanceSetPreference,
    getNamePreference, saveNamePreference,
    SERVICE_CATEGORY_DEFS, getServiceCategories, getServiceCategoryDef,
    getLastSaveError, isStorageWritable, saveCustomers, onDataChanged, nextCustomerNo,
    normalizeCustomerNo, findCustomerNoOwner,
    getDeletions, saveDeletions, RECORD_FIELDS, isFilledField,
    getLastBackupAt, markBackupDone, getBackupReminder, BACKUP_REMIND_DAYS,
    pruneOverwrittenList, sweepOverwritten, OVERWRITTEN_KEEP_DAYS,
    SERVICE_MENU_DEFS, getServiceMenu, saveServiceMenu, getMenuItem,
    menuTotal, categoriesFromMenu, menuLabel
} from './data.js';
import { getCorrespondence, PLANET_DEFS, SIGN_BODY_PARTS } from './correspondence.js';
import { detectAiRoute, forgetAiRoute } from './ai-route.js';
import { isChatEnabled, setChatEnabled } from './chat-visibility.js';
import {
    isPrepEnabled, setPrepEnabled, applyPrepVisibility, isAiKeyNeeded
} from './prep-visibility.js';
import {
    CONSTITUTION_FLAGS, ALLERGY_FAMILIES, getConstitution, hasConstitutionData, filterOils,
    normalizeFreeText, getFreeTextCautions, filterCarrierOils, OIL_SAFETY, checkOil
} from './oil-safety.js';
import {
    reviewFreeText, suggestFreeText, mergeFreeText, unmergeFreeText, buildPromotionRequest,
    comparisonKey, getMergeMap
} from './free-text-review.js';
import {
    ELEMENTS, SIGN_PROFILES, BLEND_ROLES, TECHNIQUES, SAFETY_NOTES, SOURCE_NOTE,
    POLARITIES, MODALITIES, WU_XING, ZANG_FU,
    getElement, getElementOfSign, getSignProfile, getPolarityOfSign, getModalityOfSign
} from './astro-aroma.js';
import {
    PHOTO_KINDS, isPhotoStoreAvailable, savePhoto, getPhotoUrl, purgeOrphanPhotos,
    exportAllPhotos, importPhotos, getPhotoUsage, formatBytes,
    listPhotoIds, getPhotoBlob, putPhotoBlob
} from './photo-store.js';
import {
    STORE_MIN_PASSPHRASE, getStoreConfig, setStoreConfig, isStoreConnected,
    disconnectStore, connectStore, storeAuthValue,
    storePullSnapshot, storePushSnapshot, storeListPhotoIds, storePushPhoto, storePullPhoto
} from './salon-store.js';
import { buildSessionPrompt } from './session-prompt.js';
import {
    classifyApiKey, getProviderLabel, getStoredApiKey, getStoredApiKeys,
    addApiKey, removeApiKeyAt, moveApiKeyUp, clearApiKeys, maskApiKey, generateWithOwnKey,
    getModelInfo, refreshModelChoice, getUsageSummary, clearUsage,
    getPreferredProvider, setPreferredProvider, providerHeader, getProviderChoiceLabel,
    getPreferredClaudeModel, setPreferredClaudeModel
} from './ai-client.js';
import { CLAUDE_MODEL_CHOICES } from './model-registry.js';

// モジュールスコープでコールバック変数を宣言
let onRecordEditRequested = null;
// 新しい予約・記録を書く画面を開く。中身は initApp 側にあるので、そこから差し込む。
let openNewRecordRequested = null;
// renderCalendar は initApp の内側にあり、ここからは直接呼べない。
// initApp 側で差し込んでもらう。
let onRecordsChanged = null;

// 今日の天体配置。星詠みの保存ファイルから読む（AIは呼ばない）。
// 顧客ごとの「カラーと星」タブで使うため、ページ内で1度だけ取得して使い回す。
let todayPlanetsPromise = null;
function getTodayPlanets() {
    if (!todayPlanetsPromise) {
        todayPlanetsPromise = fetch('data/advice/today.json', { cache: 'no-cache' })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => (json && json.data) || null)
            .catch(() => null);
    }
    return todayPlanetsPromise;
}

// 天体が星座を移った日の表。ブラウザに天文計算を持たせていないため、
// 過去の来店日の位置はこの表を引いて求める（server/ingress.js が生成）。
let ingressPromise = null;
function getIngressTable() {
    if (!ingressPromise) {
        ingressPromise = fetch('data/advice/ingress.json', { cache: 'no-cache' })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null);
    }
    return ingressPromise;
}

/**
 * ある日付にその天体がいた星座を返す。表の範囲外・未収録なら null。
 * 各エントリは「その星座に入った最初の日」なので、日付以下で最後のものを探す。
 */
function findSignAt(table, planetKey, dateStr) {
    if (!table || !table.planets || !dateStr) return null;
    if (dateStr < table.from || dateStr > table.to) return null;
    const list = table.planets[planetKey];
    if (!Array.isArray(list) || list.length === 0) return null;

    let lo = 0;
    let hi = list.length - 1;
    let found = null;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].d <= dateStr) {
            found = list[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found ? found.s : null;
}

/**
 * 画面上部にトーストメッセージを表示する
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    if (!toast) return;

    if (toastMsg) toastMsg.textContent = message;
    if (toastIcon) {
        toastIcon.textContent = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
    }

    toast.style.borderColor = type === 'error' ? '#ff5252' : type === 'success' ? '#00e676' : 'var(--accent-cyan)';
    toast.style.opacity = '1';
    toast.style.pointerEvents = 'auto';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.pointerEvents = 'none';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 2500);
}

/** [ISSUE-NEW] 下書きを保存する */
function saveRecordDraft(customerId) {
    if (!customerId) return;
    const draft = {
        date: document.getElementById('input-date')?.value,
        time: document.getElementById('input-time')?.value,
        type: document.getElementById('input-type')?.value,
        clientComplaint: document.getElementById('input-client-complaint')?.value,
        prescription: document.getElementById('input-prescription')?.value,
        therapistNote: document.getElementById('input-therapist-note')?.value,
        amount: document.getElementById('input-amount')?.value,
        timestamp: Date.now()
    };
    localStorage.setItem(`record_draft_${customerId}`, JSON.stringify(draft));
    const indicator = document.getElementById('draft-indicator');
    if (indicator) indicator.style.display = 'block';
}

/** [ISSUE-NEW] 下書きを読み込む */
function loadRecordDraft(customerId) {
    if (!customerId) return;
    const raw = localStorage.getItem(`record_draft_${customerId}`);
    if (!raw) {
        const indicator = document.getElementById('draft-indicator');
        if (indicator) indicator.style.display = 'none';
        return;
    }
    const draft = JSON.parse(raw);
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = val;
    };
    setVal('input-date', draft.date);
    setVal('input-time', draft.time);
    setVal('input-type', draft.type);
    setVal('input-client-complaint', draft.clientComplaint);
    setVal('input-prescription', draft.prescription);
    setVal('input-therapist-note', draft.therapistNote);
    setVal('input-amount', draft.amount);
    
    const indicator = document.getElementById('draft-indicator');
    if (indicator) indicator.style.display = 'block';
}

/** [ISSUE-NEW] 下書きを消去 */
function clearRecordDraft(customerId) {
    if (!customerId) return;
    localStorage.removeItem(`record_draft_${customerId}`);
    const indicator = document.getElementById('draft-indicator');
    if (indicator) indicator.style.display = 'none';
}

/**
 * カスタム削除・確認モーダルを表示する（iFrame内でのconfirmブロック回避）
 */
function showConfirmModal({ title = '確認', message = '処理を実行しますか？', actionText = '削除する', onConfirm, icon = '🗑️', theme = 'danger' }) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const actionTextEl = document.getElementById('confirm-modal-action-text');
    const iconEl = document.getElementById('confirm-modal-icon');
    const btnIconEl = document.getElementById('confirm-modal-btn-icon');
    const contentEl = document.getElementById('confirm-modal-content');
    const btnCancel = document.getElementById('btn-cancel-confirm');
    const btnSubmit = document.getElementById('btn-submit-confirm');

    if (!modal) {
        if (onConfirm) onConfirm();
        return;
    }

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (actionTextEl) actionTextEl.textContent = actionText;
    if (iconEl) iconEl.textContent = icon;
    if (btnIconEl) btnIconEl.textContent = icon;

    // テーマに基づいたスタイリング
    if (contentEl && btnSubmit) {
        if (theme === 'success') {
            contentEl.style.borderColor = 'rgba(16, 185, 129, 0.5)';
            contentEl.style.boxShadow = '0 10px 30px rgba(16, 185, 129, 0.25)';
            btnSubmit.style.background = '#10b981';
        } else if (theme === 'warning') {
            contentEl.style.borderColor = 'rgba(245, 158, 11, 0.5)';
            contentEl.style.boxShadow = '0 10px 30px rgba(245, 158, 11, 0.25)';
            btnSubmit.style.background = '#f59e0b';
        } else {
            // default danger
            contentEl.style.borderColor = 'rgba(255, 82, 82, 0.5)';
            contentEl.style.boxShadow = '0 10px 30px rgba(255, 82, 82, 0.25)';
            btnSubmit.style.background = '#ff5252';
        }
    }

    modal.classList.add('active');

    const cleanup = () => {
        modal.classList.remove('active');
        if (btnCancel) btnCancel.removeEventListener('click', handleCancel);
        if (btnSubmit) btnSubmit.removeEventListener('click', handleSubmit);
        modal.removeEventListener('click', handleOverlayClick);
    };

    const handleCancel = (e) => {
        if (e) e.stopPropagation();
        cleanup();
    };

    const handleOverlayClick = (e) => {
        if (e.target === modal) {
            handleCancel(e);
        }
    };

    const handleSubmit = (e) => {
        if (e) e.stopPropagation();
        cleanup();
        if (onConfirm) onConfirm();
    };

    if (btnCancel) btnCancel.addEventListener('click', handleCancel, { once: true });
    if (btnSubmit) btnSubmit.addEventListener('click', handleSubmit, { once: true });
    modal.addEventListener('click', handleOverlayClick);
}

// -------------------------------------------------------------------
// [ISSUE-018] Soul Color（最大5色）共通ヘルパー
// -------------------------------------------------------------------

export const SOUL_COLOR_MAP = {
    '1-red': '#ef4444',
    '2-blue': '#3b82f6',
    '3-yellow': '#facc15',
    '4-green': '#22c55e',
    '5-turquoise': '#06b6d4',
    '6-pink': '#f472b6',
    '7-purple': '#a855f7',
    '8-orange': '#f97316',
    '9-magenta': '#d946ef',
    '11-indigo': '#192f76',
    '22-olive': '#7d8943',
    '33-evolved-pink': 'linear-gradient(135deg, #ff66c4 0%, #f43f5e 100%)',
    // 後方互換キー
    'red': '#ef4444',
    'coral': '#f87171',
    'orange': '#f97316',
    'gold': '#fbbf24',
    'yellow': '#facc15',
    'olive': '#7d8943',
    'green': '#22c55e',
    'turquoise': '#06b6d4',
    'blue': '#3b82f6',
    'royal-blue': '#3b82f6',
    'violet': '#a855f7',
    'magenta': '#d946ef',
    'clear': 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)',
};

export const SOUL_COLOR_NAMES = {
    '1-red': '赤',
    '2-blue': '青',
    '3-yellow': '黄',
    '4-green': '緑',
    '5-turquoise': 'ターコイズ',
    '6-pink': 'ピンク',
    '7-purple': '紫',
    '8-orange': 'オレンジ',
    '9-magenta': 'マゼンタピンク',
    '11-indigo': 'インディゴ',
    '22-olive': 'オリーブグリーン',
    '33-evolved-pink': '進化系pink',
    'red': '赤',
    'blue': '青',
    'yellow': '黄',
    'green': '緑',
    'turquoise': 'ターコイズ',
    'pink': 'ピンク',
    'purple': '紫',
    'orange': 'オレンジ',
    'magenta': 'マゼンタピンク',
    'indigo': 'インディゴ',
    'olive': 'オリーブグリーン',
    'clear': 'クリア（未選択）',
};

/**
 * CSS の色として、そのまま画面へ流してよい形か（ISSUE-088）。
 *
 * **ここを緩くすると、色の値から HTML を書き込まれる。**
 * 色は `style="..."` の中へ直に入るので、`"` を含む値が通ると
 * その場で属性を閉じて、好きな属性を足せてしまう。
 * 取り込んだファイルや、同期で届いた中身は、こちらで検証していない。
 *
 * 通すのは、色として意味のある字だけ。丸括弧・カンマ・％・小数点まで。
 * 引用符・山括弧・セミコロン・波括弧は通さない。
 */
const CSS_COLOR_OK = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9a-zA-Z.,%\s/-]*\)|linear-gradient\([#0-9a-zA-Z.,%\s()-]*\))$/;

const CLEAR_GRADIENT = 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)';

export function getSoulColorCssValue(color) {
    if (!color || color === 'clear') return CLEAR_GRADIENT;
    if (typeof color !== 'string') return CLEAR_GRADIENT;
    if (color.startsWith('#') || color.startsWith('linear-gradient') || color.startsWith('rgb')) {
        // 色そのものを書いた値。**形を確かめてから通す**
        return CSS_COLOR_OK.test(color.trim()) ? color.trim() : CLEAR_GRADIENT;
    }
    if (SOUL_COLOR_MAP[color]) return SOUL_COLOR_MAP[color];

    const lowColor = color.toLowerCase();

    // TCカラーセラピーの定義から検索
    if (typeof TC_COLOR_DEFS !== 'undefined') {
        const tcMatch = TC_COLOR_DEFS.find(tc => tc.key.toLowerCase() === lowColor || tc.code.toLowerCase() === lowColor);
        if (tcMatch) return tcMatch.code;
    }

    // アドバンスカラーセラピーの定義から検索
    if (typeof ADVANCE_COLOR_DEFS !== 'undefined') {
        const advMatch = ADVANCE_COLOR_DEFS.find(adv => adv.key.toLowerCase() === lowColor || adv.code.toLowerCase() === lowColor);
        if (advMatch) return advMatch.code;
    }

    // 基本定義から検索
    if (typeof SOUL_COLOR_DEFS !== 'undefined') {
        const soulMatch = SOUL_COLOR_DEFS.find(s => s.key.toLowerCase() === lowColor || s.code.toLowerCase() === lowColor);
        if (soulMatch) return soulMatch.code;
    }

    // どの定義にも無い値。**そのまま返さない。**
    // 以前はここで返していたので、取り込んだファイルの中身が
    // style へ素通りしていた（ISSUE-088）。
    // 色の名前（red, blue …）だけは通す。字と数字しか含まないため。
    return /^[a-zA-Z]{3,20}$/.test(color) ? color : CLEAR_GRADIENT;
}

/** HEXコードから直感的で綺麗な日本語色名を判別するヘルパー */
export function getColorNameFromHex(hex) {
    if (!hex || !hex.startsWith('#')) return 'カスタムカラー';
    
    let c = hex.substring(1);
    if (c.length === 3) {
        c = c.split('').map(x => x + x).join('');
    }
    if (c.length !== 6) return 'カスタムカラー';

    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);

    const rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
            case gNorm: h = (bNorm - rNorm) / d + 2; break;
            case bNorm: h = (rNorm - gNorm) / d + 4; break;
        }
        h /= 6;
    }

    const hueDeg = Math.round(h * 360);
    const satPct = Math.round(s * 100);
    const lightPct = Math.round(l * 100);

    // 1. 白・黒・グレースケール
    if (lightPct >= 96) return 'ホワイト';
    if (lightPct <= 8) return 'ブラック';

    if (satPct <= 12) {
        if (lightPct >= 80) return 'ライトグレー';
        if (lightPct >= 55) return 'グレー';
        if (lightPct >= 30) return 'ダークグレー';
        return 'チャコール';
    }

    // 2. 有彩色（色相＆明度から自動命名）
    if (hueDeg >= 355 || hueDeg < 11) {
        if (lightPct >= 72) return 'ライトピンク';
        if (lightPct <= 35) return 'ワインレッド';
        return 'レッド';
    }
    if (hueDeg >= 11 && hueDeg < 26) {
        if (lightPct >= 72) return 'サーモンピンク';
        return 'コーラル';
    }
    if (hueDeg >= 26 && hueDeg < 46) {
        if (lightPct >= 72) return 'ライトオレンジ';
        if (lightPct <= 35) return 'ブラウン';
        return 'オレンジ';
    }
    if (hueDeg >= 46 && hueDeg < 66) {
        if (lightPct >= 75) return 'クリームイエロー';
        if (lightPct <= 35) return 'オリーブゴールド';
        return 'イエロー';
    }
    if (hueDeg >= 66 && hueDeg < 86) {
        if (lightPct <= 35) return 'オリーブ';
        return 'ライムグリーン';
    }
    if (hueDeg >= 86 && hueDeg < 141) {
        if (lightPct >= 72) return 'ミントグリーン';
        if (lightPct <= 35) return 'ディープグリーン';
        return 'グリーン';
    }
    if (hueDeg >= 141 && hueDeg < 191) {
        if (lightPct >= 72) return 'ライトターコイズ';
        if (lightPct <= 35) return 'ダークティール';
        return 'ターコイズ';
    }
    if (hueDeg >= 191 && hueDeg < 226) {
        if (lightPct >= 72) return 'スカイブルー';
        if (lightPct <= 35) return 'ネイビー';
        return 'ブルー';
    }
    if (hueDeg >= 226 && hueDeg < 261) {
        if (lightPct >= 72) return 'ラベンダーブルー';
        if (lightPct <= 35) return 'インディゴ';
        return 'ロイヤルブルー';
    }
    if (hueDeg >= 261 && hueDeg < 291) {
        if (lightPct >= 72) return 'ラベンダー';
        if (lightPct <= 35) return 'ダークパープル';
        return 'バイオレット';
    }
    if (hueDeg >= 291 && hueDeg < 331) {
        if (lightPct >= 72) return 'オーキッドピンク';
        if (lightPct <= 35) return 'ディープマゼンタ';
        return 'マゼンタ';
    }
    if (hueDeg >= 331 && hueDeg < 355) {
        if (lightPct >= 72) return 'チェリーピンク';
        if (lightPct <= 35) return 'ダークローズ';
        return 'ローズ';
    }

    return 'カラー';
}

export function getTcColorKeywords(color) {
    if (!color) return null;
    const tc = TC_COLOR_DEFS.find(item => item.key === color || item.code.toLowerCase() === color.toLowerCase() || item.name === color);
    return tc ? tc.keywords : null;
}

export function getSoulColorName(color) {
    if (!color || color === 'clear') return 'クリア（未選択）';
    if (SOUL_COLOR_NAMES[color]) return SOUL_COLOR_NAMES[color];

    // TCカラーセラピーの定義から検索
    const tcMatch = TC_COLOR_DEFS.find(tc => tc.key === color || tc.code.toLowerCase() === color.toLowerCase());
    if (tcMatch) return tcMatch.name;

    // アドバンスカラーセラピーの定義から検索
    const advMatch = ADVANCE_COLOR_DEFS.find(adv => adv.key === color || adv.code.toLowerCase() === color.toLowerCase());
    if (advMatch) return advMatch.name;

    // 設定済みカラーマスター（ユーザー独自登録）から優先検索
    const masters = getColorMasters();
    const match = masters.find(m => m.id === color || m.code.toLowerCase() === color.toLowerCase());
    if (match) return match.name;

    if (color.startsWith('#')) return getColorNameFromHex(color);
    return color;
}

/** 13色のカラーチップHTMLを生成する（選択UI用） */
function buildColorChipsHtml() {
    return SOUL_COLOR_DEFS
        .map(c => `<span class="color-chip ${c.key}" data-color="${c.key}" title="${c.label}"></span>`)
        .join('');
}

/**
 * 選択済みカラーを「上段3色・下段2色」の5スロットピラミッド形式で表示するHTMLを生成する。
 * 未選択/クリアのスロットはグレーの点線ドット表示となり、色を選択すると鮮やかに発色する。
 */
function buildSoulColorBadgeHtml(colors = [], size = 'md') {
    const list = [...(colors || [])];
    while (list.length < MAX_SOUL_COLORS) {
        list.push('clear');
    }
    const top = list.slice(0, 3);
    const bottom = list.slice(3, 5);

    const dots = arr => arr.map(c => {
        const isClear = !c || c === 'clear';
        if (isClear) {
            return `<span class="soul-dot is-clear"></span>`;
        }
        const cssVal = getSoulColorCssValue(c);
        const style = cssVal.includes('gradient') ? `background: ${cssVal};` : `background-color: ${cssVal};`;
        return `<span class="soul-dot" style="${escapeHtml(style)}"></span>`;
    }).join('');

    return `
        <span class="soul-color-badge ${size === 'sm' ? 'sm' : ''}">
            <span class="soul-color-badge-row">${dots(top)}</span>
            <span class="soul-color-badge-row">${dots(bottom)}</span>
        </span>
    `;
}

/** 顧客の1色目（メインカラー）インジケーター丸ポチHTMLを生成する */
/**
 * カレンダーの1日に並べる名前の札。3人目からは「他N人」でまとめる。
 * 4枚並ぶとマスが縦に伸びて、月ぜんたいの見通しが悪くなるため。
 */
const CALENDAR_NAME_CARDS = 2;

/**
 * その日の来店を、人ごとにまとめる。
 *
 * 同じ人が同じ日に何回も入ることがある（午前と午後、延長など）。
 * まとめずに並べると、同じ名前の札が3枚できて、別人が3人来るように見える。
 * 並び順は最初に見つかった順のままにして、記録の並びと食い違わないようにする。
 */
function groupVisitsByCustomer(visits) {
    const order = [];
    const byId = new Map();
    visits.forEach((v) => {
        const key = v.customer.id;
        if (byId.has(key)) {
            byId.get(key).visits.push(v);
            return;
        }
        const group = { customer: v.customer, visits: [v] };
        byId.set(key, group);
        order.push(group);
    });
    return order;
}

/** 「はなちゃん（山田 花子） ×3」。1回だけの日は回数を付けない */
function buildGroupLabel(group) {
    const name = group.customer.name || '（名前なし）';
    const nickname = getNamePreference() === 'name'
        ? ''
        : (group.customer.nickname || '').trim();
    const label = nickname ? `${nickname}（${name}）` : name;
    return group.visits.length > 1 ? `${label} ×${group.visits.length}` : label;
}

/**
 * 一覧に出す呼び名。⚙️ 設定でどちらを先に出すかを選ぶ。
 * ニックネームが入っていない人は、設定にかかわらず氏名になる。
 */
/**
 * 内容と金額の見せかた。**空欄を「一般施術」「0円」と出さない**（ISSUE-063）。
 *
 * 予約の時点では、どちらもまだ決まっていない。そこを既定値で埋めてしまうと、
 * **決まっていないのか、本当に0円なのかが分からなくなる。**
 * 「未定」と出しておけば、あとで書き足すものだと分かる。
 */
/** 要約の行に出す札の数。これを超えたぶんは「ほか N」にまとめる */
const SUMMARY_MENU_LIMIT = 3;

/**
 * 記録が指している施術内容を引く（ISSUE-089）。
 *
 * **1つでも引けなければ、空を返す。**
 * メニューから消された項目があると、その札だけ黙って消えてしまう。
 * そのときは呼ぶ側が、保存してある `type`（名前をつないだもの）に落とす。
 * 消えた項目の名前は、そちらにしか残っていない。
 */
function recordMenuItems(record) {
    const keys = Array.isArray(record && record.menu) ? record.menu : [];
    if (keys.length === 0) return [];
    const menu = getServiceMenu();
    const hit = keys.map((k) => menu.find((m) => m.key === k));
    return hit.every(Boolean) ? hit : [];
}

/**
 * 要約の行の見出し。**アイコンと名前を対にして出す**（ISSUE-089）。
 *
 * 以前はアイコンの並びと名前の並びを別々に、両方出していた。
 * アイコンは区分（書く欄）から、名前は押した施術内容から引いており、
 * **別の一覧なのに指しているものはほぼ同じ**。押した数だけ二度並んで、
 * 16個選んだ日は5行を占め、金額が下へ押し出されていた。
 *
 * 対にすれば一度しか出ず、**どのアイコンが何なのかもその場で分かる**。
 */
function buildRecordSummaryHeadHtml(record) {
    const items = recordMenuItems(record);

    // まとめる前の記録（menu を持たない）と、引けない項目があるもの。
    // 「無料カウンセリング」のような、そのとき書かれた名前をそのまま出す
    if (items.length === 0) {
        // buildCategoryIconsHtml は initApp の中にあって、ここからは見えない。
        // 同じものを作る（区分の定義から引くだけ）
        const cats = getServiceCategories(record);
        const icons = cats.length
            ? `<span class="summary-chip-icon">${cats.map((c) => c.icon).join('')}</span>` : '';
        return `<span class="summary-chip">${icons}`
            + `<span class="summary-chip-name">${escapeHtml(recordTypeLabel(record))}</span></span>`;
    }

    const shown = items.slice(0, SUMMARY_MENU_LIMIT);
    const rest = items.length - shown.length;
    return shown.map((m) => `<span class="summary-chip">`
        + `<span class="summary-chip-icon">${m.icon}</span>`
        + `<span class="summary-chip-name">${escapeHtml(m.name)}</span></span>`).join('')
        + (rest > 0 ? `<span class="summary-more">ほか ${rest}</span>` : '');
}

function recordTypeLabel(record) {
    const t = String((record && record.type) || '').trim();
    if (t) return t;
    // 「施術メニュー・内容」の欄は画面から下ろした（ISSUE-080）。
    // プランを選ばなかった日は空になるので、選んだ区分の名前で代わりにする。
    // ここを「内容未定」のままにすると、**ほとんどの記録がそう見えてしまう**。
    const cats = getServiceCategories(record).map((c) => c.name);
    return cats.length ? cats.join('・') : '内容未定';
}


function recordAmountLabel(record) {
    const a = (record || {}).amount;
    if (a === null || a === undefined || String(a).trim() === '') return '金額未定';
    return `${Number(a).toLocaleString()}円`;
}

/** 中身がまだ入っていない＝予約だけの状態か */
function isBookingOnly(record) {
    const t = String((record && record.type) || '').trim();
    const a = (record || {}).amount;
    return !t && (a === null || a === undefined || String(a).trim() === '');
}

/**
 * その日にすでに入っている予約を、時間順で返す（ISSUE-066）。
 *
 * ダブルブッキングを機械的に禁止はしない。**わざと重ねることがある**ため
 * （ご家族、見学、時間をずらして同席など）。**気づけるようにするのが目的**。
 *
 * @param {Array}  customers 全顧客
 * @param {string} dateStr   'YYYY-MM-DD'
 * @param {object} [skip]    自分自身を外す { customerId, recordId }
 */
function findDayBookings(customers, dateStr, skip = {}) {
    if (!dateStr) return [];
    const rows = [];
    (customers || []).forEach((c) => {
        (c.records || []).forEach((r) => {
            if (r.date !== dateStr) return;
            if (skip.recordId && String(r.id) === String(skip.recordId)
                && String(c.id) === String(skip.customerId)) return;
            rows.push({ customer: c, record: r });
        });
    });
    // 時間の入っていないものは後ろへ。時刻が決まっているぶんを先に見せたい。
    return rows.sort((a, b) => {
        const ta = String(a.record.time || '99:99');
        const tb = String(b.record.time || '99:99');
        return ta.localeCompare(tb);
    });
}

/** 同じ時間帯のものだけを取り出す。時間が未定のものは重なり判定に入れない。 */
function findTimeClashes(dayBookings, time) {
    const t = String(time || '').trim();
    if (!t) return [];
    return dayBookings.filter((b) => String(b.record.time || '').trim() === t);
}

/**
 * 確かめの文に出す一行。**時刻は入れない。**
 * 「10:00 には、すでに 10:00 …」と二重に出て読みにくくなるため。
 */
function describeBooking(b) {
    return `${displayNameOf(b.customer)}（${recordTypeLabel(b.record)}）`;
}

/**
 * 時間の選択肢そのものに、すでに埋まっていることを書き込む（ISSUE-067）。
 *
 *   12:00  →  12:00 ⚠️ LOU
 *
 * ISSUE-066 では、画面の上のほうの一覧で色を変えるだけだった。
 * **時間を選ぶ場所から遠く、気づけない**というご指摘。
 * さらに、欄の外に警告の枠を置くと**場所を取る**。
 *
 * **選択肢の中に書けば、選ぶ前から埋まりが見えて、場所も要らない。**
 *
 * @param {string} selectId 時間の欄の id
 * @param {string} dateStr  'YYYY-MM-DD'
 * @param {object} [skip]   自分自身を外す { customerId, recordId }
 */
function annotateTimeOptions(selectId, dateStr, skip = {}) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    // その日の予約を、時間ごとにまとめる
    const byTime = new Map();
    findDayBookings(getCustomers(), dateStr, skip).forEach((b) => {
        const t = String(b.record.time || '').trim();
        if (!t) return;                 // 時間未定は重なりを判定できない
        if (!byTime.has(t)) byTime.set(t, []);
        byTime.get(t).push(b);
    });

    Array.from(sel.options).forEach((opt) => {
        const t = String(opt.value || '').trim();
        // 元の文字は data に控えておく。付け直すたびに積み重ならないように。
        if (opt.dataset.baseLabel === undefined) opt.dataset.baseLabel = opt.textContent;
        const base = opt.dataset.baseLabel;
        const rows = t ? byTime.get(t) : null;
        if (!rows || rows.length === 0) {
            opt.textContent = base;
            opt.classList.remove('taken');
            return;
        }
        const who = displayNameOf(rows[0].customer)
            + (rows.length > 1 ? ` 他${rows.length - 1}名` : '');
        opt.textContent = `${base}　⚠️ ${who}`;
        opt.classList.add('taken');
    });

    // いま選んでいる時間が埋まっているなら、欄そのものを赤くする
    const now = String(sel.value || '').trim();
    sel.classList.toggle('has-clash', Boolean(now) && byTime.has(now));
}

function displayNameOf(customer) {
    const name = (customer && customer.name) || '（名前なし）';
    if (getNamePreference() === 'name') return name;
    const nickname = ((customer && customer.nickname) || '').trim();
    return nickname || name;
}

/**
 * 名前から姓だけを取り出す。
 *
 * スマホのカレンダーは1マスが41pxしかなく、フルネームを1行に入れると
 * 「長谷川 美奈子」で5.6pxまで縮んで読めなくなる。姓だけなら読める。
 * フルネームは、押したときの一覧と、長押しの吹き出しに出る。
 *
 * 「山田 花子」→「山田」。区切りが無ければ、そのまま返す（Julie）。
 * ラテン文字の名前は姓が後ろに来るため、最後を取る（Mary Anne Smith → Smith）。
 */
function familyNameOf(name) {
    const s = String(name || '').trim();
    if (!s) return '';
    const parts = s.split(/[\s　]+/).filter(Boolean);
    if (parts.length < 2) return s;
    const startsLatin = /^[A-Za-z]/.test(parts[0]);
    return startsLatin ? parts[parts.length - 1] : parts[0];
}

/**
 * カレンダーの日付セルに入れる、名前の札を作る。
 *
 * 札に色は付けない。日付の枠のほうで色が分かるので、
 * ここは名前を読むためだけの場所にしている。
 *
 * 名前を span で包むのは、あとで幅を測って1行に収めるため。
 * 札そのものは列いっぱいに広がるので、札の幅では字の長さが分からない。
 */
function buildCalendarNameCard(group) {
    const fullName = group.customer.name || '（名前なし）';
    // どちらを先に出すかは、⚙️ 設定で選べる。
    // 氏名を選んでいるときは、ニックネームがあっても氏名を出す。
    const nickname = getNamePreference() === 'name'
        ? ''
        : (group.customer.nickname || '').trim();

    const card = document.createElement('div');
    card.className = 'calendar-name-card';
    const text = document.createElement('span');
    text.className = 'calendar-name-text';

    // 広い画面ぶんと狭い画面ぶんを両方入れておき、どちらを出すかは
    // CSS に任せる。JS で幅を見て切り替えると、画面を回したときに
    // 描き直しが要る。
    // ニックネームはもともと短い呼び名なので、狭い画面でも縮めない。
    const full = document.createElement('span');
    full.className = 'name-full';
    full.textContent = nickname || fullName;
    const family = document.createElement('span');
    family.className = 'name-family';
    family.textContent = nickname || familyNameOf(fullName);
    text.appendChild(full);
    text.appendChild(family);

    // 回数は名前とは別の span にして、ひと回り小さく詰めて置く。
    // 名前に使える幅を、できるだけ削らないため。
    if (group.visits.length > 1) {
        const count = document.createElement('span');
        count.className = 'calendar-name-count';
        count.textContent = `×${group.visits.length}`;
        text.appendChild(count);
    }
    card.appendChild(text);

    // 長押ししたときは、その日の中身まで読めるようにする
    const lines = group.visits.map((v) => {
        const r = v.record || {};
        return [r.time || '', recordTypeLabel(r)].filter(Boolean).join(' ');
    });
    // 札にニックネームを出しているときは、吹き出しで氏名も確かめられるようにする
    const head = nickname ? `${nickname}（${fullName}）` : fullName;
    card.title = [head, ...lines].join('\n');
    return card;
}

function buildCustomerColorIndicatorHtml(customer) {
    const mainColor = getMainSoulColor(customer);
    const cssVal = getSoulColorCssValue(mainColor);
    const style = cssVal.includes('gradient') ? `background: ${cssVal};` : `background-color: ${cssVal};`;
    return `<span class="customer-color-indicator" style="${escapeHtml(style)}"></span>`;
}

/**
 * 施術記録の「選んだ色・訴え・処方・メモ」を描画する。
 *
 * **書いたものだけ出す。** 空の項目は、行ごと出さない（ISSUE-082）。
 *
 * ISSUE-019 では逆にしていた。当時は値があるときだけ行を出しており、
 * 旧バージョンで作られた記録（マイグレーションで空文字が入る）では
 * 行ごと消えて、項目そのものが無いように見えたためである。
 *
 * その前提はもう無い。カルテが区分ごとに分かれ、書く欄は選んだ区分の
 * ぶんだけ開くようになった（ISSUE-080）。いま4行を常に出すと、
 *   ・🌈color を選んでいない記録に「選んだ色: 未記入」が出る
 *   ・画面から下ろした処方に「処方: 未記入」が出る
 * のように、**そもそも書く手立ての無い項目まで「書き忘れ」に見える**。
 * 区分ごとのカルテ（buildKarteDetailsHtml）は前から「中身があるときだけ」
 * 出しており、4行だけが取り残されていた。そちらへ揃える。
 *
 * 中身が何も無くてもカードの中は空にならない。編集ボタンが必ず入るため。
 */
function buildRecordDetailsHtml(r) {
    const rows = [
        { label: '選んだ色', html: buildRecordColorsHtml(r) },
        { label: '訴え', value: r.clientComplaint, color: 'var(--accent-warning)' },
        { label: '処方', value: r.prescription, color: 'var(--accent-cyan)' },
        { label: 'メモ', value: r.therapistNote, color: 'var(--accent-purple)' },
    ];
    const kartes = buildKarteDetailsHtml(r);

    // 要約で「ほか N」に畳んだぶんを、開いたときにここで出す（ISSUE-089）。
    // **畳んでいないときは出さない。** 上の札と同じものが二度並ぶため
    const items = recordMenuItems(r);
    const full = items.length > SUMMARY_MENU_LIMIT
        ? `<div style="font-size: 0.85rem; margin-top: 4px;">
               <span style="color: var(--accent-cyan); font-weight: 500;">施術内容:</span>
               ${items.map((m) => `${m.icon} ${escapeHtml(m.name)}`).join('　')}
           </div>`
        : '';

    return full + rows.map(({ label, value, color, html }) => {
        // html を持つ行（選んだ色）は中身を差し替える
        const filled = html ? html !== '' : Boolean(value && value.trim());
        if (!filled) return '';
        // html を持つ行だけが、こちらで組み立てた安全な中身。
        // 手で書いたものは、そのまま流すと <script> や onerror が動いてしまう
        const body = html || escapeHtml(String(value));
        return `
            <div style="font-size: 0.85rem; margin-top: 4px;">
                <span style="color: ${color || 'var(--accent-success)'}; font-weight: 500;">${label}:</span>
                ${body}
            </div>`;
    }).filter(Boolean).join('') + kartes;
}

/**
 * 同じ項目を2台で書いてしまい、押しのけられたほうの控えについて。
 *
 * **中身は record.overwritten に残し続けるが、画面には出さない**（ISSUE-075）。
 * 正は「あとに書かれたほう」。それはもう欄に出ているので、
 * 押しのけられたほうまで並べると、読むものが二重になって長い。
 *
 * 必要になったときは、📤 で書き出したファイルの
 *   customers[].records[].overwritten
 * に、項目・中身・書いた時刻がそのまま入っている。取り出すのは作り手の仕事。
 *
 * 消す手立ては置いていない。**見えないものを消させると、消したことにも
 * 気づけない**ため。溜まっても文字だけなので、重さの心配は要らない。
 */

/**
 * その日クライアントが選んだ色を描画する。
 * アドバンスカラーは 10色/17色 どちらから選んだかで意味が変わるため、
 * セットも併記する（17色の青は「ターコイズを選ばなかった青」）。
 */
function buildRecordColorsHtml(r) {
    const colors = Array.isArray(r.colors) ? r.colors : [];
    if (colors.length === 0) return '';

    // 同じ色相の部位表示が重複しないよう、一度出したものは省く
    const shownHues = new Set();
    const chips = colors.map((key) => {
        const cssVal = getSoulColorCssValue(key);
        const style = cssVal.includes('gradient') ? `background: ${cssVal};` : `background-color: ${cssVal};`;
        // 履歴を読み返すときの手がかりとして、対応する部位だけ小さく添える。
        // 精油までは出さない（過去の記録では処方はもう確定しているため）。
        const corr = getCorrespondence(key);
        let part = '';
        if (corr && !shownHues.has(corr.hue)) {
            shownHues.add(corr.hue);
            part = `<span class="record-color-part">${corr.planet.symbol} ${escapeHtml(corr.chakra.name.replace(/（.*）/, ''))}</span>`;
        }
        return `<span class="record-color-readout" title="${corr ? escapeHtml(`${corr.planet.name} ／ ${corr.chakra.area}`) : ''}">
            <span class="record-color-readout-dot" style="${escapeHtml(style)}"></span>${escapeHtml(getSoulColorName(key))}${part}
        </span>`;
    }).join('');

    const setLabel = r.advanceSet === 'full' ? '17色' : (r.advanceSet === 'basic' ? '10色' : '');
    const setNote = setLabel
        ? `<span class="record-color-setnote">アドバンス ${setLabel}から</span>`
        : '';

    return `<span class="record-color-readout-wrap">${chips}${setNote}</span>`;
}

/**
 * セッション提案の本文を整形する。
 *
 * AIの出力なので、まずHTMLをエスケープしてから Markdown 記法だけを解釈する。
 * （星詠みの表示は marked を使う既存経路のままにしてある）
 */
function renderMarkdown(rawText) {
    const lines = String(rawText || '').split('\n');
    const out = [];
    let inList = false;
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) { closeList(); return; }

        // エスケープしてから強調だけを戻す
        const safe = escapeHtml(trimmed).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        if (/^#{1,6}\s/.test(trimmed)) {
            closeList();
            out.push(`<h4>${safe.replace(/^#{1,6}\s*/, '')}</h4>`);
        } else if (/^(-|\*|・)\s?/.test(trimmed)) {
            if (!inList) { out.push('<ul>'); inList = true; }
            out.push(`<li>${safe.replace(/^(-|\*|・)\s?/, '')}</li>`);
        } else {
            closeList();
            out.push(`<p>${safe}</p>`);
        }
    });
    closeList();
    return out.join('');
}

/**
 * 施術記録（予約）カードの「変更」および「削除」ボタンHTML描画
 */
function buildRecordEditButtonHtml(r) {
    return `
        <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end;">
            <button class="btn-edit-record" title="記録を変更" style="background: rgba(0, 242, 254, 0.12); border: 1px solid var(--accent-cyan); color: var(--accent-cyan); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                ✏️ <span class="btn-text">変更</span>
            </button>
            <button class="btn-delete-record" title="記録を削除" style="background: rgba(255, 82, 82, 0.12); border: 1px solid #ff5252; color: #ff5252; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                🗑️ <span class="btn-text">削除</span>
            </button>
        </div>
    `;
}

/**
 * 要約の1行。何があった日かが分かる程度に、頭だけを出す。
 * 訴えが無ければ処方、それも無ければメモ。
 */
function buildRecordSummaryLineHtml(r) {
    const pick = [r.clientComplaint, r.prescription, r.therapistNote]
        .map((t) => String(t || '').replace(/\s+/g, ' ').trim())
        .find(Boolean);
    const kartes = (r && r.kartes) || {};
    const fromKarte = Object.keys(kartes)
        .map((k) => String((kartes[k] || {}).note || '').replace(/[\[［]\d{1,3}[\]］]/g, '').replace(/\s+/g, ' ').trim())
        .find(Boolean);
    const text = pick || fromKarte;
    if (!text) return '<span class="history-summary-line is-empty">まだ書かれていません</span>';
    const short = text.length > 38 ? `${text.slice(0, 38)}…` : text;
    return `<span class="history-summary-line">${escapeHtml(short)}</span>`;
}

/**
 * 変更・削除ボタンへのイベントハンドラ結び付け
 */
function attachRecordEditHandler(container, customerId, recordId, onRefresh) {
    const btnEdit = container.querySelector('.btn-edit-record');
    if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onRecordEditRequested) onRecordEditRequested(customerId, recordId);
        });
    }

    const btnDelete = container.querySelector('.btn-delete-record');
    if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showConfirmModal({
                title: '予約・施術記録の削除',
                message: 'この予約・施術記録を削除してもよろしいですか？\n※この操作は取り消せません。',
                actionText: '削除する',
                onConfirm: () => {
                    deleteRecord(customerId, recordId);
                    cleanupPhotos();
                    showToast('予約・施術記録を削除しました', 'success');
                    if (onRefresh) onRefresh();
                    // カレンダーのドットを削除後の状態に追従させる
                    if (onRecordsChanged) onRecordsChanged();
                }
            });
        });
    }
}

// HSLからHEXへの変換
function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * [ISSUE-NEW] 画像スタイルのハニカム（六角形）カラーパレットSVGを動的生成＆インタラクション設定
 */
function renderHoneycombSvg(wrapper, currentSelectedColor, onSelectColor) {
    if (!wrapper) return;

    const R = 11.5; // メイン六角形の半径
    const rings = 4; // 中心 + 4層（合計61個のセル）
    const centerX = 145;
    const centerY = 92;

    let svgHtml = `<svg viewBox="0 0 290 225" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
    
    // グリッドセル群
    const hexCells = [];
    
    // 六角形の頂点計算関数
    function computeHexPoints(cx, cy, r) {
        const points = [];
        for (let k = 0; k < 6; k++) {
            const angle = (k * 60) * Math.PI / 180;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        return points.join(' ');
    }

    // 1. メインのカラーハニカム（61セル）
    for (let q = -rings; q <= rings; q++) {
        const r1 = Math.max(-rings, -q - rings);
        const r2 = Math.min(rings, -q + rings);
        for (let r = r1; r <= r2; r++) {
            const cx = centerX + 1.5 * R * q;
            const cy = centerY + Math.sqrt(3) * R * (r + q / 2);
            const points = computeHexPoints(cx, cy, R);

            let hexColor = '#ffffff';
            const dx = cx - centerX;
            const dy = cy - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = 1.5 * R * rings;

            if (dist > 0.1) {
                let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                if (angle < 0) angle += 360;
                
                // 画像のグラデーションに配置を合わせる（上が青・右が紫・下が赤黄・左が緑）
                let hue = (angle + 240) % 360;
                let normDist = Math.min(1, dist / maxDist);
                
                let sat = Math.round(55 + normDist * 45);
                let light = Math.round(85 - normDist * 50);

                hexColor = hslToHex(hue, sat, light);
            }

            hexCells.push({ cx, cy, hexColor, points, r: R });
        }
    }

    // 2. 下部：白〜黒の10段階グレースケールバー
    const graySteps = [
        '#ffffff', '#e6e6e6', '#cccccc', '#b3b3b3', '#999999',
        '#808080', '#666666', '#4d4d4d', '#333333', '#1a1a1a'
    ];
    const R_gray = 9.0;
    const grayStartY = 192;
    const grayStartX = 34;
    const grayStepX = 15.5;

    graySteps.forEach((gColor, idx) => {
        const cx = grayStartX + idx * grayStepX;
        const cy = grayStartY;
        const points = computeHexPoints(cx, cy, R_gray);
        hexCells.push({ cx, cy, hexColor: gColor, points, r: R_gray });
    });

    // 3. 右下：孤立した大きめの黒色マス (#000000)
    const R_black = 15.0;
    const blackCx = 236;
    const blackCy = 192;
    const blackPoints = computeHexPoints(blackCx, blackCy, R_black);
    hexCells.push({ cx: blackCx, cy: blackCy, hexColor: '#000000', points: blackPoints, r: R_black });

    // 各セルを描画
    hexCells.forEach(cell => {
        // 黒・暗色セルには薄い輪郭線で存在感を見せる
        const strokeAttr = (cell.hexColor === '#000000' || cell.hexColor === '#1a1a1a') ? 'stroke="rgba(255,255,255,0.3)" stroke-width="1"' : '';
        svgHtml += `
            <polygon class="hex-cell" data-color="${cell.hexColor}" data-cx="${cell.cx.toFixed(1)}" data-cy="${cell.cy.toFixed(1)}" data-r="${cell.r}"
                points="${cell.points}" fill="${cell.hexColor}" ${strokeAttr} />
        `;
    });

    // 選択マーカー初期コンテナ
    svgHtml += `
        <g id="hexagon-selection-marker" class="hex-selection-marker" transform="translate(${centerX}, ${centerY})" style="opacity: 0;">
        </g>
    `;

    svgHtml += `</svg>`;
    wrapper.innerHTML = svgHtml;

    // 二重ヘキサゴン枠生成ヘルパー
    function updateMarkerShape(markerElem, radius) {
        if (!markerElem) return;
        const ptsOuter = computeHexPoints(0, 0, radius + 2.5);
        const ptsInner = computeHexPoints(0, 0, radius + 1.0);
        markerElem.innerHTML = `
            <polygon points="${ptsOuter}" fill="none" stroke="#000000" stroke-width="3" />
            <polygon points="${ptsInner}" fill="none" stroke="#ffffff" stroke-width="2" />
        `;
    }

    // イベントバインド
    const svg = wrapper.querySelector('svg');
    if (!svg) return;
    const marker = svg.querySelector('#hexagon-selection-marker');
    const cells = svg.querySelectorAll('.hex-cell');

    cells.forEach(cell => {
        cell.addEventListener('click', () => {
            const color = cell.getAttribute('data-color');
            const cx = cell.getAttribute('data-cx');
            const cy = cell.getAttribute('data-cy');
            const cellR = parseFloat(cell.getAttribute('data-r') || R);

            if (marker) {
                updateMarkerShape(marker, cellR);
                marker.setAttribute('transform', `translate(${cx}, ${cy})`);
                marker.style.opacity = '1';
            }

            if (onSelectColor) {
                onSelectColor(color);
            }
        });
    });

    // 初期選択色に合わせたマーカー位置設定
    if (currentSelectedColor && currentSelectedColor.startsWith('#')) {
        let targetCell = null;
        cells.forEach(c => {
            const col = c.getAttribute('data-color');
            if (col.toLowerCase() === currentSelectedColor.toLowerCase()) {
                targetCell = c;
            }
        });

        if (targetCell && marker) {
            const cx = targetCell.getAttribute('data-cx');
            const cy = targetCell.getAttribute('data-cy');
            const cellR = parseFloat(targetCell.getAttribute('data-r') || R);
            updateMarkerShape(marker, cellR);
            marker.setAttribute('transform', `translate(${cx}, ${cy})`);
            marker.style.opacity = '1';
        }
    }
}

/**
 * カタカナをひらがなに寄せる。半角カナも先に全角へ直す。
 * よみがなの自動入力と、名前の検索で使う。
 */
function toHiragana(text) {
    return String(text == null ? '' : text)
        .normalize('NFKC')
        .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** 表示用URLの控え。同じ写真を何度も取り出さないため */
const photoUrlCache = new Map();

/** サムネイルのURL。IndexedDB から引くので非同期。引けたら差し込む */
async function fillPhotoThumb(img, id) {
    if (photoUrlCache.has(id)) { img.src = photoUrlCache.get(id); return; }
    try {
        const url = await getPhotoUrl(id);
        if (!url) return;
        photoUrlCache.set(id, url);
        img.src = url;
    } catch (e) { /* 引けなければ枠のまま出す */ }
}

/** 文字列で書き出したサムネイルに、あとから中身を入れる */
function hydratePhotoThumbs(root) {
    if (!root) return;
    root.querySelectorAll('img[data-photo-fill]').forEach((img) => {
        const id = img.dataset.photoFill;
        fillPhotoThumb(img, id);
        img.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openPhotoViewer(id); };
    });
    root.querySelectorAll('[data-ref-photo]').forEach((btn) => {
        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openPhotoViewer(btn.dataset.refPhoto); };
    });
}

/** 写真を大きく見る。並べ方を確かめるにはサムネイルでは小さすぎる */
async function openPhotoViewer(id) {
    let veil = document.getElementById('photo-viewer');
    if (!veil) {
        veil = document.createElement('div');
        veil.id = 'photo-viewer';
        veil.className = 'photo-viewer';
        document.body.appendChild(veil);
    }
    veil.innerHTML = '<img alt="写真"><button type="button" class="photo-viewer-close">✕</button>';
    veil.classList.add('active');
    await fillPhotoThumb(veil.querySelector('img'), id);
    const close = () => veil.classList.remove('active');
    veil.onclick = (e) => { if (e.target === veil) close(); };
    veil.querySelector('.photo-viewer-close').onclick = close;
}

/**
 * 写真に振る番号。メモから [1] のように呼べるようにするため。
 *
 * 並び順ではなく、入れたときの番号をそのまま持つ。並び順で振り直すと、
 * 途中の1枚を外したときにメモの [2] が別の写真を指してしまう。
 */
function assignPhotoNumbers(photos) {
    const nextByKind = {};
    (photos || []).forEach((p) => {
        if (typeof p.no === 'number') {
            nextByKind[p.kind] = Math.max(nextByKind[p.kind] || 0, p.no);
        }
    });
    (photos || []).forEach((p) => {
        if (typeof p.no !== 'number') {
            nextByKind[p.kind] = (nextByKind[p.kind] || 0) + 1;
            p.no = nextByKind[p.kind];
        }
    });
    return photos;
}

/** 次に使う番号 */
function nextPhotoNo(photos, kind) {
    return (photos || []).filter((p) => p.kind === kind)
        .reduce((n, p) => Math.max(n, p.no || 0), 0) + 1;
}

/**
 * メモの [1] を、押せる形にする。
 *
 * 番号に当たる写真が無ければ、押せない印にして残す。黙って消すと
 * 書いたはずのものが消えたように見える。
 */
function renderNoteWithRefs(text, photos) {
    const byNo = new Map((photos || []).map((p) => [p.no, p]));
    const used = new Set();
    // 改行を先に <br> へ直す。写真を入れたあとにやると、タグの中の
    // 改行まで置き換わってタグが壊れる。
    const html = escapeHtml(String(text == null ? '' : text))
        .replace(/\n/g, '<br>')
        .replace(/[\[［](\d{1,3})[\]］]/g, (m, d) => {
            const hit = byNo.get(Number(d));
            if (!hit) return `<span class="note-ref is-missing" title="この番号の写真はありません">${m}</span>`;
            used.add(hit.id);
            // 番号の位置に写真そのものを出す。書いた文の流れの中で見えないと、
            // どの一文がどの写真のことなのか分からなくなる。
            // data-photo-no と contenteditable を必ず付ける。これが無いと、
            // 開き直したあとに文字へ戻したとき [1] が消える。
            return `<span class="note-photo" contenteditable="false" data-photo-no="${d}">`
                + `<img data-photo-fill="${escapeHtml(hit.id)}" alt="写真${d}">`
                + `<span class="photo-no">${d}</span></span>`;
        });
    return { html, used };
}

/**
 * 写真を1枚ぶんの要素にする。メモの中にそのまま置ける形。
 *
 * contenteditable の中では編集できない塊として扱わせる。文字と同じに
 * 扱わせると、中にカーソルが入って壊れる。
 */
function buildNotePhotoEl(photo) {
    const span = document.createElement('span');
    span.className = 'note-photo';
    span.contentEditable = 'false';
    span.dataset.photoNo = String(photo.no);
    const img = document.createElement('img');
    img.alt = `写真${photo.no}`;
    img.dataset.photoFill = photo.id;
    fillPhotoThumb(img, photo.id);
    const no = document.createElement('span');
    no.className = 'photo-no';
    no.textContent = String(photo.no);
    span.appendChild(img);
    span.appendChild(no);
    return span;
}

/**
 * 書いたメモを文字に戻す。写真は [1] として書き出す。
 *
 * 保存する形は文字のままにしておく。HTMLをそのまま持つと、あとで
 * 見せ方を変えたときに過去の記録まで直さなければならなくなる。
 */
function serializeKarteNote(root) {
    let out = '';
    const walk = (node) => {
        node.childNodes.forEach((n) => {
            if (n.nodeType === 3) { out += n.data; return; }
            if (n.nodeType !== 1) return;
            if (n.classList && n.classList.contains('note-photo')) {
                out += `[${n.dataset.photoNo}]`;
                return;
            }
            const tag = n.tagName;
            if (tag === 'BR') { out += '\n'; return; }
            if (tag === 'DIV' || tag === 'P') {
                if (out && !out.endsWith('\n')) out += '\n';
                walk(n);
                return;
            }
            walk(n);
        });
    };
    walk(root);
    return out.replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
}

/** 記録の表示に出す、区分ごとのカルテ（メモと写真） */
function buildKarteDetailsHtml(r) {
    const cats = getServiceCategories(r);
    const kartes = (r && r.kartes) || {};
    const photos = Array.isArray(r.photos) ? r.photos : [];

    const blocks = cats.map((c) => {
        const note = (kartes[c.key] || {}).note || '';
        const mine = photos.filter((p) => p.kind === c.key);
        if (!note.trim() && mine.length === 0) return '';

        const { html, used } = renderNoteWithRefs(note, mine);
        // メモに出てこなかった写真は、下にまとめて出す。
        // 呼ばれていないからといって隠すと、入れたはずのものが見当たらなくなる。
        const rest = mine.filter((p) => !used.has(p.id));

        return `
            <div class="karte-view" data-karte-view="${c.key}">
                <div class="karte-view-head">${c.icon} ${escapeHtml(c.name)}</div>
                ${note.trim() ? `<div class="karte-view-note">${html}</div>` : ''}
                ${rest.length === 0 ? '' : `
                    <div class="karte-view-thumbs">
                        ${rest.map((p) => `
                            <div class="photo-thumb photo-thumb-view">
                                <img data-photo-fill="${escapeHtml(p.id)}" alt="${escapeHtml(c.photoLabel || '写真')}">
                                <span class="photo-no">${p.no || ''}</span>
                            </div>`).join('')}
                    </div>`}
            </div>`;
    }).filter(Boolean).join('');

    return blocks;
}

/**
 * どの記録からも参照されていない写真を消す。
 *
 * 追加したあと保存せずに閉じた分と、記録や顧客ごと消された分が対象。
 * 消し忘れを個別に追うより、生きているIDを渡して差分を掃くほうが確実。
 * 記録の削除は画面のあちこちから起きるので、ここは外に出してある。
 */
async function cleanupPhotos() {
    const live = [];
    getCustomers().forEach((c) => (c.records || []).forEach((r) => {
        (r.photos || []).forEach((p) => { if (p && p.id) live.push(p.id); });
    }));
    // 下書きの写真も残す。まだ記録になっていないだけで、捨ててよいものではない。
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf('draft_record_') !== 0) continue;
        try {
            const d = JSON.parse(localStorage.getItem(key));
            ((d && d.data && d.data.photos) || []).forEach((p) => { if (p && p.id) live.push(p.id); });
        } catch (e) { /* 壊れた下書きは無視する */ }
    }
    // 使えない端末では purgeOrphanPhotos が失敗する。掃除の失敗に実害はない。
    try { await purgeOrphanPhotos(live); } catch (e) { /* noop */ }
}

/**
 * HTMLエスケープ処理
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

/**
 * [ISSUE-NEW] カラーチップ群を「5つの独立したスロット」として初期化する。
 * スロットを選択後、ハニカムパレットまたはプリセットからタップしてサンプルを確認し、
 * 「この色で決定」ボタンで適用する二段構えUI。
 */
function initSoulColorSlotSelector(slotsContainer, paletteContainer, initialColors, onChange) {
    let selected = (initialColors || []).slice(0, MAX_SOUL_COLORS);
    while (selected.length < MAX_SOUL_COLORS) selected.push('clear');

    let activeSlotIndex = null;
    let pendingColor = 'red'; // サンプルプレビューで仮表示中のカラー

    // ここは開くたび・色を入れ直すたびに呼ばれる。丸には addEventListener で
    // 結び付けているため、そのままだと押したときの処理が積み重なっていく。
    // いまは最後に結んだものが最後に描くので表示は合うが、開くたびに増える。
    // 節ごと差し替えて、前の結び付きを断ってから付け直す。
    slotsContainer.querySelectorAll('.soul-slot').forEach((el) => {
        el.replaceWith(el.cloneNode(true));
    });

    const slots = slotsContainer.querySelectorAll('.soul-slot');
    const paletteChips = paletteContainer.querySelectorAll('.color-chip');
    const customColorPicker = document.getElementById('input-custom-color-picker');
    const targetLabel = document.getElementById('palette-target-label');
    const sampleCircle = document.getElementById('sample-color-circle');
    const sampleName = document.getElementById('sample-color-name');
    const sampleCode = document.getElementById('sample-color-code');
    const btnApply = document.getElementById('btn-apply-sample-color');
    const btnClearSlot = document.getElementById('btn-clear-slot');
    const btnClearAllSlots = document.getElementById('btn-clear-all-slots');
    const btnClosePalette = document.getElementById('btn-close-palette');
    const btnClosePaletteX = document.getElementById('btn-close-palette-x');

    // モード切り替えタブ要素
    const tabPreset = document.getElementById('tab-palette-preset');
    const tabTc = document.getElementById('tab-palette-tc');
    const tabAdvance = document.getElementById('tab-palette-advance');
    const tabHoneycomb = document.getElementById('tab-palette-honeycomb');

    const viewPreset = document.getElementById('preset-palette-view');
    const viewTc = document.getElementById('tc-palette-view');
    const viewAdvance = document.getElementById('advance-palette-view');
    const viewHoneycomb = document.getElementById('honeycomb-palette-view');

    const svgWrapper = document.getElementById('honeycomb-svg-wrapper');
    const sampleKeywords = document.getElementById('sample-color-keywords');

    const inputSoulColorContainer = document.getElementById('input-soul-color-container');
    const inputTcColorContainer = document.getElementById('input-tc-color-container');
    const inputAdvanceColorContainer = document.getElementById('input-advance-color-container');

    const btnAdvMode10 = document.getElementById('btn-adv-mode-10');
    const btnAdvMode17 = document.getElementById('btn-adv-mode-17');

    let paletteMode = 'preset'; // 'preset' | 'tc' | 'advance' | 'honeycomb'
    let isAdvanceFullSet = false; // アドバンスカラー: false=10色, true=17色

    const getPaletteType = (colorKey) => {
        if (!colorKey || colorKey === 'clear') return null;
        if (SOUL_COLOR_DEFS.some(c => c.key === colorKey)) return 'preset';
        if (TC_COLOR_DEFS.some(c => c.key === colorKey)) return 'tc';
        if (ADVANCE_COLOR_DEFS.some(c => c.key === colorKey)) return 'advance';
        return 'honeycomb';
    };

    const getLockedPaletteType = () => {
        for (const col of selected) {
            const type = getPaletteType(col);
            if (type) return type;
        }
        return null;
    };

    // 即時色選択＆自動スロット移行処理
    const selectColorInstant = (colorKeyOrHex) => {
        if (activeSlotIndex === null) return;

        const colorType = getPaletteType(colorKeyOrHex);
        const lockedType = getLockedPaletteType();
        if (lockedType && colorType !== lockedType) {
            return;
        }

        selected[activeSlotIndex] = colorKeyOrHex;
        pendingColor = colorKeyOrHex;

        // 次のスロットへ自動進行 (スロット4で終了)
        if (activeSlotIndex < MAX_SOUL_COLORS - 1) {
            activeSlotIndex++;
            pendingColor = selected[activeSlotIndex] !== 'clear' ? selected[activeSlotIndex] : 'red';
        }
        render();
    };

    // --- 1. Soul Color (12色) チップ描画 ---
    const renderPresetColorChips = () => {
        if (!inputSoulColorContainer) return;
        inputSoulColorContainer.innerHTML = '';

        SOUL_COLOR_DEFS.forEach(c => {
            const chip = document.createElement('div');
            chip.className = 'preset-color-chip-btn';
            const isActive = c.key === pendingColor || c.code === pendingColor;
            const cssVal = getSoulColorCssValue(c.key);
            
            chip.title = c.name;
            chip.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 38px;
                height: 38px;
                background: ${cssVal};
                border: 1px solid ${isActive ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.3)'};
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
                box-shadow: ${isActive ? '0 0 12px var(--accent-cyan)' : '0 2px 6px rgba(0,0,0,0.4)'};
                position: relative;
                overflow: hidden;
            `;
            
            // 球体ハイライト (Specular highlight)
            const highlight = document.createElement('div');
            highlight.style.cssText = `
                position: absolute;
                top: 12%; left: 18%; width: 30%; height: 30%;
                background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0) 80%);
                pointer-events: none;
                border-radius: 50%;
                z-index: 3;
            `;
            chip.appendChild(highlight);
            
            // 球体シャドウ/グロス (Inner glow/shadow)
            const gloss = document.createElement('div');
            gloss.style.cssText = `
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: radial-gradient(circle at 50% 120%, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0) 70%),
                            radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 50%);
                pointer-events: none;
                border-radius: 50%;
                z-index: 2;
            `;
            chip.appendChild(gloss);

            chip.onmouseover = () => {
                chip.style.transform = 'scale(1.15)';
                if (!isActive) {
                    chip.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    chip.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
                }
            };
            chip.onmouseout = () => {
                chip.style.transform = 'scale(1)';
                if (!isActive) {
                    chip.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    chip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
                }
            };

            chip.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectColorInstant(c.key);
            };

            inputSoulColorContainer.appendChild(chip);
        });
    };

    // --- 2. TCカラーセラピー（14色ボトル＆キーワード）描画 ---
    const renderTcColorChips = () => {
        if (!inputTcColorContainer) return;
        inputTcColorContainer.innerHTML = '';

        TC_COLOR_DEFS.forEach(c => {
            const chip = document.createElement('div');
            chip.className = 'tc-color-chip-btn';
            const isActive = c.key === pendingColor || c.code === pendingColor;
            const cssVal = c.code;

            chip.title = `${c.name}: ${c.keywords}`;
            chip.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 38px;
                height: 38px;
                background: ${cssVal};
                border: 1px solid ${isActive ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.3)'};
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
                box-shadow: ${isActive ? '0 0 12px var(--accent-cyan)' : '0 2px 6px rgba(0,0,0,0.4)'};
                position: relative;
                overflow: hidden;
            `;

            // 球体ハイライト
            const highlight = document.createElement('div');
            highlight.style.cssText = `
                position: absolute;
                top: 12%; left: 18%; width: 30%; height: 30%;
                background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0) 80%);
                pointer-events: none;
                border-radius: 50%;
                z-index: 3;
            `;
            chip.appendChild(highlight);

            chip.onmouseover = () => {
                chip.style.transform = 'scale(1.15)';
                if (!isActive) {
                    chip.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    chip.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
                }
            };
            chip.onmouseout = () => {
                chip.style.transform = 'scale(1)';
                if (!isActive) {
                    chip.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    chip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
                }
            };

            chip.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectColorInstant(c.key);
            };

            inputTcColorContainer.appendChild(chip);
        });
    };

    // --- 3. アドバンスカラーセラピー（基本10色/17色フルセット）描画 ---
    const renderAdvanceColorChips = () => {
        if (!inputAdvanceColorContainer) return;
        inputAdvanceColorContainer.innerHTML = '';

        const targetDefs = isAdvanceFullSet 
            ? ADVANCE_COLOR_DEFS 
            : ADVANCE_COLOR_DEFS.filter(c => c.isBasic);

        targetDefs.forEach(c => {
            const chip = document.createElement('div');
            chip.className = 'adv-color-chip-btn';
            const isActive = c.key === pendingColor || c.code === pendingColor;
            const cssVal = c.code;

            chip.title = c.name;
            chip.style.cssText = `
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 38px;
                height: 38px;
                background: ${cssVal};
                border: 1px solid ${isActive ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.3)'};
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
                box-shadow: ${isActive ? '0 0 12px var(--accent-cyan)' : '0 2px 6px rgba(0,0,0,0.4)'};
                position: relative;
                overflow: hidden;
            `;

            // 球体ハイライト
            const highlight = document.createElement('div');
            highlight.style.cssText = `
                position: absolute;
                top: 12%; left: 18%; width: 30%; height: 30%;
                background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0) 80%);
                pointer-events: none;
                border-radius: 50%;
                z-index: 3;
            `;
            chip.appendChild(highlight);

            chip.onmouseover = () => {
                chip.style.transform = 'scale(1.15)';
                if (!isActive) {
                    chip.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    chip.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
                }
            };
            chip.onmouseout = () => {
                chip.style.transform = 'scale(1)';
                if (!isActive) {
                    chip.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    chip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
                }
            };

            chip.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectColorInstant(c.key);
            };

            inputAdvanceColorContainer.appendChild(chip);
        });
    };

    const updateTabModeUi = () => {
        const tabs = [
            { btn: tabPreset, view: viewPreset, mode: 'preset' },
            { btn: tabTc, view: viewTc, mode: 'tc' },
            { btn: tabAdvance, view: viewAdvance, mode: 'advance' },
            { btn: tabHoneycomb, view: viewHoneycomb, mode: 'honeycomb' }
        ];

        const lockedType = getLockedPaletteType();

        tabs.forEach(t => {
            if (!t.btn || !t.view) return;

            const isLocked = lockedType && lockedType !== t.mode;
            t.btn.style.opacity = isLocked ? '0.3' : '1';
            t.btn.style.pointerEvents = isLocked ? 'none' : 'auto';

            if (paletteMode === t.mode) {
                t.btn.classList.add('active');
                t.btn.style.background = 'var(--accent-cyan)';
                t.btn.style.color = '#000';
                t.btn.style.borderColor = 'transparent';
                t.btn.style.fontWeight = '700';
                t.view.style.display = t.mode === 'honeycomb' ? 'flex' : 'block';
            } else {
                t.btn.classList.remove('active');
                t.btn.style.background = 'transparent';
                t.btn.style.color = 'var(--text-secondary)';
                t.btn.style.borderColor = 'transparent';
                t.btn.style.fontWeight = '600';
                t.view.style.display = 'none';
            }
        });

        if (paletteMode === 'preset') {
            renderPresetColorChips();
        } else if (paletteMode === 'tc') {
            renderTcColorChips();
        } else if (paletteMode === 'advance') {
            renderAdvanceColorChips();
        }
    };

    if (tabPreset) tabPreset.onclick = () => { paletteMode = 'preset'; updateTabModeUi(); };
    if (tabTc) tabTc.onclick = () => { paletteMode = 'tc'; updateTabModeUi(); };
    if (tabAdvance) tabAdvance.onclick = () => { paletteMode = 'advance'; updateTabModeUi(); };
    if (tabHoneycomb) tabHoneycomb.onclick = () => { paletteMode = 'honeycomb'; updateTabModeUi(); };

    if (btnAdvMode10) {
        btnAdvMode10.onclick = () => {
            isAdvanceFullSet = false;
            btnAdvMode10.style.background = 'var(--accent-cyan)';
            btnAdvMode10.style.color = '#000';
            btnAdvMode10.style.borderColor = 'transparent';
            btnAdvMode17.style.background = 'rgba(255,255,255,0.05)';
            btnAdvMode17.style.color = 'var(--text-secondary)';
            btnAdvMode17.style.borderColor = 'var(--border-glass)';
            renderAdvanceColorChips();
        };
    }

    if (btnAdvMode17) {
        btnAdvMode17.onclick = () => {
            isAdvanceFullSet = true;
            btnAdvMode17.style.background = 'var(--accent-cyan)';
            btnAdvMode17.style.color = '#000';
            btnAdvMode17.style.borderColor = 'transparent';
            btnAdvMode10.style.background = 'rgba(255,255,255,0.05)';
            btnAdvMode10.style.color = 'var(--text-secondary)';
            btnAdvMode10.style.borderColor = 'var(--border-glass)';
            renderAdvanceColorChips();
        };
    }

    const render = () => {
        // 1. スロット5つの描画
        slots.forEach((slot, idx) => {
            const color = selected[idx];
            const cssVal = getSoulColorCssValue(color);
            
            if (color !== 'clear') {
                slot.classList.add('has-color');
            } else {
                slot.classList.remove('has-color');
            }

            if (cssVal.includes('gradient')) {
                slot.style.background = cssVal;
                slot.style.backgroundColor = '';
            } else {
                slot.style.background = '';
                slot.style.backgroundColor = cssVal;
            }

            // 選択中のスロットをハイライト
            const isActive = activeSlotIndex === idx;
            if (color !== 'clear') {
                slot.style.border = `2px solid ${isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)'}`;
            } else {
                slot.style.border = `2px dashed ${isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.2)'}`;
            }
            
            if (isActive) {
                slot.style.boxShadow = '0 0 12px var(--accent-cyan)';
            } else {
                slot.style.boxShadow = 'none';
            }
        });

        // 2. パレット表示
        if (activeSlotIndex !== null) {
            paletteContainer.style.display = 'block';
            if (targetLabel) targetLabel.textContent = `スロット ${activeSlotIndex + 1} の色を選択中`;

            // チップのアクティブ状態ハイライト
            paletteChips.forEach(chip => {
                const c = chip.getAttribute('data-color');
                if (c === pendingColor) {
                    chip.classList.add('active');
                } else {
                    chip.classList.remove('active');
                }
            });

            // ハニカムSVGのレンダリング
            if (svgWrapper) {
                renderHoneycombSvg(svgWrapper, getSoulColorCssValue(pendingColor), (colorHex) => {
                    selectColorInstant(colorHex);
                });
            }

            updateTabModeUi();
        } else {
            paletteContainer.style.display = 'none';
        }

        if (onChange) onChange(selected);
    };

    // スロットタップ
    slots.forEach((slot, idx) => {
        slot.addEventListener('click', () => {
            // 自動計算で埋まっているときは触らせない。
            // 画数と生年月日から決まるもので、選ぶものではないため。
            if (slotsContainer.classList.contains('soul-slots-locked')) return;
            if (activeSlotIndex === idx) {
                activeSlotIndex = null;
            } else {
                activeSlotIndex = idx;
                pendingColor = selected[idx] !== 'clear' ? selected[idx] : 'red';
            }
            render();
        });
    });

    // プリセットチップタップ（即確定）
    paletteChips.forEach(chip => {
        chip.addEventListener('click', () => {
            if (activeSlotIndex === null) return;
            const color = chip.getAttribute('data-color');
            selectColorInstant(color);
        });
    });

    // カスタムカラーピッカー変更（即確定）
    if (customColorPicker) {
        const handleCustomColor = (e) => {
            if (activeSlotIndex === null) return;
            selectColorInstant(e.target.value);
        };
        customColorPicker.addEventListener('change', handleCustomColor);
    }

    // 「色をクリア」ボタン
    if (btnClearSlot) {
        btnClearSlot.onclick = () => {
            if (activeSlotIndex === null) return;
            selected[activeSlotIndex] = 'clear';
            pendingColor = 'clear';
            render();
        };
    }

    // 「全色クリア」ボタン
    if (btnClearAllSlots) {
        btnClearAllSlots.onclick = () => {
            for (let i = 0; i < selected.length; i++) {
                selected[i] = 'clear';
            }
            pendingColor = 'clear';
            render();
        };
    }

    // 「✕ 閉じる」ボタン
    if (btnClosePalette) {
        btnClosePalette.onclick = () => {
            activeSlotIndex = null;
            render();
        };
    }
    if (btnClosePaletteX) {
        btnClosePaletteX.onclick = () => {
            activeSlotIndex = null;
            render();
        };
    }

    render();
    return () => selected.filter(c => c !== 'clear');
}

// -------------------------------------------------------------------
// メイン初期化関数
// DOMContentLoaded だけでなく pageshow（bfcache復帰）からも呼び出す
// -------------------------------------------------------------------
const TOUR_PENDING_KEY = 'therapist_tour_pending';

/**
 * デモが顧客を作る「直前」に、いま居る顧客のidを控えておく。
 *
 * 印（isTourTemp）は顧客ができた後にしか付けられないので、その一瞬に
 * ページを閉じられると目印が無い顧客が残る。控えたidと突き合わせれば、
 * 「あとから増えた、この名前の顧客」だけを確実に見分けられる。
 * 同名の実在顧客を巻き込まないための仕掛け。
 */
function markTourPending(name) {
    try {
        localStorage.setItem(TOUR_PENDING_KEY, JSON.stringify({
            name,
            knownIds: getCustomers().map((c) => String(c.id))
        }));
    } catch (e) { /* 控えられなくてもデモ自体は続ける */ }
}

function clearTourPending() {
    try { localStorage.removeItem(TOUR_PENDING_KEY); } catch (e) { /* noop */ }
}

/**
 * デモの取りこぼしを掃除する。起動のたびに通るので、
 * 架空の顧客が一覧に居座ることはない。
 */
function purgeTourLeftovers() {
    const removed = [];
    const drop = (c) => { deleteCustomer(c.id); removed.push(c.name); };

    // 印が付いているもの
    getCustomers().filter((c) => c.isTourTemp).forEach(drop);

    // 印が付く前に中断されたもの（控えたidに無い＝デモ中に増えた分だけ）
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(TOUR_PENDING_KEY) || 'null'); } catch (e) { /* noop */ }
    if (pending && pending.name) {
        const known = new Set((pending.knownIds || []).map(String));
        getCustomers()
            .filter((c) => c.name === pending.name && !known.has(String(c.id)))
            .forEach(drop);
    }
    clearTourPending();

    if (removed.length > 0) {
        console.info(`デモで作られた顧客を片付けました: ${removed.join('、')}`);
    }
}

function initApp() {
    purgeTourLeftovers();

    // 「下ごしらえ」を使う設定かどうかを、画面を描き始める前に効かせる（ISSUE-083）。
    // 💬 は aurora-boot が同じことをしているが、あちらは ui.js の**後**に読まれる。
    // こちらの欄は ui.js が描くので、ここで付けないと一瞬出てしまう。
    applyPrepVisibility();

    // DOM要素の取得
    const searchInput = document.getElementById('search-input');
    const checkShowArchived = document.getElementById('check-show-archived');
    const btnAddCustomer = document.getElementById('btn-add-customer');
    const customerListContainer = document.getElementById('customer-list-container');
    const customerDetailView = document.getElementById('customer-detail-view');
    
    // 詳細ビュー要素
    const detailName = document.getElementById('detail-name');
    const detailKana = document.getElementById('detail-kana');
    const detailStatusBadge = document.getElementById('detail-status-badge');
    const btnCloseDetail = document.getElementById('btn-close-detail');
    const btnDetailArchive = document.getElementById('btn-detail-archive');
    const btnDetailArchiveText = document.getElementById('btn-detail-archive-text');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContentArea = document.getElementById('tab-content-area');
    const addRecordAction = document.getElementById('add-record-action');
    const btnAddRecord = document.getElementById('btn-add-record');

    // 顧客登録モーダル
    const customerModal = document.getElementById('customer-modal');
    const customerModalTitle = document.getElementById('customer-modal-title'); // [MINOR v1.10.0]
    const customerForm = document.getElementById('customer-form');
    const btnCancelCustomer = document.getElementById('btn-cancel-customer');
    const btnSubmitCustomer = document.getElementById('btn-submit-customer');
    const inputMemo = document.getElementById('input-memo');
    const inputInitialConsultation = document.getElementById('input-initial-consultation');

    /**
     * 初診の項目。memo だけは古い initialConsultation をそのまま使う。
     * すでに書かれているものを別の場所へ移すと、移し損ねたときに消えて
     * 見える。器を増やすだけにして、既存の中身には触らない。
     */
    const INTAKE_FIELDS = [
        { key: 'personal',   id: 'input-intake-personal' },
        { key: 'reasonGoal', id: 'input-intake-goal' },
        { key: 'family',     id: 'input-intake-family' },
        { key: 'history',    id: 'input-intake-history' },
        { key: 'medication', id: 'input-intake-medication' }
    ];

    function fillIntakeFields(customer) {
        const intake = (customer && customer.intake) || {};
        INTAKE_FIELDS.forEach(({ key, id }) => {
            const el = document.getElementById(id);
            if (el) el.value = intake[key] || '';
        });
    }

    function collectIntakeFields() {
        const out = {};
        INTAKE_FIELDS.forEach(({ key, id }) => {
            const el = document.getElementById(id);
            out[key] = el ? el.value : '';
        });
        return out;
    }

    /**
     * 精油の候補より優先するもの（＝注意事項）を、カルテから拾う。
     *
     * 以前は初診欄とメモを**丸ごと**注意事項として出していた。その結果、
     * 「臨床工学技士 学術修士」のような資格まで ⚠️ の枠に入っていた（ISSUE-060）。
     *
     * 赤い枠に関係ないものが混ざると、**本当のアレルギーがその中に埋もれます。**
     * 出しすぎは、出さないのと同じくらい危ない。
     *
     * そこで、**体のことを書く欄だけ**を注意事項とし、残りは「参考」に回す。
     * ただし**捨てません**。書く場所を間違えたものが黙って消えるほうが危ないため。
     */
    const CAUTION_FIELDS = [
        { label: '病歴', get: (c) => (c.intake || {}).history },
        { label: '薬', get: (c) => (c.intake || {}).medication }
    ];

    /** 注意事項ではないが、これまで同じ枠に出ていたもの。黙って消さずに残す。 */
    const CAUTION_REFERENCE_FIELDS = [
        { label: 'memo', get: (c) => c.initialConsultation },
        { label: '顧客メモ', get: (c) => c.memo }
    ];

    function collectCustomerCautions(customer) {
        const pick = (defs) => (customer ? defs
            .map(({ label, get }) => ({ label, text: String(get(customer) || '').trim() }))
            .filter((row) => row.text) : []);
        return { cautions: pick(CAUTION_FIELDS), notes: pick(CAUTION_REFERENCE_FIELDS) };
    }

    /**
     * 注意事項がどこから拾われるかを、書く人に伝える一文。
     *
     * ⚠️ が1つも出ていないときは、**書く場所を間違えている可能性**があるので
     * そこを強めに言う。「書いたのに出なかった」がいちばん危ない。
     */
    function cautionSourceHint(hasCaution) {
        return hasCaution
            ? '注意事項は初診の「病歴」「薬」から拾っています。'
            : '⚠️ の欄は空です。体質・アレルギー・服薬は、'
                + 'ここではなく初診の「病歴」「薬」に書くと注意事項として出ます。';
    }

    // レコード追加モーダル
    const recordModal = document.getElementById('record-modal');
    const recordForm = document.getElementById('record-form');
    const btnCancelRecord = document.getElementById('btn-cancel-record');
    const btnSubmitRecord = document.getElementById('btn-submit-record');

    // アプリケーション状態
    let selectedCustomerId = null;
    let editingCustomer = null; // [MINOR v1.10.0] 顧客編集モード用
    let activeTab = 'visit-type';

    // 1. 顧客一覧の描画
    /**
     * 初診の中身をまとめて出す。
     * 何も書かれていない項目は出さない。空の見出しが並ぶと、書いたものが
     * 埋もれる。
     */
    /**
     * カルテの「初診」を、6つの枠として出す。
     *
     * 以前は6項目をひとつの枠にまとめ、書いてある項目だけを出していた。
     * それだと未記入の項目は見出しごと消えてしまい、何を訊く欄なのかが
     * 分からなくなる。中身は1枠ずつ入れるものなので、空でも枠は必ず残す。
     * 枠を押せば、その枠だけをその場で書き換えられる。
     */
    function buildIntakeBoxesHtml(customer) {
        const intake = (customer && customer.intake) || {};
        const boxes = [
            { field: 'intake.personal',   label: '❤️ Personal',      value: intake.personal },
            { field: 'intake.reasonGoal', label: '❤️ Reason & Gole', value: intake.reasonGoal },
            { field: 'intake.family',     label: '❤️ 家族構成',       value: intake.family },
            { field: 'intake.history',    label: '❤️ 病歴',          value: intake.history },
            { field: 'intake.medication', label: '❤️ 薬',            value: intake.medication },
            { field: 'initialConsultation', label: '❤️ memo',        value: customer && customer.initialConsultation }
        ];
        return `
            <div class="intake-view">
                <h4 class="intake-head">初診</h4>
                ${boxes.map(({ field, label, value }) => `
                    <div class="quick-edit-field intake-view-item" data-field="${field}" title="${escapeHtml(label)}を編集">
                        <span class="intake-view-label">${escapeHtml(label)}</span>
                        <div class="field-value intake-view-value">${value && String(value).trim()
                            ? escapeHtml(String(value).trim())
                            : '<span class="intake-empty">未記入</span>'}</div>
                    </div>`).join('')}
            </div>`;
    }

    function renderCustomerList(query = '') {
        try {
            if (!customerListContainer) return;
            const showArchived = checkShowArchived ? checkShowArchived.checked : false;
            const allCustomers = getCustomers() || [];
            const customers = allCustomers.filter(c => c && (showArchived ? true : !c.isArchived));
            
            customerListContainer.innerHTML = '';

            const filtered = customers.filter(c => {
                if (!c || !c.name) return false;
                // よみがなはひらがなで入るが、以前の登録はカタカナのことがある。
                // どちらで探しても見つかるように、ひらがなに寄せて比べる。
                const q = toHiragana(query.toLowerCase());
                return toHiragana(c.name.toLowerCase()).includes(q)
                    || (c.kana && toHiragana(c.kana.toLowerCase()).includes(q));
            });

            if (filtered.length === 0) {
                customerListContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 20px; grid-column: 1 / -1;">見つかりませんでした。</div>`;
                return;
            }

            filtered.forEach(customer => {
                try {
                    const card = document.createElement('div');
                    // [ISSUE-018] カードの枠色・背景は1色目（メインカラー）を使う
                    const mainColor = getMainSoulColor(customer) || 'clear';
                    card.className = 'customer-card-grid-item';
                    if (mainColor.startsWith('#')) {
                        card.style.borderColor = mainColor;
                        card.style.boxShadow = `0 0 10px ${mainColor}44`;
                    } else if (mainColor.includes('gradient')) {
                        card.style.borderImage = `${mainColor} 1`;
                        card.style.boxShadow = '0 0 10px rgba(0, 242, 254, 0.2)';
                    } else {
                        // 定義に無い値だと DOMTokenList が例外を投げ、
                        // その顧客のカードが丸ごと描かれなくなる（ISSUE-088）
                        const safeToken = String(mainColor).replace(/[^a-zA-Z0-9_-]/g, '');
                        if (safeToken) card.classList.add(`soul-card-${safeToken}`);
                    }
                    if (selectedCustomerId === customer.id) {
                        card.style.boxShadow = '0 0 16px var(--accent-cyan)';
                    }

                    // アーカイブ顧客の場合は明確な視覚的強調
                    if (customer.isArchived) {
                        card.style.border = '2px dashed #f59e0b';
                        card.style.background = 'rgba(245, 158, 11, 0.08)';
                    }

                    // カードは要約だけにする。押せば詳細が開くので、
                    // 一覧では「誰か」と「どのくらい通っているか」が分かれば足りる。
                    // 編集・アーカイブは詳細画面に置いてある。
                    const archiveBadgeHtml = customer.isArchived
                        ? `<span class="cust-card-badge is-archived">📦 アーカイブ中</span>`
                        : '';

                    const records = customer.records || [];
                    const last = records.length > 0
                        ? [...records].map((r) => r.date).sort().slice(-1)[0]
                        : null;

                    card.innerHTML = `
                        <div class="cust-card-main">
                            <span class="cust-card-colors">${buildSoulColorBadgeHtml(getSoulColors(customer), 'sm')}</span>
                            <div class="cust-card-names">
                                <div class="cust-card-name">${escapeHtml(displayNameOf(customer))}</div>
                                ${displayNameOf(customer) !== customer.name
                                    ? `<div class="cust-card-kana">${escapeHtml(customer.name)}</div>`
                                    : (customer.kana ? `<div class="cust-card-kana">${escapeHtml(customer.kana)}</div>` : '')}
                            </div>
                            <span class="cust-card-arrow">&rsaquo;</span>
                        </div>
                        <div class="cust-card-sub">
                            <span>${escapeHtml(customer.customerNo || '')}</span>
                            <span>来店 <strong>${records.length}</strong> 回</span>
                            ${last ? `<span>前回 ${escapeHtml(last.replace(/-/g, '/').slice(5))}</span>` : ''}
                            ${archiveBadgeHtml}
                        </div>
                    `;

                    // カードのどこを押しても詳細が開く
                    card.addEventListener('click', () => showCustomerDetail(customer.id));

                    customerListContainer.appendChild(card);
                } catch (cardErr) {
                    console.error('Error rendering card:', cardErr);
                }
            });
        } catch (err) {
            console.error('Render list error:', err);
            if (customerListContainer) {
                customerListContainer.innerHTML = `<div style="color: #ff5252; padding: 20px;">表示エラーが発生しました。</div>`;
            }
        }
    }

    // 2. 顧客詳細の表示
    /** カレンダーから見に来た日。詳細を開いている間だけ持つ */
    let detailHighlightDate = null;

    /**
     * 「この方のこと」を、直せる状態にしているか（ISSUE-077）。
     * 別の方へ移ったら必ず戻す。前の方で開いた編集が、次の方に持ち越されないため。
     */
    let personalEditOn = false;

    /** 名前を押したときの行き先。タブの帯には出していない画面を開く */
    function openPersonalInfo(id) {
        personalEditOn = false;
        activeTab = 'personal-info';
        // どのタブも押されていない状態にする。いまいる場所が帯の中に無いため
        document.querySelectorAll('.detail-subtab-btn').forEach((b) => b.classList.remove('active'));
        const nameOpen = document.getElementById('detail-name-open');
        if (nameOpen) nameOpen.classList.add('is-open');
        const customer = getCustomers().find((c) => String(c.id) === String(id));
        if (customer) renderTabContent(customer);
    }

    function showCustomerDetail(id) {
        // 別の顧客へ移ったら、見に来た日の印は持ち越さない
        if (selectedCustomerId !== id) { detailHighlightDate = null; personalEditOn = false; }
        if (window._highlightDate) {
            detailHighlightDate = window._highlightDate;
            window._highlightDate = null;
        }
        selectedCustomerId = id;
        const customers = getCustomers();
        const customer = customers.find(c => c.id === id);

        if (!customer) return;

        // カルテの頭には、氏名とニックネームの両方を出す。
        // 普段はニックネームで呼んでいても、カルテは氏名で残す必要がある。
        // ニックネームは任意なので、入っているときだけ添える。
        detailName.textContent = customer.name;
        const nick = (customer.nickname || '').trim();
        if (nick) {
            const chip = document.createElement('span');
            chip.className = 'detail-nickname';
            chip.textContent = nick;
            chip.title = 'ニックネーム';
            detailName.appendChild(chip);
        }
        // ソウルカラーは、一覧と同じ形でいつも名前の横に出す（ISSUE-077）。
        // 顔ぶれを思い出す手がかりなので、開かないと見えないのでは遅い。
        const nameColors = document.getElementById('detail-name-colors');
        if (nameColors) nameColors.innerHTML = buildSoulColorBadgeHtml(getSoulColors(customer), 'sm');

        // 名前を押すと「この方のこと」が開く。
        // ここで直に書き換えられると、読むつもりで触って直してしまう。
        // 直すのは開いた先の ✏️ から（ISSUE-077）。
        const nameOpen = document.getElementById('detail-name-open');
        if (nameOpen) {
            nameOpen.onclick = () => openPersonalInfo(customer.id);
            // 別の方へ移っても「この方のこと」を開いたままにしていることがある。
            // 印は、いま出ている画面に合わせる
            nameOpen.classList.toggle('is-open', activeTab === 'personal-info');
        }

        detailKana.textContent = `${customer.customerNo || ''} | ${customer.kana || ''}`;
        detailKana.style.cursor = 'pointer';
        detailKana.title = 'この方のことを開く';
        detailKana.onclick = () => openPersonalInfo(customer.id);

        customerDetailView.style.display = 'flex';

        // 詳細画面のステータスバッジとアーカイブボタンの動的切り替え
        if (detailStatusBadge) {
            if (customer.isArchived) {
                detailStatusBadge.textContent = '📦 アーカイブ保管中';
                detailStatusBadge.style.background = '#f59e0b';
                detailStatusBadge.style.color = '#000';
                detailStatusBadge.style.border = 'none';
            } else {
                detailStatusBadge.textContent = '🟢 通常顧客';
                detailStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                detailStatusBadge.style.color = '#10b981';
                detailStatusBadge.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            }
        }

        if (btnDetailArchive) {
            // 並んでいる「編集・削除・閉じる」は、どれも枠も塗りも持たず、
            // 文字の色だけが違う。アーカイブだけ枠と塗りを付けていたため、
            // そこだけ浮いて見えていた。押す前から目立たせる理由は無いので、
            // 周りに揃えて文字の色だけにする。
            btnDetailArchive.style.background = 'transparent';
            btnDetailArchive.style.border = 'none';
            if (customer.isArchived) {
                // 戻せる状態であることは、色で伝える（削除の赤とは別の色）
                btnDetailArchive.style.color = '#10b981';
                btnDetailArchive.style.fontWeight = '700';
                if (btnDetailArchiveText) btnDetailArchiveText.textContent = '📤 アーカイブ解除（通常一覧へ戻す）';
            } else {
                btnDetailArchive.style.color = '#f59e0b';
                btnDetailArchive.style.fontWeight = '';
                if (btnDetailArchiveText) btnDetailArchiveText.textContent = '📦 アーカイブ保管';
            }
        }

        const workspaceGrid = document.querySelector('.workspace-grid');
        if (workspaceGrid) {
            workspaceGrid.classList.add('detail-mode');
        }

        // 現在のアクティブタブを描画
        renderTabContent(customer);
        renderCustomerList(searchInput ? searchInput.value : ''); // 一覧側のハイライトも同期
    }

    // --- インライン編集管理 ---
    let currentActiveEditor = null;
    function closeActiveEditor() {
        if (currentActiveEditor && typeof currentActiveEditor.close === 'function') {
            currentActiveEditor.close();
        }
        currentActiveEditor = null;
    }

    /** インライン編集を開始する */
    function startInlineEdit(container, field, customer, displayEl = null) {
        if (currentActiveEditor) {
            if (!confirm('現在編集中の項目があります。別の項目を編集しますか？')) return;
            closeActiveEditor();
        }

        const originalTitle = container.getAttribute('title');
        container.removeAttribute('title');

        // 初診の6枠は customer.intake の下にまとめてある。
        // 「intake.personal」のように書いて、1枠ずつ書き換えられるようにする。
        const intakeKey = field.startsWith('intake.') ? field.slice('intake.'.length) : null;
        const originalValue = (intakeKey
            ? (customer.intake || {})[intakeKey]
            : customer[field]) || '';
        const isTextarea = Boolean(intakeKey) || ['initialConsultation', 'memo'].includes(field);

        const input = document.createElement(isTextarea ? 'textarea' : 'input');
        input.value = originalValue;
        
        // スタイル設定
        const commonStyle = `
            width: 100%;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid var(--accent-cyan);
            color: var(--text-primary);
            padding: 10px;
            border-radius: 8px;
            font-size: 1rem;
            outline: none;
            box-shadow: 0 0 12px rgba(0, 242, 254, 0.4);
            margin: 4px 0;
            font-family: inherit;
        `;
        input.style.cssText = isTextarea ? commonStyle + 'min-height: 120px; resize: vertical; line-height: 1.6;' : commonStyle;
        
        if (field === 'birthday') input.type = 'date';
        if (field === 'phone') input.type = 'tel';
        if (field === 'customerNo') {
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.setAttribute('autocapitalize', 'characters');
        }

        // 顧客No. は、打っている間に重なりを知らせる
        let noHint = null;
        const checkNo = () => {
            if (field !== 'customerNo') return null;
            const v = normalizeCustomerNo(input.value);
            let problem = null;
            if (!v) problem = '顧客No. を空にはできません。';
            else {
                const owner = findCustomerNoOwner(v, customer.id);
                if (owner) problem = `${v} はすでに ${owner.name || '別の方'} 様${owner.isArchived ? '（保管中）' : ''}が使っています。`;
            }
            if (noHint) {
                noHint.textContent = problem ? `⚠ ${problem}` : '';
                noHint.style.display = problem ? 'block' : 'none';
            }
            input.style.borderColor = problem ? '#ff8a8a' : 'var(--accent-cyan)';
            return problem;
        };
        if (field === 'customerNo') {
            noHint = document.createElement('small');
            noHint.setAttribute('aria-live', 'polite');
            noHint.style.cssText = 'display: none; margin-top: 4px; font-size: 0.75rem; color: #ff8a8a;';
            input.addEventListener('input', checkNo);
        }
        
        // 保存・キャンセルボタン
        const actions = document.createElement('div');
        actions.title = ''; // 背景のツールチップが表示されないようにブロックする
        actions.style.cssText = 'display: flex; gap: 10px; margin-top: 8px; justify-content: flex-end;';
        
        const btnSave = document.createElement('button');
        btnSave.innerHTML = '✅';
        btnSave.title = '変更を保存する';
        btnSave.style.cssText = 'background: var(--accent-cyan); border: none; color: #000; padding: 6px 14px; border-radius: 6px; font-size: 1rem; cursor: pointer; font-weight: bold; transition: all 0.2s;';
        btnSave.onmouseover = () => btnSave.style.transform = 'scale(1.05)';
        btnSave.onmouseout = () => btnSave.style.transform = 'scale(1)';
        
        const btnCancel = document.createElement('button');
        btnCancel.innerHTML = '✕';
        btnCancel.title = '編集をキャンセルする';
        btnCancel.style.cssText = 'background: rgba(255,255,255,0.1); border: 1px solid var(--border-glass); color: var(--text-secondary); padding: 6px 14px; border-radius: 6px; font-size: 1rem; cursor: pointer; transition: all 0.2s;';
        btnCancel.onmouseover = () => btnCancel.style.background = 'rgba(255,255,255,0.15)';
        btnCancel.onmouseout = () => btnCancel.style.background = 'rgba(255,255,255,0.1)';
        
        actions.appendChild(btnCancel);
        actions.appendChild(btnSave);
        
        // 元の表示を隠す
        const targetValueEl = displayEl || container.querySelector('.field-value');
        const originalDisplay = targetValueEl.style.display;
        targetValueEl.style.display = 'none';
        
        container.appendChild(input);
        if (noHint) container.appendChild(noHint);
        container.appendChild(actions);
        input.focus();
        
        // テキストエリアの場合は末尾にカーソル
        if (isTextarea) {
            input.setSelectionRange(input.value.length, input.value.length);
        }
        
        const closeEdit = () => {
            input.remove();
            if (noHint) noHint.remove();
            actions.remove();
            targetValueEl.style.display = originalDisplay;
            if (originalTitle) container.setAttribute('title', originalTitle);
            currentActiveEditor = null;
        };
        currentActiveEditor = { close: closeEdit };
        
        btnSave.onclick = (e) => {
            e.stopPropagation();
            let newValue = input.value;
            if (field === 'customerNo') {
                const problem = checkNo();
                if (problem) {
                    showToast(problem, 'error');
                    input.focus();
                    return; // 編集は開いたまま。直してから保存してもらう
                }
                newValue = normalizeCustomerNo(newValue);
            }
            const updateData = {};
            if (intakeKey) {
                // 他の枠を消さないよう、いまの中身に重ねて書く
                updateData.intake = { ...(customer.intake || {}), [intakeKey]: newValue };
            } else {
                updateData[field] = newValue;
            }

            // 誕生日の場合は誕生月も更新
            if (field === 'birthday' && newValue) {
                updateData.birthMonth = newValue.split('-')[1];
            }
            
            updateCustomer(customer.id, updateData);
            // 編集中の印を必ず落としてから描き直す。落とさないと、画面は
            // 描き変わっているのに「編集中の項目があります」と訊かれ続け、
            // 次の項目に手が入らなくなる。
            closeEdit();
            showToast('更新しました', 'success');
            showCustomerDetail(customer.id); // 詳細画面をリフレッシュ
        };
        
        btnCancel.onclick = (e) => {
            e.stopPropagation();
            closeEdit();
        };
        
        input.onclick = (e) => e.stopPropagation();
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !isTextarea) {
                e.preventDefault();
                btnSave.click();
            }
            if (e.key === 'Escape') btnCancel.click();
        };
    }

    /** Soul Colorのインライン編集を開始する */
    /**
     * @param onPick  渡されたときは保存しない。選んだ色を渡すだけにする。
     *                「この方のこと」をまとめて保存する画面で使う。
     */
    function startSoulColorInlineEdit(container, customer, onPick = null) {
        if (currentActiveEditor) {
            if (!confirm('現在編集中の項目があります。別の項目を編集しますか？')) return;
            closeActiveEditor();
        }

        const originalTitle = container.getAttribute('title');
        container.removeAttribute('title');

        const originalColors = getSoulColors(customer);
        let currentColors = [...originalColors];
        while (currentColors.length < 5) currentColors.push('clear');
        
        let activeSlotIndex = 0;

        const fieldValueEl = container.querySelector('.field-value');
        if (fieldValueEl) fieldValueEl.style.display = 'none';

        const editorWrap = document.createElement('div');
        editorWrap.className = 'inline-color-editor';
        editorWrap.title = ''; // 背景のツールチップが表示されないようにブロックする
        editorWrap.style.cssText = `
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(12px);
            border: 1px solid var(--accent-cyan);
            border-radius: 16px;
            padding: 16px;
            margin-top: 10px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 242, 254, 0.1);
            display: flex;
            flex-direction: column;
            gap: 14px;
            width: 100%;
            box-sizing: border-box;
            z-index: 100;
        `;
        editorWrap.onclick = (e) => e.stopPropagation();

        const closeEdit = () => {
            editorWrap.remove();
            if (fieldValueEl) fieldValueEl.style.display = 'flex';
            if (originalTitle) container.setAttribute('title', originalTitle);
            currentActiveEditor = null;
        };
        currentActiveEditor = { close: closeEdit };

        // 1. Soul Color (5つのスロット) セクション
        const slotsHeader = document.createElement('div');
        slotsHeader.style.cssText = 'background: rgba(0, 242, 254, 0.03); padding: 14px; border-radius: 14px; border: 1px solid rgba(0, 242, 254, 0.15);';
        
        const slotsLabel = document.createElement('label');
        slotsLabel.style.cssText = 'margin-bottom: 8px; display: block; color: var(--accent-cyan); font-weight: 700; font-size: 0.85rem;';
        slotsLabel.textContent = 'Soul Color (5つのスロットから各色を選択)';
        slotsHeader.appendChild(slotsLabel);

        const slotsContainer = document.createElement('div');
        slotsContainer.style.cssText = 'display: flex; justify-content: center; gap: 12px; padding: 8px 0;';
        slotsHeader.appendChild(slotsContainer);

        const renderSlots = () => {
            slotsContainer.innerHTML = '';
            currentColors.forEach((color, index) => {
                const slot = document.createElement('div');
                const isActive = activeSlotIndex === index;
                const hasColor = color !== 'clear';
                const cssVal = hasColor ? getSoulColorCssValue(color) : 'rgba(255, 255, 255, 0.05)';
                
                let colorName = '未選択';
                if (hasColor) {
                    const allDefs = [...SOUL_COLOR_DEFS, ...TC_COLOR_DEFS, ...ADVANCE_COLOR_DEFS];
                    const def = allDefs.find(d => d.key === color);
                    if (def) colorName = def.name;
                }
                slot.title = `スロット ${index + 1}: ${colorName}`;

                slot.style.cssText = `
                    width: 42px;
                    height: 42px;
                    border-radius: 50%;
                    background: ${cssVal};
                    border: ${hasColor ? '1px solid rgba(255,255,255,0.4)' : '2px dashed rgba(255, 255, 255, 0.2)'};
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    transition: all 0.2s;
                    box-shadow: ${isActive ? '0 0 20px rgba(0, 242, 254, 0.6), inset 0 0 10px rgba(255, 255, 255, 0.2)' : (hasColor ? '0 4px 12px rgba(0,0,0,0.4)' : 'none')};
                    ${isActive ? 'border-color: var(--accent-cyan) !important; border-style: solid !important; border-width: 2px !important;' : ''}
                    overflow: hidden;
                `;
                
                // ハイライト
                const highlight = document.createElement('div');
                highlight.style.cssText = `
                    position: absolute; top: 12%; left: 18%; width: 30%; height: 30%;
                    background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0) 80%);
                    border-radius: 50%; pointer-events: none; z-index: 3;
                `;
                slot.appendChild(highlight);

                const gloss = document.createElement('div');
                gloss.style.cssText = `
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    background: radial-gradient(circle at 50% 120%, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0) 70%),
                                radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 50%);
                    pointer-events: none; border-radius: 50%; z-index: 2;
                `;
                slot.appendChild(gloss);

                slot.onclick = (e) => {
                    e.stopPropagation();
                    activeSlotIndex = index;
                    renderSlots();
                    renderPalette();
                };
                slotsContainer.appendChild(slot);
            });
        };

        // 2. パレット表示エリア
        const paletteBox = document.createElement('div');
        paletteBox.style.cssText = 'background: rgba(15, 23, 42, 0.98); backdrop-filter: blur(12px); padding: 16px; border-radius: 16px; border: 1px solid var(--accent-cyan); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);';

        const paletteTopBar = document.createElement('div');
        paletteTopBar.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';

        const statusLabel = document.createElement('span');
        statusLabel.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary); font-weight: 700;';
        paletteTopBar.appendChild(statusLabel);
        paletteBox.appendChild(paletteTopBar);

        // モード切替タブ
        const tabNav = document.createElement('div');
        tabNav.style.cssText = 'display: flex; gap: 4px; margin-bottom: 12px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 10px; border: 1px solid var(--border-glass);';
        paletteBox.appendChild(tabNav);

        const subTitleEl = document.createElement('div');
        subTitleEl.style.cssText = 'font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 10px; padding-left: 4px;';
        paletteBox.appendChild(subTitleEl);

        const chipContainer = document.createElement('div');
        chipContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; max-height: 200px; overflow-y: auto; padding: 2px;';
        paletteBox.appendChild(chipContainer);

        // コントロールバー (🗑️ 🧹 ✕ ✅)
        const ctrlBar = document.createElement('div');
        ctrlBar.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-glass);';

        const ctrlLeft = document.createElement('div');
        ctrlLeft.style.cssText = 'display: flex; gap: 8px;';
        
        const btnClearCurSlot = document.createElement('button');
        btnClearCurSlot.type = 'button';
        btnClearCurSlot.title = '現在のスロットをクリア';
        btnClearCurSlot.innerHTML = '🗑️';
        btnClearCurSlot.style.cssText = 'background: rgba(255, 82, 82, 0.1); border: 1px solid rgba(255, 82, 82, 0.4); color: #ff5252; font-size: 1rem; width: 44px; height: 38px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;';
        btnClearCurSlot.onclick = (e) => {
            e.stopPropagation();
            if (activeSlotIndex !== null) {
                currentColors[activeSlotIndex] = 'clear';
                renderSlots();
                renderPalette();
            }
        };

        const btnClearAll = document.createElement('button');
        btnClearAll.type = 'button';
        btnClearAll.title = '全スロットをクリア';
        btnClearAll.innerHTML = '🧹';
        btnClearAll.style.cssText = 'background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); color: var(--text-secondary); font-size: 1rem; width: 44px; height: 38px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;';
        btnClearAll.onclick = (e) => {
            e.stopPropagation();
            currentColors = ['clear', 'clear', 'clear', 'clear', 'clear'];
            renderSlots();
            renderPalette();
        };

        ctrlLeft.appendChild(btnClearCurSlot);
        ctrlLeft.appendChild(btnClearAll);

        const ctrlRight = document.createElement('div');
        ctrlRight.style.cssText = 'display: flex; gap: 8px;';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.title = 'キャンセル';
        btnCancel.innerHTML = '✕';
        btnCancel.style.cssText = 'background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); color: var(--text-secondary); font-size: 1rem; width: 44px; height: 38px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;';
        btnCancel.onclick = (e) => { e.stopPropagation(); closeEdit(); };

        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.title = '更新を保存';
        btnSave.innerHTML = '✅';
        btnSave.style.cssText = 'background: var(--accent-cyan); border: none; color: #000; font-size: 1rem; width: 64px; height: 38px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 800;';
        btnSave.onclick = (e) => {
            e.stopPropagation();
            const picked = currentColors.filter(c => c !== 'clear').length > 0 ? currentColors : [];
            if (onPick) {
                closeEdit();
                onPick(picked);
                return;
            }
            updateCustomer(customer.id, { soulColors: picked });
            showToast('更新しました', 'success');
            showCustomerDetail(customer.id);
        };

        ctrlRight.appendChild(btnCancel);
        ctrlRight.appendChild(btnSave);

        ctrlBar.appendChild(ctrlLeft);
        ctrlBar.appendChild(ctrlRight);
        paletteBox.appendChild(ctrlBar);

        // 個人の Soul Color は Soul の12色だけを扱う。
        // TC・アドバンスは、その日の記録（施術の色）側で選ぶ。
        tabNav.style.display = 'none';

        const renderPalette = () => {
            statusLabel.textContent = `スロット ${activeSlotIndex + 1} の色を選択中`;

            // チップ一覧生成
            chipContainer.innerHTML = '';
            subTitleEl.textContent = 'Soul Color（12色）から選択:';
            const colorList = SOUL_COLOR_DEFS;

            const activeColorKey = currentColors[activeSlotIndex];

            colorList.forEach(c => {
                const chip = document.createElement('div');
                const isSelected = activeColorKey === c.key || activeColorKey === c.code;
                const cssVal = getSoulColorCssValue(c.key);

                chip.title = c.name || c.label || c.key;
                chip.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 38px;
                    height: 38px;
                    background: ${cssVal};
                    border: 1px solid ${isSelected ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.3)'};
                    border-radius: 50%;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    user-select: none;
                    box-shadow: ${isSelected ? '0 0 12px var(--accent-cyan)' : '0 2px 6px rgba(0,0,0,0.4)'};
                    position: relative;
                    overflow: hidden;
                `;

                // 光沢ハイライト
                const highlight = document.createElement('div');
                highlight.style.cssText = `
                    position: absolute;
                    top: 12%; left: 18%; width: 30%; height: 30%;
                    background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0) 80%);
                    pointer-events: none;
                    border-radius: 50%;
                    z-index: 3;
                `;
                chip.appendChild(highlight);

                // グロス
                const gloss = document.createElement('div');
                gloss.style.cssText = `
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: radial-gradient(circle at 50% 120%, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0) 70%),
                                radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 50%);
                    pointer-events: none;
                    border-radius: 50%;
                    z-index: 2;
                `;
                chip.appendChild(gloss);

                chip.onmouseover = () => {
                    chip.style.transform = 'scale(1.15)';
                    if (!isSelected) {
                        chip.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                        chip.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
                    }
                };
                chip.onmouseout = () => {
                    chip.style.transform = 'scale(1)';
                    if (!isSelected) {
                        chip.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                        chip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
                    }
                };

                chip.onclick = (e) => {
                    e.stopPropagation();
                    currentColors[activeSlotIndex] = c.key;
                    if (activeSlotIndex < 4) {
                        activeSlotIndex++;
                    }
                    renderSlots();
                    renderPalette();
                };

                chipContainer.appendChild(chip);
            });
        };

        renderSlots();
        renderPalette();

        editorWrap.appendChild(slotsHeader);
        editorWrap.appendChild(paletteBox);
        container.appendChild(editorWrap);
    }

    // 3. タブコンテンツの切り替えと描画
    /**
     * 記録の1枚（ISSUE-072）。
     *
     * 🕐・📋・💴 は、**上に載る帯が違うだけで中身は同じもの**だった。
     * 3か所に書き分けていたので、片方だけ古くなる。実際 🕐 の金額は
     * 生の数値のままで、未入力が「金額未定」と出ていなかった。
     *
     * @param headHtml           カードの頭に載せる帯。タブごとに違うのはここだけ
     * @param hideSummaryAmount  帯に金額を大きく出す 💴 では、要約側は省く
     */
    function createRecordCard(customer, r, { headHtml = '', extraClass = '', open = false, hideSummaryAmount = false } = {}) {
        const div = document.createElement('div');
        div.className = ['history-item', extraClass, open ? 'is-open' : ''].filter(Boolean).join(' ');
        div.innerHTML = `
            ${headHtml}
            <button type="button" class="history-summary" aria-expanded="${open}">
                <span class="history-summary-main">
                    <span class="history-summary-type">${buildRecordSummaryHeadHtml(r)}</span>
                    ${buildRecordPhotoMarksHtml(r)}
                    ${hideSummaryAmount ? '' : `<span class="history-summary-amount">${escapeHtml(recordAmountLabel(r))}</span>`}
                </span>
                ${buildRecordSummaryLineHtml(r)}
                <span class="history-summary-mark">▾</span>
            </button>
            <div class="history-item-body">
                ${buildRecordDetailsHtml(r)}
                ${buildRecordEditButtonHtml(r)}
            </div>
        `;
        const summaryBtn = div.querySelector('.history-summary');
        if (summaryBtn) {
            summaryBtn.onclick = () => {
                const isOpen = div.classList.toggle('is-open');
                summaryBtn.setAttribute('aria-expanded', String(isOpen));
                if (isOpen) hydratePhotoThumbs(div);
            };
        }
        if (open) hydratePhotoThumbs(div);
        attachRecordEditHandler(div, customer.id, r.id, () => showCustomerDetail(customer.id));
        return div;
    }

    /** カレンダーから見に来た日は、開いた状態で出して、そこまで送る */
    function markVisitedDay(div, isTarget) {
        if (!isTarget) return;
        div.classList.add('history-item-picked');
        setTimeout(() => {
            div.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }

    function renderTabContent(customer) {
        // 見に来た日は、詳細を開き直すときだけでなく、月ぶんのカードから
        // タブを移るときにも渡ってくる。ここで受け取らないと、
        // 押した日の記録が閉じたまま出てしまう。
        if (window._highlightDate) {
            detailHighlightDate = window._highlightDate;
            window._highlightDate = null;
        }
        tabContentArea.innerHTML = '';
        const records = customer.records || [];
        // 文字列で書き出した写真は、描いたあとに中身を入れる（IndexedDBから引くため）
        setTimeout(() => hydratePhotoThumbs(tabContentArea), 0);

        // [PATCH v1.9.1] カレンダー直結化に伴い、新規記録追加ボタンは常に非表示にする
        if (addRecordAction) {
            addRecordAction.style.display = 'none';
        }

        // 🕐「施術日・回数」は 📋 へ寄せた（ISSUE-073）。
        // 古い呼び名で来ても、白紙にせずカルテを出す。
        if (activeTab === 'visit-count') activeTab = 'visit-type';

        switch (activeTab) {
            case 'visit-calendar':
                // 個人カレンダー
                const calendarContainer = document.getElementById('customer-personal-calendar');
                if (calendarContainer) {
                    const clone = calendarContainer.cloneNode(true);
                    clone.style.display = 'block';
                    clone.id = 'personal-calendar-instance';
                    tabContentArea.appendChild(clone);
                    
                    // 今月に記録がない顧客だと空のカレンダーに見えてしまうため、
                    // 直近の施術日（未来の予定があればそちら）の月を開く。
                    currentCustCalendarMonth = pickCalendarMonth(records);

                    // イベント再バインド
                    const prevBtn = clone.querySelector('#cust-calendar-prev');
                    const nextBtn = clone.querySelector('#cust-calendar-next');

                    // 月初にそろえてから加減算する。31日など「翌月に存在しない日」を
                    // 保持したまま setMonth すると1か月飛んでしまうため。
                    const shiftMonth = (delta) => {
                        const y = currentCustCalendarMonth.getFullYear();
                        const m = currentCustCalendarMonth.getMonth();
                        currentCustCalendarMonth = new Date(y, m + delta, 1);
                        renderPersonalCalendarInstance(customer, clone);
                    };

                    if (prevBtn) prevBtn.onclick = () => shiftMonth(-1);
                    if (nextBtn) nextBtn.onclick = () => shiftMonth(1);

                    renderPersonalCalendarInstance(customer, clone);
                }
                break;

            case 'visit-type':
                // カルテ（通算回数・来店ペース・第N回・施術の中身）。
                // もとは 🕐「施術日・回数」と2つに分かれていたが、
                // 出るものが同じだったので、こちらへ寄せた（ISSUE-073）。
                if (records.length === 0) {
                    tabContentArea.innerHTML = '<p style="color: var(--text-secondary);">施術記録がありません。</p>';
                } else {
                    // 日付順に並び替え用コピー（古い順）
                    const sortedAsc = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
                    const firstVisit = sortedAsc[0].date;
                    const latestVisit = sortedAsc[sortedAsc.length - 1].date;

                    // ペース計算（初回〜最新の経過日数 ÷ (回数-1)）
                    let avgIntervalText = '初回来店';
                    if (records.length > 1) {
                        const daysDiff = Math.round((new Date(latestVisit) - new Date(firstVisit)) / (1000 * 60 * 60 * 24));
                        const avgDays = Math.round(daysDiff / (records.length - 1));
                        avgIntervalText = avgDays > 0 ? `約 ${avgDays} 日ペース` : '短期連続来店';
                    }

                    // 今日からの経過日数
                    const daysSinceLatest = Math.round((new Date() - new Date(latestVisit)) / (1000 * 60 * 60 * 24));
                    const daysSinceText = daysSinceLatest === 0 ? '本日来店' : `${daysSinceLatest}日前`;

                    // 回数とペースの見出し。もとは 🕐 の上にあったもの
                    const summaryCard = document.createElement('div');
                    summaryCard.className = 'visit-stats';
                    summaryCard.innerHTML = `
                        <div>
                            <span class="visit-stats-label">通算施術回数</span>
                            <span class="visit-stats-count">${records.length} <span>回</span></span>
                        </div>
                        <div>
                            <span class="visit-stats-label">最終施術日</span>
                            <span class="visit-stats-value">${escapeHtml(latestVisit)}</span>
                            <span class="visit-stats-sub">${escapeHtml(daysSinceText)}</span>
                        </div>
                        <div>
                            <span class="visit-stats-label">平均施術ペース</span>
                            <span class="visit-stats-value">${escapeHtml(avgIntervalText)}</span>
                        </div>
                    `;
                    tabContentArea.appendChild(summaryCard);

                    // 見に来た日。タブを押し直しても開いたままにするため、
                    // 一度きりの window._highlightDate ではなく、詳細を開いている間だけ持つ。
                    const targetDate = detailHighlightDate;
                    records.forEach((r, idx) => {
                        const visitIndex = records.length - idx; // 第何回目か
                        let gapHtml = '<span class="visit-gap first">🎉 初回来店</span>';
                        if (idx < records.length - 1) {
                            const prevRecordDate = records[idx + 1].date;
                            const diffDays = Math.round((new Date(r.date) - new Date(prevRecordDate)) / (1000 * 60 * 60 * 24));
                            gapHtml = diffDays >= 0
                                ? `<span class="visit-gap">前回来店から ${diffDays} 日ぶり</span>`
                                : '';
                        }

                        // 最初は要約だけ。押すと全部出る。
                        // 一覧のまま全文が並ぶと、目当ての日を探すのに時間がかかる。
                        const isOpen = Boolean(targetDate && r.date === targetDate);
                        const head = `
                            <div class="history-item-header visit-head">
                                <span class="visit-no">第 ${visitIndex} 回</span>
                                <span class="visit-when">${escapeHtml(r.date)} ${r.time ? `(${escapeHtml(r.time)})` : ''}</span>
                                ${gapHtml}
                            </div>`;
                        const div = createRecordCard(customer, r, { headHtml: head, open: isOpen });
                        markVisitedDay(div, isOpen);
                        tabContentArea.appendChild(div);
                    });
                }
                break;

            case 'visit-amount':
                // 金額の一覧（施術内容と金額のみを表示）
                if (records.length === 0) {
                    tabContentArea.innerHTML = '<p style="color: var(--text-secondary);">支払記録がありません。</p>';
                } else {
                    const totalAmount = records.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
                    const avgAmount = Math.round(totalAmount / records.length);

                    // 売上サマリーカード
                    const summaryCard = document.createElement('div');
                    summaryCard.style.cssText = 'background: rgba(0, 230, 118, 0.08); border: 1px solid var(--accent-success); border-radius: 16px; padding: 16px; margin-bottom: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; text-align: center;';
                    summaryCard.innerHTML = `
                        <div>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">累計お支払い額</span>
                            <span style="font-size: 1.4rem; font-weight: 700; color: var(--accent-success);">${totalAmount.toLocaleString()} <span style="font-size: 0.85rem;">円</span></span>
                        </div>
                        <div>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">平均客単価</span>
                            <span style="font-size: 1.2rem; font-weight: 600; color: var(--text-primary); margin-top: 2px; display: block;">${avgAmount.toLocaleString()} 円</span>
                        </div>
                    `;
                    tabContentArea.appendChild(summaryCard);

                    // ここも 📋 と同じカード（ISSUE-072）。
                    // 帯に金額を大きく出すぶん、要約側の金額は省く。
                    records.forEach(r => {
                        const isOpen = Boolean(detailHighlightDate && r.date === detailHighlightDate);
                        const head = `
                            <div class="history-item-header amount-head">
                                <span class="amount-when">${escapeHtml(r.date)} ${r.time ? `(${escapeHtml(r.time)})` : ''}</span>
                                <span class="amount-value">${escapeHtml(recordAmountLabel(r))}</span>
                            </div>`;
                        const div = createRecordCard(customer, r, {
                            headHtml: head, extraClass: 'amount', open: isOpen, hideSummaryAmount: true
                        });
                        markVisitedDay(div, isOpen);
                        tabContentArea.appendChild(div);
                    });
                }
                break;

            case 'personal-info':
                // 編集は、全部の欄をまとめて直して、最後に1回「保存する」形。
                // 以前は欄ごとに ✅ で保存する欄と、触った瞬間に保存される欄
                // （体質・アレルギー）が混ざっていて、保存できたか分からなかった。
                if (personalEditOn) {
                    renderPersonalEditForm(customer);
                    break;
                }
                // この方のこと。名前を押すと開く（ISSUE-077）。
                //
                // **押すまでは読むだけ。** 以前は欄に触れた瞬間に編集が始まっていて、
                // 施術中に画面を送っていて生年月日を書き換える、が起こりえた。
                tabContentArea.innerHTML = `
                    <div class="personal-info-bar">
                        <span class="personal-info-title">👤 この方のこと</span>
                        <button type="button" id="btn-personal-edit" class="personal-info-edit"
                                aria-pressed="${personalEditOn ? 'true' : 'false'}">
                            ${personalEditOn ? '✅ 編集をやめる' : '✏️ 編集する'}
                        </button>
                    </div>
                    <div class="read-only-personal-info${personalEditOn ? ' is-editing' : ''}" style="display: flex; flex-direction: column; gap: 16px; padding: 4px 0;">
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <div class="quick-edit-field" data-field="name" title="氏名を編集" style="flex: 1; min-width: 120px; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                                <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">氏名</span>
                                <div class="field-value" style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(customer.name || '未設定')}</div>
                            </div>
                            <div class="quick-edit-field" data-field="nickname" title="ニックネームを編集" style="flex: 1; min-width: 120px; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                                <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">ニックネーム（任意）</span>
                                <div class="field-value" style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary);">${escapeHtml((customer.nickname || '').trim()) || '未設定'}</div>
                            </div>
                            <!-- カナは、頭の ✏️（まとめて直す画面）を外したので、ここが唯一の直し場所（ISSUE-078） -->
                            <div class="quick-edit-field" data-field="kana" title="カナを編集" style="flex: 1; min-width: 120px; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                                <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">カナ</span>
                                <div class="field-value" style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(customer.kana || '未設定')}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <div class="quick-edit-field" data-field="customerNo" title="顧客No.を編集（同じ番号は使えません）" style="flex: 1; min-width: 120px; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                                <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">顧客No.</span>
                                <div class="field-value" style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(customer.customerNo || '未設定')}</div>
                            </div>
                            <div class="quick-edit-field" data-field="phone" title="電話番号を編集" style="flex: 1; min-width: 120px; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                                <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">電話番号</span>
                                <div class="field-value" style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(customer.phone || '未設定')}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <div class="quick-edit-field" data-field="birthday" title="生年月日を編集" style="flex: 1; min-width: 120px; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                                <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">生年月日</span>
                                <div class="field-value" style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary);">
                                    ${escapeHtml(customer.birthday ? customer.birthday.replace(/-/g, '/') : (customer.birthMonth ? customer.birthMonth + '月' : '未設定'))}
                                </div>
                            </div>
                            <div class="quick-edit-field" data-field="referrer" title="紹介者を編集" style="flex: 1; min-width: 120px; cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                                <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">紹介者</span>
                                <div class="field-value" style="font-size: 0.95rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(customer.referrer || 'なし')}</div>
                            </div>
                        </div>
                        <div class="quick-edit-field" data-field="soulColors" title="Soul Colorを編集" style="cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 6px;">Soul Color</span>
                            <div class="field-value" style="display: flex; align-items: center; gap: 8px;">
                                ${buildSoulColorBadgeHtml(getSoulColors(customer), 'sm')}
                            </div>
                        </div>
                        <div id="constitution-editor"></div>
                        ${buildIntakeBoxesHtml(customer)}
                        <div class="quick-edit-field" data-field="memo" title="特記事項・メモを編集" style="cursor: pointer; transition: all 0.2s; padding: 8px; border-radius: 8px; border: 1px solid transparent;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">特記事項・メモ</span>
                            <div class="field-value" style="font-size: 0.9rem; line-height: 1.6; color: var(--text-primary); background: rgba(255,255,255,0.01); border: 1px solid var(--border-glass); border-radius: 12px; padding: 12px; min-height: 48px; white-space: pre-wrap;">${escapeHtml(customer.memo || '未記入')}</div>
                        </div>
                    </div>
                `;

                renderConstitutionEditor(customer);
                // 見ているだけのときは、体質・アレルギーも触れないようにする。
                // 施術中に画面を送っていて、チェックが外れる、を起こさないため。
                {
                    const conHost = document.getElementById('constitution-editor');
                    if (conHost) {
                        conHost.querySelectorAll('input, button, textarea, select').forEach((el) => { el.disabled = true; });
                        conHost.classList.add('is-readonly');
                    }
                }

                const personalEditBtn = document.getElementById('btn-personal-edit');
                if (personalEditBtn) {
                    personalEditBtn.onclick = () => {
                        personalEditOn = true;
                        renderTabContent(customer);
                    };
                }

                // 見ているだけのときは、どの欄も動かさない。直すのは「編集する」から
                tabContentArea.querySelectorAll('.quick-edit-field').forEach(el => {
                    if (!personalEditOn) { el.style.cursor = 'default'; el.title = ''; return; }
                    el.onclick = (e) => {
                        // 既に編集中の場合は無視
                        if (el.querySelector('input') || el.querySelector('textarea')) return;
                        
                        const field = el.getAttribute('data-field');
                        if (field === 'soulColors') {
                            // 既に編集中の場合は無視
                            if (el.querySelector('.inline-color-editor')) return;
                            startSoulColorInlineEdit(el, customer);
                            return;
                        }
                        
                        startInlineEdit(el, field, customer);
                    };
                    
                    el.onmouseover = () => {
                        if (!el.querySelector('input') && !el.querySelector('textarea')) {
                            el.style.background = 'rgba(255,255,255,0.05)';
                            el.style.borderColor = 'rgba(255,255,255,0.1)';
                        }
                    };
                    el.onmouseout = () => {
                        el.style.background = 'transparent';
                        el.style.borderColor = 'transparent';
                    };
                });
                break;

            case 'color-star':
                renderColorStarTab(customer);
                break;
        }
    }

    /**
     * 「カラーと星」タブ。顧客のソウルカラーから担当天体とチャクラを引き、
     * 今日その天体がどのサインにいるかを添えて表示する。
     *
     * セラピスト側の参考情報という位置づけで、クライアントに見せる前提では作らない。
     * 精油は候補であって処方ではないため、必ず顧客の注意事項を隣に並べる。
     */
    function renderColorStarTab(customer) {
        const colors = getSoulColors(customer);

        if (colors.length === 0) {
            tabContentArea.innerHTML = '<p style="color: var(--text-secondary);">ソウルカラーが未登録です。「情報」タブから登録すると、担当する天体と施術部位が表示されます。</p>';
            return;
        }

        // このタブの読み方を、その場でデモから見られるようにする
        const starDemoRow = document.createElement('div');
        starDemoRow.className = 'tab-demo-row';
        starDemoRow.innerHTML = `<button type="button" id="btn-start-star-tour-inline"
            class="tab-demo-btn" title="カラーと星の読み方をデモで見る">💡 読み方をデモで見る</button>`;

        const entries = colors.map((key) => ({ key, corr: getCorrespondence(key) }));
        const known = entries.filter((e) => e.corr);

        if (known.length === 0) {
            tabContentArea.innerHTML = '<p style="color: var(--text-secondary);">登録されているカラーは対応表に載っていません（カラー設定で独自に追加した色の可能性があります）。</p>';
            return;
        }

        const CONFIDENCE_LABEL = {
            high: { mark: '◎', text: '複数の伝統資料が一致' },
            medium: { mark: '○', text: '主要資料が支持' },
            low: { mark: '△', text: '資料が割れるため暫定' }
        };

        // 注意事項は「病歴」「薬」から拾う。自動で精油を弾いたりはせず、
        // セラピストが判断できるよう並べて出すだけにとどめる。
        const { cautions, notes } = collectCustomerCautions(customer);

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display: flex; flex-direction: column; gap: 14px;';

        wrap.innerHTML = `
            <div style="font-size: 0.78rem; color: var(--text-secondary); background: rgba(255,255,255,0.04); border-left: 3px solid var(--accent-purple); padding: 8px 12px; border-radius: 6px; line-height: 1.6;">
                セラピスト用の参考情報です。象徴の対応づけであって、効能を示すものではありません。
                <strong style="color: var(--text-primary);">禁忌・既往歴の確認が常に優先されます。</strong>
            </div>
        `;

        // 5色には同じ色が入りうる（重複を許す方針）。同じ色相のカードを
        // そのまま並べると同じ内容が2枚出るので、1枚にまとめて枠の名前を併記する。
        const SLOT_LABELS = ['天格', '人格', '地格', '運命数', '誕生数'];
        const grouped = [];
        known.forEach(({ key, corr }, idx) => {
            const slot = SLOT_LABELS[idx] || `${idx + 1}色目`;
            const hit = grouped.find((g) => g.corr.hue === corr.hue);
            if (hit) { hit.slots.push(slot); return; }
            grouped.push({ key, corr, slots: [slot], firstIndex: idx });
        });

        grouped.forEach(({ key, corr, slots, firstIndex }) => {
            const isMain = firstIndex === 0;
            const conf = CONFIDENCE_LABEL[corr.confidence];
            const accent = isMain ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.18)';

            const card = document.createElement('div');
            card.className = 'color-star-card';
            card.style.cssText = `border: 1px solid ${accent}; border-radius: 14px; padding: ${isMain ? '16px' : '12px 14px'}; background: rgba(255,255,255,0.02);`;

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: ${isMain ? '12px' : '8px'};">
                    ${buildCustomerColorIndicatorHtml({ soulColors: [key] })}
                    <span style="font-weight: 700; font-size: ${isMain ? '1.05rem' : '0.9rem'}; color: var(--text-primary);">${escapeHtml(corr.hue)}</span>
                    <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; background: ${isMain ? 'rgba(0,242,254,0.15)' : 'rgba(255,255,255,0.06)'}; color: ${isMain ? 'var(--accent-cyan)' : 'var(--text-secondary)'}; font-weight: 600;">
                        ${isMain ? `メインカラー（${slots.join('・')}）` : slots.join('・')}
                    </span>
                    <span class="planet-moved-badge" data-planet-key="${corr.planetKey}" style="display: none;"></span>
                    <span title="${escapeHtml(conf.text)}｜${escapeHtml(corr.note)}" style="margin-left: auto; font-size: 0.72rem; color: var(--text-secondary); cursor: help;">
                        根拠 ${conf.mark}
                    </span>
                </div>
                <div class="planet-overlay" data-planet-key="${corr.planetKey}" data-chakra-area="${escapeHtml(corr.chakra.area)}" style="display: none;"></div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
                    <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px 12px;">
                        <span style="font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">担当する天体</span>
                        <span style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);"><span style="font-size: 1.25rem; line-height: 1; vertical-align: -2px;">${corr.planet.symbol}</span> ${escapeHtml(corr.planet.name)}</span>
                        <span class="planet-position" data-sign-key="${corr.planet.dataKey}" data-planet-key="${corr.planetKey}" style="display: block; font-size: 0.8rem; color: var(--accent-cyan); margin-top: 2px;">位置を読み込み中…</span>
                        <span class="planet-part" style="display: none; font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px;"></span>
                        <span style="display: block; font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(corr.planet.theme)}</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px 12px;">
                        <span style="font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">いつもの施術部位（チャクラ）</span>
                        <span style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${escapeHtml(corr.chakra.name)}</span>
                        <span style="display: block; font-size: 0.8rem; color: var(--accent-cyan); margin-top: 2px;">${escapeHtml(corr.chakra.area)}</span>
                        <span style="display: block; font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(corr.chakra.theme)}</span>
                    </div>
                </div>

                <div style="margin-top: 10px; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px 12px;">
                    <span style="font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 6px;">
                        この天体の精油（候補）${corr.planet.modern ? '<span style="opacity:0.75;">／近代天体のため伝統的な割当なし。意味の近い天体から借用</span>' : ''}
                    </span>
                    <span style="font-size: 0.9rem; color: var(--text-primary); font-weight: 500;">${corr.planet.oils.map(escapeHtml).join(' ／ ')}</span>
                </div>
            `;
            wrap.appendChild(card);
        });

        const cautionRow = (row) => `<p style="font-size: 0.85rem; color: var(--text-primary); line-height: 1.7; margin: 0 0 4px 0;">`
            + `<span style="color: var(--text-secondary); font-size: 0.78rem;">${escapeHtml(row.label)}:</span> `
            + `${escapeHtml(row.text)}</p>`;

        if (cautions.length > 0) {
            const caution = document.createElement('div');
            caution.style.cssText = 'border: 1px solid #ff5252; background: rgba(255, 82, 82, 0.08); border-radius: 12px; padding: 12px 14px;';
            caution.innerHTML = `
                <div style="font-size: 0.8rem; font-weight: 700; color: #ff5252; margin-bottom: 6px;">⚠️ この方の注意事項（精油の候補より優先）</div>
                ${cautions.map(cautionRow).join('')}
            `;
            wrap.appendChild(caution);
        }

        // 注意事項ではないもの。同じ赤い枠に入れると、本当の注意が埋もれる。
        if (notes.length > 0) {
            const note = document.createElement('div');
            note.style.cssText = 'border: 1px solid var(--border-glass); background: rgba(255,255,255,0.03); border-radius: 12px; padding: 12px 14px;';
            note.innerHTML = `
                <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px;">📝 カルテのメモ（注意事項ではありません）</div>
                ${notes.map(cautionRow).join('')}
                <p style="font-size: 0.72rem; color: var(--text-secondary); margin: 6px 0 0 0;">${escapeHtml(cautionSourceHint(cautions.length > 0))}</p>
            `;
            wrap.appendChild(note);
        }

        wrap.appendChild(starDemoRow);
        // このボタンはタブを開くたびに作り直されるので、ここで繋ぐ
        const starDemoBtn = starDemoRow.querySelector('#btn-start-star-tour-inline');
        if (starDemoBtn) {
            starDemoBtn.addEventListener('click', () => runTour(starTourBody, STAR_TOUR_STEPS));
        }

        // 下ごしらえ（来店前のAI提案）はここには置かない。
        // 提案は「いつの分か」で内容が変わるが、このタブは日付を持たない。
        // 予約カード側（カレンダー）に置き、その予約日で計算している。

        tabContentArea.innerHTML = '';
        tabContentArea.appendChild(wrap);

        // 天体の位置は後追いで埋める。
        //  ・いまの星座 → 星詠みの保存ファイル
        //  ・前回来店時の星座 → イングレス表（ブラウザに天文計算がないため）
        const lastVisit = (customer.records || [])
            .map((r) => r.date)
            .filter(Boolean)
            .sort()
            .pop() || null;

        Promise.all([getTodayPlanets(), getIngressTable()]).then(([planets, ingress]) => {
            wrap.querySelectorAll('.planet-position').forEach((el) => {
                const sign = planets && planets[el.dataset.signKey];
                el.textContent = sign ? `いま【${sign}】` : '位置を取得できませんでした';
                if (!sign) el.style.color = 'var(--text-secondary)';
            });

            wrap.querySelectorAll('.planet-part').forEach((el) => {
                const posEl = el.parentElement.querySelector('.planet-position');
                const sign = planets && planets[posEl.dataset.signKey];
                const part = sign && SIGN_BODY_PARTS[sign];
                if (!part) return;
                el.textContent = `→ ${part}`;
                el.style.display = 'block';
            });

            // 前回来店時から星座が変わっているか
            const prevSignOf = (planetKey) => (lastVisit ? findSignAt(ingress, planetKey, lastVisit) : null);

            wrap.querySelectorAll('.planet-moved-badge').forEach((el) => {
                const key = el.dataset.planetKey;
                const now = planets && planets[PLANET_DEFS[key] && PLANET_DEFS[key].dataKey];
                const prev = prevSignOf(key);
                if (!now || !prev || now === prev) return;
                el.textContent = '★ 前回から動きました';
                el.className = 'planet-moved-badge is-moved';
                el.style.display = 'inline-block';
            });

            // 「いつもの部位」と「いまの部位」を1文で並べる
            wrap.querySelectorAll('.planet-overlay').forEach((el) => {
                const key = el.dataset.planetKey;
                const now = planets && planets[PLANET_DEFS[key] && PLANET_DEFS[key].dataKey];
                const nowPart = now && SIGN_BODY_PARTS[now];
                if (!nowPart) return;

                const base = el.dataset.chakraArea;
                const prev = prevSignOf(key);
                const prevPart = prev && SIGN_BODY_PARTS[prev];

                let text = `軸は<strong>${escapeHtml(base)}</strong>。いまは<strong>${escapeHtml(nowPart)}</strong>が重なります。`;
                if (prev && now !== prev && prevPart) {
                    text += `<span class="planet-overlay-prev">前回来店時（${escapeHtml(lastVisit)}）は${escapeHtml(prev)}＝${escapeHtml(prevPart)}でした。</span>`;
                }
                el.innerHTML = text;
                el.style.display = 'block';
            });
        });
    }

    // ------------------------------------------------------------------
    // セッション提案（AI）
    //
    // 星詠みと違い、顧客ごと・その場で生成する。禁忌の判定はここ（ブラウザ側）で
    // 済ませ、サーバーには「使ってよい候補」だけを渡す。AIには除外の判断をさせない。
    // ------------------------------------------------------------------

    /** 提案リクエストの中身を組み立てる。禁忌の除外はこの中で行う。 */
    function buildSessionContext(customer, mode, extra = {}) {
        const colors = getSoulColors(customer);
        const seenPlanet = new Set();
        const colorCtx = [];
        const oilNames = [];

        colors.forEach((key) => {
            const corr = getCorrespondence(key);
            if (!corr || seenPlanet.has(corr.planetKey)) return;
            seenPlanet.add(corr.planetKey);
            colorCtx.push({
                hue: corr.hue,
                planet: corr.planet.name,
                planetKey: corr.planetKey,
                dataKey: corr.planet.dataKey,
                chakraArea: corr.chakra.area
            });
            corr.planet.oils.forEach((o) => { if (!oilNames.includes(o)) oilNames.push(o); });
        });

        const filtered = filterOils(oilNames, customer);
        const carriers = filterCarrierOils(customer);
        const constitution = getConstitution(customer);

        // 経過は直近3件まで。多すぎると要点がぼやける。
        const history = (customer.records || []).slice(0, 3).map((r) => ({
            date: r.date,
            complaint: r.clientComplaint,
            prescription: r.prescription,
            note: r.therapistNote,
            colors: (r.colors || []).map(getSoulColorName).join('・')
        }));

        return {
            mode,
            colors: colorCtx,
            allowedOils: [...filtered.ok, ...filtered.care].map((o) => ({
                oil: o.oil, cares: o.cares, notes: o.notes, maxDilution: o.maxDilution
            })),
            excludedOils: filtered.avoid.map((o) => ({ oil: o.oil, reasons: o.reasons })),
            // キャリアオイルも同じ考え方で、使えるものだけを渡す。
            // ナッツやキク科のアレルギーは基材のほうに出るため、精油だけ見ても足りない。
            carrierOils: carriers.allowed.map((o) => ({ oil: o.oil, note: (o.notes || []).join(' / ') })),
            excludedCarriers: carriers.excluded.map((o) => ({ oil: o.oil, reasons: o.reasons })),
            // 「その他」に書かれたもの。自動では除外できないので、
            // 判断させるのではなく申し送りとしてそのまま渡す。
            freeTextCautions: getFreeTextCautions(customer),
            history,
            maxDilution: constitution.maxDilution,
            ...extra
        };
    }

    /**
     * 提案を取得する。
     *
     * targetDate はその提案が向いている日（予約日）。天体の位置はこの日で引く。
     * 以前は常に今日で計算しており、先の予約の下ごしらえを作っても
     * 今日の星になっていた。イングレス表は先の日付も引けるので、
     * 予約日をそのまま渡す。
     */
    async function requestSessionAdvice(customer, mode, extra = {}) {
        const { targetDate, ...rest } = extra;
        const ctx = buildSessionContext(customer, mode, rest);
        if (ctx.allowedOils.length === 0) {
            throw new Error('使用できる精油の候補がありません。ソウルカラーと体質の設定をご確認ください。');
        }

        const forDate = targetDate || toDateStr(new Date());
        const [todayPlanets, ingress] = await Promise.all([getTodayPlanets(), getIngressTable()]);

        // 対象日より前で一番新しい来店日。前回からの動きを見るために使う。
        const prevVisit = (customer.records || [])
            .map((r) => r.date)
            .filter((d) => d && d < forDate)
            .sort()
            .pop() || null;

        ctx.targetDate = forDate;
        ctx.colors = ctx.colors.map((c) => {
            // イングレス表から対象日の星座を引く。表の範囲外なら今日の値で代用する。
            const now = findSignAt(ingress, c.planetKey, forDate)
                || (todayPlanets && todayPlanets[c.dataKey]);
            const prev = prevVisit ? findSignAt(ingress, c.planetKey, prevVisit) : null;
            return {
                hue: c.hue,
                planet: c.planet,
                planetSign: now || '不明',
                signBodyPart: now ? SIGN_BODY_PARTS[now] : null,
                chakraArea: c.chakraArea,
                movedFrom: prev && now && prev !== now ? prev : null
            };
        });

        const headers = { 'Content-Type': 'application/json', ...providerHeader() };
        const apiKey = getStoredApiKey();
        if (apiKey) headers['x-api-key'] = apiKey;

        try {
            const res = await fetch('/api/session-advice', {
                method: 'POST', headers, body: JSON.stringify(ctx)
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            return { data, ctx };
        } catch (err) {
            // サーバーが無い場所（静的配信・共有リンク・出先の端末）。
            // 自分のAPIキーが入っていれば、ブラウザから直接生成する。
            if (apiKey) {
                // ai-client.js が、どのキーがどう失敗したかを添えて投げてくる。
                // ここでは握りつぶさず、そのまま画面へ出す。
                const data = await generateAdviceInBrowser(ctx);
                return { data, ctx };
            }
            // キーも無い場合。サンプル顧客なら事前生成のデモ文があるので、
            // それと分かる形で見せる。
            const demo = await findDemoAdvice(ctx);
            if (demo) return { data: { ...demo, isDemo: true }, ctx };
            throw new Error('生成サーバーに接続できませんでした。'
                + 'サロンのPCでアプリを起動するか、「🎨 カラー設定」でご自分のAPIキー（Anthropic / Gemini）を登録してください。');
        }
    }

    /**
     * ブラウザから直接AIを呼んで提案を作る。
     * プロンプトはサーバーと同じ session-prompt.js で組む（文面を揃えるため）。
     * 禁忌の除外は呼び出し元で済んでいるので、ここでは何も緩めない。
     */
    async function generateAdviceInBrowser(ctx) {
        const { prompt, systemInstruction } = buildSessionPrompt(ctx);
        // キーは ai-client.js が登録順に試す（1件だめでも次へ進む）
        const result = await generateWithOwnKey({ prompt, systemInstruction });
        return {
            advice: result.text,
            mode: ctx.mode,
            usedModel: result.usedModel,
            usedProvider: result.usedProvider,
            fallbackFrom: [],
            viaOwnKey: true,
            truncated: Boolean(result.truncated),
            generatedAtISO: new Date().toISOString()
        };
    }

    // デモ用の事前生成（scripts/generate-demo-advice.js が作る）
    let demoAdvicePromise = null;
    function getDemoAdvice() {
        if (!demoAdvicePromise) {
            demoAdvicePromise = fetch('data/demo/session-advice.json', { cache: 'no-cache' })
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null);
        }
        return demoAdvicePromise;
    }

    /** 鍵はモードと色相の並び。サンプルと同じ並びでなければ一致しない。 */
    async function findDemoAdvice(ctx) {
        const store = await getDemoAdvice();
        if (!store || !store.entries) return null;
        return store.entries[`${ctx.mode}:${ctx.colors.map((c) => c.hue).join('/')}`] || null;
    }

    /** 提案の結果を描画する（除外した精油も理由つきで見せる） */
    function renderSessionAdvice(host, data, ctx) {
        const excluded = ctx.excludedOils.length > 0
            ? `<div class="session-advice-excluded">
                   <strong>体質により除外した精油</strong>
                   ${ctx.excludedOils.map((o) => `<span>${escapeHtml(o.oil)}（${escapeHtml((o.reasons || []).join('・'))}）</span>`).join('')}
               </div>`
            : '';

        host.innerHTML = `
            <div class="session-advice-result">
                <div class="advice-markdown">${renderMarkdown(data.advice)}</div>
                ${excluded}
                ${data.isDemo ? `
                    <div class="session-advice-demo">
                        デモ表示です。この環境では生成サーバーに接続できないため、
                        サンプル顧客向けに<strong>あらかじめ生成しておいた例</strong>を表示しています。
                        （生成日時 ${escapeHtml((data.generatedAtISO || '').slice(0, 10))}）
                    </div>` : ''}
                ${data.truncated ? `<div class="session-advice-truncated">
                    ⚠ 出力の上限に達したため、途中で切れています。もう一度作ると最後まで出ることがあります。
                </div>` : ''}
                <div class="session-advice-meta">
                    ${escapeHtml(data.usedProvider || '')} ／ ${escapeHtml(data.usedModel || '')}
                    ${data.viaOwnKey ? '（ご自分のAPIキーで生成）' : ''}
                    ${Array.isArray(data.fallbackFrom) && data.fallbackFrom.length > 0
                        ? `（${escapeHtml(data.fallbackFrom.join('・'))}が使えずフォールバック）` : ''}
                    ・提案であって処方ではありません。判断はセラピストが行ってください。
                </div>
            </div>
        `;
    }

    // ------------------------------------------------------------------
    // 下ごしらえをカルテへ落とす
    //
    // 出した提案が画面を閉じると消えていたので、予約記録に保存し、
    // 処方欄・施術者メモ欄へそのまま入れる。
    //
    // 訴え（clientComplaint）だけは入れない。あれはクライアント自身の
    // 言葉であって、AIが埋めてよい欄ではない。
    // ------------------------------------------------------------------

    /** 提案の本文を「### 見出し」ごとに分ける（プロンプトで見出しを固定している） */
    function splitAdviceSections(md) {
        const out = {};
        if (!md) return out;
        let key = null;
        let buf = [];
        const flush = () => { if (key) out[key] = buf.join('\n').trim(); buf = []; };
        String(md).split('\n').forEach((line) => {
            const m = line.match(/^\s*#{2,4}\s*(.+?)\s*$/);
            if (m) { flush(); key = m[1]; return; }
            if (key) buf.push(line);
        });
        flush();
        return out;
    }

    /** 施術者メモへ入れる見出し（この順で並べる） */
    const PREP_NOTE_SECTIONS = ['今日の見立て', '部位の配分', '確認したいこと'];

    /** 提案の本文から、処方欄とメモ欄に入れる文章を作る */
    function buildPrepDraft(advice) {
        const sec = splitAdviceSections(advice);
        const note = PREP_NOTE_SECTIONS
            .filter((k) => sec[k])
            .map((k) => `【${k}】\n${sec[k]}`)
            .join('\n\n');
        return { prescription: sec['精油の組み立て'] || '', therapistNote: note };
    }

    /** 「8/3 16:05」の形。いつ作ったものかが一目で分かればよい */
    function formatPrepStamp(iso) {
        const d = iso ? new Date(iso) : null;
        if (!d || isNaN(d.getTime())) return '以前';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    /**
     * 生成した提案を記録へ保存し、空いている欄へ書き入れる。
     * 来店前（訴えなし）でも問診後（訴えあり）でも、入る先は同じ。
     *
     * すでにセラピストが書いている欄は上書きしない。差し替えるかどうかは
     * 本人に選ばせる（黙って消すと取り返しがつかない）。
     *
     * @param current 画面で編集中の値。カルテを開いた状態なら、保存済みの値では
     *                なくそちらが「いま書かれているもの」なので、判断はこれで行う。
     * @param record  null なら未保存の新規記録。保存はせず、入れる文面だけ返す。
     */
    function applyAdviceToRecord(customerId, record, data, ctx, { force = false, current = null } = {}) {
        const draft = buildPrepDraft(data.advice);
        const generatedAtISO = data.generatedAtISO || new Date().toISOString();
        const base = current || record || {};
        const fields = {
            prepAdvice: {
                advice: data.advice,
                usedProvider: data.usedProvider || '',
                usedModel: data.usedModel || '',
                viaOwnKey: Boolean(data.viaOwnKey),
                truncated: Boolean(data.truncated),
                generatedAtISO,
                excludedOils: (ctx && ctx.excludedOils) || []
            }
        };

        const filled = [];
        const skipped = [];
        const values = {};
        const consider = (key, label, value) => {
            if (!value) return;
            if (force || !String(base[key] || '').trim()) {
                fields[key] = value;
                values[key] = value;
                filled.push(label);
            } else {
                skipped.push(label);
            }
        };
        consider('prescription', '処方', draft.prescription);
        consider('therapistNote', '施術者メモ', draft.therapistNote);

        if (filled.length > 0) fields.prepFilledAt = generatedAtISO;
        if (record) {
            const updated = updateRecord(customerId, record.id, fields);
            // 呼び出し元が持っている record は古いままなので、書き戻しておく
            if (updated) Object.assign(record, updated);
        }
        return { filled, skipped, draft, values };
    }

    /** 書き込みの結果を提案の下に出す。上書きしなかった欄には差し替えボタンを添える */
    function renderPrepApplied(host, result, onReplace, { persist = true } = {}) {
        const box = document.createElement('div');
        box.className = 'prep-applied';
        const parts = [];
        if (result.filled.length > 0) {
            parts.push(`<div class="prep-applied-ok">✓ ${escapeHtml(result.filled.join('・'))}に入れました。${persist
                ? '内容を確認して、必要なら書き直してください。'
                : 'まだ保存はしていません。残すには「更新する」を押してください。'}</div>`);
        }
        if (result.skipped.length > 0) {
            parts.push(`<div class="prep-applied-skip">
                ${escapeHtml(result.skipped.join('・'))}はすでに記入があるため、そのままにしました。
                <button type="button" class="prep-replace-btn">下ごしらえで差し替える</button>
            </div>`);
        }
        if (parts.length === 0) return;
        box.innerHTML = parts.join('');
        host.appendChild(box);

        const replaceBtn = box.querySelector('.prep-replace-btn');
        if (replaceBtn && onReplace) {
            replaceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirmModal({
                    title: '下ごしらえで差し替えますか？',
                    message: `${result.skipped.join('・')}に書かれている内容は消えます。この操作は取り消せません。`,
                    actionText: '差し替える',
                    icon: '📝',
                    onConfirm: onReplace
                });
            });
        }
    }

    /**
     * 体質の入力パネル。
     *
     * 初回カウンセリングの自由記述はそのまま残し、こちらは判定用のフラグだけを持つ。
     * ここに入れた内容が精油の提案から機械的に除外される根拠になるので、
     * 「何が除外されるか」をその場で見せて、入力の意味が分かるようにしている。
     */
    /** 自由入力の一覧。押すと外せる */
    function renderFreeChips(items, kind) {
        if (!items || items.length === 0) return '';
        return `<div class="free-chip-row">
            ${items.map((t) => `<button type="button" class="free-chip" data-free-kind="${kind}"
                data-free-text="${escapeHtml(t)}" title="押すと外します">
                ${escapeHtml(t)}<span class="free-chip-x">×</span></button>`).join('')}
        </div>`;
    }

    /**
     * 「その他」の追記欄。体質とアレルギーの、それぞれのすぐ下に置く。
     * 書く場所が離れていると、どちらに足したのか分からなくなる。
     */
    function renderFreeBlock(kind, items, placeholder) {
        return `
            <div class="constitution-free" data-free-block="${kind}">
                <span class="constitution-free-label">その他（一覧に無いもの）</span>
                ${renderFreeChips(items, kind)}
                <div class="constitution-free-add">
                    <input type="text" class="free-input" data-free-kind="${kind}"
                           list="free-suggest-${kind}" placeholder="${escapeHtml(placeholder)}">
                    <datalist id="free-suggest-${kind}"></datalist>
                    <button type="button" class="free-add-btn" data-free-kind="${kind}">追加</button>
                </div>
                <div class="constitution-free-warn">
                    ⚠ ここに書いたものは<strong>自動では除外されません</strong>。申し送りとして表示し、AIにも注意として伝えます。
                </div>
            </div>`;
    }

    /**
     * キャリアオイル（基材）の可否。
     *
     * ナッツやキク科のアレルギーは精油ではなく基材のほうに出る。
     * これまではAIへ渡す文章の中だけで効いていたので、AIを使わない日には
     * その判断がどこにも出てこなかった。外したものを先に、目に入る形で置く。
     */
    function renderCarrierOilsHtml(customer) {
        const { allowed, excluded } = filterCarrierOils(customer);
        const chip = (name, kind) =>
            `<span class="carrier-chip chip-${kind}">${escapeHtml(name)}</span>`;

        // 外したものは理由ごとにまとめる。「なぜ外れたか」が一目で分かる形にする
        const byReason = new Map();
        excluded.forEach((o) => {
            const key = (o.reasons || []).join('・') || 'アレルギー';
            if (!byReason.has(key)) byReason.set(key, []);
            byReason.get(key).push(o.oil);
        });

        return `
            <div class="constitution-section carrier-section">
                <span class="constitution-section-title">キャリアオイル（基材）</span>
                ${excluded.length === 0
                    ? `<div class="carrier-none">いまの登録では、${allowed.length}種すべて使えます。</div>`
                    : `<div class="carrier-avoid">
                          <div class="carrier-avoid-head">⛔ 使わない基材</div>
                          ${[...byReason.entries()].map(([reason, oils]) => `
                              <div class="carrier-avoid-row">
                                  <span class="carrier-reason">${escapeHtml(reason)}</span>
                                  ${oils.map((o) => chip(o, 'avoid')).join('')}
                              </div>`).join('')}
                       </div>`}
                ${excluded.length === 0 ? '' : `
                    <details class="carrier-ok-panel">
                        <summary>使える基材（${allowed.length}種）</summary>
                        <div class="carrier-ok-list">${allowed.map((o) => chip(o.oil, 'ok')).join('')}</div>
                    </details>`}
                <div class="carrier-note">
                    上の「アレルギー（科名）」から決まります。AIの提案にも、使える基材だけが渡ります。
                </div>
            </div>`;
    }

    /**
     * 精油の可否。キャリアオイルと同じ考え方で出す。
     *
     * 判定そのものは前からあったが、結果が見えるのは星タブとAIの提案文
     * だけだった。AIを使わない日には、この方に何を使わないのかがどこにも
     * 出てこない。ここに置く。
     *
     * 対象は安全データのある精油すべて。星タブは天体に紐づいた分しか
     * 出さないが、在庫から手に取るときは天体を経由しない。
     */
    function renderOilSafetyHtml(customer) {
        const all = Object.keys(OIL_SAFETY);
        const { ok, care, avoid } = filterOils(all, customer);
        const chip = (name, kind) =>
            `<span class="carrier-chip chip-${kind}">${escapeHtml(name)}</span>`;

        const byReason = new Map();
        avoid.forEach((o) => {
            const key = (o.reasons || []).join('・') || '体質';
            if (!byReason.has(key)) byReason.set(key, []);
            byReason.get(key).push(o.oil);
        });

        return `
            <div class="constitution-section carrier-section">
                <span class="constitution-section-title">精油</span>
                ${avoid.length === 0
                    ? `<div class="carrier-none">いまの登録では、${all.length}種すべて使えます。</div>`
                    : `<div class="carrier-avoid">
                          <div class="carrier-avoid-head">⛔ 使わない精油（${avoid.length}種）</div>
                          ${[...byReason.entries()].map(([reason, oils]) => `
                              <div class="carrier-avoid-row">
                                  <span class="carrier-reason">${escapeHtml(reason)}</span>
                                  ${oils.map((o) => chip(o, 'avoid')).join('')}
                              </div>`).join('')}
                       </div>`}
                ${care.length === 0 ? '' : `
                    <details class="carrier-ok-panel oil-care-panel">
                        <summary>△ 注意して使う精油（${care.length}種）</summary>
                        <div class="oil-care-list">
                            ${care.map((o) => `<div class="oil-care-row">
                                ${chip(o.oil, 'care')}
                                <span class="oil-care-why">${escapeHtml(
                                    [...(o.cares || []), ...(o.notes || [])].filter(Boolean).join(' / '))}</span>
                            </div>`).join('')}
                        </div>
                    </details>`}
                ${ok.length === 0 ? '' : `
                    <details class="carrier-ok-panel">
                        <summary>そのまま使える精油（${ok.length}種）</summary>
                        <div class="carrier-ok-list">${ok.map((o) => chip(o.oil, 'ok')).join('')}</div>
                    </details>`}
                <div class="carrier-note">
                    上の体質とアレルギーから決まります。AIの提案にも、使える精油だけが渡ります。
                </div>
            </div>`;
    }

    /**
     * 「この方のこと」をまとめて直す画面。
     *
     * 書き込むのは「保存する」を押したときの1回だけ。それまでは画面の中だけで
     * 持っておく（体質・アレルギーも、Soul Color も）。保存に失敗したら、
     * 画面を閉じずにそのまま残し、失敗したことをはっきり出す。
     */
    function renderPersonalEditForm(customer) {
        const intake = customer.intake || {};
        let conDraft = customer.constitution || null;
        let colorDraft = [...getSoulColors(customer)];

        const text = (id, label, value, opts = {}) => `
            <div class="form-group pe-field${opts.wide ? ' pe-wide' : ''}">
                <label for="${id}">${escapeHtml(label)}</label>
                <input id="${id}" class="form-control" type="${opts.type || 'text'}"
                       value="${escapeHtml(value == null ? '' : String(value))}"
                       ${opts.attrs || ''}>
                ${opts.after || ''}
            </div>`;
        const area = (id, label, value) => `
            <div class="form-group pe-field pe-wide">
                <label for="${id}">${escapeHtml(label)}</label>
                <textarea id="${id}" class="form-control" rows="3">${escapeHtml(value == null ? '' : String(value))}</textarea>
            </div>`;

        tabContentArea.innerHTML = `
            <div class="personal-info-bar">
                <span class="personal-info-title">👤 この方のこと（編集中）</span>
                <button type="button" id="btn-pe-save-top" class="personal-info-edit pe-save">💾 保存する</button>
            </div>
            <form id="personal-edit-form" class="pe-form" autocomplete="off" onsubmit="return false;">
                <div class="pe-grid">
                    ${text('pe-name', '氏名（必須）', customer.name)}
                    ${text('pe-nickname', 'ニックネーム（任意）', customer.nickname)}
                    ${text('pe-kana', 'カナ', customer.kana)}
                    ${text('pe-customer-no', '顧客No.（同じ番号は使えません）', customer.customerNo, {
                        attrs: 'autocapitalize="characters" spellcheck="false"',
                        after: '<small id="pe-customer-no-hint" class="pe-hint" aria-live="polite"></small>'
                    })}
                    ${text('pe-phone', '電話番号', customer.phone, { type: 'tel' })}
                    ${text('pe-birthday', '生年月日', customer.birthday, { type: 'date' })}
                    ${text('pe-referrer', '紹介者', customer.referrer)}
                </div>
                <div class="pe-field pe-wide">
                    <span class="pe-label">Soul Color</span>
                    <div class="quick-edit-field pe-colors" id="pe-colors" title="押すと色を選べます">
                        <div class="field-value" id="pe-colors-view"></div>
                    </div>
                </div>
                <div id="constitution-editor"></div>
                <h4 class="intake-head">初診</h4>
                ${area('pe-intake-personal', '❤️ Personal', intake.personal)}
                ${area('pe-intake-reasonGoal', '❤️ Reason & Gole', intake.reasonGoal)}
                ${area('pe-intake-family', '❤️ 家族構成', intake.family)}
                ${area('pe-intake-history', '❤️ 病歴', intake.history)}
                ${area('pe-intake-medication', '❤️ 薬', intake.medication)}
                ${area('pe-initial', '❤️ memo', customer.initialConsultation)}
                ${area('pe-memo', '特記事項・メモ', customer.memo)}
            </form>
            <div class="pe-save-bar">
                <button type="button" id="btn-pe-cancel" class="pe-cancel">やめる</button>
                <button type="button" id="btn-pe-save" class="btn-primary pe-save-main">💾 保存する</button>
            </div>
        `;

        const $ = (id) => document.getElementById(id);
        let dirty = false;
        const form = $('personal-edit-form');
        if (form) {
            form.addEventListener('input', () => { dirty = true; });
            form.addEventListener('change', () => { dirty = true; });
        }

        // Soul Color：選んでも保存はしない。「保存する」でまとめて書く
        const paintColors = () => {
            const view = $('pe-colors-view');
            if (view) view.innerHTML = colorDraft.filter((c) => c && c !== 'clear').length
                ? buildSoulColorBadgeHtml(colorDraft, 'sm') + '<span class="pe-colors-tip">押すと選び直せます</span>'
                : '<span class="pe-colors-tip">未設定（押して選ぶ）</span>';
        };
        paintColors();
        const colorsBox = $('pe-colors');
        if (colorsBox) {
            colorsBox.onclick = () => {
                if (colorsBox.querySelector('.inline-color-editor')) return;
                startSoulColorInlineEdit(colorsBox, { ...customer, soulColors: colorDraft }, (picked) => {
                    colorDraft = picked;
                    dirty = true;
                    paintColors();
                });
            };
        }

        // 体質・アレルギー：チェックしても保存はしない。下書きに持つ
        const conHost = $('constitution-editor');
        const mountCon = () => {
            if (!conHost) return;
            mountConstitutionEditor(conHost, conDraft, (next) => {
                conDraft = next;
                dirty = true;
                mountCon();
            });
        };
        mountCon();

        // 顧客No.：打っている間に重なりを知らせる
        const noEl = $('pe-customer-no');
        const noHint = $('pe-customer-no-hint');
        const checkNo = () => {
            const v = normalizeCustomerNo(noEl ? noEl.value : '');
            let problem = null;
            if (!v) problem = '顧客No. を空にはできません。';
            else {
                const owner = findCustomerNoOwner(v, customer.id);
                if (owner) problem = `${v} はすでに ${owner.name || '別の方'} 様${owner.isArchived ? '（保管中）' : ''}が使っています。`;
            }
            if (noHint) noHint.textContent = problem ? `⚠ ${problem}` : '';
            if (noEl) noEl.classList.toggle('is-invalid', Boolean(problem));
            return problem;
        };
        if (noEl) noEl.addEventListener('input', checkNo);

        const val = (id) => { const el = $(id); return el ? el.value : ''; };

        const save = () => {
            const name = val('pe-name').trim();
            if (!name) {
                showToast('氏名は必須です。', 'error');
                const el = $('pe-name'); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
                return;
            }
            const noProblem = checkNo();
            if (noProblem) {
                showToast(noProblem, 'error');
                if (noEl) { noEl.focus(); noEl.scrollIntoView({ block: 'center' }); }
                return;
            }
            // 体質・アレルギーの「その他」に打ちかけて、追加を押し忘れたものも拾う
            if (conHost) {
                const pending = [];
                conHost.querySelectorAll('[data-free-block]').forEach((block) => {
                    const inp = block.querySelector('.free-input');
                    if (inp && inp.value.trim()) pending.push([block.dataset.freeBlock, inp.value.trim()]);
                });
                if (pending.length) {
                    const cur = getConstitution({ constitution: conDraft });
                    const next = {
                        flags: { ...cur.flags }, allergies: [...cur.allergies], maxDilution: cur.maxDilution,
                        otherAllergies: [...cur.otherAllergies], otherFlags: [...cur.otherFlags]
                    };
                    pending.forEach(([kind, t]) => {
                        const k = kind === 'flag' ? 'otherFlags' : 'otherAllergies';
                        if (!next[k].includes(t)) next[k].push(t);
                    });
                    conDraft = next;
                }
            }

            const birthday = val('pe-birthday');
            const update = {
                name,
                nickname: val('pe-nickname').trim(),
                kana: val('pe-kana'),
                customerNo: normalizeCustomerNo(val('pe-customer-no')),
                phone: val('pe-phone'),
                birthday,
                referrer: val('pe-referrer'),
                soulColors: colorDraft,
                initialConsultation: val('pe-initial'),
                memo: val('pe-memo'),
                intake: {
                    ...intake,
                    personal: val('pe-intake-personal'),
                    reasonGoal: val('pe-intake-reasonGoal'),
                    family: val('pe-intake-family'),
                    history: val('pe-intake-history'),
                    medication: val('pe-intake-medication')
                }
            };
            if (birthday) update.birthMonth = birthday.split('-')[1];
            if (conDraft) update.constitution = conDraft;

            const saved = updateCustomer(customer.id, update);
            const err = getLastSaveError();
            if (!saved || err) {
                // 保存できていない。画面は閉じずに残す（打ったものを失わないため）
                showToast(`⚠ 保存できませんでした。${err ? err.message : ''}`, 'error');
                return;
            }
            personalEditOn = false;
            showToast(`${name} 様の情報を保存しました`, 'success');
            showCustomerDetail(customer.id);
        };

        const cancel = () => {
            if (dirty && !confirm('保存していない変更があります。保存せずにやめますか？')) return;
            personalEditOn = false;
            closeActiveEditor();
            renderTabContent(getCustomers().find((c) => c.id === customer.id) || customer);
        };

        ['btn-pe-save', 'btn-pe-save-top'].forEach((id) => { const b = $(id); if (b) b.onclick = save; });
        const c = $('btn-pe-cancel'); if (c) c.onclick = cancel;
    }

    /** カルテ側。保存済みの顧客に直接書く */
    function renderConstitutionEditor(customer) {
        const host = document.getElementById('constitution-editor');
        if (!host) return;
        mountConstitutionEditor(host, customer.constitution, (next) => {
            updateCustomer(customer.id, { constitution: next });
            const fresh = getCustomers().find((c) => String(c.id) === String(customer.id));
            renderConstitutionEditor(fresh || customer);
        });
    }

    /**
     * 体質・アレルギーの入力欄。
     *
     * 顧客登録の画面でも使うので、保存済みの顧客に縛らない。いまの値と
     * 「変わったときに呼ぶもの」を渡す形にしてある。登録の時点ではまだ
     * 顧客が存在しないため、書き込み先を外から決められる必要がある。
     *
     * @param host      描画先
     * @param value     いまの constitution（未設定なら null / undefined）
     * @param onChange  変わったときに呼ばれる。新しい constitution が渡る
     */
    function mountConstitutionEditor(host, value, onChange) {
        const customer = { constitution: value };
        const current = getConstitution(customer);
        const isSet = hasConstitutionData(customer);
        // 保存のたびに描き直すので、開いていたら開いたままにする
        const wasOpen = host.querySelector('.constitution-panel')?.open;

        const save = (patch) => {
            onChange({
                flags: { ...current.flags },
                allergies: [...current.allergies],
                maxDilution: current.maxDilution,
                otherAllergies: [...current.otherAllergies],
                otherFlags: [...current.otherFlags],
                ...patch
            });
        };

        const activeFlags = CONSTITUTION_FLAGS.filter((f) => current.flags[f.key]);
        const summary = isSet
            ? (activeFlags.length > 0
                ? activeFlags.map((f) => f.label).join('・')
                    + (current.maxDilution ? ` ／ 希釈上限 ${current.maxDilution}%` : '')
                : '該当なし')
            : '未設定';

        host.innerHTML = `
            <details class="constitution-panel"${(wasOpen ?? !isSet) ? ' open' : ''}>
                <summary>
                    <span>体質（精油の提案に反映されます）</span>
                    <span class="constitution-status${activeFlags.length > 0 ? ' has-flags' : ''}">${escapeHtml(summary)}</span>
                </summary>
                <div class="constitution-body">
                    <div class="constitution-grid">
                        ${CONSTITUTION_FLAGS.map((f) => `
                            <label class="constitution-check" title="${escapeHtml(f.hint)}">
                                <input type="checkbox" data-flag="${f.key}"${current.flags[f.key] ? ' checked' : ''}>
                                <span>${escapeHtml(f.label)}</span>
                            </label>`).join('')}
                    </div>
                    ${renderFreeBlock('flag', current.otherFlags, '例: 低体温、不眠')}

                    <div class="constitution-section">
                        <span class="constitution-section-title">アレルギー（科名）</span>
                        <div class="constitution-grid">
                            ${ALLERGY_FAMILIES.map((a) => `
                                <label class="constitution-check">
                                    <input type="checkbox" data-allergy="${a.key}"${current.allergies.includes(a.key) ? ' checked' : ''}>
                                    <span>${escapeHtml(a.label)}</span>
                                </label>`).join('')}
                        </div>
                    </div>
                    ${renderFreeBlock('allergy', current.otherAllergies, '例: そば、小麦')}
                    ${renderOilSafetyHtml(customer)}
                    ${renderCarrierOilsHtml(customer)}

                    <div class="constitution-row">
                        <span class="constitution-label">希釈の上限</span>
                        <input type="number" class="constitution-dilution" min="0.1" max="5" step="0.1"
                               value="${current.maxDilution != null ? current.maxDilution : ''}" placeholder="指定なし">
                        <span class="constitution-unit">%</span>
                    </div>

                    <div class="constitution-note">
                        ここで指定した体質にあたる精油は、提案から自動で除外されます。
                        初診問診の自由記述はそのまま残りますが、機械の判定にはこちらだけが使われます。
                    </div>
                </div>
            </details>
        `;

        host.querySelectorAll('[data-flag]').forEach((el) => {
            el.onchange = (e) => {
                e.stopPropagation();
                save({ flags: { ...current.flags, [el.dataset.flag]: el.checked } });
            };
        });
        host.querySelectorAll('[data-allergy]').forEach((el) => {
            el.onchange = (e) => {
                e.stopPropagation();
                const key = el.dataset.allergy;
                const next = el.checked
                    ? [...new Set([...current.allergies, key])]
                    : current.allergies.filter((a) => a !== key);
                save({ allergies: next });
            };
        });
        // その他（自由入力）。選択肢に無いものをここで受ける。
        host.querySelectorAll('[data-free-text]').forEach((el) => {
            el.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const k = el.dataset.freeKind === 'flag' ? 'otherFlags' : 'otherAllergies';
                save({ [k]: current[k].filter((t) => t !== el.dataset.freeText) });
            };
        });

        // 体質とアレルギーで欄が分かれているので、それぞれに繋ぐ
        ['flag', 'allergy'].forEach((kind) => {
            const block = host.querySelector(`[data-free-block="${kind}"]`);
            if (!block) return;
            const freeInput = block.querySelector('.free-input');
            const freeAdd = block.querySelector('.free-add-btn');
            const freeList = block.querySelector(`#free-suggest-${kind}`);
            const store = kind === 'flag' ? 'otherFlags' : 'otherAllergies';

            /** 過去に書いたものを候補に出す。表記のばらつきを防ぐのが目的 */
            const refreshSuggestions = () => {
                if (!freeList) return;
                const hits = suggestFreeText(getCustomers(), kind, freeInput ? freeInput.value : '', 8);
                freeList.innerHTML = hits.map((t) => `<option value="${escapeHtml(t)}"></option>`).join('');
            };

            const addFree = () => {
                if (!freeInput) return;
                const text = freeInput.value.trim();
                if (!text) return;
                // 同じものを二重に持たない。「そば」と「ソバ」も同じものとして見る。
                // 漢字と仮名（蕎麦／そば）はここでは分からないので、そちらは棚卸しで寄せる。
                const key = comparisonKey(text) || normalizeFreeText(text);
                const already = current[store].find((t) => (comparisonKey(t) || normalizeFreeText(t)) === key);
                if (already) {
                    showToast(already === text
                        ? 'すでに登録されています。'
                        : `「${already}」として登録済みです。`, 'error');
                    freeInput.value = '';
                    return;
                }
                save({ [store]: [...current[store], text] });
            };

            if (freeInput) {
                freeInput.oninput = refreshSuggestions;
                freeInput.onclick = (e) => e.stopPropagation();
                freeInput.onkeydown = (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); addFree(); }
                };
            }
            if (freeAdd) {
                freeAdd.onclick = (e) => { e.stopPropagation(); e.preventDefault(); addFree(); };
            }
            refreshSuggestions();
        });

        const dil = host.querySelector('.constitution-dilution');
        if (dil) {
            dil.onchange = (e) => {
                e.stopPropagation();
                const v = parseFloat(dil.value);
                save({ maxDilution: Number.isFinite(v) && v > 0 ? v : null });
            };
            dil.onclick = (e) => e.stopPropagation();
        }
        const sum = host.querySelector('summary');
        if (sum) sum.onclick = (e) => e.stopPropagation();
    }

    /**
     * 計算の内訳。どの数字からどの色が出たのかを見せる。
     * 顧客登録の画面とカルテの両方で同じものを出す。
     */
    /**
     * ソウルカラーの自動計算は、画面からすべて外した（ISSUE-077, 079）。
     *
     * カルテ側 → 登録画面 の順に、サロンのご指示で下ろしている。
     * 5色は下の丸を押して手で選ぶ。計算そのもの（`soul-color.js`）は
     * 消していないので、戻したくなれば呼び出しを足せばよい。
     */

    // ヘルパー: ローカル時刻基準の YYYY-MM-DD（toISOString はUTC変換で日付がずれる）
    function toDateStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ヘルパー: 個人カレンダーを最初に開く月を決める
    // 今月に記録があれば今月。なければ直近の予定、それもなければ最後の施術日の月。
    function pickCalendarMonth(records) {
        const today = new Date();
        const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const dates = (records || []).map(r => r.date).filter(Boolean).sort();
        if (dates.length === 0) return thisMonth;

        const todayStr = toDateStr(today);
        const inThisMonth = dates.some(d => d.slice(0, 7) === todayStr.slice(0, 7));
        if (inThisMonth) return thisMonth;

        const upcoming = dates.find(d => d >= todayStr);
        const target = upcoming || dates[dates.length - 1];
        const [y, m] = target.split('-').map(Number);
        return new Date(y, m - 1, 1);
    }

    // ヘルパー: 個人カレンダーインスタンスの描画
    function renderPersonalCalendarInstance(customer, container) {
        const gridBody = container.querySelector('#cust-calendar-grid-body');
        const titleEl = container.querySelector('#cust-calendar-title');
        if (!gridBody || !titleEl) return;

        gridBody.innerHTML = '';
        const year = currentCustCalendarMonth.getFullYear();
        const month = currentCustCalendarMonth.getMonth();
        titleEl.textContent = `${year}年 ${month + 1}月`;

        const firstDay = new Date(year, month, 1).getDay();
        const lastDate = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            gridBody.innerHTML += '<div class="calendar-day empty"></div>';
        }

        const records = customer.records || [];
        const todayStr = toDateStr(new Date());

        for (let date = 1; date <= lastDate; date++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
            const dayRecords = records.filter(r => r.date === dateStr);
            const hasRecord = dayRecords.length > 0;
            const isToday = dateStr === todayStr;
            // 未来日は「予定」、当日までは「実施済み」として色を分ける
            const isUpcoming = hasRecord && dateStr > todayStr;

            const cell = document.createElement('div');
            cell.className = [
                'calendar-day',
                hasRecord ? 'has-event' : '',
                isUpcoming ? 'upcoming' : '',
                isToday ? 'today' : ''
            ].filter(Boolean).join(' ');
            cell.innerHTML = `
                <span class="day-number">${date}</span>
                ${hasRecord ? '<span class="event-dot"></span>' : ''}
            `;

            if (hasRecord) {
                cell.title = `${dateStr}\n${dayRecords.map(r => `${r.time ? r.time + ' ' : ''}${getServiceCategories(r).map((c) => c.icon).join('')}${recordTypeLabel(r)}`).join('\n')}`;
            } else {
                cell.title = `${dateStr}\n押すと、この日の予約を書けます`;
            }

            // **空いている日も押せるようにする**（ISSUE-063）。
            // 以前は記録のある日しか押せず、その人のページからは予約を作れなかった。
            // 一覧から自分のページを開いても新規に書けない、という行き止まりになっていた。
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', () => {
                if (hasRecord) {
                    // 下の一覧へ送り、その日のカードを目立たせる。
                    // いきなりカルテへ飛ばすと、同じ日に2件あるとき選べない。
                    focusPersonalDay(container, dateStr);
                } else {
                    // 相手はこのページの人で決まっている。選び直す欄は出さない。
                    if (openNewRecordRequested) openNewRecordRequested(dateStr, customer.id);
                }
            });

            gridBody.appendChild(cell);
        }

        renderPersonalMonthList(customer, container);
    }

    /**
     * 個人カレンダーの下に、**その月ぶん**の予約・記録をカードで並べる。
     *
     * カレンダーのマスは点しか出せないので、時間も内容も読めない。
     * その月に何が入っているかを、1つの画面で見渡せるようにする（ISSUE-063）。
     */
    function renderPersonalMonthList(customer, container) {
        let host = container.querySelector('#cust-month-list');
        if (!host) {
            host = document.createElement('div');
            host.id = 'cust-month-list';
            host.className = 'cust-month-list';
            container.appendChild(host);
        }

        const year = currentCustCalendarMonth.getFullYear();
        const month = currentCustCalendarMonth.getMonth();
        const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
        const todayStr = toDateStr(new Date());

        const rows = (customer.records || [])
            .filter((r) => String(r.date || '').startsWith(prefix))
            .sort((a, b) => (a.date === b.date
                ? String(a.time || '').localeCompare(String(b.time || ''))
                : String(a.date).localeCompare(String(b.date))));

        if (rows.length === 0) {
            host.innerHTML = `<div class="cust-month-head">${year}年${month + 1}月</div>`
                + '<div class="cust-month-empty">この月の予約はありません。'
                + '<br>カレンダーの日付を押すと、その日の予約を書けます。</div>';
            return;
        }

        host.innerHTML = `<div class="cust-month-head">${year}年${month + 1}月　${rows.length}件</div>`
            + rows.map((r) => {
                const upcoming = r.date > todayStr;
                const d = String(r.date).slice(5).replace('-', '/');
                return `<button type="button" class="cust-month-card${upcoming ? ' upcoming' : ''}"
                        data-date="${escapeHtml(String(r.date))}" data-record-id="${escapeHtml(String(r.id))}">
                    <span class="cust-month-date">${escapeHtml(d)}${r.time ? ` ${escapeHtml(String(r.time))}` : ''}</span>
                    <span class="cust-month-body">
                        ${buildCategoryIconsHtml(r)}${escapeHtml(recordTypeLabel(r))}
                        <span class="cust-month-amount">${escapeHtml(recordAmountLabel(r))}</span>
                    </span>
                    ${isBookingOnly(r) ? '<span class="cust-month-tag">予約のみ</span>' : ''}
                </button>`;
            }).join('');

        host.querySelectorAll('.cust-month-card').forEach((btn) => {
            btn.addEventListener('click', () => {
                // カードを押したらカルテへ。その日のところが開いた状態で出る。
                window._highlightDate = btn.dataset.date;
                activeTab = 'visit-type';
                const typeTabBtn = document.querySelector('.detail-subtab-btn[data-tab="visit-type"]');
                if (typeTabBtn) {
                    document.querySelectorAll('.detail-subtab-btn').forEach((b) => b.classList.remove('active'));
                    typeTabBtn.classList.add('active');
                }
                renderTabContent(customer);
            });
        });
    }

    /** カレンダーで日付を押したとき、下の一覧のその日へ送る */
    function focusPersonalDay(container, dateStr) {
        const host = container.querySelector('#cust-month-list');
        if (!host) return;
        host.querySelectorAll('.cust-month-card').forEach((el) => el.classList.remove('picked'));
        const first = host.querySelector(`.cust-month-card[data-date="${dateStr}"]`);
        if (!first) return;
        // 同じ日に複数あることがあるので、その日ぶんは全部目立たせる
        host.querySelectorAll(`.cust-month-card[data-date="${dateStr}"]`)
            .forEach((el) => el.classList.add('picked'));
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * カルテ側の記録画面の、時間の欄に警告を出す（ISSUE-067）。
     * 編集中の記録は**自分自身を重なりに数えない**。自分と重なると出てしまう。
     */
    function refreshRecordTimeWarning() {
        const dateEl = document.getElementById('input-date');
        annotateTimeOptions('input-time', dateEl ? dateEl.value : '',
            editingRecord ? { customerId: editingRecord.customerId, recordId: editingRecord.recordId } : {});
    }

    ['input-time', 'input-date'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', refreshRecordTimeWarning);
    });

    // [ISSUE-NEW] 記録フォームの読み取り専用・編集切り替え
    const btnToggleEditRecord = document.getElementById('btn-toggle-edit-record');
    function setRecordFormReadonly(readonly) {
        const inputs = recordForm.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.disabled = readonly;
            input.style.opacity = readonly ? '0.7' : '1';
        });
        // 区分はボタンなので上の指定では止まらない。個別に押せなくする。
        recordForm.querySelectorAll('.service-cat-btn')
            .forEach((btn) => { btn.disabled = readonly; });
        if (readonly) {
            recordForm.classList.add('readonly-mode');
            if (btnToggleEditRecord) {
                btnToggleEditRecord.style.display = 'block';
                btnToggleEditRecord.textContent = '✏️ 編集を有効にする';
                btnToggleEditRecord.style.background = 'rgba(0, 242, 254, 0.15)';
            }
            if (btnSubmitRecord) btnSubmitRecord.style.display = 'none';
        } else {
            recordForm.classList.remove('readonly-mode');
            if (btnToggleEditRecord) {
                btnToggleEditRecord.textContent = '🔓 編集モード (ロックする)';
                btnToggleEditRecord.style.background = 'rgba(255, 82, 82, 0.15)';
            }
            if (btnSubmitRecord) btnSubmitRecord.style.display = 'block';
        }
    }

    if (btnToggleEditRecord) {
        btnToggleEditRecord.addEventListener('click', () => {
            const isReadonly = recordForm.classList.contains('readonly-mode');
            setRecordFormReadonly(!isReadonly);
        });
    }


    // 4. 各種イベント処理

    // [ISSUE-018] 新規登録のカラーセレクター制御（独立5スロット形式）
    const inputSoulColorSlots = document.getElementById('soul-color-slots');
    const inputSoulColorPalette = document.getElementById('soul-color-palette');
    const inputSoulColorPreview = document.getElementById('input-soul-color-preview');
    // モーダルを開き直したときに選択をリセットできるよう、初期化関数を保持しておく
    let getInputSoulColors = () => [];
    let setInputSoulColors = (initial) => {};

    if (inputSoulColorSlots && inputSoulColorPalette) {
        setInputSoulColors = (initial) => {
            getInputSoulColors = initSoulColorSlotSelector(
                inputSoulColorSlots,
                inputSoulColorPalette,
                initial,
                (colors) => {
                    // プレビュー表示はバッジ形式を維持
                    if (inputSoulColorPreview) {
                        inputSoulColorPreview.innerHTML = buildSoulColorBadgeHtml(colors, 'sm');
                    }
                }
            );
        };
        setInputSoulColors([]);
    }
    // 後方互換性（既存コードでのリセット用）
    const resetInputSoulColors = () => setInputSoulColors([]);

    // ------------------------------------------------------------------
    // 顧客登録の画面で、名前と生年月日から5色を出す。
    //
    // 5色は画数と生年月日で決まるもので、選ぶものではない。手で選べると
    // 人によって違う色が入ってしまい、あとから見ても何が正しいのか
    // 分からなくなる。そろった時点で自動的に入れて、触れないようにする。
    //
    // 画数を引けない字が入っていたときだけ、手で選ぶ道を残してある。
    // 計算できないのに何も選べないと、登録そのものができなくなるため。
    // ------------------------------------------------------------------
    const inputName = document.getElementById('input-name');
    const inputBirthday = document.getElementById('input-birthday');

    // ソウルカラーの自動計算は、サロンのご指示で外した（ISSUE-079）。
    // 5色は下の丸を押して手で選ぶ。計算そのもの（soul-color.js）は
    // 消していないので、戻したくなればここに呼び出しを足せばよい。

    // ------------------------------------------------------------------
    // よみがなの自動入力。
    //
    // 漢字から読みは引けない。「美咲」が「みさき」か「よしさき」かは
    // 字面からは決まらないためです。そこで、変換を確定する前に打った
    // 読みをそのまま控えておく。打っているそばから拾うしかない。
    //
    // 拾えないこともある（貼り付け、変換を使わない入力）。そのときは
    // 空のままにして、手で入れていただく。あとから直せば、以後は
    // 上書きしない。
    // ------------------------------------------------------------------
    const inputKana = document.getElementById('input-kana');
    const kanaSegments = [];   // [{ text: 確定した文字, reading: そのときの読み }]
    let kanaEdited = false;    // 手で直されたら、もう触らない
    let composingReading = ''; // 変換中の読み（かなに見えていた最後の姿）
    let writingKana = false;   // こちらから書いている最中（手直しと区別する）
    let kanaGaveUp = false;    // 読みが拾えなかった。当て推量で入れない

    // かなだけに見えるか。変換前の読みかどうかの見分けに使う
    const LOOKS_LIKE_READING = /^[ぁ-ゖァ-ヴー゛゜ﾞﾟ・　\s]+$/;

    /** 名前が削られたぶん、控えも短くする。頭から一致する分だけ残す */
    const trimKanaSegments = (value) => {
        let acc = '';
        let keep = 0;
        for (const seg of kanaSegments) {
            if (value.indexOf(acc + seg.text) === 0) { acc += seg.text; keep += 1; }
            else break;
        }
        kanaSegments.length = keep;
        return acc;
    };

    const applyKana = () => {
        if (!inputKana || kanaEdited) return;
        writingKana = true;
        // 拾えなかったときは空にする。**半端な読みを置くより、空のほうがよい**
        inputKana.value = kanaGaveUp
            ? ''
            : toHiragana(kanaSegments.map((s) => s.reading).join(''));
        writingKana = false;
    };

    const resetKanaCapture = (edited) => {
        kanaSegments.length = 0;
        composingReading = '';
        kanaGaveUp = false;
        kanaEdited = Boolean(edited);
    };

    // 変換を通さずに入った文字。かな・英字・空白ならそのまま読みにできる
    const READABLE_AS_IS = /^[぀-ヿｦ-ﾟ　\sA-Za-z0-9ー・]+$/;

    if (inputName && inputKana) {
        inputName.addEventListener('compositionstart', () => { composingReading = ''; });
        inputName.addEventListener('compositionupdate', (e) => {
            const d = e.data || '';
            // **変換候補を選ぶと、ここに変換後の漢字が流れてくる。**
            // 最後の値をそのまま採ると、読みが漢字で上書きされる
            // （実機のよみがな欄に「田中 圭」が入っていたのはこれ）。
            // 読みとして覚えるのは、**かなに見えているあいだだけ**。
            if (d && LOOKS_LIKE_READING.test(d)) composingReading = d;
        });
        inputName.addEventListener('compositionend', () => {
            const acc = trimKanaSegments(inputName.value);
            const committed = inputName.value.slice(acc.length);
            if (committed) {
                // 変換を使わずに確定したなら、打った文字がそのまま読みになる
                const asIs = LOOKS_LIKE_READING.test(committed);
                const reading = asIs ? committed : composingReading;
                // 予測変換で一足飛びに確定すると、かなを1文字も見ないまま
                // 漢字が来る。読みが確定した字より短いときは、拾えていない。
                // **間違った読みを置くくらいなら、空けて手で入れていただく。**
                if (!reading || (!asIs && reading.length < committed.length)) kanaGaveUp = true;
                else kanaSegments.push({ text: committed, reading });
            }
            composingReading = '';
            applyKana();
        });
        inputName.addEventListener('input', (e) => {
            if (e.isComposing || e.inputType === 'insertCompositionText') return;
            const acc = trimKanaSegments(inputName.value);
            const rest = inputName.value.slice(acc.length);
            // 読みの分からない文字（漢字の貼り付けなど）は足さない。
            // 当て推量で入れるより、空けておいて手で入れていただくほうがよい。
            if (rest && READABLE_AS_IS.test(rest)) {
                kanaSegments.push({ text: rest, reading: rest });
            }
            applyKana();
        });

        // 手で直したら、以後は上書きしない
        inputKana.addEventListener('input', () => { if (!writingKana) kanaEdited = true; });
    }

    // ------------------------------------------------------------------
    // 登録の時点で体質・アレルギーを入れられるようにする。
    //
    // 施術までに要るものなので、分かっているなら最初に入れておくのが早い。
    // ただし必須にはしない。電話予約や飛び込みで名前しか分からないことも
    // あり、そこで登録が止まってしまうため。空のまま登録でき、あとから
    // カルテの「情報」タブでも入れられる。
    // ------------------------------------------------------------------
    const customerConstitutionHost = document.getElementById('customer-constitution-editor');
    let constitutionDraft = null;

    function renderCustomerConstitutionDraft() {
        if (!customerConstitutionHost) return;
        mountConstitutionEditor(customerConstitutionHost, constitutionDraft, (next) => {
            constitutionDraft = next;
            renderCustomerConstitutionDraft();
        });
    }

    // [ISSUE-NEW] 施術記録の下書き（オートセーブ）機能
    const draftIndicator = document.getElementById('record-draft-indicator');
    /**
     * いま画面に入っている記録の中身を、そのまま取り出す。
     * 保存ボタンと自動保存で同じものを使う。取り出し方が2つあると、
     * どちらかにだけ入る項目ができてしまう。
     */
    function collectRecordFields() {
        const val = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };
        return {
            date: val('input-date'),
            time: val('input-time'),
            type: val('input-type'),
            clientComplaint: val('input-client-complaint'),
            prescription: val('input-prescription'),
            therapistNote: val('input-therapist-note'),
            amount: val('input-amount'),
            colors: [...recordColors],
            advanceSet: getRecordAdvanceSet(),
            categories: [...recordCategories],
            menu: recordMenu.keys,
            menuAmounts: recordMenu.adhoc,
            photos: [...recordPhotos],
            kartes: { ...recordKartes }
        };
    }

    /**
     * 保存したことを画面に出す。
     *
     * 上の小さな印だけだと、下のほうを書いているときには目に入らない。
     * 押す場所のすぐ上にも、いつ保存したかを残しておく。
     */
    function flashSaved(text) {
        // 保存できていないのに「保存しました」と出すことだけは、してはならない。
        const err = getLastSaveError();
        if (err) { showSaveFailure(err); return; }
        const now = new Date();
        const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (draftIndicator) {
            draftIndicator.textContent = text;
            draftIndicator.style.opacity = '1';
            clearTimeout(flashSaved._t);
            flashSaved._t = setTimeout(() => { draftIndicator.style.opacity = '0'; }, 1600);
        }
        const line = document.getElementById('record-save-state');
        if (line) {
            line.textContent = `${text}（${stamp}）`;
            line.classList.add('is-saved');
            line.classList.remove('is-flash');
            // いったん外してから付け直さないと、続けて保存したときに光らない
            void line.offsetWidth;
            line.classList.add('is-flash');
        }
    }

    /** 保存できなかったことを、はっきり出す */
    function showSaveFailure(err) {
        if (draftIndicator) {
            draftIndicator.textContent = '⚠ 保存できていません';
            draftIndicator.style.opacity = '1';
            draftIndicator.style.color = '#ff8a8a';
        }
        const line = document.getElementById('record-save-state');
        if (line) {
            line.textContent = `⚠ ${err.message}`;
            line.classList.remove('is-saved', 'is-flash');
            line.classList.add('is-failed');
        }
    }

    /** 記録を開き直したときは、保存の表示も戻す */
    function resetSaveState() {
        const line = document.getElementById('record-save-state');
        if (!line) return;
        line.textContent = 'まだ保存されていません';
        line.classList.remove('is-saved', 'is-flash', 'is-failed');
        if (draftIndicator) draftIndicator.style.color = '';
    }

    /**
     * 書いたそばから残す。
     *
     * すでにある記録を直しているときは、その記録へそのまま上書きする。
     * まだ記録になっていないときは、下書きとして持つ。書いている途中で
     * 端末が閉じても、開き直せば続きから書ける。
     *
     * 新規のぶんを勝手に記録にしないのは、開いて閉じただけの空の記録が
     * 溜まってしまうため。
     */
    function autosaveRecord() {
        // デモの最中は書かない。デモは実際の画面をそのまま動かすので、
        // 自動保存が効くとサンプルの記録が書き換わってしまう。
        // デモは最後に保存せず閉じるという約束になっている。
        if (isDemoRunning) return;
        if (editingRecord) {
            const fields = collectRecordFields();
            if (!fields.date || !fields.type) return;   // 記録として成り立たない
            updateRecord(editingRecord.customerId, editingRecord.recordId, {
                ...fields,
                amount: fields.amount,
                // 目を通して直した時点で、自動で入った状態ではなくなる
                prepFilledAt: null
            });
            flashSaved('⚡ 保存しました');
            return;
        }
        const target = inlineRecordCustomerId ? inlineRecordCustomerId.value : selectedCustomerId;
        if (!target) return;
        localStorage.setItem(`draft_record_${target}`, JSON.stringify({
            data: collectRecordFields(),
            timestamp: Date.now()
        }));
        flashSaved('⚡ 下書きを保存');
    }

    let autosaveTimer = null;
    function scheduleAutosave() {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(autosaveRecord, 400);
    }

    function saveRecordDraft() { autosaveRecord(); }

    function loadRecordDraft(customerId) {
        const saved = localStorage.getItem(`draft_record_${customerId}`);
        if (!saved) return;
        try {
            const { data } = JSON.parse(saved);
            const setVal = (id, v) => {
                const el = document.getElementById(id);
                if (el && v !== undefined && v !== null) el.value = v;
            };
            setVal('input-date', data.date);
            setVal('input-time', data.time);
            setVal('input-type', data.type);
            setVal('input-client-complaint', data.clientComplaint);
            setVal('input-prescription', data.prescription);
            setVal('input-therapist-note', data.therapistNote);
            setVal('input-amount', data.amount);
            if (Array.isArray(data.colors)) setRecordColors(data.colors, data.advanceSet || getAdvanceSetPreference());
            setRecordCategories(data.categories || []);
            loadRecordMenu(data);
            setRecordPhotos(data.photos || []);
            setRecordKartes(data.kartes || {});
            renderRecordKartes();
            if (data.type || (data.photos || []).length) flashSaved('⚡ 下書きから戻しました');
        } catch (e) { console.warn('Failed to load draft', e); }
    }

    function clearRecordDraft(customerId) {
        localStorage.removeItem(`draft_record_${customerId}`);
    }

    // 入力のたびに残す。少しだけ待つのは、1文字ごとに書き込まないため。
    if (recordForm) {
        recordForm.addEventListener('input', scheduleAutosave);
    }

    // [ISSUE-NEW] 個人カレンダーが表示している月（描画は renderPersonalCalendarInstance）
    let currentCustCalendarMonth = new Date();

    // 検索インプット
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderCustomerList(e.target.value);
        });
    }

    // アーカイブ表示切り替え
    if (checkShowArchived) {
        checkShowArchived.addEventListener('change', () => {
            renderCustomerList(searchInput ? searchInput.value : '');
        });
    }

    // 詳細ビューを閉じる
    if (btnCloseDetail) {
        btnCloseDetail.addEventListener('click', () => {
            selectedCustomerId = null;
            if (customerDetailView) customerDetailView.style.display = 'none';
            const workspaceGrid = document.querySelector('.workspace-grid');
            if (workspaceGrid) {
                workspaceGrid.classList.remove('detail-mode');
            }
            renderCustomerList(searchInput ? searchInput.value : '');
        });
    }

    // 詳細ビューでのアーカイブ操作
    if (btnDetailArchive) {
        btnDetailArchive.addEventListener('click', () => {
            if (!selectedCustomerId) return;
            const customer = getCustomers().find(c => c.id === selectedCustomerId);
            if (!customer) return;

            if (customer.isArchived) {
                unarchiveCustomer(customer.id);
                showToast(`${customer.name} 様のアーカイブを解除し、通常リストへ戻しました`, 'success');
                showCustomerDetail(customer.id);
                renderCustomerList(searchInput ? searchInput.value : '');
            } else {
                showConfirmModal({
                    title: 'アーカイブ保管',
                    message: `${customer.name} 様をアーカイブ保管しますか？\n（通常一覧から非表示になります。データは保持され、いつでも復元可能です）`,
                    actionText: 'アーカイブする',
                    icon: '📦',
                    theme: 'warning',
                    onConfirm: () => {
                        archiveCustomer(customer.id);
                        showToast(`${customer.name} 様をアーカイブ保管しました`, 'success');
                        showCustomerDetail(customer.id);
                        renderCustomerList(searchInput ? searchInput.value : '');
                    }
                });
            }
        });
    }

    // 詳細ビューでの完全削除操作
    const btnDeleteCustomer = document.getElementById('btn-delete-customer');
    if (btnDeleteCustomer) {
        btnDeleteCustomer.addEventListener('click', () => {
            if (!selectedCustomerId) return;
            const customer = getCustomers().find(c => String(c.id) === String(selectedCustomerId));
            if (!customer) return;

            showConfirmModal({
                title: '顧客データの完全削除',
                message: `${customer.name} 様の顧客データを完全削除（消去）しますか？\n\n※すべての施術記録・履歴もデータベースから完全に消去されます。\n※単に一覧に戻したい場合は、削除ではなく「アーカイブ解除」をご利用ください。\n※この操作は取り消せません。`,
                actionText: '完全に消去する',
                onConfirm: () => {
                    deleteCustomer(customer.id);
                    cleanupPhotos();
                    selectedCustomerId = null;
                    showToast(`${customer.name} 様の顧客データを完全に削除しました`, 'success');
                    if (customerDetailView) customerDetailView.style.display = 'none';
                    const workspaceGrid = document.querySelector('.workspace-grid');
                    if (workspaceGrid) workspaceGrid.classList.remove('detail-mode');
                    renderCustomerList(searchInput ? searchInput.value : '');
                    renderCalendar();
                }
            });
        });
    }

    // タブ切り替えボタンのクリック
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.getAttribute('data-tab');
            // 名前から開いた画面から出るので、その印も消す（ISSUE-077）
            personalEditOn = false;
            const nameOpen = document.getElementById('detail-name-open');
            if (nameOpen) nameOpen.classList.remove('is-open');

            const customers = getCustomers();
            const customer = customers.find(c => c.id === selectedCustomerId);
            if (customer) {
                renderTabContent(customer);
            }
        });
    });

    /**
     * 顧客No. の欄に値を入れる。書き換えはできる。
     *
     * 新規のときに出しているのは「次に付く見込み」。そのまま登録すれば、
     * 書き込む直前に空き番号を決め直す（別の端末で誰か増えていても重ならない）。
     * 書き換えたときだけ、その番号を使う。見込みは dataset に控えておく。
     */
    function setCustomerNoField(value, { suggested = false } = {}) {
        const el = document.getElementById('input-customer-no');
        if (!el) return;
        el.value = value || '';
        el.dataset.suggested = suggested ? (value || '') : '';
        el.classList.remove('is-invalid');
        el.removeAttribute('aria-invalid');
        renderCustomerNoHint('');
    }

    function renderCustomerNoHint(text, isError = false) {
        const hint = document.getElementById('customer-no-hint');
        if (!hint) return;
        hint.textContent = text || '';
        hint.style.color = isError ? '#ff8a8a' : 'var(--text-secondary)';
    }

    /**
     * 顧客No. の欄を確かめる。問題があれば文言を返し、なければ null。
     * 新規で見込みのまま・空のままなら、自動で決めるので確かめない。
     */
    function checkCustomerNoField() {
        const el = document.getElementById('input-customer-no');
        if (!el) return null;
        const raw = normalizeCustomerNo(el.value);
        const isNew = !editingCustomer;
        if (isNew && (!raw || raw === normalizeCustomerNo(el.dataset.suggested))) return null;
        if (!raw) return '顧客No. を空にはできません。';
        const owner = findCustomerNoOwner(raw, editingCustomer ? editingCustomer.id : null);
        if (owner) {
            return `${raw} はすでに ${owner.name || '別の方'} 様${owner.isArchived ? '（保管中）' : ''}が使っています。`;
        }
        return null;
    }

    function refreshCustomerNoCheck() {
        const el = document.getElementById('input-customer-no');
        if (!el) return null;
        const problem = checkCustomerNoField();
        el.classList.toggle('is-invalid', Boolean(problem));
        if (problem) el.setAttribute('aria-invalid', 'true');
        else el.removeAttribute('aria-invalid');
        if (problem) {
            renderCustomerNoHint(`⚠ ${problem}`, true);
        } else if (!editingCustomer && normalizeCustomerNo(el.value) === normalizeCustomerNo(el.dataset.suggested)) {
            renderCustomerNoHint('');
        } else {
            renderCustomerNoHint(el.value.trim() ? '✓ 使える番号です' : '空のままなら自動で付きます');
        }
        return problem;
    }

    {
        const el = document.getElementById('input-customer-no');
        if (el) el.addEventListener('input', refreshCustomerNoCheck);
    }

    // [MINOR v1.10.0] 顧客モーダルを新規登録モードに戻す
    function resetCustomerModal() {
        editingCustomer = null;
        if (customerForm) customerForm.reset();
        if (customerModalTitle) customerModalTitle.textContent = '新規顧客の登録';
        if (btnSubmitCustomer) btnSubmitCustomer.textContent = '登録する';
        
        // 次に付く番号を見込みとして出す。書き換えれば、その番号で登録する。
        // 同じ番号は保存のときに止める（checkCustomerNoField）。
        setCustomerNoField(nextCustomerNo(), { suggested: true });
        fillIntakeFields(null);

        resetInputSoulColors(); // カラー選択リセット
        resetKanaCapture(false);
        constitutionDraft = null;
        renderCustomerConstitutionDraft();
    }

    // [MINOR v1.10.0] 既存顧客を読み込んでモーダルを編集モードで開く
    function openCustomerEditor(id, focusId = null) {
        const customers = getCustomers();
        const customer = customers.find(c => c.id === id);
        if (!customer) return;

        editingCustomer = customer;
        if (customerModalTitle) customerModalTitle.textContent = '顧客情報の編集';
        if (btnSubmitCustomer) btnSubmitCustomer.textContent = '更新する';

        // フォームに値をセット
        const setVal = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value != null ? value : '';
        };
        setVal('input-name', customer.name);
        setCustomerNoField(customer.customerNo != null ? customer.customerNo : '');
        setVal('input-nickname', customer.nickname);
        setVal('input-kana', customer.kana);
        setVal('input-phone', customer.phone);
        setVal('input-birthday', customer.birthday);
        setVal('input-referrer', customer.referrer);
        if (inputInitialConsultation) inputInitialConsultation.value = customer.initialConsultation || '';
        fillIntakeFields(customer);
        if (inputMemo) inputMemo.value = customer.memo || '';

        // Soul Colorのセット。名前と生年月日から出し直す。
        // 計算できないときだけ、いま登録されている色をそのまま残す。
        if (inputSoulColorSlots && inputSoulColorPalette) {
            setInputSoulColors(getSoulColors(customer));
        }
        // すでに入っているよみがなは、こちらから書き換えない
        resetKanaCapture(true);
        constitutionDraft = customer.constitution || null;
        renderCustomerConstitutionDraft();

        if (customerModal) customerModal.classList.add('active');
        markCustomerFormClean();

        // 指定されたフィールドがあればフォーカス＆スクロール
        if (focusId) {
            setTimeout(() => {
                const target = document.getElementById(focusId);
                if (target) {
                    target.focus();
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // 一時的にハイライト
                    const originalBorder = target.style.borderColor;
                    target.style.borderColor = 'var(--accent-cyan)';
                    target.style.boxShadow = '0 0 10px var(--accent-cyan)';
                    setTimeout(() => {
                        target.style.borderColor = originalBorder;
                        target.style.boxShadow = '';
                    }, 2000);
                }
            }, 300);
        }
    }

    // 頭の ✏️ は外した（ISSUE-078）。まとめて直す画面は
    // 「未入力の印」から生年月日へ連れていくときにだけ残っている。
    // ふだん直すのは「この方のこと」の中の ✏️ から。

    // 顧客登録モーダルの「開いたときの中身」。閉じるときにこれと比べて、
    // 書きかけがあれば確かめる。外側に指が触れただけで、打った内容が
    // 消えてしまうのを防ぐため。
    let customerFormBaseline = null;
    function customerFormSignature() {
        const vals = customerForm
            ? Array.from(customerForm.querySelectorAll('input, textarea, select'))
                .map((el) => (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : el.value)
            : [];
        let colors = [];
        try { colors = getInputSoulColors(); } catch (e) { /* 色の欄が無い画面 */ }
        return JSON.stringify([vals, colors, constitutionDraft || null]);
    }
    function markCustomerFormClean() {
        customerFormBaseline = customerFormSignature();
    }
    function customerFormIsDirty() {
        return customerFormBaseline !== null && customerFormSignature() !== customerFormBaseline;
    }
    /** 登録せずに閉じる。書きかけがあれば確かめる */
    function closeCustomerModalSafely() {
        if (customerFormIsDirty()) {
            const msg = editingCustomer
                ? '変更はまだ保存されていません。\n保存せずに閉じますか？'
                : '入力した内容はまだ登録されていません。\n登録せずに閉じますか？（入力した内容は消えます）';
            if (!confirm(msg)) return;
        }
        if (customerModal) customerModal.classList.remove('active');
        resetCustomerModal();
        customerFormBaseline = null;
    }

    // 顧客登録モーダル表示・非表示
    if (btnAddCustomer) {
        btnAddCustomer.addEventListener('click', () => {
            resetCustomerModal();
            if (customerModal) customerModal.classList.add('active');
            markCustomerFormClean();
        });
    }
    if (btnCancelCustomer) {
        btnCancelCustomer.addEventListener('click', closeCustomerModalSafely);
    }
    if (customerModal) {
        customerModal.addEventListener('click', (e) => {
            if (e.target === customerModal) closeCustomerModalSafely();
        });
    }

    // 顧客フォーム送信処理
    if (btnSubmitCustomer) {
        btnSubmitCustomer.addEventListener('click', () => {
            const nameEl = document.getElementById('input-name');
            const name = nameEl ? nameEl.value : '';
            if (!name) {
                showToast('お名前は必須項目です。', 'error');
                return;
            }
            // 顧客No. は重ならないことを確かめてから書く。
            // 新規で見込みのまま（または空）なら渡さない。画面の見込みは、
            // 開いてから登録するまでの間に別の端末で誰か増えていれば古くなる。
            // 決めるのは書き込む直前でよい（addCustomer が空き番号を選ぶ）。
            const customerNoEl = document.getElementById('input-customer-no');
            const noProblem = refreshCustomerNoCheck();
            if (noProblem) {
                showToast(noProblem, 'error');
                if (customerNoEl) {
                    customerNoEl.focus();
                    customerNoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }
            const typedNo = customerNoEl ? normalizeCustomerNo(customerNoEl.value) : '';
            const customerNo = editingCustomer
                ? typedNo
                : (typedNo && typedNo !== normalizeCustomerNo(customerNoEl.dataset.suggested) ? typedNo : '');
            const nicknameEl = document.getElementById('input-nickname');
            const nickname = nicknameEl ? nicknameEl.value.trim() : '';
            const kanaEl = document.getElementById('input-kana');
            const kana = kanaEl ? kanaEl.value : '';
            const phoneEl = document.getElementById('input-phone');
            const phone = phoneEl ? phoneEl.value : '';
            const birthdayEl = document.getElementById('input-birthday');
            const birthday = birthdayEl ? birthdayEl.value : '';
            const soulColors = getInputSoulColors();
            const referrerEl = document.getElementById('input-referrer');
            const referrer = referrerEl ? referrerEl.value : '';
            const initialConsultation = inputInitialConsultation ? inputInitialConsultation.value : '';
            const intake = collectIntakeFields();
            const memo = inputMemo ? inputMemo.value : '';

            // 体質は入れていただけたときだけ書く。空のまま上書きすると、
            // 別の画面で入れた内容を登録画面から消してしまう。
            const constitution = constitutionDraft;

            // 編集モードなら更新処理、そうでなければ新規登録
            if (editingCustomer) {
                updateCustomer(editingCustomer.id, {
                    name, nickname, kana, phone, memo, customerNo, birthday, soulColors, referrer, initialConsultation,
                    intake,
                    ...(constitution ? { constitution } : {})
                });
                showToast(`${name} 様の情報を更新しました`, 'success');
            } else {
                const newCust = addCustomer(name, kana, phone, memo, customerNo, birthday, soulColors, referrer, initialConsultation);
                updateCustomer(newCust.id, { nickname, intake, ...(constitution ? { constitution } : {}) });
                showToast(`${name} 様を登録しました`, 'success');
                selectedCustomerId = newCust.id; // 新規登録後はその顧客を選択状態にする
            }

            if (customerModal) customerModal.classList.remove('active');
            resetCustomerModal();

            renderCustomerList(searchInput ? searchInput.value : '');
            if (selectedCustomerId) {
                showCustomerDetail(selectedCustomerId);
            }
        });
    }

    // -------------------------------------------------------------------
    // [ISSUE-020] 施術記録の編集モード
    // 追加用モーダルを流用し、editingRecord の有無で追加／更新を切り替える
    // -------------------------------------------------------------------
    const recordModalTitle = document.getElementById('record-modal-title');
    let editingRecord = null; // { customerId, recordId } または null（＝新規追加）

    /** モーダルを新規追加モードに戻す。閉じるときは必ずこれを通す */
    function resetRecordModal() {
        // 追加したまま保存せずに閉じた写真は、ここで片付く
        cleanupPhotos();
        editingRecord = null;
        if (recordForm) recordForm.reset();
        if (recordModalTitle) recordModalTitle.textContent = '施術内容・金額の記録';
        if (btnSubmitRecord) btnSubmitRecord.textContent = '記録する';

        setRecordColors([], getAdvanceSetPreference());
        setRecordCategories([]);
        recordMenu.set([], {}, '');
        const menuFold = document.getElementById('record-menu-fold');
        if (menuFold) menuFold.open = false;   // ふだんは畳んでおく
        setRecordPhotos([]);
        setRecordKartes({});
        renderRecordKartes();
        resetSaveState();

        // 提案は記録ごとに作り直す。前の顧客の提案が残らないよう毎回消す。
        const adviceHost = document.querySelector('#record-session-advice .session-advice-host');
        if (adviceHost) adviceHost.innerHTML = '';
        const prepNotice = document.getElementById('record-prep-filled');
        if (prepNotice) { prepNotice.style.display = 'none'; prepNotice.innerHTML = ''; }
        refreshAdviceButtonLabel();

        // 前に開いたときの印を持ち越さない（ISSUE-067）
        const timeSel = document.getElementById('input-time');
        if (timeSel) timeSel.classList.remove('has-clash');
    }

    // ------------------------------------------------------------------
    // 施術記録のカラー選択（TC＋アドバンス。両方から選べる）
    // ------------------------------------------------------------------

    /** いま選ばれている色（記録モーダルの状態） */
    // ------------------------------------------------------------------
    // 施術の区分（🦄カウンセリング など）
    //
    // 「施術メニュー・内容」の自由記述はそのまま残し、区分は別に持つ。
    // 一覧・カレンダー・履歴にアイコンで出すため、文字ではなく選択で受ける。
    // ------------------------------------------------------------------

    /**
     * 押して選ぶ施術内容（ISSUE-085）。2つの画面で同じものを使う。
     *
     * 選ばれているのは**メニューの key**。区分（書く欄）はそこから引く。
     * 区分を直に持たないのは、初診・再診・月set がどれも 🫶施術 を指すため。
     *
     * **金額は、押したときだけ書き換える。** 昔の記録は menu を持っていないので、
     * 開いた拍子に作り直すと、入っていた金額が 0 に化ける。
     */
    function makeMenuPicker(ids, onChange) {
        const st = { keys: [], adhoc: {}, touched: false, storedAmount: '' };

        const $ = (id) => document.getElementById(id);

        function paint() {
            const host = $(ids.grid);
            if (!host) return;
            const menu = getServiceMenu();

            host.innerHTML = '';
            menu.forEach((m) => {
                const on = st.keys.includes(m.key);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'service-cat-btn' + (on ? ' selected' : '');
                btn.dataset.menu = m.key;
                // 古い検証や案内が data-cat を見ているので、書く欄のほうも載せる
                if (m.field) btn.dataset.cat = m.field;
                btn.title = m.name;
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.innerHTML = `<span class="service-cat-icon">${m.icon}</span>
                    <span class="service-cat-name">${escapeHtml(m.name)}</span>
                    <span class="service-cat-price">${escapeHtml(priceLabel(m.amount))}</span>`;
                btn.onclick = () => {
                    // 押したら入る、もう一度押したら外れる
                    st.touched = true;
                    if (on) {
                        st.keys = st.keys.filter((k) => k !== m.key);
                        delete st.adhoc[m.key];
                    } else {
                        st.keys = [...st.keys, m.key];
                    }
                    paint();
                    if (onChange) onChange(st);
                };
                host.appendChild(btn);
            });

            // 金額がその都度のものだけ、入れる欄を出す
            const adhocHost = $(ids.adhoc);
            if (adhocHost) {
                adhocHost.innerHTML = '';
                menu.filter((m) => st.keys.includes(m.key)
                        && (m.amount === null || m.amount === undefined)).forEach((m) => {
                    const row = document.createElement('div');
                    row.className = 'menu-adhoc-row';
                    row.innerHTML = `<span aria-hidden="true">${m.icon}</span><span class="nm"></span>`;
                    row.querySelector('.nm').textContent = `${m.name} の金額`;
                    const inp = document.createElement('input');
                    inp.type = 'number';
                    inp.inputMode = 'numeric';
                    inp.min = '0';
                    inp.step = '100';
                    inp.placeholder = '0';
                    inp.dataset.menuAmount = m.key;
                    inp.setAttribute('aria-label', `${m.name} の金額`);
                    inp.value = st.adhoc[m.key] ?? '';
                    inp.addEventListener('input', () => {
                        st.touched = true;
                        st.adhoc[m.key] = inp.value;
                        paintSummary();
                        if (onChange) onChange(st);
                    });
                    row.appendChild(inp);
                    adhocHost.appendChild(row);
                });
            }
            paintSummary();
        }

        function amountLabel() {
            // **まだ押していないうちは、入っていた金額をそのまま出す。**
            // 昔の記録は menu を持たず、区分から当てずっぽうで引いている。
            // その引き当てから合計を作ると、初診 15,000 が counseling 0 に化ける
            if (!st.touched) {
                const a = st.storedAmount;
                return (a === '' || a === null || a === undefined)
                    ? '未定' : `${Number(a).toLocaleString()}円`;
            }
            const { total, unknown, priced } = menuTotal(st.keys, st.adhoc);
            if (!priced && !unknown) return '未定';
            return unknown
                ? `${total.toLocaleString()}円 ＋ 未入力`
                : `${total.toLocaleString()}円`;
        }

        function paintSummary() {
            const menu = getServiceMenu();
            const chosen = menu.filter((m) => st.keys.includes(m.key));
            const label = amountLabel();

            const stateEl = $(ids.state);
            if (stateEl) {
                // **アイコンだけを並べる**（ISSUE-086）。名前まで出すと3つで入りきらない。
                // 名前は title と、読み上げ用の字のほうに持たせる
                if (!chosen.length) {
                    stateEl.innerHTML = '<span class="menu-none">まだ選んでいません</span>';
                } else {
                    stateEl.innerHTML = chosen.map((m) =>
                        `<span class="menu-fold-chip" title="${escapeHtml(m.name)}"
                            aria-hidden="true">${m.icon}</span>`).join('')
                        + `<span class="menu-sr">選んでいるもの：${escapeHtml(
                            chosen.map((m) => m.name).join('、'))}</span>`;
                }
            }
            const sumEl = $(ids.sum);
            if (sumEl) {
                sumEl.textContent = label;
                sumEl.classList.toggle('empty', label === '未定');
            }
            const totalEl = $(ids.total);
            if (totalEl) totalEl.textContent = label === '未定' ? '金額未定' : label;

            // 押す前の金額は「前に入っていたもの」。押した合計と見分けが付くようにする
            const lblEl = $(ids.total) && $(ids.total).parentElement
                && $(ids.total).parentElement.querySelector('.menu-total-lbl');
            if (lblEl) {
                lblEl.textContent = (!st.touched && chosen.length > 0)
                    ? '前に入っていた金額' : '合計';
            }

            const opensEl = $(ids.opens);
            if (opensEl) {
                const fields = getServiceCategoriesByKeys(categoriesFromMenu(st.keys));
                opensEl.innerHTML = fields.length
                    ? `書く欄が開きます：${fields.map((c) => `<b>${c.icon} ${escapeHtml(c.name)}</b>`).join('　')}`
                    : '押すと、その施術の書く欄がここに開きます。';
            }
        }

        return {
            get keys() { return [...st.keys]; },
            get adhoc() { return { ...st.adhoc }; },
            get touched() { return st.touched; },
            categories: () => categoriesFromMenu(st.keys),
            /** 記録に入れる金額。押していなければ、入っていたものをそのまま返す */
            amount() {
                if (!st.touched) return st.storedAmount;
                const { total, priced, unknown } = menuTotal(st.keys, st.adhoc);
                if (!priced && !unknown) return '';
                return String(total);
            },
            label: () => menuLabel(st.keys),
            set(keys, adhoc, storedAmount) {
                const valid = getServiceMenu().map((m) => m.key);
                st.keys = (Array.isArray(keys) ? keys : []).filter((k) => valid.includes(k));
                st.adhoc = { ...(adhoc || {}) };
                st.touched = false;
                st.storedAmount = storedAmount === undefined || storedAmount === null
                    ? '' : String(storedAmount);
                paint();
            },
            refresh: paint,
        };
    }

    /** 「15,000円」「都度」「—」 */
    function priceLabel(a) {
        if (a === 'none') return '—';
        if (a === null || a === undefined || a === '') return '都度';
        return `${Number(a).toLocaleString()}円`;
    }

    /** 区分の key の配列から、定義を並び順どおりに引く */
    function getServiceCategoriesByKeys(keys) {
        return SERVICE_CATEGORY_DEFS.filter((c) => keys.includes(c.key));
    }

    /** カルテ側の状態 */
    const recordMenu = makeMenuPicker({
        grid: 'record-service-categories', adhoc: 'record-menu-adhoc',
        state: 'record-menu-state', sum: 'record-menu-sum',
        total: 'record-menu-total', opens: 'record-menu-opens',
    }, () => {
        // 押した施術内容から、書く欄と金額を出し直す
        recordCategories = categoriesFromMenu(recordMenu.keys);
        const t = document.getElementById('input-type');
        const a = document.getElementById('input-amount');
        if (t) t.value = recordMenu.label();
        if (a) a.value = recordMenu.amount();
        renderRecordKartes();
        scheduleAutosave();
    });

    /** いま開いている書く欄（メニューから引いたもの）。renderRecordKartes が見る */
    let recordCategories = [];

    /**
     * 昔の記録は menu を持っていない。区分から、その欄を開くメニューを引き当てる。
     * **同じ欄を指すものが複数あるときは、最初の1つ**（初診・再診・月set → 初診）。
     * 当てずっぽうなので、**金額は書き換えない**（picker が touched を見ている）。
     */
    function menuKeysFromCategories(keys) {
        const menu = getServiceMenu();
        return (Array.isArray(keys) ? keys : [])
            .map((c) => (menu.find((m) => m.field === c) || {}).key)
            .filter(Boolean);
    }

    function setRecordCategories(keys) {
        const valid = SERVICE_CATEGORY_DEFS.map((c) => c.key);
        recordCategories = (Array.isArray(keys) ? keys : []).filter((k) => valid.includes(k));
    }

    /**
     * 記録から、押されている施術内容を戻す。
     *
     * `menu` を持っていれば、そのまま。持っていない昔の記録は区分から引き当てる。
     * **そのときの金額は書き換えない。** 引き当ては当てずっぽうなので、
     * 作り直すと入っていた金額が化ける（初診 15,000 → counseling 0 など）。
     */
    function loadRecordMenu(record) {
        const keys = Array.isArray(record.menu) && record.menu.length
            ? record.menu
            : menuKeysFromCategories(record.categories || []);
        recordMenu.set(keys, record.menuAmounts || {}, record.amount);
        const fold = document.getElementById('record-menu-fold');
        if (fold) fold.open = false;   // 開き直しても畳んだまま
    }

    // ------------------------------------------------------------------
    // セッションの写真
    //
    // 色名だけでは残らないものを残す。並べ方、手で描かれたもの、
    // お渡ししたもの。撮る目的が違うので、置き場所も分けてある。
    //
    // 実物は IndexedDB にあり、記録が持つのは控えだけ。保存を押すまで
    // 記録には結び付かないので、途中でやめた分は最後に掃除する。
    // ------------------------------------------------------------------
    let recordPhotos = [];        // [{ id, kind, addedAtISO, ... }]
    let recordKartes = {};        // { 区分キー: { note } }
    const noteCaret = new Map();  // メモのどこを書いていたか（写真はここへ入れる）
    let photoStoreOk = null;      // 使える端末かどうか（初回に調べる）

    function setRecordPhotos(list) {
        recordPhotos = assignPhotoNumbers(
            Array.isArray(list) ? list.filter((p) => p && p.id).map((p) => ({ ...p })) : []);
    }

    function setRecordKartes(obj) {
        recordKartes = (obj && typeof obj === 'object') ? { ...obj } : {};
    }

    /**
     * 区分ごとのカルテを描く。
     *
     * 区分は印ではなく入口。選んだ区分の分だけ、その区分の欄がここに開く。
     * カラーセラピーのカルテには、その日の色の欄をそのまま移して入れる。
     * 同じ入力欄を2つ作ると、保存の処理まで二重になるため。
     */
    async function renderRecordKartes() {
        const host = document.getElementById('record-kartes');
        if (!host) return;

        if (photoStoreOk === null) photoStoreOk = await isPhotoStoreAvailable();

        // 色の欄は使い回す。描き直しで消えないよう、先に控えの場所へ逃がす。
        const park = document.getElementById('record-color-park');
        const colorGroup = document.getElementById('record-color-group');
        if (colorGroup && park) park.appendChild(colorGroup);

        const chosen = SERVICE_CATEGORY_DEFS.filter((c) => recordCategories.includes(c.key));

        // 区分に当てはまらない写真（以前の記録のもの）は、行き場を作って残す
        const knownKinds = SERVICE_CATEGORY_DEFS.map((c) => c.key);
        const strays = recordPhotos.filter((p) => !knownKinds.includes(p.kind));

        if (chosen.length === 0 && strays.length === 0) {
            host.innerHTML = `<div class="karte-empty">
                上の「施術の区分」を選ぶと、その区分のカルテがここに開きます。</div>`;
            return;   // 色の欄は控えの場所に置いたまま（そこは隠してある）
        }

        // メモに入っていない写真だけを、下に控えとして出す。
        // メモに入っているものは本文の中で見えているので、二重に出さない。
        const photoArea = (key, label, hint) => {
            if (!photoStoreOk) {
                return `<div class="photo-unavailable">この端末では写真を保存できません。</div>`;
            }
            const note = (recordKartes[key] || {}).note || '';
            const placed = new Set((note.match(/[\[［](\d{1,3})[\]］]/g) || [])
                .map((m) => Number(m.replace(/[^0-9]/g, ''))));
            const rest = recordPhotos.filter((p) => p.kind === key && !placed.has(p.no));
            if (rest.length === 0) return '';
            return `
                <div class="photo-kind" data-photo-kind="${key}">
                    <div class="photo-kind-head">
                        <span class="photo-kind-title">📷 まだメモに入っていない写真</span>
                        <span class="photo-kind-hint">押すとメモの終わりに入ります。</span>
                    </div>
                    <div class="photo-thumbs">
                        ${rest.map((p) => `
                            <div class="photo-thumb" data-photo-id="${escapeHtml(p.id)}">
                                <img alt="${escapeHtml(label)}">
                                <button type="button" class="photo-no photo-no-btn"
                                    data-insert-ref="${key}" data-insert-no="${p.no}"
                                    title="メモに入れます">${p.no}</button>
                                <button type="button" class="photo-del" data-photo-id="${escapeHtml(p.id)}"
                                    title="この写真を捨てます">×</button>
                            </div>`).join('')}
                    </div>
                </div>`;
        };

        host.innerHTML = chosen.map((c) => `
            <section class="karte" data-karte="${c.key}">
                <div class="karte-head">
                    <span class="karte-icon">${c.icon}</span>
                    <span class="karte-title">${escapeHtml(c.name)}のカルテ</span>
                </div>
                <div class="karte-body">
                    ${c.key === 'color' ? '<div class="karte-color-slot"></div>' : ''}
                    <label class="karte-note-label">メモ<span class="karte-note-hint">（${escapeHtml(c.noteHint)}）</span></label>
                    <div class="karte-note" contenteditable="true" role="textbox" aria-multiline="true"
                         data-karte-note="${c.key}" data-placeholder="${escapeHtml(c.noteHint)}"
                         >${renderNoteWithRefs((recordKartes[c.key] || {}).note || '',
                              recordPhotos.filter((p) => p.kind === c.key)).html}</div>
                    ${photoArea(c.key, c.photoLabel, c.photoHint)}
                    ${!photoStoreOk ? '' : `
                    <div class="karte-bar">
                        <span class="karte-bar-side"></span>
                        <button type="button" class="karte-close-btn" data-karte-close="${c.key}">✕ 閉じる</button>
                        <span class="karte-bar-side karte-bar-right">
                            <button type="button" class="karte-cam-btn" data-karte-cam="${c.key}"
                                title="写真を撮る／ファイルから選ぶ">📷</button>
                            <span class="photo-menu" data-photo-menu="${c.key}" hidden>
                                <button type="button" data-photo-take="${c.key}">📷 撮る</button>
                                <button type="button" data-photo-pick="${c.key}">🖼 ファイルから選ぶ</button>
                            </span>
                        </span>
                        <input type="file" accept="image/*" capture="environment" hidden
                               data-photo-input="${c.key}" data-photo-source="camera">
                        <input type="file" accept="image/*" multiple hidden
                               data-photo-input="${c.key}" data-photo-source="files">
                    </div>`}
                </div>
            </section>`).join('')
            + (strays.length === 0 ? '' : `
            <section class="karte" data-karte="_stray">
                <div class="karte-head">
                    <span class="karte-icon">📷</span>
                    <span class="karte-title">区分の付いていない写真</span>
                </div>
                <div class="karte-body">
                    <div class="karte-note-hint">以前に入れた写真です。区分を選ぶとそちらに移せます。</div>
                    <div class="photo-thumbs">
                        ${strays.map((p) => `
                            <div class="photo-thumb" data-photo-id="${escapeHtml(p.id)}">
                                <img alt="写真">
                                <button type="button" class="photo-del" data-photo-id="${escapeHtml(p.id)}"
                                    title="この写真を外す">×</button>
                            </div>`).join('')}
                    </div>
                </div>
            </section>`);

        // 色の欄はカラーセラピーのカルテの中へ移す（同じ要素を動かす）。
        // 同じ入力欄を2つ作ると、保存の処理まで二重になるため。
        const slot = host.querySelector('.karte-color-slot');
        if (colorGroup && slot) slot.appendChild(colorGroup);

        host.querySelectorAll('.photo-thumb img').forEach((img) => {
            const id = img.closest('.photo-thumb').dataset.photoId;
            fillPhotoThumb(img, id);
            img.onclick = (e) => { e.preventDefault(); openPhotoViewer(id); };
        });

        // メモは写真を埋め込める欄。中身は文字に戻して持つ。
        host.querySelectorAll('[data-karte-note]').forEach((area) => {
            const key = area.dataset.karteNote;
            const sync = () => {
                recordKartes[key] = { ...(recordKartes[key] || {}), note: serializeKarteNote(area) };
                area.classList.toggle('is-empty', serializeKarteNote(area).trim() === '');
            };
            area.oninput = () => { sync(); refreshUnplaced(key); scheduleAutosave(); };
            // 書いている場所を覚えておく。写真はここへ入れる。
            // カメラやファイル選びから戻ると、カーソルは外れてしまう。
            const remember = () => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                if (area.contains(range.commonAncestorContainer)) noteCaret.set(key, range.cloneRange());
            };
            area.onkeyup = remember;
            area.onmouseup = remember;
            // blur では覚え直さない。欄から離れる瞬間、カーソルが先頭に
            // 潰れることがあり、そこを覚えると写真が頭に入ってしまう。

            // 戻ってきたときは、書いていた場所へカーソルを返す。
            // 写真を入れたあとに続きを書こうとして、先頭から書き始めて
            // しまうのを防ぐ。押した場所があればそちらが優先される。
            area.onfocus = () => {
                const saved = noteCaret.get(key);
                if (!saved || !area.contains(saved.commonAncestorContainer)) return;
                const sel = window.getSelection();
                if (!sel) return;
                sel.removeAllRanges();
                sel.addRange(saved);
            };
            area.classList.toggle('is-empty', serializeKarteNote(area).trim() === '');
            area.querySelectorAll('img[data-photo-fill]').forEach((img) => {
                fillPhotoThumb(img, img.dataset.photoFill);
            });

            // 写真を押したら、そのうしろへカーソルを置く。
            // 写真は編集できない塊なので、押しただけでは書く場所が決まらない。
            // メモが写真で埋まっていると、どこを押しても書けなくなる。
            area.onclick = (e) => {
                const badge = e.target.closest('.photo-no');
                const photo = e.target.closest('.note-photo');
                if (!photo) return;
                e.preventDefault();
                if (badge) {                       // 番号を押したときは大きく見せる
                    const img = photo.querySelector('img[data-photo-fill]');
                    if (img) openPhotoViewer(img.dataset.photoFill);
                    return;
                }
                let tail = photo.nextSibling;
                if (!tail || tail.nodeType !== 3) {
                    tail = document.createTextNode('\u200b');
                    photo.after(tail);
                }
                const r = document.createRange();
                r.setStart(tail, tail.data.startsWith('\u200b') ? 1 : 0);
                r.collapse(true);
                area.focus();
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(r);
                noteCaret.set(key, r.cloneRange());
            };
        });

        // カーソルの位置は selectionchange で追う。keyup だけでは、変換の確定や
        // 貼り付けで動いたぶんを取りこぼす。document に1つだけ持たせる。
        document.onselectionchange = () => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            const node = range.commonAncestorContainer;
            const el = node.nodeType === 3 ? node.parentElement : node;
            const area = el && el.closest ? el.closest('[data-karte-note]') : null;
            if (area) noteCaret.set(area.dataset.karteNote, range.cloneRange());
        };

        /** 控えの並びだけ描き直す。メモそのものは触らない（カーソルが飛ぶため） */
        function refreshUnplaced(key) {
            const section = host.querySelector(`.karte[data-karte="${key}"]`);
            if (!section) return;
            const old = section.querySelector('.photo-kind');
            const html = photoArea(key, (getServiceCategoryDef(key) || {}).photoLabel || '写真', '');
            const holder = document.createElement('div');
            holder.innerHTML = html;
            const fresh = holder.firstElementChild;
            if (old && fresh) old.replaceWith(fresh);
            else if (old && !fresh) old.remove();
            else if (!old && fresh) section.querySelector('.karte-note').after(fresh);
            wireUnplaced(section);
        }

        /** 控えの写真のボタンを繋ぐ */
        function wireUnplaced(scope) {
            scope.querySelectorAll('.photo-thumb img').forEach((img) => {
                const id = img.closest('.photo-thumb').dataset.photoId;
                fillPhotoThumb(img, id);
                img.onclick = (e) => { e.preventDefault(); openPhotoViewer(id); };
            });
            scope.querySelectorAll('.photo-del').forEach((btn) => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // 実物の削除は保存時の掃除に任せる。ここで消すと、
                    // 保存せずに閉じたときに元の写真まで失う。
                    recordPhotos = recordPhotos.filter((p) => p.id !== btn.dataset.photoId);
                    renderRecordKartes();
                    scheduleAutosave();
                };
            });
            scope.querySelectorAll('[data-insert-ref]').forEach((btn) => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const key = btn.dataset.insertRef;
                    const photo = recordPhotos.find((ph) => ph.kind === key
                        && ph.no === Number(btn.dataset.insertNo));
                    if (photo) insertPhotoIntoNote(key, photo, true);
                };
            });
        }

        /**
         * 写真をメモへ入れる。書いていた位置があればそこへ、無ければ終わりへ。
         *
         * メモそのものを描き直さないのが要点。描き直すとカーソルが飛び、
         * 続けて書けなくなる。
         */
        function insertPhotoIntoNote(key, photo, toEnd) {
            const area = host.querySelector(`[data-karte-note="${key}"]`);
            if (!area) return;
            const el = buildNotePhotoEl(photo);
            const range = toEnd ? null : noteCaret.get(key);

            // 写真は編集できない塊なので、そのうしろに文字の居場所を作る。
            // 作らないと、見た目のカーソルはうしろにあるのに、打った文字は
            // 先頭へ入ってしまう（カーソルの置ける場所が無いため）。
            const tail = document.createTextNode('\u200b');

            if (range && area.contains(range.commonAncestorContainer)) {
                range.deleteContents();
                range.insertNode(el);
                el.after(tail);
                const after = document.createRange();
                after.setStart(tail, 1);
                after.collapse(true);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(after);
                noteCaret.set(key, after.cloneRange());
            } else {
                area.appendChild(el);
                area.appendChild(tail);
            }
            recordKartes[key] = { ...(recordKartes[key] || {}), note: serializeKarteNote(area) };
            area.classList.remove('is-empty');
            scheduleAutosave();
        }

        function refreshUnplacedAll() {
            host.querySelectorAll('.karte[data-karte]').forEach((sec) => {
                const key = sec.dataset.karte;
                if (key !== '_stray') refreshUnplaced(key);
            });
        }

        // 📷 を押すと、撮るのとファイルから選ぶのを出す。
        // 端末によっては片方しか出ないことがあるので、こちらで分けて持つ。
        const closeMenus = () => host.querySelectorAll('[data-photo-menu]')
            .forEach((m) => { m.hidden = true; });
        host.querySelectorAll('[data-karte-cam]').forEach((btn) => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const menu = host.querySelector(`[data-photo-menu="${btn.dataset.karteCam}"]`);
                const wasOpen = menu && !menu.hidden;
                closeMenus();
                if (menu && !wasOpen) menu.hidden = false;
            };
        });
        host.querySelectorAll('[data-photo-take]').forEach((btn) => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeMenus();
                const input = host.querySelector(
                    `[data-photo-input="${btn.dataset.photoTake}"][data-photo-source="camera"]`);
                if (input) input.click();
            };
        });
        host.querySelectorAll('[data-photo-pick]').forEach((btn) => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeMenus();
                const input = host.querySelector(
                    `[data-photo-input="${btn.dataset.photoPick}"][data-photo-source="files"]`);
                if (input) input.click();
            };
        });
        host.onclick = (e) => { if (!e.target.closest('.karte-bar-right')) closeMenus(); };

        // ✕ 閉じる はその区分を外す。カルテが閉じるだけで、書いたものは残る
        host.querySelectorAll('[data-karte-close]').forEach((btn) => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 書く欄を閉じたら、その欄を開いていた施術内容も外す。
                // 押したものだけ残すと、閉じた欄がまた開いてしまう
                const gone = btn.dataset.karteClose;
                const drop = getServiceMenu().filter((m) => m.field === gone).map((m) => m.key);
                recordMenu.set(recordMenu.keys.filter((k) => !drop.includes(k)),
                    recordMenu.adhoc, document.getElementById('input-amount').value);
                recordCategories = recordCategories.filter((k) => k !== gone);
                renderRecordKartes();
                scheduleAutosave();
            };
        });

        host.querySelectorAll('[data-photo-input]').forEach((input) => {
            input.onchange = async (e) => {
                const kind = input.dataset.photoInput;
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                let added = 0;
                for (const file of files) {
                    try {
                        const meta = await savePhoto(file, { kind });
                        meta.no = nextPhotoNo(recordPhotos, kind);
                        recordPhotos.push(meta);
                        // 撮った・選んだその場で、書いている位置へ入れる
                        insertPhotoIntoNote(kind, meta, false);
                        added += 1;
                    } catch (err) {
                        showToast(err.message || '写真を保存できませんでした。', 'error');
                    }
                }
                input.value = '';
                if (added > 0) showToast(`写真を${added}枚入れました`, 'success');
                refreshUnplacedAll();
                scheduleAutosave();
            };
        });

        host.querySelectorAll('.karte').forEach((sec) => wireUnplaced(sec));
    }

    /** 記録に出すサムネイル列（カルテの一覧用） */
    function buildRecordPhotoMarksHtml(record) {
        const photos = Array.isArray(record.photos) ? record.photos : [];
        if (photos.length === 0) return '';
        return `<span class="photo-marks" title="写真 ${photos.length}枚">📷 ${photos.length}</span>`;
    }

    /** 一覧やカレンダーに出す、選ばれた区分のアイコン列 */
    function buildCategoryIconsHtml(record, { withName = false } = {}) {
        const cats = getServiceCategories(record);
        if (cats.length === 0) return '';
        return `<span class="service-cat-marks" title="${escapeHtml(cats.map((c) => c.name).join('・'))}">`
            + cats.map((c) => `<span class="service-cat-mark">${c.icon}${
                withName ? `<span class="service-cat-mark-name">${escapeHtml(c.name)}</span>` : ''}</span>`).join('')
            + '</span>';
    }

    let recordColors = [];
    /** アドバンスカラーを 'basic'(10色) と 'full'(17色) のどちらで出しているか */
    let recordAdvanceSet = 'basic';

    /** モーダルの色選択状態を差し替えて描き直す */
    function setRecordColors(colors, advanceSet) {
        recordColors = Array.isArray(colors) ? [...colors] : [];
        recordAdvanceSet = advanceSet === 'full' ? 'full' : 'basic';
        renderRecordColorPicker();
    }

    function renderRecordColorPicker() {
        const selectedEl = document.getElementById('record-color-selected');
        const tcEl = document.getElementById('record-color-chips-tc');
        const advEl = document.getElementById('record-color-chips-advance');
        if (!selectedEl || !tcEl || !advEl) return;

        // 選択中の色（クリックで解除）
        if (recordColors.length === 0) {
            selectedEl.innerHTML = '<span class="record-color-empty">未選択（選ばなかった場合は空のままで構いません）</span>';
        } else {
            selectedEl.innerHTML = recordColors.map((key) => {
                const label = getSoulColorName(key);
                return `<button type="button" class="record-color-tag" data-remove="${escapeHtml(key)}" title="クリックで外す">
                    ${buildCustomerColorIndicatorHtml({ soulColors: [key] })}
                    <span>${escapeHtml(label)}</span>
                    <span class="record-color-tag-x">×</span>
                </button>`;
            }).join('');
            selectedEl.querySelectorAll('[data-remove]').forEach((btn) => {
                btn.onclick = () => {
                    recordColors = recordColors.filter((k) => k !== btn.dataset.remove);
                    renderRecordColorPicker();
                    scheduleAutosave();
                };
            });
        }

        const renderChips = (container, defs) => {
            container.innerHTML = '';
            defs.forEach((c) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'record-color-chip' + (recordColors.includes(c.key) ? ' selected' : '');
                chip.title = c.name + (c.keywords ? `｜${c.keywords}` : '');
                const cssVal = getSoulColorCssValue(c.key);
                chip.style.background = cssVal;
                chip.setAttribute('aria-label', c.name);
                chip.onclick = () => {
                    // 同じ色をもう一度押したら外す。TCとアドバンスは同時に選べる。
                    recordColors = recordColors.includes(c.key)
                        ? recordColors.filter((k) => k !== c.key)
                        : [...recordColors, c.key];
                    renderRecordColorPicker();
                    scheduleAutosave();
                };
                container.appendChild(chip);
            });
        };

        renderRecordColorReference();
        renderChips(tcEl, TC_COLOR_DEFS);
        renderChips(
            advEl,
            recordAdvanceSet === 'full' ? ADVANCE_COLOR_DEFS : ADVANCE_COLOR_DEFS.filter((c) => c.isBasic)
        );

        document.querySelectorAll('.record-color-set-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.set === recordAdvanceSet);
            btn.onclick = () => {
                recordAdvanceSet = btn.dataset.set === 'full' ? 'full' : 'basic';
                // 表示から外れた色は選択も外す（17色→10色に戻したとき）
                const visible = (recordAdvanceSet === 'full'
                    ? ADVANCE_COLOR_DEFS
                    : ADVANCE_COLOR_DEFS.filter((c) => c.isBasic)).map((c) => c.key);
                recordColors = recordColors.filter(
                    (k) => !ADVANCE_COLOR_DEFS.some((c) => c.key === k) || visible.includes(k)
                );
                renderRecordColorPicker();
            };
        });
    }

    /**
     * 選ばれた色から、対応表（correspondence.js）が示す部位と精油を参考表示する。
     *
     * これは「候補の提示」であって処方ではない。処方欄への自動入力はしない。
     *   - 色は色彩心理学、精油の支配星は占星術の象徴体系で、根拠が別物のため
     *   - 禁忌・既往歴が常に優先されるため、機械が精油を書き込むと事故になる
     * そのため、顧客の注意事項を必ず同じ場所に並べて出す。
     */
    function renderRecordColorReference() {
        const host = document.getElementById('record-color-reference');
        if (!host) return;

        if (recordColors.length === 0) {
            host.innerHTML = '';
            host.style.display = 'none';
            return;
        }
        host.style.display = 'block';

        // 対象の顧客。編集中ならその記録の顧客、新規なら選択中の顧客。
        const targetId = editingRecord ? editingRecord.customerId
            : (inputRecordCustomerId && recordCustomerSelectGroup
                && recordCustomerSelectGroup.style.display === 'block'
                ? inputRecordCustomerId.value : selectedCustomerId);
        const customer = getCustomers().find((c) => String(c.id) === String(targetId));
        const { cautions, notes } = collectCustomerCautions(customer);

        // TCとアドバンスで同じ色相を選ぶことは普通にあり（緑とグリーンなど）、
        // そのまま並べると同じ行が重複する。色相でまとめ、由来のキーを併記する。
        const byHue = new Map();
        const unknown = [];
        recordColors.forEach((key) => {
            const corr = getCorrespondence(key);
            if (!corr) { unknown.push(key); return; }
            if (!byHue.has(corr.hue)) byHue.set(corr.hue, { corr, keys: [] });
            byHue.get(corr.hue).keys.push(key);
        });

        const rows = [...byHue.values()].map(({ corr, keys }) => {
            const from = keys.length > 1
                ? `<span class="record-ref-from">${keys.map((k) => escapeHtml(getSoulColorName(k))).join('・')}</span>`
                : '';
            return `<div class="record-ref-row">
                <span class="record-ref-name">${buildCustomerColorIndicatorHtml({ soulColors: [keys[0]] })}${escapeHtml(corr.hue)}${from}</span>
                <span class="record-ref-part">${corr.planet.symbol} ${escapeHtml(corr.planet.name)} ／ ${escapeHtml(corr.chakra.name)}　${escapeHtml(corr.chakra.area)}</span>
                <span class="record-ref-oils">${corr.planet.oils.map(escapeHtml).join('・')}</span>
            </div>`;
        }).concat(unknown.map((key) => `<div class="record-ref-row">
                <span class="record-ref-name">${escapeHtml(getSoulColorName(key))}</span>
                <span class="record-ref-none">対応表に載っていない色です</span></div>`)).join('');

        // どの欄から来たものかを添える。混ざったときに気づけるようにするため。
        const refRow = (row) => `<p><span class="record-ref-src">${escapeHtml(row.label)}:</span> ${escapeHtml(row.text)}</p>`;

        host.innerHTML = `
            <div class="record-ref-head">この色に対応する部位と精油（参考）</div>
            ${rows}
            ${cautions.length > 0 ? `
                <div class="record-ref-caution">
                    <strong>⚠️ この方の注意事項（精油の候補より優先）</strong>
                    ${cautions.map(refRow).join('')}
                </div>` : ''}
            ${notes.length > 0 ? `
                <div class="record-ref-memo">
                    <strong>📝 カルテのメモ（注意事項ではありません）</strong>
                    ${notes.map(refRow).join('')}
                    <p class="record-ref-hint">${escapeHtml(cautionSourceHint(cautions.length > 0))}</p>
                </div>` : ''}
            <div class="record-ref-note">
                象徴の対応づけであって効能ではありません。処方はご自身の判断で記入してください。
            </div>
        `;
    }

    // ------------------------------------------------------------------
    // AIの提案ボタン（アプリ内でここ1か所）
    //
    // 来店前は訴えがまだ無いので経過と予約日の星から、問診後は訴えと
    // 選ばれた色も足して作る。押す前にどちらになるかが分かるよう、
    // 訴え欄の中身に合わせてボタンの文字を変える。
    // ------------------------------------------------------------------

    const btnRecordSessionAdvice = document.getElementById('btn-record-session-advice');
    const recordAdviceHint = document.querySelector('#record-session-advice .session-advice-hint');

    /** 訴えが入っていれば問診後、空なら来店前 */
    function currentAdviceMode() {
        const el = document.getElementById('input-client-complaint');
        return el && el.value.trim() ? 'session' : 'prep';
    }

    /** ボタンの文字を、いまの入力に合わせて出し直す */
    function refreshAdviceButtonLabel() {
        if (!btnRecordSessionAdvice || btnRecordSessionAdvice.disabled) return;
        const isSession = currentAdviceMode() === 'session';
        btnRecordSessionAdvice.textContent = isSession
            ? '訴えを反映して作り直す' : '下ごしらえを作る';
        if (recordAdviceHint) {
            recordAdviceHint.textContent = isSession
                ? '今日の訴えと選んだ色まで踏まえた組み立て案を出し、処方・メモに入れます'
                : '経過・体質・この日の星から組み立て案を出し、処方・メモに入れます';
        }
    }

    const complaintInput = document.getElementById('input-client-complaint');
    if (complaintInput) complaintInput.addEventListener('input', refreshAdviceButtonLabel);

    // 使わない設定のときは、ここから先を組み立てない（ISSUE-083）。
    // 隠すだけだと、押せてしまうし、開くたびに提案を描き直しにも行く。
    const prepOn = () => isPrepEnabled();

    if (btnRecordSessionAdvice && prepOn()) {
        btnRecordSessionAdvice.addEventListener('click', async () => {
            const host = document.querySelector('#record-session-advice .session-advice-host');
            const targetId = editingRecord ? editingRecord.customerId
                : (recordCustomerSelectGroup && recordCustomerSelectGroup.style.display === 'block'
                    && inputRecordCustomerId ? inputRecordCustomerId.value : selectedCustomerId);
            const customer = getCustomers().find((c) => String(c.id) === String(targetId));

            if (!customer) {
                host.innerHTML = '<div class="session-advice-error">対象の顧客が特定できません。</div>';
                return;
            }
            const complaintEl = document.getElementById('input-client-complaint');
            const complaint = complaintEl ? complaintEl.value.trim() : '';
            const mode = complaint ? 'session' : 'prep';

            btnRecordSessionAdvice.disabled = true;
            btnRecordSessionAdvice.textContent = '生成中…';
            host.innerHTML = '';
            try {
                // 天体はこの記録の日付で引く（未入力なら今日）
                const dateEl = document.getElementById('input-date');
                const extra = { targetDate: (dateEl && dateEl.value) || undefined };
                if (mode === 'session') {
                    extra.todayComplaint = complaint;
                    extra.todayColors = recordColors.map(getSoulColorName);
                }
                const { data, ctx } = await requestSessionAdvice(customer, mode, extra);
                renderSessionAdvice(host, data, ctx);

                // 案内中と、キーが無いときの見本文は、画面の欄までは入れるが
                // 記録には保存しない。見せるための操作で記録が書き換わるのは
                // 筋が違う一方、欄に入る様子まで隠すと説明と画面が食い違う。
                writeAdviceIntoForm(customer, data, ctx, host, {
                    persist: !data.isDemo && !isDemoRunning
                });
            } catch (err) {
                host.innerHTML = `<div class="session-advice-error">${escapeHtml(err.message)}</div>`;
            } finally {
                btnRecordSessionAdvice.disabled = false;
                refreshAdviceButtonLabel();
            }
        });
    }

    /**
     * 生成した提案を、開いているカルテの欄へ入れる。
     * 判断は画面の値で行う（保存済みの値より、いま書かれているほうが新しい）。
     *
     * @param persist false なら欄に入れるだけで記録には保存しない。案内中と、
     *                キーが無いときの見本文がこれにあたる。セラピストが
     *                「更新する」を押せば、そのとき通常どおり保存される。
     */
    function writeAdviceIntoForm(customer, data, ctx, host, { persist = true } = {}) {
        const prescEl = document.getElementById('input-prescription');
        const noteEl = document.getElementById('input-therapist-note');
        const current = {
            prescription: prescEl ? prescEl.value : '',
            therapistNote: noteEl ? noteEl.value : ''
        };
        // 編集中の既存記録。新規追加の途中なら記録はまだ無いので、欄だけ埋める。
        const record = (persist && editingRecord)
            ? (customer.records || []).find((r) => String(r.id) === String(editingRecord.recordId))
            : null;

        const run = (force) => {
            const applied = applyAdviceToRecord(customer.id, record || null, data, ctx, { force, current });
            if (applied.values.prescription && prescEl) prescEl.value = applied.values.prescription;
            if (applied.values.therapistNote && noteEl) noteEl.value = applied.values.therapistNote;
            return applied;
        };

        const applied = run(false);
        renderPrepApplied(host, applied, () => {
            run(true);
            showToast(persist ? '提案で差し替えました。' : '欄を差し替えました（保存は「更新する」で）。', 'success');
            if (persist) renderCalendar();
        }, { persist });
    }

    /** 記録に保存するアドバンスのセット。アドバンスの色を選んでいなければ null */
    function getRecordAdvanceSet() {
        const usedAdvance = recordColors.some((k) => ADVANCE_COLOR_DEFS.some((c) => c.key === k));
        return usedAdvance ? recordAdvanceSet : null;
    }

    /** 時間帯セレクトに無い値なら、その値を選択肢として追加する */
    function ensureTimeOption(time) {
        const sel = document.getElementById('input-time');
        if (!sel) return;
        // 前回開いたときに足した選択肢は毎回捨てる（開くたびに増えないように）
        Array.from(sel.options).forEach(o => { if (o.dataset.injected) o.remove(); });
        if (!time) return;
        const exists = Array.from(sel.options).some(o => o.value === time);
        if (exists) return;
        const opt = document.createElement('option');
        opt.value = time;
        opt.textContent = time;
        opt.dataset.injected = 'true';
        sel.appendChild(opt);
    }

    /** 既存記録を読み込んでモーダルを編集モードで開く */
    function openRecordEditor(customerId, recordId) {
        const customer = getCustomers().find(c => c.id === customerId);
        const record = customer && (customer.records || []).find(r => r.id === recordId);
        if (!record) {
            showToast('対象の施術記録が見つかりませんでした。', 'error');
            return;
        }

        editingRecord = { customerId, recordId };

        const setVal = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value != null ? value : '';
        };
        setVal('input-date', record.date);
        // 「13:00 - 14:30」のような時間帯は選択肢に無く、そのままだと空欄になって
        // 更新時に時間が消える。既存の値は選択肢として補ってから設定する。
        ensureTimeOption(record.time);
        setVal('input-time', record.time);
        setVal('input-type', record.type);
        setVal('input-client-complaint', record.clientComplaint);
        setVal('input-prescription', record.prescription);
        setVal('input-therapist-note', record.therapistNote);
        setVal('input-amount', record.amount);
        // その日選ばれた色。保存時のセット（10色/17色）も一緒に戻す
        setRecordColors(record.colors || [], record.advanceSet || getAdvanceSetPreference());
        setRecordCategories(record.categories || []);
        loadRecordMenu(record);
        setRecordPhotos(record.photos || []);
        setRecordKartes(record.kartes || {});
        renderRecordKartes();

        // 押す前にどちらのモードになるかを、訴えの中身から出し直す
        refreshAdviceButtonLabel();

        // すでに作ってある提案は、開いたときにそのまま読めるようにする。
        // 開くたびに作り直させると、無料枠を無駄に減らしてしまう。
        const savedAdvice = record.prepAdvice;
        const adviceHost2 = document.querySelector('#record-session-advice .session-advice-host');
        // 使わない設定なら描き直さない。**記録は消えていない**ので、
        // 使う設定に戻せば、この提案はまたここに出る（ISSUE-083）
        if (isPrepEnabled() && savedAdvice && savedAdvice.advice && adviceHost2) {
            renderSessionAdvice(adviceHost2, savedAdvice, { excludedOils: savedAdvice.excludedOils || [] });
            const stamp = document.createElement('div');
            stamp.className = 'prep-saved-stamp';
            stamp.textContent = `${formatPrepStamp(savedAdvice.generatedAtISO)}に作った提案です`;
            adviceHost2.insertBefore(stamp, adviceHost2.firstChild);
        }

        // 下ごしらえが自動で入ったまま、まだ手を入れていない状態なら知らせる。
        // AIの下書きをそのまま確定させてしまわないための札。
        const prepNotice = document.getElementById('record-prep-filled');
        if (prepNotice) {
            if (record.prepFilledAt && isPrepEnabled()) {
                prepNotice.innerHTML = `下の処方・メモは、${escapeHtml(formatPrepStamp(record.prepFilledAt))}の下ごしらえから自動で入ったものです。`
                    + `内容を確認して、必要なら書き直してから更新してください。`;
                prepNotice.style.display = 'block';
            } else {
                prepNotice.style.display = 'none';
                prepNotice.innerHTML = '';
            }
        }

        // 下書きは新規のぶんだけ。すでにある記録を開いたときに当てると、
        // 別の日の書きかけで上書きしてしまう。

        // 既存記録の場合は読み取り専用モードで開始
        setRecordFormReadonly(true);

        // 編集時は対象顧客が確定しているため、顧客選択セレクトは隠す
        if (recordCustomerSelectGroup) recordCustomerSelectGroup.style.display = 'none';
        // 予約とカルテは同じ記録で、違うのは日付だけ。
        // これから先の日を開いたときに「施術記録」と出ると、
        // もう済んだことのように読めてしまう。
        if (recordModalTitle) {
            recordModalTitle.textContent = record.date > toDateStr(new Date())
                ? '予約の内容'
                : '施術記録の編集';
        }
        if (btnSubmitRecord) btnSubmitRecord.textContent = '更新する';
        refreshRecordTimeWarning();
        if (recordModal) recordModal.classList.add('active');
    }

    // 記録カードの編集ボタンから呼ばれるコールバックを登録
    onRecordEditRequested = openRecordEditor;
    // 記録の削除などでカレンダーを描き直してもらうためのコールバック
    onRecordsChanged = () => renderCalendar();

    if (btnCancelRecord) {
        btnCancelRecord.addEventListener('click', () => {
            if (recordModal) recordModal.classList.remove('active');
            resetRecordModal();
        });
    }
    if (recordModal) {
        recordModal.addEventListener('click', (e) => {
            if (e.target === recordModal) {
                recordModal.classList.remove('active');
                resetRecordModal();
            }
        });
    }

    // レコードフォーム送信処理
    if (btnSubmitRecord) {
        btnSubmitRecord.addEventListener('click', () => {
            const dateEl = document.getElementById('input-date');
            const date = dateEl ? dateEl.value : '';
            const timeEl = document.getElementById('input-time');
            const time = timeEl ? timeEl.value : '';
            const typeEl = document.getElementById('input-type');
            const type = typeEl ? typeEl.value : '';
            const clientComplaintEl = document.getElementById('input-client-complaint');
            const clientComplaint = clientComplaintEl ? clientComplaintEl.value : '';
            const prescriptionEl = document.getElementById('input-prescription');
            const prescription = prescriptionEl ? prescriptionEl.value : '';
            const therapistNoteEl = document.getElementById('input-therapist-note');
            const therapistNote = therapistNoteEl ? therapistNoteEl.value : '';
            const amountEl = document.getElementById('input-amount');
            // 空欄は空欄のまま送る。0 に丸めると「無料だった」と区別が付かない（ISSUE-063）。
            const rawAmount = amountEl ? String(amountEl.value).trim() : '';
            const amount = rawAmount === '' ? '' : (parseInt(rawAmount, 10) || 0);

            // 予約を取る時点では、内容も金額もまだ決まっていない。
            // それを必須にすると、忘れないうちに日付だけ押さえる、ができない。
            // **決まっているのは日だけ**という状態を、そのまま保存できるようにする（ISSUE-063）。
            if (!date) {
                showToast('来店日だけは入れてください。', 'error');
                return;
            }

            // [ISSUE-020] 編集モードなら既存記録を更新して終了する
            if (editingRecord) {
                const result = updateRecord(editingRecord.customerId, editingRecord.recordId, {
                    date, type, amount, time, clientComplaint, prescription, therapistNote,
                    colors: [...recordColors], advanceSet: getRecordAdvanceSet(),
                    categories: [...recordCategories],
                    menu: recordMenu.keys,
                    menuAmounts: recordMenu.adhoc,
                    photos: [...recordPhotos],
                    kartes: { ...recordKartes },
                    // セラピストが目を通して更新した時点で、自動で入った状態ではなくなる
                    prepFilledAt: null
                });
                const editedCustomerId = editingRecord.customerId;

                // [ISSUE-NEW] 下書きを消去
                clearRecordDraft(editedCustomerId);

                if (recordModal) recordModal.classList.remove('active');
                resetRecordModal();

                if (!result) {
                    showToast('施術記録の更新に失敗しました。', 'error');
                    return;
                }
                renderCalendar();          // 日付を変更した場合にドットを追従させる
                showCustomerDetail(editedCustomerId);
                return;
            }

            let targetId = selectedCustomerId;
            const isFromCalendar = (recordCustomerSelectGroup && recordCustomerSelectGroup.style.display === 'block');
            if (isFromCalendar && inputRecordCustomerId) {
                targetId = inputRecordCustomerId.value;
            }

            if (!targetId) {
                showToast('対象の顧客が選択されていません。', 'error');
                return;
            }

            // 同じ時間帯に他の予約があれば、いったん確かめる（ISSUE-066）。
            // **この画面と、トップ📅の予約画面の両方に入れる。**
            // 片方だけ直して取りこぼす形は、ISSUE-060・ISSUE-065 と続いている。
            const clashes066 = findTimeClashes(findDayBookings(getCustomers(), date), time);
            if (clashes066.length > 0) {
                showConfirmModal({
                    title: '同じ時間に予約があります',
                    message: `${date.replace(/-/g, '/')} ${time} には、すでに`
                        + `${clashes066.map(describeBooking).join('／')} が入っています。`
                        + `このまま追加しますか？`,
                    actionText: 'このまま追加する',
                    icon: '⏰',
                    theme: 'warning',
                    onConfirm: () => finishNewRecord(targetId, isFromCalendar)
                });
                return;
            }

            finishNewRecord(targetId, isFromCalendar);
            return;

            function finishNewRecord(targetId, isFromCalendar) {
            const updated = addRecord(targetId, date, type, amount, time, clientComplaint, prescription, therapistNote,
                { colors: [...recordColors], advanceSet: getRecordAdvanceSet(),
                  categories: [...recordCategories], photos: [...recordPhotos],
                  menu: recordMenu.keys, menuAmounts: recordMenu.adhoc,
                  kartes: { ...recordKartes } });
            
            // [ISSUE-NEW] 下書きを消去
            clearRecordDraft(targetId);

            if (recordModal) recordModal.classList.remove('active');
            if (recordForm) recordForm.reset();

            if (updated) {
                if (isFromCalendar) {
                    renderCalendar();
                    // この日の来店記録を再構築して詳細を描画
                    const customers = getCustomers();
                    const dailyVisits = [];
                    customers.forEach(cust => {
                        if (cust.records) {
                            cust.records.forEach(rec => {
                                if (rec.date === date) {
                                    dailyVisits.push({ customer: cust, record: rec });
                                }
                            });
                        }
                    });
                    showCalendarDayDetails(date, dailyVisits);
                } else {
                    showCustomerDetail(selectedCustomerId);
                }
            }
            }
        });
    }

    // テキストエリア自動リサイズ (新規登録モーダルのメモ欄用)
    if (inputMemo) {
        inputMemo.addEventListener('input', () => {
            inputMemo.style.height = 'auto';
            inputMemo.style.height = inputMemo.scrollHeight + 'px';
        });
    }
    if (inputInitialConsultation) {
        inputInitialConsultation.addEventListener('input', () => {
            inputInitialConsultation.style.height = 'auto';
            inputInitialConsultation.style.height = inputInitialConsultation.scrollHeight + 'px';
        });
    }

    // 5. テーマスライダーの制御
    const themeSlider = document.getElementById('theme-slider');
    const root = document.documentElement;
    /**
     * 文字の色は、背景と同じようには混ぜられない。
     *
     * 背景を暗→明に、文字を明→暗に混ぜると、途中で両方が同じ灰色に
     * なって字が消える。実際に中ほどで読めなくなっていた。
     *
     * そこで文字と差し色だけは、明るいか暗いかの二択にして、途中で
     * 切り替える。背景はなめらかに変えたままでよい。
     */
    const applyThemeBlend = (val) => {
        const n = Math.max(0, Math.min(100, Number(val) || 0));
        root.style.setProperty('--theme-blend', n + '%');
        root.style.setProperty('--text-blend', n >= 50 ? '100%' : '0%');
        root.classList.toggle('is-light', n >= 50);
    };

    if (themeSlider) {
        let savedBlend = '0';
        try {
            savedBlend = localStorage.getItem('theme-blend') || '0';
        } catch (e) {
            console.warn('Brave/Browser security policy blocked localStorage read for theme.', e);
        }
        themeSlider.value = savedBlend;
        applyThemeBlend(savedBlend);

        themeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            applyThemeBlend(val);
            try {
                localStorage.setItem('theme-blend', val);
            } catch (err) {
                console.warn('Brave/Browser security policy blocked localStorage write for theme.', err);
            }
        });
    }

    // 6. カレンダー ＆ カラー設定ビュー制御
    const btnViewList = document.getElementById('btn-view-list');
    const btnViewCalendar = document.getElementById('btn-view-calendar');
    const btnViewColorSettings = document.getElementById('btn-view-color-settings');
    const btnViewAdvice = document.getElementById('btn-view-advice');

    const searchContainerSection = document.getElementById('search-container-section');
    const calendarViewContainer = document.getElementById('calendar-view-container');
    const colorSettingsViewContainer = document.getElementById('color-settings-view-container');
    const adviceViewContainer = document.getElementById('advice-view-container');
    const btnViewAstroAroma = document.getElementById('btn-view-astro-aroma');
    const astroAromaViewContainer = document.getElementById('astro-aroma-view-container');

    const calendarPrevBtn = document.getElementById('calendar-prev-btn');
    const calendarNextBtn = document.getElementById('calendar-next-btn');
    const calendarMonthTitle = document.getElementById('calendar-month-title');
    const calendarGridBody = document.getElementById('calendar-grid-body');
    const calendarDayDetails = document.getElementById('calendar-day-details');
    const calendarDetailsTitle = document.getElementById('calendar-details-title');
    const calendarVisitsContainer = document.getElementById('calendar-visits-container');
    const btnCalendarAddRecord = document.getElementById('btn-calendar-add-record');
    const recordCustomerSelectGroup = document.getElementById('record-customer-select-group');
    const inputRecordCustomerId = document.getElementById('input-record-customer-id');

    // ------------------------------------------------------------------
    // 「その他」の棚卸し
    //
    // 自由に書ける欄は放っておくと散らかる。ここで一覧にして、
    // 同じものは寄せ、何人にも出てくるものは正式な選択肢に上げてもらう。
    // ------------------------------------------------------------------

    /** 棚卸し画面で選んでいるもの。「kind:代表の表記」で持つ */
    let freeTextPicked = new Set();

    // ------------------------------------------------------------------
    // データの書き出しと読み込み
    //
    // このアプリのデータは、そのブラウザの中にしかない。端末を変えれば
    // 引き継げず、ブラウザのデータを消せば消える。持ち出せる形が要る。
    //
    // 写真も一緒に入れる。メモの [1] だけ渡っても、肝心の写真が無ければ
    // 読めない。
    // ------------------------------------------------------------------
    const BACKUP_VERSION = 1;

    function setBackupStatus(text, kind) {
        const el = document.getElementById('backup-status');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'backup-status' + (kind ? ` is-${kind}` : '');
    }

    async function renderBackupUsage() {
        const el = document.getElementById('backup-usage');
        if (!el) return;
        const customers = getCustomers();
        const records = customers.reduce((n, c) => n + (c.records || []).length, 0);
        let photos = { count: 0, bytes: 0 };
        try { photos = await getPhotoUsage(); } catch (e) { /* 使えない端末 */ }
        el.textContent = `顧客 ${customers.length}名 ／ 記録 ${records}件 ／ 写真 ${photos.count}枚（${formatBytes(photos.bytes)}）`;
    }

    /**
     * 控えを取ってから、どれだけ空いたかを出す。
     *
     * 置き場が壊れたときに残るのは端末の中のぶんだけ。悪意より事故のほうが
     * 確率は高いので、忘れていることだけは伝える。
     * 毎回言うと読まなくなるので、日数が空いたときにしか出さない。
     */
    function renderBackupReminder() {
        const el = document.getElementById('backup-reminder');
        if (!el) return;
        const r = getBackupReminder();
        if (!r) {
            const last = getLastBackupAt();
            el.className = 'backup-reminder ok';
            el.textContent = last
                ? `最後に控えを取ったのは ${String(last).slice(0, 10).replace(/-/g, '/')} です。`
                : '';
            el.style.display = last ? '' : 'none';
            return;
        }
        el.className = 'backup-reminder warn';
        el.style.display = '';
        el.textContent = r.kind === 'never'
            ? `⚠ まだ一度も控えを取っていません（顧客 ${r.customers}名 ／ 記録 ${r.records}件）。`
                + '置き場が使えなくなると、この端末のぶんしか残りません。'
            : `⚠ 控えを取ってから ${r.days}日たっています（目安は ${BACKUP_REMIND_DAYS}日）。`
                + '「📤 書き出す」を押して、ファイルを1つ保存しておいてください。';
    }

    async function exportAllData() {
        setBackupStatus('書き出しています…');
        let photos = [];
        try { photos = await exportAllPhotos(); } catch (e) { /* 写真が無い端末 */ }
        const payload = {
            app: 'therapist-crm',
            version: BACKUP_VERSION,
            exportedAtISO: new Date().toISOString(),
            customers: getCustomers(),
            // 消したことの控え。書き出したファイルから読み戻したときに、
            // 消したはずのものが生き返らないようにする。
            deletions: getDeletions(),
            colorMasters: JSON.parse(localStorage.getItem('therapist_color_masters') || '[]'),
            freeTextMerges: JSON.parse(localStorage.getItem('therapist_freetext_merges') || '{}'),
            photos
        };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        a.href = url;
        a.download = `therapist-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        markBackupDone(payload.exportedAtISO);
        renderBackupReminder();
        setBackupStatus(`書き出しました（写真 ${photos.length}枚を含む）`, 'ok');
    }

    /**
     * 読み込み。いまあるものは消さず、足りないものだけ入れる。
     *
     * 消してから入れると、間違ったファイルを読ませたときに元へ戻せない。
     * 同じ顧客・同じ記録は、新しいほうを残す。
     */
    /**
     * 別の控えを、いまあるものへ突き合わせる。
     *
     * ファイルの読み込みと OneDrive の同期で、同じものを使う。
     * 突き合わせ方が2つあると、片方だけ直したときに食い違う。
     *
     * @returns { added, addedRecords, updatedRecords } / 形式違いなら null
     */
    /** 中身が同じか。書いていないのに「食い違い」と言わないため */
    function sameFieldValue(a, b) {
        if (a === b) return true;
        if (a == null && b == null) return true;
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }

    /**
     * 同じ記録どうしを、項目ごとに突き合わせる。
     *
     * 記録まるごとで新旧を決めると、パソコンで訴えを書き、スマホでメモを
     * 書いただけで、あとに書いたほうが記録ごと差し替わり、片方が黙って消えていた。
     * 項目ごとに見れば、別々の項目を書いたぶんは両方残る。
     *
     * 同じ項目を両方で書いたときだけ食い違う。そのときは新しいほうを採り、
     * 古いほうは捨てずに控えとして残す。消えるものを作らないため。
     *
     * @returns 何か変わったら true
     */
    function mergeRecordFields(mine, theirs) {
        const myAt = mine.fieldsAtISO || {};
        const theirAt = theirs.fieldsAtISO || {};
        /**
         * その項目を、いつ書いたか。
         *
         * 刻みが無いときの扱いに気を付ける。項目ごとの時刻を持っている
         * 記録で刻みが無いなら、その項目は「一度も書いていない」ということ。
         * ここで記録ぜんぶの時刻を当ててしまうと、**触っていない空欄が、
         * 相手の書き込みを押しのける**。
         * 項目ごとの時刻をまだ持たない古い記録のときだけ、全体の時刻で代用する。
         */
        const at = (rec, map, key) => {
            if (map[key]) return String(map[key]);
            return rec.fieldsAtISO ? '' : String(rec.updatedAtISO || '');
        };
        let changed = false;

        RECORD_FIELDS.forEach((key) => {
            if (!(key in theirs)) return;
            if (sameFieldValue(mine[key], theirs[key])) return;

            const mineAt = at(mine, myAt, key);
            const theirsAt = at(theirs, theirAt, key);
            if (theirsAt <= mineAt) return;      // こちらのほうが新しい。同時刻ならこちらを残す

            // 向こうのほうが新しい。こちらに中身があったなら、消さずに控える。
            // 空欄が押しのけられただけなら、控える意味が無い。
            if (isFilledField(mine[key]) && mineAt) {
                mine.overwritten = Array.isArray(mine.overwritten) ? mine.overwritten : [];
                const already = mine.overwritten.some(
                    (o) => o.field === key && sameFieldValue(o.value, mine[key]));
                if (!already) {
                    mine.overwritten.push({ field: key, value: mine[key], atISO: mineAt });
                }
            }

            mine[key] = theirs[key];
            myAt[key] = theirsAt;
            changed = true;
        });

        if (changed) {
            mine.fieldsAtISO = myAt;
            if (String(theirs.updatedAtISO || '') > String(mine.updatedAtISO || '')) {
                mine.updatedAtISO = theirs.updatedAtISO;
            }
        }

        // 相手が持っている「押しのけられた控え」も引き継ぐ。
        // ただし期限切れは受け取らない。受け取ると、こちらで落としたものが
        // **相手から戻ってきて、いつまでも消えない**（ISSUE-076）。
        const incoming = pruneOverwrittenList(theirs.overwritten);
        if (incoming.length) {
            mine.overwritten = Array.isArray(mine.overwritten) ? mine.overwritten : [];
            incoming.forEach((o) => {
                const dup = mine.overwritten.some(
                    (x) => x.field === o.field && x.atISO === o.atISO && sameFieldValue(x.value, o.value));
                if (!dup) { mine.overwritten.push(o); changed = true; }
            });
        }

        // こちらの控えも、この場で期限切れを落とす。
        // 同期のたびに通る道なので、ここに置けば黙って片づいていく。
        if (Array.isArray(mine.overwritten)) {
            const kept = pruneOverwrittenList(mine.overwritten);
            if (kept.length !== mine.overwritten.length) {
                if (kept.length) mine.overwritten = kept;
                else delete mine.overwritten;
                changed = true;
            }
        }
        return changed;
    }

    function mergeSnapshot(payload) {
        if (!payload || payload.app !== 'therapist-crm' || !Array.isArray(payload.customers)) return null;

        const mine = getCustomers();
        const byId = new Map(mine.map((c) => [String(c.id), c]));
        let addedCustomers = 0;
        let addedRecords = 0;
        let updatedRecords = 0;
        let removed = 0;

        /** どちらが新しいか。時刻が無いものは「古い」として扱う */
        const newer = (a, b) => String(a && a.updatedAtISO || '') > String(b && b.updatedAtISO || '');

        // 消したことの控えを、両側から集める。
        // 同じ id が両方にあれば、あとに消したほうの時刻を採る。
        const tomb = getDeletions();
        const incTomb = (payload.deletions && typeof payload.deletions === 'object') ? payload.deletions : {};
        ['customers', 'records'].forEach((kind) => {
            Object.entries(incTomb[kind] || {}).forEach(([id, iso]) => {
                if (!tomb[kind][id] || String(iso) > String(tomb[kind][id])) tomb[kind][id] = String(iso);
            });
        });

        /**
         * 消したままにしてよいか。
         *
         * 控えより「あとに」書き換えられていれば、消したあとに誰かが
         * 書き直したということなので、残す。時刻が同じなら残す。
         * 迷ったら残す——消し損ねは直せるが、消しすぎは直せない。
         */
        const deletedAfterEdit = (kind, id, item) => {
            const at = tomb[kind][String(id)];
            if (!at) return false;
            return String(at) > String((item && item.updatedAtISO) || '');
        };

        payload.customers.forEach((inc) => {
            const cur = byId.get(String(inc.id));
            if (!cur) {
                // 消したはずの顧客なら、足し戻さない
                if (deletedAfterEdit('customers', inc.id, inc)) return;
                mine.push(inc);
                byId.set(String(inc.id), inc);
                addedCustomers += 1;
                addedRecords += (inc.records || []).length;
                return;
            }

            // 同じ顧客。あとから書いたほうを残す。
            // 「無いものだけ足す」にすると、別の端末での書き直しが黙って消える。
            const incRecords = inc.records || [];
            const curRecords = cur.records || [];
            const byRecId = new Map(curRecords.map((r) => [String(r.id), r]));

            incRecords.forEach((r) => {
                const hit = byRecId.get(String(r.id));
                if (!hit) {
                    // 消したはずの記録なら、足し戻さない。ここが今回の要。
                    if (deletedAfterEdit('records', r.id, r)) return;
                    curRecords.push(r);
                    byRecId.set(String(r.id), r);
                    addedRecords += 1;
                    return;
                }
                if (mergeRecordFields(hit, r)) updatedRecords += 1;
            });

            // 別の端末で消されたものを、こちらからも落とす。
            // 落とすのは、控えより「あとに」書き換えていないものだけ。
            const kept = curRecords.filter((r) => !deletedAfterEdit('records', r.id, r));
            removed += curRecords.length - kept.length;
            cur.records = kept.sort((a, b) => String(b.date).localeCompare(String(a.date)));

            // 顧客そのもの（名前・体質など）も、あとから書いたほうを残す
            if (newer(inc, cur)) {
                const { records, ...profile } = inc;
                Object.assign(cur, profile);
            }
        });

        // 別の端末で消された顧客を、こちらからも落とす
        const keptCustomers = mine.filter((c) => !deletedAfterEdit('customers', c.id, c));
        removed += mine.length - keptCustomers.length;

        saveDeletions(tomb);
        if (!saveCustomers(keptCustomers)) return { failed: true };
        return { addedCustomers, addedRecords, updatedRecords, removed };
    }

    async function importAllData(file) {
        setBackupStatus('読み込んでいます…');
        let payload;
        try {
            payload = JSON.parse(await file.text());
        } catch (e) {
            setBackupStatus('このファイルは読めませんでした。書き出したファイルをお選びください。', 'error');
            return;
        }
        const r = mergeSnapshot(payload);
        if (!r) {
            setBackupStatus('このアプリで書き出したファイルではないようです。', 'error');
            return;
        }
        if (r.failed) {
            const err = getLastSaveError();
            setBackupStatus(`⚠ ${err ? err.message : '保存できませんでした。'}`, 'error');
            return;
        }

        let addedPhotos = 0;
        try { addedPhotos = await importPhotos(payload.photos || []); } catch (e) { /* 写真が使えない端末 */ }

        setBackupStatus(
            `読み込みました。追加：顧客 ${r.addedCustomers}名・記録 ${r.addedRecords}件・写真 ${addedPhotos}枚`
            + `／ 新しいほうに差し替え：記録 ${r.updatedRecords}件`, 'ok');
        renderCustomerList(searchInput ? searchInput.value : '');
        renderBackupUsage();
    }

    // ------------------------------------------------------------------
    // OneDrive との同期
    //
    // localStorage が「書く場所」、OneDrive は写しの置き場。施術中に通信が
    // 切れても書けなくなっては困るので、書き込みは今までどおりローカルへ
    // 一瞬で終わらせ、写すのはそのあと背後で行う。
    //
    // 写真は1枚ずつ別のファイルにする。まとめて1つにすると、1枚足すたびに
    // 全部を上げ直すことになる。
    // ------------------------------------------------------------------
    const LAST_SYNC_KEY = 'therapist_last_sync';
    let syncing = false;

    function setSalonStatus(text, kind) {
        const el = document.getElementById('salon-status');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'backup-status' + (kind ? ` is-${kind}` : '');
    }

    // 置き場ごとに最後の同期時刻を分けて覚える。OneDrive とフォルダを
    // 併用したときに、片方の時刻がもう片方の顔をして出てしまわないように。
    function lastSyncKeyFor(store) {
        return store && store.key && store.key !== 'cloud'
            ? `${LAST_SYNC_KEY}_${store.key}` : LAST_SYNC_KEY;
    }

    function lastSyncLabel(store) {
        try {
            const iso = localStorage.getItem(lastSyncKeyFor(store));
            if (!iso) return 'まだ同期していません';
            const d = new Date(iso);
            return `最後の同期：${d.getMonth() + 1}/${d.getDate()} `
                + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } catch (e) {
            return '';
        }
    }

    // ------------------------------------------------------------------
    // サロンの置き場と同期（合言葉ひとつ。サインインも登録もない）
    //
    // 送る前にこの端末で暗号化するので、置き場からは中身が読めない。
    // 合言葉から作った「認証用の値」だけをサーバーに預ける形にしてあり、
    // それを握っても暗号化の鍵は割り出せない。
    // ------------------------------------------------------------------
    function renderSalonPanel() {
        const stateEl = document.getElementById('salon-state');
        const actionsEl = document.getElementById('salon-actions');
        if (!stateEl || !actionsEl) return;

        const cfg = getStoreConfig();

        // 「はじめての設定」は、置き場を用意する側の作業。セラピストが
        // することではない。しかも以前は「つながっていないとき」に自動で
        // 開いていた。それは新しい端末で合言葉を入れようとしている人に、
        // ちょうど開いて見えるということで、いちばん見せたくない相手に
        // 見せていた。ふだんは出さず、#salon-key を付けたときだけ出す。
        const setup = document.getElementById('salon-setup');
        if (setup) {
            const wanted = (location.hash || '') === '#salon-key';
            setup.hidden = !wanted;
            setup.open = wanted;
        }

        if (!isStoreConnected()) {
            stateEl.className = 'cloud-state';
            stateEl.textContent = 'まだつながっていません。合言葉を入れてください。';
            actionsEl.innerHTML = '<div class="salon-pass">'
                + `<input type="password" id="input-salon-pass" class="form-control" autocomplete="off"
                        placeholder="${STORE_MIN_PASSPHRASE}文字以上の合言葉">`
                + '<button type="button" id="btn-salon-connect" class="btn-primary">つなぐ</button>'
                + '</div>';
        } else {
            stateEl.className = 'cloud-state is-on';
            stateEl.textContent = `つながっています。${lastSyncLabel(SALON_STORE)}`;
            actionsEl.innerHTML = '<button type="button" id="btn-salon-sync" class="btn-primary">'
                + '🔄 いま同期する</button>'
                + `<label class="cloud-auto"><input type="checkbox" id="chk-salon-auto"${
                    cfg.autoSync ? ' checked' : ''}> 開いたときに自動で同期</label>`
                + '<button type="button" id="btn-salon-disconnect" class="cloud-disconnect">合言葉を消す</button>';
        }

        const connectBtn = document.getElementById('btn-salon-connect');
        if (connectBtn) {
            const input = document.getElementById('input-salon-pass');
            const go = async () => {
                const v = input ? input.value.trim() : '';
                setSalonStatus('確かめています…');
                try {
                    await connectStore(v);
                    setSalonStatus('つながりました。同期します…', 'ok');
                    renderSalonPanel();
                    runSync({ manual: true, store: SALON_STORE });
                } catch (e) {
                    setSalonStatus(`⚠ ${e.message}`, 'error');
                }
            };
            connectBtn.onclick = go;
            if (input) input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
        }
        const syncBtn = document.getElementById('btn-salon-sync');
        if (syncBtn) syncBtn.onclick = () => runSync({ manual: true, store: SALON_STORE });
        const offBtn = document.getElementById('btn-salon-disconnect');
        if (offBtn) {
            offBtn.onclick = () => {
                showConfirmModal({
                    title: '合言葉を消す',
                    message: 'この端末から合言葉を消します。置いてあるものはそのまま残ります。'
                        + '同じ合言葉を入れれば、また読めます。',
                    actionText: '消す',
                    icon: '🔑',
                    theme: 'warning',
                    onConfirm: () => { disconnectStore(); renderSalonPanel(); setSalonStatus('消しました。'); }
                });
            };
        }
        const auto = document.getElementById('chk-salon-auto');
        if (auto) auto.onchange = () => setStoreConfig({ autoSync: auto.checked });
    }

    // 設定のとき、サーバーの環境変数に写してもらう値を出す。
    // 合言葉そのものは送らない。ここに出るのは、合言葉から作った別の値。
    const btnSalonKey = document.getElementById('btn-salon-show-key');
    if (btnSalonKey) {
        btnSalonKey.onclick = async () => {
            const el = document.getElementById('input-salon-setup-pass');
            const out = document.getElementById('salon-key-out');
            const v = el ? el.value.trim() : '';
            if (v.length < STORE_MIN_PASSPHRASE) {
                setSalonStatus(`合言葉は${STORE_MIN_PASSPHRASE}文字以上にしてください。`, 'error');
                return;
            }
            setSalonStatus('作っています…');
            try {
                const value = await storeAuthValue(v);
                const slot = document.getElementById('salon-key-value');
                if (out) out.hidden = false;
                if (slot) slot.textContent = value;
                setSalonStatus('この値を Cloudflare の SECRET に貼ってください。', 'ok');
            } catch (e) {
                setSalonStatus(`⚠ ${e.message}`, 'error');
            }
        };
    }
    const btnCopySalonKey = document.getElementById('btn-copy-salon-key');
    if (btnCopySalonKey) {
        btnCopySalonKey.onclick = async () => {
            const code = document.getElementById('salon-key-value');
            try {
                await navigator.clipboard.writeText(code ? code.textContent : '');
                setSalonStatus('コピーしました。', 'ok');
            } catch (e) {
                setSalonStatus('コピーできませんでした。手で写してください。', 'error');
            }
        };
    }

    // 置き場とのやりとりは、読む・書く・写真を並べる・上げる・下ろすの5つ。
    // ここだけ差し替えられる形にしてある。以前は OneDrive とパソコンの
    // フォルダも並んでいたが、どちらも使われないまま設定画面を塞いでいたので
    // 外した。別の置き場が要るときは、この5つを備えたものを足せばよい。
    const SALON_STORE = {
        key: 'salon',
        label: 'サロンの置き場',
        status: (t, k) => setSalonStatus(t, k),
        pull: () => storePullSnapshot(),
        push: (s) => storePushSnapshot(s),
        listPhotos: () => storeListPhotoIds(),
        pushPhoto: (id, blob) => storePushPhoto(id, blob),
        pullPhoto: (id) => storePullPhoto(id)
    };
    /**
     * 同期の本体。
     *
     * 1. 置き場の写しを読んで、こちらへ突き合わせる（新しいほうを残す）
     * 2. 突き合わせた結果を、置き場へ書き戻す
     * 3. 写真は、向こうに無いものだけ上げ、こちらに無いものだけ下ろす
     */
    async function runSync({ manual = false, store = SALON_STORE } = {}) {
        if (syncing) return;
        syncing = true;
        const setStatus = store.status;
        setStatus('同期しています…');
        try {
            // 1. 読んで突き合わせる
            const remote = await store.pull();
            let merged = null;
            if (remote) {
                merged = mergeSnapshot(remote);
                if (merged && merged.failed) {
                    const err = getLastSaveError();
                    setStatus(`⚠ ${err ? err.message : '保存できませんでした。'}`, 'error');
                    return;
                }
            }

            // 2. 書き戻す（写真の実物は含めない。別のファイルにするため）
            const snapshot = {
                app: 'therapist-crm',
                version: 1,
                exportedAtISO: new Date().toISOString(),
                customers: getCustomers(),
                // 消したことの控えも一緒に運ぶ。これが無いと、
                // 向こうの端末は「消した」のか「まだ知らない」のかを見分けられない。
                deletions: getDeletions(),
                colorMasters: JSON.parse(localStorage.getItem('therapist_color_masters') || '[]'),
                freeTextMerges: JSON.parse(localStorage.getItem('therapist_freetext_merges') || '{}')
            };
            await store.push(snapshot);

            // 3. 写真の差分
            let up = 0;
            let down = 0;
            try {
                const remoteIds = new Set(await store.listPhotos());
                const localIds = await listPhotoIds();
                const localSet = new Set(localIds);

                for (const id of localIds) {
                    if (remoteIds.has(id)) continue;
                    const blob = await getPhotoBlob(id);
                    if (blob) { await store.pushPhoto(id, blob); up += 1; }
                }
                // 記録から参照されていて、こちらに実物が無いものだけ下ろす
                const wanted = new Set();
                getCustomers().forEach((c) => (c.records || []).forEach((r) => {
                    (r.photos || []).forEach((ph) => { if (ph && ph.id) wanted.add(ph.id); });
                }));
                for (const id of wanted) {
                    if (localSet.has(id) || !remoteIds.has(id)) continue;
                    const blob = await store.pullPhoto(id);
                    if (blob) { await putPhotoBlob(id, blob); down += 1; }
                }
            } catch (e) {
                // 写真が使えない端末でも、文字のほうは同期できている
                console.warn('写真の同期に失敗:', e);
            }

            try {
                localStorage.setItem(lastSyncKeyFor(store), new Date().toISOString());
            } catch (e) { /* noop */ }
            const parts = [];
            if (merged && merged.addedCustomers) parts.push(`顧客${merged.addedCustomers}名`);
            if (merged && merged.addedRecords) parts.push(`記録${merged.addedRecords}件`);
            if (merged && merged.updatedRecords) parts.push(`差し替え${merged.updatedRecords}件`);
            if (down) parts.push(`写真${down}枚`);
            setStatus(parts.length
                ? `同期しました。受け取り：${parts.join('・')}${up ? ` ／ 送り：写真${up}枚` : ''}`
                : `同期しました。${up ? `写真${up}枚を送りました。` : '差分はありませんでした。'}`, 'ok');
            renderCustomerList(searchInput ? searchInput.value : '');
            renderBackupUsage();
            renderSalonPanel();
            hasUnsentChange = false;
            renderSyncBadge();
        } catch (e) {
            setStatus(`⚠ ${e.message}`, 'error');
            renderSyncBadge('error');
            if (manual) showToast(e.message, 'error');
        } finally {
            syncing = false;
        }
    }

    // ------------------------------------------------------------------
    // 同期のきっかけ
    //
    // 置き場へ送るのが「開いたとき」と「押したとき」だけだったため、
    // 書き換えた直後は端末の中に留まっていた。別の端末から見ると
    // 「反映が遅い」ように見えるが、実際は一度も送っていない。
    //
    // きっかけを3つ足す。
    //   ① 書き換えて手が止まったら送る
    //   ② 画面に戻ってきたら受け取る（他のアプリから戻った、タブを戻した）
    //   ③ 開いたままでも、ときどき受け取る（施術中ずっと開いている）
    //
    // ①は打っている最中に毎回送らないよう、手が止まってから動かす。
    // ②③は連打を防ぐため、直前に走っていたら見送る。
    // ------------------------------------------------------------------
    const PUSH_QUIET_MS = 6000;      // 手が止まったと見なすまで
    const REFRESH_MIN_GAP_MS = 20000; // 受け取りの最短間隔
    const REFRESH_EVERY_MS = 180000;  // 開いたままのときの受け取り間隔

    let pushTimer = null;
    let hasUnsentChange = false;
    let lastRefreshAt = 0;

    /** いま使われている置き場。無ければ null */
    async function activeStore() {
        return isStoreConnected() ? SALON_STORE : null;
    }

    /** 送り残しがあるかどうかを、いつでも見える場所に出す */
    function renderSyncBadge(mode) {
        const el = document.getElementById('sync-badge');
        if (!el) return;
        if (!isStoreConnected()) {
            // 置き場を使っていない人に、無関係な印を出しても混乱するだけ
            el.hidden = true;
            return;
        }
        el.hidden = false;
        // 狭い画面では短くする。長いままだとヘッダーが二段になり、
        // 施術中に一番見たい一覧がそのぶん押し下げられる。
        const narrow = window.matchMedia('(max-width: 560px)').matches;
        if (mode === 'working') {
            el.className = 'sync-badge is-working';
            el.textContent = narrow ? '⇅ 同期中' : '⇅ 同期中…';
            return;
        }
        if (mode === 'error') {
            el.className = 'sync-badge is-error';
            el.textContent = narrow ? '⚠ 送れず' : '⚠ 送れていません';
            return;
        }
        if (hasUnsentChange) {
            el.className = 'sync-badge is-pending';
            el.textContent = narrow ? '● 未送信' : '● 未送信の変更';
            return;
        }
        // 送り終わっている状態が普通なので、狭い画面ではそこだけ印にする。
        // 何か言うことがあるときにだけヘッダーが広がるほうが、気づける。
        const when = lastSyncLabel(SALON_STORE).replace('最後の同期：', '');
        el.className = 'sync-badge is-ok';
        el.textContent = narrow ? '☁' : `☁ ${when}`;
        el.title = `置き場と同期済み（${when}）。押すといま同期します`;
    }

    window.addEventListener('resize', () => renderSyncBadge());

    /** 書き換えがあった。手が止まったら送る */
    async function scheduleCloudPush() {
        if (isDemoRunning) return;          // 見本の案内中は触らない
        if (syncing) return;                 // 同期そのものの書き込みには反応しない
        if (!(await activeStore())) return;
        hasUnsentChange = true;
        renderSyncBadge();
        clearTimeout(pushTimer);
        pushTimer = setTimeout(async () => {
            const store = await activeStore();
            if (!store) return;
            renderSyncBadge('working');
            await runSync({ store });
            hasUnsentChange = false;
            renderSyncBadge();
        }, PUSH_QUIET_MS);
    }

    /** 画面に戻ってきた・時間がたった。受け取りに行く */
    async function refreshFromStore(why) {
        if (isDemoRunning || syncing) return;
        if (Date.now() - lastRefreshAt < REFRESH_MIN_GAP_MS) return;
        const store = await activeStore();
        if (!store) return;
        lastRefreshAt = Date.now();
        renderSyncBadge('working');
        await runSync({ store });
        hasUnsentChange = false;
        renderSyncBadge();
    }

    onDataChanged(() => { scheduleCloudPush(); });

    // 印そのものを押しても同期できるようにする。設定画面まで行かずに済む
    const syncBadgeEl = document.getElementById('sync-badge');
    if (syncBadgeEl) {
        syncBadgeEl.onclick = async () => {
            const store = await activeStore();
            if (!store) return;
            lastRefreshAt = Date.now();
            renderSyncBadge('working');
            await runSync({ store, manual: true });
            hasUnsentChange = false;
            renderSyncBadge();
        };
    }
    renderSyncBadge();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshFromStore('visible');
    });
    window.addEventListener('focus', () => refreshFromStore('focus'));

    setInterval(() => {
        if (document.visibilityState === 'visible') refreshFromStore('interval');
    }, REFRESH_EVERY_MS);

    // 閉じる直前に送り残しがあれば、最後の一押しを試みる。
    // 見送られることもあるが、黙って失うよりはよい。
    window.addEventListener('pagehide', () => {
        if (!hasUnsentChange) return;
        clearTimeout(pushTimer);
        activeStore().then((store) => { if (store) runSync({ store }); });
    });

    /** 開いたときの自動同期 */
    async function autoSyncOnOpen() {
        if (isStoreConnected() && getStoreConfig().autoSync) await runSync();
    }

    // 同期でつまずいても、アプリ自体は使える形にしておく
    autoSyncOnOpen().catch(() => { /* noop */ });

    const btnExport = document.getElementById('btn-export-data');
    if (btnExport) btnExport.onclick = () => exportAllData();
    const inputImport = document.getElementById('input-import-data');
    if (inputImport) {
        inputImport.onchange = (e) => {
            const file = (e.target.files || [])[0];
            e.target.value = '';
            if (!file) return;
            showConfirmModal({
                title: 'データの読み込み',
                message: 'いま入っているものは消さずに、足りないぶんだけ追加します。よろしいですか？',
                actionText: '読み込む',
                icon: '📥',
                theme: 'success',
                onConfirm: () => importAllData(file)
            });
        };
    }

    // 保存できない場所で開かれていないか、最初に確かめる
    if (!isStorageWritable()) {
        const bar = document.getElementById('storage-warning');
        if (bar) {
            bar.hidden = false;
            bar.innerHTML = '⚠ <strong>この画面ではデータを保存できません。</strong>'
                + '書いたものはこの画面を閉じると消えます。'
                + 'ブラウザのプライベートモードや、埋め込み表示ではこうなることがあります。'
                + '通常のタブで開き直してお使いください。';
        }
    }

    function renderFreeTextReview() {
        const host = document.getElementById('freetext-review-body');
        if (!host) return;

        const review = reviewFreeText(getCustomers());
        const mergeMap = getMergeMap();
        const mergedPairs = Object.entries(mergeMap);

        if (!review.entries.length && !mergedPairs.length) {
            host.innerHTML = `<div class="ft-empty">まだ「その他」に書かれたものはありません。</div>`;
            freeTextPicked = new Set();
            return;
        }

        // 一覧に無くなったものの選択は落とす
        const alive = new Set(review.entries.map((e) => `${e.kind}:${e.text}`));
        freeTextPicked = new Set([...freeTextPicked].filter((k) => alive.has(k)));

        const rowHtml = (entry) => {
            const id = `${entry.kind}:${entry.text}`;
            const promote = entry.customers >= review.threshold;
            return `
                <div class="ft-row${promote ? ' is-promote' : ''}" data-ft-id="${escapeHtml(id)}">
                    <label class="ft-pick-label">
                        <input type="checkbox" class="ft-pick" data-ft-id="${escapeHtml(id)}"
                               ${freeTextPicked.has(id) ? 'checked' : ''}>
                        <span class="ft-kind ft-kind-${entry.kind}">${entry.kind === 'allergy' ? 'アレルギー' : '体質'}</span>
                        <span class="ft-text">${escapeHtml(entry.text)}</span>
                    </label>
                    <div class="ft-meta">
                        <span class="ft-count">${entry.count}件 / ${entry.customers}名</span>
                        ${entry.variants.length
                            ? `<span class="ft-variants">ゆれ: ${escapeHtml(entry.variants.join('、'))}</span>`
                            : ''}
                        ${promote ? `<span class="ft-badge">昇格候補</span>` : ''}
                    </div>
                    <button type="button" class="ft-req-btn" data-ft-id="${escapeHtml(id)}">依頼文</button>
                    <div class="ft-req-box" hidden></div>
                </div>`;
        };

        host.innerHTML = `
            <div class="ft-note">
                ${review.threshold}名以上に出てきたものを<strong>昇格候補</strong>として印を付けています。
                「蕎麦」と「そば」のように、機械では同じと分からないものは選んで寄せてください。
            </div>
            <div class="ft-list">${review.entries.map(rowHtml).join('')}</div>
            <div class="ft-actions">
                <button type="button" id="ft-merge-btn" class="ft-merge-btn" disabled>選んだものを同じものにする</button>
                <span class="ft-actions-hint">2つ以上、同じ種別で選んでください</span>
            </div>
            ${mergedPairs.length ? `
            <div class="ft-merged">
                <div class="ft-merged-title">寄せた対応</div>
                ${[...new Set(mergedPairs.map(([, v]) => v))].map((canonical) => {
                    const kind = (mergedPairs.find(([, v]) => v === canonical) || [''])[0].split(':')[0];
                    return `<span class="ft-merged-item">${escapeHtml(canonical)}
                        <button type="button" class="ft-unmerge-btn" data-ft-kind="${escapeHtml(kind)}"
                            data-ft-text="${escapeHtml(canonical)}" title="この寄せを解く">✕</button></span>`;
                }).join('')}
            </div>` : ''}
        `;

        const mergeBtn = host.querySelector('#ft-merge-btn');
        const hint = host.querySelector('.ft-actions-hint');

        /** 選んだものが寄せられる組み合わせか見て、ボタンの状態を決める */
        const refreshMergeBtn = () => {
            const picked = [...freeTextPicked];
            const kinds = new Set(picked.map((k) => k.slice(0, k.indexOf(':'))));
            const ok = picked.length >= 2 && kinds.size === 1;
            if (mergeBtn) mergeBtn.disabled = !ok;
            if (!hint) return;
            if (picked.length < 2) hint.textContent = '2つ以上、同じ種別で選んでください';
            else if (kinds.size > 1) hint.textContent = 'アレルギーと体質は一緒に寄せられません';
            else hint.textContent = `いちばん多い「${picked[0].slice(picked[0].indexOf(':') + 1)}」にまとめます`;
        };

        host.querySelectorAll('.ft-pick').forEach((box) => {
            box.onclick = (e) => e.stopPropagation();
            box.onchange = () => {
                const id = box.dataset.ftId;
                if (box.checked) freeTextPicked.add(id);
                else freeTextPicked.delete(id);
                refreshMergeBtn();
            };
        });

        if (mergeBtn) {
            mergeBtn.onclick = () => {
                // 一覧は件数の多い順。先に出てくるものを代表にする
                const picked = review.entries
                    .filter((e) => freeTextPicked.has(`${e.kind}:${e.text}`));
                if (picked.length < 2) return;
                const canonical = picked[0];
                const aliases = picked.slice(1).flatMap((e) => [e.text, ...e.variants])
                    .concat(canonical.variants);
                showConfirmModal({
                    title: '同じものにまとめる',
                    message: `${picked.map((e) => e.text).join('、')} を「${canonical.text}」としてまとめます。`,
                    actionText: 'まとめる',
                    icon: '🧺',
                    theme: 'success',
                    onConfirm: () => {
                        mergeFreeText(canonical.kind, canonical.text, aliases);
                        freeTextPicked = new Set();
                        showToast(`「${canonical.text}」にまとめました`, 'success');
                        renderFreeTextReview();
                    }
                });
            };
        }

        host.querySelectorAll('.ft-unmerge-btn').forEach((btn) => {
            btn.onclick = () => {
                unmergeFreeText(btn.dataset.ftKind, btn.dataset.ftText);
                showToast('寄せた対応を解きました', 'success');
                renderFreeTextReview();
            };
        });

        // 依頼文。何を決めればよいかを書き出して、そのまま渡せるようにする
        host.querySelectorAll('.ft-req-btn').forEach((btn) => {
            btn.onclick = () => {
                const row = btn.closest('.ft-row');
                const box = row ? row.querySelector('.ft-req-box') : null;
                if (!box) return;
                if (!box.hidden) { box.hidden = true; btn.textContent = '依頼文'; return; }
                const id = btn.dataset.ftId;
                const entry = review.entries.find((e) => `${e.kind}:${e.text}` === id);
                if (!entry) return;
                const text = buildPromotionRequest(entry);
                box.innerHTML = `
                    <textarea class="ft-req-text" readonly rows="14">${escapeHtml(text)}</textarea>
                    <button type="button" class="ft-copy-btn">この文章をコピー</button>`;
                box.hidden = false;
                btn.textContent = '閉じる';
                const area = box.querySelector('.ft-req-text');
                const copy = box.querySelector('.ft-copy-btn');
                if (copy) {
                    copy.onclick = async () => {
                        try {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                await navigator.clipboard.writeText(text);
                            } else {
                                area.select();
                                document.execCommand('copy');
                            }
                            showToast('コピーしました', 'success');
                        } catch (err) {
                            // クリップボードが使えない環境では、選択だけしておく
                            area.select();
                            showToast('選択しました。手でコピーしてください。', 'error');
                        }
                    };
                }
            };
        });

        refreshMergeBtn();
    }

    function renderColorSettingsView() {
        renderSalonPanel();
        renderBackupUsage();
        renderBackupReminder();
        renderFreeTextReview();
    }

    // [MINOR v1.6.0] インライン簡易記録フォーム用のDOM要素
    const inlineRecordCustomerId = document.getElementById('inline-record-customer-id');
    const inlineRecordType = document.getElementById('inline-record-type');
    const inlineRecordAmount = document.getElementById('inline-record-amount');
    const inlineRecordTime = document.getElementById('inline-record-time');
    const inlineRecordComplaint = document.getElementById('inline-record-complaint');
    const inlineRecordPrescription = document.getElementById('inline-record-prescription');
    const inlineRecordNote = document.getElementById('inline-record-note');
    const btnInlineSubmitRecord = document.getElementById('btn-inline-submit-record');

    // ── 予約モーダル ──
    // カレンダー直下に置いていた記録フォームをモーダルへ移した。
    // 入力欄のIDは変えていないので、保存処理は従来のまま動く。
    const bookingModal = document.getElementById('booking-modal');
    const btnOpenBooking = document.getElementById('btn-open-booking');
    const btnCloseBooking = document.getElementById('btn-close-booking');
    const bookingModalTitle = document.getElementById('booking-modal-title');
    const bookingOpenDate = document.getElementById('booking-open-date');

    /** 日付を「8月2日（土）」の形にする */
    const formatBookingDate = (dateStr, compact = false) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const week = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
        return compact ? `${m}/${d}（${week}）` : `${m}月${d}日（${week}）`;
    };

    /**
     * 予約ボタンに、いま対象になっている日付を出す。
     * 狭い端末では「8/2（日）」と詰める。ボタンの幅は画面幅の 7/8 しかなく、
     * 「8月2日（日）」のままだと文字の側が省略されてしまうため。
     */
    const updateBookingButtonDate = () => {
        if (!bookingOpenDate) return;
        const compact = window.matchMedia('(max-width: 399px)').matches;
        bookingOpenDate.textContent = formatBookingDate(selectedCalendarDateStr, compact);
    };

    // 画面の回転や幅の変更で表記を切り替える
    window.addEventListener('resize', updateBookingButtonDate);

    /**
     * その日にすでに入っている予約を、書く前に見せる（ISSUE-066）。
     *
     * 重なりに気づく手立てが「カレンダーの札」しか無く、
     * **時間の重なりは見えなかった**。書く画面の中に出しておけば、
     * そもそも重ねずに済む。
     */
    const renderBookingDayList = () => {
        const host = document.getElementById('booking-day-list');
        if (!host) return;
        const rows = findDayBookings(getCustomers(), selectedCalendarDateStr);
        if (rows.length === 0) {
            host.style.display = 'block';
            host.innerHTML = '<div class="booking-day-head">この日の予約はまだありません</div>';
            return;
        }
        host.style.display = 'block';
        host.innerHTML = `<div class="booking-day-head">この日はすでに ${rows.length} 件あります</div>`
            + rows.map((b) => {
                const t = String(b.record.time || '').trim();
                return `<div class="booking-day-row">
                    <span class="booking-day-time${t ? '' : ' undecided'}">${escapeHtml(t || '時間未定')}</span>
                    <span class="booking-day-name">${escapeHtml(displayNameOf(b.customer))}</span>
                    <span class="booking-day-type">${escapeHtml(recordTypeLabel(b.record))}</span>
                </div>`;
            }).join('');
    };

    /** 時間を選び直したら、同じ時間帯のものを目立たせる */
    const markBookingClashes = () => {
        const host = document.getElementById('booking-day-list');
        const t = inlineRecordTime ? String(inlineRecordTime.value || '').trim() : '';
        if (host) {
            host.querySelectorAll('.booking-day-row').forEach((row) => {
                const shown = row.querySelector('.booking-day-time').textContent.trim();
                row.classList.toggle('clash', Boolean(t) && shown === t);
            });
        }
        // 一覧は画面の上のほうにあって、時間を選ぶ場所から遠い。
        // **選んでいるその場**にも出す（ISSUE-067）。
        annotateTimeOptions('inline-record-time', selectedCalendarDateStr);

        // ただし時間の欄は「詳細メモ」の畳みの中にある。**畳んだままだと、
        // その場の警告は見えない。** 畳みの外（この一覧の見出し）にも出す。
        const head = host ? host.querySelector('.booking-day-head') : null;
        if (head) {
            const clash = host.querySelector('.booking-day-row.clash');
            const old = head.querySelector('.booking-day-warn');
            if (old) old.remove();
            if (clash) {
                const warn = document.createElement('span');
                warn.className = 'booking-day-warn';
                warn.textContent = `　⚠️ いま選んでいる ${t} は重なっています`;
                head.appendChild(warn);
            }
        }
    };

    const openBookingModal = () => {
        if (!selectedCalendarDateStr) {
            showToast('日付を選んでから追加してください。', 'error');
            return;
        }
        if (bookingModalTitle) {
            bookingModalTitle.textContent = `${formatBookingDate(selectedCalendarDateStr)} の予約・施術記録`;
        }
        populateInlineCustomerSelect();
        renderBookingDayList();
        markBookingClashes();
        renderInlineCategoryPicker();
        if (bookingModal) bookingModal.classList.add('active');
    };

    const closeBookingModal = () => {
        if (bookingModal) bookingModal.classList.remove('active');
    };

    if (inlineRecordTime) inlineRecordTime.addEventListener('change', markBookingClashes);
    if (btnOpenBooking) btnOpenBooking.addEventListener('click', openBookingModal);
    if (btnCloseBooking) btnCloseBooking.addEventListener('click', closeBookingModal);
    if (bookingModal) {
        bookingModal.addEventListener('click', (e) => {
            if (e.target === bookingModal) closeBookingModal();
        });
    }

    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth();
    let selectedCalendarDateStr = null;

    const workspaceGrid = document.querySelector('.workspace-grid');

    // 6. メインビュー（一覧 / カレンダー / カラー設定 / 星詠みメッセージ）の切り替え制御
    const hideAllMainViews = () => {
        // 検索と「アーカイブ／顧客登録／デモ」は顧客一覧だけのもの。
        // クラスで隠す（スマホ幅の display:!important に負けないため）
        if (searchContainerSection) searchContainerSection.classList.add('is-hidden');
        if (customerListContainer) customerListContainer.style.display = 'none';
        if (calendarViewContainer) calendarViewContainer.style.display = 'none';
        if (colorSettingsViewContainer) colorSettingsViewContainer.style.display = 'none';
        if (adviceViewContainer) adviceViewContainer.style.display = 'none';
        if (astroAromaViewContainer) astroAromaViewContainer.style.display = 'none';
    };

    const activateViewTab = (activeBtn) => {
        [btnViewList, btnViewCalendar, btnViewColorSettings, btnViewAdvice, btnViewAstroAroma].forEach(btn => {
            if (!btn) return;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.fontWeight = '';
            if (btn === activeBtn) {
                btn.classList.add('active');
                btn.classList.add('active-tab-btn');
            } else {
                btn.classList.remove('active');
                btn.classList.remove('active-tab-btn');
            }
        });
    };

    if (btnViewList) {
        btnViewList.addEventListener('click', () => {
            activateViewTab(btnViewList);

            hideAllMainViews();
            if (searchContainerSection) {
                searchContainerSection.style.display = '';
                searchContainerSection.classList.remove('is-hidden');
            }
            if (customerListContainer) customerListContainer.style.display = '';

            if (workspaceGrid) {
                workspaceGrid.classList.remove('calendar-mode');
                workspaceGrid.classList.remove('detail-mode');
            }
            if (customerDetailView) customerDetailView.style.display = 'none';
            if (customerModal) customerModal.classList.remove('active');
            selectedCustomerId = null;

            renderCustomerList(searchInput ? searchInput.value : '');
        });
    }

    if (btnViewCalendar) {
        btnViewCalendar.addEventListener('click', () => {
            activateViewTab(btnViewCalendar);

            hideAllMainViews();
            if (calendarViewContainer) calendarViewContainer.style.display = 'flex';
            if (customerDetailView) customerDetailView.style.display = 'none';
            if (customerModal) customerModal.classList.remove('active');

            if (workspaceGrid) {
                workspaceGrid.classList.remove('detail-mode');
                workspaceGrid.classList.add('calendar-mode');
            }

            renderCalendar();

            if (!selectedCalendarDateStr) {
                const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
                selectedCalendarDateStr = todayStr;
            }
            const customers = getCustomers();
            const dailyVisits = [];
            customers.forEach(cust => {
                if (cust.records) {
                    cust.records.forEach(rec => {
                        if (rec.date === selectedCalendarDateStr) {
                            dailyVisits.push({ customer: cust, record: rec });
                        }
                    });
                }
            });
            showCalendarDayDetails(selectedCalendarDateStr, dailyVisits);
        });
    }

    /**
     * URL の #api-key で設定画面のAPIキー欄を直接開く。
     * 「どこで設定するのか」をリンク1本で渡せるようにするため。
     */
    function openApiKeySettingsFromHash() {
        const hash = (location.hash || '').replace('#', '');
        if (hash !== 'api-key' && hash !== 'settings' && hash !== 'salon-key') return;
        if (!btnViewColorSettings) return;
        btnViewColorSettings.click();
        // 描画が終わってから、目当ての欄まで送る
        setTimeout(() => {
            const panel = hash === 'salon-key'
                ? document.getElementById('salon-setup')
                : document.querySelector('.api-key-panel');
            if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }

    window.addEventListener('hashchange', openApiKeySettingsFromHash);
    // 起動直後は一覧の描画が先に走るので、少し待ってから見る
    setTimeout(openApiKeySettingsFromHash, 400);

    /**
     * 控えを忘れていたら、開いたときに一度だけ知らせる。
     *
     * 設定画面まで見に行く人はまず居ないので、こちらから出る。
     * ただし1日1回まで。毎回出ると読まなくなり、出す意味が消える。
     */
    function remindBackupOnce() {
        const r = getBackupReminder();
        if (!r) return;
        const today = toDateStr(new Date());
        try {
            if (localStorage.getItem('therapist_backup_nag_on') === today) return;
            localStorage.setItem('therapist_backup_nag_on', today);
        } catch (e) { /* 書けない端末では、毎回出てもよい */ }
        showToast(r.kind === 'never'
            ? '控えをまだ取っていません。「🎨 カラー設定」の書き出しから、ファイルを1つ保存してください。'
            : `控えを取ってから${r.days}日たっています。「🎨 カラー設定」から書き出しておいてください。`,
        'info');
    }
    setTimeout(remindBackupOnce, 2500);

    /**
     * 期限を過ぎた控えを片づける（ISSUE-076）。
     *
     * 同期の突き合わせでも落としているが、**そこは食い違ったときしか通らない**。
     * 二度と食い違わない記録は、それだけでは片づかない。
     * 起動のたびに一度だけ見る。落とすものが無ければ何も書かないので、
     * よけいな同期は起きない。
     */
    setTimeout(() => {
        try {
            const dropped = sweepOverwritten();
            if (dropped) {
                console.info(`[karte] ${OVERWRITTEN_KEEP_DAYS}日を過ぎた控えを ${dropped} 件片づけました`);
            }
        } catch (e) {
            console.warn('[karte] 控えの片づけに失敗しました', e);
        }
    }, 4000);

    if (btnViewColorSettings) {
        btnViewColorSettings.addEventListener('click', () => {
            activateViewTab(btnViewColorSettings);

            hideAllMainViews();
            if (colorSettingsViewContainer) colorSettingsViewContainer.style.display = 'block';
            if (customerDetailView) customerDetailView.style.display = 'none';
            if (customerModal) customerModal.classList.remove('active');

            if (workspaceGrid) {
                workspaceGrid.classList.remove('calendar-mode');
                workspaceGrid.classList.remove('detail-mode');
            }

            renderColorSettingsView();
            renderAdvanceSetPreference();
            renderNamePreference();
            renderChatVisibilityPreference();
            renderPrepPreference();
            renderApiKeyPanel();
            renderAiRoute();
        });
    }

    /**
     * いま、どのAIに繋がっているかを出す。
     *
     * 同じアプリでも、サロンのPCで立ち上げて開いたときだけ
     * Claude のアカウントが使われる。見た目では区別が付かないので、
     * 「キーを入れたのに使われない」「キーが無いのに動く」の元になっていた。
     */
    async function renderAiRoute() {
        const badge = document.getElementById('ai-route-badge');
        if (!badge) return;
        // キーを使う機能をどちらも止めているなら、繋ぎ先を調べに行かない。
        // **隠すだけとの違いはここ**。隠しただけだと裏でネットワークへ出続ける
        if (!isAiKeyNeeded(isChatEnabled())) {
            badge.dataset.tone = 'off';
            badge.textContent = '使いません';
            return;
        }
        try {
            const route = await detectAiRoute();
            badge.dataset.tone = route.tone;
            badge.textContent = route.label;
            badge.title = `いま使っているAI: ${route.label}／${route.detail}`;
        } catch (e) {
            badge.dataset.tone = 'off';
            badge.textContent = '調べられませんでした';
        }
    }

    /** アドバンスカラーの既定セット（10色/17色）のトグル */
    function renderAdvanceSetPreference() {
        const wrap = document.getElementById('advance-set-preference');
        if (!wrap) return;
        const current = getAdvanceSetPreference();
        wrap.querySelectorAll('.record-color-set-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.set === current);
            btn.onclick = () => {
                saveAdvanceSetPreference(btn.dataset.set);
                renderAdvanceSetPreference();
                showToast(
                    btn.dataset.set === 'full'
                        ? 'アドバンスカラーの既定を17色にしました'
                        : 'アドバンスカラーの既定を10色にしました',
                    'success'
                );
            };
        });
    }

    /** 一覧に出す呼び名（ニックネーム / 氏名）のトグル */
    function renderNamePreference() {
        const wrap = document.getElementById('name-preference');
        if (!wrap) return;
        const current = getNamePreference();
        wrap.querySelectorAll('.record-color-set-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.pref === current);
            btn.onclick = () => {
                saveNamePreference(btn.dataset.pref);
                renderNamePreference();
                // 出ている画面をその場で描き直す。設定を変えたのに
                // 一覧が前のままだと、効いたのかどうか分からない。
                renderCustomerList(searchInput ? searchInput.value : '');
                renderCalendar();
                if (selectedCustomerId) showCustomerDetail(selectedCustomerId);
                showToast(
                    btn.dataset.pref === 'name'
                        ? '一覧に氏名を出します'
                        : '一覧にニックネームを出します',
                    'success'
                );
            };
        });
    }

    /** 右下の💬を出すか出さないか（ISSUE-071） */
    function renderChatVisibilityPreference() {
        const wrap = document.getElementById('chat-visibility-preference');
        if (!wrap) return;
        const current = isChatEnabled() ? 'on' : 'off';
        wrap.querySelectorAll('.record-color-set-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.chat === current);
            btn.onclick = () => {
                const on = btn.dataset.chat === 'on';
                setChatEnabled(on);
                renderChatVisibilityPreference();
                applyAiKeyPanelVisibility();
                showToast(
                    on
                        ? '右下に💬を出します'
                        : '右下の💬を出しません。ここでいつでも戻せます',
                    'success'
                );
            };
        });
    }

    /** 「下ごしらえ」を使うか使わないか（ISSUE-083） */
    function renderPrepPreference() {
        const wrap = document.getElementById('prep-preference');
        if (!wrap) return;
        const current = isPrepEnabled() ? 'on' : 'off';
        wrap.querySelectorAll('.record-color-set-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.prep === current);
            btn.onclick = () => {
                const on = btn.dataset.prep === 'on';
                setPrepEnabled(on);
                renderPrepPreference();
                applyAiKeyPanelVisibility();
                showToast(
                    on
                        // ボタンの組み立ては読み込みのときに決まる。
                        // 途中で戻すと、押しても動かないので、そこまで伝える
                        ? '「下ごしらえ」を使います。画面を読み込み直すと出ます'
                        : '「下ごしらえ」を使いません。書いた記録は残ります',
                    'success'
                );
            };
        });
    }

    /**
     * APIキーの欄を出すかどうか。
     *
     * **キーを使うのは下ごしらえだけではない。** 💬チャットも同じキーを読む。
     * 下ごしらえだけを見て畳むと、チャットを使う人がキーを入れられなくなる。
     */
    function applyAiKeyPanelVisibility() {
        const panel = document.querySelector('#color-settings-view-container .api-key-panel');
        if (!panel) return;
        const need = isAiKeyNeeded(isChatEnabled());
        panel.style.display = need ? '' : 'none';
        if (need) { renderAiRoute(); renderAiRouteStatus(); }
    }

    /**
     * AI提案のAPIキー設定。
     * サーバーがある場所では要らないので、その旨も出しておく。
     */
    function renderApiKeyPanel() {
        const input = document.getElementById('input-ai-api-key');
        const status = document.getElementById('ai-api-key-status');
        const list = document.getElementById('ai-api-key-list');
        if (!input || !status) return;

        const keys = getStoredApiKeys();

        if (list) {
            if (keys.length === 0) {
                list.innerHTML = '';
            } else {
                list.innerHTML = `
                    <div class="api-key-list-head">登録済みのキー（上から順に試します）</div>
                    ${keys.map((k, i) => `
                        <div class="api-key-row">
                            <span class="api-key-order">${i + 1}</span>
                            <span class="api-key-provider">${escapeHtml(getProviderLabel(classifyApiKey(k)))}</span>
                            <span class="api-key-mask">${escapeHtml(maskApiKey(k))}</span>
                            <button type="button" class="api-key-up" data-index="${i}" title="優先順を上げる"
                                    ${i === 0 ? 'disabled' : ''}>↑</button>
                            <button type="button" class="api-key-del" data-index="${i}" title="このキーを削除">削除</button>
                        </div>
                    `).join('')}
                `;
                list.querySelectorAll('.api-key-up').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        moveApiKeyUp(Number(btn.dataset.index));
                        renderApiKeyPanel();
                    });
                });
                list.querySelectorAll('.api-key-del').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        removeApiKeyAt(Number(btn.dataset.index));
                        renderApiKeyPanel();
                        showToast('キーを削除しました', 'success');
                    });
                });
            }
        }

        if (keys.length > 0) {
            const kinds = [...new Set(keys.map((k) => getProviderLabel(classifyApiKey(k))))];
            status.innerHTML = `<span style="color: var(--accent-success); font-weight: 700;">✔ ${keys.length}件のキーが入っています（${escapeHtml(kinds.join('・'))}）</span>`;
        } else {
            status.innerHTML = 'キーは未設定です。';
        }
        input.placeholder = 'sk-ant-... または Gemini のキー';
        input.value = '';
        forgetAiRoute();     // キーが変われば、繋ぎ先の見え方も変わる
        renderAiRoute();
        renderAiRouteStatus();
        renderModelStatus();
        renderUsageStatus();
        applyAiKeyPanelVisibility();
    }

    /**
     * このアプリからAIを呼んだ回数。
     * 提供元に残量を尋ねる方法が無いので、こちらから数えて出す。
     * 無料枠はキーではなくプロジェクト単位なので、その注意も添える。
     */
    function renderUsageStatus() {
        const el = document.getElementById('ai-usage-status');
        if (!el) return;
        if (getStoredApiKeys().length === 0) { el.innerHTML = ''; return; }

        const { today, recent } = getUsageSummary(7);
        const byProvider = Object.entries(today.byProvider || {})
            .map(([p, n]) => `${getProviderLabel(p)} ${n}`).join(' / ');

        const rows = recent.length === 0
            ? '<div class="api-usage-note">まだ記録がありません。</div>'
            : recent.map((d) => `<div class="api-usage-row">
                    <span class="api-usage-day">${escapeHtml(d.day.slice(5).replace('-', '/'))}</span>
                    <span class="api-usage-bar"><i style="width: ${Math.min(100, d.total * 5)}%"></i></span>
                    <span class="api-usage-count">${d.total}回${d.ng ? `（失敗 ${d.ng}）` : ''}</span>
                </div>`).join('');

        el.innerHTML = `
            <div class="api-usage-head">AIを呼んだ回数</div>
            <div class="api-usage-today">今日 <strong>${today.total}</strong> 回${byProvider ? `（${escapeHtml(byProvider)}）` : ''}</div>
            ${rows}
            <p class="api-usage-note">
                無料枠はキーの本数ではなく<strong>プロジェクト単位</strong>です。
                同じプロジェクトでキーを増やしても枠は増えません。
            </p>
            <button type="button" id="btn-clear-usage" class="api-usage-clear">記録を消す</button>
        `;

        const btn = document.getElementById('btn-clear-usage');
        if (btn) {
            btn.addEventListener('click', () => {
                clearUsage();
                renderUsageStatus();
                showToast('使用回数の記録を消しました', 'success');
            });
        }
    }

    /**
     * 登録されたキーで実際に使うモデルを出す。
     * キーを入れたときに1回だけ調べた結果で、生成のたびには調べない。
     */
    function renderModelStatus() {
        const el = document.getElementById('ai-model-status');
        if (!el) return;

        const providers = [...new Set(getStoredApiKeys().map(classifyApiKey))].filter(Boolean);
        if (providers.length === 0) {
            el.innerHTML = '';
            return;
        }

        const rows = providers.map((p) => {
            const info = getModelInfo(p);
            const note = info.error
                ? `<span class="api-model-note">一覧を確認できなかったため既定を使います（${escapeHtml(info.error)}）</span>`
                : (info.checked
                    ? `<span class="api-model-note">使えるモデル ${info.available.length} 件から選択</span>`
                    : '<span class="api-model-note">未確認のため既定</span>');
            return `<div class="api-model-row">
                <span class="api-model-provider">${escapeHtml(getProviderLabel(p))}</span>
                <code class="api-model-id">${escapeHtml(info.model || '—')}</code>
                ${note}
            </div>`;
        }).join('');

        el.innerHTML = `
            <div class="api-model-head">使うモデル（速さ優先で自動選択）</div>
            ${rows}
            <button type="button" id="btn-recheck-models" class="api-model-recheck">モデルを調べ直す</button>
        `;

        const btn = document.getElementById('btn-recheck-models');
        if (btn) {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = '確認中…';
                for (const p of providers) {
                    await refreshModelChoice(p);
                }
                renderApiKeyPanel();
                showToast('使うモデルを確認しました', 'success');
            });
        }
    }

    /**
     * いま何で生成されるのかを出す。
     *
     * サーバーが動いていれば、既定は「このPCのClaudeログイン」＝ご自分の
     * アカウントで、APIキーは要らない。それが画面から見えないと
     * 「キーが要るのか」が分からないので、ここに出す。
     */
    async function renderAiRouteStatus() {
        const el = document.getElementById('ai-route-status');
        if (!el) return;
        if (!isAiKeyNeeded(isChatEnabled())) { el.textContent = ''; return; }

        const LABELS = {
            claude: 'このPCのClaudeログイン（ご自分のアカウント・APIキー不要）',
            anthropic: 'Anthropic APIキー（サーバー側の設定）',
            gemini: 'Gemini APIキー（サーバー側の設定）'
        };

        let info = null;
        try {
            const res = await fetch('/api/ai-status', { cache: 'no-cache' });
            if (res.ok) info = await res.json();
        } catch (e) {
            info = null;
        }

        if (info && info.primary) {
            const choice = getPreferredProvider();
            const effective = choice === 'auto' ? info.primary : choice;
            const primary = LABELS[effective] || effective;
            const rest = (info.chain || []).filter((p) => p !== effective).map((p) => LABELS[p] || p);
            el.innerHTML = `
                <div style="color: var(--accent-success); font-weight: 700;">✔ このPCのサーバーに接続できています</div>
                <div style="margin-top: 4px;">まず <strong>${escapeHtml(primary)}</strong> で生成します。</div>
                ${rest.length ? `<div style="margin-top: 2px;">それが使えないときは ${escapeHtml(rest.join(' → '))} へ切り替えます。</div>` : ''}
                <div style="margin-top: 4px;">この状態なら、下のAPIキーは入れなくて構いません。</div>
            `;
        } else {
            el.innerHTML = `
                <div style="color: #f39c12; font-weight: 700;">この画面からは生成サーバーに接続できません</div>
                <div style="margin-top: 4px;">
                    サロンのPCでアプリを起動すると、ご自分のClaudeログインで生成されます（APIキー不要）。
                    それ以外の場所から使う場合は、下にご自分のAPIキーを入れてください。
                </div>
            `;
        }

        renderAiProviderChoice(info);
    }

    /**
     * 「使うAI」の選択欄。
     *
     * このPCのClaudeログインはサーバー経由でしか呼べないので、
     * サーバーに繋がらない場所（共有リンク・出先の端末）では選べないようにする。
     * 選べない理由を出さないと「選んだのに効かない」になる。
     */
    function renderAiProviderChoice(info) {
        const select = document.getElementById('select-ai-provider');
        const note = document.getElementById('ai-provider-choice-note');
        if (!select || !note) return;

        const serverUp = Boolean(info && info.primary);
        const localClaudeReady = serverUp && info.agentSdk !== false;
        const pinned = Boolean(info && info.pinned);

        select.value = getPreferredProvider();

        const claudeOpt = select.querySelector('option[value="claude"]');
        if (claudeOpt) {
            claudeOpt.disabled = !localClaudeReady;
            claudeOpt.textContent = localClaudeReady
                ? 'このPCのClaudeログイン（APIキー不要）'
                : 'このPCのClaudeログイン（いまは使えません）';
        }
        select.disabled = pinned;

        const notes = [];
        if (pinned) {
            notes.push('サーバー側の <code>AI_PROVIDER</code> で固定されているため、ここでの選択は効きません。');
        } else if (!serverUp) {
            notes.push('サーバーに繋がっていないため、選べるのはご自分のAPIキーを使うものだけです。');
        } else {
            notes.push('選んだものを最初に試します。使えなかったときは、残りへ自動で切り替えます。');
            if (!localClaudeReady) {
                notes.push('このPCのClaudeログインは、<code>npm install</code> の実行と <code>claude</code> でのログインが要ります。');
            }
        }
        note.innerHTML = notes.join('<br>');

        renderClaudeModelChoice(info);
    }

    /**
     * Claude のモデル選択。
     *
     * Gemini を選んでいる時は関係がないので、まるごと隠す。
     * 出しっぱなしにすると「選んだのに効かない」に見える。
     */
    function renderClaudeModelChoice(info) {
        const box = document.getElementById('ai-model-choice');
        const select = document.getElementById('select-claude-model');
        const note = document.getElementById('ai-model-choice-note');
        if (!box || !select || !note) return;

        const provider = getPreferredProvider();
        const usesClaude = provider !== 'gemini';
        box.style.display = usesClaude ? '' : 'none';
        if (!usesClaude) return;

        if (!select.options.length) {
            CLAUDE_MODEL_CHOICES.forEach((m) => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.label;
                select.appendChild(opt);
            });
        }
        select.value = getPreferredClaudeModel();

        const fallbackModel = (info && info.models && info.models.claude) || '';
        note.innerHTML = select.value
            ? '重いモデルほど丁寧に書きますが、返事が返るまで長くかかります。'
            : `おまかせでは ${escapeHtml(fallbackModel || '速さ優先のモデル')} を使います。`;
    }

    const selectAiProvider = document.getElementById('select-ai-provider');
    if (selectAiProvider) {
        selectAiProvider.addEventListener('change', () => {
            const saved = setPreferredProvider(selectAiProvider.value);
            selectAiProvider.value = saved;
            showToast(
                saved === 'auto'
                    ? '使うAIを「おまかせ」にしました'
                    : `使うAIを「${getProviderChoiceLabel(saved)}」にしました`,
                'success'
            );
            // 選び直したら、上の案内とチャットの札も今の状態に合わせる。
            // 作り直さないと、選んだ後も前の繋ぎ先が出たままになる。
            forgetAiRoute();
            renderAiRouteStatus();
            detectAiRoute({ force: true }).then((route) => {
                const chat = window.auroraChat;
                if (chat && typeof chat.setRoute === 'function') {
                    chat.setRoute(route.label, route.tone, route.detail);
                }
            }).catch(() => { /* 札が変わらないだけ。生成そのものには影響しない */ });
        });
    }

    const selectClaudeModel = document.getElementById('select-claude-model');
    if (selectClaudeModel) {
        selectClaudeModel.addEventListener('change', () => {
            const saved = setPreferredClaudeModel(selectClaudeModel.value);
            selectClaudeModel.value = saved;
            const label = (CLAUDE_MODEL_CHOICES.find((m) => m.id === saved) || {}).label || 'おまかせ';
            showToast(`Claude のモデルを「${label}」にしました`, 'success');
            forgetAiRoute();
            renderAiRouteStatus();
            detectAiRoute({ force: true }).then((route) => {
                const chat = window.auroraChat;
                if (chat && typeof chat.setRoute === 'function') {
                    chat.setRoute(route.label, route.tone, route.detail);
                }
            }).catch(() => { /* 札が変わらないだけ */ });
        });
    }

    const btnSaveApiKey = document.getElementById('btn-save-ai-api-key');
    const btnClearApiKey = document.getElementById('btn-clear-ai-api-key');

    if (btnSaveApiKey) {
        btnSaveApiKey.addEventListener('click', () => {
            const input = document.getElementById('input-ai-api-key');
            if (!input) return;
            const value = input.value.trim();
            if (!value) {
                showToast('キーを入力してください。', 'error');
                return;
            }
            const { provider, added } = addApiKey(value);
            renderApiKeyPanel();
            showToast(
                added ? `${getProviderLabel(provider)} のキーを追加しました` : 'そのキーは既に登録されています',
                added ? 'success' : 'error'
            );
            // 登録したときに1回だけ、そのキーで使えるモデルを調べる。
            // 生成のたびには調べないので、ここで済ませておく。
            // デモ中の見本キーは本物ではないので問い合わせない。
            if (added && !isDemoRunning) {
                refreshModelChoice(provider, value).then(() => renderApiKeyPanel());
            }
        });
    }

    if (btnClearApiKey) {
        btnClearApiKey.addEventListener('click', () => {
            if (getStoredApiKeys().length === 0) {
                showToast('登録されているキーはありません。', 'error');
                return;
            }
            clearApiKeys();
            renderApiKeyPanel();
            showToast('APIキーをすべて削除しました', 'success');
        });
    }

    if (btnViewAdvice) {
        btnViewAdvice.addEventListener('click', (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            activateViewTab(btnViewAdvice);
            
            hideAllMainViews();
            if (adviceViewContainer) adviceViewContainer.style.display = 'block';
            if (customerDetailView) customerDetailView.style.display = 'none';
            if (customerModal) customerModal.classList.remove('active');

            if (workspaceGrid) {
                workspaceGrid.classList.remove('calendar-mode');
                workspaceGrid.classList.remove('detail-mode');
            }
            
            renderAdviceView();
        });
    }

    // ------------------------------------------------------------------
    // 星とアロマの見立て表
    //
    // 顧客に紐づかない参照もの。施術の前後に開いたままにできるよう、
    // モーダルではなくタブに置いている。カルテを見ながら確かめたいため。
    //
    // 精油の禁忌はここでは判定しない。oil-safety.js に問い合わせて印を
    // 付けるだけにする。2か所に安全の判断を持つと必ず食い違う。
    // ------------------------------------------------------------------
    let astroSign = null;        // いま開いている星座
    let astroClientId = '';      // 誰の禁忌で絞り込むか

    function renderAstroClientSelect() {
        const sel = document.getElementById('astro-client-select');
        if (!sel) return;
        const customers = getCustomers().filter((c) => !c.isArchived);
        sel.innerHTML = '<option value="">（絞り込まない）</option>'
            + customers.map((c) => `<option value="${escapeHtml(String(c.id))}"${
                String(c.id) === astroClientId ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
        sel.onchange = () => { astroClientId = sel.value; renderAstroDetail(); renderAstroStatic(); };
    }

    /** 精油1つを、その顧客に使えるかどうかの印つきで出す */
    function astroOilChipHtml(oil) {
        const customer = astroClientId
            ? getCustomers().find((c) => String(c.id) === astroClientId)
            : null;
        if (!customer) return `<span class="astro-oil">${escapeHtml(oil)}</span>`;
        const r = checkOil(oil, customer);
        if (r.status === 'avoid') {
            return `<span class="astro-oil is-avoid" title="${escapeHtml((r.reasons || []).join('・'))}">`
                + `${escapeHtml(oil)}<span class="astro-oil-why">${escapeHtml((r.reasons || []).join('・'))}</span></span>`;
        }
        if (r.status === 'care') {
            const why = [...(r.cares || []), ...(r.notes || [])].filter(Boolean).join(' / ');
            return `<span class="astro-oil is-care" title="${escapeHtml(why)}">`
                + `${escapeHtml(oil)}<span class="astro-oil-why">△</span></span>`;
        }
        if (r.status === 'unknown') {
            return `<span class="astro-oil is-unknown" title="安全性データが未登録です。自動判定にかかりません。">`
                + `${escapeHtml(oil)}<span class="astro-oil-why">?</span></span>`;
        }
        return `<span class="astro-oil is-ok">${escapeHtml(oil)}</span>`;
    }

    function renderAstroElements() {
        const host = document.getElementById('astro-elements');
        if (!host) return;
        const openEl = astroSign ? (getElementOfSign(astroSign) || {}).key : null;
        host.innerHTML = ELEMENTS.map((e) => `
            <div class="astro-element${e.key === openEl ? ' is-active' : ''}" data-element="${e.key}">
                <div class="astro-element-head">${e.icon} ${escapeHtml(e.name)}
                    <span class="astro-element-qual">${escapeHtml(e.qualities)}</span>
                    <span class="astro-element-signs">${e.signs.join('・')}</span></div>
                <div class="astro-element-row"><span>出やすいところ</span>${escapeHtml(e.tendency)}</div>
                <div class="astro-element-row"><span>組み立ての方向</span>${escapeHtml(e.approach)}</div>
            </div>`).join('');
    }

    function renderAstroSigns() {
        const host = document.getElementById('astro-signs');
        if (!host) return;
        host.innerHTML = SIGN_PROFILES.map((p) => {
            const el = getElement(p.element) || {};
            return `<button type="button" class="astro-sign${p.sign === astroSign ? ' is-active' : ''}"
                data-sign="${escapeHtml(p.sign)}">
                <span class="astro-sign-symbol">${p.symbol}</span>
                <span class="astro-sign-name">${escapeHtml(p.sign)}</span>
                <span class="astro-sign-el">${el.icon || ''}</span>
            </button>`;
        }).join('');
        host.querySelectorAll('[data-sign]').forEach((btn) => {
            btn.onclick = () => {
                // 同じものをもう一度押したら閉じる
                astroSign = (astroSign === btn.dataset.sign) ? null : btn.dataset.sign;
                renderAstroSigns();
                renderAstroElements();
                renderAstroDetail();
            };
        });
    }

    function renderAstroDetail() {
        const host = document.getElementById('astro-detail');
        if (!host) return;
        if (!astroSign) {
            host.innerHTML = '<div class="astro-empty">星座を選ぶと、その方に出やすいところと組み立ての目安が出ます。</div>';
            return;
        }
        const p = getSignProfile(astroSign);
        const el = getElement(p.element) || {};
        host.innerHTML = `
            <div class="astro-detail-card">
                <div class="astro-detail-head">
                    <span class="astro-detail-symbol">${p.symbol}</span>
                    <span class="astro-detail-name">${escapeHtml(p.sign)}</span>
                    <span class="astro-detail-el">${el.icon || ''} ${escapeHtml(el.name || '')}</span>
                </div>
                <div class="astro-tags">
                    <span class="astro-tag" title="陰陽（${escapeHtml((getPolarityOfSign(p.sign) || {}).alias || '')}）">☯ ${escapeHtml((getPolarityOfSign(p.sign) || {}).name || '')}</span>
                    <span class="astro-tag" title="三区分">${escapeHtml((getModalityOfSign(p.sign) || {}).name || '')}</span>
                    <span class="astro-tag" title="四元素の性質">${escapeHtml(el.qualities || '')}</span>
                    <span class="astro-tag" title="支配星">${p.rulerSymbol} ${escapeHtml(p.ruler)}</span>
                </div>
                <div class="astro-row"><span class="astro-row-label">担当する部位</span>
                    <span class="astro-row-body">${escapeHtml(p.body)}</span></div>
                <div class="astro-row"><span class="astro-row-label">持ち味</span>
                    <span class="astro-row-body">${escapeHtml(p.theme)}</span></div>
                <div class="astro-row"><span class="astro-row-label">出やすいところ</span>
                    <span class="astro-row-body">${escapeHtml(p.strain)}</span></div>
                <div class="astro-row"><span class="astro-row-label">合いやすい手技</span>
                    <span class="astro-row-body">${escapeHtml(p.work)}</span></div>
                <div class="astro-row"><span class="astro-row-label">主軸の候補</span>
                    <span class="astro-row-body astro-oils">${p.oils.map(astroOilChipHtml).join('')}</span></div>
                ${astroClientId ? '' : '<div class="astro-hint">上の「禁忌で絞り込む」で方を選ぶと、使えない精油に印が付きます。</div>'}
            </div>`;
    }

    function renderAstroStatic() {
        const src = document.getElementById('astro-source-note');
        if (src) {
            src.innerHTML = `${escapeHtml(SOURCE_NOTE.text)}<br>`
                + `<a href="${escapeHtml(SOURCE_NOTE.ref)}" target="_blank" rel="noopener noreferrer">`
                + `${escapeHtml(SOURCE_NOTE.refLabel)} ↗</a>`;
        }
        const axes = document.getElementById('astro-axes');
        if (axes) {
            axes.innerHTML = `<h3>分け方の軸</h3>
                <p class="astro-block-note">同じ「火」でも、活動宮と不動宮では疲れ方が違います。
                    重ねて見ると、見立てが細かくなります。</p>
                <div class="astro-axis">
                    <div class="astro-axis-head">☯ 陰陽（2分類）</div>
                    ${POLARITIES.map((x) => `
                        <div class="astro-axis-row">
                            <span class="astro-axis-name">${escapeHtml(x.name)}<small>${escapeHtml(x.alias)}</small></span>
                            <span class="astro-axis-body">${escapeHtml(x.nature)}<br>
                                <em>${escapeHtml(x.care)}</em></span>
                        </div>`).join('')}
                </div>
                <div class="astro-axis">
                    <div class="astro-axis-head">◐ 三区分（3分類）</div>
                    ${MODALITIES.map((x) => `
                        <div class="astro-axis-row">
                            <span class="astro-axis-name">${escapeHtml(x.name)}<small>${x.signs.join('・')}</small></span>
                            <span class="astro-axis-body">${escapeHtml(x.nature)}<br>
                                <em>${escapeHtml(x.care)}</em></span>
                        </div>`).join('')}
                </div>`;
        }

        const wu = document.getElementById('astro-wuxing');
        if (wu) {
            wu.innerHTML = `<h3>五行</h3>
                <p class="astro-block-note">
                    <strong>これは西洋占星術の一部ではありません。</strong>中国の医学・思想の体系で、出どころが違います。
                    12星座と五行を1対1で当てる決まった配当は存在しないので、別の軸として置いています。
                    四元素との橋渡しは目安で、<strong>金だけは対応する元素がありません</strong>。無理に埋めていないのはそのためです。
                    臓腑・感情・季節・色が揃っているので、色を扱うこのアプリとは相性のよい切り口です。
                </p>
                <div class="astro-zangfu">
                    <div class="astro-zangfu-row"><span>五臓</span>${ZANG_FU.zang.join('・')}</div>
                    <div class="astro-zangfu-row"><span>六腑</span>${ZANG_FU.fu.join('・')}</div>
                    <div class="astro-zangfu-note">${escapeHtml(ZANG_FU.note)}</div>
                </div>
                <div class="astro-wu-list">${WU_XING.map((w) => {
                    const br = w.bridge ? getElement(w.bridge) : null;
                    return `
                    <div class="astro-wu">
                        <div class="astro-wu-head">${w.icon} ${escapeHtml(w.name)}
                            <span class="astro-wu-color">${escapeHtml(w.color)}</span>
                            <span class="astro-wu-bridge">${br ? `${br.icon} ${escapeHtml(br.name)}と対応` : '対応する元素なし'}</span>
                        </div>
                        <div class="astro-row"><span class="astro-row-label">臓腑</span>
                            <span class="astro-row-body">${escapeHtml(w.zang)}（臓）・${escapeHtml(w.fu)}（腑）${
                                w.extra ? `<br><small>${escapeHtml(w.extra.zang)}・${escapeHtml(w.extra.fu)}（${escapeHtml(w.extra.label)}）</small>` : ''}</span></div>
                        <div class="astro-row"><span class="astro-row-label">感情・季節</span>
                            <span class="astro-row-body">${escapeHtml(w.emotion)}（${escapeHtml(w.sense)}・${escapeHtml(w.taste)}・${escapeHtml(w.season)}）</span></div>
                        <div class="astro-row"><span class="astro-row-label">出やすいところ</span>
                            <span class="astro-row-body">${escapeHtml(w.strain)}</span></div>
                        <div class="astro-row"><span class="astro-row-label">精油の候補</span>
                            <span class="astro-row-body astro-oils">${w.oils.map(astroOilChipHtml).join('')}</span></div>
                    </div>`;
                }).join('')}</div>`;
        }

        const blend = document.getElementById('astro-blend');
        if (blend) {
            blend.innerHTML = `<h3>ブレンドの組み立て</h3>
                <p class="astro-block-note">象徴だけでも、成分だけでも組めません。3つの役割で考えます。</p>
                <div class="astro-roles">${BLEND_ROLES.map((r) => `
                    <div class="astro-role">
                        <div class="astro-role-head"><strong>${escapeHtml(r.name)}</strong>
                            <span>${escapeHtml(r.short)}</span></div>
                        <div>${escapeHtml(r.what)}</div>
                        <div class="astro-role-why">${escapeHtml(r.why)}</div>
                    </div>`).join('')}</div>`;
        }
        const tech = document.getElementById('astro-techniques');
        if (tech) {
            tech.innerHTML = `<h3>手技の選び方</h3>
                <div class="astro-techs">${TECHNIQUES.map((t) => `
                    <div class="astro-tech">
                        <div class="astro-tech-head">${t.icon} ${escapeHtml(t.name)}
                            ${t.dilution ? `<span class="astro-tech-dil">${escapeHtml(t.dilution)}</span>` : ''}</div>
                        <div class="astro-row"><span class="astro-row-label">向くとき</span>
                            <span class="astro-row-body">${escapeHtml(t.target)}</span></div>
                        <div class="astro-row"><span class="astro-row-label">やり方</span>
                            <span class="astro-row-body">${escapeHtml(t.how)}</span></div>
                    </div>`).join('')}</div>
                <p class="astro-block-note">希釈の数字は目安です。顧客ごとの上限（体質）が優先されます。</p>`;
        }
        const safety = document.getElementById('astro-safety');
        if (safety) {
            safety.innerHTML = `<h3>施術以外で気をつけること</h3>
                <p class="astro-block-note">精油ごとの禁忌は「体質・アレルギー」から自動で判定されます。
                    ここに置くのは、精油の一覧では表せないものです。</p>
                ${SAFETY_NOTES.map((n) => `
                    <div class="astro-note">
                        <div class="astro-note-head">${n.icon} ${escapeHtml(n.title)}</div>
                        <div>${escapeHtml(n.body)}</div>
                    </div>`).join('')}`;
        }
    }

    function renderAstroAromaView() {
        renderAstroStatic();
        renderAstroClientSelect();
        renderAstroElements();
        renderAstroSigns();
        renderAstroDetail();
    }

    if (btnViewAstroAroma) {
        btnViewAstroAroma.addEventListener('click', (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            activateViewTab(btnViewAstroAroma);
            hideAllMainViews();
            if (astroAromaViewContainer) astroAromaViewContainer.style.display = 'block';
            if (customerDetailView) customerDetailView.style.display = 'none';
            if (customerModal) customerModal.classList.remove('active');
            if (workspaceGrid) {
                workspaceGrid.classList.remove('calendar-mode');
                workspaceGrid.classList.remove('detail-mode');
            }
            renderAstroAromaView();
        });
    }

    // getStoredApiKey は ai-client.js に移した。
    // 設定画面で入れたキーと、以前からある浮遊チャットの保存先の両方を見る。

    let currentAdvicePeriod = 'today';

    /**
     * いま読んでいる星詠みが、更新サイクルの中に居るかどうかを出す。
     *
     * 星詠みは**あらかじめ作ってファイルに置く**作りで、閲覧しても生成は走らない。
     * 作る人が居なければ古いまま出続けるので、「毎日更新」と書いてあるのに
     * 11日前のものが出ていた（ISSUE-059）。**古いときは古いと言う**ためのもの。
     *
     * サイクルの終わり（nextUpdateAtISO）は生成側が入れる。期間ごとの規則を
     * ここに書き写すと server/advice.js とずれるため、こちらでは判定しない。
     */
    function renderAdviceFreshness(el, data) {
        if (!el) return;
        const nextISO = data && data.nextUpdateAtISO;
        const next = nextISO ? new Date(nextISO) : null;

        // 古いファイル（この項目が無い時代のもの）では何も出さない。
        // 分からないのに「最新です」と言うほうが害が大きい。
        if (!next || Number.isNaN(next.getTime())) {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }

        const now = new Date();
        el.style.display = 'block';
        if (now < next) {
            el.innerHTML = '<span style="color: #10b981;">✅ 最新です</span>';
            return;
        }

        const days = Math.floor((now - next) / 86400000);
        const overdue = days >= 1 ? `${days}日` : '本日ぶん';
        el.innerHTML = '<span style="color: #f59e0b;">'
            + `⚠️ 更新サイクルを <strong>${escapeHtml(overdue)}</strong> 過ぎています。`
            + '<br><span style="opacity: 0.85;">'
            + '星詠みは、あらかじめ作ってファイルに置く作りです。'
            + '開いても作り直されません（<code>npm run advice:refresh</code> が要ります）。'
            + '</span></span>';
    }

    async function renderAdviceView(period = currentAdvicePeriod, force = false) {
        currentAdvicePeriod = period;
        const contentEl = document.getElementById('advice-content');
        const loadingEl = document.getElementById('advice-loading');
        const statsEl = document.getElementById('advice-planetary-stats');
        const titleEl = document.getElementById('advice-title');
        const timestampBadge = document.getElementById('advice-timestamp-badge');
        const updatedAtEl = document.getElementById('advice-updated-at');
        const nextUpdateEl = document.getElementById('advice-next-update');
        const freshnessEl = document.getElementById('advice-freshness');

        if (!contentEl || !loadingEl || !statsEl) return;

        // Update title and tabs UI
        const periodLabels = {
            'today': '今日',
            '1week': '直近1週間',
            '1month': '直近1ヶ月',
            '3months': '直近3ヶ月',
            '6months': '半年',
            '1year': '1年'
        };
        if (titleEl) {
            titleEl.textContent = `✨ ${periodLabels[period] || '今日'}の星詠みメッセージ`;
        }

        // 末尾の前後移動。6期間を循環させる（今日の前は1年、次は直近1週間）
        const periodOrder = ['today', '1week', '1month', '3months', '6months', '1year'];
        const currentIndex = Math.max(0, periodOrder.indexOf(period));
        const prevPeriod = periodOrder[(currentIndex - 1 + periodOrder.length) % periodOrder.length];
        const nextPeriod = periodOrder[(currentIndex + 1) % periodOrder.length];
        [['advice-nav-prev', prevPeriod], ['advice-nav-next', nextPeriod]].forEach(([id, target]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.setAttribute('data-period', target);
            const labelEl = document.getElementById(`${id}-label`);
            if (labelEl) labelEl.textContent = periodLabels[target];
        });

        const tabBtns = document.querySelectorAll('.advice-period-btn');
        tabBtns.forEach(btn => {
            const btnPeriod = btn.getAttribute('data-period');
            if (btnPeriod === period) {
                btn.classList.add('active');
                btn.style.background = 'var(--accent-cyan)';
                btn.style.color = '#000';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-secondary)';
            }
        });

        contentEl.innerHTML = '';
        statsEl.innerHTML = '';
        if (timestampBadge) timestampBadge.style.display = 'none';
        loadingEl.style.display = 'block';

        try {
            const apiKey = getStoredApiKey();
            const headers = { ...providerHeader() };
            if (apiKey) {
                headers['x-api-key'] = apiKey;
            }

            // 保存済みの星詠みファイルを読む。閲覧してもAIは呼ばれない。
            // 生成は scripts/refresh-advice.js の定期実行が担当する。
            let data = null;
            if (!force) {
                try {
                    const storeRes = await fetch(`data/advice/${encodeURIComponent(period)}.json`, { cache: 'no-cache' });
                    if (storeRes.ok) data = await storeRes.json();
                } catch (e) {
                    // ファイルが無い環境（開発中など）では下の生成APIにフォールバックする
                }
            }

            // 保存済みが無い場合のみ、ローカルのブリッジサーバーに生成を依頼する
            if (!data) {
                const url = `/api/daily-advice?period=${encodeURIComponent(period)}${force ? '&force=true' : ''}`;
                const res = await fetch(url, { headers });
                data = await res.json();
            }

            loadingEl.style.display = 'none';
            
            if (data.error) {
                contentEl.innerHTML = `<p style="color: #ff5252; padding: 12px; background: rgba(255,82,82,0.1); border-radius: 8px;">⚠️ ${data.error}</p>`;
                return;
            }

            // Display timestamp badge if available
            if (timestampBadge && updatedAtEl && nextUpdateEl && data.generatedAt) {
                // 生成したAI（Claude / Gemini）を明示する。Claudeが使えずGeminiに
                // 切り替わった場合はその旨も添える。
                let providerLabel = '';
                if (data.usedProvider) {
                    const fellBack = Array.isArray(data.fallbackFrom) && data.fallbackFrom.length > 0;
                    const icon = fellBack ? '⚠️' : '🤖';
                    const suffix = fellBack
                        ? `（${escapeHtml(data.fallbackFrom.join('・'))}が使えずフォールバック）` : '';
                    providerLabel = `<br><span style="opacity: 0.85;">${icon} 生成AI: `
                        + `<strong>${escapeHtml(String(data.usedProvider))}</strong> `
                        + `/ ${escapeHtml(String(data.usedModel || '-'))}${suffix}</span>`;
                }
                updatedAtEl.innerHTML = `📅 取得・生成日時: <strong>${escapeHtml(String(data.generatedAt))}</strong>${providerLabel}`;
                // 「更新目安」だと、そう更新されているように読める。
                // ここに書いてあるのは**作り直す間隔**であって、更新した証拠ではない（ISSUE-059）
                nextUpdateEl.innerHTML = `🔄 更新サイクル: <strong>${escapeHtml(String(data.updateInterval || '定期更新'))}</strong>`;
                renderAdviceFreshness(freshnessEl, data);
                timestampBadge.style.display = 'flex';
            }

            // Format advice (AI output parsing)
            let rawText = data.advice || '';
            let htmlContent = '';

            if (window.marked && typeof window.marked.parse === 'function') {
                // **生成AIの文をそのまま marked に渡さない**（ISSUE-088）。
                // marked v12 に sanitize は無いので、文の中に HTML があれば
                // そのまま HTML として出る。山括弧だけ先に潰しておけば、
                // 見出しや箇条書きはこれまでどおりで、タグだけが字に戻る。
                const noTags = String(rawText).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                htmlContent = window.marked.parse(noTags);
            } else {
                // Fallback clean markdown parser
                const lines = rawText.split('\n');
                const htmlList = [];
                let inList = false;

                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        if (inList) { htmlList.push('</ul>'); inList = false; }
                        return;
                    }

                    let formattedLine = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--accent-cyan); font-weight: 600;">$1</strong>');

                    if (formattedLine.startsWith('###') || formattedLine.startsWith('##') || formattedLine.startsWith('#')) {
                        if (inList) { htmlList.push('</ul>'); inList = false; }
                        const title = formattedLine.replace(/^#+\s*/, '');
                        htmlList.push(`<h3 style="color: var(--accent-cyan); font-size: 1.15rem; font-weight: 700; margin-top: 24px; margin-bottom: 12px; border-left: 4px solid var(--accent-cyan); padding-left: 10px; word-break: break-word; overflow-wrap: break-word;">${title}</h3>`);
                    } else if (formattedLine.startsWith('---')) {
                        if (inList) { htmlList.push('</ul>'); inList = false; }
                        htmlList.push('<hr style="border: none; border-top: 1px solid var(--border-glass); margin: 20px 0;">');
                    } else if (formattedLine.startsWith('- ') || formattedLine.startsWith('* ') || formattedLine.startsWith('・')) {
                        if (!inList) { htmlList.push('<ul style="padding-left: 20px; margin-bottom: 16px;">'); inList = true; }
                        const itemText = formattedLine.replace(/^(?:- |\* |・)/, '');
                        htmlList.push(`<li style="margin-bottom: 8px; line-height: 1.7; color: var(--text-primary); word-break: break-word; overflow-wrap: break-word;">${itemText}</li>`);
                    } else {
                        if (inList) { htmlList.push('</ul>'); inList = false; }
                        htmlList.push(`<p style="margin-bottom: 12px; line-height: 1.8; color: var(--text-primary); word-break: break-word; overflow-wrap: break-word; white-space: normal; max-width: 100%;">${formattedLine}</p>`);
                    }
                });

                if (inList) { htmlList.push('</ul>'); }
                htmlContent = htmlList.join('');
            }
            
            contentEl.innerHTML = `<div class="advice-markdown" style="background: rgba(255,255,255,0.02); padding: 24px; border-radius: 16px; border: 1px solid var(--border-glass); width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; overflow-wrap: break-word; word-break: break-word;">${htmlContent}</div>`;

            // Stats & Timeline rendering
            let statsHtml = `
                <div style="margin-bottom: 8px; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;">
                    <div style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <span>📍 基準日（${data.data.date}）の基本天体配置</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; width: 100%;">
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass);">
                            <div style="color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 4px; font-size: 0.75rem;">☀️ 太陽星座</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${data.data.sunSign}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass);">
                            <div style="color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 4px; font-size: 0.75rem;">🌙 月星座</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${data.data.moonSign}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass);">
                            <div style="color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 4px; font-size: 0.75rem;">🌑 月相</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${data.data.moonPhase}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass);">
                            <div style="color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 4px; font-size: 0.75rem;">☿️ 水星</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${data.data.mercurySign}${data.data.isMercuryRetrograde ? ' (逆行中)' : ''}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass);">
                            <div style="color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 4px; font-size: 0.75rem;">♀️ 金星</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${data.data.venusSign}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass);">
                            <div style="color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 4px; font-size: 0.75rem;">♂️ 火星</div>
                            <div style="color: var(--text-primary); font-weight: 600;">${data.data.marsSign}</div>
                        </div>
                    </div>
                </div>
            `;

            // 長期イベント（data.events）が存在する場合のタイムライン追加
            if (data.events && Array.isArray(data.events) && data.events.length > 0) {
                statsHtml += `
                    <div style="margin-top: 16px; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;">
                        <div style="color: var(--accent-cyan); font-size: 0.9rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                            <span>🌌 期間中の主な天体イベント＆星の移ろい（タイムライン）</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; width: 100%; box-sizing: border-box;">
                            ${data.events.map(ev => `
                                <div style="background: rgba(0, 243, 255, 0.04); padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(0, 243, 255, 0.2); display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; width: 100%; min-width: 0;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                                        <span style="font-size: 0.75rem; background: rgba(0, 243, 255, 0.15); color: var(--accent-cyan); padding: 2px 8px; border-radius: 10px; font-weight: 600;">📅 ${ev.date}</span>
                                        <span style="font-size: 0.72rem; color: var(--text-secondary); border: 1px solid rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 6px;">${ev.type}</span>
                                    </div>
                                    <div style="color: var(--text-primary); font-size: 0.88rem; font-weight: 600; margin-top: 2px; display: flex; align-items: center; gap: 6px; overflow-wrap: break-word; word-break: break-word;">
                                        <span>${ev.icon}</span> <span>${ev.title}</span>
                                    </div>
                                    <div style="color: var(--text-secondary); font-size: 0.78rem; line-height: 1.45; overflow-wrap: break-word; word-break: break-word;">${ev.desc}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            statsEl.innerHTML = statsHtml;

        } catch (err) {
            console.error('Advice fetch error:', err);
            loadingEl.style.display = 'none';
            contentEl.innerHTML = `<p style="color: #ff5252;">アドバイスの取得に失敗しました。サーバーの接続状況を確認してください。</p>`;
        }
    }

    /**
     * 星詠みカードの先頭（タイトルと期間タブが見える位置）まで戻す。
     * ヘッダーが position: sticky なので、その高さぶん手前で止める。
     */
    function scrollToAdviceTop() {
        const container = document.getElementById('advice-view-container');
        if (!container) return;
        const header = document.querySelector('header');
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        const top = container.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
        const reduceMotion = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    // Attach listener for advice period tabs
    // 末尾の前後移動ボタンも data-period を持つので同じ処理で扱う
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.advice-period-btn, .advice-nav-btn');
        if (btn) {
            const period = btn.getAttribute('data-period');
            if (period) {
                const rendering = renderAdviceView(period);
                // 末尾のボタンから移動した場合は、読み始められる位置まで戻す。
                // 描画中は本文が一旦空になりページが縮むため、スクロール位置が
                // 切り詰められてしまう。描画が終わってから移動する。
                if (btn.classList.contains('advice-nav-btn')) {
                    Promise.resolve(rendering)
                        .catch(() => {})
                        .then(() => requestAnimationFrame(scrollToAdviceTop));
                }
            }
        }
    });

    if (calendarPrevBtn) {
        calendarPrevBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });
    }

    if (calendarNextBtn) {
        calendarNextBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar();
        });
    }

    function renderCalendar() {
        if (!calendarGridBody) return;
        calendarGridBody.innerHTML = '';
        if (calendarMonthTitle) calendarMonthTitle.textContent = `${currentYear}年 ${currentMonth + 1}月`;

        const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
        const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
        const prevLastDay = new Date(currentYear, currentMonth, 0).getDate();
        const customers = getCustomers();

        // 前月の余白
        for (let i = firstDayIndex; i > 0; i--) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day other-month';
            cell.innerHTML = `<span class="calendar-day-num">${prevLastDay - i + 1}</span>`;
            calendarGridBody.appendChild(cell);
        }

        // 当月の日付
        const today = new Date();
        for (let day = 1; day <= lastDay; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day';

            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            cell.dataset.date = dateStr;

            if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day) {
                cell.classList.add('today');
            }
            if (selectedCalendarDateStr === dateStr) {
                cell.classList.add('selected');
            }

            cell.innerHTML = `<span class="calendar-day-num">${day}</span>`;

            // この日の来店記録を検索
            const dailyVisits = [];
            customers.forEach(cust => {
                (cust.records || []).forEach(rec => {
                    if (rec.date === dateStr) {
                        dailyVisits.push({ customer: cust, record: rec });
                    }
                });
            });
            // 同じ人が同じ日に何回も入ることがある（午前と午後、延長など）。
            // 札が同じ名前で3枚並ぶと、別人が3人来るように見えてしまうので、
            // 1人1枚にまとめ、回数は「×3」として名前の後ろに付ける。
            const dailyGroups = groupVisitsByCustomer(dailyVisits);

            if (dailyGroups.length > 0) {
                const indicators = document.createElement('div');
                indicators.className = 'calendar-day-indicators';

                // 札は「誰が来るか」を見せるためのもので、押し分けはしない。
                // マスのどこを押しても、その日の全員が下に出る。
                // ひとりを見たいときは、下の一覧から選ぶ。
                dailyGroups.slice(0, CALENDAR_NAME_CARDS).forEach(group => {
                    indicators.appendChild(buildCalendarNameCard(group));
                });

                // 入りきらないぶんは人数で出す。押せばその日の全員が下に出る。
                const rest = dailyGroups.length - CALENDAR_NAME_CARDS;
                if (rest > 0) {
                    const more = document.createElement('div');
                    more.className = 'calendar-name-card is-more';
                    more.innerHTML = `<span class="calendar-name-text">他${rest}人</span>`;
                    more.title = dailyGroups.slice(CALENDAR_NAME_CARDS)
                        .map((g) => buildGroupLabel(g)).join('\n');
                    indicators.appendChild(more);
                }
                cell.appendChild(indicators);
            }

            cell.addEventListener('click', () => {
                selectCalendarDay(cell, dateStr, dailyVisits);
            });

            calendarGridBody.appendChild(cell);
        }

        // 選択中の日付があれば、削除・更新後も最新の記録データで再描画する
        if (selectedCalendarDateStr) {
            const freshCustomers = getCustomers();
            const updatedDailyVisits = [];
            freshCustomers.forEach(cust => {
                if (cust.records) {
                    cust.records.forEach(rec => {
                        if (rec.date === selectedCalendarDateStr) {
                            updatedDailyVisits.push({ customer: cust, record: rec });
                        }
                    });
                }
            });
            showCalendarDayDetails(selectedCalendarDateStr, updatedDailyVisits);
        }

        fitCalendarNameCards(calendarGridBody);
    }

    /** 日付のマスを選び、その日の全員を下に出す */
    function selectCalendarDay(cell, dateStr, visits) {
        document.querySelectorAll('.calendar-day').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        selectedCalendarDateStr = dateStr;
        showCalendarDayDetails(dateStr, visits);
    }

    /**
     * 名前の札を、1行に収まるところまで小さくする。
     *
     * スマホだと1列が40px前後しかなく、既定の字の大きさでは
     * 「長谷川 美奈子」のような名前が2行になる。折り返すと日付のマスが
     * 縦に伸び、月の見通しが悪くなるため、字のほうを縮めて1行に収める。
     *
     * 縮めるだけで、途中で切らない。ただし極端に長い名前のために
     * 下限（5.5px）は設けてあり、そこを下回るぶんだけ末尾が「…」になる。
     * その場合も、押せば下の一覧にフルネームが出る。
     */
    function fitCalendarNameCards(root) {
        if (!root) return;
        const cards = root.querySelectorAll('.calendar-name-card');
        if (!cards.length) return;

        const MIN_PX = 5.5;

        // 測る前に、前回の縮小を消しておく。月を送るたびに小さくなっていく
        // のを防ぐため、必ず既定の大きさから測り直す。
        cards.forEach((card) => { card.style.fontSize = ''; });

        // 読み取り（測る）と書き込み（当てる）を混ぜると、札の数だけ
        // レイアウトが再計算される。先に全部測ってから、まとめて当てる。
        const plans = [];
        cards.forEach((card) => {
            const text = card.firstElementChild;   // .calendar-name-text
            if (!text) return;
            const avail = card.clientWidth
                - parseFloat(getComputedStyle(card).paddingLeft || 0)
                - parseFloat(getComputedStyle(card).paddingRight || 0);
            const needed = text.scrollWidth;
            if (avail <= 0 || needed <= avail) return;
            const base = parseFloat(getComputedStyle(card).fontSize);
            plans.push({ card, size: Math.max(MIN_PX, base * (avail / needed)) });
        });

        plans.forEach(({ card, size }) => { card.style.fontSize = `${size}px`; });
    }

    // 画面を回したり、窓の幅を変えたりすると列の幅が変わる。
    // measure し直さないと、縮めたままだったり、はみ出したままになる。
    let fitCardsTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(fitCardsTimer);
        fitCardsTimer = setTimeout(() => fitCalendarNameCards(calendarGridBody), 150);
    });

    // [MINOR v1.6.0] インライン簡易記録フォームをクリアする処理
    /**
     * 予約画面の「施術の区分」。カルテ側と同じ選択肢を、予約のときにも出す（ISSUE-068）。
     *
     * カレンダーや一覧にはアイコンで出るので、**予約の時点で入れておけると
     * 何の日か一目で分かる**。カルテ側とは別のモーダルなので、状態も別に持つ。
     */
    let inlineCategories = [];

    const inlineMenu = makeMenuPicker({
        grid: 'inline-service-categories', adhoc: 'inline-menu-adhoc',
        state: 'inline-menu-state', sum: 'inline-menu-sum',
        total: 'inline-menu-total', opens: 'inline-menu-opens',
    }, () => {
        inlineCategories = categoriesFromMenu(inlineMenu.keys);
        if (inlineRecordType) inlineRecordType.value = inlineMenu.label();
        if (inlineRecordAmount) inlineRecordAmount.value = inlineMenu.amount();
    });

    function renderInlineCategoryPicker() {
        inlineMenu.refresh();
    }

    function resetInlineForm() {
        inlineCategories = [];
        inlineMenu.set([], {}, '');
        const inlineFold = document.getElementById('inline-menu-fold');
        if (inlineFold) inlineFold.open = false;   // ふだんは畳んでおく
        if (inlineRecordType) inlineRecordType.value = '';
        if (inlineRecordAmount) inlineRecordAmount.value = '';
        if (inlineRecordTime) inlineRecordTime.value = '';
        if (inlineRecordComplaint) inlineRecordComplaint.value = '';
        if (inlineRecordPrescription) inlineRecordPrescription.value = '';
        if (inlineRecordNote) inlineRecordNote.value = '';


        // 詳細アコーディオン（details）を閉じる。
        // **id で指す。** 「最初の details」だと、金額の畳みを閉じてしまう
        const detailsEl = document.getElementById('inline-detail-fold');
        if (detailsEl) {
            detailsEl.removeAttribute('open');
        }
    }

    /** [MINOR v1.6.0] 予約フォームの対象顧客ドロップダウンを最新の顧客で埋める */
    function populateInlineCustomerSelect() {
        if (!inlineRecordCustomerId) return;
        const prev = inlineRecordCustomerId.value;
        inlineRecordCustomerId.innerHTML = '';
        getCustomers().forEach((cust) => {
            const opt = document.createElement('option');
            opt.value = cust.id;
            opt.textContent = `${cust.name} (${cust.customerNo || ''})`;
            inlineRecordCustomerId.appendChild(opt);
        });
        // 開き直したときに選択が飛ばないよう、可能なら元の顧客を保つ
        if (prev) inlineRecordCustomerId.value = prev;
    }

    /**
     * 施術までに埋まっていないもの。予約カードに出す。
     *
     * 順序は人によって違う（先に問診の方も、先に予約の方もいる）ので、
     * 順序は決めない。決めるのは「施術までに何が要るか」だけ。
     *
     * 出すのは2つに絞る。体質は禁忌の除外に直結し、生年月日は星詠みと
     * 下ごしらえに要る。初診問診は書くことが無い方もいるので出さない。
     * 消せない警告が並ぶと、そのうち全部見なくなる。
     */
    function buildVisitTodoHtml(customer, dateStr) {
        // 済んだ日の予約に「施術までに」と出しても仕方がない
        if (dateStr < toDateStr(new Date())) return '';

        const todo = [];
        if (!hasConstitutionData(customer)) {
            todo.push({ key: 'constitution', label: '体質・アレルギー' });
        }
        if (!customer.birthday) {
            todo.push({ key: 'birthday', label: '生年月日' });
        }
        if (todo.length === 0) return '';

        return `
            <div class="visit-todo" style="flex: 1 1 100%;">
                <span class="visit-todo-head">⚠ 施術までに</span>
                ${todo.map((t) => `<button type="button" class="visit-todo-btn"
                    data-todo="${t.key}" data-customer="${escapeHtml(String(customer.id))}"
                    >${escapeHtml(t.label)}</button>`).join('')}
            </div>`;
    }

    /** 未入力の印から、その入力欄へ連れていく */
    function gotoVisitTodo(customerId, kind) {
        if (kind === 'birthday') {
            openCustomerEditor(customerId, 'input-birthday');
            return;
        }
        // 体質・アレルギーは顧客詳細の「情報」タブにある
        if (workspaceGrid) workspaceGrid.classList.remove('calendar-mode');
        if (btnViewList) activateViewTab(btnViewList);
        showCustomerDetail(customerId);
        // 「この方のこと」は名前から開く形になった（ISSUE-077）
        openPersonalInfo(customerId);
        setTimeout(() => {
            const panel = document.querySelector('.constitution-panel');
            if (!panel) return;
            panel.open = true;
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 260);
    }

    function showCalendarDayDetails(dateStr, dailyVisits) {
        if (!calendarDayDetails) return;

        if (calendarDetailsTitle) {
            calendarDetailsTitle.textContent = `${dateStr.replace(/-/g, '/')}の記録`;
        }
        calendarDayDetails.style.display = 'block';

        populateInlineCustomerSelect();
        updateBookingButtonDate();
        resetInlineForm(); // 日付切り替え時にフォームを初期化

        if (calendarVisitsContainer) {
            calendarVisitsContainer.innerHTML = '';

            if (dailyVisits.length === 0) {
                calendarVisitsContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 12px;">この日の施術記録はありません。</div>`;
                return;
            }

            dailyVisits.forEach(visit => {
                const item = document.createElement('div');
                item.className = 'calendar-visit-item';
                item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 12px; margin-bottom: 8px;';
                item.innerHTML = `
                    <div class="cal-item-info" style="cursor: pointer; flex: 1;">
                        <div style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                            ${buildCustomerColorIndicatorHtml(visit.customer)}
                            <span style="color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(displayNameOf(visit.customer))}</span>
                            <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-secondary);">${visit.record.time ? `(${visit.record.time})` : ''}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
                            ${buildCategoryIconsHtml(visit.record)}${escapeHtml(recordTypeLabel(visit.record))} / <strong style="color: var(--accent-success);">${escapeHtml(recordAmountLabel(visit.record))}</strong>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; margin-left: 8px;">
                        <button class="btn-cal-edit-rec" title="予約・記録を変更" style="background: rgba(0, 242, 254, 0.12); border: 1px solid var(--accent-cyan); color: var(--accent-cyan); padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 2px;">
                            ✏️ <span class="btn-text">変更</span>
                        </button>
                        <button class="btn-cal-del-rec" title="予約・記録を削除" style="background: rgba(255, 82, 82, 0.12); border: 1px solid #ff5252; color: #ff5252; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 2px;">
                            🗑️ <span class="btn-text">削除</span>
                        </button>
                        <span class="goto-detail" title="顧客詳細へ" style="color: var(--text-secondary); font-weight: bold; cursor: pointer; padding: 2px 4px; font-size: 1.1rem;">&rarr;</span>
                    </div>
                    ${buildVisitTodoHtml(visit.customer, dateStr)}
                    ${visit.record.prepAdvice ? `
                        <div class="visit-prep-mark" style="flex: 1 1 100%;">
                            ✓ ${escapeHtml(formatPrepStamp(visit.record.prepAdvice.generatedAtISO))}に下ごしらえ済み（「変更」で読めます）
                        </div>` : ''}
                `;
                // 予約カードは横並びだが、下ごしらえの印は幅いっぱいに置く
                item.style.flexWrap = 'wrap';

                // AIの提案はカルテ側に一本化した。ここには「作ってあるか」だけ出す。
                // 生成と、生成した文面が入る欄とを、同じ画面に置くため。

                const btnEdit = item.querySelector('.btn-cal-edit-rec');
                if (btnEdit) {
                    btnEdit.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (onRecordEditRequested) onRecordEditRequested(visit.customer.id, visit.record.id);
                    });
                }

                const btnDel = item.querySelector('.btn-cal-del-rec');
                if (btnDel) {
                    btnDel.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        showConfirmModal({
                            title: '予約・施術記録の削除',
                            message: `${visit.customer.name} 様のこの予約・施術記録を削除してもよろしいですか？\n※この操作は取り消せません。`,
                            actionText: '削除する',
                            onConfirm: () => {
                                deleteRecord(visit.customer.id, visit.record.id);
                                cleanupPhotos();
                                showToast('予約・施術記録を削除しました', 'success');
                                item.remove(); // 直ちにリストからDOM削除
                                renderCalendar();
                                if (selectedCustomerId) {
                                    showCustomerDetail(selectedCustomerId);
                                }
                            }
                        });
                    });
                }

                const handleGoToDetail = (e) => {
                    e.stopPropagation();

                    // 予約とカルテは同じ記録で、違うのは日付だけ。
                    // これから先の日は「予約の中身」、済んだ日は「カルテ」を出す。
                    // まだ来ていない人のカルテを開いても、書くことが何も無い。
                    if (visit.record.date > toDateStr(new Date())) {
                        if (onRecordEditRequested) {
                            onRecordEditRequested(visit.customer.id, visit.record.id);
                        }
                        return;
                    }

                    if (searchContainerSection) {
                        searchContainerSection.style.display = '';
                        searchContainerSection.classList.remove('is-hidden');
                    }
                    if (customerListContainer) customerListContainer.style.display = '';
                    if (calendarViewContainer) calendarViewContainer.style.display = 'none';
                    if (workspaceGrid) workspaceGrid.classList.remove('calendar-mode');

                    if (btnViewList) {
                        activateViewTab(btnViewList);
                    }

                    // どの日の記録を見に来たのかを渡す。記録はたたんであるので、
                    // 渡さないと開いたときにどれを見ればよいか分からない。
                    window._highlightDate = visit.record.date;
                    showCustomerDetail(visit.customer.id);
                    const visitTypeTabBtn = document.querySelector('[data-tab="visit-type"]');
                    if (visitTypeTabBtn) visitTypeTabBtn.click();
                };

                item.querySelectorAll('.visit-todo-btn').forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        gotoVisitTodo(btn.dataset.customer, btn.dataset.todo);
                    });
                });

                const clickTarget = item.querySelector('.cal-item-info');
                const gotoDetailBtn = item.querySelector('.goto-detail');
                if (clickTarget) clickTarget.addEventListener('click', handleGoToDetail);
                if (gotoDetailBtn) gotoDetailBtn.addEventListener('click', handleGoToDetail);

                calendarVisitsContainer.appendChild(item);
            });
        }
    }

    // [MINOR v1.6.0] インライン記録フォームの保存処理イベントハンドラ
    if (btnInlineSubmitRecord) {
        btnInlineSubmitRecord.addEventListener('click', () => {
            if (!selectedCalendarDateStr) {
                showToast('日付が選択されていません。', 'error');
                return;
            }
            const customerId = inlineRecordCustomerId ? inlineRecordCustomerId.value : '';
            const type = inlineRecordType ? inlineRecordType.value : '';
            const amount = inlineRecordAmount ? inlineRecordAmount.value : '';

            const time = inlineRecordTime ? inlineRecordTime.value : '';
            const clientComplaint = inlineRecordComplaint ? inlineRecordComplaint.value : '';
            const prescription = inlineRecordPrescription ? inlineRecordPrescription.value : '';
            const therapistNote = inlineRecordNote ? inlineRecordNote.value : '';

            if (!customerId) {
                showToast('顧客を選択してください。', 'error');
                return;
            }
            // 施術メニューと金額は必須にしない。予約の時点ではまだ決まっていない
            // ことのほうが多く、忘れないうちに日だけ押さえられなくなる（ISSUE-063）。
            // **この画面はカルテ側の記録画面とは別物で、直しが片方だけになっていた**（ISSUE-065）。

            // 同じ時間帯に他の予約があれば、いったん確かめる（ISSUE-066）。
            // **止めはしない。** ご家族の同席や見学など、わざと重ねることがある。
            const clashes = findTimeClashes(
                findDayBookings(getCustomers(), selectedCalendarDateStr), time);
            if (clashes.length > 0) {
                showConfirmModal({
                    title: '同じ時間に予約があります',
                    message: `${formatBookingDate(selectedCalendarDateStr)} ${time} には、すでに`
                        + `${clashes.map(describeBooking).join('／')} が入っています。`
                        + `このまま追加しますか？`,
                    actionText: 'このまま追加する',
                    icon: '⏰',
                    theme: 'warning',
                    onConfirm: () => saveInlineRecord(customerId, type, amount, time,
                        clientComplaint, prescription, therapistNote)
                });
                return;
            }

            saveInlineRecord(customerId, type, amount, time,
                clientComplaint, prescription, therapistNote);
        });
    }

    /** 予約を実際に書き込む。重なりの確認を挟むので、保存だけを切り出してある。 */
    function saveInlineRecord(customerId, type, amount, time,
        clientComplaint, prescription, therapistNote) {
        {
            const updated = addRecord(customerId, selectedCalendarDateStr, type, amount, time,
                clientComplaint, prescription, therapistNote,
                {
                    categories: [...inlineCategories],
                    menu: inlineMenu.keys,
                    menuAmounts: inlineMenu.adhoc,
                });
            if (updated) {
                // 保存完了の視覚フィードバック
                const originalText = btnInlineSubmitRecord.textContent;
                btnInlineSubmitRecord.textContent = '保存しました！';
                btnInlineSubmitRecord.style.background = 'var(--accent-success)';
                btnInlineSubmitRecord.style.color = '#fff';
                btnInlineSubmitRecord.disabled = true;

                setTimeout(() => {
                    btnInlineSubmitRecord.textContent = originalText;
                    btnInlineSubmitRecord.style.background = '';
                    btnInlineSubmitRecord.style.color = '';
                    btnInlineSubmitRecord.disabled = false;

                    // フォームをクリアしてリフレッシュ
                    resetInlineForm();
                    closeBookingModal();
                    renderCalendar();

                    // 該当日の来店データを再取得して表示を更新する
                    const customers = getCustomers();
                    const dailyVisits = [];
                    customers.forEach(cust => {
                        if (cust.records) {
                            cust.records.forEach(rec => {
                                if (rec.date === selectedCalendarDateStr) {
                                    dailyVisits.push({ customer: cust, record: rec });
                                }
                            });
                        }
                    });
                    showCalendarDayDetails(selectedCalendarDateStr, dailyVisits);
                }, 1000);
            }
        }
    }


    /**
     * 新しい予約・記録を書く画面を、日付を入れた状態で開く。
     *
     * 入口は2つある。トップの📅（相手を選ぶ）と、その人のページの📅（相手は決まっている）。
     * **同じことを2か所に書くと、片方だけ直して食い違う。** ここに1つにまとめる。
     *
     * @param {string} dateStr   'YYYY-MM-DD'
     * @param {string} [fixedCustomerId] その人のページから開いたとき。選び直す欄は出さない
     */
    function openNewRecordFor(dateStr, fixedCustomerId) {
        if (!dateStr) return;
        resetRecordModal(); // [ISSUE-020] 直前の編集モードを持ち越さない
        setRecordFormReadonly(false);
        if (btnToggleEditRecord) btnToggleEditRecord.style.display = 'none';

        if (recordCustomerSelectGroup && inputRecordCustomerId) {
            inputRecordCustomerId.innerHTML = '';
            const customers = getCustomers();
            customers.forEach((cust) => {
                const opt = document.createElement('option');
                opt.value = cust.id;
                opt.textContent = `${cust.name} (${cust.customerNo || ''})`;
                inputRecordCustomerId.appendChild(opt);
            });
            if (fixedCustomerId) {
                // 相手が決まっているので選び直す欄は出さない。
                // 出しておくと、その人のページから別の人の予約を書けてしまう。
                inputRecordCustomerId.value = String(fixedCustomerId);
                recordCustomerSelectGroup.style.display = 'none';
            } else {
                recordCustomerSelectGroup.style.display = 'block';
            }
        }

        const dateEl = document.getElementById('input-date');
        if (dateEl) dateEl.value = dateStr;
        if (inputRecordCustomerId && inputRecordCustomerId.value) {
            loadRecordDraft(inputRecordCustomerId.value);
        }
        refreshRecordTimeWarning();
        if (recordModal) recordModal.classList.add('active');
    }
    openNewRecordRequested = openNewRecordFor;

    if (btnCalendarAddRecord) {
        btnCalendarAddRecord.addEventListener('click', () => {
            openNewRecordFor(selectedCalendarDateStr);
        });
    }

    // [ISSUE-NEW] カレンダーからの新規登録で顧客を切り替えたら下書きを読み込む
    if (inputRecordCustomerId) {
        inputRecordCustomerId.addEventListener('change', () => {
            loadRecordDraft(inputRecordCustomerId.value);
        });
    }

    // [ISSUE-NEW] 記録フォームの入力時に自動保存
    const recordInputs = ['input-date', 'input-time', 'input-type', 'input-client-complaint', 'input-prescription', 'input-therapist-note', 'input-amount'];
    recordInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                let targetId = selectedCustomerId;
                if (recordCustomerSelectGroup && recordCustomerSelectGroup.style.display === 'block' && inputRecordCustomerId) {
                    targetId = inputRecordCustomerId.value;
                }
                saveRecordDraft(targetId);
            });
        }
    });

    // 💡 使い方デモモーダルの制御
    const btnDemoGuide = document.getElementById('btn-demo-guide');
    const demoGuideModal = document.getElementById('demo-guide-modal');
    const btnCloseDemoModal = document.getElementById('btn-close-demo-modal');
    const btnStopLiveTour = document.getElementById('btn-stop-live-tour');

    const liveCursor = document.getElementById('live-demo-cursor');
    const liveCursorLabel = document.getElementById('live-demo-cursor-label');

    const btnPauseLiveTour = document.getElementById('btn-pause-live-tour');
    const tourBar = document.getElementById('tour-bar');
    const tourSeek = document.getElementById('tour-seek');
    const tourStepLabel = document.getElementById('tour-step-label');
    const tourBarCaption = document.getElementById('tour-bar-caption');

    let isDemoRunning = false;
    let isDemoPaused = false;

    // ── シーク（任意のステップへ移動）の仕組み ──
    //
    // ツアー本体は入れ子の深い逐次処理なので、ステップ単位に分割せず、
    // 「ラベル付きのカーソル移動を1ステップとして数える」方式にした。
    //
    //   前へ進む : 目標に達するまで待ち時間を詰めて早送りする
    //   前へ戻る : いったん中断し、頭から目標まで早送りして流し直す
    //
    // 早送りでも処理そのものは実行するので、画面の状態が飛ばずに済む。
    let tourStep = 0;          // いま何ステップ目か
    let tourTotal = 1;         // そのツアーの想定ステップ数
    let fastUntil = 0;         // この番号に達するまで早送りする
    let pendingRestartAt = null; // 巻き戻し要求（頭から流し直す位置）
    let isSeekDragging = false;
    // スライド前に一時停止していたか。移動先に着いたらこの状態へ戻す。
    let pausedBeforeSeek = false;

    /** いま目標ステップへ移動している最中か */
    const isFastForwarding = () => tourStep < fastUntil;

    /**
     * 移動中の目隠し。
     * 途中のステップも処理自体は実行する必要があるが、それが画面に
     * 見えると「8→9→10」と早送り再生されているように映る。
     * 移動が終わるまで覆いをかけ、移動先だけが見えるようにする。
     */
    let seekVeil = null;
    const showSeekVeil = (targetStep) => {
        if (!seekVeil) {
            seekVeil = document.createElement('div');
            seekVeil.id = 'tour-seek-veil';
            seekVeil.innerHTML = '<span></span>';
            document.body.appendChild(seekVeil);
        }
        seekVeil.querySelector('span').textContent = `${targetStep} へ移動中…`;
        seekVeil.classList.add('active');
        if (liveCursor) liveCursor.classList.add('is-hidden');
        // 説明はカーソルの外に出してあるので、別に隠す必要がある
        if (liveCursorLabel) liveCursorLabel.classList.add('is-hidden');
    };
    const hideSeekVeil = () => {
        if (seekVeil) seekVeil.classList.remove('active');
        if (liveCursor) liveCursor.classList.remove('is-hidden');
        if (liveCursorLabel) liveCursorLabel.classList.remove('is-hidden');
    };

    /**
     * 非同期スリープ。停止・一時停止・早送りの3つを見る。
     *
     * ツアーの待ち時間はカーソル移動・クリック・タイピングを含めて
     * すべてここを通るため、ここを制御すればツアー全体が制御できる。
     * 一時停止中は残り時間を減らさないので、再開すると続きから進む。
     */
    const sleep = (ms) => new Promise((resolve, reject) => {
        // 目標へ移動している最中は待たない。処理だけ流して、
        // 途中のコマは画面に出さずに移動先へ直接たどり着かせる。
        // （待たないので一時停止中でも移動できる）
        if (isFastForwarding()) {
            if (!isDemoRunning) {
                reject(new Error('DEMO_STOPPED'));
                return;
            }
            // 0ms でも一度イベントループに返るので、DOMの更新は反映される
            setTimeout(resolve, 0);
            return;
        }

        const TICK = 50;
        let remaining = ms;
        const id = setInterval(() => {
            if (!isDemoRunning) {
                clearInterval(id);
                reject(new Error('DEMO_STOPPED'));
                return;
            }
            // 待っている最中にシークが始まったら、この待機も打ち切る。
            // （待機の開始時点では通常速度でも、途中で早送りに変わりうる）
            if (isFastForwarding()) {
                clearInterval(id);
                setTimeout(resolve, 0);
                return;
            }
            if (isDemoPaused) return;
            remaining -= TICK;
            if (remaining <= 0) {
                clearInterval(id);
                resolve();
            }
        }, TICK);
    });

    /** 一時停止の切り替え。ボタンの見た目とカーソルのラベルに反映する。 */
    const setDemoPaused = (paused) => {
        // 早送りの最中に一時停止を押したら、移動をやめてその場で止める
        if (paused && isFastForwarding()) {
            fastUntil = 0;
            pausedBeforeSeek = false;
            hideSeekVeil();
        }
        isDemoPaused = paused;
        if (btnPauseLiveTour) {
            btnPauseLiveTour.textContent = paused ? '▶' : '⏸';
            btnPauseLiveTour.title = paused ? '再開' : '一時停止';
            btnPauseLiveTour.style.background = paused
                ? 'rgba(0, 230, 118, 0.92)'
                : 'rgba(115, 103, 240, 0.92)';
        }
        if (liveCursor) liveCursor.classList.toggle('is-paused', paused);
        // 説明はカーソルの外に出したので、体側の状態で色を変える
        document.body.classList.toggle('demo-paused', paused);
        // 早送りを打ち切った場合にバーの表示が残らないよう、ここでも更新する
        updateTourBar();
    };

    /**
     * 移動中の目標位置。移動している間はバーをここに固定する。
     * 実際の進み具合（5,6,7…）を出すと、タップした先へ飛んだのではなく
     * 頭から早送り再生しているように見えてしまうため。
     */
    const seekTarget = () => {
        if (pendingRestartAt !== null) return pendingRestartAt;
        if (fastUntil > 0) return fastUntil;
        return null;
    };

    /** 進行バーの表示を現在の状態に合わせる */
    const updateTourBar = (caption) => {
        const target = seekTarget();
        const shown = Math.min(target !== null ? target : tourStep, tourTotal);
        if (tourSeek) {
            tourSeek.max = String(tourTotal);
            // ドラッグ中はユーザーの操作を上書きしない
            if (!isSeekDragging) tourSeek.value = String(shown);
            const pct = tourTotal > 0 ? (shown / tourTotal) * 100 : 0;
            tourSeek.style.setProperty('--tour-progress', `${pct}%`);
        }
        if (tourStepLabel) tourStepLabel.textContent = `${shown} / ${tourTotal}`;
        if (tourBarCaption && caption != null) tourBarCaption.textContent = caption;
        if (tourBar) tourBar.classList.toggle('is-seeking', tourStep < fastUntil);
    };

    /**
     * ラベル付きのカーソル移動があるたびに1ステップ進める。
     * カーソルのラベルもここで先に出す。バーの表示と1ステップずれて
     * 見えないようにするため（移動の前に「これから何をするか」が出る）。
     */
    const advanceTourStep = (caption) => {
        tourStep += 1;
        // 想定より多く進んだ場合はバーの最大値を伸ばす（条件分岐で増減するため）
        if (tourStep > tourTotal) tourTotal = tourStep;
        // 移動先に着いた。一時停止していたなら止まったままにする。
        if (fastUntil > 0 && tourStep >= fastUntil) {
            fastUntil = 0;
            if (pausedBeforeSeek) {
                pausedBeforeSeek = false;
                setDemoPaused(true);
            }
        }
        // 移動が終わっていれば覆いを外す。先頭（0）へ戻した場合は
        // fastUntil が 0 のままなので、ここで外さないと残り続ける。
        if (!isFastForwarding()) hideSeekVeil();
        // 移動中は途中の文言を出さない（移動先の説明だけが見えるようにする）
        if (liveCursorLabel && caption && !isFastForwarding()) {
            liveCursorLabel.textContent = caption;
        }
        updateTourBar(isFastForwarding() ? undefined : caption);
    };

    /** バーで指定された位置へ移動する */
    const seekTourTo = (target) => {
        const clamped = Math.max(0, Math.min(target, tourTotal));
        if (clamped === tourStep) return;
        // 一時停止していたなら、移動先でも止まったままにする
        pausedBeforeSeek = isDemoPaused;
        showSeekVeil(clamped);
        if (clamped > tourStep) {
            // 前へ：目標まで早送り
            fastUntil = clamped;
            updateTourBar();
        } else if (clamped < tourStep) {
            // 後ろへ：頭から流し直す
            pendingRestartAt = clamped;
            isDemoRunning = false; // 実行中の sleep を中断させる
            updateTourBar();
        }
    };

    // 仮想カーソル移動
    const moveCursorTo = async (target, labelText) => {
        // ラベルが付いた移動＝説明の区切り。ここを1ステップとして数え、
        // 進行バーとシークの単位にする（対象が見つからない場合も数える。
        // 見つかるかどうかで総ステップ数が変わると位置がずれるため）。
        if (labelText) advanceTourStep(labelText);

        if (!target) return;
        let el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;

        // [DEMO-FIX] ターゲットが画面内にあるかチェック
        const rect = el.getBoundingClientRect();
        const isInViewport = (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );

        // 移動中は滑らかなスクロールをやめ、瞬時に位置だけ合わせる
        if (isFastForwarding()) {
            el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
            return;
        }

        // 画面外ならまず滑らかにスクロール
        if (!isInViewport) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            await sleep(1000); 
        } else {
            // 画面内であっても、端っこすぎる場合は少しスクロールして余裕を持たせる
            if (rect.top < 100 || rect.bottom > window.innerHeight - 100) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                await sleep(600);
            }
        }

        // ラベル更新
        if (labelText && liveCursorLabel) {
            liveCursorLabel.textContent = labelText;
        }

        // 現在位置を取得（transformから）
        let currentX = 0;
        let currentY = 0;
        if (liveCursor.style.transform) {
            const match = liveCursor.style.transform.match(/translate\((.*)px, (.*)px\)/);
            if (match) {
                currentX = parseFloat(match[1]);
                currentY = parseFloat(match[2]);
            }
        }

        // 目標位置を再計算
        const targetRect = el.getBoundingClientRect();
        const targetX = targetRect.left + targetRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2;

        // アニメーション
        // reject も受け取ること。中断時に reject を呼んでいるため、
        // 受け取っていないと ReferenceError になり Promise が永久に
        // 解決されず、ツアーがその場で固まる。
        return new Promise((resolve, reject) => {
            const duration = 700;
            let startTime = null;
            const safetyTimeout = setTimeout(() => {
                resolve();
            }, duration + 500);

            const animate = (timestamp) => {
                if (!isDemoRunning || !liveCursor) {
                    clearTimeout(safetyTimeout);
                    if (!isDemoRunning) reject(new Error('DEMO_STOPPED'));
                    else resolve();
                    return;
                }
                if (!startTime) startTime = timestamp;
                const progress = Math.min((timestamp - startTime) / duration, 1);
                
                // イージング（滑らかな加減速）
                const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                const x = currentX + (targetX - currentX) * ease;
                const y = currentY + (targetY - currentY) * ease;

                liveCursor.style.transform = `translate(${x}px, ${y}px)`;

                // 説明はカーソルのすぐ近くに置く。ただし画面からはみ出すと
                // 読めなくなるので、端に来たら反対側へ回り込ませる。
                if (liveCursorLabel) {
                    const lw = liveCursorLabel.offsetWidth || 240;
                    const lh = liveCursorLabel.offsetHeight || 60;
                    const M = 8;
                    let lx = x + 28;
                    let ly = y + 28;
                    if (lx + lw > window.innerWidth - M) lx = Math.max(M, x - lw - 12);
                    if (ly + lh > window.innerHeight - M) ly = Math.max(M, y - lh - 12);
                    liveCursorLabel.style.left = `${Math.max(M, lx)}px`;
                    liveCursorLabel.style.top = `${Math.max(M, ly)}px`;
                }

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    clearTimeout(safetyTimeout);
                    resolve();
                }
            };
            requestAnimationFrame(animate);
        });
    };

    // クリックシミュレーション
    const clickCursor = async (target) => {
        if (!target) return;
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // リップル波紋
        const ripple = document.createElement('div');
        ripple.className = 'demo-click-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);

        el.click();
        await sleep(500);
    };

    // タイピングシミュレーション
    // 日付や時刻の欄は、押した時点でOSのピッカーが開いてしまう。
    // デモは値を直接入れるので押す必要がなく、押せば画面を覆うだけになる。
    const PICKER_INPUT_TYPES = ['date', 'time', 'datetime-local', 'month', 'week'];

    const typeInput = async (inputEl, text, labelText) => {
        if (!inputEl) return;

        const opensPicker = PICKER_INPUT_TYPES.indexOf(inputEl.type) > -1;

        if (labelText) {
            await moveCursorTo(inputEl, labelText);
            if (!opensPicker) await clickCursor(inputEl);
        } else {
            await moveCursorTo(inputEl);
        }

        // [DEMO-FIX] スマホでのキーボード強制表示を徹底的に防ぐ
        const prevInputMode = inputEl.inputMode;
        const prevReadOnly = inputEl.readOnly;

        if (opensPicker) {
            inputEl.value = text;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            // 何かの拍子に開いていたら閉じる
            if (document.activeElement === inputEl) inputEl.blur();
            await sleep(500);
            return;
        }

        inputEl.inputMode = 'none';
        inputEl.readOnly = true; // フォーカス時のキーボード表示を抑制
        
        inputEl.value = '';
        inputEl.focus();
        
        for (let i = 0; i < text.length; i++) {
            inputEl.value += text[i];
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(80);
        }
        
        // 状態を戻す
        inputEl.readOnly = prevReadOnly;
        if (prevInputMode) {
            inputEl.inputMode = prevInputMode;
        } else {
            inputEl.removeAttribute('inputmode');
        }
        
        await sleep(300);
    };

    // ドロップダウンリストアニメーション選択
    const selectDropdownOption = async (selectEl, targetOptionIndexOrValue, labelText) => {
        if (!selectEl) return;

        // 1. ドロップダウンの位置に移動してクリック
        await moveCursorTo(selectEl, labelText);
        await clickCursor(selectEl);
        // 選択肢は自前のオーバーレイで見せる。OS標準の一覧が同時に開くと
        // 画面を覆ってしまうので、フォーカスは持たせない。
        if (document.activeElement === selectEl) selectEl.blur();

        // 対象オプションインデックスの算出
        let targetIndex = 0;
        if (typeof targetOptionIndexOrValue === 'number') {
            targetIndex = targetOptionIndexOrValue;
        } else {
            const options = Array.from(selectEl.options);
            const idx = options.findIndex(opt => opt.value === targetOptionIndexOrValue || opt.text.includes(targetOptionIndexOrValue));
            targetIndex = idx >= 0 ? idx : 0;
        }

        // 2. ドロップダウンリスト風オーバーレイUIの生成
        const rect = selectEl.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'demo-dropdown-menu';
        menu.style.left = `${rect.left}px`;
        
        // [DEMO-FIX] 画面外にはみ出さないように配置調整
        let top = rect.bottom + 4;
        if (top + 200 > window.innerHeight) {
            top = rect.top - 200 - 4; // 上に表示
        }
        menu.style.top = `${top}px`;
        menu.style.width = `${Math.max(rect.width, 220)}px`;

        const options = Array.from(selectEl.options);
        const itemEls = [];

        options.forEach((opt, idx) => {
            const item = document.createElement('div');
            item.className = `demo-dropdown-item ${idx === selectEl.selectedIndex ? 'selected' : ''}`;
            item.textContent = opt.text;
            menu.appendChild(item);
            itemEls.push(item);
        });

        document.body.appendChild(menu);

        // 移動や停止で処理が打ち切られると、以降の後片付けに辿り着かない。
        // 開いた選択肢が画面に残り続けるので、必ず消えるようにする。
        try {
            await sleep(400);

            // 3. カーソルを対象オプション項目へ移動し選択クリック
            const targetItemEl = itemEls[targetIndex] || itemEls[0];
            if (targetItemEl) {
                // [DEMO-FIX] ドロップダウン内の項目も必要に応じてスクロール
                targetItemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                await sleep(300);

                itemEls.forEach(el => el.classList.remove('active-hover'));
                targetItemEl.classList.add('active-hover');

                await moveCursorTo(targetItemEl, labelText);
                await sleep(300);
                await clickCursor(targetItemEl);

                // 実際の選択値を適用
                selectEl.selectedIndex = targetIndex;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // 4. クローズ
            await sleep(300);
        } finally {
            menu.remove();
        }
        await sleep(300);
    };

    // ライブツアーの停止
    /**
     * デモを抜けたあと、起動直後と同じ画面に戻す。
     * ツアーは顧客詳細やモーダルを開いたまま終わることがあるため、
     * 開きっぱなしのものを閉じて顧客一覧へ戻す。
     */
    const resetToInitialView = () => {
        document.querySelectorAll('.modal-overlay.active').forEach((m) => m.classList.remove('active'));
        document.querySelectorAll('.demo-dropdown-menu').forEach((m) => m.remove());

        const closeDetail = document.getElementById('btn-close-detail');
        if (closeDetail) closeDetail.click();

        const search = document.getElementById('search-input');
        if (search && search.value) {
            search.value = '';
            search.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const btnList = document.getElementById('btn-view-list');
        if (btnList) btnList.click();

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /** ツアーの後片付け。バーとカーソルを消し、初期画面へ戻す。 */
    /** デモが画面に足した一時的なものを消す（選択肢の一覧・波紋） */
    function clearDemoOverlays() {
        document.querySelectorAll('.demo-dropdown-menu, .demo-click-ripple')
            .forEach((el) => el.remove());
    }

    const stopLiveTour = () => {
        clearDemoOverlays();
        isDemoRunning = false;
        pendingRestartAt = null;
        fastUntil = 0;
        hideSeekVeil();
        setDemoPaused(false);
        document.body.classList.remove('demo-active');
        if (liveCursor) liveCursor.classList.remove('active');
        if (tourBar) tourBar.classList.remove('active', 'is-seeking');
        resetToInitialView();
    };

    /**
     * ツアーを実行する。巻き戻しが要求されたら、頭から目標位置まで
     * 早送りして流し直す（本体は逐次処理なので、途中から始められない）。
     *
     * @param {Function} tourBody ツアー本体。開始・終了処理は持たない。
     * @param {number} totalSteps 進行バーに出す想定ステップ数。
     */
    // ------------------------------------------------------------------
    // デモの後始末
    //
    // デモは見せるために顧客や予約を作る。途中で止められても、閉じられても、
    // それが実際の一覧に残ってはいけない。作った側がここに片付け方を預け、
    // runTour がどんな終わり方でも必ず実行する。
    //
    // ページごと閉じられた場合に備えて、作ったものには印を付けてある。
    // 起動時に印の残りを掃除する（purgeTourLeftovers）。
    // ------------------------------------------------------------------

    let tourCleanups = [];

    /** デモ本体から「終わったらこれを片付けて」と預かる */
    function onTourCleanup(fn) {
        tourCleanups.push(fn);
    }

    /** 預かった片付けを全部実行する。1つ失敗しても残りは続ける */
    function runTourCleanups() {
        const jobs = tourCleanups;
        tourCleanups = [];
        jobs.forEach((fn) => {
            try { fn(); } catch (err) { console.warn('デモの後始末に失敗:', err); }
        });
    }

    const runTour = async (tourBody, totalSteps) => {
        if (isDemoRunning) return;
        // 前回の残りがあれば、新しいデモを始める前に片付ける
        runTourCleanups();

        tourTotal = totalSteps;
        document.body.classList.add('demo-active');
        if (demoGuideModal) demoGuideModal.classList.remove('active');
        if (liveCursor) liveCursor.classList.add('active');
        if (tourBar) tourBar.classList.add('active');

        let startAt = 0;
        let isRestart = false;
        for (;;) {
            isDemoRunning = true;
            // 最初の開始時だけ一時停止を解除する。巻き戻しでの再実行では
            // 一時停止の状態を引き継ぎ、移動先で止まったままにする。
            if (!isRestart) setDemoPaused(false);
            tourStep = 0;
            fastUntil = startAt;
            pendingRestartAt = null;
            // 先頭へ戻した場合は早送りが不要なので、ここで覆いを外す
            if (!isFastForwarding()) hideSeekVeil();
            updateTourBar('');

            clearDemoOverlays();
            try {
                await tourBody();
            } catch (err) {
                if (err.message === 'DEMO_NO_SAMPLE') {
                    showToast('デモにはサンプル顧客が必要です。顧客一覧をご確認ください。', 'error');
                } else if (err.message !== 'DEMO_STOPPED') {
                    console.error('Demo error:', err);
                }
            }

            if (pendingRestartAt === null) {
                // 最後まで流れきったらバーを終端に合わせる。
                // 早送りで飛ばすと生成待ちの分岐を通らず、想定より
                // ステップ数が少なくなることがあるため。
                if (isDemoRunning) {
                    tourTotal = tourStep;
                    updateTourBar();
                }
                break;
            }
            startAt = pendingRestartAt;
            isRestart = true;
        }

        runTourCleanups();
        stopLiveTour();
    };

    if (btnStopLiveTour) {
        btnStopLiveTour.addEventListener('click', stopLiveTour);
    }

    if (btnPauseLiveTour) {
        btnPauseLiveTour.addEventListener('click', () => setDemoPaused(!isDemoPaused));
    }

    if (tourSeek) {
        // ドラッグ中は数字だけ先に動かし、離した時点で実際に移動する。
        // 途中の値ごとに飛ぶと、早送りが何度も走って落ち着かないため。
        const onDragStart = () => { isSeekDragging = true; };
        const onDragMove = () => {
            if (tourStepLabel) tourStepLabel.textContent = `${tourSeek.value} / ${tourTotal}`;
            tourSeek.style.setProperty('--tour-progress',
                `${tourTotal > 0 ? (Number(tourSeek.value) / tourTotal) * 100 : 0}%`);
        };
        const onDragEnd = () => {
            isSeekDragging = false;
            seekTourTo(Number(tourSeek.value));
        };

        tourSeek.addEventListener('pointerdown', onDragStart);
        tourSeek.addEventListener('touchstart', onDragStart, { passive: true });
        tourSeek.addEventListener('input', onDragMove);
        tourSeek.addEventListener('change', onDragEnd);
        tourSeek.addEventListener('pointerup', onDragEnd);
        tourSeek.addEventListener('touchend', onDragEnd);
        // キーボード操作でも動かせるように
        tourSeek.addEventListener('keyup', onDragEnd);
    }

    // --- 施術プラン選択の連動ロジック ---
    const planModal = document.getElementById('plan-modal');
    const planListContainer = document.getElementById('plan-list-container');
    const btnAddPlan = document.getElementById('btn-add-new-plan');
    const btnClosePlanModal = document.getElementById('btn-close-plan-modal');
    const newPlanNameInput = document.getElementById('new-plan-name');
    const newPlanAmountInput = document.getElementById('new-plan-amount');

    /**
     * 時間帯の選択肢を組む。
     *
     * 以前は 10:00〜18:00 しか無かった。靈氣やアニマルコミュニケーションは
     * 夜中に行うこともあるので、終日ぶん出す。
     */
    function buildTimeOptions() {
        const parts = ['<option value="">-- 時間を選択 --</option>'];
        for (let h = 0; h < 24; h++) {
            for (const m of ['00', '30']) {
                const t = `${String(h).padStart(2, '0')}:${m}`;
                parts.push(`<option value="${t}">${t}</option>`);
            }
        }
        const html = parts.join('');
        ['input-time', 'inline-record-time'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const keep = el.value;
            el.innerHTML = html;
            el.value = keep;
        });
    }

    buildTimeOptions();

    /**
     * 施術内容（メニュー）の編集（ISSUE-085）。
     *
     * 足せるのは**押すもの**だけ。書く欄（区分）は、いまの10個から選ぶ。
     * 記録は区分の key で書く欄を指しているので、欄を増やすというのは
     * 「そこに書いたものの行き先を新しく作る」話になり、別の作業になる。
     */
    function renderPlans() {
        [recordMenu, inlineMenu].forEach((m) => m && m.refresh());

        if (!planListContainer) return;
        const menu = getServiceMenu();
        planListContainer.innerHTML = '';

        menu.forEach((m, i) => {
            const field = SERVICE_CATEGORY_DEFS.find((c) => c.key === m.field);
            const row = document.createElement('div');
            row.className = 'menu-edit-row';
            row.innerHTML = `
                <span class="menu-edit-ic" aria-hidden="true">${m.icon}</span>
                <span class="menu-edit-nm"></span>
                <span class="menu-edit-amt${(m.amount === 'none' || m.amount === null) ? ' none' : ''}"></span>
                <span class="menu-edit-fld"></span>`;
            row.querySelector('.menu-edit-nm').textContent = m.name;
            row.querySelector('.menu-edit-amt').textContent = priceLabel(m.amount);
            row.querySelector('.menu-edit-fld').textContent = field ? `${field.icon} ${field.name}` : '欄なし';

            const up = document.createElement('button');
            up.type = 'button';
            up.className = 'menu-edit-mini';
            up.textContent = '↑';
            up.title = `${m.name} を上へ`;
            up.setAttribute('aria-label', `${m.name} を上へ`);
            up.disabled = i === 0;
            up.onclick = () => {
                const next = [...menu];
                next.splice(i - 1, 0, next.splice(i, 1)[0]);
                saveServiceMenu(next);
                renderPlans();
            };

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'menu-edit-mini danger';
            del.textContent = '×';
            del.title = `${m.name} を消す`;
            del.setAttribute('aria-label', `${m.name} を消す`);
            del.onclick = () => {
                showConfirmModal({
                    title: `「${m.name}」を消しますか？`,
                    message: 'これから選べなくなります。'
                        + '**すでに書かれた記録は消えません**が、この名前は出なくなります。',
                    actionText: '消す',
                    onConfirm: () => {
                        saveServiceMenu(menu.filter((x) => x.key !== m.key));
                        showToast(`「${m.name}」を消しました`, 'success');
                        renderPlans();
                    }
                });
            };

            row.append(up, del);
            planListContainer.appendChild(row);
        });
    }

    /** 足すときの「開く書く欄」の選択肢 */
    function fillMenuFieldOptions() {
        const sel = document.getElementById('new-plan-field');
        if (!sel) return;
        sel.innerHTML = '<option value="">欄なし（金額だけ）</option>'
            + SERVICE_CATEGORY_DEFS.map((c) =>
                `<option value="${c.key}">${c.icon} ${escapeHtml(c.name)}</option>`).join('');
        sel.value = 'session';
    }
    fillMenuFieldOptions();

    // 「決まった額」のときだけ、金額の欄を出す
    const newPlanKind = document.getElementById('new-plan-kind');
    function syncPlanKind() {
        const wrap = document.getElementById('new-plan-amount-wrap');
        if (wrap && newPlanKind) wrap.style.display = newPlanKind.value === 'fixed' ? '' : 'none';
    }
    if (newPlanKind) newPlanKind.addEventListener('change', syncPlanKind);
    syncPlanKind();

    renderPlans();

    document.querySelectorAll('.btn-manage-plans').forEach(btn => {
        btn.addEventListener('click', () => {
            renderPlans();
            if (planModal) planModal.classList.add('active');
        });
    });

    if (btnClosePlanModal) {
        btnClosePlanModal.addEventListener('click', () => {
            if (planModal) planModal.classList.remove('active');
        });
    }
    if (planModal) {
        planModal.addEventListener('click', (e) => {
            if (e.target === planModal) planModal.classList.remove('active');
        });
    }

    if (btnAddPlan) {
        btnAddPlan.addEventListener('click', () => {
            const name = (newPlanNameInput.value || '').trim();
            if (!name) {
                showToast('名前を入れてください', 'error');
                newPlanNameInput.focus();
                return;
            }
            const kind = newPlanKind ? newPlanKind.value : 'fixed';
            const amount = kind === 'fixed'
                ? (parseInt(newPlanAmountInput.value, 10) || 0)
                : kind === 'adhoc' ? null : 'none';
            const icon = (document.getElementById('new-plan-icon').value || '').trim() || '✳️';
            const field = (document.getElementById('new-plan-field') || {}).value || '';

            const menu = getServiceMenu();
            // key は名前から作らない。名前を直したときに、記録との繋がりが切れる
            saveServiceMenu(menu.concat([{
                key: `m-add-${Date.now().toString(36)}`, icon, name, amount, field,
            }]));
            newPlanNameInput.value = '';
            newPlanAmountInput.value = '';
            showToast(`「${name}」を足しました`, 'success');
            renderPlans();
        });
    }

    // ------------------------------------------------------------------
    // デモは、その機能を使う場所ごとに1本ずつ置く。
    //
    // 以前は「登録から記録まで」を通しで見せる長いデモが2本あったが、
    // 中身が重なり、知りたいことに辿り着くまで数分待つ必要があった。
    // 短いものを使う場所に置き、そこから始められるようにしてある。
    //
    // どのデモも、作ったものは最後に消す（onTourCleanup / isTourTemp）。
    // ------------------------------------------------------------------

    // デモ用に登録する顧客。画数を引ける漢字だけで組み、5色が別々に出て
    // マスターナンバー（11）も現れる名前と生年月日を選んである。
    const DEMO_SOUL_NAME = '山本 美咲';
    const DEMO_SOUL_KANA = 'やまもと みさき';
    const DEMO_SOUL_BIRTHDAY = '1990-05-14';

    /**
     * サンプルの鈴木さん（高血圧）を開く。禁忌の除外が実際に働くので例に使う。
     *
     * どの画面から始めても動くようにする。顧客詳細を開いたままだと一覧の
     * カードが無く、探しても見つからずにデモが即終了してしまうため、
     * 先に詳細を閉じてから一覧へ戻す。
     */
    async function openSuzuki(stepNo, label) {
        const detail = document.getElementById('customer-detail-view');
        if (detail && detail.style.display !== 'none') {
            const close = document.getElementById('btn-close-detail');
            if (close) { await clickCursor(close); await sleep(800); }
        }
        const btnList = document.getElementById('btn-view-list');
        if (btnList && !btnList.classList.contains('active')) {
            await clickCursor(btnList);
            await sleep(900);
        }
        const card = Array.from(document.querySelectorAll('.customer-card-grid-item'))
            .find((c) => c.textContent.includes('鈴木'));
        if (!card) throw new Error('DEMO_NO_SAMPLE');
        await moveCursorTo(card, `${stepNo()}. ${label}`);
        await clickCursor(card);
        await sleep(1400);
        return card;
    }

    // ------------------------------------------------------------------
    // 1. 新規登録のデモ（顧客登録ボタンの隣から）
    //    名前と誕生日から5色が決まるところと、体質の登録まで。
    // ------------------------------------------------------------------
    const REGISTER_TOUR_STEPS = 19;
    const registerTourBody = async () => {
        let n = 0;
        const stepNo = () => ++n;

        const btnList = document.getElementById('btn-view-list');
        if (btnList && !btnList.classList.contains('active')) {
            await moveCursorTo(btnList, '準備：顧客一覧から始めます');
            await clickCursor(btnList);
            await sleep(900);
        }

        // 作る前に片付け方を決めておく。登録ボタンを押した瞬間から顧客は
        // 存在するので、あとから預けたのでは隙ができる。
        const knownIds = new Set(getCustomers().map((c) => String(c.id)));
        const dropDemoCustomers = () => {
            getCustomers()
                .filter((c) => !knownIds.has(String(c.id))
                    && (c.isTourTemp || c.name === DEMO_SOUL_NAME))
                .forEach((c) => deleteCustomer(c.id));
            clearTourPending();
            if (onRecordsChanged) onRecordsChanged();
        };
        markTourPending(DEMO_SOUL_NAME);   // ページごと閉じられた場合の保険
        onTourCleanup(dropDemoCustomers);  // 途中で止められた場合

        const btnAdd = document.getElementById('btn-add-customer');
        if (btnAdd) {
            await moveCursorTo(btnAdd, `${stepNo()}. 「顧客登録」を押します`);
            await clickCursor(btnAdd);
            await sleep(900);
        }

        const nameEl = document.getElementById('input-name');
        if (nameEl) {
            await typeInput(nameEl, DEMO_SOUL_NAME, `${stepNo()}. お名前を入れます。上の3色はこの画数から出ます`);
            await sleep(700);
        }
        const kanaEl = document.getElementById('input-kana');
        if (kanaEl) {
            await typeInput(kanaEl, DEMO_SOUL_KANA, `${stepNo()}. よみがな。ふだんは名前を打つと自動で入ります`);
            await sleep(500);
        }
        const birthdayEl = document.getElementById('input-birthday');
        if (birthdayEl) {
            await typeInput(birthdayEl, DEMO_SOUL_BIRTHDAY, `${stepNo()}. 生年月日を入れます`);
            await sleep(700);
        }

        // 5色は手で選ぶ形になった（ISSUE-079）
        const slots = document.getElementById('soul-color-slots');
        if (slots) {
            await moveCursorTo(slots, `${stepNo()}. ソウルカラーは、この5つの丸を押して選びます`);
            await sleep(4200);
        }

        // 体質は施術までに要る。分かっているなら、ここで入れておくのが早い。
        const conDraft = document.getElementById('customer-constitution-editor');
        if (conDraft) {
            await moveCursorTo(conDraft, `${stepNo()}. 体質とアレルギーも、分かっていればここで入れておけます`);
            await sleep(4600);
            await moveCursorTo(conDraft, `${stepNo()}. 分からなければ空のままで構いません。あとからカルテでも入れられます`);
            await sleep(4800);
        }

        const btnSubmit = document.getElementById('btn-submit-customer');
        if (btnSubmit) {
            await moveCursorTo(btnSubmit, `${stepNo()}. このまま登録します`);
            await clickCursor(btnSubmit);
            // 押した時点で顧客はできている。待つ前に印を付ける。
            const justMade = getCustomers().find((c) => !knownIds.has(String(c.id))
                && c.name === DEMO_SOUL_NAME);
            if (justMade) updateCustomer(justMade.id, { isTourTemp: true });
            await sleep(1400);
        }

        const created = getCustomers().find((c) => !knownIds.has(String(c.id))
            && c.name === DEMO_SOUL_NAME);
        if (!created) return;

        const newCard = Array.from(document.querySelectorAll('.customer-card-grid-item'))
            .find((c) => c.textContent.includes(DEMO_SOUL_NAME));
        if (newCard) {
            await moveCursorTo(newCard, `${stepNo()}. 登録できました。開きます`);
            await clickCursor(newCard);
            await sleep(1300);
        }

        // 5色は、いつも名前の横に出る（ISSUE-077）
        const nameColors = document.querySelector('#detail-name-colors');
        if (nameColors) {
            await moveCursorTo(nameColors, `${stepNo()}. 登録した5色は、名前の横にいつも出ます`);
            await sleep(3600);
        }

        // 「情報」タブは無くなり、名前を押して開く形になった
        const nameOpen = document.querySelector('#detail-name-open');
        if (nameOpen) {
            await moveCursorTo(nameOpen, `${stepNo()}. 名前を押すと「この方のこと」が開きます`);
            await clickCursor(nameOpen);
            await sleep(1400);
        }

        const soulField = document.querySelector('.quick-edit-field[data-field="soulColors"]');
        if (soulField) {
            await moveCursorTo(soulField, `${stepNo()}. 5色はここにも出ます。直すときは ✏️ を押してから`);
            await sleep(4200);
        }

        // 体質は登録の画面で見せた。中身は「問診と体質」のデモに任せる。
        const conPanel = document.querySelector('#customer-detail-view .constitution-panel');
        if (conPanel) {
            await moveCursorTo(conPanel, `${stepNo()}. 体質はあとからここでも入れられます。詳しくは「問診と体質」のデモで`);
            await sleep(4800);
        }

        // 消し方も見せる。裏で片付けるのではなく、実際の操作をそのまま通す。
        // 通う方が来なくなっただけなら「アーカイブ」、記録ごと消すなら「削除」。
        const archiveBtn = document.getElementById('btn-detail-archive');
        if (archiveBtn) {
            await moveCursorTo(archiveBtn, `${stepNo()}. 📦 アーカイブは、記録を残したまま一覧から外します`);
            await sleep(4000);
        }

        const delBtn = document.getElementById('btn-delete-customer');
        if (delBtn) {
            await moveCursorTo(delBtn, `${stepNo()}. 🗑️ 削除は、施術記録ごと完全に消します`);
            await sleep(3600);
            await clickCursor(delBtn);
            await sleep(1200);
            const dialog = document.querySelector('#confirm-modal.active');
            if (dialog) {
                await moveCursorTo(dialog, `${stepNo()}. 消す前に必ず確認が入ります。取り消せない操作だからです`);
                await sleep(4600);
                const ok = document.getElementById('btn-submit-confirm');
                if (ok) {
                    await moveCursorTo(ok, `${stepNo()}. デモ用に作った顧客なので、ここで消します`);
                    await clickCursor(ok);
                    await sleep(1600);
                }
            }
        }

        // 画面から消せていない場合の保険（確認画面を閉じられた等）
        dropDemoCustomers();
        renderCustomerList();
        await sleep(1200);

        await moveCursorTo(tourBar, '👤 新規登録のデモは以上です（デモで作った顧客は消しました）');
        await sleep(3000);
    };

    // ------------------------------------------------------------------
    // 2. カラーと星のデモ（顧客詳細の「星」タブから）
    //    色がどの天体を担当し、どの部位に対応するか。
    // ------------------------------------------------------------------
    const STAR_TOUR_STEPS = 10;
    const starTourBody = async () => {
        let n = 0;
        const stepNo = () => ++n;

        await openSuzuki(stepNo, '鈴木 一郎さんで見ます');

        const starTab = document.querySelector('.tab-btn[data-tab="color-star"]');
        if (starTab) {
            await moveCursorTo(starTab, `${stepNo()}. 「星」タブへ`);
            await clickCursor(starTab);
            await sleep(1600);
        }

        const cards = document.querySelectorAll('.color-star-card');
        if (cards.length > 0) {
            await moveCursorTo(cards[0], `${stepNo()}. ソウルカラーの1色ごとに、担当する天体が決まっています`);
            await sleep(4200);
        }

        const chakra = document.querySelector('.color-star-card .planet-overlay')
            || (cards[0] || null);
        if (chakra) {
            await moveCursorTo(chakra, `${stepNo()}. 「いつもの施術部位」はその人固定です。色から引きます`);
            await sleep(4200);
        }

        const pos = document.querySelector('.color-star-card .planet-position');
        if (pos) {
            await moveCursorTo(pos, `${stepNo()}. 天体がいまどの星座にいるかは日々動きます`);
            await sleep(4200);
        }

        const part = document.querySelector('.color-star-card .planet-part');
        if (part) {
            await moveCursorTo(part, `${stepNo()}. その星座が重なる部位も、あわせて出ます`);
            await sleep(4200);
        }

        const moved = document.querySelector('.planet-moved-badge');
        if (moved && moved.style.display !== 'none') {
            await moveCursorTo(moved, `${stepNo()}. ★は前回の来店から星座を移った印です。変化の手がかりになります`);
            await sleep(4200);
        }

        const oils = document.querySelectorAll('.color-star-card');
        if (oils.length > 0) {
            await moveCursorTo(oils[oils.length - 1], `${stepNo()}. 天体ごとの精油の候補です。ここから体質で絞り込まれます`);
            await sleep(4200);
        }

        // ⚠️ に入るものと入らないもの（ISSUE-060）
        const tabArea = document.getElementById('tab-content-area');
        const cautionBox = tabArea && Array.from(tabArea.querySelectorAll('div'))
            .find((d) => d.textContent.trim().startsWith('⚠️ この方の注意事項'));
        if (cautionBox) {
            await moveCursorTo(cautionBox, `${stepNo()}. 赤い枠に入るのは、初診の「病歴」と「薬」だけです`);
            await sleep(3800);
        }
        const memoBox = tabArea && Array.from(tabArea.querySelectorAll('div'))
            .find((d) => d.textContent.trim().startsWith('📝 カルテのメモ'));
        if (memoBox) {
            await moveCursorTo(memoBox, `${stepNo()}. ご職業や資格などのメモは、こちらに分けて出ます。`
                + '赤い枠に混ぜると、本当のアレルギーが埋もれるためです');
            await sleep(4200);
        }

        const area = document.getElementById('tab-content-area') || document.body;
        await moveCursorTo(area, `${stepNo()}. 象徴の対応づけであって、効能ではありません。組み立ての切り口として使います`);
        await sleep(4600);

        await moveCursorTo(tourBar, '✨ カラーと星のデモは以上です');
        await sleep(3000);
    };

    // ------------------------------------------------------------------
    // 問診と体質のデモ（顧客詳細の「情報」タブから）
    //
    // 新規登録の中に入れず、独立させてある。体質やアレルギーは新規の
    // ときだけでなく「2回目に分かった」ときにも書くもので、登録の
    // デモに埋めてしまうと2回目以降の方には見つけられないため。
    //
    // 実際に鈴木さんのチェックを触るので、始める前に控えて、終わりに戻す。
    // ------------------------------------------------------------------
    const INTAKE_TOUR_STEPS = 13;
    const intakeTourBody = async () => {
        let n = 0;
        const stepNo = () => ++n;

        await openSuzuki(stepNo, '鈴木 一郎さん（高血圧で服薬中）で見ます');

        // 触る前に控える。途中で止められても戻せるようにしておく。
        const target = getCustomers().find((c) => c.name && c.name.includes('鈴木'));
        if (!target) throw new Error('DEMO_NO_SAMPLE');
        const savedConstitution = JSON.parse(JSON.stringify(target.constitution || {}));
        const restore = () => {
            updateCustomer(target.id, { constitution: savedConstitution });
            if (onRecordsChanged) onRecordsChanged();
        };
        onTourCleanup(restore);

        // 「情報」タブは無くなり、名前を押して開く形になった（ISSUE-077）
        const nameOpen3 = document.querySelector('#detail-name-open');
        if (nameOpen3) {
            await moveCursorTo(nameOpen3, `${stepNo()}. 名前を押すと「この方のこと」が開きます`);
            await clickCursor(nameOpen3);
            await sleep(1400);
        }

        // 問診には2つの置き場所がある。人が読むものと、機械が判定に使うもの。
        const intake = document.querySelector('.quick-edit-field[data-field="initialConsultation"]');
        if (intake) {
            await moveCursorTo(intake, `${stepNo()}. 初診問診。体重や病歴など、人が読むための覚え書きです`);
            await sleep(4600);
            await moveCursorTo(intake, `${stepNo()}. ここは自由に書けますが、精油の除外には使われません`);
            await sleep(4400);
        }

        const conPanel = document.querySelector('.constitution-panel');
        if (conPanel) {
            if (!conPanel.open) {
                const head = conPanel.querySelector('summary') || conPanel;
                await moveCursorTo(head, `${stepNo()}. 除外に使うのはこちら。「体質」を開きます`);
                await clickCursor(head);
                await sleep(1000);
            }
        }

        const hyper = document.querySelector('[data-flag="hypertension"]');
        if (hyper) {
            await moveCursorTo(hyper.parentElement || hyper,
                `${stepNo()}. 高血圧に印が付いています。血圧を上げる精油が候補から外れます`);
            await sleep(4800);
        }

        // アレルギーは実際に入れてみせる。基材が連動して外れるところまで。
        const nut = document.querySelector('[data-allergy="treeNut"]');
        if (nut) {
            await moveCursorTo(nut.parentElement || nut,
                `${stepNo()}. アレルギーは科名で入れます。ナッツを入れてみます`);
            await clickCursor(nut);
            await sleep(1600);
        }

        // 精油と基材は別々に出る。基材のほうを見落としやすいので両方見せる。
        const oilAvoid = document.querySelector('.carrier-section .carrier-avoid');
        if (oilAvoid) {
            await moveCursorTo(oilAvoid, `${stepNo()}. 使わない精油が、理由ごとにここへ出ます`);
            await sleep(4800);
        }

        const carrier = document.querySelectorAll('.carrier-section .carrier-avoid')[1];
        if (carrier) {
            await moveCursorTo(carrier, `${stepNo()}. キャリアオイル（基材）も連動して外れました`);
            await sleep(4800);
            await moveCursorTo(carrier, `${stepNo()}. ナッツは精油ではなく基材のほうに出ます。ここが見えないと気づけません`);
            await sleep(5000);
        }

        // 一覧に無いものの受け皿。ここが安全に見えてしまうと危ないので、
        // 「自動では除外されない」を必ず言い切る。
        const freeInput = document.querySelector('[data-free-block="allergy"] .free-input');
        if (freeInput) {
            await typeInput(freeInput, 'そば', `${stepNo()}. 一覧に無いものは「その他」に書けます`);
            await sleep(600);
            const addBtn = document.querySelector('[data-free-block="allergy"] .free-add-btn');
            if (addBtn) { await clickCursor(addBtn); await sleep(1400); }
        }

        const warn = document.querySelector('[data-free-block="allergy"] .constitution-free-warn');
        if (warn) {
            await moveCursorTo(warn, `${stepNo()}. ただし、書いたものでは自動除外されません`);
            await sleep(4600);
            await moveCursorTo(warn, `${stepNo()}. どの精油が該当するかはアプリでは判断できないためです。申し送りとして残ります`);
            await sleep(5200);
        }

        // 触ったものを戻す。裏で消すのではなく、元の状態に戻すだけ。
        restore();
        await sleep(1200);
        const panelAfter = document.querySelector('.constitution-panel');
        if (panelAfter) {
            await moveCursorTo(panelAfter, `${stepNo()}. デモで入れたものは元に戻しました`);
            await sleep(3000);
        }

        await moveCursorTo(tourBar, '🩺 問診と体質のデモは以上です');
        await sleep(3000);
    };

    // ------------------------------------------------------------------
    // 3. カルテのデモ（施術記録の画面から）
    //    その日の色を選ぶところと、AIの提案（来店前・問診後）。
    // ------------------------------------------------------------------
    const CHART_TOUR_STEPS = 20;
    const chartTourBody = async () => {
        let n = 0;
        const stepNo = () => ++n;

        /**
         * 提案が出るまで待つ。
         *
         * 失敗した場合はエラー表示が出て結果は永久に来ない。結果だけを
         * 待っていると、そこで止まったまま数分待たせることになるので、
         * どちらが出ても抜ける。
         */
        const waitForAdvice = async (timeoutMs = 45000) => {
            if (isFastForwarding()) return null;
            const started = Date.now();
            while (Date.now() - started < timeoutMs) {
                const ok = document.querySelector('#record-session-advice .session-advice-result');
                if (ok) return ok;
                if (document.querySelector('#record-session-advice .session-advice-error')) return null;
                await sleep(400);
            }
            return null;
        };

        // 記録モーダルが開いていれば、そこから続ける
        const already = document.getElementById('record-modal');
        if (!already || !already.classList.contains('active')) {
            await openSuzuki(stepNo, '鈴木 一郎さん（高血圧で服薬中）のカルテを開きます');

            const tabType = document.querySelector('.tab-btn[data-tab="visit-type"]');
            if (tabType) {
                await moveCursorTo(tabType, `${stepNo()}. 「内容」タブへ`);
                await clickCursor(tabType);
                await sleep(1600);
            }
            const colored = Array.from(document.querySelectorAll('.history-item'))
                .find((h) => h.querySelector('.record-color-readout-wrap'));
            const editBtn = (colored || document).querySelector('.btn-edit-record');
            if (editBtn) {
                await moveCursorTo(editBtn, `${stepNo()}. 記録を開きます`);
                await clickCursor(editBtn);
                await sleep(1500);
            }
        }

        const unlock = document.getElementById('btn-toggle-edit-record');
        if (unlock && unlock.textContent.includes('有効')) {
            await moveCursorTo(unlock, `${stepNo()}. 編集を有効にします`);
            await clickCursor(unlock);
            await sleep(900);
        }

        // --- 施術内容 ---
        // 押したものが合計になり、その施術の書く欄が開く（ISSUE-085）。
        // **ふだんは畳んである。開かずに指すと、見えないものを説明することになる**
        const menuFold = document.getElementById('record-menu-fold');
        if (menuFold) {
            await moveCursorTo(menuFold.querySelector('summary') || menuFold,
                `${stepNo()}. 施術内容はここ。ふだんは畳んであり、選んだ中身と合計はこの行に出ます`);
            await sleep(3800);
            menuFold.open = true;
            await sleep(700);
        }
        const catPicker = document.getElementById('record-service-categories');
        if (catPicker && menuFold && menuFold.open) {
            await moveCursorTo(catPicker,
                `${stepNo()}. 押すと入り、もう一度押すと外れます。いくつでも選べます`);
            await sleep(4200);
            const catBtn = catPicker.querySelector('.service-cat-btn:not(.selected)');
            if (catBtn) {
                await moveCursorTo(catBtn, `${stepNo()}. 押したものの金額が、そのまま足されます`);
                await clickCursor(catBtn);
                await sleep(1600);
            }
            const totalEl = document.getElementById('record-menu-total');
            if (totalEl) {
                await moveCursorTo(totalEl, `${stepNo()}. 合計はここに出ます。金額を書く欄は別にありません`);
                await sleep(3200);
            }
        }

        // --- その日の色 ---
        const picker = document.getElementById('record-color-picker');
        if (picker) {
            await moveCursorTo(picker,
                `${stepNo()}. ここはその日クライアントが選んだ色です。生まれ持ったソウルカラーとは別のものです`);
            await sleep(4600);
        }

        const tcChip = document.querySelector('#record-color-chips-tc .record-color-chip:not(.selected)');
        if (tcChip) {
            await moveCursorTo(tcChip, `${stepNo()}. TCカラーから、その日選ばれた色を押します`);
            await clickCursor(tcChip);
            await sleep(1600);
        }

        const selected = document.getElementById('record-color-selected');
        if (selected) {
            await moveCursorTo(selected, `${stepNo()}. 選んだ色は上に並びます`);
            await sleep(2600);
        }

        const setToggle = document.querySelector('#record-color-picker .record-color-set-btn[data-set="full"]');
        if (setToggle) {
            await moveCursorTo(setToggle, `${stepNo()}. アドバンスカラーは10色（1st）と17色（2nd）を切り替えられます`);
            await clickCursor(setToggle);
            await sleep(2200);
            const back = document.querySelector('#record-color-picker .record-color-set-btn[data-set="basic"]');
            if (back) { await clickCursor(back); await sleep(800); }
        }

        const advChip = document.querySelector('#record-color-chips-advance .record-color-chip:not(.selected)');
        if (advChip) {
            await moveCursorTo(advChip, `${stepNo()}. アドバンスカラーも一緒に選べます`);
            await clickCursor(advChip);
            await sleep(1600);
        }

        const ref = document.getElementById('record-color-reference');
        if (ref && ref.style.display !== 'none') {
            await moveCursorTo(ref, `${stepNo()}. 選んだ色に対応する部位と精油が、その場で参考表示されます`);
            await sleep(4500);
        }

        const tag = document.querySelector('#record-color-selected .record-color-tag');
        if (tag) {
            await moveCursorTo(tag, `${stepNo()}. 押せば外せます。選ばなかった日は空のままで構いません`);
            await clickCursor(tag);
            await sleep(1800);
        }

        // --- AIの提案（来店前） ---
        // **使わない設定なら、まるごと飛ばす（ISSUE-083）。**
        // ボタンは隠してあるだけで DOM には残っているので、`if (adviceBtn)` は
        // 素通りしてしまう。見えないボタンを案内したうえ、押しても何も起きず、
        // 結果を待って止まる。
        const prepShown = isPrepEnabled();
        const adviceBtn = document.getElementById('btn-record-session-advice');
        if (adviceBtn && prepShown) {
            await moveCursorTo(adviceBtn, `${stepNo()}. 訴えがまだ空なので「下ごしらえを作る」になっています`);
            await sleep(3000);
            await clickCursor(adviceBtn);
            await sleep(1200);
            const result = await waitForAdvice();
            if (result) {
                await moveCursorTo(result, `${stepNo()}. 経過・体質・その日の星をまとめた組み立て案が出ます`);
                await sleep(4500);
                const excluded = result.querySelector('.session-advice-excluded');
                if (excluded) {
                    await moveCursorTo(excluded, `${stepNo()}. 高血圧のため、ローズマリーなどは自動で除外されています`);
                    await sleep(4500);
                }
            }
        }

        // 処方の欄は画面から下ろしてある（ISSUE-080）ので、見える方を指す。
        // 隠れた欄にカーソルを合わせても、何も指していないのと同じ
        const noteEl = document.getElementById('input-therapist-note');
        if (noteEl && prepShown) {
            await moveCursorTo(noteEl, `${stepNo()}. 出た内容は、このメモ欄に入ります`);
            await sleep(4000);
        }

        // --- AIの提案（問診後） ---
        const complaint = document.getElementById('input-client-complaint');
        if (complaint) {
            await moveCursorTo(complaint, `${stepNo()}. 問診で聞いた訴えを入力します`);
            await typeInput(complaint, '今日は特に脚が重い。最近寝つきも悪くなってきた。');
            await sleep(1000);
        }

        if (adviceBtn && prepShown) {
            await moveCursorTo(adviceBtn, `${stepNo()}. ボタンが「訴えを反映して作り直す」に変わりました`);
            await sleep(2800);
            await clickCursor(adviceBtn);
            await sleep(1200);
            const res2 = await waitForAdvice();
            if (res2) {
                await moveCursorTo(res2, `${stepNo()}. 経過と今日の訴えの両方を見た組み立て案になります`);
                await sleep(5000);
            }
        }

        if (noteEl && prepShown) {
            await moveCursorTo(noteEl, `${stepNo()}. 自動で入ったものなので、確定する前に必ずご確認ください`);
            await sleep(4000);
        }

        const cancel = document.getElementById('btn-cancel-record');
        if (cancel) {
            await moveCursorTo(cancel, '確認できたので、保存せずに閉じます');
            await clickCursor(cancel);
            await sleep(1000);
        }

        await moveCursorTo(tourBar, '📋 カルテのデモは以上です（デモの入力は保存していません）');
        await sleep(3000);
    };

    /**
     * 予約の取り方だけを見せるデモ。カレンダーの予約ボタンの隣から始める。
     *
     * 他の2つと違い、これは「その場で使い方を確かめたい」ときのものなので、
     * 短く、予約1件を取って終わる。デモで作った記録は最後に消して、
     * 何度押しても実際の予定が増えないようにしている。
     */
    const bookingTourBody = async () => {
        // 説明の番号は通し番号で振る。順番を変えても振り直さずに済む。
        let stepCount = 0;
        const stepNo = () => ++stepCount;

        // カレンダー画面から始める
        const btnCal = document.getElementById('btn-view-calendar');
        if (btnCal && !btnCal.classList.contains('active')) {
            await moveCursorTo(btnCal, '準備：カレンダー画面から始めます');
            await clickCursor(btnCal);
            await sleep(900);
        }

        // 予定の入っていない先の日を選ぶ（当月内で、今日より後）
        const todayStr = toDateStr(new Date());
        const cells = Array.from(document.querySelectorAll('.calendar-day[data-date]'));
        const freeCell = cells.find((c) => c.dataset.date > todayStr
            && !c.querySelector('.calendar-day-indicators')) || cells[cells.length - 1];
        const targetDate = freeCell ? freeCell.dataset.date : null;

        if (freeCell) {
            await moveCursorTo(freeCell, `${stepNo()}. 予約を入れたい日を選びます`);
            await clickCursor(freeCell);
            await sleep(1000);
        }

        const dateBadge = document.getElementById('booking-open-date');
        if (dateBadge) {
            await moveCursorTo(dateBadge, `${stepNo()}. 選んだ日がボタンに出ます。ここが予約の対象日です`);
            await sleep(2600);
        }

        const btnOpen = document.getElementById('btn-open-booking');
        if (btnOpen) {
            await moveCursorTo(btnOpen, `${stepNo()}. 「予約・施術記録を追加」を押します`
                + '（この帯は画面を送っても上に残ります）');
            await clickCursor(btnOpen);
            await sleep(1200);
        }

        // その日にすでに入っているもの（ISSUE-066）
        const dayList = document.getElementById('booking-day-list');
        if (dayList) {
            await moveCursorTo(dayList, `${stepNo()}. その日にすでに入っている予約が、先に出ます`);
            await sleep(2800);
        }

        // 顧客・プラン・時間・訴えを入れる
        const custSel = document.getElementById('inline-record-customer-id');
        if (custSel && custSel.options.length > 0) {
            await selectDropdownOption(custSel, 0, `${stepNo()}. 誰の予約かを選びます`);
            await sleep(900);
        }

        // 内容も金額も、決まっていなければ空のままでよい（ISSUE-063）
        const typeEl = document.getElementById('inline-record-type');
        if (typeEl) {
            await moveCursorTo(typeEl, `${stepNo()}. 施術メニューと金額は`
                + '空のままで保存できます。予約の時点では決まっていないことが多いので');
            await sleep(3400);
        }

        const planSel = document.getElementById('inline-select-plan');
        if (planSel && planSel.options.length > 1) {
            await selectDropdownOption(planSel, 1,
                `${stepNo()}. 決まっていれば、ここから選ぶと金額も入ります`);
            await sleep(900);
        }

        // 施術の区分（ISSUE-068）
        // **畳んであるので、まず開く**（ISSUE-085）
        const bkFold = document.getElementById('inline-menu-fold');
        if (bkFold) {
            await moveCursorTo(bkFold.querySelector('summary') || bkFold,
                `${stepNo()}. 施術内容も、この時点で選べます`);
            await sleep(2600);
            bkFold.open = true;
            await sleep(700);
        }
        const catHost = document.getElementById('inline-service-categories');
        const catBtn = catHost && bkFold && bkFold.open && catHost.querySelector('.service-cat-btn');
        if (catBtn) {
            await moveCursorTo(catBtn, `${stepNo()}. 押した金額が合計になり、予約の時点で残ります`);
            await clickCursor(catBtn);
            await sleep(1600);
        }

        const detailsEl = document.getElementById('inline-detail-fold');
        if (detailsEl) {
            await moveCursorTo(detailsEl.querySelector('summary') || detailsEl,
                `${stepNo()}. 時間や訴えは「詳細メモ」の中です`);
            if (!detailsEl.open) detailsEl.open = true;
            await sleep(900);
        }

        const timeSel = document.getElementById('inline-record-time');
        if (timeSel) {
            // 埋まっている時間には ⚠️ と名前が出る（ISSUE-067）
            const taken = Array.from(timeSel.options).find((o) => o.classList.contains('taken'));
            if (taken) {
                await moveCursorTo(timeSel, `${stepNo()}. すでに入っている時間には`
                    + `「${taken.textContent.trim()}」のように印が出ます`);
                await sleep(3400);
            } else {
                await moveCursorTo(timeSel, `${stepNo()}. すでに入っている時間には`
                    + '「⚠️ お名前」の印が出るので、重ねずに選べます');
                await sleep(3000);
            }
            await selectDropdownOption(timeSel, '11:00', `${stepNo()}. 開始時間を選びます`);
            await sleep(900);
        }

        const complaintEl = document.getElementById('inline-record-complaint');
        if (complaintEl) {
            await typeInput(complaintEl, '肩と首の張り。午前中の予約希望。',
                `${stepNo()}. 予約の時点で分かっていることを書いておきます`);
            await sleep(700);
        }

        const saveBtn = document.getElementById('btn-inline-submit-record');
        if (saveBtn) {
            await moveCursorTo(saveBtn, `${stepNo()}. 保存すると予約が入ります`);
            await clickCursor(saveBtn);
            await sleep(1600);
        }

        // 入った予約を見せる
        const savedCell = targetDate
            ? document.querySelector(`.calendar-day[data-date="${targetDate}"]`) : null;
        if (savedCell) {
            await moveCursorTo(savedCell, `${stepNo()}. カレンダーにその人の色の印が付きます`);
            await sleep(2800);
        }

        const visitItem = document.querySelector('#calendar-visits-container .calendar-visit-item');
        if (visitItem) {
            await moveCursorTo(visitItem, `${stepNo()}. その日の欄にも予約が並びます`);
            await sleep(2600);
        }

        // デモで入れた予約はここで消す。裏で消すのではなく、実際の
        // 消し方をそのまま見せる（消す操作こそ迷いやすいので）。
        const delBtn = document.querySelector('.calendar-visit-item .btn-cal-del-rec');
        if (delBtn) {
            await moveCursorTo(delBtn, `${stepNo()}. 予約を消すときは、この 🗑️ を押します`);
            await clickCursor(delBtn);
            await sleep(1200);
            const dialog = document.querySelector('#confirm-modal.active');
            if (dialog) {
                await moveCursorTo(dialog, `${stepNo()}. 消す前に必ず確認が入ります。誤って消えることはありません`);
                await sleep(3600);
                const ok = document.getElementById('btn-submit-confirm');
                if (ok) {
                    await moveCursorTo(ok, `${stepNo()}. デモで入れた予約なので、消します`);
                    await clickCursor(ok);
                    await sleep(1400);
                }
            }
        }

        // 画面から消せていない場合の保険（確認画面を閉じられた等）
        if (targetDate && custSel) {
            const custId = custSel.value;
            const cust = getCustomers().find((c) => String(c.id) === String(custId));
            const rec = cust && (cust.records || []).find(
                (r) => r.date === targetDate && r.clientComplaint === '肩と首の張り。午前中の予約希望。'
            );
            if (cust && rec) {
                deleteRecord(cust.id, rec.id);
                renderCalendar();
            }
        }

        // ── ここから、その人のページからの取り方（ISSUE-063）──
        // トップの📅は「他の人と重ならないか」を見る場所、
        // その人の📅は「その人の頻度」を見る場所。入口が2つあることを見せる。
        const btnList = document.getElementById('btn-view-list');
        if (btnList) {
            await moveCursorTo(btnList, `${stepNo()}. 予約は、その人のページからも入れられます`);
            await clickCursor(btnList);
            await sleep(1200);
        }

        const firstCard = document.querySelector('.customer-card-grid-item');
        if (firstCard) {
            await moveCursorTo(firstCard, `${stepNo()}. お客様を開きます`);
            await clickCursor(firstCard);
            await sleep(1600);
        }

        const calTab = document.querySelector('.detail-subtab-btn[data-tab="visit-calendar"]');
        if (calTab) {
            await moveCursorTo(calTab, `${stepNo()}. 📅 のタブへ`);
            await clickCursor(calTab);
            await sleep(1600);
        }

        const monthList = document.getElementById('cust-month-list');
        if (monthList) {
            await moveCursorTo(monthList, `${stepNo()}. その月の予定が、下にまとめて並びます`);
            await sleep(2800);
        }

        const freeDay = document.querySelector(
            '#personal-calendar-instance .calendar-day:not(.empty):not(.has-event)');
        if (freeDay) {
            await moveCursorTo(freeDay, `${stepNo()}. 空いている日を押すと、そのままこの方の予約になります`);
            await sleep(3000);
        }

        await moveCursorTo(tourBar, '🗓️ 予約のデモは以上です（デモで入れた予約は消しました）');
        await sleep(3200);
    };

    const BOOKING_TOUR_STEPS = 25;
    const bookingGuideModal = document.getElementById('booking-guide-modal');
    const btnOpenBookingGuide = document.getElementById('btn-open-booking-guide');
    const btnCloseBookingGuide = document.getElementById('btn-close-booking-guide');
    const btnStartBookingTour = document.getElementById('btn-start-booking-tour');

    if (btnOpenBookingGuide && bookingGuideModal) {
        btnOpenBookingGuide.addEventListener('click', () => bookingGuideModal.classList.add('active'));
    }
    if (btnCloseBookingGuide && bookingGuideModal) {
        btnCloseBookingGuide.addEventListener('click', () => bookingGuideModal.classList.remove('active'));
    }
    if (bookingGuideModal) {
        bookingGuideModal.addEventListener('click', (e) => {
            if (e.target === bookingGuideModal) bookingGuideModal.classList.remove('active');
        });
    }
    if (btnStartBookingTour) {
        btnStartBookingTour.addEventListener('click', () => {
            if (bookingGuideModal) bookingGuideModal.classList.remove('active');
            runTour(bookingTourBody, BOOKING_TOUR_STEPS);
        });
    }

    // ---- デモの起動口 -------------------------------------------------
    // それぞれの機能を使う場所に置いた 💡 と、「使い方」の中の一覧の
    // どちらからでも同じデモが始まる。
    const startDemo = (body, steps) => () => {
        if (demoGuideModal) demoGuideModal.classList.remove('active');
        runTour(body, steps);
    };
    const wire = (ids, body, steps) => {
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', startDemo(body, steps));
        });
    };
    wire(['btn-start-register-tour'], registerTourBody, REGISTER_TOUR_STEPS);
    wire(['btn-start-chart-tour', 'btn-start-chart-tour-inline'],
        chartTourBody, CHART_TOUR_STEPS);
    // 星タブの 💡 はタブを開くたびに作り直されるので、描画側で繋いでいる
    wire(['btn-start-star-tour'], starTourBody, STAR_TOUR_STEPS);
    wire(['btn-start-booking-tour-index'], bookingTourBody, BOOKING_TOUR_STEPS);
    wire(['btn-start-intake-tour'], intakeTourBody, INTAKE_TOUR_STEPS);

    // ---- APIキーの取り方ガイドと、アプリ側の登録デモ ----------------------
    //
    // AI Studio 側の操作はこのアプリからは動かせないので、そちらは図で示す
    // （index.html のモーダル）。ここで動かして見せるのはアプリ側だけ。

    const apikeyGuideModal = document.getElementById('apikey-guide-modal');
    const btnOpenApikeyGuide = document.getElementById('btn-open-apikey-guide');
    const btnCloseApikeyGuide = document.getElementById('btn-close-apikey-guide');
    const btnStartApikeyTour = document.getElementById('btn-start-apikey-tour');

    if (btnOpenApikeyGuide && apikeyGuideModal) {
        btnOpenApikeyGuide.addEventListener('click', () => apikeyGuideModal.classList.add('active'));
    }
    if (btnCloseApikeyGuide && apikeyGuideModal) {
        btnCloseApikeyGuide.addEventListener('click', () => apikeyGuideModal.classList.remove('active'));
    }
    if (apikeyGuideModal) {
        apikeyGuideModal.addEventListener('click', (e) => {
            if (e.target === apikeyGuideModal) apikeyGuideModal.classList.remove('active');
        });
    }

    /** デモ用の見本キー。本物ではないので、これで生成はできない。 */
    const DEMO_API_KEY = 'AIzaSyDEMO-これは見本です-0000';

    /**
     * APIキーを登録する流れのデモ。
     *
     * 見本のキーで一連の操作を見せ、終わったら消す。
     * 見本は本物ではないので、提供元への問い合わせは行わない
     * （デモ中は isDemoRunning を見て飛ばしている）。
     */
    const apikeyTourBody = async () => {
        // 説明の番号は通し番号で振る。順番を変えても振り直さずに済む。
        let stepCount = 0;
        const stepNo = () => ++stepCount;

        // キーの欄は「下ごしらえ」も💬も使わない設定だと畳んである（ISSUE-083）。
        // **畳んだ欄を指して進むと、何も無いところを説明することになる。**
        // どうすれば出るかだけを伝えて終わる。
        if (!isAiKeyNeeded(isChatEnabled())) {
            await moveCursorTo(tourBar,
                'キーの欄は、いま畳んであります。⚙️設定の「🤖 AI の設定」で'
                + '「🍳 下ごしらえ」か「💬 操作ガイドのチャット」を使う設定にすると出てきます');
            await sleep(5200);
            await moveCursorTo(tourBar, '🔑 登録のデモは以上です');
            await sleep(2600);
            return;
        }

        const btnSettings = document.getElementById('btn-view-color-settings');
        if (btnSettings) {
            await moveCursorTo(btnSettings, `${stepNo()}. 「カラー設定」を開きます`);
            await clickCursor(btnSettings);
            await sleep(1200);
        }

        const panel = document.querySelector('.api-key-panel');
        if (panel) {
            await moveCursorTo(panel, `${stepNo()}. この中の「AI提案のAPIキー」に入れます`);
            await sleep(2600);
        }

        const input = document.getElementById('input-ai-api-key');
        if (input) {
            await typeInput(input, DEMO_API_KEY, `${stepNo()}. AI Studio でコピーしたキーを貼り付けます`);
            await sleep(800);
        }

        const btnAdd = document.getElementById('btn-save-ai-api-key');
        if (btnAdd) {
            await moveCursorTo(btnAdd, `${stepNo()}. 「追加」を押すだけです`);
            await clickCursor(btnAdd);
            await sleep(1400);
        }

        const row = document.querySelector('.api-key-row');
        if (row) {
            await moveCursorTo(row, `${stepNo()}. 提供元が自動で見分けられ、一覧に入ります`);
            await sleep(3000);
        }

        const modelStatus = document.getElementById('ai-model-status');
        if (modelStatus) {
            await moveCursorTo(modelStatus, `${stepNo()}. 使うモデルも自動で選ばれます（速さ優先）`);
            await sleep(3200);
        }

        const usage = document.getElementById('ai-usage-status');
        if (usage) {
            await moveCursorTo(usage, `${stepNo()}. 呼んだ回数はここで確認できます`);
            await sleep(3000);
        }

        if (input) {
            await moveCursorTo(input, `${stepNo()}. キーは何本でも登録できます。1本が上限に当たっても次で通ります`);
            await sleep(3400);
        }

        // 見本のキーは残さない
        const keys = getStoredApiKeys();
        const at = keys.indexOf(DEMO_API_KEY);
        if (at >= 0) {
            removeApiKeyAt(at);
            renderApiKeyPanel();
        }

        await moveCursorTo(tourBar, '🔑 登録のデモは以上です（見本のキーは消しました）');
        await sleep(3000);
    };

    const APIKEY_TOUR_STEPS = 8;
    if (btnStartApikeyTour) {
        btnStartApikeyTour.addEventListener('click', () => {
            if (apikeyGuideModal) apikeyGuideModal.classList.remove('active');
            runTour(apikeyTourBody, APIKEY_TOUR_STEPS);
        });
    }
    const btnApikeyFromIndex = document.getElementById('btn-start-apikey-tour-index');
    if (btnApikeyFromIndex) {
        btnApikeyFromIndex.addEventListener('click', () => {
            if (demoGuideModal) demoGuideModal.classList.remove('active');
            runTour(apikeyTourBody, APIKEY_TOUR_STEPS);
        });
    }

    if (btnDemoGuide && demoGuideModal) {
        btnDemoGuide.addEventListener('click', () => {
            demoGuideModal.classList.add('active');
        });
    }

    if (btnCloseDemoModal && demoGuideModal) {
        btnCloseDemoModal.addEventListener('click', () => {
            demoGuideModal.classList.remove('active');
        });
    }

    if (demoGuideModal) {
        demoGuideModal.addEventListener('click', (e) => {
            if (e.target === demoGuideModal) {
                demoGuideModal.classList.remove('active');
            }
        });
    }

    /**
     * スマホ向け：アイコンを押している間、その説明を出す。
     *
     * 決めごとが3つある。
     *  1. 指を離すまで出しっぱなし。読み終わる前に消えるのは、押し直しになる。
     *  2. 押している間だけ title を外す。付けたままだと、端末が用意している
     *     吹き出しも重ねて出てきて、二重になる。離したら元に戻すので、
     *     パソコンでマウスを乗せたときの説明はこれまでどおり出る。
     *  3. 説明が出たあとに指を離しても、そのボタンは動かさない。
     *     読むために押したのであって、押したかったわけではない。
     *     ゴミ箱のように、間違って動くと困るものが並んでいる。
     *
     * 委譲（Delegation）を使うので、あとから作られた要素にも効く。
     */
    /**
     * 上のヘッダーの高さを測って、CSS に渡す。
     *
     * 切り替えのタブはヘッダーのすぐ下に貼り付けるが、ヘッダーの高さは
     * 幅や文字の大きさで変わる。決め打ちにすると、重なるか隙間が空く。
     */
    function trackHeaderHeight() {
        const header = document.querySelector('.app-header') || document.querySelector('header');
        const topBar = document.querySelector('.top-control-bar');
        if (!header) return;
        const apply = () => {
            const h = Math.round(header.getBoundingClientRect().height);
            if (h > 0) document.documentElement.style.setProperty('--app-header-h', `${h}px`);
            // カルテの中のタブは、この2つ（ヘッダー＋上の帯）の下で止める。
            // 帯の高さも幅や文字の大きさで変わるので、こちらも実測する（ISSUE-064）。
            if (topBar) {
                const t = Math.round(topBar.getBoundingClientRect().height);
                if (t > 0) document.documentElement.style.setProperty('--app-topbar-h', `${t}px`);
            }
        };
        apply();
        window.addEventListener('resize', apply);
        window.addEventListener('orientationchange', apply);
        if ('ResizeObserver' in window) {
            const ro = new ResizeObserver(apply);
            ro.observe(header);
            if (topBar) ro.observe(topBar);
        }
    }
    trackHeaderHeight();

    /**
     * 取扱説明書を、別の窓で開く。
     *
     * 以前はリンク（a）だった。見た目はボタンでも中身がリンクだと、
     * 長押しで端末のメニューが出る。指定で止めても、アプリ内ブラウザでは
     * 出てしまうことがあった。ボタンにして、開くのはこちらでやる。
     */
    const btnViewManual = document.getElementById('btn-view-manual');
    if (btnViewManual) {
        btnViewManual.addEventListener('click', () => {
            window.open('manual.html', '_blank', 'noopener');
        });
    }

    function initLongPressTooltips() {
        const HOLD_MS = 500;
        // 指を離した瞬間に消えると、読み終わる前に消える。
        // 押している間だけだと、指が説明の上にかぶることもある。
        // 離してからも、ひと呼吸ぶん残す。
        const LINGER_MS = 1800;
        const FADE_MS = 350;        // css の tooltipFadeOut と揃えること

        let longPressTimer = null;
        let lingerTimer = null;     // 離したあと、消し始めるまで
        let fadeTimer = null;       // 薄くなり終わるまで
        let activeTooltip = null;
        let heldTarget = null;      // いま押されている、説明を持つ要素
        let heldTitle = '';         // その要素から一時的に外した title
        let didShow = false;        // この長押しで説明を出したか

        const restoreTitle = () => {
            if (heldTarget) {
                if (heldTitle) heldTarget.setAttribute('title', heldTitle);
                delete heldTarget.dataset.lpHeld;
            }
            heldTarget = null;
            heldTitle = '';
        };

        const cleanupTooltip = () => {
            if (lingerTimer) { clearTimeout(lingerTimer); lingerTimer = null; }
            if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
            if (activeTooltip) {
                activeTooltip.remove();
                activeTooltip = null;
            }
        };

        /**
         * 指を離したあとの見送り。
         *
         * touchmove は指を動かすたびに何度も来るので、既に見送りを始めて
         * いたら何もしない。重ねると、消えるまでの時間が伸び続ける。
         */
        const startLingering = () => {
            if (!activeTooltip || lingerTimer || fadeTimer) return;
            const mine = activeTooltip;
            lingerTimer = setTimeout(() => {
                lingerTimer = null;
                mine.classList.add('leaving');
                fadeTimer = setTimeout(() => {
                    fadeTimer = null;
                    if (activeTooltip === mine) activeTooltip = null;
                    mine.remove();
                }, FADE_MS);
            }, LINGER_MS);
        };

        const showTooltip = (target, text) => {
            cleanupTooltip();

            const tooltip = document.createElement('div');
            tooltip.className = 'long-press-tooltip';
            tooltip.textContent = text;
            document.body.appendChild(tooltip);

            const rect = target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
            let top = rect.top - tooltipRect.height - 10;

            left = Math.max(10, Math.min(window.innerWidth - tooltipRect.width - 10, left));
            if (top < 10) top = rect.bottom + 10;

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            activeTooltip = tooltip;
        };

        document.body.addEventListener('touchstart', (e) => {
            cleanupTooltip();
            didShow = false;

            const target = e.target.closest('[title]');
            if (!target) return;
            const title = target.getAttribute('title');
            if (!title) return;

            // 端末側の吹き出しが重ならないよう、押している間だけ外す
            heldTarget = target;
            heldTitle = title;
            target.removeAttribute('title');
            // title を外すと、端末のメニューを止める側の見分けに引っかからなくなる。
            // 押している間だけ印を残しておく
            target.dataset.lpHeld = '1';

            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                didShow = true;
                showTooltip(target, title);
            }, HOLD_MS);
        }, { passive: true });

        // 指を離す・動かす・割り込まれる。説明が出ていれば、そこから見送りに入る
        const endPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            if (activeTooltip) startLingering();
            else cleanupTooltip();
            restoreTitle();
        };

        document.body.addEventListener('touchend', endPress);
        document.body.addEventListener('touchmove', endPress);
        document.body.addEventListener('touchcancel', endPress);

        // 説明を読んだだけのときは、そのボタンを動かさない
        document.body.addEventListener('click', (e) => {
            if (didShow) {
                // 指を離すと click が続けて来る。ここで消すと見送りが
                // 打ち消され、離した瞬間に消えてしまう。
                didShow = false;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            cleanupTooltip();
        }, true);

        // 押しっぱなしで出る、端末のメニューを出さない。
        //
        // ボタンだけでなく**リンクも**対象にする。取扱説明書の入口は見た目が
        // ボタンだが中身はリンクで、長押しすると「リンクアドレスをコピー」
        // 「リーディングリストに追加」などが出ていた。押している人にとっては
        // 同じ「アイコン」なので、出るものも同じであるべき。
        //
        // [data-lp-held] を入れているのは、説明を出すときに title を一時的に
        // 外しているため。外れた瞬間に見分けから漏れる、という穴があった。
        const NO_NATIVE_MENU = [
            'button', 'a[href]', 'label', 'summary', '[role="button"]',
            '.tab-btn', '.nav-tab-btn', '.detail-subtab-btn', '.nav-item',
            '.soul-slot', '.soul-dot', '.mark-label',
            '[title]', '[data-lp-held]'
        ].join(', ');

        document.body.addEventListener('contextmenu', (e) => {
            // 入力欄と本文は、これまでどおり選んで写せるようにしておく
            if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
            if (e.target.closest(NO_NATIVE_MENU)) e.preventDefault();
        });
    }

    // 初回読み込み
    try {
        renderCustomerList();
        initLongPressTooltips();
    } catch (err) {
        console.error('Initial render error:', err);
    }
} // initApp end

// -------------------------------------------------------------------
// エントリポイント：初回表示 + bfcache / 別ページ遷移からの復帰に対応
// -------------------------------------------------------------------

// iPhone・iPad の Safari は、しばらく開かないサイトのデータを消すことがある。
// 「消さないでほしい」と頼んでおく。ホーム画面から開く形なら通りやすい。
// 断られても動きは変わらない（置き場との同期と書き出しが守りになる）。
try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persisted()
            .then((already) => (already ? true : navigator.storage.persist()))
            .catch(() => { /* 頼めない環境 */ });
    }
} catch (e) { /* noop */ }

// 既にDOMが構築済みの場合（bfcache等）は即時実行
if (document.readyState === 'loading') {
    // まだパース中なら DOMContentLoaded を待つ
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // interactive / complete ならそのまま起動
    initApp();
}

// bfcache（前後ナビゲーション）で復帰した際にも再描画する
window.addEventListener('pageshow', (event) => {
    // persisted === true はbfcacheからの復帰を意味する
    if (event.persisted) {
        initApp();
    }
});
