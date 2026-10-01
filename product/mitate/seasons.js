// 月ごとの季節・五行・旬。くらしの見立ての「今日の材料」に使う。
//
// 五行の割り当ては、薬膳でよく使われる考え方に沿ったもの（春=木、夏=火、
// 梅雨=土、秋=金、冬=水）。医学的な事実ではなく、見立ての「物語の骨組み」
// として使う。画面と依頼文には「薬膳の考え方では」と添える。
//
// 旬の食材は一般に出回る時期の目安。産地や年で前後する。

const ELEMENTS = {
    wood: { name: '木', organ: '肝', taste: '酸味', color: '青（緑）', note: 'のびやかに巡らせたい季節。気の滞りに気をつけたいとされます。', foods: '香りの青菜、柑橘、春の苦み' },
    fire: { name: '火', organ: '心', taste: '苦味', color: '赤', note: '熱がこもりやすい季節。心と眠りを静めたいとされます。', foods: 'トマト、ゴーヤ、夏野菜' },
    earth: { name: '土', organ: '脾（胃腸）', taste: '甘味', color: '黄', note: '湿気が重くのしかかる季節。胃腸をいたわりたいとされます。', foods: 'とうもろこし、かぼちゃ、豆類' },
    metal: { name: '金', organ: '肺・大腸', taste: '辛味', color: '白', note: '乾燥に弱い季節。のどと肌をうるおしたいとされます。', foods: '梨、れんこん、大根、白ごま' },
    water: { name: '水', organ: '腎', taste: '鹹（塩気）', color: '黒', note: '冷えが芯まで届く季節。温めて蓄えたいとされます。', foods: '黒豆、黒ごま、ひじき、根菜' }
};

const MONTHS = {
    1: { season: '冬', element: 'water', foods: ['白菜', '大根', 'ぶり', '牡蠣', 'みかん', '金柑'] },
    2: { season: '冬の終わり', element: 'water', foods: ['菜の花', 'ふきのとう', '牡蠣', 'ほうれん草', 'いよかん'] },
    3: { season: '春', element: 'wood', foods: ['菜の花', '新玉ねぎ', 'はまぐり', '春キャベツ', 'いちご'] },
    4: { season: '春', element: 'wood', foods: ['たけのこ', '新じゃが', '初鰹', 'あさり', '春キャベツ'] },
    5: { season: '初夏', element: 'wood', foods: ['アスパラガス', 'そら豆', '新茶', '初鰹', 'いちご'] },
    6: { season: '梅雨', element: 'earth', foods: ['梅', 'らっきょう', 'あじ', 'さくらんぼ', 'きゅうり'] },
    7: { season: '夏', element: 'fire', foods: ['とうもろこし', 'トマト', '枝豆', 'うなぎ', 'すいか'] },
    8: { season: '晩夏', element: 'fire', foods: ['なす', 'ゴーヤ', '桃', '冬瓜', 'とうもろこし'] },
    9: { season: '秋', element: 'metal', foods: ['さんま', '梨', 'ぶどう', '栗', 'さつまいも'] },
    10: { season: '秋', element: 'metal', foods: ['牡蠣（出始め）', 'さんま', 'きのこ', 'さつまいも', '柿', '新米'] },
    11: { season: '晩秋', element: 'metal', foods: ['牡蠣', 'りんご', '柿', 'ごぼう', 'れんこん'] },
    12: { season: '冬', element: 'water', foods: ['牡蠣', 'ぶり', '大根', '白菜', 'ゆず', 'ねぎ'] }
};

/** その日の季節・五行・旬を返す */
export function seasonFor(date = new Date()) {
    const m = MONTHS[date.getMonth() + 1];
    const el = ELEMENTS[m.element];
    return { season: m.season, foods: m.foods, element: el };
}
