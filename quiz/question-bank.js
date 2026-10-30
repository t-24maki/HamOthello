// 出典確認: 2026-10-30。出題時の並び替え・抽選は questions.js が担当する。
// 産地問題は「2024年（令和6年）の収穫量」で統一。産出額・出荷量ではない。
export const PUMPKINS = [
  { name: "プッチィーニ", source: "https://www.sakataseed.co.jp/product/item/?code=100000340" },
  { name: "コリンキー", source: "https://www.sakataseed.co.jp/product/item/?code=921103" },
  { name: "ロロン", source: "https://www.takii.co.jp/CGI/tsk/shohin/shohin.cgi?area_cd=5&breed_seq=00000729&daigi_flg=0&hinmoku_cd=ANK" },
  { name: "ブラックのジョー", source: "https://www.sakataseed.co.jp/special/blacknojoe/" },
  { name: "黒船ハマー", source: "https://www.sakataseed.co.jp/special/blacknojoe/" },
];

// このゲーム用に作った架空の品種名。実在の品種名として紹介しない。
export const PUMPKIN_FAKES = [
  "栗ほのか", "琥珀こまち", "夕焼けマロン", "ぽっくり丸",
  "こがね日和", "夢栗しずく", "まろみ小町", "栗福まる",
  "ほく甘の里", "初秋こはく", "蜜栗つむぎ", "ふっくら千歳",
  "ポッコリーノ", "マロッティ", "コロリーニ", "オレンジのモネ",
  "森のピカッソ", "まろみスター", "ベニーマロン", "サンセットホクホク",
];

export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

// 農林水産省「令和8年版 都道府県の農林水産業の概要」各県版3ページの
// 「農畜産物の生産状況」表にある R6・収穫量・全国順位を照合。
const produceSource = code => `https://www.maff.go.jp/j/kanbo/tiho/15sonota/2026PDF/todouhuken_gaiyou2026-${code}.pdf#page=3`;
export const PRODUCE = [
  ["りんご", "青森県", "02"],
  ["さくらんぼ", "山形県", "06"],
  ["西洋なし", "山形県", "06"],
  ["ぶどう", "山梨県", "19"],
  ["もも", "山梨県", "19"],
  ["すもも", "山梨県", "19"],
  ["みかん", "和歌山県", "30"],
  ["かき", "和歌山県", "30"],
  ["じゃがいも", "北海道", "01"],
  ["たまねぎ", "北海道", "01"],
  ["にんにく", "青森県", "02"],
  ["ごぼう", "青森県", "02"],
  ["はくさい", "茨城県", "08"],
  ["メロン", "茨城県", "08"],
  ["ピーマン", "茨城県", "08"],
  ["れんこん", "茨城県", "08"],
  ["いちご", "栃木県", "09"],
  ["レタス", "長野県", "20"],
  ["なす", "高知県", "39"],
  ["トマト", "熊本県", "43"],
].map(([food, prefecture, code]) => ({ food, prefecture, year: 2024, source: produceSource(code) }));

const VET = "https://www.merckvetmanual.com/exotic-and-laboratory-animals/rodents/hamsters";
const BIRTH = "https://www.merckvetmanual.com/all-other-pets/hamsters/breeding-and-reproduction-of-hamsters";
const RSPCA = "https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters";
const ROBO = "https://animaldiversity.org/accounts/Phodopus_roborovskii/";
const ZOO = "https://www.zoovienna.at/tiere/saeugetiere/feldhamster/";
const WINTER = "https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2021.626779/full";
const TEETH = "https://pmc.ncbi.nlm.nih.gov/articles/PMC13256022/";

// 種によって異なる事実は問題文でも種を限定。飼育・治療の手順は出題しない。
export const HAMSTER_QUESTIONS = [
  {
    id: "hamster-teeth-count",
    text: "大人のゴールデンハムスターの歯は、全部で何本？",
    choices: ["12本", "16本", "20本", "24本"], answer: 1,
    explanation: "前歯が4本、奥歯が12本で、全部で16本です。",
    source: TEETH,
  },
  {
    id: "hamster-growing-teeth",
    text: "ハムスターの歯のうち、一生伸び続けるのはどれ？",
    choices: ["前歯", "犬歯", "奥歯だけ", "すべての歯"], answer: 0,
    explanation: "伸び続けるのは切歯（前歯）。かじることで先がすり減ります。",
    source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7158296/",
  },
  {
    id: "hamster-pouch-depth",
    text: "ハムスターのほお袋は、体のどのあたりまで伸びている？",
    choices: ["鼻先まで", "あごの先まで", "肩の後ろまで", "しっぽの先まで"], answer: 2,
    explanation: "ほお袋は口の横だけでなく、肩の後ろの方まで伸びています。",
    source: VET,
  },
  {
    id: "hamster-scent-gland",
    text: "ゴールデンハムスターの、においで縄張りを示す臭腺はどこ？",
    choices: ["左右のわき腹", "両耳の先", "足の裏だけ", "しっぽの先"], answer: 0,
    explanation: "ゴールデンハムスターには、左右のわき腹に臭腺があります。",
    source: VET,
  },
  {
    id: "hamster-syrian-origin",
    text: "ゴールデンハムスターの飼育の歴史につながる、1930年の採集地はどこの国？",
    choices: ["シリア", "モンゴル", "インド", "メキシコ"], answer: 0,
    explanation: "シリアのアレッポ付近で採集された個体が、飼育の歴史につながっています。",
    source: VET,
  },
  {
    id: "hamster-gestation",
    text: "ゴールデンハムスターの妊娠期間は、およそどのくらい？",
    choices: ["6〜9日", "16〜19日", "36〜39日", "66〜69日"], answer: 1,
    explanation: "およそ16〜19日。哺乳類の中でも短い妊娠期間です。",
    source: VET,
  },
  {
    id: "hamster-newborn-teeth",
    text: "生まれたばかりのハムスターに、すでにあるものはどれ？",
    choices: ["ふさふさの毛", "開いた目", "前歯", "大きなほお袋の食料"], answer: 2,
    explanation: "生まれた直後は毛がなく目も閉じていますが、前歯はあります。",
    source: BIRTH,
  },
  {
    id: "hamster-longhair",
    text: "長毛のゴールデンハムスター。成長後、一般に毛がより長くなるのは？",
    choices: ["オス", "メス", "必ず同じ長さ", "生まれた季節だけで決まる"], answer: 0,
    explanation: "ホルモンの影響により、長毛種では一般にオスの方が長い毛になります。",
    source: VET,
  },
  {
    id: "hamster-winter-coat",
    text: "野生のジャンガリアンハムスターが冬毛に変わると、毛の色はどうなる？",
    choices: ["白っぽくなる", "真っ黒になる", "赤くなる", "青くなる"], answer: 0,
    explanation: "冬の環境に適応すると、白っぽい冬毛になります。変化には個体差があります。",
    source: WINTER,
  },
  {
    id: "hamster-winter-cue",
    text: "ジャンガリアンハムスターが冬支度を始める、大切な手がかりは？",
    choices: ["月の満ち欠け", "昼の時間が短くなること", "風向きが変わること", "土の色が変わること"], answer: 1,
    explanation: "一日に光を浴びる時間の変化が、季節への適応の手がかりになります。",
    source: WINTER,
  },
  {
    id: "hamster-smallest",
    text: "この中で、成体が最も小さい種類のハムスターは？",
    choices: ["ゴールデン", "クロハラ", "ロボロフスキー", "ジャンガリアン"], answer: 2,
    explanation: "ロボロフスキーハムスターは、ハムスターの中でも最も小さい種類です。",
    source: ROBO,
  },
  {
    id: "hamster-robo-eyebrows",
    text: "野生型のロボロフスキーハムスターの、眉毛のように見える模様は？",
    choices: ["目の上の白い斑", "耳の後ろの黒い線", "鼻の上の赤い点", "あごの黄色い縞"], answer: 0,
    explanation: "目の上の白い模様が、眉毛のように見えるのが特徴です。",
    source: ROBO,
  },
  {
    id: "hamster-robo-habitat",
    text: "野生のロボロフスキーハムスターが好むのは、どんな場所？",
    choices: ["湿った熱帯雨林", "砂地の乾燥した草原や半砂漠", "海の近くの岩場だけ", "一年中雪に覆われた山頂"], answer: 1,
    explanation: "モンゴルなどの、砂地の半砂漠や草原にすみ、巣穴を掘ります。",
    source: ROBO,
  },
  {
    id: "hamster-robo-back",
    text: "野生型のロボロフスキーハムスターの特徴として、通常当てはまらないのは？",
    choices: ["背中の中央の黒い縦線", "目の上の白い模様", "お腹の白い毛", "砂色の背中の毛"], answer: 0,
    explanation: "ジャンガリアンなどと違い、背中の中央に黒い縦線がありません。",
    source: ROBO,
  },
  {
    id: "hamster-european-city",
    text: "この中で、野生のクロハラハムスターが暮らしている都市は？",
    choices: ["ウィーン", "東京", "ホノルル", "シドニー"], answer: 0,
    explanation: "クロハラハムスターは、ウィーンなどにも野生で暮らしています。",
    source: ZOO,
  },
  {
    id: "hamster-european-winter",
    text: "野生のクロハラハムスターが、冬に行うのはどれ？",
    choices: ["暖かい国へ渡る", "木の枝に巣を移す", "地中の巣穴で冬眠する", "水の中で眠る"], answer: 2,
    explanation: "秋に食べ物を蓄え、地中の巣穴で冬眠します。",
    source: ZOO,
  },
  {
    id: "hamster-name-meaning",
    text: "「ハムスター」の語源に関係するドイツ語の意味は？",
    choices: ["走り続ける", "ためこむ", "丸くなる", "穴から顔を出す"], answer: 1,
    explanation: "「ためこむ」を意味するドイツ語 hamstern に関係する名前です。",
    source: RSPCA,
  },
  {
    id: "hamster-whisk-speed",
    text: "ハムスターが周囲を調べるとき、ひげを動かす速さは最大で毎秒およそ何回？",
    choices: ["3回", "10回", "30回", "300回"], answer: 2,
    explanation: "ひげを前後に毎秒最大約30回動かし、近くの物を調べます。",
    source: RSPCA,
  },
  {
    id: "hamster-ultrasound",
    text: "ハムスター同士のやりとりにも使われる、人には聞き取りにくい音は？",
    choices: ["超音波", "雷のような低音", "羽ばたく音", "腹の中で鳴る音だけ"], answer: 0,
    explanation: "ハムスターは、人の耳には聞こえない高い超音波の声も使います。",
    source: "https://nc3rs.org.uk/3rs-resources/housing-and-husbandry-hamster",
  },
  {
    id: "hamster-uv-vision",
    text: "ハムスターが感知できる、人の目には見えない光はどれ？",
    choices: ["紫外線", "電波", "X線", "ガンマ線"], answer: 0,
    explanation: "ハムスターには紫外線を感知する視覚があります。",
    source: RSPCA,
  },
];
