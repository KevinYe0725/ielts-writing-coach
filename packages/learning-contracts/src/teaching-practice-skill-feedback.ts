type Bilingual = readonly [zh: string, en: string];
const localized = ([zh, en]: Bilingual) => ({ zh, en });

function feedback(
  title: Bilingual,
  explanation: Bilingual,
  whyItMatters: Bilingual,
  nextCheck: Bilingual,
  before: string,
  after: string,
  exampleExplanation: Bilingual,
) {
  return {
    title: localized(title),
    explanation: localized(explanation),
    whyItMatters: localized(whyItMatters),
    nextCheck: localized(nextCheck),
    example: { before, after, explanation: localized(exampleExplanation) },
  };
}

// Authored teaching examples, never a replacement for the learner's own answer.
// The model selects a diagnosis and quotes evidence; it cannot invent these rules.
export const SKILL_IMPROVEMENT_COPY = {
  CHECK_SUBJECT_VERB_AGREEMENT: feedback(
    ["先找真正的主语", "Find the head subject"],
    [
      "先找主语的中心词，再检查谓语单复数；不要让介词短语里离动词更近的名词干扰判断。",
      "Find the head of the subject before choosing the verb; a nearby noun inside a prepositional phrase does not control agreement.",
    ],
    [
      "主语和谓语一致，读者才能准确理解是谁在做什么。",
      "Agreement makes the relationship between the subject and its action clear.",
    ],
    [
      "下次检查：暂时划去主语中的修饰语，剩下的中心词是单数还是复数？",
      "Next time, set aside subject modifiers and check whether the head is singular or plural.",
    ],
    "The number of students are increasing.",
    "The number of students is increasing.",
    [
      "这里的主语中心是单数 number，of students 是修饰语。注意 a number of students 表示许多学生，要用复数谓语。",
      "The head is singular number; of students modifies it. In contrast, a number of students means many students and takes a plural verb.",
    ],
  ),
  CHECK_VERB_FORM: feedback(
    ["根据前面的结构选择动词形式", "Use the governing structure"],
    [
      "检查动词前的情态动词、介词或固定结构，再选择原形、动名词或不定式。",
      "Check the modal, preposition, or governing construction before choosing a bare verb, gerund, or infinitive.",
    ],
    [
      "意思相同不代表语法结构相同，动词形式要由英文结构决定。",
      "Equivalent meanings can use different grammatical constructions.",
    ],
    [
      "下次检查：哪个词或结构决定了这里的动词形式？",
      "Next time, identify the word or construction governing this verb.",
    ],
    "Schools should to teach financial literacy.",
    "Schools should teach financial literacy.",
    [
      "should 后接动词原形；但 want to teach 和 avoid teaching 使用不同结构。",
      "Should takes a bare verb; want to teach and avoid teaching follow different constructions.",
    ],
  ),
  REPAIR_SENTENCE_BOUNDARY: feedback(
    ["把完整分句正确连接起来", "Connect complete clauses"],
    [
      "找出各个分句的主语和谓语。两个完整分句不能只用逗号连接，要选择与意思相符的连接方式。",
      "Identify each clause's subject and verb. Two independent clauses need more than a comma between them.",
    ],
    [
      "清晰的句子边界能让读者看懂信息之间的关系。",
      "Clear sentence boundaries make the relationship between ideas readable.",
    ],
    [
      "下次检查：逗号两边是否都能独立成为一句话？",
      "Next time, check whether both sides of the comma can stand alone.",
    ],
    "Public transport is affordable, many workers use it.",
    "Public transport is affordable, so many workers use it.",
    [
      "这里用 so 明确因果；如果只想陈述两件事，也可以拆成两句。",
      "So expresses the causal relation. Separate sentences are also possible if no causal claim is intended.",
    ],
  ),
  CHECK_ARTICLE_REFERENCE: feedback(
    ["先判断名词是否特指", "Decide whether the noun is specific"],
    [
      "检查名词是否可数、是否单数，以及读者能否确定你指的是哪一个，再决定用 a、an、the 或零冠词。",
      "Check countability, number, and whether the reader can identify the referent before choosing an article.",
    ],
    [
      "冠词帮助读者区分泛指的一类事物和已经确定的具体对象。",
      "Articles distinguish a general category from an identifiable object.",
    ],
    [
      "下次检查：这里是首次提到的单数可数名词，还是双方都能辨认的对象？",
      "Next time, ask whether this is a new singular countable noun or an identifiable referent.",
    ],
    "A city opened new library. Library is near the station.",
    "A city opened a new library. The library is near the station.",
    [
      "首次提到用 a new library；第二句已经可以确定是哪座图书馆，用 the。",
      "A introduces the library; the refers back to the library already introduced.",
    ],
  ),
  CHECK_WORD_FORM: feedback(
    ["让词形符合句子中的作用", "Match word form to its role"],
    [
      "判断这个位置需要名词、动词、形容词还是副词，再检查同一词族中哪个形式符合意思。",
      "Identify the grammatical role needed here, then choose the word-family member that preserves the meaning.",
    ],
    [
      "熟悉一个词的意思，还需要知道它在句子中能承担什么作用。",
      "Knowing a word's meaning also requires knowing its grammatical role.",
    ],
    [
      "下次检查：这个词在修饰谁，或充当哪个句子成分？",
      "Next time, ask what the word modifies or which sentence role it fills.",
    ],
    "This policy is benefit to residents.",
    "This policy is beneficial to residents.",
    [
      "be beneficial to 用形容词描述作用；也可以说 This policy benefits residents，用动词。",
      "Be beneficial to uses an adjective; This policy benefits residents uses a verb.",
    ],
  ),
  CHECK_SPELLING: feedback(
    ["核对这个词的拼写", "Check this word's spelling"],
    [
      "核对引用部分的拼写和词尾。保留原本要表达的词，不需要为了纠正拼写而换成生僻词。",
      "Check spelling and endings in the quoted wording. Keep the intended word rather than replacing it with an obscure synonym.",
    ],
    [
      "准确的常用词比拼写不稳的生僻词更能传达意思。",
      "Accurate familiar words communicate more effectively than misspelled obscure ones.",
    ],
    [
      "下次检查：特别留意自己常漏掉的字母、双写和词尾。",
      "Next time, check your recurring omissions, doubled letters, and endings.",
    ],
    "Governments should protect the enviroment.",
    "Governments should protect the environment.",
    [
      "environment 中的 n 容易漏写；练习时把它放回短语 protect the environment 中记忆。",
      "The n in environment is easily omitted; practise it in the phrase protect the environment.",
    ],
  ),
  MATCH_COLLOCATION: feedback(
    ["按英文的常用搭配表达", "Choose an appropriate collocation"],
    [
      "检查动词、名词和介词的搭配是否符合想表达的关系，而不只是逐个词翻译正确。",
      "Check whether the verb, noun, and preposition conventionally express the intended relationship, rather than translating each word separately.",
    ],
    [
      "合适的搭配能让表达更准确，也减少读者猜测你的意思。",
      "Appropriate collocations improve precision and reduce the reader's guesswork.",
    ],
    [
      "下次检查：这个动词通常和哪个名词、介词一起使用？",
      "Next time, check the noun and preposition that normally accompany this verb.",
    ],
    "This policy can make benefits for residents.",
    "This policy can bring benefits to residents.",
    [
      "表示带来好处时可以用 bring benefits to，也可以直接说 benefit residents。",
      "Bring benefits to and benefit residents are two natural ways to express this relationship.",
    ],
  ),
  COMPLETE_COMPARISON: feedback(
    ["把比较对象和维度说完整", "Make the comparison complete"],
    [
      "明确是在比较哪两个对象、哪一个方面，并检查两边比较的是同一类事物。",
      "Name both comparison points and the dimension, and check that like is compared with like.",
    ],
    [
      "完整的比较让读者知道结论相对于谁、在哪方面成立。",
      "A complete comparison explains relative to what and in which respect the claim holds.",
    ],
    [
      "下次检查：更好、更多或更快，是和谁相比？",
      "Next time, ask: better, more, or faster than what?",
    ],
    "The cost of trains is lower than cars.",
    "The cost of travelling by train is lower than that of travelling by car.",
    [
      "两边应比较出行成本，而不是把成本和汽车本身比较。",
      "Compare the two costs, rather than a cost with a vehicle.",
    ],
  ),
  COVER_TASK_REQUIREMENTS: feedback(
    ["补上题目要求回答的部分", "Cover the required part of the task"],
    [
      "重新找出题目中的每个提问动作，核对答案是否逐一回应。只补题目明确要求的内容，不额外增加条件。",
      "Identify each action requested by the prompt and check whether the answer covers it. Do not add requirements absent from the prompt.",
    ],
    [
      "语言正确也不能代替回应题目实际提出的问题。",
      "Accurate language does not replace answering the actual question.",
    ],
    [
      "下次检查：题目问了几件事，我的答案分别在哪里回应？",
      "Next time, locate the answer to each part of the prompt.",
    ],
    "Traffic congestion is caused by heavy car use.",
    "Heavy car use contributes to congestion. More reliable buses could reduce the need to drive.",
    [
      "如果题目同时问原因和对策，就需要两者；只问原因时不必额外写对策。",
      "A causes-and-solutions prompt needs both. A causes-only prompt does not require a solution.",
    ],
  ),
  KEEP_SUPPORT_RELEVANT: feedback(
    ["让解释直接支持观点", "Keep the support relevant"],
    [
      "检查这句解释或例子是否真正说明中心观点为什么成立；信息真实但无关，也不能承担论证作用。",
      "Check whether the explanation or example actually supports the controlling claim; a true but unrelated fact is not supporting evidence.",
    ],
    [
      "论证的力量来自支持关系，而不是信息数量。",
      "An argument depends on relevant support, not the quantity of information.",
    ],
    [
      "下次检查：这句话怎样回答中心观点的为什么或怎么发生？",
      "Next time, explain how this sentence answers why or how the main claim holds.",
    ],
    "Buses make commuting affordable. Many buses are blue.",
    "Buses make commuting affordable because a monthly pass can cost less than daily parking.",
    [
      "车身颜色不能证明价格低；票价和停车费的比较才与负担能力有关。",
      "Colour does not support affordability; a relevant comparison of travel costs does.",
    ],
  ),
  QUALIFY_CLAIM: feedback(
    ["给观点加上成立条件", "State the condition for the claim"],
    [
      "检查是否把有条件的结论写成了绝对判断。必要时说明适用人群、情境或比较标准。",
      "Check whether a conditional conclusion has become an absolute claim. Where needed, name the group, context, or comparison criterion.",
    ],
    [
      "明确条件让立场更可信，而不是让立场变得含糊。",
      "A clear condition makes a position more defensible rather than vague.",
    ],
    [
      "下次检查：有没有一种合理情境，会使我的绝对判断不成立？",
      "Next time, look for a reasonable situation in which the absolute claim would fail.",
    ],
    "Working from home always improves productivity.",
    "Working from home can improve productivity for tasks that require uninterrupted concentration.",
    [
      "指出适用任务，比简单地把 always 换成 sometimes 更能解释观点。",
      "Naming the relevant type of task explains more than merely replacing always with sometimes.",
    ],
  ),
  ORDER_PARAGRAPH_IDEAS: feedback(
    ["按读者能跟上的顺序展开", "Order ideas for the reader"],
    [
      "辨认每句在提出观点、解释还是举例，再安排顺序，让后一句有明确的前文依据。",
      "Identify each sentence's role as claim, explanation, or example, then order them so each has the context it needs.",
    ],
    [
      "清晰的顺序能减少读者回头寻找论点的负担。",
      "Clear ordering reduces the need to search backwards for the point.",
    ],
    [
      "下次检查：读者看到这个例子之前，是否已经知道它要说明什么？",
      "Next time, check whether the reader knows what the example illustrates before encountering it.",
    ],
    "For example, bus passes cost less than parking. Public transport can reduce commuting costs.",
    "Public transport can reduce commuting costs. For example, a bus pass may cost less than daily parking.",
    [
      "这是观点后接例子的一种可行顺序；其他顺序只要关系明确，也可以成立。",
      "Claim followed by example is one useful order; other orders can work when the relationship is clear.",
    ],
  ),
  CLARIFY_REFERENCE: feedback(
    ["让代词指代清楚", "Make the referent clear"],
    [
      "检查 it、they、this 等词能否明确指代前文的一个对象或观点；有多个可能对象时，重复关键名词往往更清楚。",
      "Check whether it, they, or this identifies one clear referent; when several are possible, repeat the key noun.",
    ],
    [
      "衔接不仅是少重复词，更重要的是让读者知道你正在谈谁。",
      "Cohesion is not merely avoiding repetition; the reader must know what is being discussed.",
    ],
    [
      "下次检查：读者能否毫不犹豫地指出这个代词所指的对象？",
      "Next time, check whether the reader can identify the referent without hesitation.",
    ],
    "Schools and parents should cooperate. They need more funding.",
    "Schools and parents should cooperate. Schools need more funding.",
    [
      "如果本意是学校需要经费，重复 Schools 可以消除歧义；如果指家长，则应明确写 parents。",
      "If schools need the funding, repeating Schools removes ambiguity. If parents are intended, name parents instead.",
    ],
  ),
} as const;
