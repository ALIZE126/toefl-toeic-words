/**
 * 从词本中挑出的 30 个词条的练习内容（全部为自编例句）。
 * 每个义项：1 个学习句 + 至少 1 个不同的复测句（用于无字幕听力和新句理解）。
 * 听力题选项的第 1 个是正确答案，显示时会打乱顺序。
 */

export type Tag = "scene" | "polysemy" | "academic";

export interface CuratedTest {
  text: string;
  zh: string;
  q: string;
  options: [string, string, string, string];
}

export interface CuratedSense {
  key: string;
  pos: string;
  gloss: string;
  cue?: string;
  learn: { text: string; zh: string };
  tests: CuratedTest[];
}

export interface CuratedEntry {
  word: string;
  tag: Tag;
  collocations: string[];
  senses: CuratedSense[];
}

export const CURATED: CuratedEntry[] = [
  // ───── 场景搭配（托业常见） ─────
  {
    word: "postpone",
    tag: "scene",
    collocations: ["postpone the meeting / seminar", "postpone sth. until Friday", "be postponed due to the weather"],
    senses: [
      {
        key: "delay",
        pos: "v.",
        gloss: "推迟；延期",
        learn: { text: "They postponed the seminar until Friday.", zh: "他们把研讨会推迟到了周五。" },
        tests: [
          {
            text: "We'll have to postpone the client meeting.",
            zh: "我们只好把客户会议推迟。",
            q: "客户会议要怎么处理？",
            options: ["推迟举行", "提前举行", "直接取消", "照常举行"],
          },
          {
            text: "The launch was postponed because of the storm.",
            zh: "发布活动因为暴风雨推迟了。",
            q: "发布活动怎么了？",
            options: ["因暴风雨推迟了", "因暴风雨取消了", "赶在暴风雨前提前办了", "改到室内照常进行"],
          },
        ],
      },
    ],
  },
  {
    word: "seminar",
    tag: "scene",
    collocations: ["attend a seminar", "a training seminar", "lead / run a seminar", "seminar room"],
    senses: [
      {
        key: "meeting",
        pos: "n.",
        gloss: "研讨会；研讨课",
        learn: { text: "I signed up for a marketing seminar next week.", zh: "我报名了下周的一个营销研讨会。" },
        tests: [
          {
            text: "The professor asked us to prepare questions for Thursday's seminar.",
            zh: "教授让我们为周四的研讨课准备问题。",
            q: "教授让学生为什么做准备？",
            options: ["周四的研讨课", "周四的期末考试", "周四的实验", "周四的面试"],
          },
        ],
      },
    ],
  },
  {
    word: "policy",
    tag: "scene",
    collocations: ["company policy", "return / refund policy", "a policy on remote work"],
    senses: [
      {
        key: "rule",
        pos: "n.",
        gloss: "政策；规定",
        learn: { text: "Our company policy doesn't allow remote work on Mondays.", zh: "我们公司的规定不允许周一远程办公。" },
        tests: [
          {
            text: "Please check the store's return policy before you buy.",
            zh: "购买前请先查看商店的退货规定。",
            q: "买东西前建议先确认什么？",
            options: ["商店的退货规定", "商店的营业时间", "商品的产地", "会员积分规则"],
          },
        ],
      },
    ],
  },
  {
    word: "forecast",
    tag: "scene",
    collocations: ["weather forecast", "sales forecast", "be forecast to rise"],
    senses: [
      {
        key: "predict",
        pos: "n./v.",
        gloss: "预报；预测",
        learn: { text: "The weather forecast says it will rain tomorrow.", zh: "天气预报说明天会下雨。" },
        tests: [
          {
            text: "Analysts forecast that sales will rise next quarter.",
            zh: "分析师预测下季度销量会上升。",
            q: "分析师对下季度销量怎么看？",
            options: ["预计会上升", "预计会下降", "说无法判断", "说已经上升了"],
          },
        ],
      },
    ],
  },
  {
    word: "facilitate",
    tag: "scene",
    collocations: ["facilitate communication", "facilitate a discussion", "facilitate the process"],
    senses: [
      {
        key: "help",
        pos: "v.",
        gloss: "促进；使便利",
        learn: {
          text: "The new software will facilitate communication between departments.",
          zh: "新软件会让部门之间的沟通更方便。",
        },
        tests: [
          {
            text: "A shared calendar facilitates scheduling for the whole team.",
            zh: "共享日历让整个团队安排时间更方便。",
            q: "共享日历起什么作用？",
            options: ["让全组安排时间更方便", "取代了团队例会", "让日程更难协调", "只给经理使用"],
          },
        ],
      },
    ],
  },
  {
    word: "investigate",
    tag: "scene",
    collocations: ["investigate the cause of", "investigate a complaint", "investigate how / whether"],
    senses: [
      {
        key: "examine",
        pos: "v.",
        gloss: "调查；研究",
        learn: { text: "Engineers are investigating the cause of the power failure.", zh: "工程师正在调查停电的原因。" },
        tests: [
          {
            text: "Scientists investigated how bees find their way home.",
            zh: "科学家研究了蜜蜂怎样找到回家的路。",
            q: "科学家做了什么？",
            options: ["研究蜜蜂怎样找到回家的路", "训练蜜蜂回家", "统计蜜蜂的数量", "保护蜜蜂的巢"],
          },
        ],
      },
    ],
  },
  {
    word: "merchant",
    tag: "scene",
    collocations: ["a wine / spice merchant", "merchant ship", "local merchants"],
    senses: [
      {
        key: "trader",
        pos: "n.",
        gloss: "商人",
        learn: { text: "Venetian merchants traded spices across the Mediterranean.", zh: "威尼斯商人在地中海一带买卖香料。" },
        tests: [
          {
            text: "The town grew rich because local merchants sold silk to travelers.",
            zh: "因为当地商人把丝绸卖给旅客，小镇富了起来。",
            q: "这个小镇为什么富起来？",
            options: ["当地商人向旅客卖丝绸", "当地农民种桑养蚕", "政府给小镇拨款", "很多旅客在镇上定居"],
          },
        ],
      },
    ],
  },
  {
    word: "hazard",
    tag: "scene",
    collocations: ["a safety / fire hazard", "health hazard", "pose a hazard to"],
    senses: [
      {
        key: "danger",
        pos: "n.",
        gloss: "危险；隐患",
        learn: { text: "Wet floors are a safety hazard in the kitchen.", zh: "湿滑的地板在厨房里是安全隐患。" },
        tests: [
          {
            text: "Old wiring in the building is a serious fire hazard.",
            zh: "楼里的旧电线是严重的火灾隐患。",
            q: "楼里的旧电线有什么问题？",
            options: ["有严重的火灾隐患", "太耗电", "影响网速", "不美观"],
          },
        ],
      },
    ],
  },
  {
    word: "accumulate",
    tag: "scene",
    collocations: ["accumulate savings / wealth", "dust accumulates", "accumulate evidence"],
    senses: [
      {
        key: "gather",
        pos: "v.",
        gloss: "积累；堆积",
        learn: { text: "Snow accumulated on the roof overnight.", zh: "一夜之间屋顶积了雪。" },
        tests: [
          {
            text: "Over the years, she accumulated enough savings to buy a house.",
            zh: "这些年她攒够了买房的钱。",
            q: "这些年她做到了什么？",
            options: ["攒够了买房的钱", "卖掉了房子", "还清了贷款", "搬了好几次家"],
          },
        ],
      },
    ],
  },

  // ───── 多义词：按义项分别练习 ─────
  {
    word: "property",
    tag: "polysemy",
    collocations: ["physical / chemical properties", "company property", "private property", "property prices"],
    senses: [
      {
        key: "trait",
        pos: "n.",
        gloss: "特性；（物理、化学）性质",
        cue: "the properties of a material",
        learn: { text: "One property of copper is that it conducts electricity well.", zh: "铜的一个特性是导电性好。" },
        tests: [
          {
            text: "Diamonds and graphite are both carbon, but their physical properties are very different.",
            zh: "钻石和石墨都是碳，但物理性质差别很大。",
            q: "钻石和石墨有什么不同？",
            options: ["物理性质差别很大", "化学成分完全不同", "价格差不多", "都很软"],
          },
        ],
      },
      {
        key: "asset",
        pos: "n.",
        gloss: "财产；房产",
        cue: "company property",
        learn: {
          text: "Laptops are company property and must be returned when you leave.",
          zh: "笔记本电脑是公司财产，离职时必须归还。",
        },
        tests: [
          {
            text: "The firm sold one of its properties downtown to pay off its debt.",
            zh: "公司卖掉了市中心的一处房产来还债。",
            q: "公司做了什么来还债？",
            options: ["卖掉了市中心的一处房产", "裁掉了市中心门店的员工", "向市中心的银行借钱", "把总部搬到市中心"],
          },
        ],
      },
    ],
  },
  {
    word: "approach",
    tag: "polysemy",
    collocations: ["a new approach to sth.", "take a practical approach", "as the deadline approaches"],
    senses: [
      {
        key: "method",
        pos: "n.",
        gloss: "方法；处理方式",
        cue: "a different approach to the problem",
        learn: { text: "We need a different approach to this problem.", zh: "我们需要换一种方法来解决这个问题。" },
        tests: [
          {
            text: "The researchers took a more practical approach this time.",
            zh: "研究人员这次采用了更务实的方法。",
            q: "研究人员这次是怎么做的？",
            options: ["采用了更务实的方法", "放弃了这个项目", "回到了原来的结论", "申请了更多经费"],
          },
        ],
      },
      {
        key: "near",
        pos: "v.",
        gloss: "接近；临近",
        cue: "as winter approaches",
        learn: { text: "As the deadline approaches, the office gets busier.", zh: "随着截止日期临近，办公室越来越忙。" },
        tests: [
          {
            text: "The train is now approaching the final station.",
            zh: "火车即将到达终点站。",
            q: "火车现在怎么样了？",
            options: ["快到终点站了", "刚离开终点站", "在终点站停运了", "停下来等信号"],
          },
        ],
      },
    ],
  },
  {
    word: "commission",
    tag: "polysemy",
    collocations: ["earn a commission on sales", "commission sb. to do sth.", "commission a painting"],
    senses: [
      {
        key: "fee",
        pos: "n.",
        gloss: "佣金；手续费",
        cue: "earn a commission on each sale",
        learn: { text: "Sales staff earn a five percent commission on every sale.", zh: "销售人员每卖出一单赚百分之五的佣金。" },
        tests: [
          {
            text: "The agent takes a small commission when the apartment is rented.",
            zh: "公寓租出去时，中介收取一小笔佣金。",
            q: "公寓租出去时，中介会怎样？",
            options: ["收取一小笔佣金", "免费提供服务", "退还押金", "给租客打折"],
          },
        ],
      },
      {
        key: "order",
        pos: "v.",
        gloss: "正式委托（制作）",
        cue: "commission an artist / a report",
        learn: { text: "The city commissioned a local artist to paint the mural.", zh: "市政府委托一位本地艺术家绘制这幅壁画。" },
        tests: [
          {
            text: "The museum commissioned a new statue for its entrance.",
            zh: "博物馆委托别人为入口制作一座新雕像。",
            q: "博物馆做了什么？",
            options: ["请人为入口专门制作一座新雕像", "把入口的旧雕像卖掉了", "在入口展出借来的雕像", "禁止在入口放雕像"],
          },
        ],
      },
    ],
  },
  {
    word: "acquisition",
    tag: "polysemy",
    collocations: ["the acquisition of a company", "mergers and acquisitions", "language acquisition"],
    senses: [
      {
        key: "purchase",
        pos: "n.",
        gloss: "收购；购得",
        cue: "the acquisition of a startup",
        learn: {
          text: "The acquisition of the small startup cost the firm two million dollars.",
          zh: "收购这家小初创公司花了该公司两百万美元。",
        },
        tests: [
          {
            text: "After the acquisition, the two companies merged their offices.",
            zh: "收购完成后，两家公司合并了办公室。",
            q: "两家公司什么时候合并了办公室？",
            options: ["一家收购另一家之后", "签新租约之前", "搬到海外之后", "大规模裁员之前"],
          },
        ],
      },
      {
        key: "learning",
        pos: "n.",
        gloss: "（知识、语言的）习得",
        cue: "second language acquisition",
        learn: { text: "Children's language acquisition happens remarkably fast.", zh: "儿童习得语言的速度快得惊人。" },
        tests: [
          {
            text: "The lecture focuses on the acquisition of a second language in adults.",
            zh: "这场讲座聚焦成年人对第二语言的习得。",
            q: "讲座的主题是什么？",
            options: ["成年人怎样学会第二语言", "成年人怎样购买语言课程", "儿童怎样学母语", "翻译工作的收入"],
          },
        ],
      },
    ],
  },
  {
    word: "retain",
    tag: "polysemy",
    collocations: ["retain heat / water", "retain information", "retain staff / customers"],
    senses: [
      {
        key: "keep",
        pos: "vt.",
        gloss: "保持；保留",
        cue: "retain heat / water",
        learn: { text: "Clay soil retains water much longer than sandy soil.", zh: "黏土保持水分的时间比沙土长得多。" },
        tests: [
          {
            text: "Thick walls help the house retain heat in winter.",
            zh: "厚墙帮助房子在冬天保持热量。",
            q: "厚墙有什么作用？",
            options: ["冬天帮房子保住热量", "夏天让房子更凉快", "让房子更隔音", "让房子更便宜"],
          },
        ],
      },
      {
        key: "remember",
        pos: "vt.",
        gloss: "记住（信息）",
        cue: "retain information",
        learn: {
          text: "Students retain more information when they explain it to others.",
          zh: "学生把内容讲给别人听时，能记住更多信息。",
        },
        tests: [
          {
            text: "Most people retain only a small part of what they hear in a lecture.",
            zh: "大多数人只能记住讲座内容的一小部分。",
            q: "听讲座时大多数人会怎样？",
            options: ["只记得听到内容的一小部分", "能记住全部内容", "会提前离场", "会做很详细的笔记"],
          },
        ],
      },
    ],
  },
  {
    word: "release",
    tag: "polysemy",
    collocations: ["release a new product", "press release", "release energy / gas"],
    senses: [
      {
        key: "publish",
        pos: "v.",
        gloss: "发布；发行；公布",
        cue: "release a new phone / report",
        learn: { text: "The company will release its new phone in March.", zh: "公司将在三月发布新手机。" },
        tests: [
          {
            text: "The final report will be released to the public next week.",
            zh: "最终报告将于下周向公众公布。",
            q: "最终报告会怎样？",
            options: ["下周向公众公布", "下周在内部销毁", "下周重新撰写", "一直保密"],
          },
        ],
      },
      {
        key: "emit",
        pos: "v.",
        gloss: "释放；排放",
        cue: "release energy / carbon dioxide",
        learn: { text: "Burning fuel releases carbon dioxide into the air.", zh: "燃烧燃料会向空气中释放二氧化碳。" },
        tests: [
          {
            text: "When the cells break down sugar, they release energy.",
            zh: "细胞分解糖时会释放能量。",
            q: "细胞分解糖时会发生什么？",
            options: ["释放出能量", "储存水分", "停止生长", "吸收光线"],
          },
        ],
      },
    ],
  },
  {
    word: "settlement",
    tag: "polysemy",
    collocations: ["an early / farming settlement", "reach a settlement", "settlement of a dispute"],
    senses: [
      {
        key: "village",
        pos: "n.",
        gloss: "定居点；聚居地",
        cue: "an early farming settlement",
        learn: {
          text: "Archaeologists found the remains of a farming settlement near the river.",
          zh: "考古学家在河边发现了一处农耕定居点的遗迹。",
        },
        tests: [
          {
            text: "The first settlements in the valley were small villages of a few families.",
            zh: "山谷里最早的定居点是几户人家组成的小村庄。",
            q: "山谷里最早的聚居地是什么样的？",
            options: ["几户人家组成的小村庄", "人口众多的大城市", "临时的军营", "商人的仓库"],
          },
        ],
      },
      {
        key: "agreement",
        pos: "n.",
        gloss: "（纠纷的）解决；和解协议",
        cue: "reach a settlement",
        learn: {
          text: "The two companies reached a settlement and avoided going to court.",
          zh: "两家公司达成和解，没有闹上法庭。",
        },
        tests: [
          {
            text: "After months of talks, the union accepted the settlement.",
            zh: "经过几个月的谈判，工会接受了和解方案。",
            q: "几个月谈判后结果如何？",
            options: ["工会接受了和解方案", "工会发起了罢工", "谈判彻底破裂", "工会解散了"],
          },
        ],
      },
    ],
  },
  {
    word: "matter",
    tag: "polysemy",
    collocations: ["organic matter", "It doesn't matter.", "What matters most is…", "a matter of time"],
    senses: [
      {
        key: "substance",
        pos: "n.",
        gloss: "物质",
        cue: "organic matter",
        learn: { text: "Dead leaves add organic matter to the soil.", zh: "落叶为土壤增添有机物质。" },
        tests: [
          {
            text: "Everything around us is made of matter, from air to rocks.",
            zh: "从空气到岩石，我们周围的一切都由物质构成。",
            q: "这句话在讲什么？",
            options: ["从空气到岩石，一切都由物质构成", "空气比岩石更重要", "岩石里没有空气", "周围的东西终将消失"],
          },
        ],
      },
      {
        key: "important",
        pos: "v.",
        gloss: "要紧；有关系",
        cue: "It doesn't matter.",
        learn: { text: "It doesn't matter if you arrive a little late.", zh: "你晚到一会儿没关系。" },
        tests: [
          {
            text: "What matters most to our customers is fast delivery.",
            zh: "对我们的客户来说，最重要的是送货快。",
            q: "对客户来说最重要的是什么？",
            options: ["送货快", "价格低", "包装好看", "售后服务"],
          },
        ],
      },
    ],
  },
  {
    word: "discharge",
    tag: "polysemy",
    collocations: ["discharge waste into", "be discharged from hospital", "discharge a duty"],
    senses: [
      {
        key: "emit",
        pos: "v.",
        gloss: "排出；排放",
        cue: "discharge waste into the river",
        learn: {
          text: "The factory was fined for discharging waste into the river.",
          zh: "这家工厂因向河里排放废料被罚款。",
        },
        tests: [
          {
            text: "Volcanoes can discharge huge amounts of gas in a few hours.",
            zh: "火山能在几小时内喷出大量气体。",
            q: "火山能怎样？",
            options: ["几小时内喷出大量气体", "几小时内完全冷却", "几十年才喷发一次", "吸收大量气体"],
          },
        ],
      },
      {
        key: "release",
        pos: "v.",
        gloss: "准许离开；（病人）出院",
        cue: "be discharged from hospital",
        learn: { text: "She was discharged from the hospital after three days.", zh: "她三天后出院了。" },
        tests: [
          {
            text: "The doctor says your father can be discharged tomorrow morning.",
            zh: "医生说你父亲明早可以出院。",
            q: "医生说父亲明早会怎样？",
            options: ["可以出院", "需要做手术", "要转到别的医院", "要来复查"],
          },
        ],
      },
    ],
  },
  {
    word: "concrete",
    tag: "polysemy",
    collocations: ["a concrete wall / floor", "pour concrete", "a concrete example / plan"],
    senses: [
      {
        key: "material",
        pos: "n.",
        gloss: "混凝土",
        cue: "steel and concrete",
        learn: { text: "The bridge is made of steel and concrete.", zh: "这座桥由钢材和混凝土建成。" },
        tests: [
          {
            text: "Workers poured concrete for the new parking garage.",
            zh: "工人们为新停车楼浇筑混凝土。",
            q: "工人们在做什么？",
            options: ["为新停车楼浇筑混凝土", "拆除停车楼", "给停车楼刷漆", "在停车楼里停车"],
          },
        ],
      },
      {
        key: "specific",
        pos: "adj.",
        gloss: "具体的；确实的",
        cue: "a concrete example",
        learn: { text: "Can you give me a concrete example?", zh: "你能给我举个具体的例子吗？" },
        tests: [
          {
            text: "The manager wants a concrete plan by the end of the week.",
            zh: "经理希望周末前拿到一份具体的计划。",
            q: "经理想要什么？",
            options: ["周末前拿到一份具体的计划", "一个大致想法就行", "下周再讨论", "取消这个计划"],
          },
        ],
      },
    ],
  },
  {
    word: "colony",
    tag: "polysemy",
    collocations: ["an ant / coral colony", "a British colony", "the thirteen colonies"],
    senses: [
      {
        key: "group",
        pos: "n.",
        gloss: "（生物）群体；群落",
        cue: "a colony of ants / coral",
        learn: { text: "A colony of ants can contain millions of individuals.", zh: "一个蚁群可以有数百万只蚂蚁。" },
        tests: [
          {
            text: "Coral reefs are built by huge colonies of tiny animals.",
            zh: "珊瑚礁是由大量微小动物的群体建造的。",
            q: "珊瑚礁是怎样形成的？",
            options: ["由大量微小动物的群体建造", "由海浪冲刷岩石形成", "由火山喷发形成", "由人工建造"],
          },
        ],
      },
      {
        key: "territory",
        pos: "n.",
        gloss: "殖民地",
        cue: "a British colony",
        learn: {
          text: "Virginia was one of the thirteen British colonies in North America.",
          zh: "弗吉尼亚是英国在北美的十三个殖民地之一。",
        },
        tests: [
          {
            text: "The colony declared independence in the late eighteenth century.",
            zh: "这块殖民地在十八世纪末宣布独立。",
            q: "十八世纪末发生了什么？",
            options: ["这块殖民地宣布独立", "这座城市被地震摧毁", "这个国家开始对外殖民", "这个部落迁走了"],
          },
        ],
      },
    ],
  },

  // ───── 学术词（托福阅读 / 听力讲座） ─────
  {
    word: "glacier",
    tag: "academic",
    collocations: ["glacier melt", "a retreating glacier", "glaciers carve valleys"],
    senses: [
      {
        key: "ice",
        pos: "n.",
        gloss: "冰川",
        learn: { text: "The glacier slowly moved down the mountain valley.", zh: "冰川沿着山谷缓慢向下移动。" },
        tests: [
          {
            text: "As the climate warmed, the glacier retreated several kilometers.",
            zh: "随着气候变暖，冰川后退了好几公里。",
            q: "气候变暖时，什么后退了好几公里？",
            options: ["冰川", "海岸线", "森林边界", "沙漠"],
          },
        ],
      },
    ],
  },
  {
    word: "erosion",
    tag: "academic",
    collocations: ["soil erosion", "coastal erosion", "wind / water erosion", "erosion and deposition"],
    senses: [
      {
        key: "wear",
        pos: "n.",
        gloss: "侵蚀；腐蚀",
        learn: { text: "Trees protect the hillside from erosion.", zh: "树木保护山坡免受侵蚀。" },
        tests: [
          {
            text: "Strong winds caused serious erosion of the farmland.",
            zh: "强风造成了农田严重的土壤侵蚀。",
            q: "强风给农田带来了什么？",
            options: ["严重的土壤侵蚀", "严重的洪水", "作物大丰收", "土壤更肥沃"],
          },
        ],
      },
    ],
  },
  {
    word: "deposition",
    tag: "academic",
    collocations: ["the deposition of sediment", "erosion and deposition", "glacial deposition"],
    senses: [
      {
        key: "sediment",
        pos: "n.",
        gloss: "沉积（作用）；沉积物",
        learn: {
          text: "Over time, the deposition of sand formed a small island.",
          zh: "随着时间推移，沙子沉积形成了一座小岛。",
        },
        tests: [
          {
            text: "Rivers slow down near the sea, which leads to the deposition of mud.",
            zh: "河流在入海处变慢，泥沙因此沉积下来。",
            q: "河流在入海处变慢会导致什么？",
            options: ["泥沙沉积下来", "河水变咸", "河道变窄", "鱼类减少"],
          },
        ],
      },
    ],
  },
  {
    word: "precipitation",
    tag: "academic",
    collocations: ["annual precipitation", "heavy precipitation", "precipitation levels"],
    senses: [
      {
        key: "rain",
        pos: "n.",
        gloss: "降水；降水量",
        learn: { text: "The region gets very little precipitation in summer.", zh: "这个地区夏季降水很少。" },
        tests: [
          {
            text: "Deserts receive less than 250 millimeters of precipitation a year.",
            zh: "沙漠每年的降水量不到 250 毫米。",
            q: "沙漠每年得到的什么不到 250 毫米？",
            options: ["降水", "日照", "地下水", "沙尘"],
          },
        ],
      },
    ],
  },
  {
    word: "habitat",
    tag: "academic",
    collocations: ["natural habitat", "habitat loss", "destroy a habitat"],
    senses: [
      {
        key: "home",
        pos: "n.",
        gloss: "（动植物的）栖息地",
        learn: { text: "Wetlands are an important habitat for many birds.", zh: "湿地是许多鸟类的重要栖息地。" },
        tests: [
          {
            text: "Habitat loss is the main threat to these frogs.",
            zh: "栖息地丧失是这些青蛙面临的主要威胁。",
            q: "这些青蛙面临的主要威胁是什么？",
            options: ["栖息地丧失", "天敌增加", "气温过低", "食物有毒"],
          },
        ],
      },
    ],
  },
  {
    word: "organism",
    tag: "academic",
    collocations: ["living organism", "single-celled organism", "marine organisms"],
    senses: [
      {
        key: "living",
        pos: "n.",
        gloss: "生物；有机体",
        learn: { text: "Bacteria are single-celled organisms.", zh: "细菌是单细胞生物。" },
        tests: [
          {
            text: "Every living organism needs energy to survive.",
            zh: "所有生物都需要能量才能生存。",
            q: "这句话说了什么？",
            options: ["所有生物都需要能量才能生存", "所有机器都需要电", "只有动物需要能量", "植物不需要阳光"],
          },
        ],
      },
    ],
  },
  {
    word: "infer",
    tag: "academic",
    collocations: ["infer sth. from sth.", "infer that…", "What can be inferred about…?"],
    senses: [
      {
        key: "deduce",
        pos: "v.",
        gloss: "推断；推理",
        learn: {
          text: "From the footprints, we can infer that the animal was large.",
          zh: "从脚印我们可以推断这只动物体型很大。",
        },
        tests: [
          {
            text: "What can you infer about the speaker's opinion?",
            zh: "关于说话人的看法，你能推断出什么？",
            q: "这道题在问什么？",
            options: ["能推断出说话人的什么看法", "说话人明确说了什么", "说话人的职业", "说话人为什么迟到"],
          },
        ],
      },
    ],
  },
  {
    word: "emit",
    tag: "academic",
    collocations: ["emit light / heat", "emit carbon dioxide", "emit a signal"],
    senses: [
      {
        key: "send-out",
        pos: "v.",
        gloss: "发出；排放（光、热、气体）",
        learn: { text: "Fireflies emit light to attract mates.", zh: "萤火虫发光来吸引配偶。" },
        tests: [
          {
            text: "Older cars emit more pollution than electric ones.",
            zh: "旧汽车比电动车排放更多污染。",
            q: "旧汽车和电动车相比如何？",
            options: ["旧车排放的污染更多", "旧车更省油", "电动车污染更多", "两者差不多"],
          },
        ],
      },
    ],
  },
  {
    word: "drought",
    tag: "academic",
    collocations: ["a severe / long drought", "drought-resistant crops", "suffer from drought"],
    senses: [
      {
        key: "dry",
        pos: "n.",
        gloss: "干旱；旱灾",
        learn: { text: "The long drought destroyed most of the crops.", zh: "长期干旱毁掉了大部分庄稼。" },
        tests: [
          {
            text: "During the drought, the town limited how much water each family could use.",
            zh: "干旱期间，镇上限制了每户的用水量。",
            q: "镇上为什么限制用水？",
            options: ["因为干旱", "因为水管维修", "因为水费上涨", "因为洪水污染了水源"],
          },
        ],
      },
    ],
  },
  {
    word: "artifact",
    tag: "academic",
    collocations: ["ancient artifacts", "cultural artifacts", "recover artifacts"],
    senses: [
      {
        key: "object",
        pos: "n.",
        gloss: "人工制品；文物",
        learn: { text: "The museum displays artifacts from ancient Egypt.", zh: "博物馆展出古埃及的文物。" },
        tests: [
          {
            text: "Divers recovered several artifacts from the shipwreck.",
            zh: "潜水员从沉船里打捞出几件文物。",
            q: "潜水员从沉船里找到了什么？",
            options: ["几件人造器物", "一些海洋生物", "一些岩石样本", "船上剩下的燃料"],
          },
        ],
      },
    ],
  },
];

export const CURATED_BY_WORD: Record<string, CuratedEntry> = Object.fromEntries(
  CURATED.map((c) => [c.word.toLowerCase(), c]),
);
