// 英文非推荐词 → 推荐写法（取自 ASD-STE100 的精神：用短、常见、一词一义的词）。
export const EN_WORDS = Object.freeze({
  'utilize': 'use', 'utilise': 'use', 'utilization': 'use', 'commence': 'start', 'commenced': 'started',
  'prior to': 'before', 'in order to': 'to', 'approximately': 'about', 'ensure': 'make sure',
  'replenish': 'fill', 'terminate': 'stop', 'facilitate': 'help', 'leverage': 'use', 'numerous': 'many',
  'subsequently': 'then', 'endeavor': 'try', 'ascertain': 'find', 'sufficient': 'enough',
  'demonstrate': 'show', 'assist': 'help', 'obtain': 'get', 'initiate': 'start', 'modify': 'change',
  'possess': 'have', 'purchase': 'buy', 'in the event that': 'if', 'due to the fact that': 'because',
  'at this point in time': 'now', 'a number of': 'some', 'with regard to': 'about', 'in addition': 'also',
  // research fork：研究写作里常见的空话（删掉，或换成数字 / 具体性质）。
  'is able to': 'can', 'in terms of': 'rewrite the sentence', 'it is worth noting that': 'delete', 'note that': 'delete, or use a callout',
  'various': 'name them', 'basically': 'delete', 'obviously': 'delete', 'clearly': 'delete', 'really': 'delete',
  'very': 'delete, or give a number', 'robust': 'name the property and how it was measured', 'seamless': 'delete',
  'cutting-edge': 'delete', 'state-of-the-art': 'cite the benchmark',
});
