/**
 * 托福阅读「补全单词」原创短文（自编）。
 * 挖空由 src/lib/cloze.ts 按固定规则生成；targets 中的词形必须正好落在挖空位置上（由测试保证）。
 * targets 对应生词本里的词条（entryId）和义项（senseId），clue 在提交后显示。
 * alt 是拼写复习用的另一句，拼错后下次优先用它来考。
 */

export interface PassageTarget {
  /** 文中实际词形（小写） */
  form: string;
  entryId: string;
  senseId: string;
  clue: string;
  alt: { text: string; form?: string; zh?: string }[];
}

export interface Passage {
  id: string;
  /** 标题不写英文目标词，也不写中文释义，避免提前泄露答案 */
  title: string;
  text: string;
  zh: string;
  targets: PassageTarget[];
}

export const PASSAGES: Passage[] = [
  {
    id: "p1-landforms",
    title: "第 1 篇 · 地球科学",
    text:
      "Many of the landscapes we admire today were shaped by moving ice. Thousands of years ago, glaciers carved deep valleys through hard rock. Their slow erosion removed huge amounts of earth. When the climate warmed, the ice melted, and the sea flooded many of these low areas. This created the long, narrow bays now called fjords, which still attract visitors from around the world. Scientists study these shapes to learn how ice moved in the past.",
    zh: "今天许多令人赞叹的地貌是由移动的冰塑造的。几千年前，冰川在坚硬的岩石中刻出深深的山谷，缓慢的侵蚀带走了大量泥土。气候变暖后冰融化，海水淹没了许多低地，形成了狭长的海湾，也就是峡湾。科学家研究这些地形，以了解过去冰是怎样移动的。",
    targets: [
      {
        form: "carved",
        entryId: "carve",
        senseId: "carve#1",
        clue: "「Thousands of years ago」说明是过去发生的事，所以动词要用过去式 carved；carve 在这里指冰川「切削、刻出」山谷。",
        alt: [
          { text: "Over millions of years, the river carved a deep canyon.", zh: "几百万年间，这条河刻出了一道深峡谷。" },
          { text: "The artist carved a small bird out of wood.", zh: "艺术家用木头雕了一只小鸟。" },
        ],
      },
      {
        form: "valleys",
        entryId: "valleys",
        senseId: "valleys#1",
        clue: "前面有形容词 deep，又是 carved 的宾语，所以要名词；没有冠词 a，用复数 valleys「山谷」。",
        alt: [
          { text: "Small farms were spread across the green valleys.", zh: "小农场散布在绿色的山谷里。" },
          { text: "Cold air often collects in mountain valleys at night.", zh: "夜里冷空气常常聚集在山谷中。" },
        ],
      },
      {
        form: "erosion",
        entryId: "erosion",
        senseId: "erosion#wear",
        clue: "前面是物主代词 Their 和形容词 slow，后面紧跟谓语 removed，所以这里要名词 erosion「侵蚀」，不能用动词 erode。",
        alt: [{ text: "Planting grass on the slope helps prevent erosion.", zh: "在坡上种草有助于防止水土侵蚀。" }],
      },
    ],
  },
  {
    id: "p2-reefs",
    title: "第 2 篇 · 生物学",
    text:
      "Coral reefs are among the richest ecosystems on Earth. Each one is built by marine animals that live in large colonies. They secrete a hard material that slowly builds up over time. Over many centuries, it forms a solid structure that thousands of fish and other creatures depend on for food and shelter. Because these animals need warm, clear, shallow water, reefs are easily damaged when the ocean heats up or becomes polluted.",
    zh: "珊瑚礁是地球上物种最丰富的生态系统之一。每座珊瑚礁都由成群生活的海洋动物建造。它们分泌一种坚硬的物质，随时间慢慢堆积。几百年后，这些物质形成坚固的结构，成千上万的鱼和其他生物靠它获取食物、躲避危险。这些动物需要温暖、清澈的浅水，所以海水变热或受污染时，珊瑚礁很容易受损。",
    targets: [
      {
        form: "marine",
        entryId: "marine",
        senseId: "marine#1",
        clue: "放在名词 animals 前作定语，要形容词 marine「海洋的」；整段讲珊瑚礁，指生活在海里的动物，不是名词「海军陆战队士兵」。",
        alt: [{ text: "Plastic waste harms many marine animals.", zh: "塑料垃圾伤害许多海洋动物。" }],
      },
      {
        form: "colonies",
        entryId: "colony",
        senseId: "colony#group",
        clue: "介词 in 和形容词 large 之后要名词；没有冠词 a，用复数 colonies。这里指生物「群体」，不是「殖民地」。",
        alt: [{ text: "Honeybees live in colonies of many thousands.", form: "colonies", zh: "蜜蜂以数万只为一群生活。" }],
      },
      {
        form: "secrete",
        entryId: "secrete",
        senseId: "secrete#1",
        clue: "主语 They 是复数，整段用一般现在时陈述科学事实，所以用原形 secrete「分泌」，不加 -s，也不用过去式。",
        alt: [{ text: "Some glands secrete chemicals that protect the skin.", zh: "有些腺体分泌保护皮肤的化学物质。" }],
      },
    ],
  },
  {
    id: "p3-rain-shadow",
    title: "第 3 篇 · 气象学",
    text:
      "Mountains have a strong effect on the weather around them. As wind pushes moist air up the slope, it cools. Its water then falls as precipitation. The leeward side, however, stays dry. Few plants grow there, and some regions receive almost no rain for months. Scientists call this area a rain shadow, and many of the driest places on the planet lie behind tall mountain ranges. Deserts in many parts of the world formed in exactly this way.",
    zh: "山脉对周围的天气影响很大。风把潮湿的空气推上山坡时，空气会冷却，其中的水分随后以降水的形式落下。而背风的一侧却保持干燥，植物稀少，有些地区几个月几乎不下雨。科学家把这片区域叫作雨影区，地球上许多最干旱的地方都位于高大山脉的背后。世界各地的许多沙漠正是这样形成的。",
    targets: [
      {
        form: "moist",
        entryId: "moist",
        senseId: "moist#1",
        clue: "放在名词 air 前作定语，要形容词 moist「潮湿的」；下一句说空气里的水会落下来，说明这股空气含水多。",
        alt: [{ text: "Keep the soil moist until the seeds sprout.", zh: "种子发芽前要保持土壤湿润。" }],
      },
      {
        form: "precipitation",
        entryId: "precipitation",
        senseId: "precipitation#rain",
        clue: "介词 as 后面要名词；空气冷却后水分落下，就是「降水」precipitation，不可数，不加 -s。",
        alt: [{ text: "The coast gets more precipitation than the inland plains.", zh: "沿海的降水比内陆平原多。" }],
      },
      {
        form: "leeward",
        entryId: "leeward",
        senseId: "leeward#2",
        clue: "冠词 The 和名词 side 之间要形容词；however 和 stays dry 表示和上文下雨的一侧相反，所以是「背风的」leeward side。",
        alt: [{ text: "Few trees grow on the leeward side of the island.", zh: "岛的背风面很少长树。" }],
      },
    ],
  },
];
