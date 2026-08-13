"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Category = "clinical" | "symptom" | "hospital" | "medication" | "collateral" | "event" | "post";
type Evidence = "Contemporaneous record" | "Treating testimony" | "Reported to clinician" | "Collateral testimony" | "Objective record" | "Retrospective report" | "Civil allegation";
type ViewKey = "course" | "post";

type TimelineEvent = {
  id: string;
  date: string;
  displayDate: string;
  title: string;
  short: string;
  category: Category;
  evidence: Evidence;
  certainty: "High" | "Moderate" | "Contested";
  clinician?: string;
  institution?: string;
  side: "top" | "bottom";
  tier: number;
  summary: string;
  details: string[];
  medication?: string;
  source: string;
  caution?: string;
  views: ViewKey[];
};

type MedSegment = {
  start: string;
  end?: string;
  label: string;
  status: "prescribed" | "reported" | "planned" | "inpatient" | "detected";
  level?: 0 | 1;
  note: string;
};

type Medication = {
  name: string;
  generic: string;
  color: string;
  className: string;
  summary: string;
  segments: MedSegment[];
};

type PackedMedicationItem = {
  medication: Medication;
  segment: MedSegment;
  segmentIndex: number;
  start: number;
  end: number;
  visualStart: number;
  visualEnd: number;
};

const categoryMeta: Record<Category, { label: string; color: string }> = {
  clinical: { label: "Clinician encounter", color: "#2dd4bf" },
  symptom: { label: "Symptom change", color: "#f0ad4e" },
  hospital: { label: "Hospital / program", color: "#58c6ff" },
  medication: { label: "Medication decision", color: "#d67bff" },
  collateral: { label: "Family collateral", color: "#f38ca5" },
  event: { label: "January 24", color: "#fb6a65" },
  post: { label: "Post-offense", color: "#a8b5c7" },
};

const views: Record<ViewKey, { label: string; eyebrow: string; start: string; end: string; baseWidth: number }> = {
  course: { label: "Clinical course", eyebrow: "May 26, 2022 – January 24, 2023", start: "2022-05-26T00:00:00", end: "2023-01-25T00:00:00", baseWidth: 9000 },
  post: { label: "Post-offense", eyebrow: "January 26, 2023 – September 2024", start: "2023-01-25T00:00:00", end: "2024-09-15T00:00:00", baseWidth: 3000 },
};

const events: TimelineEvent[] = [
  {
    id: "birth", date: "2022-05-26T12:00:00", displayDate: "May 26", title: "Callan is born", short: "Third childbirth; postpartum clock begins", category: "clinical", evidence: "Treating testimony", certainty: "High", side: "top", tier: 0,
    summary: "Callan Clancy was born on May 26, 2022. The charged conduct occurred approximately eight months—about 243 days—later.",
    details: ["Later treatment history described the first roughly 12 weeks postpartum as going well.", "This date matters because classic postpartum psychosis usually begins within days to weeks, not eight months after delivery."],
    source: "SRC-0091, Trial Day 10, pp. 91–92; SRC-0032 ¶23", caution: "Birth date is high confidence; later symptom history remains retrospective patient report.", views: ["course"]
  },
  {
    id: "late-aug", date: "2022-08-25T12:00:00", displayDate: "Late August", title: "Retrospective history: anxiety emerges", short: "Later report of difficulty leaving baby; racing thoughts", category: "symptom", evidence: "Reported to clinician", certainty: "Moderate", side: "bottom", tier: 0,
    summary: "Clancy later told Julie Paul that she initially did well, then became increasingly anxious and overwhelmed after Patrick returned to work.",
    details: ["She described difficulty leaving the baby and racing thoughts.", "A later civil complaint also alleges unusually high activity and projects earlier in the summer, but the public contemporaneous record does not establish hypomania."],
    source: "SRC-0091, Trial Day 10, pp. 91–92; compare SRC-0032 ¶¶25–29", caution: "‘Excited’ or active postpartum behavior should not be relabeled as hypomania without a syndromal pattern.", views: ["course"]
  },
  {
    id: "tufts-intake", date: "2022-09-15T10:00:00", displayDate: "September 15", title: "Telehealth evaluation: first Tufts visit", short: "Video visit · anxiety, depression, insomnia, racing thoughts", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 1,
    summary: "Tufts documented anxiety, depressed mood, insomnia, racing thoughts, appetite and anhedonia changes, and functional difficulty. Suicide, harm, voice, and psychosis questions were negative.",
    details: ["Risky behavior, excessive energy, and impulsivity items were not checked.", "Tufts recommended psychotherapy and discussed medication treatment.", "The separate same-day medication card records the sertraline prescription and fill."], source: "SRC-0087, Trial Day 9, pp. 66–98; SRC-0091, Trial Day 10, pp. 12–13", caution: "The negative mental-status and safety findings apply to this video encounter, not every moment outside it.", views: ["course"]
  },
  {
    id: "sertraline-deferred", date: "2022-09-28T15:00:00", displayDate: "September 28", title: "Medication decision: sertraline deferred", short: "After video visit · filled previously, not started", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "After learning during the September 28 video visit that Clancy had not started sertraline and felt improved, Tufts paused the medication plan and continued to recommend therapy.",
    details: ["This resolves that the September 15 fill did not equal immediate exposure.", "The precise later start date remains uncertain."], medication: "Sertraline: filled, not yet taken", source: "SRC-0087, Trial Day 9, pp. 98–102", caution: "A pharmacy fill is not an administration record.", views: ["course"]
  },
  {
    id: "leave", date: "2022-09-30T12:00:00", displayDate: "September 30", title: "MyChart message: requests extended work leave", short: "Does not feel ready to return to nursing", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 2,
    summary: "In a portal message, Clancy said she was only well enough to function without medication and was not ready to resume patient care.",
    details: ["Infant feeding and overnight nursing demands were also discussed.", "The message is evidence of self-reported functional limitation, not an independent occupational assessment."], source: "SRC-0087, Trial Day 9, portal message", views: ["course"]
  },
  {
    id: "sertraline-stop", date: "2022-10-20T10:00:00", displayDate: "October 20", title: "Telehealth visit: symptoms worsen after sertraline", short: "Video visit · insomnia, anxiety, fogginess, racing thoughts", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 0,
    summary: "During a video visit, Clancy reported that after eventually starting sertraline and increasing from 25 to 50 mg, she felt awful, with worse sleep, anxiety, mental fog, overnight racing thoughts, appetite loss, diarrhea, and tearfulness.",
    details: ["She denied suicidal and homicidal thoughts; her fear of someday developing suicidal thoughts was documented separately from current suicidal ideation.", "Tufts observed depressed and anxious mood/affect but appropriate speech and thought process, excellent judgment, intact cognition, and normal psychomotor activity.", "The medication stop is recorded as a separate same-day decision."], source: "SRC-0087, Trial Day 9, pp. 105–107, 05:52:52–05:59:25; SRC-0091, Trial Day 10, pp. 42–45", caution: "The encounter establishes the reported temporal association; it does not by itself prove a bipolar switch or medication causation.", views: ["course"]
  },
  {
    id: "oct21", date: "2022-10-21T10:00:00", displayDate: "October 21", title: "Telehealth follow-up: acute insomnia and anxiety", short: "Next-day video visit with Dr. Tufts", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 0,
    summary: "Clancy reported no sleep the preceding night, severe anxiety and heart racing, worry about the children and sleep, GI symptoms, crying, and fogginess.",
    details: ["She described yawning without feeling drowsy.", "Tufts did not observe pressured speech, hyperactivity, mania, psychosis, suicidal ideation, homicidal ideation, or hallucinations.", "The lorazepam prescription and fill are shown in a separate same-day medication card."], source: "SRC-0087, Trial Day 9, pp. 107–109, 05:58:25–06:04:28; SRC-0091, Trial Day 10", caution: "‘Not drowsy’ is ambiguous within a broader picture of distressed insomnia.", views: ["course"]
  },
  {
    id: "oct26", date: "2022-10-26T12:00:00", displayDate: "October 26", title: "Telehealth visit: persistent anxiety and depression", short: "Video visit · lorazepam reduced anxiety but not insomnia", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "Clancy reported that lorazepam reduced anxiety but did not help sleep; over-the-counter diphenhydramine had been more helpful. Her mood remained anxious and depressed.",
    details: ["She denied suicidal and homicidal ideation, and Tufts observed no psychosis or communication difficulty.", "They discussed non-benzodiazepine medication options after the sertraline effects had reportedly resolved.", "The three same-day prescriptions and fills appear in a separate medication card."], source: "SRC-0087, Trial Day 9, pp. 109–111, 06:04:37–06:10:07; SRC-0091, Trial Day 10", caution: "The visit documents reported benefit and symptoms; the separate dispensing record does not establish which options were later taken.", views: ["course"]
  },
  {
    id: "therapy", date: "2022-10-31T12:00:00", displayDate: "October 31", title: "Therapy appointment: likely virtual", short: "Approx. one hour · SI and HI denied", category: "clinical", evidence: "Contemporaneous record", certainty: "Moderate", clinician: "Jennifer McAllister", institution: "Aster Mental Health", side: "top", tier: 2,
    summary: "A therapy note later read at trial stated that Clancy denied suicidal or homicidal ideation.",
    details: ["Tufts was not present for the encounter and testified that she was not completely certain of the modality, although she thought it was virtual.", "The complete therapy chart is unavailable, and cross-examination questioned how extensively suicidality was assessed."], source: "SRC-0087, Trial Day 9, pp. 111–112, 06:10:18–06:11:23; SRC-0091, Trial Day 10, 03:05:25–03:10:45", caution: "The note's limited content is supported; the modality is probable rather than certain, and the unrecorded conversation cannot be reconstructed.", views: ["course"]
  },
  {
    id: "nov2", date: "2022-11-02T12:00:00", displayDate: "November 2", title: "Telehealth follow-up: sleep improves", short: "Video visit · lorazepam helps; buspirone not started", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "Clancy reported that lorazepam helped and sleep had improved. Tufts emphasized that it was not a long-term solution and planned a gradual taper.",
    details: ["Clancy said she had not started buspirone because she was afraid to begin a new medication.", "Her affect appeared appropriate and her reported mood was euthymic; she denied SI and HI.", "The lorazepam refill and taper plan appear in a separate same-day medication card."], source: "SRC-0087, Trial Day 9, pp. 111–113, 06:10:53–06:16:20; SRC-0091, Trial Day 10, pp. 77–78", views: ["course"]
  },
  {
    id: "ed", date: "2022-11-16T12:00:00", displayDate: "November 16", title: "Emergency department visit: South Shore", short: "Insomnia, anxiety and palpitations", category: "hospital", evidence: "Contemporaneous record", certainty: "High", institution: "South Shore ED", side: "top", tier: 1,
    summary: "Clancy presented to the emergency department for insomnia, anxiety, and palpitations. Patrick believed she had slept very little for approximately 48 hours.",
    details: ["Patrick believed she had slept very little for approximately 48 hours.", "Clancy later told Paul that the treatment prescribed after the visit helped her fall asleep but did not maintain sleep.", "The trazodone prescription and fill appear in a separate same-day medication card."], source: "SRC-0065; SRC-0091; Exhibit 222 described on Trial Day 11", caution: "The encounter is established; exact sleep duration and later treatment effect are patient/collateral reports.", views: ["course"]
  },
  {
    id: "paul-intake", date: "2022-11-21T10:00:00", displayDate: "November 21", title: "In-person intake: perinatal psychiatry", short: "Face-to-face · linear, goal-directed, engaged in planning", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 0,
    summary: "Clancy described anxiety, overwhelm, racing thoughts, insomnia, and prior sertraline intolerance. She denied SI, HI, and hallucinations, and appeared linear and goal-directed.",
    details: ["The EPDS self-harm item was negative.", "She reported that Ativan plus Benadryl had helped sleep.", "The same-day fluoxetine prescription and fill appear in a separate medication card."], source: "SRC-0091, Trial Day 10, pp. 96–98, 06:27:23–06:33:23", views: ["course"]
  },
  {
    id: "nov25", date: "2022-11-25T12:00:00", displayDate: "November 25", title: "MyChart exchange: fluoxetine stopped", short: "Sleep regimen changed without a visit", category: "medication", evidence: "Treating testimony", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "After a short fluoxetine trial associated with worse sleep and feeling disconnected or ‘spacey,’ Paul stopped it and changed the sleep regimen.",
    details: ["Zolpidem 5 mg ×1, mirtazapine 7.5 mg ×30, and clonazepam 0.5 mg ×14 were filled.", "Paul warned against combining clonazepam with lorazepam.", "Zolpidem ingestion is not established."], medication: "Stop fluoxetine; start mirtazapine/clonazepam", source: "SRC-0091; SRC-0048", caution: "Paul’s term ‘activation’ does not itself establish mania or medication-induced psychosis.", views: ["course"]
  },
  {
    id: "disconnected", date: "2022-11-27T20:00:00", displayDate: "November 27", title: "MyChart message: “disconnected … from reality”", short: "Frightening experience after sleeping", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 2,
    summary: "After reporting mirtazapine 15 mg plus clonazepam 0.5 mg and sleep, Clancy wrote that she felt ‘super disconnected with myself and reality.’",
    details: ["She had reported two nights of clonazepam and considered stopping it.", "Paul considered sedation or disorientation and supported stopping clonazepam."], medication: "Mirtazapine 15 mg + clonazepam 0.5 mg reportedly taken", source: "SRC-0091, p. 104", caution: "Clinically compatible with derealization, depersonalization, sedation, anxiety, or nonspecific disorientation—not automatically psychosis.", views: ["course"]
  },
  {
    id: "panic", date: "2022-11-28T12:00:00", displayDate: "November 28", title: "MyChart message: panic attack; PHP suggested", short: "Women & Infants referral faces logistical barriers", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 0,
    summary: "Clancy reported a panic attack. Paul suggested lorazepam and a run and recommended Women & Infants partial-hospital care.",
    details: ["Clancy described logistical difficulty attending the program.", "No psychosis was documented in the available exchange."], source: "SRC-0091, pp. 104–105", views: ["course"]
  },
  {
    id: "jollotta-intake", date: "2022-11-29T15:00:00", displayDate: "November 29", title: "Telehealth visit: first Jollotta assessment", short: "EPDS 17 · GAD-7 14 · anxious but linear", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 0,
    summary: "Clancy described fragmented sleep, disorientation, forgetfulness, feeling disconnected from her body, and intense anxiety about sleep.",
    details: ["She reported about two hours of sleep followed by several hours awake and sometimes used lorazepam to return to sleep.", "Jollotta offered zolpidem 10 mg/ER and hydroxyzine; Clancy declined and preferred mirtazapine 15 mg with PRN lorazepam.", "No SI/HI, mania, hallucinations, delusions, or psychosis were observed or reported in this encounter."], medication: "Continue mirtazapine 15 mg + PRN lorazepam", source: "SRC-0096, Trial Day 11, pp. 17–26", caution: "Negative findings apply to this encounter, not every moment outside it.", views: ["course"]
  },
  {
    id: "child-thoughts", date: "2022-11-30T09:00:00", displayDate: "After Thanksgiving", title: "Child-harm thoughts disclosed to Patrick", short: "Distressing; no plan, intent, or external voice", category: "collateral", evidence: "Collateral testimony", certainty: "Moderate", side: "top", tier: 1,
    summary: "Patrick later testified that over one or two nights Clancy described distressing thoughts involving harm or illness affecting the children.",
    details: ["She appeared disturbed by the thoughts.", "She gave no method or plan and expressed no intent.", "Patrick said she did not describe an external voice and he did not then believe the children were unsafe."], source: "SRC-0065, Trial Day 1, 02:06:24–02:11:58", caution: "Do not merge this collateral account with suicidal portal messages or the later command-voice account.", views: ["course"]
  },
  {
    id: "quetiapine-start", date: "2022-11-30T16:00:00", displayDate: "November 30", title: "MyChart message: asks to stop mirtazapine", short: "Worse depression; quetiapine discussed for sleep", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 1,
    summary: "Clancy asked to stop mirtazapine after roughly five nights, reporting much worse depression and only about two hours of sleep. Jollotta proposed low-dose quetiapine for insomnia.",
    details: ["Quetiapine 25 mg ×30 was filled.", "A fluoxetine retrial was discussed but not yet established as taken."], medication: "Quetiapine 25 mg prescribed/filled", source: "SRC-0096, pp. 27–30; SRC-0048", caution: "At 25 mg, the stated target was sleep; the fill does not establish ingestion.", views: ["course"]
  },
  {
    id: "intrusive", date: "2022-12-01T12:00:00", displayDate: "December 1", title: "MyChart message: “very intrusive thoughts”", short: "Mirtazapine skipped; content initially unspecified", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Clancy wrote that she disliked mirtazapine and had ‘very intrusive thoughts that I never had before.’",
    details: ["She had skipped mirtazapine and preferred fluoxetine with Ativan/Benadryl.", "She later planned mirtazapine 15 mg with quetiapine 25 mg.", "The immediate message did not clearly elicit or record the thought content."], source: "SRC-0096, pp. 30–33", caution: "Later testimony identified the thoughts disclosed to Jollotta as suicidal, not child-directed.", views: ["course"]
  },
  {
    id: "death-thoughts", date: "2022-12-02T09:00:00", displayDate: "December 2", title: "MyChart message: wanting it “all over”", short: "Numbness and indifference to dying", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 3,
    summary: "After reporting mirtazapine 15 mg plus quetiapine 25 mg, Clancy awoke with ‘horribly intrusive thoughts of wanting it to be all over.’",
    details: ["She took lorazepam 1 mg, returned to sleep, and said the thoughts stopped.", "Later she wrote, ‘I feel like I’m going to die and I don’t care.’", "Jollotta provided crisis information, asked about support, and recommended quetiapine 50 mg for sleep."], medication: "Mirtazapine + quetiapine reportedly taken; lorazepam 1 mg afterward", source: "SRC-0096, pp. 32–40", caution: "The temporal sequence does not establish medication causation.", views: ["course"]
  },
  {
    id: "dec3", date: "2022-12-03T18:00:00", displayDate: "December 3", title: "MyChart message: severe depression continues", short: "Lorazepam 0.5 mg reportedly brings relief", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 1,
    summary: "Clancy reported roughly four hours plus 45 minutes of sleep and ongoing severe depression and intrusive thoughts.",
    details: ["She later reported taking lorazepam 0.5 mg at about 6 p.m. and feeling better.", "Symptom improvement after a dose does not identify the underlying disorder."], medication: "Lorazepam 0.5 mg reportedly taken", source: "SRC-0096, p. 42 and p. 94", views: ["course"]
  },
  {
    id: "dec6", date: "2022-12-06T14:00:00", displayDate: "December 6", title: "In-person visit: bipolarity considered", short: "Patrick present · activation history · MDQ negative", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 0,
    summary: "At an in-person visit with Patrick, the earlier sertraline episode was described as roughly 48 hours without sleep and without fatigue. Jollotta called it an activating response and considered bipolar disorder.",
    details: ["The prior MDQ was negative, other manic indicators were not elicited, and Jollotta testified criteria were not met then.", "Patrick said, ‘My wife is not bipolar.’", "Jollotta observed no mania, hallucinations, delusions, psychosis, or current suicidal plan/intent.", "She considered stopping quetiapine, reconsidering fluoxetine, and replacing lorazepam with longer-half-life diazepam for tapering."], medication: "Diazepam strategy begins; quetiapine temporarily reconsidered", source: "SRC-0096, pp. 43–51", caution: "This was an active differential—not a confirmed bipolar diagnosis.", views: ["course"]
  },
  {
    id: "dec7", date: "2022-12-07T12:00:00", displayDate: "December 7", title: "MyChart exchange: possible mixed state considered", short: "Fluoxetine held; quetiapine titration proposed", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 0,
    summary: "After about four hours of sleep on diazepam/melatonin, Clancy again said she was not tired. Jollotta held fluoxetine and targeted possible hypomanic or mixed symptoms.",
    details: ["Proposed quetiapine sequence: 100 → 200 → 300 → 400 mg over successive nights.", "Olanzapine with fluoxetine was discussed but not prescribed or taken.", "Diazepam tapering continued."], medication: "Quetiapine 100→400 mg recommended; fluoxetine held", source: "SRC-0096, pp. 51–56", caution: "The 400-mg target was recommended. It was not shown to have been taken.", views: ["course"]
  },
  {
    id: "dec12", date: "2022-12-12T12:00:00", displayDate: "December 12", title: "MyChart message: sleep improves; depression persists", short: "Reports quetiapine 200 mg—not 400 mg", category: "medication", evidence: "Reported to clinician", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 1,
    summary: "Clancy reported taking quetiapine 200 mg plus diazepam 2.5 mg for three nights, sleeping deeply for seven to eight hours, but remaining ‘incredibly depressed and unmotivated.’",
    details: ["This is the strongest available evidence of the dose actually taken during the proposed titration.", "Improved sleep did not correspond to meaningful mood improvement."], medication: "Quetiapine 200 mg + diazepam 2.5 mg reportedly taken", source: "SRC-0096, pp. 57–62", views: ["course"]
  },
  {
    id: "dec13", date: "2022-12-13T15:00:00", displayDate: "December 13", title: "Telehealth visit: hopelessness persists", short: "Numbness · EPDS self-harm item “sometimes”", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "At virtual follow-up, Clancy reported seven to nine hours of sleep but persistent hopelessness, numbness, and poor motivation.",
    details: ["She denied current suicidal ideation, although the EPDS recorded self-harm thoughts ‘sometimes’ during the preceding week.", "Jollotta observed no mania or psychosis.", "Jollotta later testified that Clancy never reported child-harm thoughts to her."], source: "SRC-0096, pp. 57–62", views: ["course"]
  },
  {
    id: "dec15", date: "2022-12-15T15:00:00", displayDate: "December 15", title: "Phone call: “worst day”; higher care urged", short: "Persistent suicidal thoughts; no active plan", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 0,
    summary: "Clancy and Patrick described her worst day, with persistent intrusive thoughts of suicide but no active plan. Both agreed that a higher level of care might be needed.",
    details: ["Jollotta discussed MGH emergency evaluation, possible McLean care, and release-of-information needs.", "Clancy went to MGH and then chose outpatient Women & Infants follow-up."], source: "SRC-0096, pp. 63–66", caution: "No active plan was disclosed in the cited exchange.", views: ["course"]
  },
  {
    id: "dec16", date: "2022-12-16T15:00:00", displayDate: "December 16", title: "MyChart exchange: plan updated after MGH", short: "Jollotta messages · sleep restored, mood not improved", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 1,
    summary: "In MyChart messages after the MGH evaluation and a separate Tufts video visit, Clancy reported sleeping on quetiapine 200 mg plus diazepam 2 mg but experiencing no mood improvement.",
    details: ["Jollotta recommended quetiapine 300 mg as a bipolar-depression target.", "Clancy reported that Tufts had recommended adding lamotrigine 25 mg and asked whether Jollotta agreed.", "Jollotta endorsed lamotrigine and provided rash/titration counseling but did not know whether Clancy took it."], medication: "Lamotrigine 25 mg endorsed; quetiapine 300 mg recommended", source: "SRC-0096, Trial Day 11, pp. 66–70, 03:45:34–03:51:32", caution: "This card records the portal exchange, not the separate Tufts appointment. Endorsement and a dose target do not establish ingestion or diagnosis.", views: ["course"]
  },
  {
    id: "wi", date: "2022-12-20T12:00:00", displayDate: "December 20", title: "Program assessment: Women & Infants", short: "Same-day discharge; general PHP recommended", category: "hospital", evidence: "Treating testimony", certainty: "Moderate", institution: "Women & Infants", side: "bottom", tier: 2,
    summary: "Clancy entered the Women & Infants program and was discharged the same day, with a recommendation to come off quetiapine and pursue a general mental-health PHP.",
    details: ["Jollotta was not opposed to tapering but worried about loss of structured support, persistent intrusive thoughts, and starting a taper while she was away.", "Women & Infants material indicated an attempted call to Jollotta; she testified that she never received it."], source: "SRC-0096; Exhibit 220 described on Days 10–11", caution: "The complete Women & Infants record is not publicly available, and the communication failure remains contested.", views: ["course"]
  },
  {
    id: "taper", date: "2022-12-21T12:00:00", displayDate: "December 21", title: "MyChart message: quetiapine taper sent", short: "200 → 100 → 50 → stop", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 0,
    summary: "Jollotta ordered quetiapine 200 mg for four nights, 100 mg for four nights, 50 mg for four nights, then discontinuation.",
    details: ["Quetiapine 100 mg ×14 and 25 mg ×14 were filled on December 21–22.", "The taper schedule is an intended regimen, not proof that every dose was taken."], medication: "Quetiapine taper", source: "SRC-0096, pp. 69–74; SRC-0048", views: ["course"]
  },
  {
    id: "mgh-dec30", date: "2022-12-30T12:00:00", displayDate: "December 30", title: "Hospital presentation: returns to MGH", short: "Seeks McLean-level treatment", category: "hospital", evidence: "Retrospective report", certainty: "Moderate", institution: "MGH", side: "bottom", tier: 1,
    summary: "The civil chronology describes a December 29 request for McLean, a December 30 MGH presentation, and transfer around December 31 or January 1.",
    details: ["The exact December 29–31 sequence is not fully established by the available primary record.", "Goodheart’s testimony establishes voluntary arrival at McLean from MGH on January 1."], source: "SRC-0032 ¶¶59–62; SRC-0087", caution: "Exact dates before the January 1 admission remain partly pleading-based.", views: ["course"]
  },
  {
    id: "mclean", date: "2023-01-01T12:00:00", displayDate: "January 1–5", title: "Inpatient admission: McLean", short: "Voluntary · severe depression · no psychosis observed", category: "hospital", evidence: "Treating testimony", certainty: "High", clinician: "Alia Goodheart, MD", institution: "McLean Hospital", side: "top", tier: 1,
    summary: "The provisional admitting formulation was severe major depression without psychotic features. Bipolarity was considered, but no firm diagnosis was established.",
    details: ["MGH material included a wish to be dead without plan, no violent/homicidal ideation, and no observed mania, psychosis, or obsessions.", "McLean tapered quetiapine approximately 75 → 50 → 25 → 0, switched diazepam to lorazepam, and used trazodone and melatonin for sleep.", "January 1–4 notes described linear thought, no delusions or hallucinations, and repeated denial of SI/HI.", "Clancy requested earlier discharge; Goodheart required next-day psychiatric follow-up and testified that she had no safety concern at discharge."], medication: "Quetiapine tapered off; diazepam → lorazepam; trazodone/melatonin", source: "SRC-0087, Trial Day 9", caution: "Time-limited inpatient observations do not decide symptoms outside observed encounters.", views: ["course"]
  },
  {
    id: "discharge", date: "2023-01-05T15:00:00", displayDate: "January 5", title: "Inpatient discharge: McLean", short: "Discharged home · next-day psychiatry follow-up required", category: "hospital", evidence: "Contemporaneous record", certainty: "High", clinician: "Alia Goodheart, MD", institution: "McLean Hospital", side: "bottom", tier: 0,
    summary: "McLean discharged Clancy after Goodheart required next-day outpatient psychiatric follow-up and testified that she had no safety concern at discharge.",
    details: ["No further quetiapine was planned.", "Short-term discharge medications are shown in a separate same-day prescription card.", "The complete McLean chart remains unavailable; trial testimony summarized the admission and discharge records."], source: "SRC-0087, Trial Day 9, pp. 28–35, 01:36:58–01:57:40", caution: "A discharge assessment is a time-limited clinical judgment, not proof of symptoms at later times.", views: ["course"]
  },
  {
    id: "jan6", date: "2023-01-06T12:00:00", displayDate: "January 6", title: "Telehealth follow-up: after McLean discharge", short: "Video visit · full inpatient chart unavailable to Tufts", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 2,
    summary: "Clancy reported taking trazodone 100 mg, lorazepam 1 mg, and melatonin 5 mg.",
    details: ["Tufts had a discharge summary but not the complete McLean chart.", "She had not spoken directly with the discharging psychiatrist."], medication: "Trazodone 100 mg + lorazepam 1 mg + melatonin 5 mg reported", source: "SRC-0087; SRC-0091", caution: "This is patient-reported use, not observed administration.", views: ["course"]
  },
  {
    id: "jan9", date: "2023-01-09T12:00:00", displayDate: "January 9", title: "Prescription change: lorazepam to diazepam", short: "Longer half-life for rebound anxiety/taper", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "Tufts replaced lorazepam with longer-half-life diazepam to reduce rebound anxiety and facilitate tapering.",
    details: ["Diazepam 5 mg ×14 was filled."], medication: "Diazepam 5 mg", source: "SRC-0087; SRC-0048", views: ["course"]
  },
  {
    id: "ketamine", date: "2023-01-11T12:00:00", displayDate: "January 11", title: "MyChart message: asks about ketamine", short: "Very low mood; seeks faster relief", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 0,
    summary: "Clancy asked about ketamine and described very low mood, minimal motivation, and desperation for something that might work quickly.",
    details: ["Tufts explained the treatment trials typically required before ketamine.", "The exchange illustrates persistent severe depression despite treatment and improved sleep."], source: "SRC-0087, Trial Day 9", views: ["course"]
  },
  {
    id: "traz150", date: "2023-01-12T12:00:00", displayDate: "January 12", title: "Prescription change: trazodone increased", short: "150 mg ×30 filled", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "Tufts prescribed trazodone 150 mg, and a quantity of 30 was filled.",
    details: ["The evidence does not establish the dose taken every night through January 24."], medication: "Trazodone 150 mg", source: "SRC-0091; SRC-0048", views: ["course"]
  },
  {
    id: "jan16", date: "2023-01-16T12:00:00", displayDate: "January 16", title: "Telehealth visit: severe functional depression", short: "Video visit · very low mood, numbness, forced functioning", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 1,
    summary: "Clancy described very low mood, numbness, forcing herself out of bed, difficulty with basic care, and impaired bonding despite caring for the baby.",
    details: ["She denied SI, HI, and psychotic symptoms.", "She said she could force herself out of bed, attend to hygiene and eating, and care for the baby, although bonding felt forced.", "The amitriptyline and diazepam prescriptions appear in a separate same-day medication card."], source: "SRC-0087, Trial Day 9, pp. 125–126, 06:49:47–06:53:44; SRC-0091, Trial Day 10, pp. 66–67", views: ["course"]
  },
  {
    id: "jan23", date: "2023-01-23T12:00:00", displayDate: "January 23", title: "Telehealth visit: final pre-offense encounter", short: "Video visit · depressed, flat; sleep “okay”; SI/HI denied", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "Clancy reported starting amitriptyline 10 mg without apparent side effects and being down to diazepam 2 mg, with more morning anxiety.",
    details: ["She remained depressed, flat, and poorly motivated, although sleep was reportedly okay.", "Clancy denied SI and HI; Tufts observed appropriate appearance, speech, thought process, cognition, and psychomotor activity, with no mania or psychosis.", "The dose changes appear in a separate same-day medication card."], source: "SRC-0087, Trial Day 9, pp. 126–128, 06:53:15–06:58:17; SRC-0091, Trial Day 10, pp. 67–68", caution: "These findings describe the video encounter and cannot establish her mental state at every later moment.", views: ["course"]
  },
  {
    id: "jan24-day", date: "2023-01-24T11:00:00", displayDate: "January 24 · daytime", title: "Family observation: normal-appearing interaction", short: "Happy and playful, according to Patrick", category: "collateral", evidence: "Collateral testimony", certainty: "Moderate", side: "top", tier: 0,
    summary: "Patrick later testified that Clancy appeared happy and playful with the children and did not disclose suicidal thoughts, child-harm thoughts, or a request for urgent help.",
    details: ["This supports apparent functioning during the observed period.", "It cannot reveal symptoms she did not disclose."], source: "SRC-0065, Trial Day 1, 2:44:50–2:45:37", views: ["course"]
  },
  {
    id: "cvs", date: "2023-01-24T16:48:00", displayDate: "January 24 · 4:48 PM", title: "CVS telephone call", short: "Coherent product question; no slurring noted", category: "event", evidence: "Objective record", certainty: "High", side: "bottom", tier: 0,
    summary: "A female caller asked CVS about a constipation product for a child, clarified the product, and appeared to understand the location or substitution.",
    details: ["The manager heard no slurring or impairment and described a normal interaction.", "This was a brief retail interaction—not a mental-status examination."], source: "SRC-0068, Trial Day 2, 45:02–47:31", views: ["course"]
  },
  {
    id: "threev", date: "2023-01-24T17:10:00", displayDate: "January 24 · 5:10 PM", title: "Phone call: ThreeV food order", short: "Organized call; nothing unusual heard", category: "event", evidence: "Objective record", certainty: "High", side: "top", tier: 1,
    summary: "A female caller placed a coherent food order, discussed items, and supplied pickup information. The hostess heard nothing unusual.",
    details: ["Objective records also place Patrick at CVS around 5:32–5:37 and ThreeV at approximately 5:54.", "The Commonwealth interprets the errands as creating an opportunity; that interpretation is contested."], source: "SRC-0068; SRC-0010, pp. 166–171", caution: "Organized behavior neither proves nor excludes psychosis or legal capacity.", views: ["course"]
  },
  {
    id: "return", date: "2023-01-24T18:20:00", displayDate: "January 24 · early evening", title: "Patrick returns", short: "Locked room, open window, suicide-attempt statement", category: "event", evidence: "Collateral testimony", certainty: "High", side: "bottom", tier: 1,
    summary: "Patrick found a locked bedroom, blood, and an open window. Outside, he found Clancy injured and heard her say, ‘I tried to kill myself.’",
    details: ["She directed him toward the children in the basement.", "The suicide attempt is evidence of acute distress but does not by itself establish diagnosis, psychosis, or legal insanity.", "A later civil pleading alleges an unspecified medication ingestion during the attempt; drug, dose, and timing remain unresolved."], source: "SRC-0068, 22:01–22:49 and 28:19–29:43; compare SRC-0032 ¶80", views: ["course"]
  },
  {
    id: "jan26", date: "2023-01-26T12:00:00", displayDate: "January 26", title: "Brigham psychiatric consultation", short: "Horrified but linear; no psychosis in snapshot", category: "post", evidence: "Treating testimony", certainty: "High", clinician: "Jhilam Biswas, MD", institution: "Brigham and Women’s Hospital", side: "top", tier: 0,
    summary: "While intubated and writing responses, Clancy described her mood as ‘horrified,’ asked whether she had an attorney, and asked about her body and legs.",
    details: ["Biswas found linear communication and no psychosis during a 20–30-minute assessment.", "She conceded that psychosis can fluctuate and that a person may have moments of clarity."], source: "SRC-0078, Trial Day 5, 2:02:12–2:13:31", caution: "This was approximately 1.5 days later and was not an offense-time forensic examination.", views: ["post"]
  },
  {
    id: "delirium", date: "2023-01-29T12:00:00", displayDate: "January 29–30", title: "Transient postoperative delirium", short: "Confusion and visual hallucinations resolve", category: "post", evidence: "Treating testimony", certainty: "High", clinician: "Sejal Shah, MD", institution: "Brigham and Women’s Hospital", side: "bottom", tier: 0,
    summary: "Shah identified postoperative delirium with confusion and visual hallucinations amid anesthesia, oxygen desaturation, tachycardia, and acute medical illness.",
    details: ["The delirium cleared by the following day.", "It should not be projected backward to January 24."], source: "SRC-0078, 1:29:04–1:32:45", views: ["post"]
  },
  {
    id: "voice", date: "2023-01-31T12:00:00", displayDate: "About one week later", title: "Male command voice first disclosed", short: "Retrospective statement to Patrick", category: "post", evidence: "Retrospective report", certainty: "Contested", side: "top", tier: 1,
    summary: "Patrick testified that Clancy told him she heard a male voice saying that if she did not act then, she would lose her chance.",
    details: ["This is the first positive voice account located in the trial record.", "No located pre-offense clinician note documents the voice.", "The more elaborate command/compulsion account appears later in the civil complaint."], source: "SRC-0068, 37:13–38:25", caution: "Moderate confidence that the statement was made; contested as proof of an offense-time hallucination.", views: ["post"]
  },
  {
    id: "feb", date: "2023-02-20T12:00:00", displayDate: "February 19–21", title: "Rehabilitation-oriented follow-up", short: "SI/HI/AH/VH denied", category: "post", evidence: "Treating testimony", certainty: "High", clinician: "Sejal Shah, MD", side: "bottom", tier: 1,
    summary: "Shah documented orientation and future orientation toward rehabilitation, denial of SI, HI, and hallucinations, and feeling down about paralysis and the events.",
    details: ["These are later treatment snapshots, not opinions about mental state during the alleged offenses."], source: "SRC-0078, 1:40:36–1:43:03", views: ["post"]
  },
  {
    id: "tox", date: "2023-04-14T12:00:00", displayDate: "February–April 2023", title: "Toxicology reports", short: "Six psychiatric agents or metabolites detected", category: "post", evidence: "Objective record", certainty: "High", side: "top", tier: 2,
    summary: "Case specimens detected diazepam/metabolites, lorazepam, trazodone, mirtazapine, lamotrigine, and quetiapine/metabolite.",
    details: ["The corrected report lists January 24 as the collection date but gives no collection time.", "The detected list did not cleanly match the intended outpatient medication list.", "Detection does not establish prescribed dose, exact ingestion time, adherence, impairment, psychiatric effect, or causation."], source: "SRC-0008; SRC-0039; SRC-0082", caution: "The civil complaint alleges unspecified event-day ingestion, further limiting inference about routine use.", views: ["post"]
  },
  {
    id: "spinelli", date: "2024-06-11T12:00:00", displayDate: "June & September 2024", title: "Spinelli forensic evaluations", short: "Bipolar/psychosis opinion attributed in civil pleading", category: "post", evidence: "Civil allegation", certainty: "Contested", clinician: "Margaret Spinelli, MD", side: "bottom", tier: 0,
    summary: "The civil complaint says Spinelli conducted a five-hour evaluation in June and a three-hour telephone evaluation in September, with collateral interviews.",
    details: ["The complaint attributes a bipolar-I/psychosis/postpartum-onset formulation and antidepressant-activation opinions to her.", "The complete report, testing, raw interviews, and testimony are not publicly available."], source: "SRC-0032 ¶¶84–88", caution: "Selected pleading quotations are not the expert report and are not adjudicated findings.", views: ["post"]
  },
];

const additionalCourseEvents: TimelineEvent[] = [
  {
    id: "sep12-forms", date: "2022-09-12T12:00:00", displayDate: "September 12", title: "Online intake forms completed", short: "Pre-visit symptom and safety screening—not an appointment", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 0,
    summary: "Clancy completed intake materials three days before her first Tufts evaluation.", details: ["The forms preceded the September 15 clinical assessment.", "Later testimony described anxiety, depressive symptoms, insomnia, and racing thoughts, with negative suicide, harm, voice, and psychosis items."], source: "SRC-0087, Trial Day 9, 03:38:39–04:06:46", caution: "The forms and the clinician encounter occurred on different dates.", views: ["course"]
  },
  {
    id: "rx-sep15", date: "2022-09-15T15:00:00", displayDate: "September 15", title: "Prescription: sertraline", short: "25 mg daily, then planned 50 mg · 25 mg ×30 filled", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "Tufts prescribed sertraline 25 mg daily for one week, then 50 mg; the pharmacy exhibit records a same-day 25 mg quantity-30 fill.", details: ["Indication was anxiety/depressive symptoms.", "Clancy later reported that she did not begin the medication on this date."], medication: "Zoloft (sertraline) 25 mg prescribed/filled; 50 mg planned", source: "SRC-0087, 04:03:55–04:06:46; SRC-0048, Sept. 15 row", caution: "Prescribed and filled do not establish ingestion.", views: ["course"]
  },
  {
    id: "sep28-visit", date: "2022-09-28T10:00:00", displayDate: "September 28", title: "Telehealth follow-up: symptoms improving", short: "Video visit · baby sleeping more; sertraline not started", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 2,
    summary: "At her second Tufts video visit, Clancy reported feeling somewhat better as the baby slept more, allowing her to sleep more. She said she had picked up sertraline but decided not to take it.", details: ["Tufts described her as alert, oriented, appropriately dressed and engaged, with euthymic mood, full affect, appropriate speech and thought, excellent judgment, intact cognition, and normal psychomotor activity.", "No hallucinations were reported.", "The decision to defer sertraline is shown in a separate medication card."], source: "SRC-0087, Trial Day 9, pp. 98–102, 05:33:09–05:42:45; SRC-0091, Trial Day 10, pp. 12–13", caution: "This card is the video encounter; the same-day medication decision is intentionally separate.", views: ["course"]
  },
  {
    id: "oct3-visit", date: "2022-10-03T12:00:00", displayDate: "October 3", title: "Telehealth visit: leave paperwork", short: "Video visit · postpartum leave documentation reviewed", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "Clancy met with Tufts by video after requesting help with paperwork to extend her maternity leave for postpartum anxiety and depression.", details: ["Tufts testified that the mental-status examination did not show a notable change from September 28.", "The appointment appears to have been scheduled after Tufts advised that the paperwork required information best reviewed together."], source: "SRC-0087, Trial Day 9, pp. 102–105, 05:42:50–05:52:52; SRC-0091, Trial Day 10, pp. 12–13", caution: "The encounter documents functional/administrative follow-up; it should not be treated as a new independent diagnosis.", views: ["course"]
  },
  {
    id: "med-oct20", date: "2022-10-20T15:00:00", displayDate: "October 20", title: "Medication decision: sertraline stopped", short: "After video visit · switch deferred; supplements discussed", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 1,
    summary: "Tufts advised Clancy to stop sertraline after the adverse-symptom report. Clancy did not want to start another prescription medication immediately.", details: ["Tufts discussed possible alternatives and natural supplements because Clancy was reluctant to begin another prescription.", "The exact sertraline start date and number of doses remain uncertain.", "Later history to Jollotta described roughly 48 hours without sleep and without fatigue; Jollotta called that an activating response."], medication: "Zoloft (sertraline) stopped; replacement prescription deferred", source: "SRC-0087, Trial Day 9, pp. 105–109, 05:52:52–06:00:08; SRC-0091, Trial Day 10, pp. 42–45; SRC-0096, Trial Day 11, pp. 46–50", caution: "Temporal association supports concern but does not prove a bipolar switch or medication causation.", views: ["course"]
  },
  {
    id: "rx-oct21", date: "2022-10-21T15:00:00", displayDate: "October 21", title: "Prescription: lorazepam", short: "0.5 mg ×7 · PRN severe anxiety", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "Tufts prescribed and the pharmacy dispensed seven 0.5-mg lorazepam tablets for severe anxiety after the sertraline-associated symptom report.", details: ["The intended use was short-term and as needed."], medication: "Ativan (lorazepam) 0.5 mg ×7 prescribed/filled", source: "SRC-0091, 01:52:33–01:58:48; SRC-0048", caution: "The number swallowed is not established.", views: ["course"]
  },
  {
    id: "rx-oct26", date: "2022-10-26T15:00:00", displayDate: "October 26", title: "Prescriptions: anxiety regimen", short: "Lorazepam 1 mg · buspirone 5 mg · hydroxyzine 25 mg", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 3,
    summary: "The pharmacy exhibit records three same-day fills as Tufts broadened the anxiety regimen.", details: ["Lorazepam 1 mg ×30.", "Buspirone 5 mg ×30 for daily use.", "Hydroxyzine 25 mg ×30 as a non-benzodiazepine option before lorazepam."], medication: "Lorazepam 1 mg; buspirone 5 mg; hydroxyzine 25 mg", source: "SRC-0091, 05:37:28–05:38:34; SRC-0048", caution: "The fills do not establish concurrent or subsequent use; buspirone was later reported not started.", views: ["course"]
  },
  {
    id: "rx-nov2", date: "2022-11-02T16:00:00", displayDate: "November 2", title: "Prescription/refill: lorazepam", short: "0.5 mg ×40 · gradual taper planned", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 2,
    summary: "Lorazepam 0.5 mg quantity 40 was filled while Tufts planned 0.25-mg reductions every two weeks.", details: ["Clancy reported benefit from lorazepam at the associated visit.", "Completion of the taper was not established."], medication: "Ativan (lorazepam) 0.5 mg ×40 filled", source: "SRC-0087, 06:11:43–06:16:20; SRC-0048", caution: "A taper plan is not proof of the doses actually used.", views: ["course"]
  },
  {
    id: "rx-nov9", date: "2022-11-09T12:00:00", displayDate: "November 9", title: "Pharmacy fill: buspirone", short: "5 mg ×30 · later adherence unresolved", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "A second buspirone 5-mg quantity-30 fill appears in the pharmacy exhibit.", details: ["On November 2 Clancy had reported that she had not started buspirone because she feared beginning a new medication.", "The later fill does not resolve whether she ever took it."], medication: "Buspar (buspirone) 5 mg ×30 filled", source: "SRC-0048, Nov. 9 row; SRC-0087, 06:11:23–06:12:04", caution: "Filled does not equal taken.", views: ["course"]
  },
  {
    id: "rx-nov16", date: "2022-11-16T17:00:00", displayDate: "November 16", title: "Prescription: trazodone", short: "50 mg ×30 after South Shore ED visit", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Kayvon Izadpanah, MD", institution: "South Shore Health", side: "bottom", tier: 3,
    summary: "Trazodone 50 mg quantity 30 was filled after the emergency-department encounter.", details: ["Clancy later reported that it helped her fall asleep but did not maintain sleep."], medication: "Desyrel (trazodone) 50 mg ×30 filled", source: "SRC-0048, Nov. 16 row; SRC-0091, 06:17:49–06:19:48", caution: "The duration and regularity of use are unknown.", views: ["course"]
  },
  {
    id: "paul-contact", date: "2022-11-20T12:00:00", displayDate: "November 20", title: "Phone call: first perinatal service contact", short: "Personal-phone outreach · sleep history reviewed", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "The South Shore perinatal service began contacts before the formal November 21 intake.", details: ["Clancy reported prior sertraline use and that lorazepam plus diphenhydramine had been most helpful for sleep."], source: "SRC-0091, 06:17:49–06:22:08", caution: "This reflects the history she gave the service, not independent confirmation of every earlier dose.", views: ["course"]
  },
  {
    id: "rx-nov21", date: "2022-11-21T15:00:00", displayDate: "November 21", title: "Prescription: fluoxetine", short: "10 mg ×56 · selected from prior reported benefit", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Paul prescribed fluoxetine 10 mg and a quantity of 56 was filled.", details: ["The selection relied on Clancy's report of prior benefit.", "Later evidence describes only a short trial before discontinuation."], medication: "Prozac (fluoxetine) 10 mg ×56 prescribed/filled", source: "SRC-0091, 06:23:24–06:33:23; SRC-0048", caution: "The quantity dispensed does not show how many doses were taken.", views: ["course"]
  },
  {
    id: "tufts-nov22", date: "2022-11-22T12:00:00", displayDate: "November 22", title: "Telehealth follow-up: transfer of care discussed", short: "Video visit · South Shore enrollment and medications reviewed", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "At a Tufts video visit, Clancy reported that she had enrolled with South Shore's perinatal mental-health service and planned to transfer psychiatric and therapy care there.", details: ["She reported plans to start fluoxetine and continued use of lorazepam and diphenhydramine for sleep as needed.", "She denied SI and HI, and Tufts observed no psychosis.", "They also discussed a return-to-work letter."], source: "SRC-0087, Trial Day 9, pp. 113–114, 06:16:20–06:19:11; SRC-0091, Trial Day 10, pp. 39–40", caution: "The medication history in this card is patient report to Tufts; prescribing and dispensing are documented separately.", views: ["course"]
  },
  {
    id: "rx-nov25", date: "2022-11-25T15:00:00", displayDate: "November 25", title: "Prescriptions: revised sleep regimen", short: "Zolpidem 5 mg · mirtazapine 7.5 mg · clonazepam 0.5 mg", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 3,
    summary: "Three prescriptions were dispensed during a rapid change in the sleep regimen.", details: ["Zolpidem 5 mg ×1 for a one-dose trial.", "Mirtazapine 7.5 mg ×30.", "Clonazepam 0.5 mg ×14; Paul warned not to combine it with lorazepam."], medication: "Ambien 5 mg; Remeron 7.5 mg; Klonopin 0.5 mg", source: "SRC-0091, 06:40:43–06:45:00; SRC-0048", caution: "Zolpidem ingestion is unproved; later messages support only specified mirtazapine/clonazepam nights.", views: ["course"]
  },
  {
    id: "msg-nov26", date: "2022-11-26T12:00:00", displayDate: "November 26", title: "MyChart message: sleep after new regimen", short: "Reports mirtazapine 7.5 mg + clonazepam 0.5 mg", category: "medication", evidence: "Reported to clinician", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Clancy reported taking mirtazapine 7.5 mg with clonazepam 0.5 mg and sleeping, and asked about trying 15 mg mirtazapine.", details: ["This is patient-reported ingestion for one specific night."], medication: "Remeron 7.5 mg + Klonopin 0.5 mg reportedly taken", source: "SRC-0091, 06:45:21–06:46:33", caution: "It does not establish a continuous regimen.", views: ["course"]
  },
  {
    id: "msg-nov29", date: "2022-11-29T09:00:00", displayDate: "November 29", title: "MyChart message: slight sleep benefit", short: "Reports mirtazapine 15 mg + CBD", category: "medication", evidence: "Reported to clinician", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "Before the Jollotta visit, Clancy reported mirtazapine 15 mg plus CBD with only slight sleep benefit.", details: ["The CBD product and dose are unknown."], medication: "Remeron 15 mg + CBD reportedly taken", source: "SRC-0091, 06:49:51–06:50:41", caution: "Patient report; the product and causal effects were not independently established.", views: ["course"]
  },
  {
    id: "rx-nov30", date: "2022-11-30T18:00:00", displayDate: "November 30", title: "Prescription: quetiapine", short: "25 mg ×30 · low-dose sleep intervention", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "Jollotta prescribed quetiapine 25 mg and the pharmacy exhibit records a quantity-30 fill.", details: ["The stated target at this dose was insomnia."], medication: "Seroquel (quetiapine) 25 mg ×30 prescribed/filled", source: "SRC-0096, pp. 28–30; SRC-0048", caution: "This low-dose prescription does not itself establish a bipolar or psychotic diagnosis or immediate ingestion.", views: ["course"]
  },
  {
    id: "tufts-dec1", date: "2022-12-01T16:00:00", displayDate: "December 1", title: "Telehealth follow-up: fears approaching SI", short: "Video visit · separate from Jollotta MyChart exchange", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "At a separate Tufts video appointment, Clancy denied active suicidal ideation but described fear of getting close to suicidal thoughts and said she was not improving.", details: ["She reviewed recent sleep-medication trials and side effects as she understood them.", "Lamotrigine was discussed but not prescribed that day.", "She reported having started mirtazapine and was uncertain whether quetiapine had begun."], source: "SRC-0087, Trial Day 9, pp. 114–119, 06:19:11–06:31:40; SRC-0091, Trial Day 10, pp. 53–54", caution: "Keep this video encounter distinct from the same-day portal exchange with Jollotta; her medication history was self-report.", views: ["course"]
  },
  {
    id: "tufts-dec16", date: "2022-12-16T11:00:00", displayDate: "December 16", title: "Telehealth follow-up: depression despite restored sleep", short: "Video visit · post-MGH; hopelessness reviewed", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "At a Tufts video visit after the MGH evaluation, Clancy said sleep finally worked but daytime depression, low motivation, and hopelessness persisted.", details: ["She described prior suicidal ideation as hopelessness and fear of not improving, without intent or plan.", "She reported taking quetiapine 200 mg with diazepam and awaiting Women & Infants care.", "Tufts prescribed lamotrigine 25 mg; the prescription is shown in a separate medication card, and the later Jollotta MyChart exchange is also separate."], source: "SRC-0087, Trial Day 9, pp. 119–121, 06:31:40–06:38:00; SRC-0091, Trial Day 10, pp. 62–63", caution: "This was Tufts's video assessment. The separate portal exchange records Jollotta's later endorsement and dosing recommendations.", views: ["course"]
  },
  {
    id: "tufts-jan9", date: "2023-01-09T10:00:00", displayDate: "January 9", title: "Telehealth follow-up: rebound anxiety", short: "Video visit · flat mood; no recent SI; no psychosis", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 1,
    summary: "Clancy reported rebound anxiety as nighttime lorazepam wore off, with a flat mood but some ability to laugh and no recent suicidal thoughts.", details: ["She denied HI, and Tufts observed no psychosis.", "Amitriptyline and bupropion were discussed, but no antidepressant was selected that day.", "The lorazepam-to-diazepam decision appears in a separate same-day medication card."], source: "SRC-0087, Trial Day 9, pp. 123–124, 06:44:06–06:47:54; SRC-0091, Trial Day 10, pp. 65–66", caution: "Medication options discussed are not medications prescribed or taken.", views: ["course"]
  },
  {
    id: "msg-dec8", date: "2022-12-08T12:00:00", displayDate: "December 8", title: "MyChart message: sleep improves; panic follows", short: "Reports diazepam + quetiapine; doses unspecified", category: "symptom", evidence: "Reported to clinician", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 2,
    summary: "Clancy reported taking diazepam and quetiapine, sleeping about 9 p.m. to 5 a.m. with awakenings, then experiencing panic and asking for a slower diazepam taper.", details: ["The message did not specify the doses used."], medication: "Diazepam + quetiapine reportedly taken; doses unspecified", source: "SRC-0096, Day 11 PDF p. 54, 3:17:06–3:18:45", caution: "Do not infer a dose from the proposed titration schedule.", views: ["course"]
  },
  {
    id: "rx-dec6", date: "2022-12-06T18:00:00", displayDate: "December 6", title: "Prescription/fill: diazepam", short: "5 mg · quantity unclear in exhibit", category: "medication", evidence: "Objective record", certainty: "Moderate", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Jollotta initiated the longer-half-life diazepam strategy; the December 6 pharmacy quantity is visually unclear.", details: ["On redirect Jollotta described one linked tablet on December 6, followed by two on December 7 and eight on December 9."], medication: "Valium (diazepam) 5 mg filled; quantity unresolved", source: "SRC-0048; SRC-0096, pp. 48–50 and 105–106", caution: "The underlying pharmacy exhibit controls; neither the display nor testimony establishes ingestion.", views: ["course"]
  },
  {
    id: "rx-dec7", date: "2022-12-07T18:00:00", displayDate: "December 7", title: "Prescriptions/fills: quetiapine + diazepam", short: "100 mg · 5 mg ×2", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 3,
    summary: "The pharmacy display records quetiapine 100 mg and diazepam 5 mg quantity 2 on December 7.", details: ["The quetiapine display reads quantity 30, while Jollotta testified she believed the quantity was 22.", "The same-day quetiapine titration was a recommendation, not proof that later 300- or 400-mg targets were used."], medication: "Seroquel 100 mg; Valium 5 mg ×2", source: "SRC-0048; SRC-0096, pp. 52–56 and 79–80", caution: "Quetiapine quantity is disputed; dispensing does not establish adherence.", views: ["course"]
  },
  {
    id: "call-dec9", date: "2022-12-09T11:00:00", displayDate: "December 9", title: "Phone call: SI without plan or intent", short: "Better sleep; panic, numbness and intrusive thoughts", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "In a call with Lindsay and Patrick, improved sleep was weighed against panic, numbness, intrusive thoughts, and suicidal thoughts without plan or intent.", details: ["Jollotta again encouraged Women & Infants partial hospitalization.", "The quetiapine titration continued as a possible mixed/activated-state strategy."], source: "SRC-0096, pp. 54–56, 3:19:37–3:24:00", caution: "The state remained a differential, not a confirmed diagnosis.", views: ["course"]
  },
  {
    id: "rx-dec9", date: "2022-12-09T16:00:00", displayDate: "December 9", title: "Pharmacy fill: diazepam", short: "5 mg ×8", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 3,
    summary: "The pharmacy exhibit records diazepam 5 mg quantity 8.", details: ["The fill formed part of the longer-half-life benzodiazepine strategy."], medication: "Valium (diazepam) 5 mg ×8 filled", source: "SRC-0048, Dec. 9 row; SRC-0096, pp. 105–106", caution: "The fill does not establish the dose taken each night.", views: ["course"]
  },
  {
    id: "rx-dec13", date: "2022-12-13T17:00:00", displayDate: "December 13", title: "Prescription/fill: diazepam", short: "2 mg ×7 · taper plan", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 3,
    summary: "Diazepam 2 mg quantity 7 was filled as the taper continued.", details: ["The associated plan was 2 mg nightly; compliance is not independently established."], medication: "Valium (diazepam) 2 mg ×7 filled", source: "SRC-0048, Dec. 13 row; SRC-0096, pp. 57–62", caution: "Planned dose and actual ingestion remain distinct.", views: ["course"]
  },
  {
    id: "mgh-dec15", date: "2022-12-15T19:00:00", displayDate: "December 15", title: "Hospital encounter: MGH evaluation", short: "Emergency assessment after higher-care discussion", category: "hospital", evidence: "Treating testimony", certainty: "High", institution: "Massachusetts General Hospital", side: "top", tier: 3,
    summary: "Clancy went to the MGH emergency department after the December 15 higher-level-of-care discussion.", details: ["She then chose outpatient Women & Infants follow-up."], source: "SRC-0096, pp. 63–67", caution: "The complete MGH record is not publicly available; this card states the sequence supported by treating testimony.", views: ["course"]
  },
  {
    id: "rx-dec16", date: "2022-12-16T18:00:00", displayDate: "December 16", title: "Prescription: lamotrigine", short: "25 mg ×30 · Jollotta endorsed; ingestion unknown", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 3,
    summary: "Tufts prescribed and the pharmacy dispensed lamotrigine 25 mg quantity 30.", details: ["Jollotta later endorsed the plan and counseled about rash and slow titration.", "She testified that she did not know whether Clancy took it."], medication: "Lamictal (lamotrigine) 25 mg ×30 prescribed/filled", source: "SRC-0087, 06:31:40–06:37:05; SRC-0048; SRC-0096, pp. 66–69", caution: "Prescription, fill, and cross-provider endorsement do not establish ingestion.", views: ["course"]
  },
  {
    id: "msg-dec19", date: "2022-12-19T10:00:00", displayDate: "December 19", title: "MyChart message: intermittent diazepam use", short: "Reports 2 mg every other night; asks for refill", category: "medication", evidence: "Reported to clinician", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Clancy reported using diazepam 2 mg every other night and requested a refill before Women & Infants.", details: ["Jollotta had recommended daily dosing."], medication: "Valium (diazepam) 2 mg reportedly every other night", source: "SRC-0096, pp. 68–69, 3:53:24–3:55:58", caution: "Patient report does not establish a complete dosing record.", views: ["course"]
  },
  {
    id: "rx-dec19", date: "2022-12-19T17:00:00", displayDate: "December 19", title: "Pharmacy fills: quetiapine ER + diazepam", short: "300 mg ×30 · 2 mg ×14", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 3,
    summary: "The pharmacy exhibit records quetiapine ER 300 mg quantity 30 and diazepam 2 mg quantity 14.", details: ["The quetiapine fill followed a 300-mg recommendation.", "Neither fill proves the dose actually taken."], medication: "Seroquel XR 300 mg; Valium 2 mg", source: "SRC-0048, Dec. 19 rows; SRC-0096, pp. 65–70", caution: "Do not treat the quetiapine fill as proof that the reported 200-mg dose increased to 300 mg.", views: ["course"]
  },
  {
    id: "rx-dec21", date: "2022-12-21T17:00:00", displayDate: "December 21", title: "Pharmacy fill: quetiapine taper supply", short: "100 mg ×14", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 2,
    summary: "Quetiapine 100 mg quantity 14 was filled to support the planned taper.", details: ["The taper instructed 200 mg for four nights, then 100 mg for four, 50 mg for four, then stop."], medication: "Seroquel (quetiapine) 100 mg ×14 filled", source: "SRC-0048; SRC-0096, pp. 69–74", caution: "A taper supply does not show that the schedule was followed.", views: ["course"]
  },
  {
    id: "rx-dec22", date: "2022-12-22T12:00:00", displayDate: "December 22", title: "Pharmacy fill: quetiapine taper supply", short: "25 mg ×14", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "Quetiapine 25 mg quantity 14 was filled as part of the taper supply.", details: ["This was Jollotta's last medication fill in the pharmacy display according to her Day 11 redirect testimony."], medication: "Seroquel (quetiapine) 25 mg ×14 filled", source: "SRC-0048; SRC-0096, pp. 105–106", caution: "The pharmacy row is a dispensing event, not proof of ingestion.", views: ["course"]
  },
  {
    id: "call-dec30", date: "2022-12-30T09:00:00", displayDate: "December 30", title: "Phone call: family seeks McLean placement", short: "Clinic directs family to ED/911 pathway", category: "collateral", evidence: "Contemporaneous record", certainty: "High", clinician: "South Shore clinic staff", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "Patrick called the South Shore clinic seeking McLean placement; the chart described Clancy as safe and staff advised ED or 911 because beds could not be held.", details: ["The call preceded the MGH presentation and January 1 McLean admission."], source: "SRC-0096, Day 11 PDF p. 73, 4:04:35–4:05:42", caution: "This is family collateral reflected in a clinic record, not a direct mental-status examination.", views: ["course"]
  },
  {
    id: "mgh-dec30-encounter", date: "2022-12-30T19:00:00", displayDate: "December 30", title: "Hospital encounter: MGH presentation", short: "Voluntary pathway toward McLean admission", category: "hospital", evidence: "Retrospective report", certainty: "Moderate", institution: "Massachusetts General Hospital", side: "bottom", tier: 3,
    summary: "The available chronology places Clancy at MGH before her January 1 voluntary arrival at McLean.", details: ["The exact December 29–31 sequence is not fully established by a public primary chart.", "Goodheart's testimony establishes arrival at McLean from MGH on January 1."], source: "SRC-0032 ¶¶59–62; SRC-0087, 01:16:19–01:22:02", caution: "The MGH date rests partly on retrospective/civil chronology; the full record is unavailable.", views: ["course"]
  },
  {
    id: "rx-jan5", date: "2023-01-05T17:00:00", displayDate: "January 5", title: "Discharge prescriptions: trazodone + lorazepam", short: "50 mg ×28 · 1 mg ×14 · melatonin planned", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Alia Goodheart, MD", institution: "McLean Hospital", side: "top", tier: 3,
    summary: "McLean discharge prescriptions were trazodone 50 mg quantity 28 and lorazepam 1 mg quantity 14; melatonin was included in the plan.", details: ["Goodheart described these as short-term or PRN discharge medications.", "No further quetiapine was planned."], medication: "Desyrel 50 mg; Ativan 1 mg; melatonin", source: "SRC-0048, Jan. 5 rows; SRC-0087, 01:50:21–01:54:44", caution: "Home use is not established by the discharge prescriptions.", views: ["course"]
  },
  {
    id: "rx-jan13", date: "2023-01-13T12:00:00", displayDate: "January 13", title: "Pharmacy fill: diazepam—prescriber disputed", short: "2 mg ×7 · display/testimony conflict", category: "medication", evidence: "Objective record", certainty: "Contested", side: "top", tier: 2,
    summary: "The pharmacy display shows diazepam 2 mg quantity 7 and visually attributes it to Jollotta, but Jollotta testified that she prescribed no medication in January.", details: ["The dispensing row exists.", "The prescriber attribution remains unresolved in the public record."], medication: "Valium (diazepam) 2 mg ×7 filled; prescriber unresolved", source: "SRC-0048; SRC-0096, pp. 105–106", caution: "Do not silently choose between the exhibit attribution and the witness's redirect testimony; ingestion is also unproved.", views: ["course"]
  },
  {
    id: "rx-jan16", date: "2023-01-16T17:00:00", displayDate: "January 16", title: "Prescriptions: amitriptyline + diazepam", short: "10 mg ×30 · 2 mg ×3", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 3,
    summary: "Tufts prescribed amitriptyline 10 mg and continued the diazepam taper; both were filled.", details: ["Amitriptyline 10 mg ×30.", "Diazepam 2 mg ×3."], medication: "Elavil 10 mg; Valium 2 mg", source: "SRC-0091, 03:55:47–04:00:32; SRC-0048", caution: "The fills do not establish adherence.", views: ["course"]
  },
  {
    id: "rx-jan19", date: "2023-01-19T12:00:00", displayDate: "January 19", title: "Pharmacy fill: diazepam—prescriber disputed", short: "2 mg ×14 · display/testimony conflict", category: "medication", evidence: "Objective record", certainty: "Contested", side: "top", tier: 3,
    summary: "The pharmacy display shows diazepam 2 mg quantity 14 and visually attributes it to Jollotta, who testified that she issued no January prescriptions.", details: ["The fill is recorded, but prescriber attribution, coordination, and actual use remain unresolved."], medication: "Valium (diazepam) 2 mg ×14 filled; prescriber unresolved", source: "SRC-0048; SRC-0096, pp. 105–106", caution: "Do not infer a daily dose or adherence from the fill.", views: ["course"]
  },
  {
    id: "rx-jan23", date: "2023-01-23T17:00:00", displayDate: "January 23", title: "Prescription change: amitriptyline increased", short: "20 mg ordered · diazepam 2 mg fill quantity unclear", category: "medication", evidence: "Treating testimony", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 3,
    summary: "Tufts increased the prescribed amitriptyline dose from 10 to 20 mg and slowed the diazepam taper; the pharmacy display also shows a diazepam 2-mg fill with uncertain quantity.", details: ["Clancy reported having started 10 mg without apparent side effects.", "Whether she took a 20-mg dose is not established."], medication: "Elavil 20 mg prescribed; Valium 2 mg fill (quantity unclear)", source: "SRC-0087, 06:53:46–06:57:48; SRC-0091, 05:50:57–05:52:12; SRC-0048", caution: "The ordered dose increase is not evidence that the higher dose was ingested.", views: ["course"]
  },
];

const allEvents = [...events, ...additionalCourseEvents];

const medications: Medication[] = [
  { name: "Zoloft", generic: "sertraline", color: "#e77bff", className: "SSRI", summary: "First SSRI; filled in September, started later, and stopped after sleep/anxiety worsening.", segments: [
    { start: "2022-09-15", end: "2022-09-22", label: "25 mg", status: "prescribed", note: "Prescribed as the first week of a 25→50 mg titration; Clancy later said she had not started it then." },
    { start: "2022-09-22", end: "2022-09-29", label: "50 mg", status: "planned", note: "Planned second step of the September prescription; this interval is not established exposure." },
    { start: "2022-10-06", end: "2022-10-13", label: "25 mg", status: "planned", note: "Reportedly begun later than prescribed; exact start date is unresolved, so this interval is schematic and uncertain." },
    { start: "2022-10-13", end: "2022-10-20", label: "50 mg", status: "reported", note: "Reported increase to 50 mg before discontinuation; exact dates and adherence remain uncertain." },
  ]},
  { name: "Ativan", generic: "lorazepam", color: "#ff8eac", className: "benzodiazepine", summary: "Short-term PRN anxiety/sleep medication; taper attempted; later used at McLean discharge.", segments: [
    { start: "2022-10-21", end: "2022-10-26", label: "0.5 mg", status: "prescribed", note: "0.5 mg ×7 prescribed and filled PRN for severe anxiety." },
    { start: "2022-10-26", end: "2022-11-02", label: "1 mg", status: "prescribed", note: "1 mg ×30 prescribed and filled; actual frequency is unknown." },
    { start: "2022-11-02", end: "2022-12-05", label: "0.5 mg", status: "reported", note: "0.5 mg ×40 filled; Clancy reported benefit and a taper was planned, but PRN dose and frequency varied." },
    { start: "2023-01-01", end: "2023-01-05", label: "1 mg", status: "inpatient", note: "McLean changed diazepam to lorazepam; the discharge strength was 1 mg." },
    { start: "2023-01-05", end: "2023-01-09", label: "1 mg", status: "reported", note: "1 mg ×14 at discharge; Clancy reported 1 mg use on January 6." },
    { start: "2023-01-24", label: "detected", status: "detected", note: "Lorazepam detected in case specimens; timing and clinical meaning unresolved." },
  ]},
  { name: "Buspar", generic: "buspirone", color: "#9f8cff", className: "anxiolytic", summary: "Daily non-benzodiazepine alternative; filled twice but initially not started.", segments: [
    { start: "2022-10-26", end: "2022-11-09", label: "5 mg", status: "prescribed", note: "5 mg ×30 was filled October 26 and again November 9; Clancy reported on November 2 that she had not started it." },
  ]},
  { name: "Hydroxyzine", generic: "hydroxyzine", color: "#a7c4ff", className: "antihistamine", summary: "PRN alternative to lorazepam; one fill, later offered and declined.", segments: [
    { start: "2022-10-26", end: "2022-11-29", label: "25 mg", status: "prescribed", note: "25 mg ×30 was prescribed and filled as an alternative to lorazepam; ingestion is not established. A later offer was declined." },
  ]},
  { name: "Desyrel", generic: "trazodone", color: "#39d9d2", className: "SARI / hypnotic", summary: "Repeated sleep intervention across the ED, McLean discharge, and January outpatient treatment.", segments: [
    { start: "2022-11-16", end: "2022-11-21", label: "50 mg", status: "reported", note: "50 mg ×30 filled after the ED visit; later reported to help sleep initiation but not maintenance." },
    { start: "2023-01-01", end: "2023-01-05", label: "50 mg", status: "inpatient", note: "Used as-needed during McLean care; 50 mg was the discharge prescription strength." },
    { start: "2023-01-05", end: "2023-01-06", label: "50 mg", status: "prescribed", note: "50 mg ×28 filled at McLean discharge." },
    { start: "2023-01-06", end: "2023-01-12", label: "100 mg", status: "reported", note: "Clancy reported taking 100 mg at the January 6 Tufts follow-up." },
    { start: "2023-01-12", end: "2023-01-24", label: "150 mg", status: "prescribed", note: "150 mg ×30 prescribed and filled; the nightly dose through January 24 is not established." },
    { start: "2023-01-24", label: "detected", status: "detected", note: "0.44 mcg/mL reported by NMS; dose and timing cannot be inferred." },
  ]},
  { name: "Prozac", generic: "fluoxetine", color: "#ffd166", className: "SSRI", summary: "Short November trial with activation-like symptoms; December retrial considered, then held.", segments: [
    { start: "2022-11-21", end: "2022-11-25", label: "10 mg", status: "reported", note: "Reportedly taken for approximately three or four days, then stopped after worse sleep and disconnection/spaceyness." },
    { start: "2022-11-30", end: "2022-12-07", label: "10 mg", status: "planned", note: "A 10-mg retrial was considered, then held; December ingestion is not established." },
  ]},
  { name: "Ambien", generic: "zolpidem", color: "#f7bdff", className: "Z-drug", summary: "One-tablet trial was filled; ingestion is unproved. Later higher-dose offer was declined.", segments: [
    { start: "2022-11-25", end: "2022-11-26", label: "5 mg", status: "prescribed", note: "One 5-mg tablet was prescribed and filled for a one-dose trial; ingestion is unproved." },
  ]},
  { name: "Remeron", generic: "mirtazapine", color: "#f48fb1", className: "tetracyclic antidepressant", summary: "Brief, interrupted late-November trial with reported disconnection and death-related intrusive thoughts.", segments: [
    { start: "2022-11-25", end: "2022-11-27", label: "7.5 mg", status: "reported", note: "7.5 mg filled; Clancy reported taking 7.5 mg on November 26." },
    { start: "2022-11-27", end: "2022-12-02", label: "15 mg", status: "reported", note: "15 mg was reported on November 27 and 29 and again in a stop/restart sequence through December 2." },
    { start: "2023-01-24", label: "detected", status: "detected", note: "Detected later, but regular versus event-day exposure cannot be separated." },
  ]},
  { name: "Klonopin", generic: "clonazepam", color: "#ffad87", className: "benzodiazepine", summary: "Very brief two-night combination with mirtazapine.", segments: [
    { start: "2022-11-25", end: "2022-11-28", label: "0.5 mg", status: "reported", note: "0.5 mg ×14 filled and 0.5 mg reported on two nights; she considered stopping after feeling disconnected." },
  ]},
  { name: "Seroquel", generic: "quetiapine", color: "#71e2ff", className: "second-generation antipsychotic", summary: "Began as low-dose sleep treatment, shifted toward a possible mixed-state target, then tapered.", segments: [
    { start: "2022-11-30", end: "2022-12-02", label: "25 mg", status: "prescribed", note: "25 mg ×30 prescribed and filled as a low-dose insomnia intervention." },
    { start: "2022-12-01", end: "2022-12-03", label: "25 mg", status: "reported", level: 1, note: "Clancy reported taking 25 mg with mirtazapine in the December 1–2 sequence." },
    { start: "2022-12-02", end: "2022-12-06", label: "50 mg", status: "planned", note: "Jollotta recommended 50 mg for sleep; ingestion at this dose is not established." },
    { start: "2022-12-07", end: "2022-12-08", label: "100 mg", status: "planned", note: "First step in the proposed four-night titration." },
    { start: "2022-12-08", end: "2022-12-09", label: "200 mg", status: "planned", note: "Second proposed titration step." },
    { start: "2022-12-09", end: "2022-12-10", label: "300 mg", status: "planned", note: "Third proposed titration step; ingestion is not established." },
    { start: "2022-12-10", end: "2022-12-11", label: "400 mg", status: "planned", note: "Recommended target only; 400 mg was not shown taken." },
    { start: "2022-12-09", end: "2022-12-17", label: "200 mg", status: "reported", level: 1, note: "By December 12 Clancy reported 200 mg nightly for three nights; 200 mg remained the reported dose through December 16." },
    { start: "2022-12-16", end: "2022-12-20", label: "300 mg", status: "planned", note: "Jollotta recommended 300 mg; a 300-mg ER fill followed, but ingestion is not established." },
    { start: "2022-12-21", end: "2022-12-25", label: "200 mg", status: "planned", note: "First step of the Women & Infants-related outpatient taper." },
    { start: "2022-12-25", end: "2022-12-29", label: "100 mg", status: "planned", note: "Second step of the outpatient taper." },
    { start: "2022-12-29", end: "2023-01-02", label: "50 mg", status: "planned", note: "Final dose step before planned discontinuation." },
    { start: "2023-01-01", end: "2023-01-02", label: "75 mg", status: "inpatient", level: 1, note: "McLean taper sequence described as 75→50→25→0; exact administration times are not public." },
    { start: "2023-01-02", end: "2023-01-03", label: "50 mg", status: "inpatient", level: 1, note: "Recorded McLean taper step; day boundary is approximate within the January 1–5 admission." },
    { start: "2023-01-03", end: "2023-01-05", label: "25 mg", status: "inpatient", level: 1, note: "Recorded final McLean taper step before discontinuation." },
    { start: "2023-01-24", label: "detected", status: "detected", note: "1,800 ng/mL reported by NMS; timing and meaning unresolved." },
  ]},
  { name: "Valium", generic: "diazepam", color: "#ffca7a", className: "benzodiazepine", summary: "Used in December and again after McLean as a longer-half-life taper strategy.", segments: [
    { start: "2022-12-06", end: "2022-12-09", label: "5 mg", status: "prescribed", note: "Short 5-mg fills on December 6, 7, and 9 supported the longer-half-life taper strategy." },
    { start: "2022-12-09", end: "2022-12-13", label: "2.5 mg", status: "reported", note: "On December 12 Clancy reported 2.5 mg nightly for the prior three nights." },
    { start: "2022-12-13", end: "2022-12-20", label: "2 mg", status: "reported", note: "The December 13 plan was 2 mg nightly; by December 19 she reported trying to use 2 mg every other night." },
    { start: "2023-01-09", end: "2023-01-13", label: "5 mg", status: "prescribed", note: "Tufts restarted diazepam; 5 mg ×14 was filled." },
    { start: "2023-01-13", end: "2023-01-24", label: "2 mg", status: "reported", note: "Multiple 2-mg fills appear; prescriber attribution is disputed, and Clancy reported being down to 2 mg on January 23." },
    { start: "2023-01-24", label: "detected", status: "detected", note: "Diazepam and metabolites detected; dose and timing unresolved." },
  ]},
  { name: "Lamictal", generic: "lamotrigine", color: "#8ce99a", className: "mood stabilizer / anticonvulsant", summary: "Prescribed and filled at 25 mg; regular use is not documented, but later exposure was detected.", segments: [
    { start: "2022-12-16", end: "2023-01-24", label: "25 mg", status: "prescribed", note: "Tufts prescribed and the pharmacy filled 25 mg; Jollotta endorsed it but did not know whether it was taken." },
    { start: "2023-01-24", label: "detected", status: "detected", note: "6.1 mcg/mL reported by NMS." },
  ]},
  { name: "Elavil", generic: "amitriptyline", color: "#bea7ff", className: "tricyclic antidepressant", summary: "Started late in the course; dose increase prescribed the day before the deaths.", segments: [
    { start: "2023-01-16", end: "2023-01-23", label: "10 mg", status: "reported", note: "10 mg ×30 prescribed and filled; Clancy reported starting 10 mg without apparent adverse effects." },
    { start: "2023-01-23", end: "2023-01-24", label: "20 mg", status: "prescribed", note: "Tufts prescribed an increase to 20 mg; whether that dose was taken is not established." },
  ]},
];

function stamp(value: string) {
  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  return new Date(`${normalized}Z`).getTime();
}

function timelineDate(value: string, options: Intl.DateTimeFormatOptions) {
  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  return new Date(`${normalized}Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

function pct(value: string, start: string, end: string) {
  return ((stamp(value) - stamp(start)) / (stamp(end) - stamp(start))) * 100;
}

const courseBreak = {
  birthEnd: "2022-06-02T00:00:00",
  onsetStart: "2022-08-25T00:00:00",
  breakStartPct: 1.5,
  breakEndPct: 2.3,
};

function timelinePct(value: string, view: ViewKey, start: string, end: string) {
  if (view !== "course") return pct(value, start, end);
  const time = stamp(value);
  const birthEnd = stamp(courseBreak.birthEnd);
  const onsetStart = stamp(courseBreak.onsetStart);
  if (time <= birthEnd) return ((time - stamp(start)) / (birthEnd - stamp(start))) * courseBreak.breakStartPct;
  if (time < onsetStart) return (courseBreak.breakStartPct + courseBreak.breakEndPct) / 2;
  return courseBreak.breakEndPct + ((time - onsetStart) / (stamp(end) - onsetStart)) * (100 - courseBreak.breakEndPct);
}

function packMedicationContext(canvasWidth: number) {
  const range = views.course;
  const items: PackedMedicationItem[] = medications.flatMap((medication) => medication.segments.flatMap((segment, segmentIndex) => {
    if (!segment.end) return [];
    const start = Math.min(99.5, Math.max(0, timelinePct(segment.start, "course", range.start, range.end)));
    const end = Math.min(100, Math.max(start, timelinePct(segment.end, "course", range.start, range.end)));
    const label = `${medication.name} · ${segment.label}`;
    const labelWidth = Math.min(145, Math.max(62, 20 + label.length * 5.25));
    const labelPct = (labelWidth / canvasWidth) * 100;
    const visualStart = start;
    const visualEnd = Math.min(100, Math.max(end, start + labelPct));
    return { medication, segment, segmentIndex, start, end, visualStart, visualEnd };
  }));

  items.sort((a, b) => a.visualStart - b.visualStart || a.visualEnd - b.visualEnd);
  const rows: PackedMedicationItem[][] = [];
  const rowEnds: number[] = [];
  const gutterPct = (8 / canvasWidth) * 100;

  items.forEach((item) => {
    let rowIndex = rowEnds.findIndex((rowEnd) => rowEnd + gutterPct <= item.visualStart);
    if (rowIndex === -1) {
      rowIndex = rows.length;
      rows.push([]);
      rowEnds.push(-Infinity);
    }
    rows[rowIndex].push(item);
    rowEnds[rowIndex] = item.visualEnd;
  });

  return rows;
}

function packTimelineEvents(eventsToPlace: TimelineEvent[], view: ViewKey, start: string, end: string, canvasWidth: number) {
  const cardWidth = 184;
  const halfCard = cardWidth / 2;
  const collisionGap = 12;
  const laneEnds = {
    top: Array(4).fill(-Infinity) as number[],
    bottom: Array(4).fill(-Infinity) as number[],
  };
  const laneTop = {
    top: [101, 202, 303, 404],
    bottom: [517, 618, 719, 820],
  };

  return eventsToPlace.map((event) => {
    const x = Math.min(99.2, Math.max(.8, timelinePct(event.date, view, start, end)));
    const eventX = canvasWidth * x / 100;
    const cardCenter = Math.min(canvasWidth - halfCard - 8, Math.max(halfCard + 8, eventX));
    const cardLeft = cardCenter - halfCard;
    const cardRight = cardCenter + halfCard;
    const preferredSides: ("top" | "bottom")[] = [event.side, event.side === "top" ? "bottom" : "top"];
    let chosenSide: "top" | "bottom" | null = null;
    let chosenLane = -1;

    for (const side of preferredSides) {
      const freeLane = laneEnds[side].findIndex((rightEdge) => rightEdge + collisionGap <= cardLeft);
      if (freeLane !== -1) {
        chosenSide = side;
        chosenLane = freeLane;
        break;
      }
    }

    if (chosenSide === null) {
      const candidates = preferredSides.flatMap((side) => laneEnds[side].map((rightEdge, lane) => ({ side, lane, rightEdge })));
      const earliest = candidates.reduce((best, candidate) => candidate.rightEdge < best.rightEdge ? candidate : best);
      chosenSide = earliest.side;
      chosenLane = earliest.lane;
    }

    laneEnds[chosenSide][chosenLane] = Math.max(laneEnds[chosenSide][chosenLane], cardRight);
    const top = laneTop[chosenSide][chosenLane];
    const connectorTop = chosenSide === "top" ? top + 96 : 513;
    const connectorHeight = chosenSide === "top" ? 503 - (top + 96) : top - 513;
    return {
      event,
      x,
      top,
      cardOffset: cardCenter - eventX,
      connectorTop,
      connectorHeight,
      color: categoryMeta[event.category].color,
    };
  });
}

function monthTicks(start: string, end: string) {
  const result: { date: string; label: string }[] = [];
  const cursor = new Date(`${start}Z`);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.getTime() < stamp(end)) {
    result.push({ date: cursor.toISOString().replace("Z", ""), label: cursor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("course");
  const [zoom, setZoom] = useState(1);
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set(Object.keys(categoryMeta) as Category[]));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TimelineEvent | Medication | null>(null);
  const [showMedicationOverlay, setShowMedicationOverlay] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const range = views[view];
  const canvasWidth = Math.round(range.baseWidth * zoom);

  const visibleEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEvents
      .filter((event) => event.views.includes(view) && activeCategories.has(event.category))
      .filter((event) => !q || [event.title, event.short, event.summary, event.clinician, event.institution, event.medication, event.source].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => stamp(a.date) - stamp(b.date));
  }, [view, activeCategories, query]);
  const selectedEventIndex = selected && "title" in selected
    ? visibleEvents.findIndex((event) => event.id === selected.id)
    : -1;

  const toggleCategory = (category: Category) => {
    const next = new Set(activeCategories);
    if (next.has(category)) next.delete(category); else next.add(category);
    setActiveCategories(next);
  };

  const showStoryEvent = (index: number) => {
    if (!visibleEvents.length) return;
    const normalized = (index + visibleEvents.length) % visibleEvents.length;
    const event = visibleEvents[normalized];
    setSelected(event);
    const position = timelinePct(event.date, view, range.start, range.end) / 100;
    scroller.current?.scrollTo({ left: Math.max(0, canvasWidth * position - window.innerWidth * 0.43), behavior: "smooth" });
  };

  useEffect(() => {
    setSelected(null);
    requestAnimationFrame(() => scroller.current?.scrollTo({ left: 0, behavior: "smooth" }));
  }, [view]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowRight" && selectedEventIndex !== -1) showStoryEvent(selectedEventIndex + 1);
      if (event.key === "ArrowLeft" && selectedEventIndex !== -1) showStoryEvent(selectedEventIndex - 1);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });

  const ticks = monthTicks(view === "course" ? courseBreak.onsetStart : range.start, range.end);
  const medicationVisible = view === "course";
  const packedMedicationRows = useMemo(() => packMedicationContext(canvasWidth), [canvasWidth]);
  const detectedMedicationGroups = useMemo(() => {
    const groups = new Map<string, { medication: Medication; segment: MedSegment; segmentIndex: number }[]>();
    medications.forEach((medication) => medication.segments.forEach((segment, segmentIndex) => {
      if (segment.end) return;
      const group = groups.get(segment.start) ?? [];
      group.push({ medication, segment, segmentIndex });
      groups.set(segment.start, group);
    }));
    return [...groups.entries()].sort(([a], [b]) => stamp(a) - stamp(b));
  }, []);
  const medicationContextHeight = 50 + (packedMedicationRows.length + detectedMedicationGroups.length) * 29;
  const positionedEvents = useMemo(
    () => packTimelineEvents(visibleEvents, view, range.start, range.end, canvasWidth),
    [visibleEvents, view, range.start, range.end, canvasWidth],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <p className="kicker">Evidence-aware clinical chronology</p>
            <h1>Commonwealth <em>v.</em> Lindsay Clancy</h1>
          </div>
        </div>
        <div className="cutoff"><span>Evidence cutoff</span><strong>Aug 11, 2026 · Trial Day 11</strong></div>
      </header>

      <section className="orientation">
        <div className="orientation-copy">
          <p className="section-number">01 / ORIENTATION</p>
        </div>
        <div className="story-beats" aria-label="Clinical arc summary">
          <article><span>Late summer</span><strong>Anxiety + insomnia</strong><p>Symptoms emerge after an initially well postpartum period.</p></article>
          <article><span>Nov–Dec</span><strong>Rapid treatment changes</strong><p>Sleep improves unevenly while depression and intrusive thoughts intensify.</p></article>
          <article><span>January</span><strong>Severe depression persists</strong><p>McLean admission, medication transition, then outpatient follow-up.</p></article>
        </div>
      </section>

      <section className="workspace" aria-label="Interactive evidence timeline">
        <div className="control-deck">
          <div className="view-tabs" role="tablist" aria-label="Timeline views">
            {(Object.keys(views) as ViewKey[]).map((key) => (
              <button key={key} role="tab" aria-selected={view === key} className={view === key ? "active" : ""} onClick={() => setView(key)}>
                <strong>{views[key].label}</strong><span>{views[key].eyebrow}</span>
              </button>
            ))}
          </div>
          <div className="tools-row">
            <label className="search-control">
              <span className="search-icon" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symptoms, medications, clinicians…" aria-label="Search timeline" />
              {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
            </label>
            <div className="zoom-control" aria-label="Timeline zoom">
              <button onClick={() => setZoom(Math.max(.72, +(zoom - .14).toFixed(2)))} aria-label="Zoom out">−</button>
              <button className="zoom-readout" onClick={() => setZoom(1)} aria-label="Fit chronology at default zoom" title="Fit chronology">{Math.round(zoom * 100)}%</button>
              <button onClick={() => setZoom(Math.min(2.1, +(zoom + .14).toFixed(2)))} aria-label="Zoom in">+</button>
            </div>
            {view === "course" && <button className={`overlay-toggle ${showMedicationOverlay ? "active" : ""}`} aria-pressed={showMedicationOverlay} onClick={() => setShowMedicationOverlay((shown) => !shown)}><span aria-hidden="true" />{showMedicationOverlay ? "Hide medication context" : "Show medication context"}</button>}
            <button className="story-button" onClick={() => showStoryEvent(selectedEventIndex === -1 ? 0 : selectedEventIndex + 1)}>
              <span className="play" aria-hidden="true">▶</span>{selectedEventIndex === -1 ? "Walk the story" : "Next event"}
            </button>
          </div>
          <div className="filter-row">
            <span className="filter-label">Show</span>
            {(Object.keys(categoryMeta) as Category[]).map((category) => (
              <button key={category} className={activeCategories.has(category) ? "filter-chip active" : "filter-chip"} onClick={() => toggleCategory(category)} style={{ "--chip": categoryMeta[category].color } as React.CSSProperties}>
                <span />{categoryMeta[category].label}
              </button>
            ))}
            <button className="reset-filter" onClick={() => setActiveCategories(new Set(Object.keys(categoryMeta) as Category[]))}>Reset</button>
          </div>
        </div>

        <div className="timeline-status">
          <div><strong>{visibleEvents.length}</strong> events shown</div>
          <p><span className="drag-mark">↔</span> Drag or shift-scroll horizontally · select any card for its evidence note</p>
          <div className="evidence-mini"><span className="solid" /> documented <span className="dash" /> reported / uncertain</div>
        </div>

        <div className="timeline-scroll" ref={scroller} tabIndex={0} aria-label={`Scrollable ${range.label} timeline`}>
          <div className={`timeline-canvas ${medicationVisible ? "with-meds" : "compact"} ${medicationVisible && showMedicationOverlay ? "overlay-open" : ""}`} style={{ width: canvasWidth, "--med-context-height": `${medicationContextHeight}px` } as React.CSSProperties}>
            <div className="time-ruler">
              <span className="range-start">{timelineDate(range.start, { month: "short", day: "numeric", year: "numeric" })}</span>
              {view === "course" && <div className="timeline-break ruler-break" style={{ left: `${courseBreak.breakStartPct}%`, width: `${courseBreak.breakEndPct - courseBreak.breakStartPct}%` }}><span>~11 weeks omitted</span></div>}
              {ticks.map((tick) => <div className="tick" key={tick.date} style={{ left: `${timelinePct(tick.date, view, range.start, range.end)}%` }}><span>{tick.label}</span></div>)}
              <span className="range-end">{timelineDate(range.end, { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>

            {view === "course" && showMedicationOverlay && <section className="med-overlay-section" style={{ height: medicationContextHeight }} aria-label="Medication timeline context">
              <div className="med-overlay-heading"><span>Medication timeline</span><small>Expanded clinical-course context</small></div>
              <div className="med-overlay">
                {detectedMedicationGroups.map(([date, group]) => <div className="med-overlay-row detected-row" key={date}>
                  <div className="med-detected-cluster" style={{ left: `${Math.min(99.5, Math.max(0, timelinePct(date, "course", views.course.start, views.course.end)))}%` }}>
                    <small>Detected {timelineDate(date, { month: "short", day: "numeric" })}</small>
                    {group.map(({ medication, segment, segmentIndex }) => <button key={`${medication.generic}-${segmentIndex}`} style={{ "--med": medication.color } as React.CSSProperties} onClick={() => setSelected(medication)} title={`${medication.name} (${medication.generic}): ${segment.label}. ${segment.note}`}><i /><span>{medication.name}</span></button>)}
                  </div>
                </div>)}
                {packedMedicationRows.map((row, rowIndex) => <div className="med-overlay-row" key={rowIndex}>
                  {row.map(({ medication, segment, segmentIndex, start, end }) => (
                    <button key={`${medication.generic}-${segmentIndex}`} className={`med-overlay-segment ${segment.status}`} style={{ left: `${start}%`, width: `calc(${Math.max(.4, end - start)}% - 1px)`, "--med": medication.color } as React.CSSProperties} onClick={() => setSelected(medication)} title={`${medication.name} (${medication.generic}): ${segment.label}. ${segment.note}`}><span>{medication.name} · {segment.label}</span></button>
                  ))}
                </div>)}
              </div>
            </section>}

            <div className="event-field">
              {view === "course" && <div className="timeline-break field-break" style={{ left: `${courseBreak.breakStartPct}%`, width: `${courseBreak.breakEndPct - courseBreak.breakStartPct}%` }} aria-hidden="true" />}
              <div className="main-axis" />
              <div className="connector-layer" aria-hidden="true">
                {positionedEvents.map(({ event, x, connectorTop, connectorHeight, color }) => <span className="connector" key={event.id} style={{ left: `${x}%`, top: connectorTop, height: Math.max(10, connectorHeight), "--event": color } as React.CSSProperties} />)}
              </div>
              {positionedEvents.map(({ event, x, top, cardOffset, color }) => (
                  <div className="event-anchor" key={event.id} style={{ left: `${x}%`, "--event": color } as React.CSSProperties}>
                    <button className={`event-card ${event.certainty.toLowerCase()}`} style={{ top, left: cardOffset }} onClick={() => setSelected(event)} aria-label={`${event.displayDate}: ${event.title}. Open details.`}>
                      <span className="card-date">{event.displayDate}</span>
                      <strong>{event.title}</strong>
                      <small>{event.short}</small>
                    </button>
                    <span className="axis-dot" />
                  </div>
              ))}
              {!visibleEvents.length && <div className="empty-state"><strong>No matching events</strong><span>Adjust the search or category filters.</span></div>}
            </div>

            {medicationVisible && (
              <section className="medication-field" aria-label="Medication exposure lanes">
                <div className="med-heading">
                  <div><p className="section-number">MEDICATION TIMELINE</p></div>
                  <div className="status-key">
                    <span><i className="key prescribed" /> prescribed / filled</span>
                    <span><i className="key reported" /> reportedly taken</span>
                    <span><i className="key planned" /> planned / uncertain</span>
                    <span><i className="key inpatient" /> inpatient / recorded</span>
                    <span><i className="key detected" /> later detected</span>
                  </div>
                </div>
                <div className="med-grid">
                  {medications.map((medication) => (
                    <div className="med-row" key={medication.generic}>
                      <button className="med-name" onClick={() => setSelected(medication)} style={{ "--med": medication.color } as React.CSSProperties}>
                        <strong>{medication.name}</strong><span>{medication.generic}</span><small>{medication.className}</small>
                      </button>
                      <div className="med-track">
                        {medication.segments.map((segment, index) => {
                          const start = Math.min(99.5, Math.max(0, timelinePct(segment.start, view, range.start, range.end)));
                          const end = segment.end ? Math.min(100, Math.max(start, timelinePct(segment.end, view, range.start, range.end))) : start;
                          const width = segment.end ? Math.max(.4, end - start) : 0;
                          const level = segment.level ?? 0;
                          return segment.end ? (
                            <button key={index} className={`med-segment ${segment.status}`} style={{ left: `${start}%`, width: `calc(${width}% - 2px)`, top: `${5 + level * 26}px`, "--med": medication.color } as React.CSSProperties} onClick={() => setSelected(medication)} title={`${medication.name}: ${segment.label}. ${segment.note}`}>
                              <span>{segment.label}</span>
                            </button>
                          ) : (
                            <button key={index} className={`med-marker ${segment.status}`} style={{ left: `${start}%`, top: `${11 + level * 26}px`, "--med": medication.color } as React.CSSProperties} onClick={() => setSelected(medication)} title={`${medication.name}: ${segment.label}. ${segment.note}`} aria-label={`${medication.name}: ${segment.label}`} />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </section>

      <section className="reading-guide">
        <div><p className="section-number">02 / HOW TO READ THIS</p><h2>Three evidentiary separations do most of the work.</h2></div>
        <div className="guide-grid">
          <article><span>01</span><h3>Insomnia ≠ decreased need</h3><p>Most sleep loss was unwanted and distressing. Two “not tired” reports legitimately raised activation concern but did not establish mania.</p></article>
          <article><span>02</span><h3>Intrusive thought ≠ intent</h3><p>Clinician messages described death or suicide. Patrick separately recalled child-harm thoughts without plan, intent, or external voice.</p></article>
          <article><span>03</span><h3>Organized behavior ≠ diagnostic exclusion</h3><p>Normal-appearing calls and encounters demonstrate retained capacities at those moments; they do not globally rule psychosis in or out.</p></article>
        </div>
      </section>

      <footer>
        <p>Educational evidence visualization · not an independent diagnosis, malpractice opinion, criminal-responsibility opinion, or verdict recommendation.</p>
        <p>Source IDs correspond to the 97-source master corpus. Update before presenting.</p>
      </footer>

      {selected && (
        <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}>
          <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={"title" in selected ? selected.title : `${selected.name} medication details`}>
            <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
            {"title" in selected ? (
              <>
                <div className="drawer-accent" style={{ "--event": categoryMeta[selected.category].color } as React.CSSProperties}><span>{categoryMeta[selected.category].label}</span><i /></div>
                <p className="drawer-date">{selected.displayDate}</p>
                <h2>{selected.title}</h2>
                <p className="drawer-summary">{selected.summary}</p>
                {(selected.clinician || selected.institution) && <div className="provider-card"><span>{selected.clinician ? "Clinician" : "Institution"}</span><strong>{selected.clinician || selected.institution}</strong>{selected.clinician && selected.institution && <small>{selected.institution}</small>}</div>}
                {selected.medication && <div className="med-callout"><span>Medication action</span><strong>{selected.medication}</strong></div>}
                <div className="drawer-section"><h3>What the evidence supports</h3><ul>{selected.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div>
                <div className="evidence-card"><div><span>Evidence posture</span><strong>{selected.evidence}</strong></div><div><span>Certainty</span><strong className={`certainty ${selected.certainty.toLowerCase()}`}>{selected.certainty}</strong></div></div>
                {selected.caution && <div className="caution-box"><span>Interpretive boundary</span><p>{selected.caution}</p></div>}
                <div className="source-box"><span>Corpus source</span><p>{selected.source}</p></div>
                <div className="drawer-nav">
                  <button onClick={() => showStoryEvent(selectedEventIndex - 1)}>← Previous</button>
                  <span aria-live="polite">{selectedEventIndex !== -1 ? `${selectedEventIndex + 1} / ${visibleEvents.length}` : "Selected event"}</span>
                  <button onClick={() => showStoryEvent(selectedEventIndex + 1)}>Next →</button>
                </div>
              </>
            ) : (
              <>
                <div className="drawer-accent" style={{ "--event": selected.color } as React.CSSProperties}><span>Medication evidence</span><i /></div>
                <p className="drawer-date">{selected.className}</p>
                <h2>{selected.name} <em>({selected.generic})</em></h2>
                <p className="drawer-summary">{selected.summary}</p>
                <div className="drawer-section med-detail-list"><h3>Known chronology</h3>{selected.segments.map((segment, index) => <article key={index}><i className={`key ${segment.status}`} style={{ "--med": selected.color } as React.CSSProperties} /><div><strong>{segment.label}</strong><span>{timelineDate(segment.start, { month: "short", day: "numeric", year: "numeric" })}{segment.end ? ` – ${timelineDate(segment.end, { month: "short", day: "numeric" })}` : ""}</span><p>{segment.note}</p></div></article>)}</div>
                <div className="caution-box"><span>Evidence rule</span><p>Prescribed ≠ filled ≠ reportedly taken ≠ administered ≠ detected ≠ causally active.</p></div>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
