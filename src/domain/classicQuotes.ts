export interface ClassicQuote {
  text: string;
  source: string;
}

export const CLASSIC_QUOTES: readonly ClassicQuote[] = [
  { text: "学而时习之，不亦说乎", source: "《论语·学而》" },
  { text: "知之为知之，不知为不知，是知也", source: "《论语·为政》" },
  { text: "三人行，必有我师焉", source: "《论语·述而》" },
  { text: "逝者如斯夫，不舍昼夜", source: "《论语·子罕》" },
  { text: "己所不欲，勿施于人", source: "《论语·颜渊》" },
  { text: "君子和而不同，小人同而不和", source: "《论语·子路》" },
  { text: "天行健，君子以自强不息", source: "《周易·乾》" },
  { text: "地势坤，君子以厚德载物", source: "《周易·坤》" },
  { text: "穷则变，变则通，通则久", source: "《周易·系辞下》" },
  { text: "上善若水，水善利万物而不争", source: "《道德经·第八章》" },
  { text: "知人者智，自知者明", source: "《道德经·第三十三章》" },
  { text: "大直若屈，大巧若拙，大辩若讷", source: "《道德经·第四十五章》" },
  { text: "千里之行，始于足下", source: "《道德经·第六十四章》" },
  { text: "吾生也有涯，而知也无涯", source: "《庄子·养生主》" },
  { text: "人生天地之间，若白驹之过隙", source: "《庄子·知北游》" },
  { text: "不积跬步，无以至千里", source: "《荀子·劝学》" },
  { text: "锲而不舍，金石可镂", source: "《荀子·劝学》" },
  { text: "青，取之于蓝，而青于蓝", source: "《荀子·劝学》" },
  { text: "路曼曼其修远兮，吾将上下而求索", source: "《楚辞·离骚》" },
  { text: "亦余心之所善兮，虽九死其犹未悔", source: "《楚辞·离骚》" },
  { text: "博学之，审问之，慎思之，明辨之，笃行之", source: "《礼记·中庸》" },
  { text: "玉不琢，不成器；人不学，不知道", source: "《礼记·学记》" },
  { text: "独学而无友，则孤陋而寡闻", source: "《礼记·学记》" },
  { text: "富贵不能淫，贫贱不能移，威武不能屈", source: "《孟子·滕文公下》" },
  { text: "生于忧患，死于安乐", source: "《孟子·告子下》" },
  { text: "尽信书，则不如无书", source: "《孟子·尽心下》" },
  { text: "得道者多助，失道者寡助", source: "《孟子·公孙丑下》" },
  { text: "居安思危，思则有备，有备无患", source: "《左传·襄公十一年》" },
  { text: "人谁无过？过而能改，善莫大焉", source: "《左传·宣公二年》" },
  { text: "前事之不忘，后事之师", source: "《战国策·赵策一》" },
  { text: "桃李不言，下自成蹊", source: "《史记·李将军列传》" },
  { text: "不鸣则已，一鸣惊人", source: "《史记·滑稽列传》" },
] as const;

export function classicQuoteForDate(date: Date): ClassicQuote {
  const dayIndex = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
  return CLASSIC_QUOTES[((dayIndex % CLASSIC_QUOTES.length) + CLASSIC_QUOTES.length) % CLASSIC_QUOTES.length]!;
}
