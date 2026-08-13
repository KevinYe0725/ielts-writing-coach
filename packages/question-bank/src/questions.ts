export const QUESTION_TYPES = [
  "opinion",
  "discussion",
  "advantages_disadvantages",
  "problems_solutions",
  "two_part",
] as const;

export const TOPICS = [
  "education",
  "technology",
  "environment",
  "health",
  "government",
  "work_economy",
  "society_culture",
  "urban_transport",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
export type QuestionTopic = (typeof TOPICS)[number];

export interface Question {
  readonly id: string;
  readonly type: QuestionType;
  readonly topic: QuestionTopic;
  readonly prompt: string;
  readonly origin: "iwc_original";
  readonly status: "validated";
}

interface OpinionSeed {
  readonly statement: string;
}

interface DiscussionSeed {
  readonly firstView: string;
  readonly secondView: string;
}

interface DevelopmentSeed {
  readonly development: string;
}

interface ProblemSeed {
  readonly situation: string;
}

interface TwoPartSeed {
  readonly context: string;
  readonly firstQuestion: string;
  readonly secondQuestion: string;
}

interface TopicSeeds {
  readonly opinion: readonly [OpinionSeed, OpinionSeed, OpinionSeed];
  readonly discussion: readonly [
    DiscussionSeed,
    DiscussionSeed,
    DiscussionSeed,
  ];
  readonly advantages_disadvantages: readonly [
    DevelopmentSeed,
    DevelopmentSeed,
    DevelopmentSeed,
  ];
  readonly problems_solutions: readonly [ProblemSeed, ProblemSeed, ProblemSeed];
  readonly two_part: readonly [TwoPartSeed, TwoPartSeed, TwoPartSeed];
}

const SEEDS: Readonly<Record<QuestionTopic, TopicSeeds>> = {
  education: {
    opinion: [
      {
        statement:
          "Secondary schools should make practical financial decision-making a compulsory subject, even if this reduces time for traditional academic subjects.",
      },
      {
        statement:
          "Primary schools should replace some individual homework with collaborative projects about the local community.",
      },
      {
        statement:
          "Public universities should be required to offer at least one free short course each year to adults living nearby.",
      },
    ],
    discussion: [
      {
        firstView:
          "teenagers should specialise in a small number of subjects as soon as their strengths become clear",
        secondView:
          "all pupils should follow a broad curriculum until they finish secondary school",
      },
      {
        firstView:
          "examination grades are the fairest way to measure students' progress",
        secondView:
          "portfolios of work provide a more accurate picture of what students can do",
      },
      {
        firstView:
          "schools should start later in the morning to match teenagers' sleep patterns",
        secondView:
          "school hours should continue to fit parents' working schedules",
      },
    ],
    advantages_disadvantages: [
      {
        development:
          "Some schools invite local professionals to teach one lesson each week alongside regular teachers.",
      },
      {
        development:
          "A growing number of schools hold one technology-free day each month, during which students do not use screens in class.",
      },
      {
        development:
          "Some education systems encourage school-leavers to complete a term of community service before entering university.",
      },
    ],
    problems_solutions: [
      {
        situation:
          "Schools in rural areas often struggle to recruit and retain teachers for specialist subjects.",
      },
      {
        situation:
          "Many students now depend on generative AI tools when planning and drafting written assignments.",
      },
      {
        situation:
          "In some cities, children spend most evenings and weekends attending additional private lessons.",
      },
    ],
    two_part: [
      {
        context:
          "More schools are giving every student permanent access to recordings of classroom lessons.",
        firstQuestion: "Why is this practice becoming more common?",
        secondQuestion: "How might it change the role of classroom teachers?",
      },
      {
        context:
          "Some small schools are placing pupils of different ages in the same classroom.",
        firstQuestion: "Why might schools choose this arrangement?",
        secondQuestion:
          "How could it affect children's learning and social development?",
      },
      {
        context:
          "Universities increasingly use group projects as part of students' final grades.",
        firstQuestion: "Why do universities use this form of assessment?",
        secondQuestion: "How can individual contributions be evaluated fairly?",
      },
    ],
  },
  technology: {
    opinion: [
      {
        statement:
          "Smart-home devices should store household data locally by default rather than sending it to company servers.",
      },
      {
        statement:
          "Governments should require manufacturers to make phones and laptops easy for independent repair shops to fix.",
      },
      {
        statement:
          "The use of real-time facial recognition in public places should be prohibited unless a court has approved it.",
      },
    ],
    discussion: [
      {
        firstView:
          "social-media companies should be legally responsible for harmful material in the same way as traditional publishers",
        secondView:
          "these companies should remain neutral platforms that are not responsible for users' posts",
      },
      {
        firstView:
          "AI personal assistants will free people to focus on more valuable work",
        secondView:
          "relying on these assistants will weaken people's ability to solve everyday problems",
      },
      {
        firstView:
          "a single national digital identity makes online services safer and simpler",
        secondView:
          "people should be able to use separate private identities for different online services",
      },
    ],
    advantages_disadvantages: [
      {
        development:
          "Small towns are beginning to use delivery drones for medicines and urgent household supplies.",
      },
      {
        development:
          "City authorities are creating detailed digital replicas of urban areas to test planning decisions before construction begins.",
      },
      {
        development:
          "Many household devices now require a continuing software subscription for features that were previously included in the purchase price.",
      },
    ],
    problems_solutions: [
      {
        situation:
          "Consumers replace electronic devices after only a few years, even when the devices still perform their main functions.",
      },
      {
        situation:
          "Algorithmic recommendations repeatedly show users content similar to what they have already viewed.",
      },
      {
        situation:
          "Unreliable high-speed internet continues to limit education and business opportunities in remote communities.",
      },
    ],
    two_part: [
      {
        context:
          "Voice-controlled digital assistants are increasingly marketed to older adults who live alone.",
        firstQuestion: "Why are these devices attractive to this group?",
        secondQuestion:
          "What effect could they have on older people's independence?",
      },
      {
        context: "A growing number of shops no longer accept cash.",
        firstQuestion: "Why are businesses adopting this policy?",
        secondQuestion: "Which groups may be disadvantaged by it?",
      },
      {
        context:
          "Employers are using software that records workers' computer activity during the day.",
        firstQuestion: "Why do employers introduce such monitoring?",
        secondQuestion: "How might it influence trust within an organisation?",
      },
    ],
  },
  environment: {
    opinion: [
      {
        statement:
          "Cities facing water shortages should charge households a higher rate only for water used above a basic monthly allowance.",
      },
      {
        statement:
          "Visitor numbers in environmentally fragile national parks should be limited even when tourism supports nearby communities.",
      },
      {
        statement:
          "Private lawns should no longer be permitted in new housing developments in regions that experience regular drought.",
      },
    ],
    discussion: [
      {
        firstView:
          "countries should build a small number of very large renewable-energy projects",
        secondView:
          "energy should be produced through many smaller projects owned by local communities",
      },
      {
        firstView:
          "some agricultural land should be returned to nature to restore wildlife",
        secondView:
          "productive land should remain in farming to protect the food supply",
      },
      {
        firstView:
          "environmental progress depends mainly on individuals changing their daily habits",
        secondView:
          "strong regulation of major industries is far more important than personal choices",
      },
    ],
    advantages_disadvantages: [
      {
        development:
          "Restaurants in some cities use a standardised deposit system for reusable takeaway containers.",
      },
      {
        development:
          "Urban authorities are converting selected traffic lanes into continuous green corridors for walking, cycling and wildlife.",
      },
      {
        development:
          "Water-scarce cities are using treated wastewater to maintain public parks and street trees.",
      },
    ],
    problems_solutions: [
      {
        situation:
          "People living in small apartments often find it difficult to separate and store food waste for collection.",
      },
      {
        situation:
          "Low-income neighbourhoods frequently experience higher summer temperatures than wealthier parts of the same city.",
      },
      {
        situation:
          "Synthetic clothing releases tiny plastic fibres during washing, and these fibres eventually enter rivers and oceans.",
      },
    ],
    two_part: [
      {
        context:
          "Buying second-hand clothing and furniture has become more popular among younger consumers.",
        firstQuestion: "Why has this change occurred?",
        secondQuestion: "How significant could its environmental effects be?",
      },
      {
        context:
          "Some coastal communities remain in places that are increasingly exposed to flooding and erosion.",
        firstQuestion: "Why do residents often resist relocation?",
        secondQuestion: "How can relocation programmes be made fairer?",
      },
      {
        context:
          "Artificial lighting remains bright throughout the night in many commercial districts.",
        firstQuestion: "Why is light pollution often overlooked?",
        secondQuestion: "What benefits could result from reducing it?",
      },
    ],
  },
  work_economy: {
    opinion: [
      {
        statement:
          "Companies should offer a four-day working week when employees can maintain the same level of output.",
      },
      {
        statement:
          "Employers should be legally required to publish a salary range in every job advertisement.",
      },
      {
        statement:
          "Tax incentives for businesses should depend partly on how much they invest in training their existing employees.",
      },
    ],
    discussion: [
      {
        firstView: "employees should decide how often they work from home",
        secondView:
          "employers should set the same workplace attendance rules for everyone",
      },
      {
        firstView:
          "some of the profits created by automation should fund a basic income",
        secondView:
          "the money should instead be invested in retraining people for new jobs",
      },
      {
        firstView:
          "governments should direct business support towards small local firms",
        secondView:
          "supporting large employers brings greater benefits to the wider economy",
      },
    ],
    advantages_disadvantages: [
      {
        development:
          "Rural towns are opening shared offices where residents can work remotely for employers based elsewhere.",
      },
      {
        development:
          "Some business owners transfer part of their company to employees through shared ownership schemes.",
      },
      {
        development:
          "Several governments are testing portable benefit accounts that follow gig workers from one platform to another.",
      },
    ],
    problems_solutions: [
      {
        situation:
          "Many advertisements for entry-level jobs ask applicants to have previous professional experience.",
      },
      {
        situation:
          "Remote employees often continue answering work messages well beyond their contracted hours.",
      },
      {
        situation:
          "Towns that depend on seasonal tourism experience large changes in employment and income throughout the year.",
      },
    ],
    two_part: [
      {
        context:
          "Young professionals now change employers more frequently than previous generations did.",
        firstQuestion: "Why has frequent job changing become more common?",
        secondQuestion:
          "How might it affect the development of professional skills?",
      },
      {
        context:
          "More people are starting their first business after the age of fifty.",
        firstQuestion: "Why might older entrepreneurship be increasing?",
        secondQuestion:
          "What support would be most useful to these new business owners?",
      },
      {
        context:
          "Some employers allow staff to exchange part of their salary for additional days of leave.",
        firstQuestion: "Why might workers choose this arrangement?",
        secondQuestion: "How could it affect a company's performance?",
      },
    ],
  },
  health: {
    opinion: [
      {
        statement:
          "Sales of high-sugar drinks should be restricted within walking distance of primary and secondary schools.",
      },
      {
        statement:
          "Large employers should give workers a small amount of paid time each week for physical activity.",
      },
      {
        statement:
          "Basic preventive dental care should be provided free of charge even in health systems where other dental treatment is private.",
      },
    ],
    discussion: [
      {
        firstView:
          "people are mainly responsible for protecting their own health",
        secondView:
          "governments must shape healthier environments because personal choice is not enough",
      },
      {
        firstView:
          "online medical consultations should become the normal first step for non-emergency care",
        secondView:
          "most patients should continue to see a health professional in person",
      },
      {
        firstView:
          "public health budgets should prioritise community sports and prevention",
        secondView:
          "limited funds should be directed towards treating people who are already ill",
      },
    ],
    advantages_disadvantages: [
      {
        development:
          "Doctors in some areas can prescribe social activities, such as gardening groups or art classes, alongside medical treatment.",
      },
      {
        development:
          "Large workplaces are adding nutrition labels to all meals sold in staff cafeterias.",
      },
      {
        development:
          "Streets around schools are being closed to private cars at the beginning and end of the school day.",
      },
    ],
    problems_solutions: [
      {
        situation:
          "People who work rotating night shifts often find it difficult to maintain healthy sleep patterns.",
      },
      {
        situation:
          "Misleading health advice spreads rapidly through short videos and private messaging groups.",
      },
      {
        situation:
          "Many residents of densely populated cities report feeling socially isolated despite living close to other people.",
      },
    ],
    two_part: [
      {
        context:
          "Fitness devices increasingly invite users to share continuous health data with doctors and insurers.",
        firstQuestion: "Why are users willing to share this information?",
        secondQuestion: "How should their privacy be protected?",
      },
      {
        context:
          "Subscription meal kits have become a regular part of many households' diets.",
        firstQuestion: "Why have these services become popular?",
        secondQuestion:
          "How might they influence people's long-term eating habits?",
      },
      {
        context:
          "Many people download wellbeing apps but stop using them after only a few weeks.",
        firstQuestion: "Why do users abandon these apps?",
        secondQuestion:
          "What could make healthy digital habits more sustainable?",
      },
    ],
  },
  government: {
    opinion: [
      {
        statement:
          "Municipal governments should let residents directly decide how a small part of the annual local budget is spent.",
      },
      {
        statement:
          "Every new digital public service should be required to meet strict accessibility standards before it is launched.",
      },
      {
        statement:
          "Detailed data about the cost and performance of public contracts should always be available to citizens.",
      },
    ],
    discussion: [
      {
        firstView:
          "public services should follow the same national standards in every region",
        secondView:
          "local authorities should be free to adapt services to local needs",
      },
      {
        firstView: "urban public transport should be free for everyone",
        secondView:
          "reduced fares should be limited to people who need financial support",
      },
      {
        firstView:
          "governments should spend more on restoring historic public buildings",
        secondView:
          "the same land and funding should be used to provide modern housing and services",
      },
    ],
    advantages_disadvantages: [
      {
        development:
          "Mobile government offices now travel to remote districts to provide documents and advice on scheduled days.",
      },
      {
        development:
          "Some governments ask randomly selected citizens to study complex policies and make recommendations.",
      },
      {
        development:
          "Public libraries are adding workshops where residents can use shared tools and equipment to make or repair objects.",
      },
    ],
    problems_solutions: [
      {
        situation:
          "Applications for public benefits often require long forms, repeated documents and several separate appointments.",
      },
      {
        situation:
          "Emergency warnings do not always reach residents who speak minority languages or have limited internet access.",
      },
      {
        situation:
          "Local governments often prioritise visible new construction while delaying maintenance of existing public facilities.",
      },
    ],
    two_part: [
      {
        context:
          "Public consultations on local policies often attract only a small and unrepresentative group of residents.",
        firstQuestion: "Why is participation usually low?",
        secondQuestion:
          "How can authorities involve a broader range of people?",
      },
      {
        context:
          "More government services are delivered primarily through mobile applications.",
        firstQuestion: "Why are authorities adopting this approach?",
        secondQuestion:
          "Who may be excluded unless alternatives remain available?",
      },
      {
        context:
          "Governments increasingly work with private companies to build and operate public infrastructure.",
        firstQuestion: "Why are these partnerships controversial?",
        secondQuestion: "How can public accountability be protected?",
      },
    ],
  },
  society_culture: {
    opinion: [
      {
        statement:
          "Employees should have a legal right to paid leave when they must care for a seriously ill close relative.",
      },
      {
        statement:
          "Governments should provide financial support to grandparents who regularly care for young children while parents work.",
      },
      {
        statement:
          "All adolescents should complete a short period of community service before leaving secondary school.",
      },
    ],
    discussion: [
      {
        firstView:
          "several generations of a family benefit from living together",
        secondView:
          "adult family members have healthier relationships when they maintain separate homes",
      },
      {
        firstView:
          "parents should use location-tracking technology to keep teenagers safe",
        secondView:
          "constant monitoring prevents teenagers from developing trust and independence",
      },
      {
        firstView:
          "wedding celebrations should reflect the wishes and traditions of the wider family",
        secondView:
          "the couple should make all important decisions about their wedding",
      },
    ],
    advantages_disadvantages: [
      {
        development:
          "Housing projects are being designed so that students, families and older people live in the same shared community.",
      },
      {
        development:
          "Groups of parents are forming neighbourhood cooperatives in which members take turns caring for one another's children.",
      },
      {
        development:
          "Some neighbourhoods operate libraries where residents borrow tools and household equipment rather than buying them.",
      },
    ],
    problems_solutions: [
      {
        situation:
          "New parents can experience severe loneliness even when they have regular online contact with friends and relatives.",
      },
      {
        situation:
          "In many households, paid work is shared more equally than cooking, cleaning and caring responsibilities.",
      },
      {
        situation:
          "Young adults in expensive cities often remain in the family home much longer than they had expected.",
      },
    ],
    two_part: [
      {
        context:
          "Families in many countries now eat together less often than they did in the past.",
        firstQuestion: "Why are shared family meals becoming less common?",
        secondQuestion:
          "How might this affect communication between parents and children?",
      },
      {
        context:
          "Some people increasingly treat pets as their main source of companionship.",
        firstQuestion: "Why might this be happening?",
        secondQuestion: "What wider social effects could result?",
      },
      {
        context:
          "Couples are adopting a wider range of approaches to choosing family surnames after marriage.",
        firstQuestion: "Why are naming practices changing?",
        secondQuestion: "What do these choices reveal about social attitudes?",
      },
    ],
  },
  urban_transport: {
    opinion: [
      {
        statement:
          "Cities that charge drivers to enter congested districts should spend part of the revenue on discounted transport for low-income residents.",
      },
      {
        statement:
          "New apartment buildings located close to major public transport stations should be allowed to provide fewer private parking spaces.",
      },
      {
        statement:
          "City centres should reserve more kerb space for buses, bicycles and deliveries even if less space remains for private-car parking.",
      },
    ],
    discussion: [
      {
        firstView:
          "growing cities should concentrate transport funding on high-capacity rail systems",
        secondView:
          "frequent buses and safe cycling routes would serve a wider range of residents",
      },
      {
        firstView:
          "town centres need plentiful inexpensive parking to protect local shops",
        secondView:
          "reducing car access creates safer and more attractive commercial streets",
      },
      {
        firstView:
          "autonomous public shuttles could make low-demand routes affordable",
        secondView:
          "public transport should retain human drivers for safety and passenger support",
      },
    ],
    advantages_disadvantages: [
      {
        development:
          "Some cities close streets around schools to through traffic at the beginning and end of the school day.",
      },
      {
        development:
          "Road tolls in several cities change by time and location according to current levels of congestion.",
      },
      {
        development:
          "Underused city-centre car parks are being converted into housing, public squares and bicycle facilities.",
      },
    ],
    problems_solutions: [
      {
        situation:
          "Passengers in outer suburbs often face a long or unsafe journey between their homes and the nearest major transport stop.",
      },
      {
        situation:
          "Ride-hailing vehicles can spend substantial time circulating without passengers in already congested urban districts.",
      },
      {
        situation:
          "Delivery vans frequently block bus lanes, cycle lanes and pavements while drivers search for a place to unload goods.",
      },
    ],
    two_part: [
      {
        context:
          "Electric bicycles are becoming a common form of daily transport in many cities.",
        firstQuestion: "Why are commuters choosing electric bicycles?",
        secondQuestion:
          "How might their wider use change urban transport planning?",
      },
      {
        context:
          "A growing proportion of young adults in large cities are delaying or avoiding getting a driving licence.",
        firstQuestion: "Why is this pattern emerging?",
        secondQuestion: "What should city planners learn from it?",
      },
      {
        context:
          "Late-night bus services are often lightly used overall but remain important to particular groups of workers.",
        firstQuestion: "Why do these routes attract relatively few passengers?",
        secondQuestion:
          "How should cities judge whether they are worth maintaining?",
      },
    ],
  },
};

/** Stable preassigned UUIDv7 values for catalog rows; never derive IDs from prompt text. */
function questionUuid(
  topic: QuestionTopic,
  type: QuestionType,
  index: number,
): string {
  const topicIndex = TOPICS.indexOf(topic);
  const typeIndex = QUESTION_TYPES.indexOf(type);
  const ordinal =
    topicIndex * QUESTION_TYPES.length * 3 + typeIndex * 3 + index;
  const timestampMs = BigInt(Date.UTC(2026, 7, 13) + ordinal);
  const randomA = BigInt(ordinal + 1) & 0xfffn;
  const randomB = 0x0123456789abcdefn ^ BigInt(ordinal + 1);
  const value =
    (timestampMs << 80n) |
    (0x7n << 76n) |
    (randomA << 64n) |
    (0x2n << 62n) |
    randomB;
  const hex = value.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildPrompt(
  type: QuestionType,
  seed:
    | OpinionSeed
    | DiscussionSeed
    | DevelopmentSeed
    | ProblemSeed
    | TwoPartSeed,
): string {
  switch (type) {
    case "opinion":
      return `${(seed as OpinionSeed).statement} To what extent do you agree or disagree?`;
    case "discussion": {
      const discussion = seed as DiscussionSeed;
      return `Some people believe that ${discussion.firstView}, while others argue that ${discussion.secondView}. Discuss both views and give your own opinion.`;
    }
    case "advantages_disadvantages":
      return `${(seed as DevelopmentSeed).development} Do the advantages of this development outweigh the disadvantages?`;
    case "problems_solutions":
      return `${(seed as ProblemSeed).situation} What problems does this situation create, and what measures could address them?`;
    case "two_part": {
      const twoPart = seed as TwoPartSeed;
      return `${twoPart.context} ${twoPart.firstQuestion} ${twoPart.secondQuestion}`;
    }
  }
}

function makeQuestion(
  topic: QuestionTopic,
  type: QuestionType,
  index: number,
): Question {
  const seeds = SEEDS[topic][type] as readonly (
    | OpinionSeed
    | DiscussionSeed
    | DevelopmentSeed
    | ProblemSeed
    | TwoPartSeed
  )[];
  const seed = seeds[index];
  if (seed === undefined) {
    throw new Error(`Missing question seed for ${topic}/${type}/${index + 1}`);
  }
  return Object.freeze({
    id: questionUuid(topic, type, index),
    type,
    topic,
    prompt: buildPrompt(type, seed),
    origin: "iwc_original",
    status: "validated",
  });
}

export const QUESTION_BANK: readonly Question[] = Object.freeze(
  TOPICS.flatMap((topic) =>
    QUESTION_TYPES.flatMap((type) =>
      [0, 1, 2].map((index) => makeQuestion(topic, type, index)),
    ),
  ),
);

export function getQuestionById(id: string): Question | undefined {
  return QUESTION_BANK.find((question) => question.id === id);
}

export function listQuestions(
  filters: {
    readonly type?: QuestionType;
    readonly topic?: QuestionTopic;
  } = {},
): readonly Question[] {
  return Object.freeze(
    QUESTION_BANK.filter(
      (question) =>
        (filters.type === undefined || question.type === filters.type) &&
        (filters.topic === undefined || question.topic === filters.topic),
    ),
  );
}
