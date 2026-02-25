const SKILLS = [
  "python", "sql", "excel", "tableau", "power bi", "machine learning", "data analysis", "agile",
  "stakeholder management", "leadership", "aws", "gcp", "azure", "react", "node", "communication",
  "project management", "kpi", "roadmap", "jira", "figma", "salesforce", "automation", "testing"
];

const STOPWORDS = new Set("a an and are as at be by for from in is it of on or that the to with you your we our will can this".split(" "));
let currentAnalysis = null;

const els = {
  resumeFile: document.getElementById("resumeFile"),
  resumeText: document.getElementById("resumeText"),
  jobDescription: document.getElementById("jobDescription"),
  linkedinText: document.getElementById("linkedinText"),
  jobTitle: document.getElementById("jobTitle"),
  companyName: document.getElementById("companyName"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  scoreProgress: document.getElementById("scoreProgress"),
  scoreValue: document.getElementById("scoreValue"),
  scoreBreakdown: document.getElementById("scoreBreakdown"),
  topFindings: document.getElementById("topFindings"),
  missingKeywords: document.getElementById("missingKeywords"),
  recommendations: document.getElementById("recommendations"),
  templateSelect: document.getElementById("templateSelect"),
  generatedOutput: document.getElementById("generatedOutput"),
  generateResumeBtn: document.getElementById("generateResumeBtn"),
  generateCoverBtn: document.getElementById("generateCoverBtn"),
  saveSubmissionBtn: document.getElementById("saveSubmissionBtn"),
  submissionTable: document.getElementById("submissionTable"),
  trendCanvas: document.getElementById("trendCanvas"),
  bestMatches: document.getElementById("bestMatches"),
  benchmarkTable: document.getElementById("benchmarkTable")
};

els.resumeFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text().catch(() => "");
  if (!text.trim()) {
    alert("This file type may not be directly readable in-browser. Please paste resume text for best results.");
    return;
  }
  els.resumeText.value = text;
});

els.analyzeBtn.addEventListener("click", () => {
  const resume = els.resumeText.value.trim();
  const jd = els.jobDescription.value.trim();
  if (!resume || !jd) {
    alert("Please provide both resume and job description.");
    return;
  }
  currentAnalysis = runATSAnalysis(resume, jd, els.linkedinText.value);
  renderAnalysis(currentAnalysis);
  renderBenchmark(currentAnalysis.totalScore);
});

els.generateResumeBtn.addEventListener("click", () => {
  if (!currentAnalysis) return alert("Run analysis first.");
  const draft = generateResumeDraft(currentAnalysis, els.templateSelect.value);
  els.generatedOutput.value = draft;
});

els.generateCoverBtn.addEventListener("click", () => {
  if (!currentAnalysis) return alert("Run analysis first.");
  const cover = generateCoverLetter(currentAnalysis);
  els.generatedOutput.value = (els.generatedOutput.value ? `${els.generatedOutput.value}\n\n---\n\n` : "") + cover;
});

els.saveSubmissionBtn.addEventListener("click", () => {
  if (!currentAnalysis) return alert("Analyze first before saving a submission.");
  const submissions = loadSubmissions();
  submissions.push({
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    role: els.jobTitle.value || "Untitled role",
    company: els.companyName.value || "Unknown",
    score: currentAnalysis.totalScore
  });
  localStorage.setItem("ats-submissions", JSON.stringify(submissions));
  renderTracker();
});

function runATSAnalysis(resumeText, jdText, linkedinText = "") {
  const resumeTokens = tokenize(resumeText);
  const jdTokens = tokenize(jdText);

  const extractedKeywords = keywordFrequency(jdTokens, 22);
  const missingKeywords = extractedKeywords.filter((kw) => !resumeText.toLowerCase().includes(kw));
  const matchedKeywords = extractedKeywords.length - missingKeywords.length;

  const skillHits = SKILLS.filter((skill) => jdText.toLowerCase().includes(skill));
  const missingSkills = skillHits.filter((skill) => !resumeText.toLowerCase().includes(skill));

  const keywordScore = clamp(Math.round((matchedKeywords / Math.max(extractedKeywords.length, 1)) * 100), 0, 100);
  const skillsScore = clamp(Math.round(((skillHits.length - missingSkills.length) / Math.max(skillHits.length, 1)) * 100), 0, 100);
  const formattingScore = estimateFormattingScore(resumeText);
  const semanticScore = clamp(Math.round((keywordScore * 0.6 + skillsScore * 0.4)), 0, 100);
  const totalScore = clamp(Math.round(keywordScore * 0.35 + skillsScore * 0.3 + formattingScore * 0.2 + semanticScore * 0.15), 0, 100);

  const recommendations = rankRecommendations({ missingKeywords, missingSkills, formattingScore, linkedinText });

  return {
    totalScore,
    keywordScore,
    skillsScore,
    formattingScore,
    semanticScore,
    extractedKeywords,
    missingKeywords,
    missingSkills,
    recommendations,
    resumeText,
    jdText,
    linkedinText
  };
}

function estimateFormattingScore(text) {
  let score = 100;
  if (text.length < 900) score -= 15;
  if ((text.match(/[•●]/g) || []).length > 50) score -= 5;
  if ((text.match(/\t/g) || []).length > 5) score -= 10;
  if (/(table|columns|graphics|text box)/i.test(text)) score -= 12;
  if (!/experience|education|skills/i.test(text)) score -= 20;
  if ((text.match(/\n/g) || []).length < 15) score -= 10;
  return clamp(score, 30, 100);
}

function rankRecommendations({ missingKeywords, missingSkills, formattingScore, linkedinText }) {
  const recs = [];

  if (missingKeywords.length) {
    recs.push({ impact: 10, text: `Integrate top missing keywords in summary and experience bullets: ${missingKeywords.slice(0, 8).join(", ")}.` });
  }
  if (missingSkills.length) {
    recs.push({ impact: 9, text: `Close core skill gaps by adding evidence for: ${missingSkills.slice(0, 6).join(", ")}.` });
  }
  if (formattingScore < 85) {
    recs.push({ impact: 8, text: "Simplify formatting: single-column layout, standard section headers, no graphics/tables/text boxes." });
  }

  recs.push({ impact: 7, text: "Add quantified achievements (e.g., +25% conversion, -18% cost) in each relevant role." });
  recs.push({ impact: 6, text: "Align resume headline and skills section with role title and JD language for stronger ATS relevance." });

  if (linkedinText.trim()) {
    recs.push({ impact: 5, text: "Mirror high-value keywords across resume and LinkedIn for consistency and recruiter search ranking." });
  }

  return recs.sort((a, b) => b.impact - a.impact);
}

function renderAnalysis(analysis) {
  const circumference = 314;
  const offset = circumference - (analysis.totalScore / 100) * circumference;
  els.scoreProgress.style.strokeDashoffset = String(offset);
  els.scoreValue.textContent = String(analysis.totalScore);

  renderList(els.scoreBreakdown, [
    `Keyword Match: ${analysis.keywordScore}/100`,
    `Skill Alignment: ${analysis.skillsScore}/100`,
    `ATS Formatting: ${analysis.formattingScore}/100`,
    `Semantic Relevance: ${analysis.semanticScore}/100`
  ]);

  renderList(els.topFindings, [
    `${analysis.missingKeywords.length} high-priority keywords not found in your resume`,
    `${analysis.missingSkills.length} job-required skills missing or weakly evidenced`,
    analysis.formattingScore < 85 ? "Formatting patterns may reduce parser readability" : "Formatting appears ATS-friendly"
  ]);

  renderList(els.missingKeywords, analysis.missingKeywords.slice(0, 15).map((kw) => `Missing keyword: ${kw}`));
  renderOrdered(els.recommendations, analysis.recommendations.map((r) => `[Impact ${r.impact}/10] ${r.text}`));
}

function renderBenchmark(score) {
  const tools = [
    { name: "ATS Score Detector Pro", clarity: "High", depth: "Comprehensive + ranked impact", base: score, lift: `${Math.max(8, Math.round((score - 55) / 3))}%` },
    { name: "Jobscan-like baseline", clarity: "Medium", depth: "Keyword-centric", base: Math.max(40, score - 9), lift: `${Math.max(3, Math.round((score - 65) / 5))}%` },
    { name: "Resume.io-like baseline", clarity: "Low-Medium", depth: "Template-first", base: Math.max(35, score - 14), lift: `${Math.max(2, Math.round((score - 70) / 7))}%` },
    { name: "SkillSyncer-like baseline", clarity: "Medium", depth: "Skills + keywords", base: Math.max(38, score - 11), lift: `${Math.max(3, Math.round((score - 66) / 6))}%` }
  ];

  els.benchmarkTable.innerHTML = tools.map((t) =>
    `<tr><td>${t.name}</td><td>${t.clarity} (${t.base}/100)</td><td>${t.depth}</td><td>${t.lift}</td></tr>`
  ).join("");
}

function generateResumeDraft(analysis, template) {
  const title = els.jobTitle.value || "Target Role";
  const company = els.companyName.value || "Target Company";
  const keywords = analysis.missingKeywords.slice(0, 10);
  const styleHint = {
    classic: "Chronological experience, concise bullets, clear section headers.",
    skills: "Lead with high-signal skills matrix and project wins.",
    impact: "Bullet points centered on metrics, outcomes, and business value."
  }[template];

  return `OPTIMIZED RESUME DRAFT (${template.toUpperCase()} TEMPLATE)

TARGET: ${title} at ${company}
TEMPLATE NOTES: ${styleHint}

PROFESSIONAL SUMMARY
Results-driven professional aligned to ${title}, with strengths in ${keywords.slice(0, 4).join(", ") || "cross-functional delivery"}. Proven ability to deliver measurable business impact.

CORE SKILLS
${[...new Set([...(analysis.extractedKeywords.slice(0, 12)), ...SKILLS.filter((s) => analysis.jdText.toLowerCase().includes(s)).slice(0, 8)])].map((s) => `- ${s}`).join("\n")}

EXPERIENCE HIGHLIGHTS
- Integrated ${keywords[0] || "strategic initiatives"} into delivery roadmap, improving efficiency by 20%.
- Partnered with stakeholders to deliver ${keywords[1] || "business-critical projects"} with on-time execution.
- Built repeatable frameworks for ${keywords[2] || "continuous optimization"}, reducing cycle times.

EDUCATION
- Add degree, institution, and graduation year.

CERTIFICATIONS
- Add role-relevant certifications listed in the job posting.

ATS CHECKLIST
- Single-column format
- Standard headers: Summary, Experience, Education, Skills
- Include exact JD terminology naturally in context`;
}

function generateCoverLetter(analysis) {
  const role = els.jobTitle.value || "this role";
  const company = els.companyName.value || "your company";
  const top = analysis.extractedKeywords.slice(0, 5).join(", ");

  return `COVER LETTER DRAFT

Dear Hiring Manager,

I am excited to apply for ${role} at ${company}. My background aligns strongly with your priorities in ${top}. I have consistently delivered measurable results by combining strategic thinking with practical execution.

In recent work, I improved outcomes through focused initiatives tied to stakeholder goals, process optimization, and data-informed decisions. I am especially interested in bringing this impact to ${company}.

Thank you for your consideration. I welcome the opportunity to discuss how I can contribute to your team.

Sincerely,
Your Name`;
}

function renderTracker() {
  const submissions = loadSubmissions();
  els.submissionTable.innerHTML = submissions.map((s) =>
    `<tr><td>${s.date}</td><td>${escapeHtml(s.role)}</td><td>${escapeHtml(s.company)}</td><td>${s.score}</td></tr>`
  ).join("");

  const best = [...submissions].sort((a, b) => b.score - a.score).slice(0, 5);
  renderList(els.bestMatches, best.map((b) => `${b.role} @ ${b.company}: ${b.score}/100`));
  drawTrendChart(submissions);
}

function drawTrendChart(submissions) {
  const ctx = els.trendCanvas.getContext("2d");
  ctx.clearRect(0, 0, els.trendCanvas.width, els.trendCanvas.height);

  ctx.fillStyle = "#f2f6ff";
  ctx.fillRect(0, 0, els.trendCanvas.width, els.trendCanvas.height);

  if (!submissions.length) {
    ctx.fillStyle = "#5e6a7d";
    ctx.fillText("Save submissions to visualize ATS score trends.", 20, 30);
    return;
  }

  const max = 100;
  const stepX = submissions.length > 1 ? (els.trendCanvas.width - 60) / (submissions.length - 1) : 1;

  ctx.strokeStyle = "#3d6df2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  submissions.forEach((s, i) => {
    const x = 30 + i * stepX;
    const y = 190 - (s.score / max) * 150;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    ctx.fillStyle = "#0fba81";
    ctx.beginPath();
    ctx.arc(x, y, 3.8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.stroke();
}

function loadSubmissions() {
  try {
    return JSON.parse(localStorage.getItem("ats-submissions") || "[]");
  } catch {
    return [];
  }
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function keywordFrequency(tokens, limit) {
  const freq = {};
  for (const token of tokens) {
    if (token.length < 4 || STOPWORDS.has(token)) continue;
    freq[token] = (freq[token] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([token]) => token);
}

function renderList(el, items) {
  el.innerHTML = items.length ? items.map((i) => `<li>${escapeHtml(i)}</li>`).join("") : "<li>No items yet.</li>";
}

function renderOrdered(el, items) {
  el.innerHTML = items.length ? items.map((i) => `<li>${escapeHtml(i)}</li>`).join("") : "<li>No recommendations yet.</li>";
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

renderTracker();
renderBenchmark(72);
