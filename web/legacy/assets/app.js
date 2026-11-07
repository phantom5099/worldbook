(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  let uidSeed = 0;
  const uid = (prefix) => {
    uidSeed += 1;
    return `${prefix}-${Date.now().toString(36)}-${uidSeed}`;
  };

  const todayStamp = () => {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  };
  const shortDate = (value) => String(value || '').replace(/-/g, '.');

  const NUM_CN = ['', '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十', '第十一', '第十二'];
  const AV_CLASSES = ['av-shen', 'av-su', 'av-lu', 'av-ruo', 'av-pei', 'av-han', 'av-ale', 'av-gu', 'av-lin', 'av-man', 'av-zhou'];
  const REL_LABELS = { trust: '信任', affection: '好感', fear: '恐惧', respect: '尊重' };
  const REL_KEYS = { 信任: 'trust', 好感: 'affection', 恐惧: 'fear', 尊重: 'respect' };

  const hashString = (value) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    return hash;
  };

  const splitList = (value) => String(value || '')
    .split(/[、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const buildTraitGroups = (text) => {
    const names = splitList(text).slice(0, 4);
    const core = names.length
      ? names.map((name, index) => [name, Number((0.88 - index * 0.08).toFixed(2))])
      : [['待观察', 0.5]];
    return [
      { key: 'core', label: 'core · 内核', hint: '锁定', items: core },
      { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['待观察', 0.4]] },
      { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['平静', 0.5]] },
    ];
  };

  const traitsTextOf = (card) => {
    if (card.traitsText) return card.traitsText;
    if (!Array.isArray(card.traits)) return '';
    const names = [];
    card.traits.forEach((group) => {
      (group.items || []).forEach((item) => {
        const name = Array.isArray(item) ? item[0] : item;
        if (name && !['待观察', '平静'].includes(name) && !names.includes(name)) names.push(name);
      });
    });
    return names.slice(0, 5).join('、');
  };

  function normalizeCard(input) {
    const card = clone(input || {});
    card.id = card.id || uid('card');
    card.name = String(card.name || '未命名').trim() || '未命名';
    card.role = card.role || '身份未定';
    card.goal = card.goal || '';
    card.secret = card.secret || '';
    card.relation = card.relation || '初次见面';
    card.model = card.model || 'A · narrative-x-32k';
    card.fallback = card.fallback || 'B · novel-z';
    card.avatar = card.avatar || card.name.slice(0, 1);
    card.avatarClass = card.avatarClass || AV_CLASSES[hashString(card.name) % AV_CLASSES.length];
    if (Array.isArray(card.traits)) {
      card.traits = card.traits.map((group) => ({
        key: group.key || 'core',
        label: group.label || 'core · 内核',
        hint: group.hint || '',
        items: (group.items || []).map((item) => (
          Array.isArray(item) ? [String(item[0]), Number(item[1]) || 0.5] : [String(item), 0.5]
        )),
      }));
    } else {
      card.traits = buildTraitGroups(card.traitsText || '');
    }
    const relations = card.relations && typeof card.relations === 'object' ? card.relations : {};
    card.relations = {
      trust: Number(relations.trust ?? 0.2),
      affection: Number(relations.affection ?? 0.2),
      fear: Number(relations.fear ?? 0.1),
      respect: Number(relations.respect ?? 0.25),
    };
    card.moments = Array.isArray(card.moments) ? card.moments : [];
    card.knowledge = Array.isArray(card.knowledge) ? card.knowledge : [];
    card.badge = card.badge || '模板';
    card.state = card.state || `目标：${card.goal || '尚未明确'} · 心情：平静 · 位置：${card.role}`;
    return card;
  }

  /* ---------- generic character cards ---------- */
  let GENERIC_CARDS = [
    normalizeCard({
      id: 'gen-lumiao',
      name: '路渺',
      role: '拾遗人 · 无固定居所',
      goal: '找回被抹去的名字',
      secret: '能听见旧物残留的声音',
      traitsText: '耐心、克制、好奇',
      relation: '对陌生人先观察',
      model: 'A · narrative-x-32k',
      fallback: 'B · novel-z',
      avatar: '路',
      avatarClass: 'av-custom',
      badge: '通用',
      desc: '不属于任何世界，偏好从旧物入手寻找线索。',
    }),
    normalizeCard({
      id: 'gen-baicen',
      name: '白岑',
      role: '旧书修复师 · 城南书肆',
      goal: '修复一本被撕掉结尾的账册',
      secret: '账册最后一页写着她自己的名字',
      traitsText: '细致、多疑、较真',
      relation: '对不懂书的人没有耐心',
      model: 'B · novel-z',
      fallback: 'A · narrative-x-mini',
      avatar: '岑',
      avatarClass: 'av-custom',
      badge: '通用',
      desc: '擅长从纸页、笔迹和装帧里读出被删去的事。',
    }),
    normalizeCard({
      id: 'gen-luopan',
      name: '罗盘',
      role: '无证向导 · 边界',
      goal: '带雇主穿过一次边界',
      secret: '他从未真正离开过边界',
      traitsText: '果断、寡言、路痴',
      relation: '先收钱再带路',
      model: 'C · local-w',
      fallback: 'A · narrative-x-mini',
      avatar: '盘',
      avatarClass: 'av-custom',
      badge: '通用',
      desc: '没有执照的向导，熟悉所有不该存在的近路。',
    }),
  ];

  /* ---------- toast ---------- */
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  /* ---------- world data ---------- */
  let WORLDS = {
    fog: {
      id: 'fog',
      name: '雾港纪事',
      preset: true,
      badge: '首发模板',
      genre: '低魔 · 悬疑',
      coverClass: 'cover-fog',
      scene: '',
      hook: '长雾围困的海港，地图上不存在的白塔，三股彼此牵制的势力。昨夜，一艘载着灯油的货船在第七码头失踪。',
      rules: '雾会持续七日；雾中不能点火，否则会引来守夜人。白塔只在退潮后的第一声钟响时出现，位置每一天都不同。',
      factions: '守夜人维持码头秩序；白塔的信使以灯油为报酬；城中药铺与渡船人构成一条灰色水路。',
      conflict: '一艘载着灯油的货船在第七码头失踪，守夜人封锁了码头，而一封没有署名的信被塞进了你的行李。',
      bans: '不出现现代枪械与电子设备；不把白塔解释为外星科技；不写未成年人恋爱。',
      tags: ['长雾', '白塔', '守夜人'],
      defaultCard: {
        name: '裴照',
        role: '外乡验尸官 · 北岸来',
        goal: '把信交给白塔，弄清寄信人是谁',
        secret: '信封里装的不是信，而是一枚生锈的铜钥匙',
        traitsText: '谨慎、记性极好、不轻易承诺',
        relation: '对雾港的守夜人保持距离',
        model: 'A · narrative-x-32k',
        fallback: 'B · novel-z',
        avatar: '裴',
        avatarClass: 'av-pei',
        desc: '带着一封没有署名的信来到雾港。作者弧线已写好，进入最快。',
      },
      facts: [
        '你是外乡人，雾港没有人认识你。',
        '你带着一封没有署名的信，信封上写着“交给白塔”。',
        '你的左手有三道旧伤，你不愿解释来历。',
      ],
      unit: { index: '第一单元', title: '雾港的第七码头', meta: '戌时 · 长雾第七日 · 第七码头' },
      opening: {
        place: '雾港 · 第七码头',
        time: '戌时 · 长雾第七日',
        parts: [
          { type: 'p', text: '雾从海面漫上来的时候，第七码头的灯一盏一盏地灭了。' },
          { type: 'p', text: '你站在卸货的石阶上，手里那封没有署名的信被潮气浸得发软。信封上只有四个字：交给白塔。' },
          { type: 'p', text: '一个提灯的孩子从栈桥尽头跑过，灯芯是青色的。她经过你身边时，脚步没有停，却低声说了一句：“别让守夜人看见那封信。”' },
          { type: 'speech', speaker: '沈砚', text: '外乡人，第七码头今晚不接客。' },
          { type: 'p', text: '他把一卷湿透的缆绳踢回木桩，抬头看了你一眼。那一眼很短，像是在数你身上有几件不该出现在这里的东西。' },
        ],
        note: { who: '沈砚', impression: '谨慎 · 来历不明', deltas: [['信任', '+0.02', 'up']] },
      },
      intents: [
        {
          key: 'cautious',
          tone: '谨慎',
          title: '把信收进内袋，先观察码头的人',
          hint: '沈砚会注意到你的动作；阿箬可能折返。',
          action: '把信收进内袋，退到灯影里，先看清码头有几个人。',
          ai: [
            { type: 'p', text: '信纸贴着胸口，潮气透过衣料渗进来。你把动作拆得很慢，像在整理一件与己无关的行李。' },
            { type: 'speech', speaker: '沈砚', text: '码头今晚不接客。要躲雨，去茶馆。' },
            { type: 'p', text: '他没有再看你，只把缆绳在掌心绕了一圈。栈桥尽头的青灯停了一停，又继续往雾里走。' },
          ],
          notes: [{ who: '沈砚', impression: '谨慎 · 守规矩', deltas: [['信任', '+0.03', 'up']] }],
        },
        {
          key: 'direct',
          tone: '直率',
          title: '直接问沈砚，白塔怎么走',
          hint: '可能触发守夜人的盘问；信中内容仍是秘密。',
          action: '走到沈砚面前，直接问：白塔怎么走。',
          ai: [
            { type: 'p', text: '话出口的瞬间，码头安静了半拍。远处有人收起铁钩，动作停在半空。' },
            { type: 'speech', speaker: '沈砚', text: '白塔。你从哪儿听来的？' },
            { type: 'p', text: '他的手还搭在绳结上，指节却收紧了一点。你听见雾里传来一声很轻的钟响，像是从水底浮上来。' },
          ],
          notes: [{ who: '沈砚', impression: '冒失 · 有所图', deltas: [['信任', '-0.02', 'down'], ['恐惧', '+0.03', 'up']] }],
        },
        {
          key: 'follow',
          tone: '冒险',
          title: '跟上那个提灯的孩子',
          hint: '离开码头；沈砚对你的印象会下降。',
          action: '没有回答，转身跟上那个提灯的孩子。',
          ai: [
            { type: 'p', text: '你踩上栈桥时，木板在脚下发出一声短促的呻吟。青灯没有停，提灯的孩子也没有回头。' },
            { type: 'speech', speaker: '阿箬', text: '跟紧。雾会记住走错路的人。' },
            { type: 'p', text: '身后的码头渐渐只剩潮声。回头时，沈砚还站在原地，灯把他的影子拉得很长。' },
          ],
          notes: [
            { who: '阿箬', impression: '好奇 · 愿意带路', deltas: [['好感', '+0.04', 'up']] },
            { who: '沈砚', impression: '不告而别', deltas: [['信任', '-0.03', 'down']] },
          ],
        },
      ],
      threads: [
        { title: '无署名的信', note: '信仍未拆开。沈砚知道它在你身上。', state: '新' },
        { title: '白塔的方位', note: '白塔在雾里出现过一次，位置与阿箬的航线重合。', state: '进行中' },
        { title: '昨夜失踪的货船', note: '船上的灯油是给白塔的。沈砚的记录少了一页。', state: '进行中' },
      ],
      cards: [
        {
          id: 'npc-shen',
          name: '沈砚',
          role: '守夜人 · 第七码头',
          avatar: '砚',
          avatarClass: 'av-shen',
          badge: '在场',
          goal: '查清昨夜失踪的货船',
          secret: '货船记录少的一页是他自己撕的',
          relation: '对陌生人保持警惕',
          model: 'A · narrative-x-32k',
          fallback: 'B · novel-z',
          state: '目标：查清昨夜失踪的货船 · 心情：警惕 · 位置：第七码头',
          relations: { trust: 0.34, affection: 0.18, fear: 0.12, respect: 0.46 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['秩序', 0.92], ['寡言', 0.88], ['护短', 0.71]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['对陌生人谨慎', 0.66], ['记仇', 0.58]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['警惕', 0.74], ['疲惫', 0.31]] },
          ],
          moments: [
            { quote: '“第七码头今晚不接客。”', meta: '他说话时先看了一眼你手里的信。', event: 'evt_1021 · 第一轮 · 置信度 0.81' },
            { quote: '把唯一的干灯推给阿箬，自己留在雨里。', meta: '阿箬没有道谢，他也没有等。', event: 'evt_1034 · 第二轮 · 置信度 0.76' },
            { quote: '在货船记录上停笔，撕掉了最后一页。', meta: '那一页记着灯油的去向。', event: 'evt_1042 · 第三轮 · 置信度 0.69' },
          ],
          knowledge: [
            { text: '昨夜货船在第七码头失踪，船上装的是灯油。', source: '亲历 · evt_1008' },
            { text: '货船记录少了一页，是他自己撕的。', source: '只有他知道', secret: true },
            { text: '你身上带着一封没有署名的信。', source: '观察 · evt_1021' },
          ],
        },
        {
          id: 'npc-su',
          name: '苏晚',
          role: '药铺掌柜 · 城中',
          avatar: '晚',
          avatarClass: 'av-su',
          badge: '城中',
          goal: '凑齐下个月的药钱',
          secret: '她替白塔的人处理过一道刀伤',
          relation: '对官府与守夜人都没有好感',
          model: 'B · novel-z',
          fallback: 'A · narrative-x-mini',
          state: '目标：凑齐下个月的药钱 · 心情：疲惫 · 位置：城中药铺',
          relations: { trust: 0.27, affection: 0.41, fear: 0.05, respect: 0.38 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['惜命', 0.84], ['心软', 0.67], ['精明', 0.79]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['不信官府', 0.62], ['护着学徒', 0.55]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['疲惫', 0.66], ['好奇', 0.33]] },
          ],
          moments: [
            { quote: '“止血粉只剩最后一包。你要就拿去。”', meta: '她没提价钱，也没问你用来做什么。', event: 'evt_1055 · 第三轮 · 置信度 0.72' },
            { quote: '把账本翻到新的一页，划掉了沈砚的名字。', meta: '那笔药钱欠了三年。', event: 'evt_1061 · 第三轮 · 置信度 0.64' },
            { quote: '听见“白塔”两个字时，手里的药杵停了一瞬。', meta: '很快又继续捣药，像什么都没发生。', event: 'evt_1070 · 第四轮 · 置信度 0.58' },
          ],
          knowledge: [
            { text: '沈砚每隔三天来买一次安神药，从不讲价。', source: '亲历 · evt_1012' },
            { text: '她替白塔的人处理过一道刀伤。', source: '只有她知道', secret: true },
            { text: '阿箬的航线会经过城南水道。', source: '阿箬告诉过她' },
          ],
        },
        {
          id: 'npc-lu',
          name: '陆岐',
          role: '说书人 · 茶馆',
          avatar: '岐',
          avatarClass: 'av-lu',
          badge: '茶馆',
          goal: '把白塔的故事讲给愿意听的人',
          secret: '他知道沈砚的兄长死在第七码头',
          relation: '对所有人热情，对真相含糊',
          model: 'A · narrative-x-32k',
          fallback: 'B · novel-z',
          state: '目标：把白塔的故事讲给愿意听的人 · 心情：兴奋 · 位置：城南茶馆',
          relations: { trust: 0.41, affection: 0.24, fear: 0.09, respect: 0.52 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['善辩', 0.9], ['好奇', 0.86], ['惜字', 0.3]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['爱夸饰', 0.72], ['记性好', 0.64]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['兴奋', 0.7], ['心虚', 0.22]] },
          ],
          moments: [
            { quote: '“白塔不在海上，白塔在雾的背面。”', meta: '说完这句，他停了很久，等茶客追问。', event: 'evt_1039 · 第二轮 · 置信度 0.67' },
            { quote: '把沈砚的旧事讲成了三个不同的版本。', meta: '同一晚，三个版本都有人信。', event: 'evt_1052 · 第三轮 · 置信度 0.55' },
            { quote: '收下你的铜板，却退回了那枚铜钥匙。', meta: '“这个我不碰，”他说，“晦气。”', event: 'evt_1074 · 第四轮 · 置信度 0.73' },
          ],
          knowledge: [
            { text: '二十年前，白塔曾在雾里亮过一夜。', source: '亲历 · 童年记忆' },
            { text: '他知道沈砚的兄长死在第七码头。', source: '只有他知道', secret: true },
            { text: '茶馆地窖里藏着一卷旧海图。', source: '听常客说过' },
          ],
        },
        {
          id: 'npc-ruo',
          name: '阿箬',
          role: '渡船少女 · 栈桥',
          avatar: '箬',
          avatarClass: 'av-ruo',
          badge: '栈桥',
          goal: '把青灯送到北岸',
          secret: '她知道去白塔的水道，但从没靠过岸',
          relation: '对愿意跟她走的人放松警惕',
          model: 'C · local-w',
          fallback: 'A · narrative-x-mini',
          state: '目标：把青灯送到北岸 · 心情：好奇 · 位置：栈桥尽头',
          relations: { trust: 0.31, affection: 0.46, fear: 0.08, respect: 0.29 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['胆大', 0.88], ['守约', 0.83], ['嘴硬', 0.61]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['熟悉雾路', 0.7], ['怕黑', 0.35]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['好奇', 0.69], ['警觉', 0.41]] },
          ],
          moments: [
            { quote: '“别让守夜人看见那封信。”', meta: '她只说了这一句，脚步没有停。', event: 'evt_1023 · 第一轮 · 置信度 0.84' },
            { quote: '把青灯往你这边偏了偏，照亮你脚下的木板。', meta: '她自己还站在暗处。', event: 'evt_1045 · 第三轮 · 置信度 0.71' },
            { quote: '在雾里停下船，等一只看不见的手接过灯。', meta: '她没有回头，也没有解释。', event: 'evt_1068 · 第四轮 · 置信度 0.66' },
          ],
          knowledge: [
            { text: '青灯能照出雾里真正的路。', source: '亲历 · evt_1023' },
            { text: '她知道去白塔的水道，但从没靠过岸。', source: '只有她知道', secret: true },
            { text: '沈砚曾经放过她一次。', source: '阿箬自己说的' },
          ],
        },
      ],
    },

    snow: {
      id: 'snow',
      name: '雪岭孤灯',
      preset: true,
      badge: '预设模板',
      genre: '山野 · 志怪 · 生存',
      coverClass: 'cover-snow',
      scene: 'scene-snow',
      hook: '大雪封山前，最后一支商队要在山神庙过夜。庙里的灯不能灭，雪地里却多了一行不属于任何人的脚印。',
      rules: '山神庙的灯必须烧到天亮；火光照不到的地方会出现白影；冻伤不可逆，风寒会消耗体力。',
      factions: '南来的商队、守灯的山民、山下的猎户彼此不信任，却都依赖这座庙。',
      conflict: '商队进庙时少了一个人，雪地上没有脚印，货箱却重了一倍。',
      bans: '不让超自然力量直接解决生存问题；不出现现代取暖设备；不写未成年人恋爱。',
      tags: ['封山', '山神庙', '商队'],
      defaultCard: {
        name: '韩渡',
        role: '商队账房 · 南边来',
        goal: '把商队和货完整带过雪岭',
        secret: '货箱里藏着一封东家的遗书',
        traitsText: '谨慎、怕冷、算得清',
        relation: '对守灯人半信半疑',
        model: 'B · novel-z',
        fallback: 'A · narrative-x-32k',
        avatar: '韩',
        avatarClass: 'av-han',
        desc: '第一次走雪岭，账本比命还重要。作者弧线已写好，进入最快。',
      },
      facts: [
        '你跟着商队第一次进山，对雪岭一无所知。',
        '你知道货箱里多了一件不该有的东西。',
        '昨夜你听见有人在雪里叫你的名字。',
      ],
      unit: { index: '第一单元', title: '雪岭的第一夜', meta: '子时 · 封山前夜 · 山神庙' },
      opening: {
        place: '雪岭 · 山神庙',
        time: '子时 · 封山前夜',
        parts: [
          { type: 'p', text: '雪把庙门埋了一半。商队的人挤在火堆旁，谁都没有说话，只有风从门缝里钻进来。' },
          { type: 'p', text: '你数了两遍人，还是少一个。账本上写着十二个名字，火堆边只有十一张脸。' },
          { type: 'speech', speaker: '阿勒', text: '灯别灭。灭了，山神就来收人。' },
          { type: 'p', text: '守灯人把最后一勺油倒进灯里。火光跳了一下，照见门外雪地上有一行新鲜的脚印，正朝着庙后走去。' },
        ],
        note: { who: '阿勒', impression: '警惕 · 不愿多说', deltas: [['信任', '+0.01', 'up']] },
      },
      intents: [
        {
          key: 'lamp',
          tone: '谨慎',
          title: '先守住灯，再清点庙里的人',
          hint: '灯是唯一的规则；清点会暴露你也不确定人数。',
          action: '先把灯移到背风处，再挨个清点庙里的人。',
          ai: [
            { type: 'p', text: '你把灯挪到墙角，火苗贴着灯罩慢慢稳住。清点到最后，你发现多了一件不属于任何人的湿斗篷。' },
            { type: 'speech', speaker: '阿勒', text: '别数了。数出来的，不一定是人。' },
            { type: 'p', text: '他说完就闭上眼，像是早就知道会少一个，也早就知道会多一个。' },
          ],
          notes: [{ who: '阿勒', impression: '守规矩 · 可以商量', deltas: [['信任', '+0.03', 'up']] }],
        },
        {
          key: 'crate',
          tone: '直率',
          title: '打开货箱，确认多出来的东西',
          hint: '商队会知道你在查账；东家的秘密可能暴露。',
          action: '把货箱拖到火边，当着所有人的面打开。',
          ai: [
            { type: 'p', text: '箱盖掀开，最上面是一层冻硬的盐。盐下面压着一只没有落款的木匣，锁孔里塞着半截红绳。' },
            { type: 'speech', speaker: '林娘子', text: '账房，这箱子不该你开。' },
            { type: 'p', text: '她的声音很轻，手却已经按在箱盖上。火堆另一边，顾九慢慢站了起来。' },
          ],
          notes: [{ who: '林娘子', impression: '被冒犯 · 开始防你', deltas: [['信任', '-0.04', 'down']] }],
        },
        {
          key: 'prints',
          tone: '冒险',
          title: '顺着雪地脚印走到庙后',
          hint: '离开火光；你可能会看见不该看见的东西。',
          action: '提一盏小灯，顺着雪地脚印绕到庙后。',
          ai: [
            { type: 'p', text: '脚印在庙后停了。不是消失，是像有人站在原地，然后被雪从脚下开始抹掉。' },
            { type: 'p', text: '你听见庙里有人叫你的名字，声音和你自己一模一样。' },
            { type: 'speech', speaker: '顾九', text: '回来。别答应。' },
            { type: 'p', text: '他站在庙门口，刀没有出鞘，但手一直按在刀柄上。' },
          ],
          notes: [{ who: '顾九', impression: '欠你一次 · 保持距离', deltas: [['信任', '+0.02', 'up']] }],
        },
      ],
      threads: [
        { title: '少了一个人', note: '账本上十二个名字，火堆边只有十一张脸。', state: '新' },
        { title: '不灭的灯', note: '阿勒说灯灭了，山神就来收人。', state: '进行中' },
        { title: '货箱里的遗书', note: '货箱比进山时重了一倍。', state: '进行中' },
      ],
      cards: [
        {
          id: 'npc-ale',
          name: '阿勒',
          role: '守灯人 · 山神庙',
          avatar: '勒',
          avatarClass: 'av-ale',
          badge: '守灯',
          goal: '让庙里的灯烧到天亮',
          secret: '他知道少掉的那个人昨夜已经死了',
          relation: '对商队保持距离，对灯极度认真',
          model: 'B · novel-z',
          fallback: 'A · narrative-x-32k',
          state: '目标：让灯烧到天亮 · 心情：紧绷 · 位置：山神庙',
          relations: { trust: 0.22, affection: 0.15, fear: 0.2, respect: 0.48 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['守规矩', 0.91], ['寡言', 0.82], ['认死理', 0.74]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['敬畏山神', 0.78], ['不信外乡人', 0.61]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['紧绷', 0.72], ['疲惫', 0.44]] },
          ],
          moments: [
            { quote: '“灯别灭。灭了，山神就来收人。”', meta: '他说这话时没有看任何人。', event: 'evt_2011 · 第一轮 · 置信度 0.86' },
            { quote: '把最后一勺油倒进灯里，自己没留。', meta: '他守了这盏灯十九年。', event: 'evt_2027 · 第二轮 · 置信度 0.79' },
            { quote: '听见“少一个人”时，他没有惊讶。', meta: '像是早就数过。', event: 'evt_2034 · 第三轮 · 置信度 0.68' },
          ],
          knowledge: [
            { text: '山神庙的灯一旦灭了，就不能再点。', source: '亲历 · 守灯规矩' },
            { text: '昨夜有人在庙后死了，尸体被雪埋住。', source: '只有他知道', secret: true },
            { text: '商队的货箱里有一件不属于商队的东西。', source: '观察 · evt_2019' },
          ],
        },
        {
          id: 'npc-gu',
          name: '顾九',
          role: '商队镖师 · 北边来',
          avatar: '九',
          avatarClass: 'av-gu',
          badge: '庙中',
          goal: '把商队活着带下山',
          secret: '他认识那个失踪的人，却不承认',
          relation: '对账房客气，对守灯人警惕',
          model: 'A · narrative-x-32k',
          fallback: 'B · novel-z',
          state: '目标：把商队活着带下山 · 心情：戒备 · 位置：山神庙门口',
          relations: { trust: 0.36, affection: 0.2, fear: 0.06, respect: 0.44 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['守诺', 0.87], ['多疑', 0.83], ['能忍', 0.7]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['对账房留面子', 0.52], ['不信山神', 0.66]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['戒备', 0.78], ['内疚', 0.3]] },
          ],
          moments: [
            { quote: '“回来。别答应。”', meta: '他没有出鞘，但一直没有松手。', event: 'evt_2041 · 第三轮 · 置信度 0.73' },
            { quote: '把失踪者的名字从账本上划掉，又写了回去。', meta: '墨迹被雪水洇开。', event: 'evt_2052 · 第四轮 · 置信度 0.61' },
            { quote: '在庙门口站了一夜，不让任何人出去。', meta: '包括他自己。', event: 'evt_2060 · 第四轮 · 置信度 0.7' },
          ],
          knowledge: [
            { text: '失踪的人叫陈六，是他在北边招来的。', source: '亲历 · evt_2009' },
            { text: '他认识陈六，但不想让商队知道。', source: '只有他知道', secret: true },
            { text: '庙后的雪地每天都会重新平整。', source: '观察 · evt_2038' },
          ],
        },
        {
          id: 'npc-lin',
          name: '林娘子',
          role: '商队东家 · 南边来',
          avatar: '林',
          avatarClass: 'av-lin',
          badge: '庙中',
          goal: '在封山前把货送过雪岭',
          secret: '货箱里的遗书是她丈夫留下的',
          relation: '对账房有旧交，但不完全信任',
          model: 'B · novel-z',
          fallback: 'A · narrative-x-mini',
          state: '目标：把货送过雪岭 · 心情：镇定 · 位置：山神庙火堆旁',
          relations: { trust: 0.42, affection: 0.28, fear: 0.07, respect: 0.51 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['果断', 0.88], ['护货', 0.84], ['体面', 0.72]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['不露底牌', 0.7], ['念旧', 0.55]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['镇定', 0.68], ['焦虑', 0.37]] },
          ],
          moments: [
            { quote: '“账房，这箱子不该你开。”', meta: '她按着箱盖，指节发白。', event: 'evt_2022 · 第二轮 · 置信度 0.75' },
            { quote: '把最后一块干粮分给守灯人。', meta: '没有提钱。', event: 'evt_2048 · 第三轮 · 置信度 0.69' },
            { quote: '在遗书上按了一个没有名字的指印。', meta: '她说那只是货单。', event: 'evt_2059 · 第四轮 · 置信度 0.63' },
          ],
          knowledge: [
            { text: '这趟货必须在封山前送到北边。', source: '亲历 · 商队计划' },
            { text: '货箱里的遗书是她丈夫留下的。', source: '只有她知道', secret: true },
            { text: '陈六不是第一次跟她的商队。', source: '账本记录' },
          ],
        },
      ],
    },

    radio: {
      id: 'radio',
      name: '回声电台',
      preset: true,
      badge: '预设模板',
      genre: '近未来 · 都市 · 悬疑',
      coverClass: 'cover-radio',
      scene: 'scene-radio',
      hook: '凌晨三点，城市里所有收音机都会收到同一个女声。她在念明天失踪者的名字。今晚，名单上出现了你。',
      rules: '电台无法被定位；预言只能提前二十四小时；改变预言会付出等价的代价。',
      factions: '夜班司机与听众、市政应急处、地下信号贩子，各自掌握一部分频率。',
      conflict: '今晚的名单上出现了你的名字，而第二个人是你失联三年的妹妹。',
      bans: '不把电台解释为时间旅行；不出现现实中的真实机构；不写未成年人恋爱。',
      tags: ['凌晨三点', '名单', '旧电台'],
      defaultCard: {
        name: '陈默',
        role: '夜班出租车司机 · 城南',
        goal: '找到电台，把妹妹从名单上划掉',
        secret: '后备箱里的收音机不是他的',
        traitsText: '冷静、失眠、记路',
        relation: '对乘客保持距离，对电台既恐惧又依赖',
        model: 'A · narrative-x-32k',
        fallback: 'B · novel-z',
        avatar: '陈',
        avatarClass: 'av-custom',
        desc: '连续七个凌晨收听同一个频率。作者弧线已写好，进入最快。',
      },
      facts: [
        '你连续七个凌晨收听那个频率，从没告诉任何人。',
        '今晚的名单上出现了你的名字。',
        '你的后备箱里有一台不属于你的收音机。',
      ],
      unit: { index: '第一单元', title: '凌晨三点的频率', meta: '03:07 · 城南高架 · 暴雨' },
      opening: {
        place: '城南 · 高架桥下',
        time: '03:07 · 暴雨',
        parts: [
          { type: 'p', text: '雨刷把挡风玻璃上的城市刮成一片模糊的橙色。电台在 03:07 自动跳频，女声准时出现。' },
          { type: 'p', text: '她先念了三个名字。第三个是你。第四个名字停了一秒，念出来时，你认出了那是你妹妹。' },
          { type: 'speech', speaker: '曼青', text: '如果你听见自己的名字，不要回家。' },
          { type: 'p', text: '后座没有人。可你从后视镜里看见，后备箱的锁扣轻轻弹开了一条缝。' },
        ],
        note: { who: '曼青', impression: '熟悉 · 有所隐瞒', deltas: [['信任', '+0.02', 'up']] },
      },
      intents: [
        {
          key: 'note',
          tone: '谨慎',
          title: '靠边停车，把名单完整记下来',
          hint: '你会错过回家的路口；名单可能被人看见。',
          action: '把车停到应急带，掏出纸笔把名单完整记下来。',
          ai: [
            { type: 'p', text: '你写下第四个名字时，笔尖顿了一下。纸上的字迹被雨水晕开，却比记忆里更清楚。' },
            { type: 'p', text: '电台没有继续念。女声安静了几秒，像是隔着电流在等你写完。' },
            { type: 'speech', speaker: '曼青', text: '记下来没用。你得决定，先救哪一个。' },
          ],
          notes: [{ who: '曼青', impression: '被认真对待 · 愿意多说', deltas: [['信任', '+0.04', 'up']] }],
        },
        {
          key: 'station',
          tone: '直率',
          title: '调头去电台旧址',
          hint: '旧楼已经封了十年；暴雨里没有人会来接应。',
          action: '关掉计价器，调头驶向城北的旧广播大楼。',
          ai: [
            { type: 'p', text: '旧广播大楼在雨里只剩一个轮廓。铁门没有锁，门厅里的值班灯却亮着，像一直有人在等。' },
            { type: 'speech', speaker: '周野', text: '你也听见了？今晚来的人比过去一年都多。' },
            { type: 'p', text: '他靠在楼梯口，怀里抱着一台拆开的收讯机。 upstairs，有什么东西在缓慢地转动。' },
          ],
          notes: [{ who: '周野', impression: '同类 · 可以交易', deltas: [['信任', '+0.03', 'up']] }],
        },
        {
          key: 'trunk',
          tone: '冒险',
          title: '停车，打开后备箱',
          hint: '收音机可能还在播；你不知道里面还有什么。',
          action: '把车停进桥洞，熄火，打开后备箱。',
          ai: [
            { type: 'p', text: '后备箱里只有那台旧收音机。它的指针停在 03:07，扬声器里传出雨声，比你头顶的雨更近。' },
            { type: 'p', text: '你伸手去关，它先响了。是你妹妹的声音，叫了你一声只有她会叫的小名。' },
            { type: 'speech', speaker: '小满', text: '哥，别信名单。先找我。' },
          ],
          notes: [{ who: '小满', impression: '重新出现 · 位置不明', deltas: [['信任', '+0.05', 'up']] }],
        },
      ],
      threads: [
        { title: '名单上的名字', note: '你的名字排在第三，妹妹排在第四。', state: '新' },
        { title: '电台的旧址', note: '城北旧广播大楼封了十年，今晚却亮着灯。', state: '进行中' },
        { title: '后备箱里的收音机', note: '不是你的，却知道只有妹妹会叫的小名。', state: '进行中' },
      ],
      cards: [
        {
          id: 'npc-man',
          name: '曼青',
          role: '电台女声 · 频率不明',
          avatar: '曼',
          avatarClass: 'av-man',
          badge: '在播',
          goal: '让名单上的人活到天亮',
          secret: '她曾经也是名单上的名字',
          relation: '对能听见她的人格外耐心',
          model: 'C · local-w',
          fallback: 'A · narrative-x-32k',
          state: '目标：让名单上的人活到天亮 · 心情：疲惫 · 位置：03:07 频率',
          relations: { trust: 0.28, affection: 0.33, fear: 0.15, respect: 0.4 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['克制', 0.86], ['怜悯', 0.73], ['隐瞒', 0.81]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['对听众负责', 0.68], ['害怕被找到', 0.57]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['疲惫', 0.71], ['急切', 0.46]] },
          ],
          moments: [
            { quote: '“如果你听见自己的名字，不要回家。”', meta: '她说完这句，电流声断了半秒。', event: 'evt_3007 · 第一轮 · 置信度 0.82' },
            { quote: '在名单念到一半时停下来，等一个人写完。', meta: '她从不为任何人停。', event: 'evt_3018 · 第二轮 · 置信度 0.77' },
            { quote: '把背景里的雨声调小，像是怕吵到谁。', meta: '那是她唯一一次露出犹豫。', event: 'evt_3029 · 第三轮 · 置信度 0.65' },
          ],
          knowledge: [
            { text: '名单只能提前二十四小时，无法取消。', source: '亲历 · 电台规则' },
            { text: '她曾经也是名单上的名字。', source: '只有她知道', secret: true },
            { text: '旧广播大楼的地下室还有一台发射机。', source: '不愿确认' },
          ],
        },
        {
          id: 'npc-zhou',
          name: '周野',
          role: '信号贩子 · 城北',
          avatar: '野',
          avatarClass: 'av-zhou',
          badge: '城北',
          goal: '找到电台的发射源，卖个好价钱',
          secret: '他已经把名单卖给过市政应急处一次',
          relation: '对陈默有旧账，愿意交易',
          model: 'A · narrative-x-32k',
          fallback: 'B · novel-z',
          state: '目标：找到发射源 · 心情：兴奋 · 位置：旧广播大楼',
          relations: { trust: 0.24, affection: 0.12, fear: 0.11, respect: 0.36 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['精明', 0.89], ['冒险', 0.76], ['不守信', 0.62]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['缺钱', 0.74], ['念旧', 0.31]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['兴奋', 0.75], ['心虚', 0.28]] },
          ],
          moments: [
            { quote: '“今晚来的人比过去一年都多。”', meta: '他说这话时在笑，手却没停。', event: 'evt_3011 · 第一轮 · 置信度 0.71' },
            { quote: '把一台收讯机塞进背包，又拿出来放回原处。', meta: '他改了两次主意。', event: 'evt_3024 · 第二轮 · 置信度 0.6' },
            { quote: '听见地下室的水声，忽然不说话了。', meta: '他比谁都清楚那下面有什么。', event: 'evt_3033 · 第三轮 · 置信度 0.67' },
          ],
          knowledge: [
            { text: '电台的信号每晚从不同地方发出。', source: '亲历 · 三年追踪' },
            { text: '他把名单卖给过市政应急处一次。', source: '只有他知道', secret: true },
            { text: '旧楼地下室有一道不能断电的门。', source: '听同行说过' },
          ],
        },
        {
          id: 'npc-man2',
          name: '小满',
          role: '失联者 · 名单第四位',
          avatar: '满',
          avatarClass: 'av-custom',
          badge: '失联',
          goal: '让哥哥不要相信电台给的顺序',
          secret: '她三年前就已经听过自己的名字',
          relation: '对哥哥依赖，却不敢解释这三年',
          model: 'B · novel-z',
          fallback: 'A · narrative-x-mini',
          state: '目标：阻止哥哥按名单行动 · 心情：焦急 · 位置：不明',
          relations: { trust: 0.55, affection: 0.62, fear: 0.24, respect: 0.3 },
          traits: [
            { key: 'core', label: 'core · 内核', hint: '锁定', items: [['执拗', 0.85], ['护短', 0.8], ['隐瞒', 0.7]] },
            { key: 'slow', label: 'slow · 慢变', hint: '按事件更新', items: [['熟悉电台', 0.66], ['怕被找到', 0.6]] },
            { key: 'mood', label: 'mood · 情绪', hint: '本轮', items: [['焦急', 0.73], ['愧疚', 0.42]] },
          ],
          moments: [
            { quote: '“哥，别信名单。先找我。”', meta: '她的声音比三年前低了一点。', event: 'evt_3014 · 第一轮 · 置信度 0.76' },
            { quote: '在电流里笑了一下，又立刻收住。', meta: '像怕被人听见。', event: 'evt_3026 · 第二轮 · 置信度 0.64' },
            { quote: '念出只有兄妹知道的小名，然后挂断。', meta: '收音机的指针回到 03:07。', event: 'evt_3037 · 第三轮 · 置信度 0.7' },
          ],
          knowledge: [
            { text: '名单上的顺序不是死亡顺序。', source: '亲历 · 三年前' },
            { text: '她三年前就已经听过自己的名字。', source: '只有她知道', secret: true },
            { text: '电台地下室的门需要两个人同时打开。', source: '不愿解释' },
          ],
        },
      ],
    },
  };

  const allWorlds = () => Object.values(WORLDS);

  function genericIntents(world) {
    const lead = world.cards[0] ? world.cards[0].name : '当地人';
    return [
      {
        key: 'cautious',
        tone: '谨慎',
        title: '先留在原地，观察周围的变化',
        hint: `不惊动${lead}；可能错过短暂的机会。`,
        action: '留在原地，先观察周围的变化。',
        ai: [
          { type: 'p', text: '你没有立刻行动。周围的声音一点点退远，只剩下自己的呼吸。' },
          { type: 'speech', speaker: lead, text: '你比我想的更沉得住气。' },
          { type: 'p', text: '对方没有靠近，也没有离开。你们之间隔着一段谁都不愿先走完的距离。' },
        ],
        notes: [{ who: lead, impression: '谨慎 · 值得观察', deltas: [['信任', '+0.02', 'up']] }],
      },
      {
        key: 'direct',
        tone: '直率',
        title: '直接问这里发生了什么',
        hint: `会暴露你一无所知；${lead}可能被迫表态。`,
        action: '直接问这里发生了什么。',
        ai: [
          { type: 'p', text: '问题落地，周围安静了一拍。有人移开视线，有人开始打量你。' },
          { type: 'speech', speaker: lead, text: '你不知道？那你来这里做什么。' },
          { type: 'p', text: '这句话像是问给所有人听的。你意识到，从此刻起，你的来历会被反复追问。' },
        ],
        notes: [{ who: lead, impression: '来历不明 · 需要试探', deltas: [['信任', '-0.02', 'down'], ['恐惧', '+0.01', 'up']] }],
      },
      {
        key: 'risk',
        tone: '冒险',
        title: '越过界线，去看没人愿意提的地方',
        hint: '会离开当前场景；可能触发这条世界线的核心矛盾。',
        action: '越过界线，去看没人愿意提的地方。',
        ai: [
          { type: 'p', text: '你越过那道界线时，身后的声音停了。前面没有路标，只有一条被人反复走过、又被刻意抹掉的痕迹。' },
          { type: 'p', text: '你听见有人在远处叫你的名字，用的不是这里的口音。' },
          { type: 'speech', speaker: lead, text: '现在回头，还来得及。' },
        ],
        notes: [{ who: lead, impression: '冒险 · 难以控制', deltas: [['尊重', '+0.03', 'up'], ['信任', '-0.01', 'down']] }],
      },
    ];
  }

  const worldIntents = (world) => (Array.isArray(world.intents) && world.intents.length ? world.intents : genericIntents(world));

  const worldOf = (session) => WORLDS[session.worldId] || WORLDS.fog;

  const unitLabel = (session) => {
    const index = session.story.unitIndex || 1;
    if (index === 1) return worldOf(session).unit.index || '第一单元';
    return `${NUM_CN[index] || index}单元`;
  };

  /* ---------- sessions ---------- */
  function makeSession(world, card, name, status, createdAt, cast) {
    const protagonist = normalizeCard(clone(card));
    protagonist.id = uid('card');
    const castCards = Array.isArray(cast) ? cast : (world.cards || []);
    const npcCards = castCards.slice(0, 6).map((npc) => {
      const copy = normalizeCard(clone(npc));
      copy.id = uid('card');
      return copy;
    });
    return {
      id: uid('sess'),
      worldId: world.id,
      worldName: world.name,
      worldCover: world.coverClass,
      worldScene: world.scene,
      name,
      status,
      createdAt: createdAt || todayStamp(),
      card: protagonist,
      npcCards,
      threads: clone(world.threads || []),
      runtime: { model: protagonist.model, calls: '3.4', latency: '380 ms', degrade: '0', status: '正常' },
      story: { unitIndex: 1, turn: 0, nodes: 2, mode: 'novel', completed: false, turns: [] },
      changes: [],
    };
  }

  const fogSession = makeSession(WORLDS.fog, WORLDS.fog.defaultCard, '第七码头之夜', 'active', '2026-11-01');
  fogSession.id = 'sess-fog-1';
  fogSession.story.turn = 3;
  fogSession.story.nodes = 6;
  fogSession.story.turns = [
    {
      round: 1,
      mode: 'novel',
      action: WORLDS.fog.intents[0].action,
      ai: clone(WORLDS.fog.intents[0].ai),
      notes: clone(WORLDS.fog.intents[0].notes),
    },
    {
      round: 2,
      mode: 'novel',
      action: WORLDS.fog.intents[2].action,
      ai: clone(WORLDS.fog.intents[2].ai),
      notes: clone(WORLDS.fog.intents[2].notes),
    },
    {
      round: 3,
      mode: 'open',
      action: '在雾里说出“白塔”两个字，看谁会先回头。',
      ai: [
        { type: 'p', text: '你说出“白塔”两个字。码头上没有人回头，只有雾里那盏青灯轻轻晃了一下。' },
        { type: 'speech', speaker: '沈砚', text: '这里没人知道白塔。' },
        { type: 'p', text: '他回答得太快了。快到你确定，他至少听说过。' },
      ],
      notes: [{ who: '沈砚', impression: '警觉 · 开始留意你', deltas: [['信任', '-0.01', 'down']] }],
    },
  ];
  fogSession.changes = [
    { who: '沈砚', label: '信任', value: '+0.02', direction: 'up', reason: '你没有把信摊开（第 1 轮）' },
    { who: '沈砚', label: '信任', value: '+0.03', direction: 'up', reason: '你按规矩退到灯影里（第 1 轮）' },
    { who: '阿箬', label: '好感', value: '+0.04', direction: 'up', reason: '你跟着青灯走了一段（第 2 轮）' },
    { who: '沈砚', label: '信任', value: '-0.03', direction: 'down', reason: '你不告而别（第 2 轮）' },
    { who: '沈砚', label: '信任', value: '-0.01', direction: 'down', reason: '你主动提起白塔（第 3 轮）' },
  ];
  fogSession.runtime = { model: fogSession.card.model, calls: '4.2', latency: '420 ms', degrade: '1', status: '正常' };

  const snowDraft = makeSession(WORLDS.snow, WORLDS.snow.defaultCard, '封山前的最后一夜', 'draft', '2026-11-02');
  snowDraft.id = 'sess-snow-draft';

  let sessions = [fogSession, snowDraft];

  /* ---------- state ---------- */
  let activeSessionId = fogSession.id;
  let editSessionId = '';
  let editProtagonist = null;
  let editCast = [];
  let selectedWorldId = 'fog';
  let entryWorldId = 'fog';
  let entryProtagonist = 'default';
  let entryCard = normalizeCard(clone(WORLDS.fog.defaultCard));
  let entryCardWorldId = 'fog';
  let entryCastKeys = [];
  let entryCastWorldId = 'fog';
  let entryNameDirty = false;
  let entryWorldQueued = '';
  let narrativeMode = 'novel';
  let streaming = false;
  let selectedCharacterId = '';
  let worldDefaultEdit = '';
  let editingCardId = '';
  let editingGenericId = '';

  const currentSession = () => sessions.find((session) => session.id === activeSessionId) || null;
  const currentWorld = () => {
    const session = currentSession();
    return session ? worldOf(session) : null;
  };

  /* ---------- routing & chrome ---------- */
  const rail = $('#rail');
  const contextRail = $('#contextRail');
  const scrim = $('#scrim');
  const menuBtn = $('#menuBtn');
  const contextToggle = $('#contextToggle');
  const views = $$('.view');
  const viewNames = views.map((view) => view.dataset.view);
  const viewTitles = {
    sessions: '会话',
    story: '故事',
    entry: '新会话',
    worlds: '世界书',
    world: '世界书',
    cards: '角色',
    cast: '会话角色',
    recap: '复盘',
    settings: '提供商',
  };
  let lastView = '';

  function syncScrim() {
    const open = rail.classList.contains('open') || contextRail.classList.contains('open');
    scrim.classList.toggle('show', open);
    menuBtn.setAttribute('aria-expanded', String(rail.classList.contains('open')));
    contextToggle.setAttribute('aria-expanded', String(contextRail.classList.contains('open')));
  }

  function closeDrawers() {
    rail.classList.remove('open');
    contextRail.classList.remove('open');
    syncScrim();
  }

  function renderView(name) {
    if (!viewNames.includes(name)) name = 'sessions';
    if (name === 'world' && !allWorlds().length) name = 'worlds';
    const session = currentSession();
    if (['story', 'cast', 'recap'].includes(name) && (!session || session.status !== 'active')) {
      if (session && session.status === 'draft') toast('这个会话还是草稿，开始后才能进入故事');
      else toast('先从一个世界书开始会话');
      name = 'sessions';
    }
    if (name === 'entry' && lastView !== 'entry') resetEntry();

    views.forEach((view) => { view.hidden = view.dataset.view !== name; });
    if (name !== 'worlds') $('#worldCreatorModal').hidden = true;
    if (name !== 'world') {
      $('#cardCreatorModal').hidden = true;
      editingCardId = '';
    }
    if (name !== 'cards') {
      $('#genericCardCreatorModal').hidden = true;
      editingGenericId = '';
    }
    if (name !== 'settings') $('#customProviderModal').hidden = true;
    if (name !== 'entry') {
      $('#entryProtagonistModal').hidden = true;
      $('#protagonistPickerModal').hidden = true;
    }
    if (name !== 'sessions') {
      $('#sessionEditModal').hidden = true;
      editSessionId = '';
    }

    const navName = ['story', 'cast', 'recap', 'entry'].includes(name) ? 'sessions'
      : (name === 'world' ? 'worlds' : name);
    $$('.nav-item[data-nav], .mobile-nav-item[data-nav]').forEach((item) => {
      const active = item.dataset.nav === navName;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    document.title = `${viewTitles[name]} · Worldbook`;
    document.body.classList.toggle('with-context', ['story', 'cast', 'recap'].includes(name));
    closeDrawers();
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (name === 'sessions') renderSessions();
    else if (name === 'story') renderStory();
    else if (name === 'entry') renderEntry();
    else if (name === 'worlds') renderWorlds();
    else if (name === 'world') renderWorld();
    else if (name === 'cards') renderGenericCards();
    else if (name === 'cast') renderCharacters();
    else if (name === 'recap') renderRecap();
    else if (name === 'settings') renderSettings();

    renderChrome();
    lastView = name;
  }

  function go(name) {
    if (!viewNames.includes(name)) name = 'sessions';
    if (location.hash === `#${name}`) renderView(name);
    else location.hash = name;
  }

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      if (nav.dataset.world) selectedWorldId = nav.dataset.world;
      if (lastView === 'entry' && ['worlds', 'world'].includes(nav.dataset.nav)) selectedWorldId = entryWorldId;
      go(nav.dataset.nav);
      return;
    }
    const trigger = event.target.closest('[data-toast]');
    if (trigger) toast(trigger.dataset.toast);
  });

  window.addEventListener('hashchange', () => renderView(location.hash.slice(1) || 'sessions'));

  function openSessionEditorForCurrent() {
    const session = currentSession();
    if (!session) {
      toast('先打开一个会话');
      return;
    }
    go('sessions');
    setTimeout(() => openSessionEditor(session), 80);
  }

  $('#contextModelLink').addEventListener('click', openSessionEditorForCurrent);
  $('#castModelLink').addEventListener('click', openSessionEditorForCurrent);

  /* ---------- drawers ---------- */
  menuBtn.addEventListener('click', () => {
    contextRail.classList.remove('open');
    rail.classList.add('open');
    syncScrim();
  });

  contextToggle.addEventListener('click', () => {
    if (window.innerWidth <= 1200) {
      rail.classList.remove('open');
      contextRail.classList.toggle('open');
      syncScrim();
      return;
    }
    const hidden = document.body.classList.toggle('hide-context');
    toast(hidden ? '状态侧栏已收起' : '状态侧栏已展开');
  });

  scrim.addEventListener('click', closeDrawers);
  $('#panelClose').addEventListener('click', closeDrawers);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDrawers();
      $('#worldCreatorModal').hidden = true;
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1200) contextRail.classList.remove('open');
    if (window.innerWidth > 960) rail.classList.remove('open');
    syncScrim();
  });

  /* ---------- font ---------- */
  const fontSizes = [16, 18, 20, 22];
  let fontSizeIndex = 1;
  const fontToggle = $('#fontToggle');

  try {
    const stored = Number(localStorage.getItem('wb-reading-size'));
    const found = fontSizes.indexOf(stored);
    if (found >= 0) fontSizeIndex = found;
  } catch (_) { /* file:// may block storage */ }

  function applyFont(announce) {
    const size = fontSizes[fontSizeIndex];
    document.documentElement.style.setProperty('--reading-size', `${size}px`);
    fontToggle.setAttribute('aria-label', `调整正文字号，当前 ${size} 像素`);
    if (announce) toast(`正文字号 ${size}px`);
    try { localStorage.setItem('wb-reading-size', String(size)); } catch (_) { /* ignore */ }
  }

  applyFont(false);

  fontToggle.addEventListener('click', () => {
    fontSizeIndex = (fontSizeIndex + 1) % fontSizes.length;
    applyFont(true);
  });

  /* ---------- shared renderers ---------- */
  const avatarEl = (card, extra) => el(
    'span',
    `avatar ${card.avatarClass || 'av-custom'}${extra ? ` ${extra}` : ''}`,
    card.avatar || card.name.slice(0, 1),
  );

  function bookCover(world) {
    const cover = el('div', `book-cover ${world.coverClass || 'cover-generic'}`);
    cover.append(el('span', 'book-kicker', '世界书'));
    cover.append(el('span', 'book-title', world.name));
    cover.append(el('span', 'book-genre', world.genre));
    cover.append(el('span', 'book-seal', world.name.slice(0, 1)));
    cover.append(el('span', 'book-badge', '世界'));
    return cover;
  }

  const actionButton = (label, className, dataset) => {
    const button = el('button', className, label);
    button.type = 'button';
    Object.assign(button.dataset, dataset);
    return button;
  };

  function partNode(part) {
    if (part.type === 'speech') {
      const paragraph = el('p', 'speech');
      paragraph.append(el('span', 'speaker', part.speaker || ''));
      paragraph.append(document.createTextNode(`“${part.text}”`));
      return paragraph;
    }
    return el('p', null, part.text);
  }

  function stateNote(note) {
    const wrap = el('div', 'state-note');
    wrap.append(el('span', 'state-mark', '◈'));
    const body = el('div');
    const line = el('div');
    line.append(
      el('strong', null, note.who),
      document.createTextNode(' 对你的印象：'),
      el('em', null, note.impression),
    );
    (note.deltas || []).forEach(([label, value, direction]) => {
      line.append(el('span', `delta ${direction}`, `${label} ${value}`));
    });
    body.append(line);
    wrap.append(body);
    return wrap;
  }

  async function reveal(node, text) {
    if (reduceMotion) {
      node.textContent = text;
      return;
    }
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i += 2) {
      node.textContent += chars.slice(i, i + 2).join('');
      await sleep(14);
    }
  }

  function renderChrome() {
    const session = currentSession();
    const active = Boolean(session && session.status === 'active');
    const unit = session ? unitLabel(session) : '第一单元';
    const turn = session && active ? Math.min(session.story.turn, 12) : 0;
    const view = location.hash.slice(1) || 'sessions';
    const scoped = ['story', 'cast', 'recap'].includes(view);

    if (scoped) {
      $('#topWorldEyebrow').textContent = session ? `${session.worldName} · ${active ? '会话' : '草稿'}` : '世界书 · 会话';
      $('#topSessionName').textContent = session ? session.name : 'Worldbook';
      $('#topProgress').textContent = active ? `${unit} · ${turn} / 12` : (session ? '草稿 · 未开始' : '—');
    } else {
      const globalHeads = {
        sessions: '会话',
        entry: '新建会话',
        worlds: '世界',
        world: '世界',
        cards: '角色',
        settings: '提供商',
      };
      $('#topWorldEyebrow').textContent = '';
      $('#topSessionName').textContent = globalHeads[view] || 'Worldbook';
      $('#topProgress').textContent = '—';
    }

    const scopeHeads = $$('.rail-scope .scope-head span');
    if (scopeHeads[1]) scopeHeads[1].textContent = active ? `${turn} / 12 轮` : '0 / 12 轮';
    const width = `${Math.min(100, (turn / 12) * 100)}%`;
    $$('.rail-scope .scope-track span').forEach((bar) => { bar.style.width = width; });
    const scopeSummary = $('.rail-scope p');
    if (scopeSummary) {
      const roles = session ? session.npcCards.length : 0;
      const nodes = session && active ? session.story.nodes : 0;
      scopeSummary.textContent = `角色 ${roles} / ${roles || 4} · 节点 ${nodes} / 24`;
    }

    const progressLine = $('.unit-progressline span');
    if (progressLine) progressLine.style.width = width;

    renderContext();
  }

  function renderContext() {
    const session = currentSession();
    const actors = $('#contextActors');
    const threads = $('#contextThreads');
    const changes = $('#contextChanges');
    const runtime = $('#contextRuntime');

    if (!session) {
      actors.replaceChildren(el('div', 'empty-inline', '还没有会话。'));
      threads.replaceChildren(el('div', 'empty-inline', '还没有线程。'));
      changes.replaceChildren(el('div', 'empty-inline', '暂无变化。'));
      runtime.replaceChildren();
      $('#sceneCount').textContent = '0 人';
      $('#threadCount').textContent = '0';
      return;
    }

    const sceneActors = session.npcCards.slice(0, 2);
    $('#sceneCount').textContent = `${sceneActors.length} 人`;
    actors.replaceChildren(...sceneActors.map((card) => {
      const row = el('div', 'actor');
      row.append(avatarEl(card));
      const body = el('div', 'actor-body');
      const line = el('div', 'actor-line');
      line.append(el('strong', null, card.name), el('span', 'mood', card.badge || '在场'));
      body.append(line, el('p', null, card.goal || card.role));
      const rel = el('div', 'mini-rel');
      rel.append(el('span', null, '信任'));
      const track = el('div', 'mini-track');
      const fill = document.createElement('i');
      fill.style.width = `${Math.round((card.relations.trust || 0) * 100)}%`;
      track.append(fill);
      rel.append(track, el('b', null, (card.relations.trust || 0).toFixed(2)));
      body.append(rel);
      row.append(body);
      return row;
    }));
    if (!sceneActors.length) actors.append(el('div', 'empty-inline', '这本世界书还没有角色卡。'));

    $('#threadCount').textContent = String(session.threads.length);
    threads.replaceChildren(...session.threads.map((thread) => {
      const row = el('div', 'thread');
      const dot = el('span', `thread-dot${thread.state === '新' ? ' new' : thread.state === '已闭合' ? ' done' : ''}`);
      const body = el('div');
      body.append(el('strong', null, thread.title), el('p', null, thread.note));
      row.append(dot, body);
      return row;
    }));

    const recent = session.changes.slice(-2);
    changes.replaceChildren(...recent.map((change) => {
      const box = el('div');
      const row = el('div', 'change-row');
      row.append(
        el('span', 'change-name', `${change.who} · ${change.label}`),
        el('span', `delta ${change.direction}`, change.value),
      );
      box.append(row, el('p', 'change-reason', change.reason));
      return box;
    }));
    if (!recent.length) changes.append(el('div', 'empty-inline', '本轮暂无变化。'));

    runtime.replaceChildren(...[
      ['模型', session.runtime.model],
      ['本轮调用', session.runtime.calls],
      ['延迟', session.runtime.latency],
      ['降级', `${session.runtime.degrade} 次`],
    ].map(([label, value]) => {
      const row = el('div');
      row.append(el('span', null, label), el('strong', null, value));
      return row;
    }));
    const status = runtime.closest('.panel')?.querySelector('.panel-title span:last-child');
    if (status) status.textContent = session.runtime.status;
  }

  /* ---------- sessions view ---------- */
  function fillCardForm(prefix, card) {
    const set = (suffix, value) => {
      const input = $(`#${prefix}${suffix}`);
      if (input) input.value = value == null ? '' : value;
    };
    set('Name', card.name);
    set('Role', card.role);
    set('Goal', card.goal);
    set('Secret', card.secret);
    set('Traits', traitsTextOf(card));
    set('Relation', card.relation);
    set('Model', card.model);
    set('Fallback', card.fallback);
  }

  function readCardForm(prefix, base) {
    const value = (suffix) => {
      const input = $(`#${prefix}${suffix}`);
      return input ? input.value.trim() : '';
    };
    return normalizeCard({
      id: base.id,
      avatar: base.avatar,
      avatarClass: base.avatarClass,
      badge: base.badge,
      desc: base.desc,
      state: base.state,
      moments: base.moments,
      knowledge: base.knowledge,
      relations: base.relations,
      name: value('Name') || base.name,
      role: value('Role'),
      goal: value('Goal'),
      secret: value('Secret'),
      traits: buildTraitGroups(value('Traits')),
      relation: value('Relation'),
      model: value('Model') || base.model,
      fallback: value('Fallback') || base.fallback,
    });
  }

  function focusSession(id) {
    const session = sessions.find((item) => item.id === id);
    if (!session) return;
    activeSessionId = id;
    editSessionId = '';
    renderSessions();
    renderChrome();
  }

  function startSession(session) {
    if (!session.npcCards.length) {
      toast('这本世界书还没有角色卡，先添加一张');
      selectedWorldId = session.worldId;
      go('worlds');
      return;
    }
    session.status = 'active';
    session.runtime.model = session.card.model;
    activeSessionId = session.id;
    editSessionId = '';
    toast(`已开始「${session.name}」`);
    go('story');
  }

  function sessionActions(session) {
    const wrap = el('div', 'session-hero-actions');
    if (session.status === 'active') {
      wrap.append(
        actionButton('继续阅读', 'primary-btn', { sessionAct: 'resume', session: session.id }),
        actionButton('编辑', 'ghost-btn', { sessionAct: 'edit', session: session.id }),
      );
    } else {
      wrap.append(
        actionButton('开始会话', 'primary-btn', { sessionAct: 'start', session: session.id }),
        actionButton('编辑', 'ghost-btn', { sessionAct: 'edit', session: session.id }),
      );
    }
    return wrap;
  }

  function heroFor(session) {
    const world = worldOf(session);
    const hero = el('div', 'session-hero');
    const coverWrap = el('div', 'session-hero-cover');
    coverWrap.append(bookCover(world));
    const body = el('div', 'session-hero-body');
    const kicker = el('span', 'page-kicker', session.status === 'active' ? '当前会话 · 进行中' : '当前会话 · 草稿');
    const title = el('h2', null, session.name);
    const meta = el('p', 'session-hero-meta', `${session.worldName} · ${session.status === 'active' ? unitLabel(session) : '尚未开始'} · 创建于 ${shortDate(session.createdAt)}`);
    const cardLine = el('p', 'session-hero-card');
    cardLine.append(
      el('span', null, '主角 '),
      document.createTextNode(`${session.card.name} · ${session.card.role || '身份未定'}`),
    );
    if (session.card.goal) cardLine.append(document.createTextNode(` · 公开目标：${session.card.goal}`));
    body.append(kicker, title, meta, cardLine);
    hero.append(coverWrap, body, sessionActions(session));
    return hero;
  }

  function sessionCard(session) {
    const world = worldOf(session);
    const card = el('div', 'session-card');
    const top = el('div', 'session-card-top');
    const thumb = el('div', 'session-thumb');
    thumb.append(bookCover(world));
    const title = el('div', 'session-card-title');
    title.append(
      el('strong', null, session.name),
      el('small', null, `${session.worldName} · ${shortDate(session.createdAt)}`),
    );
    const status = el('span', `status-pill ${session.status === 'draft' ? 'draft' : 'locked'}`, session.status === 'draft' ? '草稿' : '进行中');
    top.append(thumb, title, status);

    const cardLine = el('div', 'session-card-card');
    cardLine.append(el('span', null, '主角 '), document.createTextNode(`${session.card.name} · ${session.card.role || '身份未定'}`));

    const progress = el('div', 'session-progress');
    const fill = document.createElement('i');
    fill.style.width = `${Math.min(100, (session.story.turn / 12) * 100)}%`;
    progress.append(fill);

    const foot = el('div', 'session-card-foot');
    foot.append(
      el('span', null, session.status === 'active' ? `${unitLabel(session)} · ${session.story.turn} / 12 轮` : '尚未开始 · 0 / 12 轮'),
      el('span', null, session.card.model),
    );

    const actions = el('div', 'session-card-actions');
    if (session.status === 'active') {
      actions.append(
        actionButton('打开', 'primary-btn', { sessionAct: 'resume', session: session.id }),
        actionButton('编辑', 'ghost-btn', { sessionAct: 'edit', session: session.id }),
      );
    } else {
      actions.append(
        actionButton('开始', 'primary-btn', { sessionAct: 'start', session: session.id }),
        actionButton('编辑', 'ghost-btn', { sessionAct: 'edit', session: session.id }),
      );
    }

    card.append(top, cardLine, progress, foot, actions);
    return card;
  }

  function sessionEditModelRow(card, label, prefix) {
    const row = el('div', 'model-edit-row');
    const name = el('div', 'model-edit-name');
    const copy = el('div');
    copy.append(el('strong', null, card.name), el('small', null, label));
    name.append(avatarEl(card), copy);
    const modelInput = document.createElement('input');
    modelInput.value = card.model || '';
    modelInput.setAttribute('aria-label', `${card.name} 首选模型`);
    const fallbackInput = document.createElement('input');
    fallbackInput.value = card.fallback || '';
    fallbackInput.setAttribute('aria-label', `${card.name} 备选模型`);
    if (prefix) {
      modelInput.id = `${prefix}Model`;
      fallbackInput.id = `${prefix}Fallback`;
    } else {
      modelInput.dataset.castId = card.id;
      modelInput.dataset.field = 'model';
      fallbackInput.dataset.castId = card.id;
      fallbackInput.dataset.field = 'fallback';
    }
    row.append(name, modelInput, fallbackInput);
    return row;
  }

  function syncSessionEditValues() {
    const model = $('#sessionEditCardModel');
    const fallback = $('#sessionEditCardFallback');
    if (model && model.value.trim()) editProtagonist.model = model.value.trim();
    if (fallback && fallback.value.trim()) editProtagonist.fallback = fallback.value.trim();
    $$('#sessionEditBody [data-cast-id]').forEach((input) => {
      const card = editCast.find((item) => item.id === input.dataset.castId);
      if (!card) return;
      const value = input.value.trim();
      if (!value) return;
      if (input.dataset.field === 'model') card.model = value;
      else card.fallback = value;
    });
  }

  function renderSessionEditBody() {
    const body = $('#sessionEditBody');
    body.replaceChildren();

    const protagonistHead = el('div', 'section-head compact session-edit-section');
    protagonistHead.append(
      el('h3', null, '主角'),
      el('span', null, '内容锁定 · 可调整模型'),
    );
    body.append(protagonistHead);

    const list = el('div', 'model-edit-list');
    list.append(sessionEditModelRow(editProtagonist, '主角', 'sessionEditCard'));
    body.append(list);

    const castHead = el('div', 'section-head compact session-edit-section');
    castHead.append(el('h3', null, '参与角色'), el('span', null, `${editCast.length} 位 · 可调整模型`));
    body.append(castHead);

    if (!editCast.length) {
      body.append(el('div', 'empty-inline session-edit-empty', '这本世界书暂时没有参与角色，保存后会话将不包含其他角色。'));
      return;
    }
    const castList = el('div', 'model-edit-list');
    editCast.forEach((card) => {
      castList.append(sessionEditModelRow(card, card.badge === '通用' ? '通用角色' : '参与角色'));
    });
    body.append(castList);
  }

  function openSessionEditor(session) {
    if (!session) return;
    editSessionId = session.id;
    editProtagonist = normalizeCard(clone(session.card));
    editCast = (session.npcCards || []).map((card) => normalizeCard(clone(card)));
    $('#sessionEditName').value = session.name;
    $('#sessionEditWorldName').textContent = session.worldName || '未命名世界书';
    $('#sessionEditHint').textContent = `${session.name} · 世界书、主角与参与角色内容锁定，仅可调整模型。`;
    renderSessionEditBody();
    $('#sessionEditModal').hidden = false;
    $('#sessionEditName').focus();
  }

  function closeSessionEditor() {
    editSessionId = '';
    editProtagonist = null;
    editCast = [];
    $('#sessionEditModal').hidden = true;
    $('#sessionEditBody').replaceChildren();
  }

  function renderSessions() {
    const focus = currentSession() || sessions[0] || null;
    const hero = $('#currentSession');

    if (!focus) {
      const empty = el('div', 'empty-state');
      empty.append(
        el('strong', null, '还没有会话'),
        actionButton('从世界书开始', 'primary-btn', { nav: 'entry' }),
      );
      hero.replaceChildren(empty);
    } else {
      hero.replaceChildren(heroFor(focus));
    }

    const list = $('#sessionList');
    list.replaceChildren(...sessions.map(sessionCard));
    list.hidden = sessions.length === 0;
  }

  $('#view-sessions').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-session-act]');
    if (!trigger) return;
    const session = sessions.find((item) => item.id === trigger.dataset.session);
    if (!session) return;
    const action = trigger.dataset.sessionAct;
    if (action === 'resume') {
      activeSessionId = session.id;
      if (session.status === 'active') go('story');
      else openSessionEditor(session);
    } else if (action === 'edit') {
      openSessionEditor(session);
    } else if (action === 'start') {
      startSession(session);
    }
  });

  $$('[data-close-session-edit]').forEach((button) => {
    button.addEventListener('click', closeSessionEditor);
  });

  $('#sessionEditForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const session = sessions.find((item) => item.id === editSessionId);
    if (!session) return;
    const name = $('#sessionEditName').value.trim();
    if (!name) {
      toast('给会话起一个名字');
      $('#sessionEditName').focus();
      return;
    }
    syncSessionEditValues();
    session.name = name.slice(0, 40);
    session.card = normalizeCard(clone(editProtagonist));
    session.npcCards = editCast.map((card) => normalizeCard(clone(card)));
    session.runtime.model = session.card.model;
    closeSessionEditor();
    renderSessions();
    renderChrome();
    toast('会话已更新');
  });

  /* ---------- entry view ---------- */
  const ENTRY_CAST_LIMIT = 6;

  function customProtagonistCard(world) {
    const base = (world && world.defaultCard) || WORLDS.fog.defaultCard;
    return normalizeCard({
      name: '无名来客',
      role: '身份未定',
      goal: '',
      secret: '',
      traitsText: '谨慎、观察力强',
      relation: '对陌生人保持距离',
      model: base.model,
      fallback: base.fallback,
      avatar: '客',
      avatarClass: 'av-custom',
      badge: '本会话',
      desc: '只存在于本次会话，不会写入主界面「角色」。',
    });
  }

  function entrySourceCard(world, key) {
    if (key === 'default') return world.defaultCard;
    if (key === 'custom') return customProtagonistCard(world);
    if (key.startsWith('world:')) {
      return (world.cards || []).find((card) => card.id === key.slice(6)) || null;
    }
    if (key.startsWith('generic:')) {
      return GENERIC_CARDS.find((card) => card.id === key.slice(8)) || null;
    }
    return null;
  }

  function entryCardFromKey(world, key) {
    const source = entrySourceCard(world, key);
    if (!source) return null;
    const card = normalizeCard(clone(source));
    card.id = uid('card');
    if (key.startsWith('world:')) {
      card.desc = `来自《${world.name}》角色卡「${source.name}」，修改只作用于本会话。`;
    } else if (key.startsWith('generic:')) {
      card.desc = `来自通用角色卡「${source.name}」，修改只作用于本会话。`;
    } else if (key === 'custom') {
      card.desc = '自定义主角，只存在于本次会话。';
    }
    return card;
  }

  const entryCastPool = (world) => [
    ...(world.cards || []).map((card) => ({ key: `world:${card.id}`, card, label: '本世界', source: world.name })),
    ...GENERIC_CARDS.map((card) => ({ key: `generic:${card.id}`, card, label: '通用', source: '通用角色' })),
  ];

  const defaultEntryCastKeys = (world) => (world.cards || [])
    .slice(0, ENTRY_CAST_LIMIT)
    .map((card) => `world:${card.id}`);

  function entryAvailableCast(world) {
    return entryCastPool(world).filter((option) => option.key !== entryProtagonist);
  }

  function entryCastOptions(world) {
    const available = entryAvailableCast(world);
    entryCastKeys = entryCastKeys
      .filter((key) => available.some((option) => option.key === key))
      .slice(0, ENTRY_CAST_LIMIT);
    return entryCastKeys
      .map((key) => available.find((option) => option.key === key))
      .filter(Boolean);
  }

  function resetEntry() {
    const queued = entryWorldQueued;
    entryWorldQueued = '';
    const session = currentSession();
    const worldId = queued && WORLDS[queued] ? queued : (session && WORLDS[session.worldId] ? session.worldId : 'fog');
    entryWorldId = worldId;
    const world = WORLDS[entryWorldId] || WORLDS.fog;
    entryProtagonist = 'default';
    entryCard = entryCardFromKey(world, entryProtagonist);
    entryCardWorldId = world.id;
    entryCastWorldId = world.id;
    entryCastKeys = defaultEntryCastKeys(world);
    entryNameDirty = false;
    $('#entryProtagonistModal').hidden = true;
    $('#protagonistPickerModal').hidden = true;
    const nameInput = $('#sessionNameInput');
    if (nameInput) nameInput.value = '';
  }

  function openEntryProtagonistModal() {
    if (!entryCard) return;
    const isCustom = entryProtagonist === 'custom';
    $('#entryProtagonistTitle').textContent = isCustom ? '自定义主角' : '编辑主角副本';
    $('#entryCardHint').textContent = isCustom
      ? '填写的主角资料只用于本次会话，不会写入主界面「角色」。'
      : '只修改本会话使用的主角副本，不会写回原角色卡。';
    fillCardForm('entryCard', entryCard);
    $('#entryProtagonistModal').hidden = false;
    $('#entryCardName').focus();
  }

  function closeEntryProtagonistModal() {
    $('#entryProtagonistModal').hidden = true;
  }

  function protagonistOptions(world) {
    return [
      { key: 'default', tag: '预设主角', card: world.defaultCard, note: world.defaultCard.desc || '这本世界书的默认主角。' },
      ...(world.cards || []).map((card) => ({
        key: `world:${card.id}`,
        tag: '本世界角色',
        card,
        note: `来自《${world.name}》的角色卡，可在此会话中作为主角。`,
      })),
      ...GENERIC_CARDS.map((card) => ({
        key: `generic:${card.id}`,
        tag: '通用角色',
        card,
        note: '来自主界面「角色」，可跨世界复用。',
      })),
      { key: 'custom', tag: '自定义主角', card: customProtagonistCard(world), note: '从空白开始填写姓名与设定，不写入角色列表。' },
    ];
  }

  function entryProtagonistNote(world, option) {
    if (option.key === 'custom') return '内容只保存在本次会话，不会写入角色列表。';
    if (option.key === 'default') return `来自《${world.name}》的默认主角；修改只作用于本会话。`;
    if (option.key.startsWith('generic:')) return `来自通用角色卡「${option.card.name}」；修改只作用于本会话。`;
    return `来自《${world.name}》角色卡「${option.card.name}」；修改只作用于本会话。`;
  }

  function renderProtagonistRow(world) {
    const options = protagonistOptions(world);
    const selected = options.find((option) => option.key === entryProtagonist) || options[0];
    const card = entryCard || selected.card;
    const row = el('div', 'protagonist-current-card');
    const copy = el('div', 'protagonist-current-copy');
    copy.append(
      el('span', 'proto-tag', selected.tag),
      el('strong', null, card.name),
      el('span', 'proto-role', card.role || '身份未定'),
      el('p', 'proto-desc', entryProtagonistNote(world, selected)),
    );
    const actions = el('div', 'protagonist-current-actions');
    const edit = el('button', 'ghost-btn', '编辑');
    edit.type = 'button';
    edit.dataset.entryEdit = '';
    const pick = el('button', 'ghost-btn pick-btn', '选择');
    pick.type = 'button';
    pick.dataset.entryPick = '';
    actions.append(edit, pick);
    row.append(avatarEl(card), copy, actions);
    $('#entryProtagonistRow').replaceChildren(row);
  }

  function renderProtagonistPicker(world) {
    $('#protagonistPickerList').replaceChildren(...protagonistOptions(world).map((option) => {
      const active = option.key === entryProtagonist;
      const card = active && entryCard ? entryCard : option.card;
      const button = el('button', 'protagonist-pick-row');
      button.type = 'button';
      button.dataset.pickKey = option.key;
      button.setAttribute('aria-pressed', String(active));
      if (active) button.classList.add('active');
      const copy = el('span', 'pick-copy');
      copy.append(
        el('span', 'proto-tag', option.tag),
        el('strong', null, card.name),
        el('span', 'proto-role', card.role || '身份未定'),
        el('span', 'pick-note', option.note),
      );
      button.append(avatarEl(card), copy, el('span', 'pick-mark', active ? '已选择' : '选择'));
      return button;
    }));
  }

  function openProtagonistPicker() {
    renderProtagonistPicker(WORLDS[entryWorldId] || WORLDS.fog);
    $('#protagonistPickerModal').hidden = false;
    const current = $('#protagonistPickerList .active');
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  function closeProtagonistPicker() {
    $('#protagonistPickerModal').hidden = true;
  }

  function selectEntryProtagonist(key) {
    const world = WORLDS[entryWorldId] || WORLDS.fog;
    if (key !== 'default' && key !== 'custom' && !entrySourceCard(world, key)) return;
    if (key !== entryProtagonist) {
      entryProtagonist = key;
      entryCard = entryCardFromKey(world, key);
      entryCardWorldId = world.id;
    }
    closeProtagonistPicker();
    renderEntry();
    if (key === 'custom') openEntryProtagonistModal();
  }

  function renderEntryCast(world) {
    const selected = entryCastOptions(world);
    const available = entryAvailableCast(world);
    const countNode = $('#entryCastCount');
    countNode.textContent = `${selected.length} / ${ENTRY_CAST_LIMIT}`;
    countNode.classList.toggle('full', selected.length >= ENTRY_CAST_LIMIT);
    if (!available.length) {
      $('#entryCastList').replaceChildren(el('div', 'empty-inline entry-cast-empty', '没有可加入的其他角色。可以先在世界书或主界面「角色」中创建。'));
      return;
    }
    $('#entryCastList').replaceChildren(...available.map((option) => {
      const active = entryCastKeys.includes(option.key);
      const button = el('button', 'cast-card');
      button.type = 'button';
      button.dataset.castKey = option.key;
      button.setAttribute('aria-pressed', String(active));
      if (active) button.classList.add('active');
      const copy = el('span', 'cast-copy');
      copy.append(
        el('strong', null, option.card.name),
        el('small', null, `${option.card.role || '身份未定'} · ${option.label === '通用' ? '通用角色' : option.source}`),
      );
      button.append(avatarEl(option.card), copy, el('span', 'cast-check'));
      return button;
    }));
  }

  function renderEntry() {
    const world = WORLDS[entryWorldId] || WORLDS.fog;
    if (entryCardWorldId !== world.id) {
      if (entryProtagonist !== 'custom') entryCard = entryCardFromKey(world, entryProtagonist) || entryCardFromKey(world, 'default');
      entryCardWorldId = world.id;
    }
    if (!entryCard || !entryCardFromKey(world, entryProtagonist)) {
      entryProtagonist = 'default';
      entryCard = entryCardFromKey(world, 'default');
      entryCardWorldId = world.id;
    }
    if (entryCastWorldId !== world.id) {
      entryCastWorldId = world.id;
      entryCastKeys = defaultEntryCastKeys(world);
    }

    $('#entryTitle').textContent = `从《${world.name}》开始`;
    $('#entryLead').textContent = `${world.hook} 主角与参与角色都以副本进入本会话，修改不会写回原角色卡。`;

    const picker = $('#entryWorldPicker');
    picker.replaceChildren(...allWorlds().map((item) => {
      const chip = el('button', 'world-chip');
      chip.type = 'button';
      chip.dataset.worldPick = item.id;
      chip.append(el('span', null, item.name), el('small', null, `${item.cards.length} 角色`));
      chip.classList.toggle('active', item.id === world.id);
      chip.setAttribute('aria-pressed', String(item.id === world.id));
      return chip;
    }));

    $('#entryWorldName').textContent = world.name;
    $('#entryWorldGenre').textContent = world.genre;
    const tags = $('#entryWorldTags');
    tags.replaceChildren(...(world.tags || []).map((tag) => el('span', 'tag', tag)));

    renderProtagonistRow(world);

    $('#factMode').textContent = `${entryCard.name} · 三条事实带入本会话`;
    const facts = $('#factList');
    facts.replaceChildren(...(world.facts || []).map((fact, index) => {
      const box = el('div', 'fact');
      box.append(el('span', 'fact-num', `事实 0${index + 1}`), el('p', null, fact));
      return box;
    }));

    renderEntryCast(world);

    const nameInput = $('#sessionNameInput');
    nameInput.placeholder = `例如：${world.unit.title}`;
    if (!entryNameDirty) nameInput.value = '';

    renderChrome();
  }

  $('#entryWorldPicker').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-world-pick]');
    if (!chip || !WORLDS[chip.dataset.worldPick] || chip.dataset.worldPick === entryWorldId) return;
    const nextWorld = WORLDS[chip.dataset.worldPick];
    const worldSpecific = entryProtagonist === 'default' || entryProtagonist.startsWith('world:');
    entryWorldId = nextWorld.id;
    if (worldSpecific) entryProtagonist = 'default';
    if (entryProtagonist !== 'default' && entryProtagonist !== 'custom' && !entrySourceCard(nextWorld, entryProtagonist)) {
      entryProtagonist = 'default';
    }
    if (entryProtagonist !== 'custom') {
      entryCard = entryCardFromKey(nextWorld, entryProtagonist) || entryCardFromKey(nextWorld, 'default');
    }
    entryCardWorldId = nextWorld.id;
    entryCastWorldId = nextWorld.id;
    entryCastKeys = defaultEntryCastKeys(nextWorld);
    renderEntry();
  });

  $('#entryProtagonistRow').addEventListener('click', (event) => {
    if (event.target.closest('[data-entry-pick]')) {
      openProtagonistPicker();
      return;
    }
    if (event.target.closest('[data-entry-edit]')) openEntryProtagonistModal();
  });

  $('#protagonistPickerList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-pick-key]');
    if (!button) return;
    selectEntryProtagonist(button.dataset.pickKey);
  });

  $$('[data-close-protagonist-picker]').forEach((button) => {
    button.addEventListener('click', closeProtagonistPicker);
  });

  $$('[data-close-entry-protagonist]').forEach((button) => {
    button.addEventListener('click', closeEntryProtagonistModal);
  });

  $('#entryProtagonistForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!$('#entryCardName').value.trim()) {
      toast('给主角起一个名字');
      $('#entryCardName').focus();
      return;
    }
    entryCard = readCardForm('entryCard', entryCard);
    closeEntryProtagonistModal();
    renderEntry();
    toast(entryProtagonist === 'custom' ? '自定义主角已应用到本会话' : '主角副本已更新 · 不写回原卡');
  });

  $('#entryCastList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-cast-key]');
    if (!button) return;
    const key = button.dataset.castKey;
    const index = entryCastKeys.indexOf(key);
    if (index >= 0) {
      entryCastKeys.splice(index, 1);
    } else {
      if (entryCastKeys.length >= ENTRY_CAST_LIMIT) {
        toast(`最多选择 ${ENTRY_CAST_LIMIT} 位参与角色`);
        return;
      }
      entryCastKeys.push(key);
    }
    renderEntry();
  });

  $('#sessionNameInput').addEventListener('input', () => { entryNameDirty = true; });

  function sessionFromEntry(status) {
    const world = WORLDS[entryWorldId];
    if (!world) return null;
    if (!entryCard || !entryCard.name.trim()) {
      toast('给主角起一个名字');
      openEntryProtagonistModal();
      return null;
    }
    const card = normalizeCard(clone(entryCard));
    const cast = entryCastOptions(world).map((option) => normalizeCard(clone(option.card)));
    const typedName = $('#sessionNameInput').value.trim();
    const name = (typedName || `${world.name} · 未命名会话`).slice(0, 40);
    const session = makeSession(world, card, name, status, todayStamp(), cast);
    sessions.unshift(session);
    activeSessionId = session.id;
    selectedWorldId = world.id;
    entryNameDirty = false;
    return session;
  }

  $('#saveDraft').addEventListener('click', () => {
    const session = sessionFromEntry('draft');
    if (!session) return;
    go('sessions');
    toast(`草稿「${session.name}」已保存`);
  });

  $('#startSession').addEventListener('click', () => {
    const session = sessionFromEntry('active');
    if (!session) return;
    toast(`已开始「${session.name}」`);
    go('story');
  });

  /* ---------- worlds view ---------- */
  function bookCard(world) {
    const button = el('button', 'book-card');
    button.type = 'button';
    button.dataset.worldSelect = world.id;
    button.classList.toggle('active', world.id === selectedWorldId);
    button.append(bookCover(world));
    const count = sessions.filter((session) => session.worldId === world.id).length;
    const meta = el('div', 'book-meta');
    meta.append(el('span', null, `${world.cards.length} 张角色卡`), el('span', null, `${count} 个会话`));
    button.append(meta);
    return button;
  }

  function fillBookGrid(node, list, emptyText) {
    if (!list.length) {
      node.replaceChildren(el('div', 'empty-inline', emptyText));
      return;
    }
    node.replaceChildren(...list.map(bookCard));
  }

  function loreItem(label, text) {
    const item = el('div', 'lore-item');
    item.append(el('span', null, label), el('p', null, text || '未填写'));
    return item;
  }

  function wdField(formGrid, label, key, value, wide) {
    const wrap = el('label', `field${wide ? ' span-2' : ''}`);
    wrap.append(el('span', null, label));
    const input = document.createElement('input');
    input.dataset.wd = key;
    input.value = value || '';
    input.maxLength = 120;
    wrap.append(input);
    formGrid.append(wrap);
  }

  function worldDefaultEditor(world) {
    const card = normalizeCard(clone(world.defaultCard));
    const form = document.createElement('form');
    form.className = 'world-default-editor';
    form.dataset.worldForm = 'save-default';
    const head = el('div', 'card-head');
    head.append(el('h3', null, '编辑默认主角卡'), el('span', null, '只影响之后的新会话'));
    const grid = el('div', 'form-grid');
    wdField(grid, '姓名', 'name', card.name);
    wdField(grid, '身份 / 位置', 'role', card.role);
    wdField(grid, '公开目标', 'goal', card.goal, true);
    wdField(grid, '私有目标（秘密）', 'secret', card.secret, true);
    wdField(grid, '核心特质', 'traits', traitsTextOf(card));
    wdField(grid, '初始关系', 'relation', card.relation);
    wdField(grid, '首选模型', 'model', card.model);
    wdField(grid, '备选模型', 'fallback', card.fallback);
    const actions = el('div', 'wizard-actions');
    actions.append(
      actionButton('取消', 'ghost-btn', { worldAct: 'cancel-default' }),
      (() => { const submit = el('button', 'primary-btn', '保存默认卡'); submit.type = 'submit'; return submit; })(),
    );
    form.append(head, grid, actions);
    return form;
  }

  function renderWorldDetail(world) {
    $('#worldTitle').textContent = world.name;
    $('#worldGenre').textContent = world.genre;
    $('#worldHook').textContent = world.hook;

    $('#worldLore').replaceChildren(
      loreItem('世界规则', world.rules),
      loreItem('地理与势力', world.factions),
      loreItem('初始矛盾', world.conflict),
      loreItem('禁用项', world.bans),
    );

    $('#worldActions').replaceChildren(
      actionButton('以此新建会话', 'primary-btn', { worldAct: 'new-session' }),
      actionButton(worldDefaultEdit === world.id ? '收起默认卡编辑' : '编辑默认主角卡', 'ghost-btn', { worldAct: 'edit-default' }),
    );

    const card = normalizeCard(clone(world.defaultCard));
    const cardBox = el('div', 'default-card-box');
    const cardTop = el('div', 'default-card-top');
    cardTop.append(avatarEl(card));
    const cardCopy = el('div', 'default-card-copy');
    cardCopy.append(el('strong', null, card.name), el('small', null, `${card.role} · 世界默认主角`));
    cardTop.append(cardCopy, el('span', 'status-pill', '默认'));
    const goal = el('p', 'default-card-goal');
    goal.append(el('span', null, '公开目标 · '), document.createTextNode(card.goal || '未填写'));
    const traitRow = el('div', 'tag-row');
    splitList(traitsTextOf(card)).forEach((trait) => traitRow.append(el('span', 'chip', trait)));
    cardBox.append(cardTop, goal, traitRow);

    const box = $('#worldDefaultCard');
    box.replaceChildren(cardBox);
    if (worldDefaultEdit === world.id) box.append(worldDefaultEditor(world));
  }

  function renderCardLibrary(world) {
    const grid = $('#worldCards');
    grid.replaceChildren(...world.cards.map((card) => {
      const item = el('div', 'character-card');
      const top = el('div', 'character-card-top');
      const copy = el('div', 'character-card-name');
      copy.append(el('strong', null, card.name), el('small', null, card.role || '身份未定'));
      top.append(avatarEl(card), copy, el('span', 'status-pill', card.badge || '模板'));
      const goal = el('p', 'character-card-goal');
      goal.append(el('span', null, '公开目标 · '), document.createTextNode(card.goal || '未填写'));
      const model = el('div', 'character-card-model');
      model.append(document.createTextNode('首选 '), el('b', null, card.model), document.createElement('br'), document.createTextNode('备选 '), el('b', null, card.fallback));
      const actions = el('div', 'character-card-actions');
      const buttons = el('div', 'inline-actions');
      buttons.append(
        actionButton('编辑', 'ghost-btn', { cardAct: 'edit', cardId: card.id }),
        actionButton('删除', 'ghost-btn', { cardAct: 'delete', cardId: card.id }),
      );
      actions.append(el('span', null, `${card.moments.length || 0} 个时刻`), buttons);
      item.append(top, goal, model, actions);
      return item;
    }));
  }

  function renderWorlds() {
    const worlds = allWorlds();
    if (!WORLDS[selectedWorldId]) selectedWorldId = worlds[0].id;
    fillBookGrid($('#worldBooks'), worlds, '还没有世界书。新建一本，开始写设定。');
  }

  function renderWorld() {
    const worlds = allWorlds();
    if (!WORLDS[selectedWorldId]) selectedWorldId = worlds[0].id;
    const world = WORLDS[selectedWorldId];
    if (!world) {
      go('worlds');
      return;
    }
    $('#cardCreatorModal').hidden = true;
    renderWorldDetail(world);
    renderCardLibrary(world);
  }

  function openCardCreator(card) {
    resetAiAssist('card');
    editingCardId = card ? card.id : '';
    const world = WORLDS[selectedWorldId];
    const base = card || {
      name: '',
      role: '',
      goal: '',
      secret: '',
      traitsText: '',
      relation: '',
      model: world ? world.defaultCard.model : 'A · narrative-x-32k',
      fallback: world ? world.defaultCard.fallback : 'B · novel-z',
    };
    $('#cardCreatorTitle').textContent = card ? '编辑角色卡' : '新建角色卡';
    $('#cardCreatorModal').hidden = false;
    $('#cardNameInput').value = base.name || '';
    $('#cardRoleInput').value = base.role || '';
    $('#cardGoalInput').value = base.goal || '';
    $('#cardSecretInput').value = base.secret || '';
    $('#cardTraitsInput').value = traitsTextOf(base);
    $('#cardRelationInput').value = base.relation || '';
    $('#cardModelInput').value = base.model;
    $('#cardFallbackInput').value = base.fallback;
    $('#cardNameInput').focus();
  }

  $('#view-worlds').addEventListener('click', (event) => {
    if (event.target.closest('[data-close-world-creator]')) {
      $('#worldCreatorModal').hidden = true;
      return;
    }

    const book = event.target.closest('[data-world-select]');
    if (book) {
      selectedWorldId = book.dataset.worldSelect;
      worldDefaultEdit = '';
      editingCardId = '';
      $('#cardCreatorModal').hidden = true;
      go('world');
    }
  });

  $('#view-world').addEventListener('click', (event) => {
    if (event.target.closest('[data-close-card-creator]')) {
      editingCardId = '';
      $('#cardCreatorModal').hidden = true;
      return;
    }

    const worldAct = event.target.closest('[data-world-act]');
    if (worldAct) {
      const world = WORLDS[selectedWorldId];
      if (!world) return;
      const action = worldAct.dataset.worldAct;
      if (action === 'new-session') {
        entryWorldQueued = world.id;
        go('entry');
      } else if (action === 'edit-default') {
        worldDefaultEdit = worldDefaultEdit === world.id ? '' : world.id;
        renderWorld();
        renderChrome();
      } else if (action === 'cancel-default') {
        worldDefaultEdit = '';
        renderWorld();
        renderChrome();
      }
      return;
    }

    const cardAct = event.target.closest('[data-card-act]');
    if (cardAct) {
      const world = WORLDS[selectedWorldId];
      if (!world) return;
      const card = world.cards.find((item) => item.id === cardAct.dataset.cardId);
      if (!card) return;
      if (cardAct.dataset.cardAct === 'edit') {
        openCardCreator(card);
      } else if (cardAct.dataset.cardAct === 'delete') {
        world.cards = world.cards.filter((item) => item.id !== card.id);
        toast(`已删除角色卡「${card.name}」`);
        if (editingCardId === card.id) {
          editingCardId = '';
          $('#cardCreatorModal').hidden = true;
        }
        renderWorld();
        renderChrome();
      }
    }
  });

  $('#view-world').addEventListener('submit', (event) => {
    const form = event.target.closest('[data-world-form="save-default"]');
    if (!form) return;
    event.preventDefault();
    const world = WORLDS[selectedWorldId];
    if (!world) return;
    const value = (key) => {
      const input = form.querySelector(`[data-wd="${key}"]`);
      return input ? input.value.trim() : '';
    };
    const previous = world.defaultCard;
    world.defaultCard = normalizeCard({
      name: value('name') || previous.name,
      role: value('role'),
      goal: value('goal'),
      secret: value('secret'),
      relation: value('relation'),
      model: value('model') || previous.model,
      fallback: value('fallback') || previous.fallback,
      traits: buildTraitGroups(value('traits')),
      avatar: previous.avatar,
      avatarClass: previous.avatarClass,
      desc: previous.desc,
    });
    worldDefaultEdit = '';
    renderWorld();
    renderChrome();
    toast('默认主角卡已更新 · 只影响之后的新会话');
  });

  $('#openWorldCreator').addEventListener('click', () => {
    resetAiAssist('world');
    $('#worldCreatorModal').hidden = false;
    $('#worldNameInput').focus();
  });

  $('#cancelWorldCreator').addEventListener('click', () => {
    $('#worldCreatorModal').hidden = true;
  });

  $('#worldCreator').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#worldNameInput').value.trim();
    const genre = $('#worldGenreInput').value.trim() || '自定义世界';
    const genreTags = String(genre)
      .split(/[、,，;；·/]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3);
    const hook = $('#worldHookInput').value.trim();
    const rules = $('#worldRulesInput').value.trim();
    const bans = $('#worldBansInput').value.trim();
    if (!name || !hook) {
      toast('至少填写世界名与一句话内核');
      return;
    }

    const world = {
      id: uid('world'),
      name,
      preset: false,
      badge: '自定义',
      genre,
      coverClass: 'cover-generic',
      scene: 'scene-generic',
      hook,
      rules: rules || '尚未定义。进入故事后，规则会随着你的行动逐步显形。',
      factions: '尚未定义。世界会先给出一个模糊的轮廓。',
      conflict: hook,
      bans: bans || '无额外禁用项。',
      tags: genreTags.length ? genreTags : ['自定义'],
      defaultCard: normalizeCard({
        name: '无名来客',
        role: '初到此地',
        goal: hook,
        secret: '你有一个不能说的目的',
        traitsText: '谨慎、善于观察',
        relation: '对当地人保持距离',
        model: 'A · narrative-x-32k',
        fallback: 'B · novel-z',
        avatar: '客',
        avatarClass: 'av-custom',
        desc: '由这本世界书自动生成，可在世界书里修改。',
      }),
      facts: [
        `你对${name}的了解只来自一句传闻：${hook}`,
        '你必须在第一夜结束前找到一个可以信任的人。',
        '你身上有一件不该出现在这里的东西。',
      ],
      unit: { index: '第一单元', title: name, meta: '第一日 · 起始场景' },
      opening: {
        place: name,
        time: '第一日 · 起始场景',
        parts: [
          { type: 'p', text: hook },
          { type: 'p', text: '你站在入口处，还没有人注意到你。' },
          { type: 'p', text: '你需要在有人开口之前，决定自己先相信谁。' },
        ],
        note: null,
      },
      intents: null,
      threads: [
        { title: '初入此地', note: '你还没有找到落脚点。', state: '新' },
        { title: '世界给出的矛盾', note: hook, state: '进行中' },
        { title: '你带来的东西', note: '它还没有被任何人发现。', state: '进行中' },
      ],
      cards: [],
    };

    WORLDS[world.id] = world;
    selectedWorldId = world.id;
    worldDefaultEdit = '';
    $('#worldCreator').reset();
    go('world');
    toast(`世界书《${world.name}》已保存 · 继续添加角色卡`);
  });

  $('#openCardCreator').addEventListener('click', () => openCardCreator(null));

  $('#cancelCardCreator').addEventListener('click', () => {
    editingCardId = '';
    $('#cardCreatorModal').hidden = true;
  });

  $('#cardCreator').addEventListener('submit', (event) => {
    event.preventDefault();
    const world = WORLDS[selectedWorldId];
    if (!world) return;
    const name = $('#cardNameInput').value.trim();
    if (!name) {
      toast('给角色起一个名字');
      return;
    }
    const card = normalizeCard({
      id: editingCardId || undefined,
      name,
      role: $('#cardRoleInput').value.trim(),
      goal: $('#cardGoalInput').value.trim(),
      secret: $('#cardSecretInput').value.trim(),
      traits: buildTraitGroups($('#cardTraitsInput').value),
      relation: $('#cardRelationInput').value.trim(),
      model: $('#cardModelInput').value.trim() || 'A · narrative-x-32k',
      fallback: $('#cardFallbackInput').value.trim() || 'B · novel-z',
      badge: '模板',
    });
    if (editingCardId) {
      const index = world.cards.findIndex((item) => item.id === editingCardId);
      if (index >= 0) world.cards[index] = card;
      toast(`角色卡「${card.name}」已更新 · 只影响之后的新会话`);
    } else {
      world.cards.push(card);
      toast(`角色卡「${card.name}」已保存`);
    }
    editingCardId = '';
    $('#cardCreatorModal').hidden = true;
    renderWorld();
    renderChrome();
  });

  $('#importCards').addEventListener('click', () => {
    const world = WORLDS[selectedWorldId];
    if (!world) return;
    const raw = window.prompt('粘贴角色卡 JSON（单个对象或数组）：');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      let added = 0;
      list.forEach((item) => {
        if (!item || !item.name) return;
        world.cards.push(normalizeCard(item));
        added += 1;
      });
      if (!added) {
        toast('没有找到带 name 的角色卡');
        return;
      }
      renderWorld();
      renderChrome();
      toast(`已导入 ${added} 张角色卡`);
    } catch (_) {
      toast('JSON 解析失败，请检查格式');
    }
  });

  /* ---------- generic character cards ---------- */
  function renderGenericCards() {
    const grid = $('#genericCards');
    grid.hidden = GENERIC_CARDS.length === 0;
    grid.replaceChildren(...GENERIC_CARDS.map((card) => {
      const item = el('div', 'character-card');
      const top = el('div', 'character-card-top');
      const copy = el('div', 'character-card-name');
      copy.append(el('strong', null, card.name), el('small', null, card.role || '身份未定'));
      top.append(avatarEl(card), copy, el('span', 'status-pill', '通用'));
      const goal = el('p', 'character-card-goal');
      goal.append(el('span', null, '公开目标 · '), document.createTextNode(card.goal || '未填写'));
      const model = el('div', 'character-card-model');
      model.append(document.createTextNode('首选 '), el('b', null, card.model), document.createElement('br'), document.createTextNode('备选 '), el('b', null, card.fallback));
      const actions = el('div', 'character-card-actions');
      const buttons = el('div', 'inline-actions');
      buttons.append(
        actionButton('编辑', 'ghost-btn', { genericAct: 'edit', genericId: card.id }),
        actionButton('删除', 'ghost-btn', { genericAct: 'delete', genericId: card.id }),
      );
      actions.append(el('span', null, traitsTextOf(card) || '未填写特质'), buttons);
      item.append(top, goal, model, actions);
      return item;
    }));
  }

  function openGenericCardCreator(card) {
    resetAiAssist('genericCard');
    editingGenericId = card ? card.id : '';
    const base = card || {
      name: '',
      role: '',
      goal: '',
      secret: '',
      traitsText: '',
      relation: '',
      model: 'A · narrative-x-32k',
      fallback: 'B · novel-z',
    };
    $('#genericCardCreatorTitle').textContent = card ? '编辑角色卡' : '新建角色卡';
    $('#genericCardCreatorModal').hidden = false;
    $('#genericCardName').value = base.name || '';
    $('#genericCardRole').value = base.role || '';
    $('#genericCardGoal').value = base.goal || '';
    $('#genericCardSecret').value = base.secret || '';
    $('#genericCardTraits').value = traitsTextOf(base);
    $('#genericCardRelation').value = base.relation || '';
    $('#genericCardModel').value = base.model || 'A · narrative-x-32k';
    $('#genericCardFallback').value = base.fallback || 'B · novel-z';
    $('#genericCardName').focus();
  }

  $('#view-cards').addEventListener('click', (event) => {
    if (event.target.closest('[data-close-generic-card-creator]')) {
      editingGenericId = '';
      $('#genericCardCreatorModal').hidden = true;
      return;
    }
    if (event.target.closest('#openGenericCardCreator')) {
      openGenericCardCreator(null);
      return;
    }
    const trigger = event.target.closest('[data-generic-act]');
    if (!trigger) return;
    const card = GENERIC_CARDS.find((item) => item.id === trigger.dataset.genericId);
    if (!card) return;
    if (trigger.dataset.genericAct === 'edit') {
      openGenericCardCreator(card);
    } else if (trigger.dataset.genericAct === 'delete') {
      const index = GENERIC_CARDS.findIndex((item) => item.id === card.id);
      if (index >= 0) GENERIC_CARDS.splice(index, 1);
      if (editingGenericId === card.id) {
        editingGenericId = '';
        $('#genericCardCreatorModal').hidden = true;
      }
      renderGenericCards();
      toast(`已删除通用角色卡「${card.name}」`);
    }
  });

  $('#cancelGenericCardCreator').addEventListener('click', () => {
    editingGenericId = '';
    $('#genericCardCreatorModal').hidden = true;
  });

  $('#genericCardCreator').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#genericCardName').value.trim();
    if (!name) {
      toast('给角色起一个名字');
      return;
    }
    const card = normalizeCard({
      id: editingGenericId || undefined,
      name,
      role: $('#genericCardRole').value.trim(),
      goal: $('#genericCardGoal').value.trim(),
      secret: $('#genericCardSecret').value.trim(),
      traits: buildTraitGroups($('#genericCardTraits').value),
      relation: $('#genericCardRelation').value.trim(),
      model: $('#genericCardModel').value.trim() || 'A · narrative-x-32k',
      fallback: $('#genericCardFallback').value.trim() || 'B · novel-z',
      avatarClass: 'av-custom',
      badge: '通用',
      desc: '不属于任何世界，可在新建会话时选为主角原型。',
    });
    if (editingGenericId) {
      const index = GENERIC_CARDS.findIndex((item) => item.id === editingGenericId);
      if (index >= 0) GENERIC_CARDS[index] = card;
      toast(`通用角色卡「${card.name}」已更新`);
    } else {
      GENERIC_CARDS.unshift(card);
      toast(`通用角色卡「${card.name}」已保存`);
    }
    editingGenericId = '';
    $('#genericCardCreatorModal').hidden = true;
    renderGenericCards();
  });

  $('#importGenericCards').addEventListener('click', () => {
    const raw = window.prompt('粘贴通用角色卡 JSON（单个对象或数组）：');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      let added = 0;
      list.forEach((item) => {
        if (!item || !item.name) return;
        const card = normalizeCard({ ...item, id: undefined, avatarClass: 'av-custom', badge: '通用' });
        GENERIC_CARDS.unshift(card);
        added += 1;
      });
      if (!added) {
        toast('没有找到带 name 的角色卡');
        return;
      }
      renderGenericCards();
      toast(`已导入 ${added} 张通用角色卡`);
    } catch (_) {
      toast('JSON 解析失败，请检查格式');
    }
  });

  /* ---------- story view ---------- */
  function renderTurnItem(turn) {
    const article = el('article', 'turn');
    article.append(el('div', 'turn-meta', `第 ${turn.round} 轮 · 你的行动`));
    article.append(el('div', 'player-action', turn.action));
    const head = el('div', 'ai-block-head');
    head.append(
      el('span', 'ai-chip small', 'AI 生成'),
      el('span', null, `第 ${turn.round} 轮 · ${turn.mode === 'open' ? '开放世界模式' : '小说模式'}`),
    );
    if (turn.fallback) head.append(el('span', 'ai-fallback', '主模型限流，已切换备选'));
    article.append(head);
    const ai = el('div', 'ai-prose');
    (turn.ai || []).forEach((part) => ai.append(partNode(part)));
    article.append(ai);
    (turn.notes || []).forEach((note) => article.append(stateNote(note)));
    return article;
  }

  function renderStory() {
    const session = currentSession();
    if (!session) return;
    const world = worldOf(session);
    const unit = unitLabel(session);
    const unitIndex = session.story.unitIndex || 1;

    $('#storyKicker').textContent = unit;
    $('#storyUnitTitle').textContent = unitIndex === 1 ? world.unit.title : `${world.name} · ${unit}`;
    $('#storyUnitMeta').textContent = unitIndex === 1 ? world.unit.meta : `${world.name} · ${session.story.turn} / 12 轮`;
    const status = $('.unit-head .unit-status');
    if (status) status.textContent = session.story.completed ? '已完成' : '展开';

    const banner = $('#sceneBanner');
    banner.className = `scene-banner${world.scene ? ` ${world.scene}` : ''}`;
    $('#scenePlace').textContent = world.opening.place;
    $('#sceneTime').textContent = world.opening.time;

    const stream = $('#stream');
    stream.replaceChildren();
    if (unitIndex === 1) {
      (world.opening.parts || []).forEach((part) => stream.append(partNode(part)));
      if (world.opening.note) stream.append(stateNote(world.opening.note));
    } else {
      stream.append(el('p', null, `${unit}从一个未闭合的线程继续。你没有回到原点，只是换了一盏灯。`));
      (session.threads || []).slice(0, 2).forEach((thread) => {
        stream.append(el('p', null, `${thread.title}：${thread.note}`));
      });
    }
    (session.story.turns || []).forEach((turn) => stream.append(renderTurnItem(turn)));

    renderIntents();
    $('#composerInput').value = '';
    autoGrow();
    $('#composerInput').placeholder = session.story.completed
      ? '本单元已完成 · 去复盘开启下一单元'
      : '或者，用自己的话行动……';
    $('.composer-note').textContent = `主角 ${session.card.name} · 首选 ${session.card.model} · 本轮预计 3–5 次调用`;
    refreshStoryControls();
    const progressLine = $('.unit-progressline span');
    if (progressLine) progressLine.style.width = `${Math.min(100, (session.story.turn / 12) * 100)}%`;
  }

  function renderIntents() {
    const session = currentSession();
    const list = $('#intentList');
    if (!session) {
      list.replaceChildren();
      return;
    }
    if (session.story.completed) {
      const done = el('div', 'empty-inline', '本单元 12 轮已走完。前往复盘查看选择与关系变化，或直接开启下一单元。');
      done.append(document.createElement('br'));
      const button = actionButton('去复盘', 'primary-btn', { nav: 'recap' });
      done.append(button);
      list.replaceChildren(done);
      return;
    }
    const intents = worldIntents(worldOf(session));
    list.replaceChildren(...intents.map((intent, index) => {
      const button = el('button', 'intent-card');
      button.type = 'button';
      button.dataset.intent = intent.key;
      const body = el('span', 'intent-body');
      body.append(
        el('span', 'intent-tone', intent.tone),
        el('span', 'intent-title', intent.title),
        el('span', 'intent-hint', intent.hint),
      );
      button.append(
        el('span', 'intent-index', String(index + 1).padStart(2, '0')),
        body,
        el('span', 'intent-arrow', '→'),
      );
      button.disabled = streaming;
      return button;
    }));
  }

  function refreshStoryControls() {
    const session = currentSession();
    const input = $('#composerInput');
    const send = $('.send-btn', $('#composer'));
    const title = $('#choiceTitle');
    const headNote = $('.options-head > span');
    const done = Boolean(session && session.story.completed);
    if (input) {
      input.disabled = done || streaming;
      if (input.placeholder !== (done ? '本单元已完成 · 去复盘开启下一单元' : '或者，用自己的话行动……')) {
        input.placeholder = done ? '本单元已完成 · 去复盘开启下一单元' : (streaming ? '叙事生成中…' : '或者，用自己的话行动……');
      }
    }
    if (send) send.disabled = done || streaming;
    if (title) title.textContent = done ? '本单元已完成' : '你要怎么做？';
    if (headNote) headNote.textContent = done ? '12 轮已走完 · 状态已锁定' : '选项表示意图，不锁死自由输入';
    $$('.intent-card').forEach((button) => { button.disabled = done || streaming; });
  }

  const worldPrompt = (world) => (world.cards[0] ? world.cards[0].name : '对方');

  function customScript(text) {
    const session = currentSession();
    const lead = session && session.npcCards[0] ? session.npcCards[0].name : worldPrompt(currentWorld() || WORLDS.fog);
    return {
      action: text,
      ai: [
        { type: 'p', text: '你把这句话说出口。周围的声音停了一瞬，像被雾吞掉了一半。' },
        { type: 'speech', speaker: lead, text: '你确定要这么做？' },
        { type: 'p', text: '没有人替你回答。你只能自己往前走。' },
      ],
      notes: [{ who: lead, impression: '重新估量你', deltas: [['信任', '+0.01', 'up']] }],
    };
  }

  function applyNotes(session, notes, round) {
    (notes || []).forEach((note) => {
      (note.deltas || []).forEach(([label, value, direction]) => {
        session.changes.push({
          who: note.who,
          label,
          value,
          direction,
          reason: `${note.impression}（第 ${round} 轮）`,
        });
        const card = session.npcCards.find((item) => item.name === note.who);
        const key = REL_KEYS[label];
        if (card && key) {
          const delta = parseFloat(value);
          if (!Number.isNaN(delta)) {
            card.relations[key] = Math.max(0, Math.min(1, Number((card.relations[key] + delta).toFixed(2))));
          }
        }
      });
    });
  }

  async function runTurn(actionText, script) {
    const session = currentSession();
    if (!session || session.status !== 'active' || streaming) return;
    if (session.story.completed) {
      toast('本单元已完成 · 去复盘开启下一单元');
      return;
    }

    streaming = true;
    refreshStoryControls();

    const round = Math.min(session.story.turn + 1, 12);
    const turn = el('article', 'turn');
    turn.append(el('div', 'turn-meta', `第 ${round} 轮 · 你的行动`));
    turn.append(el('div', 'player-action', actionText));

    const head = el('div', 'ai-block-head');
    head.append(
      el('span', 'ai-chip small', 'AI 生成'),
      el('span', null, `第 ${round} 轮 · ${narrativeMode === 'open' ? '开放世界模式' : '小说模式'}`),
    );
    if (script.fallback) head.append(el('span', 'ai-fallback', '主模型限流，已切换备选'));
    turn.append(head);

    const aiBlock = el('div', 'ai-prose');
    aiBlock.append(el('span', 'typing', '叙事生成中'));
    turn.append(aiBlock);

    $('#stream').append(turn);
    turn.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

    await sleep(reduceMotion ? 0 : 520);
    const typing = $('.typing', aiBlock);
    if (typing) typing.remove();

    for (const part of script.ai || []) {
      if (part.type === 'speech') {
        const paragraph = el('p', 'speech');
        paragraph.append(el('span', 'speaker', part.speaker || ''));
        const target = el('span');
        paragraph.append(target);
        aiBlock.append(paragraph);
        await reveal(target, `“${part.text}”`);
      } else {
        const paragraph = el('p');
        aiBlock.append(paragraph);
        await reveal(paragraph, part.text);
      }
      await sleep(reduceMotion ? 0 : 90);
    }

    (script.notes || []).forEach((note) => turn.append(stateNote(note)));

    const record = {
      round,
      mode: narrativeMode,
      action: actionText,
      ai: clone(script.ai || []),
      notes: clone(script.notes || []),
      fallback: Boolean(script.fallback),
    };
    session.story.turns.push(record);
    session.story.turn = round;
    session.story.nodes = Math.min(24, session.story.nodes + 2);
    applyNotes(session, record.notes, round);
    session.runtime.calls = (Math.max(3.2, parseFloat(session.runtime.calls) || 3.2) + 0.2).toFixed(1);
    if (script.fallback) {
      session.runtime.degrade = String((parseInt(session.runtime.degrade, 10) || 0) + 1);
      session.runtime.status = '已降级';
      toast('主模型限流 · 本轮已切换到备选模型');
    }
    if (round >= 12) {
      session.story.completed = true;
      toast('第一单元已完成 · 去复盘查看结算');
    }

    streaming = false;
    renderChrome();
    if (session.story.completed) {
      renderStory();
    } else {
      renderIntents();
      refreshStoryControls();
      const line = $('.unit-progressline span');
      if (line) line.style.width = `${Math.min(100, (round / 12) * 100)}%`;
      const status = $('.unit-head .unit-status');
      if (status) status.textContent = '展开';
    }
  }

  $('#intentList').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-intent]');
    if (!trigger || streaming) return;
    const session = currentSession();
    if (!session) return;
    const intent = worldIntents(worldOf(session)).find((item) => item.key === trigger.dataset.intent);
    if (intent) runTurn(intent.action, intent);
  });

  const composer = $('#composer');
  const composerInput = $('#composerInput');

  function autoGrow() {
    composerInput.style.height = 'auto';
    composerInput.style.height = `${Math.min(composerInput.scrollHeight, 130)}px`;
  }

  composerInput.addEventListener('input', autoGrow);

  composerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    if (streaming) {
      toast('上一轮还在生成，稍等片刻');
      return;
    }
    const session = currentSession();
    if (!session || session.story.completed) return;
    const text = composerInput.value.trim().slice(0, 300);
    if (!text) {
      toast('先写下你想做的事');
      composerInput.focus();
      return;
    }
    composerInput.value = '';
    autoGrow();
    runTurn(text, customScript(text));
  });

  /* ---------- characters view ---------- */
  function renderCharacters() {
    const session = currentSession();
    if (!session) return;
    const cards = session.npcCards;
    $('#charLead').textContent = `${session.name} · 角色快照已锁定；关系与性格时刻随事件更新。`;

    const tabs = $('#charTabs');
    tabs.replaceChildren(...cards.map((card) => {
      const button = el('button', 'char-tab');
      button.type = 'button';
      button.dataset.char = card.id;
      button.setAttribute('role', 'tab');
      button.append(avatarEl(card));
      const copy = el('span');
      copy.append(el('strong', null, card.name), el('small', null, card.role || '身份未定'));
      button.append(copy);
      const active = card.id === selectedCharacterId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      return button;
    }));

    const detail = $('#charDetail');
    const empty = $('#charEmpty');
    if (!cards.length) {
      detail.classList.add('is-empty');
      empty.hidden = false;
      return;
    }
    detail.classList.remove('is-empty');
    empty.hidden = true;

    if (!cards.some((card) => card.id === selectedCharacterId)) selectedCharacterId = cards[0].id;
    const card = cards.find((item) => item.id === selectedCharacterId) || cards[0];

    const avatar = $('#charAvatar');
    avatar.className = `avatar avatar-lg ${card.avatarClass}`;
    avatar.textContent = card.avatar || card.name.slice(0, 1);
    $('#charRole').textContent = card.role;
    $('#charName').textContent = card.name;
    $('#charState').textContent = card.state || `目标：${card.goal || '未定'} · 位置：${card.role}`;
    $('#charModel').textContent = card.model;
    $('#charFallback').textContent = card.fallback;
    const badge = $('.char-hero .status-pill');
    if (badge) badge.textContent = card.badge || '在场';

    const relations = $('#charRelations');
    relations.replaceChildren(...Object.entries(REL_LABELS).map(([key, label]) => {
      const value = card.relations[key] || 0;
      const row = el('div', 'rel-row');
      row.dataset.rel = key;
      const track = el('div', 'rel-track');
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(value * 100)}%`;
      track.append(fill);
      row.append(el('span', null, label), track, el('b', null, value.toFixed(2)));
      return row;
    }));

    const traitGroups = $('#charTraits');
    traitGroups.replaceChildren(...card.traits.map((group) => {
      const box = el('div', `trait-group ${group.key}`);
      const label = el('div', 'trait-label');
      label.append(el('strong', null, group.label), el('span', null, group.hint));
      const chips = el('div', 'trait-chips');
      (group.items || []).forEach(([name, value]) => {
        const chip = el('span', 'chip', name);
        chip.append(el('b', null, Number(value).toFixed(2)));
        chips.append(chip);
      });
      box.append(label, chips);
      return box;
    }));

    const moments = $('#charMoments');
    moments.replaceChildren(...card.moments.map((moment, index) => {
      const item = el('div', `moment${moment.denied ? ' denied' : ''}`);
      const foot = el('div', 'moment-foot');
      foot.append(el('span', 'event-id', moment.event));
      const deny = el('button', 'deny-btn', moment.denied ? '已否定' : '否定');
      deny.type = 'button';
      deny.dataset.moment = String(index);
      deny.disabled = Boolean(moment.denied);
      foot.append(deny);
      item.append(
        el('p', 'moment-quote', moment.quote),
        el('p', 'moment-meta', moment.meta),
        foot,
      );
      return item;
    }));

    const knowledge = $('#charKnowledge');
    knowledge.replaceChildren(...card.knowledge.map((fact) => {
      const item = el('div', 'knowledge');
      const copy = el('div');
      copy.append(el('p', null, fact.text), el('small', null, fact.source));
      item.append(copy, el('span', `secret${fact.secret ? '' : ' open'}`, fact.secret ? '秘密' : '见证'));
      return item;
    }));
  }

  $('#charTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-char]');
    if (!tab) return;
    selectedCharacterId = tab.dataset.char;
    renderCharacters();
    renderChrome();
  });

  $('#charDetail').addEventListener('click', (event) => {
    const button = event.target.closest('.deny-btn');
    if (!button) return;
    const session = currentSession();
    if (!session) return;
    const card = session.npcCards.find((item) => item.id === selectedCharacterId);
    if (!card) return;
    const moment = card.moments[Number(button.dataset.moment)];
    if (!moment || moment.denied) return;
    moment.denied = true;
    renderCharacters();
    toast('已否定该性格时刻 · 置信度将下调（原型）');
  });

  /* ---------- recap ---------- */
  function statBox(label, value, suffix, note) {
    const box = el('div', 'stat');
    const strong = el('strong', null, value);
    if (suffix) strong.append(el('small', null, suffix));
    box.append(el('span', null, label), strong, el('em', null, note));
    return box;
  }

  function renderRecap() {
    const session = currentSession();
    if (!session) return;
    const world = worldOf(session);
    const turns = session.story.turns || [];
    const completed = session.story.completed;

    $('#recapTitle').textContent = `${session.name} · 复盘`;
    $('#recapDesc').textContent = turns.length
      ? `你在《${world.name}》完成了 ${session.story.turn} 轮行动，${session.changes.length} 条关系变化已记录。`
      : `${world.hook} 这个单元还没有行动记录。`;

    const totalRoles = session.npcCards.length;
    $('#recapStats').replaceChildren(
      statBox('实际轮次', String(session.story.turn), '/ 12', completed ? '已结算' : '进行中'),
      statBox('在场角色', String(totalRoles), `/ ${totalRoles}`, '无超限'),
      statBox('使用节点', String(session.story.nodes), '/ 24', '预算内'),
      statBox('未闭线程', String(session.threads.length), '', '下单元回收'),
    );

    const choices = $('#recapChoices');
    if (!turns.length) {
      const item = document.createElement('li');
      item.append(el('div', 'empty-inline', '还没有行动记录。进入故事开始第一轮。'));
      choices.replaceChildren(item);
    } else {
      choices.replaceChildren(...turns.map((turn) => {
        const item = document.createElement('li');
        item.append(el('span', 'time', `第 ${turn.round} 轮`));
        const copy = el('div');
        copy.append(el('strong', null, turn.action));
        const summary = (turn.ai || []).find((part) => part.type === 'p');
        if (summary) {
          const text = summary.text.length > 52 ? `${summary.text.slice(0, 52)}…` : summary.text;
          copy.append(el('p', null, text));
        }
        copy.append(el('span', 'event-id', `evt_${String(turn.round).padStart(3, '0')} · ${turn.mode === 'open' ? '开放世界' : '小说'} · 第 ${turn.round} 轮`));
        item.append(copy);
        return item;
      }));
    }

    const deltas = $('#recapDeltas');
    if (!session.changes.length) {
      deltas.replaceChildren(el('div', 'empty-inline', '还没有关系变化。'));
    } else {
      deltas.replaceChildren(...session.changes.map((change) => {
        const card = session.npcCards.find((item) => item.name === change.who);
        const row = el('div', 'delta-row');
        row.append(card ? avatarEl(card) : el('span', 'avatar av-custom', change.who.slice(0, 1)));
        const copy = el('div');
        copy.append(el('strong', null, `${change.who} · ${change.label}`), el('p', null, change.reason));
        row.append(copy, el('span', `delta ${change.direction}`, change.value));
        return row;
      }));
    }

    const threads = $('#recapThreads');
    threads.replaceChildren(...session.threads.map((thread) => {
      const row = el('div', 'thread');
      const dot = el('span', `thread-dot${thread.state === '新' ? ' new' : thread.state === '已闭合' ? ' done' : ''}`);
      const copy = el('div');
      copy.append(el('strong', null, thread.title), el('p', null, thread.note));
      row.append(dot, copy, el('span', 'thread-state', thread.state || '进行中'));
      return row;
    }));

    const scope = $('#recapScope');
    const pct = (actual, planned) => Math.round(((actual - planned) / planned) * 100);
    const scopeRow = (label, planned, actual, deviation) => {
      const row = el('div', 'scope-tr');
      row.append(el('span', null, label), el('span', null, String(planned)), el('span', null, String(actual)));
      row.append(el('span', Math.abs(deviation) > 20 ? 'warn' : 'ok', `${deviation > 0 ? '+' : ''}${deviation}%`));
      return row;
    };
    const head = el('div', 'scope-tr scope-th');
    ['项目', '计划', '实际', '偏差'].forEach((text) => head.append(el('span', null, text)));
    const calls = parseFloat(session.runtime.calls) || 0;
    scope.replaceChildren(
      head,
      scopeRow('单元轮次', 12, session.story.turn, pct(session.story.turn, 12)),
      scopeRow('使用节点', 24, session.story.nodes, pct(session.story.nodes, 24)),
      scopeRow('激活角色', totalRoles, totalRoles, 0),
      scopeRow('单轮调用', 5, calls, pct(calls, 5)),
    );

    $('#recapNote').textContent = completed
      ? '本单元已结算。未闭线程将至少有一条进入下一单元；世界书模板不受影响。'
      : '单元仍在进行：以上为实时快照，12 轮走完后自动结算。';

    const nextUnit = $('#nextUnit');
    nextUnit.disabled = false;
    nextUnit.textContent = completed
      ? `开启${NUM_CN[(session.story.unitIndex || 1) + 1] || '下一'}单元 →`
      : '继续当前单元 →';
  }

  $('#nextUnit').addEventListener('click', () => {
    const session = currentSession();
    if (!session) return;
    if (!session.story.completed) {
      go('story');
      return;
    }
    session.story.unitIndex = (session.story.unitIndex || 1) + 1;
    session.story.turn = 0;
    session.story.nodes = 0;
    session.story.turns = [];
    session.story.completed = false;
    session.story.mode = narrativeMode;
    toast(`${unitLabel(session)}已开启`);
    go('story');
  });

  /* ---------- providers ---------- */
  const PROVIDER_STORE_KEY = 'wb-providers';
  const BUILTIN_PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com/v1', icon: 'deepseek' },
    { id: 'minimax-token-io', name: 'MiniMax Token Plan (minimax.io)', base: 'https://api.minimax.io/v1', icon: 'minimax' },
    { id: 'minimax-token-cn', name: 'MiniMax Token Plan (minimax.cn)', base: 'https://api.minimax.cn/v1', icon: 'minimax' },
    { id: 'qiniu', name: 'Qiniu', base: 'https://api.qnaigc.com/v1', icon: 'qiniu' },
    { id: 'modelscope', name: 'ModelScope', base: 'https://api-inference.modelscope.cn/v1', icon: 'modelscope' },
    { id: 'minimax', name: 'MiniMax (minimax.cn)', base: 'https://api.minimax.cn/v1', icon: 'minimax' },
  ];

  const PROVIDER_ICONS = {
    deepseek: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.3c2.6-3.8 6.9-5.5 10.4-4.1 2.4 1 4.1 2.9 5.6 4.8-2.3-.2-4.1.9-5.5 2.7-1.4 1.9-3.5 3-5.8 2.9-2.7-.1-4.9-1.9-5.4-4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12.3c.2 2.2-1 3.6-2 4.6 2.6.4 4.4-.7 5.2-2.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.4" cy="11.7" r=".9" fill="currentColor"/></svg>',
    minimax: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9L12 17.9l-1.9-5.3L4.8 10.7l5.3-1.9L12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M18.6 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" fill="currentColor"/></svg>',
    qiniu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8 20 8l-8 4.2L4 8l8-4.2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 12l8 4.2 8-4.2M4 16.1l8 4.2 8-4.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    modelscope: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7.2v9.6L12 21 4 16.8V7.2L12 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.3 12h7.4M12 8.3v7.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    custom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".45"/></svg>',
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function loadCustomProviders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROVIDER_STORE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => (
        item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.base === 'string'
      )).map((item) => ({ ...item, icon: 'custom' }));
    } catch (error) {
      return [];
    }
  }

  function saveCustomProviders() {
    try {
      localStorage.setItem(PROVIDER_STORE_KEY, JSON.stringify(customProviders));
    } catch (error) {
      /* storage may be unavailable in private mode */
    }
  }

  let customProviders = loadCustomProviders();

  function allProviders() {
    return BUILTIN_PROVIDERS.concat(customProviders);
  }

  function providerIcon(kind) {
    return PROVIDER_ICONS[kind] || PROVIDER_ICONS.custom;
  }

  function renderProviderList() {
    const list = $('#providerList');
    if (!list) return;
    list.innerHTML = allProviders().map((provider) => `
      <div class="provider-row">
        <span class="provider-icon">${providerIcon(provider.icon)}</span>
        <span class="provider-row-main">
          <strong>${escapeHtml(provider.name)}</strong>
          <small>${escapeHtml(provider.base)}</small>
        </span>
        <span class="provider-env">环境</span>
      </div>
    `).join('');
  }

  function setProviderError(key, message) {
    const input = $(`#customProvider${key}`);
    const error = $(`#customProvider${key}Error`);
    if (!input || !error) return;
    const field = input.closest('.field');
    if (field) field.classList.toggle('invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    error.textContent = message || '';
    error.hidden = !message;
  }

  function clearProviderErrors() {
    ['Id', 'Name', 'Base'].forEach((key) => setProviderError(key, ''));
  }

  function openCustomProvider() {
    const form = $('#customProviderForm');
    if (form) form.reset();
    clearProviderErrors();
    $('#customProviderModal').hidden = false;
    $('#customProviderId').focus();
  }

  function closeCustomProvider() {
    $('#customProviderModal').hidden = true;
  }

  function renderSettings() {
    const session = currentSession();
    const usage = $$('.usage-grid strong');
    if (usage[0]) usage[0].textContent = session ? '38,420' : '—';
    if (usage[1]) usage[1].textContent = session ? '¥0.42' : '—';
    if (usage[2]) usage[2].textContent = session ? `${session.runtime.degrade} 次` : '—';
    renderProviderList();
  }

  $('#openCustomProvider').addEventListener('click', openCustomProvider);

  $$('#customProviderModal [data-close-provider]').forEach((button) => {
    button.addEventListener('click', closeCustomProvider);
  });

  [
    ['Id', 'customProviderId'],
    ['Name', 'customProviderName'],
    ['Base', 'customProviderBase'],
  ].forEach(([key, id]) => {
    $(`#${id}`).addEventListener('input', (event) => {
      const field = event.target.closest('.field');
      if (field && field.classList.contains('invalid')) setProviderError(key, '');
    });
  });

  $('#customProviderForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const id = $('#customProviderId').value.trim();
    const name = $('#customProviderName').value.trim();
    const base = $('#customProviderBase').value.trim();
    const knownIds = new Set(allProviders().map((provider) => provider.id));
    let firstInvalid = null;

    clearProviderErrors();
    if (!id) {
      setProviderError('Id', '请填写提供商 ID');
      firstInvalid = firstInvalid || $('#customProviderId');
    } else if (!/^[a-z0-9_-]+$/.test(id)) {
      setProviderError('Id', '只能使用小写字母、数字、连字符或下划线');
      firstInvalid = firstInvalid || $('#customProviderId');
    } else if (knownIds.has(id)) {
      setProviderError('Id', '这个提供商 ID 已被使用');
      firstInvalid = firstInvalid || $('#customProviderId');
    }
    if (!name) {
      setProviderError('Name', '请填写显示名称');
      firstInvalid = firstInvalid || $('#customProviderName');
    }
    if (!base) {
      setProviderError('Base', '请填写基础 URL');
      firstInvalid = firstInvalid || $('#customProviderBase');
    } else if (!/^https?:\/\/[^\s]+$/i.test(base)) {
      setProviderError('Base', '需要以 http:// 或 https:// 开头');
      firstInvalid = firstInvalid || $('#customProviderBase');
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    customProviders.push({ id, name, base, icon: 'custom' });
    saveCustomProviders();
    renderProviderList();
    closeCustomProvider();
    toast(`已连接 ${name}`);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#customProviderModal').hidden) {
      closeCustomProvider();
    } else if (!$('#cardCreatorModal').hidden) {
      editingCardId = '';
      $('#cardCreatorModal').hidden = true;
    } else if (!$('#genericCardCreatorModal').hidden) {
      editingGenericId = '';
      $('#genericCardCreatorModal').hidden = true;
    }
  });

  /* ---------- local accounts & isolation ---------- */
  const AUTH_KEY = 'wb-auth';
  const ACCOUNTS_KEY = 'wb-accounts';
  const DATA_PREFIX = 'wb-data:';
  const SEED_STATE = {
    worlds: clone(WORLDS),
    genericCards: clone(GENERIC_CARDS),
    sessions: clone(sessions),
    activeSessionId,
    selectedWorldId,
    entryWorldId,
  };
  let currentAccount = null;
  let authMode = 'login';
  let authBusy = false;
  let saveTimer = 0;

  const storageGet = (key) => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };
  const storageSet = (key, value) => {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  };
  const storageRemove = (key) => {
    try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
  };
  const readJSON = (key, fallback) => {
    const raw = storageGet(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  };

  function readAccounts() {
    const list = readJSON(ACCOUNTS_KEY, []);
    return Array.isArray(list) ? list.filter((item) => item && item.id && item.handle && item.salt && item.hash) : [];
  }

  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    const cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj && cryptoObj.getRandomValues) cryptoObj.getRandomValues(arr);
    else for (let i = 0; i < arr.length; i += 1) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(password, salt) {
    const material = `${salt}:${password}`;
    const cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj && cryptoObj.subtle && window.TextEncoder) {
      const digest = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(material));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    let h1 = 0x811c9dc5;
    let h2 = 0x1000193;
    for (let i = 0; i < material.length; i += 1) {
      const code = material.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0;
    }
    return `fallback-${h1.toString(16)}${h2.toString(16)}`;
  }

  async function ensureSeedAccount() {
    const accounts = readAccounts();
    if (accounts.some((item) => item.handle === 'admin')) return accounts;
    const salt = randomHex(16);
    const hash = await hashPassword('123456', salt);
    const admin = {
      id: accounts.some((item) => item.id === 'user-admin') ? uid('user') : 'user-admin',
      name: '管理员',
      handle: 'admin',
      salt,
      hash,
      createdAt: '2026-11-02',
      demo: true,
    };
    accounts.unshift(admin);
    storageSet(ACCOUNTS_KEY, JSON.stringify(accounts));
    return accounts;
  }

  function setAuthError(message) {
    const box = $('#authError');
    box.textContent = message || '';
    box.hidden = !message;
  }

  function setAuthBusy(busy, label) {
    authBusy = busy;
    const submit = $('#authSubmit');
    submit.disabled = busy;
    submit.textContent = busy ? label : (authMode === 'register' ? '创建账号' : '登录');
  }

  function setAuthMode(mode, options) {
    authMode = mode === 'register' ? 'register' : 'login';
    const register = authMode === 'register';
    const firstRun = !readAccounts().length;
    $('#authTitle').textContent = register ? '创建账号' : '登录';
    $('#authLead').textContent = register
      ? '账号之间的世界书、角色卡与会话互相隔离。'
      : '回到你的世界书与角色卡。';
    $('#authNameField').hidden = !register;
    $('#authConfirmField').hidden = !register;
    $('#authSwitchHint').textContent = register ? '已经有账号？' : '还没有账号？';
    $('#authSwitch').textContent = register ? '去登录' : '创建账号';
    $('#authPassword').setAttribute('autocomplete', register ? 'new-password' : 'current-password');
    $('#authSubmit').textContent = register ? '创建账号' : '登录';
    $('#authDemo').hidden = register || !readAccounts().some((item) => item.handle === 'admin' && item.demo);
    setAuthError('');
    $('#authForm').reset();
    if (options && options.focus !== false) {
      setTimeout(() => { $('#authHandle').focus(); }, 30);
    }
    if (firstRun && register) $('#authName').placeholder = '例如：闻舟';
  }

  function showAuth(mode) {
    document.body.classList.add('auth-locked');
    $('#authScreen').hidden = false;
    setAuthMode(mode || (readAccounts().length ? 'login' : 'register'), { focus: false });
    $('#authScreen').scrollTop = 0;
    setTimeout(() => { $('#authHandle').focus(); }, 60);
  }

  function updateAccountChip() {
    if (!currentAccount) return;
    $('#accountName').textContent = currentAccount.name;
    $('#accountHandle').textContent = `@${currentAccount.handle}`;
    $('#accountAvatar').textContent = Array.from(currentAccount.name)[0] || '—';
  }

  function hydrateAccount(account) {
    const saved = readJSON(`${DATA_PREFIX}${account.id}`, null);
    const data = saved && saved.worlds && typeof saved.worlds === 'object' ? saved : null;
    WORLDS = data ? data.worlds : clone(SEED_STATE.worlds);
    GENERIC_CARDS = data && Array.isArray(data.genericCards) ? data.genericCards : clone(SEED_STATE.genericCards);
    sessions = data && Array.isArray(data.sessions) ? data.sessions : clone(SEED_STATE.sessions);

    const worldIds = Object.keys(WORLDS);
    const fallbackWorld = worldIds[0] || '';
    activeSessionId = data && sessions.some((item) => item.id === data.activeSessionId)
      ? data.activeSessionId
      : (sessions[0] ? sessions[0].id : '');
    selectedWorldId = data && WORLDS[data.selectedWorldId] ? data.selectedWorldId : fallbackWorld;
    entryWorldId = data && WORLDS[data.entryWorldId] ? data.entryWorldId : selectedWorldId;

    editSessionId = '';
    editProtagonist = null;
    editCast = [];
    entryProtagonist = 'default';
    entryNameDirty = false;
    entryWorldQueued = '';
    narrativeMode = 'novel';
    streaming = false;
    selectedCharacterId = '';
    worldDefaultEdit = '';
    editingCardId = '';
    editingGenericId = '';
    $('#cardCreatorModal').hidden = true;
    $('#genericCardCreatorModal').hidden = true;
    $('#entryProtagonistModal').hidden = true;
    $('#protagonistPickerModal').hidden = true;
    $('#sessionEditModal').hidden = true;

    const baseWorld = WORLDS[entryWorldId] || WORLDS[selectedWorldId];
    entryCard = baseWorld ? entryCardFromKey(baseWorld, entryProtagonist) : null;
    entryCardWorldId = entryWorldId;
    entryCastKeys = baseWorld ? defaultEntryCastKeys(baseWorld) : [];
    entryCastWorldId = entryWorldId;
  }

  function persistAccount() {
    if (!currentAccount) return;
    storageSet(`${DATA_PREFIX}${currentAccount.id}`, JSON.stringify({
      version: 1,
      worlds: WORLDS,
      genericCards: GENERIC_CARDS,
      sessions,
      activeSessionId,
      selectedWorldId,
      entryWorldId,
    }));
  }

  function enterAccount(account, options) {
    currentAccount = account;
    hydrateAccount(account);
    storageSet(AUTH_KEY, account.id);
    updateAccountChip();
    $('#authForm').reset();
    setAuthError('');
    document.body.classList.remove('auth-locked');
    $('#authScreen').hidden = true;
    const wanted = location.hash.slice(1);
    renderView(viewNames.includes(wanted) ? wanted : 'sessions');
    if (options && options.greet) toast(`已登录 · ${account.name}`);
  }

  function signOut() {
    persistAccount();
    currentAccount = null;
    storageRemove(AUTH_KEY);
    history.replaceState(null, '', `${location.pathname}${location.search}#sessions`);
    showAuth('login');
  }

  function scheduleSave() {
    if (!currentAccount) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistAccount, 300);
  }

  ['click', 'input', 'change', 'keydown'].forEach((type) => {
    document.addEventListener(type, scheduleSave, true);
  });
  window.addEventListener('pagehide', () => persistAccount());

  $('#logoutBtn').addEventListener('click', signOut);
  $('#authSwitch').addEventListener('click', () => {
    setAuthMode(authMode === 'register' ? 'login' : 'register');
  });

  $('#authDemoFill').addEventListener('click', () => {
    if (authMode !== 'login') setAuthMode('login', { focus: false });
    $('#authHandle').value = 'admin';
    $('#authPassword').value = '123456';
    setAuthError('');
    $('#authSubmit').focus();
  });

  $('#authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (authBusy) return;
    setAuthError('');
    const handle = $('#authHandle').value.trim();
    const password = $('#authPassword').value;
    const accounts = readAccounts();

    if (!handle || /\s/.test(handle)) {
      setAuthError('请输入不包含空格的账号');
      return;
    }
    if (!password) {
      setAuthError('请输入密码');
      return;
    }

    if (authMode === 'register') {
      const name = $('#authName').value.trim() || handle;
      const confirm = $('#authConfirm').value;
      if (handle.length < 2) {
        setAuthError('账号至少 2 个字符');
        return;
      }
      if (accounts.some((item) => item.handle === handle.toLowerCase())) {
        setAuthError('这个账号已存在，直接登录或换一个');
        return;
      }
      if (password.length < 6) {
        setAuthError('密码至少 6 位');
        return;
      }
      if (password !== confirm) {
        setAuthError('两次输入的密码不一致');
        return;
      }
      setAuthBusy(true, '创建中…');
      try {
        const salt = randomHex(16);
        const hash = await hashPassword(password, salt);
        const account = {
          id: uid('user'),
          name,
          handle: handle.toLowerCase(),
          salt,
          hash,
          createdAt: new Date().toISOString(),
        };
        accounts.push(account);
        if (!storageSet(ACCOUNTS_KEY, JSON.stringify(accounts))) {
          setAuthError('本地存储不可用，无法创建账号');
          return;
        }
        enterAccount(account, { greet: true });
      } catch (_) {
        setAuthError('创建失败，请重试');
      } finally {
        setAuthBusy(false);
      }
      return;
    }

    const account = accounts.find((item) => item.handle === handle.toLowerCase());
    if (!account) {
      setAuthError('账号不存在，先创建一个');
      return;
    }
    setAuthBusy(true, '验证中…');
    try {
      const hash = await hashPassword(password, account.salt);
      if (hash !== account.hash) {
        setAuthError('密码不正确');
        return;
      }
      enterAccount(account, { greet: true });
    } finally {
      setAuthBusy(false);
    }
  });

  async function bootAuth() {
    await ensureSeedAccount();
    const accounts = readAccounts();
    const accountId = storageGet(AUTH_KEY);
    const account = accounts.find((item) => item.id === accountId);
    if (account) enterAccount(account);
    else showAuth(accounts.length ? 'login' : 'register');
  }

  /* ---------- ai assist ---------- */
  const AI_BANS = '不出现真实宗教与真实人物；不写未成年人恋爱；不提供现实可执行的危险细节。';
  const AI_TRAITS = ['冷静', '谨慎', '温柔', '暴躁', '怕冷', '记仇', '护短', '寡言', '健谈', '好奇', '守时', '失眠', '敏锐', '嘴硬', '耐心', '克制', '多疑', '孤僻', '果断', '善良'];

  function aiHas(text, ...words) {
    return words.some((word) => text.includes(word));
  }

  function aiPickedName(text, fallbackName) {
    const quoted = text.match(/[《「“"]([^》」”"]{2,12})[》」”"]/);
    if (quoted) return quoted[1].trim();
    const named = text.match(/(?:叫做|叫|名为|名字是)\s*([\u4e00-\u9fa5A-Za-z0-9]{2,10})/);
    if (named) return named[1];
    return fallbackName;
  }

  function worldAiDraft(history, previous) {
    const text = history.join(' ');
    let draft;
    if (aiHas(text, '海', '港', '潮', '船', '岛', '灯塔', '渡口')) {
      draft = { name: '落潮港', genre: '航海 · 悬疑 · 低魔', hook: '一座每天退潮后都会多出一条街的港口城市。', rules: '潮汐决定城市的形状：退潮时出现的街道会在下一次涨潮时消失；从消失街区带走的东西却会留下。' };
    } else if (aiHas(text, '雪', '山', '冬', '寒', '岭', '封山')) {
      draft = { name: '雪岭驿', genre: '山野 · 生存 · 民俗', hook: '封山前的最后一夜，雪线会带走一个被遗忘的名字。', rules: '严寒会放大饥饿与猜疑；火与盐是少数能驱散异常的东西；说出口的承诺不能收回。' };
    } else if (aiHas(text, '林', '森', '村', '庙', '灯', '祭祀')) {
      draft = { name: '林灯村', genre: '民俗 · 悬疑 · 低魔', hook: '村里的灯只在有人失踪时亮起。', rules: '灯灭之前必须有人说出一个真实的名字；森林不接受谎言；被灯照到的人会忘记一件重要的事。' };
    } else if (aiHas(text, '星', '太空', '舰', '机械', '赛博', '未来', '飞船', '殖民地')) {
      draft = { name: '寂静环', genre: '科幻 · 悬疑 · 密闭', hook: '一座环绕死星的殖民站，每天都在收到来自自己的求救信号。', rules: '技术必须付出能量或记忆作为代价；真空与舱门不会为剧情让步；AI 不能凭空知道舱外发生的事。' };
    } else if (aiHas(text, '沙', '漠', '商队', '驿', '公路')) {
      draft = { name: '白沙驿', genre: '荒漠 · 公路 · 悬疑', hook: '沙暴过后，驿站门口多了一队没有影子的商旅。', rules: '水比钱重要；沙暴会抹去道路与脚印；每个商队都带着一件不能打开的东西。' };
    } else if (aiHas(text, '城', '街', '巷', '雾', '夜', '记忆')) {
      draft = { name: '无央城', genre: '都市 · 悬疑 · 低魔', hook: '一座地图会在夜里改写的城市，没有人记得原来的路。', rules: '地名只在被说出口时存在；记忆可以交易，但价格由对方决定；城市不会强迫任何人留下。' };
    } else if (previous) {
      draft = { ...previous };
    } else {
      draft = { name: '无央城', genre: '悬疑 · 低魔 · 开放世界', hook: '一座地图会在夜里改写的城市，没有人记得原来的路。', rules: '地名只在被说出口时存在；记忆可以交易，但价格由对方决定；城市不会强迫任何人留下。' };
    }

    if (aiHas(text, '黑暗', '残酷', '绝望', '压抑', '克苏鲁', '恐怖')) {
      const darkRule = '基调偏冷峻；每次选择都应有可见代价。';
      if (!draft.rules.includes(darkRule)) draft.rules += ` ${darkRule}`;
    } else if (aiHas(text, '温暖', '治愈', '轻松', '日常', '幽默')) {
      const warmRule = '冲突留有和解出口，避免不可逆的伤害。';
      if (!draft.rules.includes(warmRule)) draft.rules += ` ${warmRule}`;
    }

    draft.name = aiPickedName(text, draft.name);
    draft.bans = AI_BANS;
    return draft;
  }

  function cardAiDraft(history, previous) {
    const text = history.join(' ');
    let draft;
    if (aiHas(text, '商', '账房', '货', '钱', '买卖')) {
      draft = aiHas(text, '海', '港', '船', '渡')
        ? { name: '韩渡', role: '商船账房 · 落潮渡口', goal: '查清货单上不存在的那批货', secret: '东家的遗书在你手里', traits: '谨慎、怕冷、算得清', relation: '对码头管事半信半疑' }
        : { name: '韩渡', role: '商队账房 · 南边来', goal: '把商队和货完整带过雪岭', secret: '货箱里藏着一封东家的遗书', traits: '谨慎、怕冷、算得清', relation: '对守夜人半信半疑' };
    } else if (aiHas(text, '调查', '侦探', '案', '线索', '失踪', '警')) {
      draft = { name: '陆见', role: '临时调查员 · 码头档案室', goal: '在下一桩失踪案发生前找到规律', secret: '你认识第一个失踪者，却没有上报', traits: '冷静、多疑、守时', relation: '对守夜人半信半疑' };
    } else if (aiHas(text, '海', '船', '港', '渡', '潮')) {
      draft = { name: '顾潮', role: '退役领航员 · 落潮渡口', goal: '查清十年前失踪的货船', secret: '那晚是你改了航标灯', traits: '克制、记路、失眠', relation: '对港口老人保持警惕' };
    } else if (aiHas(text, '医', '药', '伤', '病', '治疗')) {
      draft = { name: '闻栀', role: '游方医者 · 西市药棚', goal: '找到压制怪病的药方', secret: '你曾因误诊失去一个病人', traits: '温和、敏锐、嘴硬', relation: '对同行保持距离' };
    } else if (aiHas(text, '雪', '山', '猎', '灯', '守')) {
      draft = { name: '阿勒', role: '守灯人 · 雪线以北', goal: '让山口的灯烧到天亮', secret: '你见过灯灭之后的东西', traits: '寡言、耐寒、认死理', relation: '对过路人先观察再开口' };
    } else if (aiHas(text, '梦', '巫', '通灵', '神', '预兆')) {
      draft = { name: '苏晚', role: '药铺掌柜 · 城中', goal: '找到梦里反复出现的那口井', secret: '你能听见别人遗忘的名字', traits: '温柔、敏锐、守口', relation: '对陌生人的梦格外在意' };
    } else if (previous) {
      draft = { ...previous };
    } else {
      draft = { name: '宁川', role: '初到此地的旅人', goal: '找到一封没有署名的信的主人', secret: '你记得一段不属于自己的过去', traits: '谨慎、善于观察、嘴硬', relation: '对当地人保持距离' };
    }

    const picked = AI_TRAITS.filter((word) => text.includes(word)).slice(0, 4);
    if (picked.length) {
      draft.traits = [...new Set([...picked, ...draft.traits.split('、')])].slice(0, 4).join('、');
    }
    draft.name = aiPickedName(text, draft.name);
    return draft;
  }

  const AI_ASSISTS = {
    world: {
      modal: '#worldCreatorModal',
      form: '#worldCreator',
      pane: '#worldAiPane',
      firstField: '#worldNameInput',
      placeholder: '例如：一座每天退潮后都会多出一条街的港口城市，航海、悬疑、低魔。',
      intro: '描述你想要的世界：时代、地点、基调，以及希望出现或避免的元素。',
      fields: [
        ['name', '世界名', '#worldNameInput'],
        ['genre', '类型与基调', '#worldGenreInput'],
        ['hook', '一句话内核', '#worldHookInput'],
        ['rules', '世界规则', '#worldRulesInput'],
        ['bans', '禁用项', '#worldBansInput'],
      ],
      generate: worldAiDraft,
      onClose: () => { $('#worldCreatorModal').hidden = true; },
    },
    card: {
      modal: '#cardCreatorModal',
      form: '#cardCreator',
      pane: '#cardAiPane',
      firstField: '#cardNameInput',
      placeholder: '例如：一个在雾港查失踪案的外乡账房，谨慎、怕冷、算得清。',
      intro: '描述这个角色：身份、想要什么、藏着什么秘密，以及和谁有什么关系。',
      fields: [
        ['name', '姓名', '#cardNameInput'],
        ['role', '身份 / 位置', '#cardRoleInput'],
        ['goal', '公开目标', '#cardGoalInput'],
        ['secret', '私有目标', '#cardSecretInput'],
        ['traits', '核心特质', '#cardTraitsInput'],
        ['relation', '初始关系', '#cardRelationInput'],
      ],
      generate: cardAiDraft,
      onClose: () => {
        editingCardId = '';
        $('#cardCreatorModal').hidden = true;
      },
    },
    genericCard: {
      modal: '#genericCardCreatorModal',
      form: '#genericCardCreator',
      pane: '#genericCardAiPane',
      firstField: '#genericCardName',
      placeholder: '例如：一个能听见别人遗忘名字的游方医者，温和、敏锐、守口。',
      intro: '描述这个角色：身份、想要什么、藏着什么秘密，以及和谁有什么关系。',
      fields: [
        ['name', '姓名', '#genericCardName'],
        ['role', '身份 / 位置', '#genericCardRole'],
        ['goal', '公开目标', '#genericCardGoal'],
        ['secret', '私有目标', '#genericCardSecret'],
        ['traits', '核心特质', '#genericCardTraits'],
        ['relation', '初始关系', '#genericCardRelation'],
      ],
      generate: cardAiDraft,
      onClose: () => {
        editingGenericId = '';
        $('#genericCardCreatorModal').hidden = true;
      },
    },
  };

  const AI_MOUNTS = {};

  function resetAiAssist(key) {
    if (AI_MOUNTS[key]) AI_MOUNTS[key].reset();
  }

  function mountAiAssist(key, config) {
    const root = $(config.pane);
    if (!root) return;
    root.innerHTML = `
      <div class="card-head ai-assist-head">
        <div>
          <h3>AI 帮忙生成</h3>
          <span>描述需求，生成可编辑的草稿</span>
        </div>
        <button type="button" class="modal-close" data-ai-close aria-label="关闭">关闭</button>
      </div>
      <div class="ai-assist-log" role="log" aria-live="polite"></div>
      <div class="ai-assist-compose">
        <textarea rows="2" aria-label="描述你的需求" placeholder="${config.placeholder}"></textarea>
        <button type="button" class="primary-btn ai-assist-send">发送</button>
      </div>
      <p class="ai-assist-note">生成结果是草稿，填入表单后仍可逐项修改；不会自动保存。</p>
      <div class="wizard-actions">
        <button type="button" class="ghost-btn ai-assist-back">返回表单</button>
        <button type="button" class="primary-btn ai-assist-apply" disabled>填入表单</button>
      </div>`;

    const form = $(config.form);
    const log = $('.ai-assist-log', root);
    const input = $('textarea', root);
    const sendBtn = $('.ai-assist-send', root);
    const applyBtn = $('.ai-assist-apply', root);
    const state = { history: [], draft: null, busy: false, timer: 0, started: false };

    function syncSend() {
      sendBtn.disabled = state.busy || !input.value.trim();
    }

    function scrollLog() {
      log.scrollTop = log.scrollHeight;
    }

    function appendBubble(role, text, draft) {
      const row = el('div', `ai-assist-msg ${role}`);
      const bubble = el('div', 'ai-assist-bubble');
      bubble.append(el('p', null, text));
      if (draft) {
        const params = el('div', 'ai-assist-params');
        config.fields.forEach(([field, label]) => {
          if (!draft[field]) return;
          const item = el('div', 'ai-assist-param');
          item.append(el('span', null, label), el('strong', null, draft[field]));
          params.append(item);
        });
        bubble.append(params);
      }
      row.append(el('span', 'ai-assist-avatar', role === 'user' ? '你' : 'AI'), bubble);
      log.append(row);
      scrollLog();
    }

    function appendTyping() {
      const row = el('div', 'ai-assist-msg ai');
      const bubble = el('div', 'ai-assist-bubble ai-assist-typing');
      bubble.append(el('span', null, '正在整理参数'), el('i'), el('i'), el('i'));
      row.append(el('span', 'ai-assist-avatar', 'AI'), bubble);
      log.append(row);
      scrollLog();
      return row;
    }

    function send() {
      const text = input.value.trim();
      if (!text || state.busy) return;
      state.history.push(text);
      state.busy = true;
      state.started = true;
      appendBubble('user', text);
      input.value = '';
      syncSend();
      const typing = appendTyping();
      clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        typing.remove();
        state.draft = config.generate(state.history, state.draft);
        appendBubble('ai', '已按你的描述整理出一版草稿，可以直接填入表单，再逐项修改。', state.draft);
        applyBtn.disabled = false;
        state.busy = false;
        syncSend();
      }, 750);
    }

    function showForm() {
      root.hidden = true;
      form.hidden = false;
      const first = $(config.firstField);
      if (first) first.focus();
    }

    function reset() {
      clearTimeout(state.timer);
      state.history = [];
      state.draft = null;
      state.busy = false;
      state.started = false;
      log.replaceChildren();
      input.value = '';
      applyBtn.disabled = true;
      root.hidden = true;
      form.hidden = false;
      syncSend();
    }

    $('.ai-assist-send', root).addEventListener('click', send);
    $('.ai-assist-back', root).addEventListener('click', showForm);
    $('[data-ai-close]', root).addEventListener('click', config.onClose);
    applyBtn.addEventListener('click', () => {
      if (!state.draft) return;
      config.fields.forEach(([field, , selector]) => {
        const node = $(selector);
        if (node) node.value = state.draft[field] || '';
      });
      showForm();
      toast('已填入生成结果 · 可继续修改');
    });

    input.addEventListener('input', syncSend);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        send();
      }
    });

    $(`[data-ai-open="${key}"]`).addEventListener('click', () => {
      form.hidden = true;
      root.hidden = false;
      if (!state.started) {
        state.started = true;
        appendBubble('ai', config.intro);
      }
      input.focus();
    });

    syncSend();
    AI_MOUNTS[key] = { reset };
  }

  Object.entries(AI_ASSISTS).forEach(([key, config]) => mountAiAssist(key, config));

  /* ---------- init ---------- */
  applyFont(false);
  bootAuth();
})();
