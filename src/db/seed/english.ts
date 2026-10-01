import type { SeedQuestion } from "./types.ts";

const E = "english" as const;
const C = "Ingilizce";

/**
 * 2. Bolum baslangic sorulari (44 adet).
 *
 * NOT: Resmi ilan Ingilizce bolumu icin CEFR seviyesi BELIRTMEMEKTEDIR.
 * Asagidaki `cefr` degerleri soru yazarinin kendi kalibrasyonudur, resmi bir
 * iddia degildir.
 */
export const ENGLISH_SEED: SeedQuestion[] = [
  // --- Grammar: tenses -----------------------------------------------------
  {
    section: E, category: C, subtopic: "Grammar - tenses", difficulty: "easy", cefr: "A2",
    q: "By the time the auditors arrived, the branch manager ---- all the required documents.",
    a: "prepares", b: "had prepared", c: "is preparing", d: "will prepare",
    correct: "B",
    explanation: "\"By the time\" with a past main clause requires the past perfect for the action completed earlier, so \"had prepared\" is correct. The other options place the action in the present or future, which contradicts \"arrived\".",
    explanationTr: "\"By the time\" kalıbı, ana cümle geçmiş zamandayken daha önce tamamlanan eylem için past perfect ister; bu yüzden \"had prepared\" doğrudur. Diğer seçenekler eylemi şimdiki ya da gelecek zamana taşır ve \"arrived\" ile çelişir.",
  },
  {
    section: E, category: C, subtopic: "Grammar - tenses", difficulty: "medium", cefr: "B1",
    q: "The bank ---- its mobile application three times since 2019.",
    a: "updated", b: "was updating", c: "has updated", d: "had updated",
    correct: "C",
    explanation: "\"Since 2019\" marks a period stretching from the past to now, which requires the present perfect. The simple past would need a finished time reference such as \"in 2019\".",
    explanationTr: "\"Since 2019\" geçmişten bugüne uzanan bir süreyi işaret eder ve present perfect gerektirir. Simple past kullanılsaydı \"in 2019\" gibi bitmiş bir zaman ifadesi gerekirdi.",
  },
  {
    section: E, category: C, subtopic: "Grammar - tenses", difficulty: "medium", cefr: "B1",
    q: "While the technician ---- the server, the power supply suddenly failed.",
    a: "was inspecting", b: "inspects", c: "has inspected", d: "would inspect",
    correct: "A",
    explanation: "The past continuous describes an ongoing action interrupted by a sudden past event introduced by \"suddenly failed\". The simple present and present perfect do not fit a past narrative.",
    explanationTr: "Past continuous, geçmişte sürmekte olan ve ani bir olayla (\"suddenly failed\") kesilen eylemi anlatır. Simple present ve present perfect geçmiş anlatımına uymaz.",
  },
  {
    section: E, category: C, subtopic: "Grammar - tenses", difficulty: "hard", cefr: "B2",
    q: "This time next month, the new core banking system ---- in all branches.",
    a: "will operate", b: "will have been operating", c: "operates", d: "has operated",
    correct: "B",
    explanation: "\"This time next month\" combined with an activity already under way calls for the future perfect continuous, emphasising duration up to a future point. \"Will operate\" merely states a future fact without that continuity.",
    explanationTr: "\"This time next month\" ifadesi, hâlihazırda süren bir eylemle birleşince future perfect continuous ister; gelecekteki bir ana kadar geçen süreyi vurgular. \"Will operate\" ise bu süreklilik anlamı olmadan yalnızca gelecekteki bir olguyu bildirir.",
  },

  // --- Grammar: modals and passives ---------------------------------------
  {
    section: E, category: C, subtopic: "Grammar - modals and passives", difficulty: "medium", cefr: "B1",
    q: "Customers ---- to provide identification before any transaction is processed.",
    a: "require", b: "are requiring", c: "are required", d: "have required",
    correct: "C",
    explanation: "The customers receive the action rather than perform it, so the passive \"are required\" is needed. \"Require\" in the active voice would mean the customers themselves demand something.",
    explanationTr: "Müşteriler eylemi yapan değil, eylemin uygulandığı taraftır; bu yüzden edilgen \"are required\" gerekir. Etken \"require\" kullanılsaydı talebi müşterilerin kendisi yapıyor olurdu.",
  },
  {
    section: E, category: C, subtopic: "Grammar - modals and passives", difficulty: "medium", cefr: "B2",
    q: "The transfer failed, so the account number ---- entered incorrectly.",
    a: "must have been", b: "should be", c: "can be", d: "would be",
    correct: "A",
    explanation: "\"Must have been\" expresses a confident deduction about a past cause, which fits the evidence that the transfer failed. \"Should be\" indicates advice and \"can be\" expresses general possibility, neither of which draws a past conclusion.",
    explanationTr: "\"Must have been\", geçmişteki bir nedene dair güçlü çıkarım bildirir ve transferin başarısız olması kanıtıyla örtüşür. \"Should be\" tavsiye, \"can be\" genel olasılık bildirir; hiçbiri geçmişe dönük sonuç çıkarmaz.",
  },
  {
    section: E, category: C, subtopic: "Grammar - modals and passives", difficulty: "medium", cefr: "B1",
    q: "You ---- share your password with anyone, including bank staff.",
    a: "don't have to", b: "must not", c: "might not", d: "needn't",
    correct: "B",
    explanation: "\"Must not\" expresses prohibition, which is what a security rule requires. \"Don't have to\" and \"needn't\" merely indicate absence of obligation, which would reverse the meaning.",
    explanationTr: "\"Must not\" yasak bildirir; bir güvenlik kuralının gerektirdiği de budur. \"Don't have to\" ve \"needn't\" yalnızca zorunluluk olmadığını söyler ve anlamı tersine çevirir.",
  },

  // --- Grammar: conditionals ----------------------------------------------
  {
    section: E, category: C, subtopic: "Grammar - conditionals (if clauses)", difficulty: "medium", cefr: "B1",
    q: "If the system ---- down again, we will switch to the backup server.",
    a: "will go", b: "goes", c: "went", d: "had gone",
    correct: "B",
    explanation: "In a first conditional the if-clause takes the simple present while the main clause uses \"will\". Placing \"will\" in the if-clause is a common error.",
    explanationTr: "Birinci tip koşul cümlesinde if'li yan cümle simple present, ana cümle \"will\" alır. \"Will\"i if'li cümlenin içine koymak sık yapılan bir hatadır.",
  },
  {
    section: E, category: C, subtopic: "Grammar - conditionals (if clauses)", difficulty: "hard", cefr: "B2",
    q: "If the team had tested the update properly, the outage ---- last weekend.",
    a: "would not occur", b: "will not occur", c: "would not have occurred", d: "did not occur",
    correct: "C",
    explanation: "A third conditional refers to an unreal past situation and requires \"would have + past participle\" in the main clause. \"Would not occur\" belongs to the second conditional, which refers to the present or future.",
    explanationTr: "Üçüncü tip koşul cümlesi geçmişte gerçekleşmemiş bir durumu anlatır ve ana cümlede \"would have + V3\" ister. \"Would not occur\" ise bugüne/geleceğe bakan ikinci tip koşul cümlesine aittir.",
  },
  {
    section: E, category: C, subtopic: "Grammar - conditionals (if clauses)", difficulty: "hard", cefr: "C1",
    q: "---- the regulation been published earlier, banks would have had more time to adapt.",
    a: "If", b: "Had", c: "Unless", d: "Should",
    correct: "B",
    explanation: "In formal inversion the auxiliary \"had\" replaces \"if\", producing \"Had the regulation been published...\". \"If\" would require the standard order \"If the regulation had been published\".",
    explanationTr: "Resmî devrik yapıda yardımcı fiil \"had\", \"if\"in yerini alır: \"Had the regulation been published...\". \"If\" seçilseydi \"If the regulation had been published\" düz sırası gerekirdi.",
  },

  // --- Grammar: relative and noun clauses ---------------------------------
  {
    section: E, category: C, subtopic: "Grammar - relative and noun clauses", difficulty: "medium", cefr: "B1",
    q: "The analyst ---- report we discussed yesterday has been promoted.",
    a: "who", b: "which", c: "whose", d: "whom",
    correct: "C",
    explanation: "\"Whose\" shows possession and correctly links the analyst to the report. \"Who\" and \"whom\" cannot be followed directly by a noun in this position.",
    explanationTr: "\"Whose\" iyelik bildirir ve analisti raporla doğru biçimde ilişkilendirir. \"Who\" ve \"whom\" bu konumda doğrudan bir ismin önüne gelemez.",
  },
  {
    section: E, category: C, subtopic: "Grammar - relative and noun clauses", difficulty: "hard", cefr: "B2",
    q: "Nobody could explain ---- the discrepancy in the quarterly figures had appeared.",
    a: "how", b: "what", c: "which", d: "that",
    correct: "A",
    explanation: "The noun clause needs a question word describing the manner in which the discrepancy appeared, so \"how\" fits. \"What\" and \"which\" would require the clause to lack a subject or object, but the clause is already complete.",
    explanationTr: "İsim cümleciği, tutarsızlığın ne şekilde ortaya çıktığını anlatan bir soru sözcüğü ister; bu yüzden \"how\" uyar. \"What\" ve \"which\" için cümlecikte eksik bir özne ya da nesne bulunması gerekirdi, oysa cümlecik zaten tamdır.",
  },
  {
    section: E, category: C, subtopic: "Grammar - relative and noun clauses", difficulty: "medium", cefr: "B2",
    q: "The branch ---- we opened last year is already profitable.",
    a: "where", b: "which", c: "when", d: "whose",
    correct: "B",
    explanation: "\"Branch\" is the object of \"opened\", so an object relative pronoun such as \"which\" is required. \"Where\" would be used only if the branch were the place in which something else happened.",
    explanationTr: "\"Branch\", \"opened\" fiilinin nesnesidir; dolayısıyla \"which\" gibi nesne görevli bir ilgi zamiri gerekir. \"Where\" ancak şube, başka bir olayın geçtiği yer olsaydı kullanılırdı.",
  },

  // --- Grammar: prepositions / conjunctions -------------------------------
  {
    section: E, category: C, subtopic: "Grammar - prepositions", difficulty: "easy", cefr: "A2",
    q: "The interest rate depends ---- the maturity of the deposit.",
    a: "of", b: "on", c: "from", d: "to",
    correct: "B",
    explanation: "The verb \"depend\" is always followed by the preposition \"on\" in standard English. The other prepositions do not collocate with this verb.",
    explanationTr: "\"Depend\" fiili standart İngilizcede daima \"on\" edatıyla kullanılır. Diğer edatlar bu fiille birlikte gelmez.",
  },
  {
    section: E, category: C, subtopic: "Grammar - prepositions", difficulty: "medium", cefr: "B1",
    q: "The committee is responsible ---- approving all credit applications above the limit.",
    a: "of", b: "with", c: "for", d: "about",
    correct: "C",
    explanation: "\"Responsible for\" is the fixed collocation when stating what someone is in charge of. \"Responsible to\" would indicate the person or body one reports to.",
    explanationTr: "Birinin neyden sorumlu olduğu söylenirken kullanılan kalıp \"responsible for\"dur. \"Responsible to\" ise kişinin kime karşı hesap verdiğini belirtir.",
  },
  {
    section: E, category: C, subtopic: "Grammar - conjunctions and connectors", difficulty: "medium", cefr: "B1",
    q: "The proposal was well prepared; ----, the board rejected it.",
    a: "therefore", b: "moreover", c: "nevertheless", d: "similarly",
    correct: "C",
    explanation: "The two clauses contrast, so a concessive connector such as \"nevertheless\" is required. \"Therefore\" would signal a result and \"moreover\" an addition, neither of which fits.",
    explanationTr: "İki cümle arasında karşıtlık vardır; bu yüzden \"nevertheless\" gibi bir karşıtlık bağlacı gerekir. \"Therefore\" sonuç, \"moreover\" ekleme bildirir ve buraya uymaz.",
  },
  {
    section: E, category: C, subtopic: "Grammar - conjunctions and connectors", difficulty: "medium", cefr: "B2",
    q: "---- the rise in operating costs, the bank managed to increase its net profit.",
    a: "Because of", b: "In spite of", c: "Thanks to", d: "Due to",
    correct: "B",
    explanation: "The sentence expresses an unexpected result, which requires a concessive prepositional phrase such as \"in spite of\". The other three all introduce a cause, producing an illogical meaning here.",
    explanationTr: "Cümle beklenmedik bir sonuç bildirir ve \"in spite of\" gibi karşıtlık bildiren bir edat öbeği ister. Diğer üç seçenek neden bildirir ve burada mantıksız bir anlam oluşturur.",
  },

  // --- Vocabulary ----------------------------------------------------------
  {
    section: E, category: C, subtopic: "Vocabulary", difficulty: "easy", cefr: "A2",
    q: "A sum of money that a bank lends and expects to be paid back with interest is called a ----.",
    a: "deposit", b: "loan", c: "fee", d: "balance",
    correct: "B",
    explanation: "A loan is money advanced by a lender and repaid with interest. A deposit is money placed into an account, a fee is a charge for a service and a balance is the amount currently held.",
    explanationTr: "\"Loan\", bankanın verdiği ve faiziyle geri ödenmesini beklediği paradır. \"Deposit\" hesaba yatırılan para, \"fee\" hizmet karşılığı alınan ücret, \"balance\" ise hesaptaki mevcut tutardır.",
  },
  {
    section: E, category: C, subtopic: "Vocabulary", difficulty: "medium", cefr: "B1",
    q: "The auditor asked for further evidence because the explanation seemed ----.",
    a: "thorough", b: "plausible", c: "inadequate", d: "definitive",
    correct: "C",
    explanation: "Asking for further evidence implies the explanation was insufficient, which \"inadequate\" expresses. \"Thorough\", \"plausible\" and \"definitive\" would all suggest that no further evidence was needed.",
    explanationTr: "Ek kanıt istenmesi, açıklamanın yetersiz olduğunu ima eder; bunu karşılayan sözcük \"inadequate\"tir. \"Thorough\", \"plausible\" ve \"definitive\" ise ek kanıta gerek olmadığını düşündürürdü.",
  },
  {
    section: E, category: C, subtopic: "Vocabulary", difficulty: "medium", cefr: "B2",
    q: "Regulators imposed a heavy fine to ---- other institutions from similar misconduct.",
    a: "deter", b: "detect", c: "devote", d: "denote",
    correct: "A",
    explanation: "\"Deter\" means to discourage someone from acting, which matches the purpose of a fine. \"Detect\" means to discover, \"devote\" to dedicate and \"denote\" to indicate.",
    explanationTr: "\"Deter\", birini bir eylemden caydırmak demektir ve cezanın amacıyla örtüşür. \"Detect\" tespit etmek, \"devote\" adamak, \"denote\" ise işaret etmek anlamındadır.",
  },
  {
    section: E, category: C, subtopic: "Vocabulary", difficulty: "hard", cefr: "C1",
    q: "The report was criticised for being ----; it offered opinions without supporting data.",
    a: "substantiated", b: "unfounded", c: "exhaustive", d: "meticulous",
    correct: "B",
    explanation: "\"Unfounded\" describes claims made without supporting evidence, which matches the criticism. \"Substantiated\", \"exhaustive\" and \"meticulous\" all imply thoroughness or proof.",
    explanationTr: "\"Unfounded\", kanıtla desteklenmeyen iddiaları niteler; eleştiriyle uyuşan da budur. \"Substantiated\", \"exhaustive\" ve \"meticulous\" ise kanıt ya da titizlik ima eder.",
  },
  {
    section: E, category: C, subtopic: "Contextual vocabulary", difficulty: "medium", cefr: "B2",
    q: "In the sentence \"The company liquidated its assets to settle outstanding debts\", the word \"outstanding\" means ----.",
    a: "excellent", b: "unpaid", c: "noticeable", d: "temporary",
    correct: "B",
    explanation: "In a financial context \"outstanding\" describes amounts that remain unpaid. The meaning \"excellent\" applies in general usage but not in this collocation with \"debts\".",
    explanationTr: "Finans bağlamında \"outstanding\", ödenmemiş tutarları anlatır. \"Mükemmel\" anlamı günlük kullanımda geçerlidir ama \"debts\" ile kurulan bu kalıpta geçerli değildir.",
  },
  {
    section: E, category: C, subtopic: "Contextual vocabulary", difficulty: "hard", cefr: "C1",
    q: "In \"The manager's remarks were tempered by an awareness of the risks involved\", \"tempered\" is closest in meaning to ----.",
    a: "intensified", b: "moderated", c: "postponed", d: "contradicted",
    correct: "B",
    explanation: "To temper something is to make it less extreme, so \"moderated\" is the closest synonym. \"Intensified\" would express the opposite effect.",
    explanationTr: "\"To temper\" bir şeyi daha ılımlı hâle getirmek demektir; en yakın eş anlamlısı \"moderated\"tir. \"Intensified\" tam tersi etkiyi anlatırdı.",
  },
  {
    section: E, category: C, subtopic: "Phrasal verbs and collocations", difficulty: "medium", cefr: "B1",
    q: "The meeting was ---- until next week because the CFO was unavailable.",
    a: "put off", b: "put up", c: "put down", d: "put through",
    correct: "A",
    explanation: "\"Put off\" means to postpone, which matches \"until next week\". \"Put through\" means to connect a phone call and \"put down\" to write something or to criticise.",
    explanationTr: "\"Put off\" ertelemek demektir ve \"until next week\" ile uyuşur. \"Put through\" telefon bağlantısı kurmak, \"put down\" ise not almak ya da küçümsemek anlamındadır.",
  },
  {
    section: E, category: C, subtopic: "Phrasal verbs and collocations", difficulty: "medium", cefr: "B2",
    q: "We need to ---- the figures once more before submitting the report.",
    a: "look after", b: "go over", c: "get by", d: "take after",
    correct: "B",
    explanation: "\"Go over\" means to review something carefully, which fits checking figures. \"Look after\" means to take care of and \"take after\" to resemble a relative.",
    explanationTr: "\"Go over\" bir şeyi dikkatle gözden geçirmek demektir; rakamları kontrol etmeye uyan da budur. \"Look after\" bakmak, \"take after\" ise bir akrabaya benzemek anlamındadır.",
  },
  {
    section: E, category: C, subtopic: "Phrasal verbs and collocations", difficulty: "hard", cefr: "B2",
    q: "Despite the initial setback, the negotiating team refused to ---- their demands.",
    a: "give up on", b: "come across", c: "run into", d: "look up to",
    correct: "A",
    explanation: "\"Give up on\" means to abandon something, which fits refusing to abandon demands. \"Come across\" means to encounter by chance and \"run into\" to meet unexpectedly.",
    explanationTr: "\"Give up on\" bir şeyden vazgeçmek demektir; taleplerden vazgeçmeyi reddetmek anlamına uyar. \"Come across\" tesadüfen rastlamak, \"run into\" ise beklenmedik şekilde karşılaşmak demektir.",
  },

  // --- Sentence completion -------------------------------------------------
  {
    section: E, category: C, subtopic: "Sentence completion", difficulty: "medium", cefr: "B1",
    q: "Although the interest rates were attractive, ----.",
    a: "the bank reported a record profit", b: "many customers hesitated to invest", c: "the campaign ran for three months", d: "deposits are insured by law",
    correct: "B",
    explanation: "\"Although\" signals contrast, so the main clause must express an unexpected outcome such as customer hesitation. The other options do not contrast with attractive rates.",
    explanationTr: "\"Although\" karşıtlık bildirir; bu yüzden ana cümlede müşterilerin tereddüt etmesi gibi beklenmedik bir sonuç bulunmalıdır. Diğer seçenekler cazip faiz oranlarıyla karşıtlık oluşturmaz.",
  },
  {
    section: E, category: C, subtopic: "Sentence completion", difficulty: "hard", cefr: "B2",
    q: "---- so that employees can respond to security incidents without delay.",
    a: "The procedure was documented in detail", b: "The office was relocated last year", c: "The budget was reduced significantly", d: "The building has three entrances",
    correct: "A",
    explanation: "The purpose clause \"so that employees can respond... without delay\" must follow an action that enables a fast response, and detailed documentation does exactly that. Relocation, budget cuts and the number of entrances have no logical link to incident response speed.",
    explanationTr: "\"So that employees can respond... without delay\" amaç cümleciği, hızlı tepkiyi mümkün kılan bir eylemin ardından gelmelidir; ayrıntılı dokümantasyon tam olarak bunu sağlar. Taşınma, bütçe kesintisi ve giriş sayısı olaya müdahale hızıyla mantıksal olarak bağlantılı değildir.",
  },
  {
    section: E, category: C, subtopic: "Sentence completion", difficulty: "medium", cefr: "B2",
    q: "The new compliance rules are strict; ----.",
    a: "however, they were announced in June", b: "therefore, every transaction must be logged", c: "moreover, the office closes at five", d: "similarly, the canteen was renovated",
    correct: "B",
    explanation: "\"Therefore\" introduces a consequence that follows logically from strict rules, namely mandatory logging. The other connectors introduce information unrelated to the strictness of the rules.",
    explanationTr: "\"Therefore\", katı kurallardan mantıksal olarak çıkan sonucu, yani her işlemin kayıt altına alınması zorunluluğunu getirir. Diğer bağlaçlar kuralların katılığıyla ilgisiz bilgiler getirir.",
  },

  // --- Irrelevant sentence -------------------------------------------------
  {
    section: E, category: C, subtopic: "Irrelevant sentence", difficulty: "medium", cefr: "B2",
    passage: "(I) Contactless payment has grown rapidly in the last decade. (II) It allows customers to complete a transaction by tapping a card or phone. (III) Banks report that the average transaction time has fallen sharply. (IV) The first coins were minted in Anatolia in the seventh century BC.",
    q: "Which sentence does not belong in the paragraph?",
    a: "I", b: "II", c: "III", d: "IV",
    correct: "D",
    explanation: "Sentences I to III all concern modern contactless payment, while IV shifts to ancient coinage and breaks the topical unity. Historical background of this kind would need its own separate context.",
    explanationTr: "I-III arasındaki cümleler günümüzdeki temassız ödemeyi anlatırken IV antik sikke basımına geçerek konu bütünlüğünü bozar. Bu tür tarihsel arka plan ayrı bir bağlam gerektirir.",
  },
  {
    section: E, category: C, subtopic: "Irrelevant sentence", difficulty: "hard", cefr: "B2",
    passage: "(I) Phishing remains one of the most common attack methods against bank customers. (II) Attackers imitate official messages to obtain credentials. (III) Training programmes have been shown to reduce click rates substantially. (IV) The bank plans to open twelve new branches this year.",
    q: "Which sentence disrupts the unity of the paragraph?",
    a: "I", b: "II", c: "III", d: "IV",
    correct: "D",
    explanation: "The paragraph develops a single theme, phishing and defences against it, but IV introduces branch expansion. Sentence III still fits because training is a countermeasure to phishing.",
    explanationTr: "Paragraf tek bir temayı, oltalama saldırılarını ve bunlara karşı alınan önlemleri işler; IV ise şube açılışını gündeme getirir. III hâlâ uyumludur, çünkü eğitim oltalamaya karşı bir önlemdir.",
  },

  // --- Cloze test ----------------------------------------------------------
  {
    section: E, category: C, subtopic: "Cloze test", difficulty: "medium", cefr: "B1",
    passage: "Central banks use interest rates as their main policy tool. When inflation rises, they usually (1)---- rates in order to reduce spending. Higher borrowing costs make loans less attractive, and demand across the economy (2)---- slows down.",
    q: "Which option best fits blank (1)?",
    a: "lower", b: "raise", c: "ignore", d: "publish",
    correct: "B",
    explanation: "To reduce spending during inflation, central banks raise rates and make borrowing more expensive. Lowering rates would stimulate spending and worsen inflation.",
    explanationTr: "Enflasyon dönemlerinde harcamayı kısmak için merkez bankaları faizi yükseltir ve borçlanmayı pahalılaştırır. Faizi düşürmek harcamayı teşvik eder ve enflasyonu kötüleştirirdi.",
  },
  {
    section: E, category: C, subtopic: "Cloze test", difficulty: "medium", cefr: "B1",
    passage: "Central banks use interest rates as their main policy tool. When inflation rises, they usually (1)---- rates in order to reduce spending. Higher borrowing costs make loans less attractive, and demand across the economy (2)---- slows down.",
    q: "Which option best fits blank (2)?",
    a: "gradually", b: "reluctantly", c: "rarely", d: "hardly",
    correct: "A",
    explanation: "\"Gradually\" describes the pace at which demand responds to higher borrowing costs and fits the causal chain. \"Rarely\" and \"hardly\" would contradict the stated effect.",
    explanationTr: "\"Gradually\", talebin artan borçlanma maliyetine hangi hızda tepki verdiğini anlatır ve neden-sonuç zincirine uyar. \"Rarely\" ve \"hardly\" belirtilen etkiyle çelişirdi.",
  },
  {
    section: E, category: C, subtopic: "Cloze test", difficulty: "hard", cefr: "B2",
    passage: "Operational risk refers to losses (1)---- from failed internal processes, people or systems. Unlike credit risk, it cannot be eliminated simply by diversifying a portfolio; it must be managed through controls, monitoring and a culture (2)---- encourages reporting.",
    q: "Which option best fits blank (1)?",
    a: "resulting", b: "result", c: "resulted", d: "to result",
    correct: "A",
    explanation: "A reduced relative clause requires the present participle \"resulting\", equivalent to \"that result from\". The finite forms would need a relative pronoun before them.",
    explanationTr: "Kısaltılmış ilgi cümleciğinde \"that result from\" karşılığı olarak present participle \"resulting\" gerekir. Çekimli biçimlerin önünde bir ilgi zamiri bulunması gerekirdi.",
  },
  {
    section: E, category: C, subtopic: "Cloze test", difficulty: "hard", cefr: "B2",
    passage: "Operational risk refers to losses (1)---- from failed internal processes, people or systems. Unlike credit risk, it cannot be eliminated simply by diversifying a portfolio; it must be managed through controls, monitoring and a culture (2)---- encourages reporting.",
    q: "Which option best fits blank (2)?",
    a: "which", b: "what", c: "whose", d: "where",
    correct: "A",
    explanation: "\"Culture\" is the subject of \"encourages\", so a subject relative pronoun such as \"which\" is required. \"What\" cannot follow an expressed antecedent and \"whose\" would need a following noun.",
    explanationTr: "\"Culture\" sözcüğü \"encourages\" fiilinin öznesidir; bu yüzden \"which\" gibi özne görevli bir ilgi zamiri gerekir. \"What\" belirtilmiş bir öncülden sonra gelemez, \"whose\" ise ardından bir isim ister.",
  },

  // --- Paragraph completion ------------------------------------------------
  {
    section: E, category: C, subtopic: "Paragraph completion", difficulty: "hard", cefr: "B2",
    passage: "Machine learning models used in credit scoring can reproduce historical bias. If past lending decisions favoured certain groups, the training data will carry that pattern forward. ---- For this reason, many regulators now require lenders to document how their models reach a decision.",
    q: "Which sentence best completes the paragraph?",
    a: "Interest rates are set by the central bank.", b: "The model may then appear accurate while systematically disadvantaging applicants.", c: "Most banks prefer to open branches in city centres.", d: "Credit cards were first issued in the 1950s.",
    correct: "B",
    explanation: "The missing sentence must bridge biased training data and the demand for explainability, and option B states precisely that consequence. The other options introduce unrelated facts and break the causal chain.",
    explanationTr: "Eksik cümle, önyargılı eğitim verisi ile açıklanabilirlik talebi arasında köprü kurmalıdır; B seçeneği tam olarak bu sonucu ifade eder. Diğer seçenekler ilgisiz bilgiler getirip neden-sonuç zincirini kırar.",
  },
  {
    section: E, category: C, subtopic: "Paragraph completion", difficulty: "medium", cefr: "B1",
    passage: "Remote work changed how teams communicate. Messages replaced many short conversations that once happened at the desk. ---- Teams that write clearly therefore tend to coordinate better than those that rely on quick verbal updates.",
    q: "Which sentence best completes the paragraph?",
    a: "As a result, written communication became a core professional skill.", b: "Offices were redesigned with more meeting rooms.", c: "Laptop sales declined during the same period.", d: "Most companies still use paper archives.",
    correct: "A",
    explanation: "The sentence must connect the shift to messaging with the closing claim about writing clearly, and option A provides that link. The other options do not lead to the conclusion about written coordination.",
    explanationTr: "Cümle, mesajlaşmaya geçişle \"açık yazan ekipler daha iyi koordine olur\" sonucunu birbirine bağlamalıdır; bunu sağlayan A seçeneğidir. Diğer seçenekler yazılı koordinasyon sonucuna götürmez.",
  },

  // --- Reading comprehension -----------------------------------------------
  {
    section: E, category: C, subtopic: "Reading comprehension", difficulty: "medium", cefr: "B2",
    passage: "Open banking requires banks to share customer account data with licensed third parties, but only with the customer's explicit consent. Supporters argue that it increases competition, since new providers can build services on top of existing accounts without running a bank themselves. Critics counter that many customers do not fully understand what they are consenting to, and that responsibility for a data breach becomes harder to assign once several parties are involved. Most regulators have responded by tightening consent requirements rather than restricting data sharing itself.",
    q: "According to the passage, what is the main concern raised by critics of open banking?",
    a: "That it reduces competition among banks", b: "That customers may consent without understanding, and accountability becomes unclear", c: "That third parties are not allowed to access account data", d: "That regulators have banned data sharing entirely",
    correct: "B",
    explanation: "The passage states that critics focus on limited customer understanding of consent and on the difficulty of assigning responsibility after a breach. Competition is presented as an argument in favour, and regulators are said to tighten consent rather than ban sharing.",
    explanationTr: "Metne göre eleştirmenler, müşterilerin rıza verirken neyi onayladıklarını tam anlamamasına ve veri ihlali sonrası sorumluluğun belirlenmesindeki güçlüğe odaklanır. Rekabet lehte bir argüman olarak sunulur; düzenleyiciler de paylaşımı yasaklamak yerine rıza şartlarını sıkılaştırmaktadır.",
  },
  {
    section: E, category: C, subtopic: "Reading comprehension", difficulty: "medium", cefr: "B2",
    passage: "Open banking requires banks to share customer account data with licensed third parties, but only with the customer's explicit consent. Supporters argue that it increases competition, since new providers can build services on top of existing accounts without running a bank themselves. Critics counter that many customers do not fully understand what they are consenting to, and that responsibility for a data breach becomes harder to assign once several parties are involved. Most regulators have responded by tightening consent requirements rather than restricting data sharing itself.",
    q: "What can be inferred about the regulators' approach described in the passage?",
    a: "They consider data sharing itself to be the problem.", b: "They have chosen to strengthen the consent process instead of limiting data sharing.", c: "They have taken no action at all.", d: "They require third parties to become licensed banks.",
    correct: "B",
    explanation: "The final sentence explicitly contrasts tightening consent requirements with restricting data sharing, indicating the former was chosen. Nothing in the text suggests inaction or a requirement to become a bank.",
    explanationTr: "Son cümle, veri paylaşımını kısıtlamak ile rıza şartlarını sıkılaştırmak arasında açık bir karşıtlık kurar ve ikincisinin seçildiğini gösterir. Metinde ne eylemsizlik ne de üçüncü tarafların banka lisansı alması şartı vardır.",
  },
  {
    section: E, category: C, subtopic: "Reading comprehension", difficulty: "hard", cefr: "C1",
    passage: "For decades, productivity statistics have failed to reflect the scale of investment in information technology, a puzzle economists call the productivity paradox. One explanation is measurement: national accounts capture output poorly when quality improves without a change in price. Another is timing. Historical studies of electrification suggest that general-purpose technologies deliver measurable gains only after firms reorganise the way work is done, which can take a generation. On this reading, disappointing figures reflect not the weakness of the technology but the slowness of organisational change.",
    q: "Which statement best expresses the author's position?",
    a: "Information technology has not improved productivity at all.", b: "Productivity statistics are deliberately falsified.", c: "Weak measured gains may reflect slow organisational adaptation rather than weak technology.", d: "Electrification produced immediate productivity gains.",
    correct: "C",
    explanation: "The final sentence states that the figures reflect the slowness of organisational change rather than weak technology. The electrification example is used precisely to show that gains were delayed, not immediate.",
    explanationTr: "Son cümle, rakamların teknolojinin zayıflığını değil örgütsel değişimin yavaşlığını yansıttığını söyler. Elektriklenme örneği de kazanımların ani değil gecikmeli olduğunu göstermek için verilmiştir.",
  },
  {
    section: E, category: C, subtopic: "Reading comprehension", difficulty: "hard", cefr: "C1",
    passage: "For decades, productivity statistics have failed to reflect the scale of investment in information technology, a puzzle economists call the productivity paradox. One explanation is measurement: national accounts capture output poorly when quality improves without a change in price. Another is timing. Historical studies of electrification suggest that general-purpose technologies deliver measurable gains only after firms reorganise the way work is done, which can take a generation. On this reading, disappointing figures reflect not the weakness of the technology but the slowness of organisational change.",
    q: "Why does the author mention national accounts?",
    a: "To give an example of how output may be mismeasured when quality rises", b: "To prove that governments underinvest in technology", c: "To compare different countries' growth rates", d: "To argue that prices should be regulated",
    correct: "A",
    explanation: "National accounts are introduced as the measurement explanation: they capture output poorly when quality improves without price changes. No comparison between countries or argument about regulation is made.",
    explanationTr: "Ulusal hesaplar, ölçüm açıklamasının örneği olarak anılır: fiyat değişmeden kalite arttığında çıktıyı iyi ölçemezler. Metinde ülkeler arası karşılaştırma ya da fiyat düzenlemesi savı yoktur.",
  },
  {
    section: E, category: C, subtopic: "Reading comprehension", difficulty: "medium", cefr: "B1",
    passage: "A sandbox is a controlled environment in which a financial institution can test a new product with a limited number of real customers. The regulator monitors the trial closely and can stop it at any point. If the product performs safely, the firm may apply for a full licence. Sandboxes were introduced because traditional approval processes were often too slow for rapidly changing services.",
    q: "According to the passage, why were regulatory sandboxes introduced?",
    a: "Because traditional approval was too slow for fast-changing services", b: "Because regulators wanted to reduce the number of new products", c: "Because firms refused to apply for licences", d: "Because customers demanded lower fees",
    correct: "A",
    explanation: "The final sentence gives the reason directly: traditional approval processes were too slow for rapidly changing services. The passage does not mention fees, refusals or an intention to limit new products.",
    explanationTr: "Son cümle nedeni doğrudan verir: geleneksel onay süreçleri hızla değişen hizmetler için fazla yavaştır. Metinde ücretlerden, başvurudan kaçınmaktan ya da ürün sayısını kısma niyetinden söz edilmez.",
  },

  // --- Translation ---------------------------------------------------------
  {
    section: E, category: C, subtopic: "Translation (EN-TR)", difficulty: "medium", cefr: "B1",
    q: "\"The bank has decided to postpone the launch of the new product until further notice.\" cümlesinin en uygun Türkçe karşılığı hangisidir?",
    a: "Banka, yeni ürünün tanıtımını iptal etmeye karar verdi.", b: "Banka, yeni ürünün piyasaya sürülmesini ikinci bir duyuruya kadar ertelemeye karar verdi.", c: "Banka, yeni ürünü bir hafta içinde piyasaya sürecek.", d: "Banka, yeni ürünün tanıtımını hızlandırmaya karar verdi.",
    correct: "B",
    explanation: "\"Postpone\" ertelemek, \"until further notice\" ise ikinci bir duyuruya kadar anlamındadır ve B bunu tam olarak karşılar. İptal etmek (cancel) ve hızlandırmak (accelerate) farklı eylemlerdir.",
  },
  {
    section: E, category: C, subtopic: "Translation (TR-EN)", difficulty: "medium", cefr: "B2",
    q: "\"Şube müdürü, riskli kredilerin yeniden değerlendirilmesini talep etti.\" cümlesinin en uygun İngilizce karşılığı hangisidir?",
    a: "The branch manager requested that risky loans be reassessed.", b: "The branch manager refused to assess risky loans.", c: "The branch manager was asked to reassess risky loans.", d: "The branch manager reassessed the risky loans himself.",
    correct: "A",
    explanation: "Özne talebi yapan taraftır ve \"request that ... be reassessed\" kalıbı yeniden değerlendirilme talebini doğru aktarır. C seçeneğinde özne talebi alan taraf hâline gelir, bu da anlamı tersine çevirir.",
  },

  // --- Mixed / additional --------------------------------------------------
  {
    section: E, category: C, subtopic: "Grammar - tenses", difficulty: "easy", cefr: "A2",
    q: "Our branch ---- at nine o'clock every weekday.",
    a: "opens", b: "is opening", c: "opened", d: "has opened",
    correct: "A",
    explanation: "\"Every weekday\" indicates a repeated routine, which the simple present expresses. The present continuous would describe an action happening right now.",
    explanationTr: "\"Every weekday\" tekrarlanan bir rutini bildirir; bunu simple present karşılar. Present continuous ise tam şu an sürmekte olan bir eylemi anlatırdı.",
  },
  {
    section: E, category: C, subtopic: "Vocabulary", difficulty: "easy", cefr: "A2",
    q: "A written record showing money paid into and out of an account is called a bank ----.",
    a: "statement", b: "statement fee", c: "guarantee", d: "cheque",
    correct: "A",
    explanation: "A bank statement lists the transactions on an account over a period. A cheque is an instruction to pay and a guarantee is a promise to cover another party's obligation.",
    explanationTr: "\"Bank statement\", bir dönem boyunca hesaptaki hareketleri listeleyen belgedir. \"Cheque\" ödeme talimatı, \"guarantee\" ise başka bir tarafın yükümlülüğünü üstlenme sözüdür.",
  },
  {
    section: E, category: C, subtopic: "Grammar - conjunctions and connectors", difficulty: "easy", cefr: "B1",
    q: "The application was rejected ---- the applicant did not provide proof of income.",
    a: "although", b: "because", c: "whereas", d: "unless",
    correct: "B",
    explanation: "The missing document is the reason for rejection, so the causal conjunction \"because\" is required. \"Although\" and \"whereas\" would signal contrast, which does not fit.",
    explanationTr: "Belgenin sunulmaması reddin nedenidir; bu yüzden neden bildiren \"because\" bağlacı gerekir. \"Although\" ve \"whereas\" karşıtlık bildirir ve buraya uymaz.",
  },
  {
    section: E, category: C, subtopic: "Contextual vocabulary", difficulty: "medium", cefr: "B1",
    q: "In \"The figures in the two reports do not reconcile\", the verb \"reconcile\" means ----.",
    a: "to agree or match", b: "to be published", c: "to increase", d: "to be approved",
    correct: "A",
    explanation: "In accounting, to reconcile is to make two sets of records agree with each other. The other options describe unrelated administrative actions.",
    explanationTr: "Muhasebede \"reconcile\", iki kayıt setini birbiriyle uyumlu hâle getirmek demektir. Diğer seçenekler ilgisiz idari işlemleri anlatır.",
  },
];
