import { invokeBedrockText } from "@/lib/aws/bedrock";
import { PROMPTS } from "@/lib/ai/prompts";

export type TeachingStyle = "simple" | "socratic" | "visual" | "interview";

export type TeachingResult = {
  provider: "agentcore" | "bedrock" | "local";
  explanation: string;
  followUp: string;
  recommendedStyle: TeachingStyle;
  confidence: number;
};

// ─── Smart local explanations ────────────────────────────────────────────────
const TOPIC_CONCEPTS: Record<string, { en: string; hi: string }> = {
  array: {
    en: "a contiguous block of memory where each element lives at a fixed index, giving O(1) random access",
    hi: "एक सन्निहित मेमोरी ब्लॉक जहाँ प्रत्येक element एक निश्चित index पर होता है, जो O(1) random access देता है",
  },
  "linked-list": {
    en: "a chain of nodes where each node holds data and a pointer to the next, making insertions O(1) but lookups O(n)",
    hi: "nodes की एक श्रृंखला जहाँ प्रत्येक node डेटा और अगले की pointer रखता है — insertion O(1) लेकिन lookup O(n)",
  },
  stack: {
    en: "a Last-In-First-Out (LIFO) structure — like a stack of plates — supporting O(1) push and pop",
    hi: "एक Last-In-First-Out (LIFO) संरचना — जैसे प्लेटों का ढेर — O(1) push और pop के साथ",
  },
  queue: {
    en: "a First-In-First-Out (FIFO) structure — like a ticket-counter queue — with O(1) enqueue and dequeue",
    hi: "एक First-In-First-Out (FIFO) संरचना — जैसे टिकट काउंटर पर लाइन — O(1) enqueue और dequeue के साथ",
  },
  "hash-table": {
    en: "a key-value store that uses a hash function to map keys to array indices, giving average O(1) lookups and insertions",
    hi: "एक key-value store जो hash function से keys को array indices पर map करता है, औसतन O(1) lookup और insertion देता है",
  },
  tree: {
    en: "a hierarchical structure with a root and child nodes, enabling O(log n) search in balanced variants",
    hi: "एक hierarchical संरचना जिसमें root और child nodes होते हैं, balanced variants में O(log n) search देता है",
  },
  "binary-search-tree": {
    en: "a binary tree where every left child is smaller and every right child is larger than its parent, enabling average O(log n) search",
    hi: "एक binary tree जहाँ हर left child छोटा और right child बड़ा होता है parent से, औसतन O(log n) search देता है",
  },
  graph: {
    en: "a set of vertices connected by edges, representing networks; traversed via BFS for shortest paths or DFS for cycle detection",
    hi: "vertices का एक समूह जो edges से जुड़े हैं, networks को represent करता है; shortest path के लिए BFS, cycle detection के लिए DFS",
  },
  "dynamic-programming": {
    en: "an optimisation technique that breaks a problem into overlapping subproblems, stores their results to avoid redundant computation",
    hi: "एक optimisation technique जो problem को overlapping subproblems में तोड़ती है और results store करके redundant computation से बचती है",
  },
  sorting: {
    en: "the process of arranging elements in order — QuickSort averages O(n log n), MergeSort guarantees O(n log n), BubbleSort is O(n²)",
    hi: "elements को क्रम में व्यवस्थित करने की प्रक्रिया — QuickSort औसतन O(n log n), MergeSort guaranteed O(n log n), BubbleSort O(n²)",
  },
  "binary-search": {
    en: "a divide-and-conquer search on a sorted array that halves the search space each step, achieving O(log n) time",
    hi: "sorted array पर divide-and-conquer search जो हर step में search space आधी करती है — O(log n) समय में",
  },
  recursion: {
    en: "a technique where a function calls itself with a smaller subproblem until it hits a base case — elegant but uses O(n) call stack",
    hi: "एक technique जहाँ function छोटे subproblem के साथ खुद को call करता है जब तक base case न हो — elegant लेकिन O(n) call stack",
  },
  heap: {
    en: "a complete binary tree where the parent is always ≥ children (max-heap) or ≤ children (min-heap), enabling O(log n) insert and O(1) peek",
    hi: "एक complete binary tree जहाँ parent हमेशा children से बड़ा (max-heap) या छोटा (min-heap) होता है — O(log n) insert, O(1) peek",
  },
};

function getTopicConcept(topic: string, lang: "en" | "hi"): string {
  const slug = topic.toLowerCase().replace(/\s+/g, "-");
  const entry =
    TOPIC_CONCEPTS[slug] ??
    Object.entries(TOPIC_CONCEPTS).find(
      ([k]) => slug.includes(k) || k.includes(slug),
    )?.[1];
  if (entry) return entry[lang];
  return lang === "hi"
    ? `एक महत्वपूर्ण DSA concept जो data को efficiently store और access करने का तरीका देता है`
    : `an important DSA concept that provides an efficient way to store and access data`;
}

function buildExplanation(
  topic: string,
  style: TeachingStyle,
  concept: string,
  lang: "en" | "hi",
): string {
  if (lang === "hi") {
    switch (style) {
      case "simple":
        return `**${topic}** को समझना बहुत आसान है:\n\nयह ${concept}।\n\n**मुख्य बात:** ${topic} के हर design choice के पीछे एक specific operation को optimize करने की सोच है। जब आप यह समझ जाएं, बाकी सब अपने आप clear हो जाता है।\n\n**कब use करें?** जब आपको इसकी core strength की ज़रूरत हो और इसके trade-off accept हों।`;
      case "socratic":
        return `**${topic}** को सवालों से समझते हैं:\n\n• क्या समस्या है जो ${topic} बिना किसी दूसरे solution से solve नहीं होती?\n• यह ${concept} — इससे किस operation का फायदा होता है?\n• अगर आपको ${topic} नहीं use करना, तो आप क्या choose करेंगे और क्यों?\n\nहर सवाल पर रुककर सोचें — यही असली समझ बनाने का तरीका है।`;
      case "visual":
        return `**${topic}** को visualize करें:\n\nकल्पना करें: ${concept}।\n\nइसे इस तरह draw करें:\n📦 हर box = एक data element\n➡️ Arrows/pointers = connections\n🔢 Labels = indices या keys\n\nDrawing का shape ही structure है। जब आप diagram देखें, operations खुद समझ आने लगती हैं।`;
      case "interview":
        return `**${topic}** के लिए interview-ready जवाब:\n\n**Q: "${topic} क्या है और कब use करें?"**\n\n**A:** "${topic} ${concept} है। मैं इसे तब choose करूँगा जब [specific use case] की ज़रूरत हो। इसका trade-off यह है कि [weakness], इसलिए [alternative] तब बेहतर है जब [condition]."\n\n💡 *Tip:* Definition + use case + trade-off = perfect answer।`;
    }
  }

  switch (style) {
    case "simple":
      return `**${topic}** in plain terms:\n\nIt is ${concept}.\n\n**The key insight:** every design decision in ${topic} optimises for a specific operation. Once you know *what* it optimises, everything else follows naturally.\n\n**When to use it?** Whenever you need its core strength and can accept its trade-offs.`;
    case "socratic":
      return `Let's discover **${topic}** through questions:\n\n• What problem does ${topic} solve that a simpler alternative cannot?\n• It is ${concept} — which operations benefit most from this?\n• If you couldn't use ${topic}, what would you choose instead, and why?\n\nPause and think through each question — that's where real understanding forms.`;
    case "visual":
      return `**${topic}** — visualise it:\n\nPicture this: ${concept}.\n\nDraw it like this:\n📦 Each box = one data element\n➡️ Arrows/pointers = connections between elements\n🔢 Labels = indices or keys\n\nThe *shape* of your drawing **is** the data structure. Once you can sketch it from memory, you truly understand it.`;
    case "interview":
      return `**${topic}** — interview-ready answer:\n\n**Q: "Explain ${topic} and when you'd use it."**\n\n**A:** "${topic} is ${concept}. I'd reach for it when I need [specific use case]. Its trade-off is [weakness], so I'd avoid it when [alternative is better]."\n\n💡 *Pro tip:* Always pair your definition with a concrete use case and a trade-off — that's what separates a 9/10 answer from a 6/10.`;
  }
}

function buildFollowUp(
  topic: string,
  style: TeachingStyle,
  lang: "en" | "hi",
): string {
  if (lang === "hi") {
    switch (style) {
      case "simple":
        return `अब एक real-world scenario सोचें: आप ${topic} को किस situation में array या hash table की जगह choose करेंगे, और क्यों?`;
      case "socratic":
        return `अगर ${topic} की main operation की time complexity अचानक O(n) हो जाए, तो आपके system design में क्या टूट जाएगा?`;
      case "visual":
        return `क्या आप ${topic} को कागज़ पर sketch कर सकते हैं और हर operation (insert, delete, search) की time complexity उस diagram पर annotate कर सकते हैं?`;
      case "interview":
        return `Follow-up जो interviewer अक्सर पूछते हैं: "${topic} को scratch से implement करें — आप पहले कौन-से edge cases handle करेंगे?"`;
    }
  }

  switch (style) {
    case "simple":
      return `Now for a real-world challenge: describe a concrete scenario where you'd choose ${topic} over an array or a hash table — and explain your reasoning.`;
    case "socratic":
      return `If the time complexity of ${topic}'s main operation suddenly became O(n), what part of your system's design would break first?`;
    case "visual":
      return `Can you sketch ${topic} on paper and annotate each operation (insert, delete, search) with its time complexity directly on your diagram?`;
    case "interview":
      return `A common interviewer follow-up: "Implement ${topic} from scratch — which edge cases would you handle first, and why?"`;
  }
}

function localResult(
  topic: string,
  style: TeachingStyle,
  language: "en" | "hi",
): TeachingResult {
  const concept = getTopicConcept(topic, language);
  return {
    provider: "local",
    explanation: buildExplanation(topic, style, concept, language),
    followUp: buildFollowUp(topic, style, language),
    recommendedStyle: style,
    confidence: 72,
  };
}

// ─── AgentCore (external runtime) ────────────────────────────────────────────
async function tryAgentCore(
  topic: string,
  question: string,
  style: TeachingStyle,
  language: "en" | "hi",
): Promise<TeachingResult | null> {
  const url =
    process.env.AGENTCORE_RUNTIME_URL || process.env.app_AGENTCORE_RUNTIME_URL;
  if (!url) return null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "teach", topic, question, style, language }),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (
      typeof data.explanation !== "string" ||
      typeof data.followUp !== "string"
    ) {
      return null;
    }

    return {
      provider: "agentcore",
      explanation: data.explanation,
      followUp: data.followUp,
      recommendedStyle:
        data.recommendedStyle === "socratic" ||
        data.recommendedStyle === "visual" ||
        data.recommendedStyle === "interview"
          ? data.recommendedStyle
          : style,
      confidence: typeof data.confidence === "number" ? data.confidence : 70,
    };
  } catch {
    return null;
  }
}

// ─── Main teaching team ───────────────────────────────────────────────────────
export async function runTeachingTeam(
  question: string,
  topic: string,
  style: TeachingStyle,
  language: "en" | "hi",
): Promise<TeachingResult> {
  // 1. Try AgentCore external runtime
  const agentCore = await tryAgentCore(topic, question, style, language);
  if (agentCore) return agentCore;

  // 2. Try AWS Bedrock
  try {
    const explanation = await invokeBedrockText(
      PROMPTS.teacherSystem(style, language),
      `Topic: ${topic}\nStudent question/context: ${question}`,
      { maxTokens: 450 },
    );

    if (explanation && !explanation.startsWith("[local]")) {
      const followUp = await invokeBedrockText(
        PROMPTS.evaluatorSystem(language),
        explanation,
        { maxTokens: 180 },
      );

      return {
        provider: "bedrock",
        explanation,
        followUp,
        recommendedStyle: style,
        confidence: 75,
      };
    }
  } catch (error) {
    console.error("[teaching] Bedrock fallback:", error);
  }

  // 3. Smart local fallback — always produces useful, topic-specific content
  return localResult(topic, style, language);
}
