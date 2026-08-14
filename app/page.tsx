"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Category = "clinical" | "symptom" | "hospital" | "medication" | "collateral" | "digital" | "event" | "post";
type Evidence = "Contemporaneous record" | "Treating testimony" | "Reported to clinician" | "Collateral testimony" | "Objective record" | "Mixed evidence" | "Retrospective report" | "Civil allegation";
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
  civilClaims?: {
    claim: string;
    source: string;
    context?: string;
  }[];
  sequence?: {
    time: string;
    title: string;
    detail: string;
    evidence: string;
  }[];
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

type TimelineCardItem = {
  id: string;
  date: string;
  displayDate: string;
  side: "top" | "bottom";
  color: string;
  certainty: TimelineEvent["certainty"];
  events: TimelineEvent[];
};

const categoryMeta: Record<Category, { label: string; color: string }> = {
  clinical: { label: "Clinician encounter", color: "#2dd4bf" },
  symptom: { label: "Symptom change", color: "#f0ad4e" },
  hospital: { label: "Hospital / program", color: "#58c6ff" },
  medication: { label: "Medication decision", color: "#d67bff" },
  collateral: { label: "Family collateral", color: "#f38ca5" },
  digital: { label: "Digital evidence", color: "#7ee3a9" },
  event: { label: "January 24", color: "#fb6a65" },
  post: { label: "Post-offense", color: "#a8b5c7" },
};

const views: Record<ViewKey, { label: string; eyebrow: string; start: string; end: string; baseWidth: number }> = {
  course: { label: "Clinical course", eyebrow: "May 26, 2022 – January 24, 2023", start: "2022-05-26T00:00:00", end: "2023-01-25T00:00:00", baseWidth: 9000 },
  post: { label: "Post-offense", eyebrow: "January 26, 2023 – September 2024", start: "2023-01-25T00:00:00", end: "2024-09-15T00:00:00", baseWidth: 2500 },
};

const orientationCareMap = [
  {
    month: "September-October",
    groups: [
      { date: "Sep 15", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Sertraline 25 mg ×30 filled; planned increase from 25 to 50 mg."] },
      { date: "Sep 28", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Sertraline had not been started; medication plan deferred after reported improvement."] },
      { date: "Oct 3", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Psychiatry follow-up focused on symptoms and leave paperwork."] },
      { date: "Oct 20", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Sertraline stopped after reported 25→50 mg trial."] },
      { date: "Oct 21", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Ativan (lorazepam) 0.5 mg ×7 filled for severe anxiety."] },
      { date: "Oct 26", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Ativan (lorazepam) 1 mg ×30 filled.", "Buspirone 5 mg ×30 filled.", "Hydroxyzine 25 mg ×30 filled."] },
    ],
  },
  {
    month: "November",
    groups: [
      { date: "Nov 2", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Ativan (lorazepam) 0.5 mg ×40 filled; gradual taper planned.", "Buspirone had reportedly not been started."] },
      { date: "Nov 9", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Buspirone 5 mg ×30 refilled; later use remains unresolved."] },
      { date: "Nov 16", provider: "South Shore ED · Kayvon Izadpanah, MD", organization: "South Shore Health", items: ["Desyrel (trazodone) 50 mg ×30 filled after ED evaluation."] },
      { date: "Nov 20", provider: "Julie Paul, psychiatric NP", organization: "South Shore Perinatal Behavioral Health", items: ["Initial telephone contact and sleep-history review."] },
      { date: "Nov 21", provider: "Julie Paul, psychiatric NP", organization: "South Shore Perinatal Behavioral Health", items: ["In-person intake.", "Prozac (fluoxetine) 10 mg ×56 filled."] },
      { date: "Nov 22", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Psychiatry follow-up reviewed transfer of care and the new medication plan."] },
      { date: "Nov 22", provider: "Julie Paul, psychiatric NP", organization: "South Shore Perinatal Behavioral Health", items: ["Message or telephone exchange addressed nervousness about starting fluoxetine."] },
      { date: "Nov 23", provider: "Julie Paul, psychiatric NP", organization: "South Shore Perinatal Behavioral Health", items: ["Clancy reported that fluoxetine had been started."] },
      { date: "Nov 25", provider: "Julie Paul, psychiatric NP", organization: "South Shore Perinatal Behavioral Health", items: ["Fluoxetine stopped.", "One-tablet Ambien (zolpidem) 5 mg trial prescribed.", "Remeron (mirtazapine) 7.5 mg and Klonopin (clonazepam) 0.5 mg prescribed as a revised sleep regimen."] },
      { date: "Nov 26", provider: "Julie Paul, psychiatric NP", organization: "South Shore Perinatal Behavioral Health", items: ["Mirtazapine 7.5 mg plus clonazepam 0.5 mg reportedly taken."] },
      { date: "Nov 28", provider: "Julie Paul, psychiatric NP", organization: "South Shore Perinatal Behavioral Health", items: ["Follow-up contact after panic symptoms; higher level of care discussed."] },
      { date: "Nov 29", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["First psychiatric assessment.", "Mirtazapine 15 mg plus CBD reportedly used for sleep."] },
      { date: "Nov 30", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Seroquel (quetiapine) 25 mg ×30 filled for sleep.", "Mirtazapine discontinuation requested."] },
    ],
  },
  {
    month: "December",
    groups: [
      { date: "Dec 1", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Psychiatry follow-up for worsening depression and concern about approaching suicidal thoughts."] },
      { date: "Dec 1", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["MyChart medication exchange; mirtazapine was skipped and quetiapine 25 mg was part of the reported regimen."] },
      { date: "Dec 2", provider: "Latiesha Dukes, LMHC", organization: "South Shore Perinatal Behavioral Health", items: ["In-person counseling intake for postpartum anxiety and depressive symptoms.", "Frequent passive suicidal ideation without a plan was reported; weekly bridge therapy and IOP/PHP connection were planned."] },
      { date: "Dec 3", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Ativan (lorazepam) 0.5 mg reportedly brought short-term relief."] },
      { date: "Dec 5", provider: "Latiesha Dukes, LMHC", organization: "South Shore Perinatal Behavioral Health", items: ["Telehealth follow-up after a patient-reported Aspire crisis evaluation.", "Current SI was denied; Patrick joined, and IOP/PHP care was recommended."] },
      { date: "Dec 6", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["In-person assessment with Patrick present.", "Valium (diazepam) 5 mg filled; quantity remains unclear."] },
      { date: "Dec 7", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Fluoxetine held.", "Quetiapine 100→200→300→400 mg titration proposed; 400 mg use was not established.", "Quetiapine 100 mg and diazepam 5 mg ×2 filled."] },
      { date: "Dec 8", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Diazepam plus quetiapine reportedly improved sleep; doses were not specified in the message."] },
      { date: "Dec 9", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Telephone follow-up reviewed sleep, panic, numbness, and suicidal thoughts without a plan.", "Diazepam 5 mg ×8 filled."] },
      { date: "Dec 12", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Quetiapine 200 mg was reported for the prior three nights; 400 mg use was not established.", "Diazepam 2.5 mg nightly was reported."] },
      { date: "Dec 12", provider: "Latiesha Dukes, LMHC", organization: "South Shore Perinatal Behavioral Health", items: ["Telehealth counseling follow-up documented continued SI without plan or attempt and a second reported Aspire contact.", "Dukes initiated a Women & Infants referral with Clancy's consent."] },
      { date: "Dec 13", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Telehealth follow-up.", "Diazepam 2 mg ×7 filled as part of the taper."] },
      { date: "Dec 15", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Telephone call prompted recommendation for a higher level of care."] },
      { date: "Dec 15", provider: "Massachusetts General Hospital", organization: "Emergency psychiatric evaluation", items: ["Hospital assessment followed the higher-care discussion."] },
      { date: "Dec 16", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Psychiatry follow-up after MGH.", "Lamotrigine 25 mg ×30 prescribed and filled."] },
      { date: "Dec 16", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["MyChart medication plan addressed persistent depression despite restored sleep.", "Quetiapine 300 mg was recommended; ingestion at that dose was not established."] },
      { date: "Dec 19", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Diazepam 2 mg every other night was reported.", "Quetiapine ER 300 mg ×30 and diazepam 2 mg ×14 filled; use of quetiapine 300 mg remains unestablished."] },
      { date: "Dec 19", provider: "Latiesha Dukes, LMHC", organization: "South Shore Perinatal Behavioral Health", items: ["Telehealth counseling follow-up: low mood and numbness persisted, with no SI or crisis need reported over the preceding weekend.", "Dukes observed greater engagement; Women & Infants contact was reviewed."] },
      { date: "Dec 20", provider: "Women & Infants", organization: "Perinatal program assessment", items: ["Same-day assessment and discharge; a general partial-hospital program was recommended."] },
      { date: "Dec 21", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Quetiapine taper plan sent: 200→100→50 mg, then stop.", "Quetiapine 100 mg ×14 filled."] },
      { date: "Dec 22", provider: "Rebecca H. Jollotta, CNP", organization: "South Shore Perinatal Behavioral Health", items: ["Quetiapine 25 mg ×14 filled for the taper."] },
      { date: "Dec 27", provider: "Latiesha Dukes, LMHC", organization: "South Shore Perinatal Behavioral Health", items: ["Phone contacts with Clancy and, with her consent, Patrick confirmed referral completion.", "Patrick's prescription concerns were redirected to the medication prescriber."] },
      { date: "Dec 30", provider: "Massachusetts General Hospital", organization: "Emergency psychiatric evaluation", items: ["Voluntary hospital presentation on the pathway to McLean admission."] },
    ],
  },
  {
    month: "January",
    groups: [
      { date: "Jan 1", provider: "Alia Goodheart, MD", organization: "McLean Hospital", items: ["Voluntary inpatient admission.", "Quetiapine taper began at 75 mg, with 50 mg and 25 mg steps recorded before discontinuation.", "Ativan (lorazepam) 1 mg and Desyrel (trazodone) 50 mg were used or planned during the admission."] },
      { date: "Jan 5", provider: "Alia Goodheart, MD", organization: "McLean Hospital", items: ["Discharged with next-day psychiatry follow-up required.", "Trazodone 50 mg ×28 and lorazepam 1 mg ×14 filled; melatonin was planned."] },
      { date: "Jan 6", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Post-discharge telehealth follow-up.", "Trazodone 100 mg and lorazepam 1 mg were reportedly being taken."] },
      { date: "Jan 9", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Lorazepam changed to Valium (diazepam) as a longer-half-life taper strategy.", "Diazepam 5 mg ×14 filled."] },
      { date: "Jan 11", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["MyChart message asked about ketamine because of persistently low mood."] },
      { date: "Jan 12", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Trazodone increased to 150 mg; 150 mg ×30 filled."] },
      { date: "Jan 13", provider: "Prescriber unresolved", organization: "Pharmacy record", items: ["Diazepam 2 mg ×7 filled; the public record contains a prescriber-attribution conflict."] },
      { date: "Jan 16", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Telehealth follow-up.", "Elavil (amitriptyline) 10 mg ×30 filled; diazepam 2 mg was dispensed, but the original label quantity remains unresolved."] },
      { date: "Jan 19", provider: "Prescriber unresolved", organization: "Pharmacy record", items: ["Diazepam 2 mg ×14 filled; prescriber attribution remains disputed."] },
      { date: "Jan 23", provider: "Jennifer Tufts, MD", organization: "Aster Mental Health", items: ["Final pre-offense telehealth follow-up.", "Amitriptyline increase from 10 to 20 mg ordered; whether 20 mg was taken is not established.", "Diazepam 2 mg fill shown with an unclear quantity."] },
    ],
  },
];

const events: TimelineEvent[] = [
  {
    id: "birth", date: "2022-05-26T12:00:00", displayDate: "May 26", title: "Childbirth", short: "Third childbirth; postpartum clock begins", category: "clinical", evidence: "Treating testimony", certainty: "High", side: "top", tier: 0,
    summary: "Callan Clancy was born on May 26, 2022. The charged conduct occurred approximately eight months later.",
    details: ["Later treatment history described the first roughly 12 weeks postpartum as going well."],
    source: "SRC-0091, Trial Day 10, pp. 91–92; SRC-0032 ¶23", caution: "Birth date is high confidence; later symptom history remains retrospective patient report.", views: ["course"]
  },
  {
    id: "late-aug", date: "2022-08-25T12:00:00", displayDate: "Late August", title: "Retrospective history: anxiety emerges", short: "Later report of difficulty leaving baby; racing thoughts", category: "symptom", evidence: "Reported to clinician", certainty: "Moderate", side: "bottom", tier: 0,
    summary: "Clancy later told Julie Paul that she initially did well, then became increasingly anxious and overwhelmed after Patrick returned to work.",
    details: ["She described difficulty leaving the baby and racing thoughts.", "The public contemporaneous record does not establish a hypomanic syndrome during the initially well postpartum period."],
    civilClaims: [{ claim: "The complaint alleges a 4 a.m. exercise routine, three-mile runs, Peloton or aerobics, a July 4 five-mile race, and Beachbody-related activity, and retrospectively labels the pattern hypomanic.", source: "SRC-0032 ¶¶25–28", context: "The alleged behaviors and the complaint's diagnostic interpretation are separate propositions; the available contemporaneous record does not establish a syndromal hypomanic episode." }],
    source: "SRC-0091, Trial Day 10, pp. 91–92; compare SRC-0032 ¶¶25–29", views: ["course"]
  },
  {
    id: "tufts-intake", date: "2022-09-15T10:00:00", displayDate: "September 15", title: "Telehealth evaluation: first Tufts visit", short: "Video visit · anxiety, depression, insomnia, racing thoughts", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 1,
    summary: "Tufts documented anxiety, depressed mood, insomnia, racing thoughts, appetite and anhedonia changes, and functional difficulty. Suicide, harm, voice, and psychosis questions were negative.",
    details: ["Risky behavior, excessive energy, and impulsivity items were not checked.", "Tufts recommended psychotherapy and discussed medication treatment.", "Prescription/fill: sertraline 25 mg daily for one week, then 50 mg planned; 25 mg ×30 filled."], source: "SRC-0087, Trial Day 9, pp. 66–98; SRC-0091, Trial Day 10, pp. 12–13", caution: "The negative mental-status and safety findings apply to this video encounter, not every moment outside it.", views: ["course"]
  },
  {
    id: "sertraline-deferred", date: "2022-09-28T15:00:00", displayDate: "September 28", title: "Medication decision: sertraline deferred", short: "After video visit · filled previously, not started", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "After learning during the September 28 video visit that Clancy had not started sertraline and felt improved, Tufts paused the medication plan and continued to recommend therapy.",
    details: ["This resolves that the September 15 fill did not equal immediate exposure.", "The precise later start date remains uncertain."], medication: "Sertraline: filled, not yet taken", source: "SRC-0087, Trial Day 9, pp. 98–102", caution: "A pharmacy fill is not an administration record.", views: ["course"]
  },
  {
    id: "leave", date: "2022-09-30T12:00:00", displayDate: "September 30", title: "MyChart message: requests extended work leave", short: "Clancy stated she did not feel ready to return to nursing", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 2,
    summary: "In a portal message, Clancy said she was only well enough to function without medication and was not ready to resume patient care.",
    details: ["Infant feeding and overnight nursing demands were also discussed.", "The message is evidence of self-reported functional limitation, not an independent occupational assessment."], source: "SRC-0087, Trial Day 9, portal message", views: ["course"]
  },
  {
    id: "sertraline-stop", date: "2022-10-20T10:00:00", displayDate: "October 20", title: "Telehealth visit: symptoms worsen after sertraline", short: "Video visit · insomnia, anxiety, fogginess, racing thoughts", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 0,
    summary: "During a video visit, Clancy reported that after eventually starting sertraline and increasing from 25 to 50 mg, she felt awful, with worse sleep, anxiety, mental fog, overnight racing thoughts, appetite loss, diarrhea, and tearfulness.",
    details: ["She denied suicidal and homicidal thoughts; her fear of someday developing suicidal thoughts was documented separately from current suicidal ideation.", "She reported a fear that something bad might happen and not wanting to be alone; her parents came to stay and help. Tufts did not speak with them and described seeking support as protective.", "Tufts observed depressed and anxious mood/affect but appropriate speech and thought process, excellent judgment, intact cognition, and normal psychomotor activity.", "Medication decision: sertraline was stopped; an immediate replacement prescription was deferred."], source: "SRC-0087, Trial Day 9, pp. 105–107, 05:52:52–05:59:25; SRC-0091, Trial Day 10, 02:55:00–03:03:03 and 05:35:15–05:36:38", caution: "The encounter establishes the reported temporal association; it does not by itself prove a bipolar switch, medication causation, or a delusion.", views: ["course"]
  },
  {
    id: "oct21", date: "2022-10-21T10:00:00", displayDate: "October 21", title: "Telehealth follow-up: acute insomnia and anxiety", short: "Next-day video visit with Dr. Tufts", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 0,
    summary: "Clancy reported no sleep the preceding night, severe anxiety and heart racing, worry about the children and sleep, GI symptoms, crying, and fogginess.",
    details: ["She described yawning without feeling drowsy.", "Tufts did not observe pressured speech, hyperactivity, mania, psychosis, suicidal ideation, homicidal ideation, or hallucinations.", "Prescription/fill: lorazepam 0.5 mg ×7 for short-term PRN treatment of severe anxiety."], source: "SRC-0087, Trial Day 9, pp. 107–109, 05:58:25–06:04:28; SRC-0091, Trial Day 10", caution: "‘Not drowsy’ is ambiguous within a broader picture of distressed insomnia.", views: ["course"]
  },
  {
    id: "oct26", date: "2022-10-26T12:00:00", displayDate: "October 26", title: "Telehealth visit: persistent anxiety and depression", short: "Video visit · lorazepam reduced anxiety but not insomnia", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "Clancy reported that lorazepam reduced anxiety but did not help sleep; over-the-counter diphenhydramine had been more helpful. Her mood remained anxious and depressed.",
    details: ["She denied suicidal and homicidal ideation, and Tufts observed no psychosis or communication difficulty.", "They discussed non-benzodiazepine medication options after the sertraline effects had reportedly resolved.", "Prescriptions/fills: lorazepam 1 mg ×30; buspirone 5 mg ×30; hydroxyzine 25 mg ×30."], source: "SRC-0087, Trial Day 9, pp. 109–111, 06:04:37–06:10:07; SRC-0091, Trial Day 10", caution: "The fills do not establish which medications were subsequently taken; buspirone was later reported not started.", views: ["course"]
  },
  {
    id: "therapy", date: "2022-10-31T12:00:00", displayDate: "October 31", title: "Therapy appointment: likely virtual", short: "Approx. one hour · SI and HI denied", category: "clinical", evidence: "Contemporaneous record", certainty: "Moderate", clinician: "Jennifer McAllister", institution: "Aster Mental Health", side: "top", tier: 2,
    summary: "A therapy note later read at trial stated that Clancy denied suicidal or homicidal ideation.",
    details: ["Tufts was not present for the encounter and testified that she was not completely certain of the modality, although she thought it was virtual.", "The complete therapy chart is unavailable, and cross-examination questioned how extensively suicidality was assessed."], source: "SRC-0087, Trial Day 9, pp. 111–112, 06:10:18–06:11:23; SRC-0091, Trial Day 10, 03:05:25–03:10:45", caution: "The note's limited content is supported; the modality is probable rather than certain, and the unrecorded conversation cannot be reconstructed.", views: ["course"]
  },
  {
    id: "nov2", date: "2022-11-02T12:00:00", displayDate: "November 2", title: "Telehealth follow-up: sleep improves", short: "Video visit · lorazepam helps; buspirone not started", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "Clancy reported that lorazepam helped and sleep had improved. Tufts emphasized that it was not a long-term solution and planned a gradual taper.",
    details: ["Clancy said she had not started buspirone because she was afraid to begin a new medication.", "Her affect appeared appropriate and her reported mood was euthymic; she denied SI and HI.", "Prescription/refill: lorazepam 0.5 mg ×40; 0.25-mg reductions every two weeks were planned."], source: "SRC-0087, Trial Day 9, pp. 111–113, 06:10:53–06:16:20; SRC-0091, Trial Day 10, pp. 77–78", views: ["course"]
  },
  {
    id: "ed", date: "2022-11-16T12:00:00", displayDate: "November 16", title: "Emergency department visit: South Shore", short: "Insomnia, anxiety and palpitations", category: "hospital", evidence: "Contemporaneous record", certainty: "High", institution: "South Shore ED", side: "top", tier: 1,
    summary: "Clancy presented to the emergency department for insomnia, anxiety, and palpitations. Patrick believed she had slept very little for approximately 48 hours.",
    details: ["Patrick believed she had slept very little for approximately 48 hours.", "Clancy later told Paul that the treatment prescribed after the visit helped her fall asleep but did not maintain sleep.", "Prescription/fill after the visit: trazodone 50 mg ×30."], source: "SRC-0065; SRC-0091; Exhibit 222 described on Trial Day 11", caution: "The encounter is established; exact sleep duration and later treatment effect are patient/collateral reports.", views: ["course"]
  },
  {
    id: "paul-intake", date: "2022-11-21T10:00:00", displayDate: "November 21", title: "In-person intake: perinatal psychiatry", short: "Face-to-face · linear, goal-directed, engaged in planning", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 0,
    summary: "Clancy described anxiety, overwhelm, racing thoughts, insomnia, and prior sertraline intolerance. She denied SI, HI, and hallucinations, and appeared linear and goal-directed.",
    details: ["The EPDS self-harm item was negative.", "She reported that Ativan plus Benadryl had helped sleep.", "Prescription/fill: fluoxetine 10 mg ×56."], source: "SRC-0091, Trial Day 10, pp. 96–98, 06:27:23–06:33:23", views: ["course"]
  },
  {
    id: "nov25", date: "2022-11-25T12:00:00", displayDate: "November 25", title: "MyChart exchange: fluoxetine stopped", short: "Sleep regimen changed without a visit", category: "medication", evidence: "Treating testimony", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "After a short fluoxetine trial associated with worse sleep and feeling disconnected or ‘spacey,’ Paul stopped it and changed the sleep regimen.",
    details: ["Zolpidem 5 mg ×1, mirtazapine 7.5 mg ×30, and clonazepam 0.5 mg ×14 were filled.", "Paul warned against combining clonazepam with lorazepam.", "Zolpidem ingestion is not established."], medication: "Stop fluoxetine; start mirtazapine/clonazepam", source: "SRC-0091; SRC-0048", caution: "Paul’s term ‘activation’ does not itself establish mania or medication-induced psychosis.", views: ["course"]
  },
  {
    id: "disconnected", date: "2022-11-27T20:00:00", displayDate: "November 27", title: "MyChart message: “disconnected … from reality”", short: "Frightening experience after sleeping", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 2,
    summary: "After reporting mirtazapine 15 mg plus clonazepam 0.5 mg and sleep, Clancy wrote that she felt ‘super disconnected with myself and reality.’",
    details: ["She had reported two nights of clonazepam and considered stopping it.", "Paul considered sedation or disorientation and supported stopping clonazepam."], civilClaims: [{ claim: "The complaint expands this episode to allege that she could not determine what was real, drive, or remain alone.", source: "SRC-0032 ¶¶39–40", context: "The contemporaneous message supports the quoted disconnection experience; the additional functional consequences are pleading allegations." }], medication: "Mirtazapine 15 mg + clonazepam 0.5 mg reportedly taken", source: "SRC-0091, p. 104; compare SRC-0032 ¶¶39–40", caution: "Clinically compatible with derealization, depersonalization, sedation, anxiety, or nonspecific disorientation—not automatically psychosis.", views: ["course"]
  },
  {
    id: "panic", date: "2022-11-28T12:00:00", displayDate: "November 28", title: "Provider contact/progress note: panic attack", short: "Phone or MyChart unresolved · PHP suggested", category: "symptom", evidence: "Contemporaneous record", certainty: "Moderate", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 0,
    summary: "Clancy reported a panic attack. Paul suggested lorazepam and a run and recommended Women & Infants partial-hospital care.",
    details: ["Paul remembered entering a progress note but could not firmly establish whether the discussion occurred by phone or MyChart.", "Clancy described logistical difficulty attending the program.", "No psychosis was documented in the available exchange."], source: "SRC-0091, Trial Day 10, pp. 104–107, 06:47:55–06:53:39", caution: "The clinical content is supported; the communication medium is unresolved.", views: ["course"]
  },
  {
    id: "jollotta-intake", date: "2022-11-29T15:00:00", displayDate: "November 29", title: "Telehealth visit: first Jollotta assessment", short: "EPDS 17 · GAD-7 14 · anxious but linear", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 0,
    summary: "Clancy described fragmented sleep, disorientation, forgetfulness, feeling disconnected from her body, and intense anxiety about sleep.",
    details: ["She reported about two hours of sleep followed by several hours awake and sometimes used lorazepam to return to sleep.", "Jollotta offered zolpidem 10 mg/ER and hydroxyzine; Clancy declined and preferred mirtazapine 15 mg with PRN lorazepam.", "No SI/HI, mania, hallucinations, delusions, or psychosis were observed or reported in this encounter."], medication: "Continue mirtazapine 15 mg + PRN lorazepam", source: "SRC-0096, Trial Day 11, pp. 17–26", caution: "Negative findings apply to this encounter, not every moment outside it.", views: ["course"]
  },
  {
    id: "child-thoughts", date: "2022-11-30T09:00:00", displayDate: "Late Nov.", title: "Child-harm thoughts disclosed to Patrick", short: "Distressing; no plan, intent, or external voice", category: "collateral", evidence: "Collateral testimony", certainty: "Moderate", side: "top", tier: 1,
    summary: "Patrick later testified that over one or two nights Clancy described distressing thoughts involving harm or illness affecting the children.",
    details: ["She appeared disturbed by the thoughts and gave no method, plan, or intent.", "Patrick said she did not describe an external voice. He asked whether she needed to be kept away from the children; she said no, and he observed no intent and did not then believe they were unsafe.", "Her parents came to support the family. Patrick later confirmed only that a disclosure of ‘horrible thoughts’ occurred in her mother's presence—not that her mother independently reported child-harm content."],
    civilClaims: [{ claim: "The complaint alleges that Clancy also told her mother the thoughts involved harming the children and that she feared other people could hear her thoughts, she would be locked up, or the children would be taken.", source: "SRC-0032 ¶50", context: "No testimony from her mother or contemporaneous note had established those specifics through Trial Day 13. Patrick's sworn account establishes a more limited disclosure and her mother's presence." }],
    source: "SRC-0065, Trial Day 1, 02:06:24–02:11:58; SRC-0068, Trial Day 2, 01:46:52–01:47:49; compare SRC-0032 ¶50", caution: "Patrick's collateral account, suicidal portal messages, pleaded thought-reading allegations, and the later command-voice account are distinct sources and phenomena.", views: ["course"]
  },
  {
    id: "quetiapine-start", date: "2022-11-30T16:00:00", displayDate: "November 30", title: "MyChart message: asks to stop mirtazapine", short: "Worse depression; quetiapine discussed for sleep", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 1,
    summary: "Clancy asked to stop mirtazapine after roughly five nights, reporting much worse depression and only about two hours of sleep. Jollotta proposed low-dose quetiapine for insomnia.",
    details: ["Clancy twice requested a phone call. Jollotta could not call between patients, so a nurse called around 3:10 p.m.; Clancy agreed to the plan and to collect quetiapine.", "Quetiapine 25 mg ×30 was filled.", "A fluoxetine retrial was discussed but not yet established as taken."], medication: "Quetiapine 25 mg prescribed/filled", source: "SRC-0096, pp. 27–31, approximately 01:41:00–01:46:41; SRC-0048", caution: "At 25 mg, the stated target was sleep; the fill does not establish ingestion.", views: ["course"]
  },
  {
    id: "intrusive", date: "2022-12-01T12:00:00", displayDate: "December 1", title: "MyChart message: “very intrusive thoughts”", short: "Mirtazapine skipped; content initially unspecified", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Clancy wrote that she disliked mirtazapine and had ‘very intrusive thoughts that I never had before.’",
    details: ["She had skipped mirtazapine and preferred fluoxetine with Ativan/Benadryl.", "She later planned mirtazapine 15 mg with quetiapine 25 mg.", "The immediate message did not clearly elicit or record the thought content."], civilClaims: [{ claim: "The complaint retrospectively characterizes the ‘intrusive thoughts’ as auditory hallucinations and alleges continuing self-deprecating and death-related commands.", source: "SRC-0032 ¶¶42, 49–50", context: "Jollotta testified that the content disclosed to her was suicidal, not child-directed, and that no voice or psychosis was reported or observed in her contacts." }], source: "SRC-0096, pp. 30–33; compare SRC-0032 ¶¶42, 49–50", caution: "Later testimony identified the thoughts disclosed to Jollotta as suicidal, not child-directed; diagnostic reinterpretation in a pleading is not the contemporaneous record.", views: ["course"]
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
    details: ["Patrick said he pressed for an in-person visit because of perceived telehealth disconnection and concern about the number of medication changes; family came to support them.", "The prior MDQ was negative, other manic indicators were not elicited, and Jollotta testified criteria were not met then. Patrick said, ‘My wife is not bipolar.’", "The EPDS was 21, which Jollotta described as severe signs of postpartum depression. She provided mood charts; she later recalled that Clancy said she printed one but did not recall reviewing a completed chart.", "Jollotta observed no mania, hallucinations, delusions, psychosis, or current suicidal plan/intent.", "She considered stopping quetiapine, reconsidering fluoxetine, and replacing lorazepam with longer-half-life diazepam for tapering."], civilClaims: [{ claim: "The complaint alleges that Patrick said she was ‘ten thousand times worse’ since the medication sequence began and asked to start over.", source: "SRC-0032 ¶47", context: "Jollotta remembered general concern about worsening anxiety and medication burden but did not adopt the vivid quotation in Day 11 testimony." }], medication: "Diazepam strategy begins; quetiapine temporarily reconsidered", source: "SRC-0065, 02:09:49–02:11:36; SRC-0096, pp. 43–51 and 06:11:48–06:21:59; compare SRC-0032 ¶47", caution: "This was an active differential—not a confirmed bipolar diagnosis; the complaint's vivid quotation is not established testimony.", views: ["course"]
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
    details: ["Patrick separately testified that the MGH visit followed Clancy telling her father she wanted suicide, then telling Patrick, ‘I told my dad I want to die and it didn't bother me at all.’ Her father had not testified through Day 13.", "Jollotta discussed MGH emergency evaluation, possible McLean care, and release-of-information needs.", "Clancy went to MGH and then chose outpatient Women & Infants follow-up."], source: "SRC-0065, 02:12:20–02:12:47; SRC-0096, pp. 63–66", caution: "No active plan was disclosed in the cited exchange; the statement to her father is Patrick's sworn account of what Clancy told him.", views: ["course"]
  },
  {
    id: "dec16", date: "2022-12-16T15:00:00", displayDate: "December 16", title: "MyChart exchange: plan updated after MGH", short: "Jollotta messages · sleep restored, mood not improved", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 1,
    summary: "In MyChart messages after the MGH evaluation and a separate Tufts video visit, Clancy reported sleeping on quetiapine 200 mg plus diazepam 2 mg but experiencing no mood improvement.",
    details: ["Jollotta recommended quetiapine 300 mg as a bipolar-depression target.", "Clancy reported that Tufts had recommended adding lamotrigine 25 mg and asked whether Jollotta agreed.", "Jollotta endorsed lamotrigine and provided rash/titration counseling but did not know whether Clancy took it."], medication: "Lamotrigine 25 mg endorsed; quetiapine 300 mg recommended", source: "SRC-0096, Trial Day 11, pp. 66–70, 03:45:34–03:51:32", caution: "Lamotrigine endorsement and the quetiapine target were treatment recommendations; neither establishes ingestion or diagnosis.", views: ["course"]
  },
  {
    id: "wi", date: "2022-12-20T12:00:00", displayDate: "December 20", title: "Program assessment: Women & Infants", short: "Same-day discharge; general PHP recommended", category: "hospital", evidence: "Treating testimony", certainty: "Moderate", institution: "Women & Infants", side: "bottom", tier: 2,
    summary: "Clancy entered the Women & Infants program and was discharged the same day, with a recommendation to come off quetiapine and pursue a general mental-health PHP.",
    details: ["Jollotta was not opposed to tapering but worried about loss of structured support, persistent intrusive thoughts, and starting a taper while she was away.", "Women & Infants material indicated an attempted call to Jollotta; she testified that she never received it."], civilClaims: [{ claim: "The complaint alleges EPDS 23 and GAD-7 21 scores, specific descriptions of profound depression/numbness, and a medication-induced formulation attributed to the Women & Infants clinician.", source: "SRC-0032 ¶¶52–57", context: "The pleading uses a December 21 date, while treating evidence places attendance on December 20. The complete Exhibit 220 is unavailable, so the pleaded formulation is not treated as the medical record." }], source: "SRC-0096; Exhibit 220 described on Days 10–11; compare SRC-0032 ¶¶52–57", caution: "The complete Women & Infants record is not publicly available, and the communication failure and pleaded clinical details remain unresolved.", views: ["course"]
  },
  {
    id: "taper", date: "2022-12-21T12:00:00", displayDate: "December 21", title: "MyChart message: quetiapine taper sent", short: "200 → 100 → 50 → stop", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 0,
    summary: "Jollotta ordered quetiapine 200 mg for four nights, 100 mg for four nights, 50 mg for four nights, then discontinuation.",
    details: ["Nurse Nicole Heiden-Francis called to review risks of worsening mood and sleep, confirmed that Clancy still wished to taper while Jollotta was away, and provided DBT-group information.", "Quetiapine 100 mg ×14 and 25 mg ×14 were filled on December 21–22.", "The taper schedule is an intended regimen, not proof that every dose was taken."], medication: "Quetiapine taper", source: "SRC-0096, pp. 69–74, 04:02:09–04:04:08; SRC-0048", views: ["course"]
  },
  {
    id: "mgh-dec30", date: "2022-12-30T12:00:00", displayDate: "December 30", title: "Hospital presentation: returns to MGH", short: "Seeks McLean-level treatment", category: "hospital", evidence: "Retrospective report", certainty: "Moderate", institution: "MGH", side: "bottom", tier: 1,
    summary: "The available record places an MGH presentation before the January 1 voluntary transfer to McLean, but the exact December 29–31 sequence is not fully resolved.",
    details: ["A South Shore record establishes that Patrick called on December 30 seeking McLean admission guidance and was directed to the emergency-department or 911 pathway because beds could not be held.", "Patrick testified that on December 31 he told Clancy it was time for McLean because suicidal thoughts continued and he was exhausted.", "Goodheart’s testimony establishes voluntary arrival at McLean from MGH on January 1."], civilClaims: [{ claim: "The complaint instead alleges that by December 29 Clancy told Patrick, ‘I can't tough it out anymore. I need to go to McLean.’", source: "SRC-0032 ¶59", context: "The pleading and Patrick's sworn testimony differ on the date and who initiated the McLean decision." }], source: "SRC-0096, p. 73, 04:04:35–04:05:42; SRC-0065, 02:16:48–02:17:18; SRC-0087; compare SRC-0032 ¶¶59–62", caution: "The record contains a date/initiator discrepancy; the civil chronology is not the underlying MGH chart.", views: ["course"]
  },
  {
    id: "mclean", date: "2023-01-01T12:00:00", displayDate: "January 1–5", title: "Inpatient admission: McLean", short: "Voluntary · severe depression · no psychosis observed", category: "hospital", evidence: "Treating testimony", certainty: "High", clinician: "Alia Goodheart, MD", institution: "McLean Hospital", side: "top", tier: 1,
    summary: "The provisional admitting formulation was severe major depression without psychotic features. Bipolarity was considered, but no firm diagnosis was established.",
    details: ["January 1, about 4 a.m.: Jasmine Outlaw evaluated her for voluntary admission, documented low risk with 15-minute checks, and provisionally formulated severe MDD without psychotic features.", "Later January 1 and January 2: Elizabeth Madva documented numbness or mild hospital anxiety, sleep at a lower quetiapine dose, and denials of delusions, hallucinations, SI, and HI.", "January 3: Goodheart found anxiety but linear, goal-directed thought and no psychosis. She considered bipolar/peripartum illness but had insufficient information for a firm diagnosis.", "January 3 family texts said Clancy was all right but anxious about meeting the full psychiatry team and worried that she would not be sent home soon; the messages were patient-reported context rather than clinician observations.", "McLean tapered quetiapine approximately 75 → 50 → 25 → 0, switched diazepam to lorazepam, and used trazodone and melatonin for sleep.", "January 4: she reported hospital anxiety and asked to go home earlier than the Friday initially discussed. Goodheart conditioned January 5 discharge on arranging next-day psychiatry follow-up; Clancy did so within about an hour."], civilClaims: [{ claim: "The complaint alleges that McLean operated with a ‘skeleton crew’ and that she did not see a doctor until January 3.", source: "SRC-0032 ¶¶61–63", context: "Sworn testimony described physician evaluations by Outlaw on January 1 and Madva on January 1–2, contradicting the pleaded ‘no doctor until January 3’ claim." }], medication: "Quetiapine tapered off; diazepam → lorazepam; trazodone/melatonin", source: "SRC-0087, Trial Day 9, pp. 20–32, 01:16:19–01:49:34; SRC-0099, Trial Day 13, pp. 42–43; compare SRC-0032 ¶¶61–63", caution: "Time-limited inpatient observations and family messages do not decide symptoms outside those moments; the complete McLean chart remains unavailable.", views: ["course"]
  },
  {
    id: "discharge", date: "2023-01-05T15:00:00", displayDate: "January 5", title: "Inpatient discharge: McLean", short: "Discharged home · next-day psychiatry follow-up required", category: "hospital", evidence: "Contemporaneous record", certainty: "High", clinician: "Alia Goodheart, MD", institution: "McLean Hospital", side: "bottom", tier: 0,
    summary: "Clancy requested an earlier voluntary discharge because she felt anxious in the hospital and wanted to be home with family and the children. Goodheart permitted January 5 discharge only after next-day psychiatric follow-up was arranged.",
    details: ["At admission she had separately hoped to be home for Cora's birthday. She was not discharged against medical advice, and ‘demanded discharge’ is not supported by the sworn record.", "January 3 family texts documented anxiety about meeting the psychiatry team and worry that she would not be sent home soon; they do not show a demand or an against-medical-advice departure.", "Goodheart said she would have preferred more diagnostic time but identified no acute safety concern. She had Patrick collateral and considered the history consistent.", "Discharge planning included the next-day appointment, Psychology Today and Blue Cross case-management resources, a crisis plan, and after-visit information.", "Discharge prescriptions: trazodone 50 mg ×28 and lorazepam 1 mg ×14; melatonin was planned; no further quetiapine was planned."], civilClaims: [{ claim: "The complaint alleges a roughly ten-minute post-discharge Goodheart call offering antidepressant names and says Clancy left the ‘best hospital’ feeling there was little hope.", source: "SRC-0032 ¶¶65–66", context: "No independent post-discharge call record was located through Day 13. Goodheart's testimony placed discussion of Cymbalta during the admission, not necessarily in a later call." }], source: "SRC-0087, Trial Day 9, pp. 28–37 and 55–58, 01:36:58–02:04:00 and 03:22:34–03:30:15; SRC-0099, Trial Day 13, pp. 42–43; compare SRC-0032 ¶¶65–66", caution: "A discharge assessment is a time-limited clinical judgment, not proof of symptoms at later times.", views: ["course"]
  },
  {
    id: "jan6", date: "2023-01-06T12:00:00", displayDate: "January 6", title: "Telehealth follow-up: after McLean discharge", short: "Video visit · full inpatient chart unavailable to Tufts", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 2,
    summary: "Clancy remained depressed and numb after the quetiapine taper and described rebound anxiety as lorazepam wore off. She reported trazodone 100 mg, lorazepam 1 mg, and melatonin 5 mg.",
    details: ["She denied SI, HI, and psychosis.", "Tufts planned trazodone 150 mg and monitoring off quetiapine before adding another antidepressant.", "Tufts had a discharge summary but not the complete McLean chart and had not spoken directly with the discharging psychiatrist.", "The chart's ‘deteriorating’ dropdown meant somewhat worse than December 16, not acute decompensation."], medication: "Trazodone 100 mg + lorazepam 1 mg + melatonin 5 mg reported", source: "SRC-0087, Trial Day 9, pp. 121–123, 06:37:35–06:44:04; SRC-0091", caution: "Medication use is patient report; this video assessment is a time-limited snapshot.", views: ["course"]
  },
  {
    id: "jan9", date: "2023-01-09T12:00:00", displayDate: "January 9", title: "Prescription change: lorazepam to diazepam", short: "Longer half-life for rebound anxiety/taper", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "Tufts replaced lorazepam with longer-half-life diazepam to reduce rebound anxiety and facilitate tapering.",
    details: ["Diazepam 5 mg ×14 was filled.", "In the later Exhibit 155 kitchen-bottle inventory, 2.5 tablets remained.", "The 11.5-tablet difference does not establish who removed the tablets, when, whether they followed a taper, or whether Clancy ingested them."], medication: "Diazepam 5 mg", source: "SRC-0087; SRC-0048; SRC-0098, Trial Day 12, 00:50:49–00:51:03", caution: "A bottle count is not an administration record or proof of event-day ingestion.", views: ["course"]
  },
  {
    id: "ketamine", date: "2023-01-11T12:00:00", displayDate: "January 11", title: "MyChart message: asks about ketamine", short: "Very low mood; seeks faster relief", category: "symptom", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 0,
    summary: "Clancy asked about ketamine and described very low mood, minimal motivation, and desperation for something that might work quickly.",
    details: ["Tufts explained the treatment trials typically required before ketamine.", "The exchange illustrates persistent severe depression despite treatment and improved sleep."], source: "SRC-0087, Trial Day 9", views: ["course"]
  },
  {
    id: "traz150", date: "2023-01-12T12:00:00", displayDate: "January 12", title: "Prescription change: trazodone increased", short: "150 mg ×30 filled", category: "medication", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "Tufts prescribed trazodone 150 mg, and a quantity of 30 was filled.",
    details: ["In the later Exhibit 155 kitchen-bottle inventory, 20 tablets remained.", "The 10-tablet difference does not establish who removed the tablets, when, or whether Clancy ingested them.", "The evidence does not establish the dose taken every night through January 24."], medication: "Trazodone 150 mg", source: "SRC-0091; SRC-0048; SRC-0098, Trial Day 12, 00:50:32–00:50:49", caution: "A bottle count is not an administration record or proof of adherence.", views: ["course"]
  },
  {
    id: "jan16", date: "2023-01-16T12:00:00", displayDate: "January 16", title: "Telehealth visit: severe functional depression", short: "Video visit · very low mood, numbness, forced functioning", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 1,
    summary: "Clancy described very low mood, numbness, forcing herself out of bed, difficulty with basic care, and impaired bonding despite caring for the baby.",
    details: ["She denied SI, HI, and psychotic symptoms.", "She said she could force herself out of bed, attend to hygiene and eating, and care for the baby, although bonding felt forced.", "Patrick's collateral described her encouraging brunch and sending photos on January 14, appearing ‘pretty good’ at a January 15 water park, and caring for two boys with texts/photos on January 16. These lay observations do not negate the symptoms she reported in treatment.", "Family texts introduced on Day 13 recorded sleep and ‘a little bit’ of daytime improvement on January 8–12, waiting to feel like herself on January 14, and a January 16 outing described as fun. These are contemporaneous communications, not mental-status examinations.", "Prescriptions/fills: amitriptyline 10 mg ×30; diazepam 2 mg was dispensed, but the original label quantity remains unresolved."], civilClaims: [{ claim: "The complaint alleges that within a week of McLean discharge she again heard commands including ‘You should harm the children’ and ‘You should kill yourself.’", source: "SRC-0032 ¶¶70–72", context: "No pre-offense chart or direct disclosure located through Day 13 documented these voices. The January 16 Tufts encounter recorded severe depression but denials of SI, HI, and psychotic symptoms." }], source: "SRC-0087, Trial Day 9, pp. 125–126, 06:49:47–06:53:44; SRC-0091, Trial Day 10, pp. 66–67; SRC-0065, 02:30:20–02:39:20; SRC-0099, Trial Day 13, pp. 43–45; compare SRC-0032 ¶¶70–72", caution: "Organized activity, family messages, and a normal-appearing video encounter neither prove nor exclude symptoms outside those observations.", views: ["course"]
  },
  {
    id: "jan23", date: "2023-01-23T12:00:00", displayDate: "January 23", title: "Telehealth visit: final pre-offense encounter", short: "Video visit · depressed, flat; sleep “okay”; SI/HI denied", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 1,
    summary: "Clancy reported starting amitriptyline 10 mg without apparent side effects and being down to diazepam 2 mg, with more morning anxiety.",
    details: ["She remained depressed, flat, and poorly motivated, although sleep was reportedly okay.", "Clancy denied SI and HI; Tufts observed appropriate appearance, speech, thought process, cognition, and psychomotor activity, with no mania or psychosis.", "In a separate text exchange that day, Andrea Hennigan recalled Clancy saying she was no longer in the program and was still working with psychiatrists to find medication permitting sleep and daytime function; Hennigan perceived a hopeful, help-seeking tone and no self-harm concern.", "A few days before January 24, Amy Bevins recalled Clancy attributing unspecified ‘dark thoughts’ to an unnamed medication while tapering and trying something new; Bevins recalled a hopeful tone and no disclosed self-harm, child-harm desire, or voices.", "Patrick testified that during January 7–23 morning check-ins Clancy denied suicidal and child-harm thoughts. Her mother wrote on January 22 that it was nice to see Lindsay ‘doing better.’ These collateral observations are not clinical examinations.", "Phone artifacts showed amitriptyline-related searches continuing through January 23. The search range does not establish dose, adherence, benefit, or adverse effect.", "Medication changes: amitriptyline increased from 10 to 20 mg; the diazepam taper was slowed, with a 2-mg fill of uncertain quantity."], civilClaims: [{ claim: "The complaint alleges that on January 20 Clancy searched ‘What is a psychopath?’ and that she did not sleep after the January 23 appointment.", source: "SRC-0032 ¶¶73–74", context: "Day 13 phone evidence established a different January 20 query—‘can you treat a sociopath?’—not the complaint's quoted wording. No independent evidence established that night's sleep; the January 23 visit recorded sleep as ‘okay.’" }], source: "SRC-0087, Trial Day 9, pp. 126–128, 06:53:15–06:58:17; SRC-0091, Trial Day 10, pp. 67–68; SRC-0084, 01:06:46–01:08:30 and 01:38:48–01:50:02; SRC-0065, 02:26:43–02:27:30; SRC-0099, Trial Day 13, pp. 22–23, 49 and 55; compare SRC-0032 ¶¶73–74", caution: "These clinician and lay observations are time-limited; text recollections and search artifacts are not psychiatric examinations.", views: ["course"]
  },
  {
    id: "jan24-sequence", date: "2023-01-24T17:10:00", displayDate: "January 24", title: "January 24: observed sequence", short: "Family observations · CVS and ThreeV calls · discovery", category: "event", evidence: "Mixed evidence", certainty: "High", side: "bottom", tier: 1,
    summary: "The day-of evidence combines a pediatric visit, admitted family messages and photos, spouse collateral, retail-witness testimony, objective phone and map artifacts, errand timestamps, a brief CVS callback with Patrick, and his return-home account.",
    sequence: [
      { time: "8:00–8:42 AM", title: "Cora's five-year well visit and morning messages", detail: "Clancy drove Cora alone, exchanged mutually understood texts/photos with Patrick, and returned around 8:30. Pediatrician Lindsay Rosshirt recalled a ‘very normal visit.’ Phone evidence also showed an 8:19 snowman-photo/‘cutie’ exchange and, at 8:42, Lindsay reporting that things were good after Patrick asked how it was going.", evidence: "Patrick collateral + admitted messages/photos; pediatrician testimony/records; phone extraction · SRC-0065, 02:41:05–02:42:46; SRC-0084, 00:28:14–00:30:51; SRC-0099, pp. 52–54" },
      { time: "Daytime", title: "Snow play, crafts and family messages", detail: "Patrick described snow play and crafts, photos during the day, and happy/playful behavior when he checked in. He recalled no disclosure of SI, child-harm thoughts, or need for help and called it ‘one of her best days.’", evidence: "Patrick collateral + admitted texts/photos · SRC-0065, 02:42:49–02:45:37" },
      { time: "4:13 PM", title: "Apple Maps search for ThreeV", detail: "The phone extraction recorded a search for the restaurant and a route preview. The forensic witness noted that route previews can vary with traffic.", evidence: "Objective phone artifact · SRC-0099, p. 30, 02:06:22–02:08:54" },
      { time: "4:46–4:48 PM", title: "Constipation-product activity and CVS call", detail: "Phone artifacts recorded Miralax-for-children activity at 4:46:55, CVS/Pedia-Lax activity at 4:47, and an outgoing CVS Kingston call at 4:48:21. CVS manager Angela Krause described a mutually understood question about a child constipation product and heard no slurring, impairment, or comprehension problem.", evidence: "Objective phone artifacts + independent sworn retail-witness testimony · SRC-0099, pp. 29–30; SRC-0068, 45:02–47:31" },
      { time: "4:53–5:15 PM", title: "Dinner, errand and family messages", detail: "At 4:53:09, Clancy texted that she had not cooked and it had been a long day; the exchange covered the ThreeV menu, Callan's short nap, meal selections, and the order. Searches continued around 5:06 and she texted ‘PediaLax liquid stool softener’ at 5:15. Patrick described her demeanor at departure as normal.", evidence: "Patrick testimony + admitted messages + phone extraction · SRC-0065, 02:45:37–02:49:03; SRC-0068, 00:06:02–00:07:12; SRC-0099, pp. 30–33" },
      { time: "5:09–5:10 PM", title: "Calls associated with the food order", detail: "The extraction recorded calls lasting 11 seconds at 5:09 and 47 seconds at 5:10; the forensic witness recalled the latter as the ThreeV number. Hostess Saria Sweeney separately recalled a routine order for risotto and a Mediterranean power bowl, with coherent answers to order questions.", evidence: "Objective phone artifacts + independent sworn retail-witness testimony · SRC-0099, pp. 32–33; SRC-0068, 49:57–52:40" },
      { time: "5:32–5:37 PM", title: "Patrick at CVS", detail: "Sworn investigator testimony and the warrant chronology place Patrick inside CVS from 5:32:32 until 5:37:08.", evidence: "Investigator testimony + objective timestamp chronology · SRC-0084, 02:16:24–02:18:21; SRC-0010, pp. 168–169" },
      { time: "5:33–5:34 PM", title: "Patrick and Lindsay speak from CVS", detail: "Phone evidence recorded further calls in this interval. Patrick testified that his first call went unanswered and Lindsay called back about a minute later; when he asked whether a generic substitute was acceptable, she said yes. He described her as quiet and sounding busy, while saying they understood each other and she remembered what he was seeking.", evidence: "Objective phone artifacts + Patrick sworn percipient/collateral testimony · SRC-0099, p. 33; SRC-0068, 00:08:56–00:10:15" },
      { time: "5:54–5:55 PM", title: "Patrick at ThreeV", detail: "Objective chronology places Patrick entering at 5:54:14 and paying/leaving at 5:55:01.", evidence: "Investigator testimony + objective timestamp chronology · SRC-0084, 02:16:24–02:18:21; SRC-0010, pp. 168–169" },
      { time: "By ~6:09 PM", title: "Quiet house and unanswered call", detail: "Patrick returned to an unusually quiet house, called out and yelled down the basement stairs, telephoned Clancy without an answer, and checked upstairs before finding the locked bedroom.", evidence: "Patrick sworn testimony · SRC-0068, 00:19:49–00:22:42" },
      { time: "~6:11 PM onward", title: "Discovery and emergency response", detail: "After finding Clancy outside, Patrick testified that she said, ‘I tried to kill myself’ and ‘They're in the basement.’ He had difficulty connecting to 911, stayed on the call, and first responders arrived about four to five minutes later.", evidence: "Patrick testimony + officer dispatch time · SRC-0068, 00:28:19–00:32:02; SRC-0071, 00:04:12–00:04:37" },
    ],
    details: ["Each encounter is a narrow observation, not a psychiatric examination; coherent calls and organized behavior at particular moments do not exclude psychosis or establish criminal responsibility.", "The pediatrician's ‘very normal visit’ describes a brief pediatric encounter in the morning, not mental state later in the day.", "The new extraction corroborates specific phone activity and timing; it does not determine why an action occurred, who was present during every interaction, or what Clancy's mental state was.", "Patrick's inference that she was ‘probably giving baths’ was not something he directly observed.", "The investigator's claim that the errands created an opportunity is a probable-cause allegation, not a judicial finding.", "The suicide attempt is evidence of acute distress but does not by itself establish diagnosis, psychosis, or legal insanity."], civilClaims: [{ claim: "The complaint alleges nonstop suicidal and later child-harm commands that day; checking a map to avoid being alone and obtain help; a final demanding male voice after Patrick left; compulsion, dreamlike dissociation, and ingestion of an unspecified quantity of medication during the attempt.", source: "SRC-0032 ¶¶75–83", context: "These are retrospective plaintiff allegations. Through Day 13, partial sworn corroboration remained limited to Patrick's report that about a week later Clancy described a male voice saying she would lose her chance if she did not act then; his account did not include children in that disclosure. The phone extraction establishes the map, call, and message artifacts—not the complaint's claimed motive or voice account." }],
    source: "SRC-0065; SRC-0068; SRC-0071; SRC-0084; SRC-0010; SRC-0099, Trial Day 13, pp. 29–33 and 52–54; compare SRC-0032 ¶¶75–83", caution: "The evidence derives from different sources: family collateral, brief clinical or retail observations, phone artifacts, objective timestamps, attorney theories, and civil allegations are not interchangeable.", views: ["course"]
  },
  {
    id: "jan26", date: "2023-01-26T12:00:00", displayDate: "January 26", title: "Brigham psychiatric consultation", short: "Horrified but linear; no psychosis in snapshot", category: "post", evidence: "Treating testimony", certainty: "High", clinician: "Jhilam Biswas, MD", institution: "Brigham and Women’s Hospital", side: "top", tier: 0,
    summary: "While intubated and writing responses, Clancy described her mood as ‘horrified,’ asked whether she had an attorney, and asked about her body and legs.",
    details: ["Biswas found linear communication and no psychosis during a 20–30-minute assessment.", "She conceded that psychosis can fluctuate and that a person may have moments of clarity."], source: "SRC-0078, Trial Day 5, 2:02:12–2:13:31", caution: "This was approximately 1.5 days later and was not an offense-time forensic examination.", views: ["post"]
  },
  {
    id: "hospital-voice-theory", date: "2023-01-27T12:00:00", displayDate: "Late January (approx.)", title: "Investigative discussion: voice-prompting theory unsupported", short: "Hospital-room conversation not overheard · no firsthand basis", category: "post", evidence: "Retrospective report", certainty: "Contested", institution: "Brigham and Women’s Hospital / Massachusetts State Police", side: "bottom", tier: 2,
    summary: "A state-police witness recalled that investigators discussed a theory that a court-authorized defense clinician had suggested Clancy report hearing voices, but the witness had no firsthand knowledge or report supporting it.",
    details: ["Sergeant Daniel Lawler saw the clinician enter Clancy's hospital room but did not enter, listen, or know what was said.", "Lawler later learned that Clancy used the clinician's phone to call Patrick and recalled discussing the reported voice statement with lead investigator Joshua McKelligan.", "Before the jury, Lawler agreed that the prompting theory had no investigative basis and characterized it as McKelligan's speculation; he reiterated that he heard nothing in the room.", "The clinician visit was estimated as two or three days after January 24; its exact date remains approximate."], source: "SRC-0098, Trial Day 12, voir dire 01:03:40–01:31:57; jury testimony 01:46:56–01:52:42", caution: "Investigators discussed an unsupported prompting theory; the witness provided no basis for concluding that a clinician planted, coached, or prompted the hallucination account.", views: ["post"]
  },
  {
    id: "delirium", date: "2023-01-29T12:00:00", displayDate: "January 29–30", title: "Transient postoperative delirium", short: "Confusion and visual hallucinations resolve", category: "post", evidence: "Treating testimony", certainty: "High", clinician: "Sejal Shah, MD", institution: "Brigham and Women’s Hospital", side: "bottom", tier: 0,
    summary: "Shah identified postoperative delirium with confusion and visual hallucinations amid anesthesia, oxygen desaturation, tachycardia, and acute medical illness.",
    details: ["The delirium cleared by the following day.", "This postoperative delirium occurred days later and does not establish Clancy's mental state on January 24."], source: "SRC-0078, 1:29:04–1:32:45", views: ["post"]
  },
  {
    id: "voice", date: "2023-01-31T12:00:00", displayDate: "~1 week later", title: "Male command voice first disclosed", short: "Retrospective statement to Patrick", category: "post", evidence: "Retrospective report", certainty: "Contested", side: "top", tier: 1,
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
    id: "surface-aug23", date: "2022-08-23T09:45:00", displayDate: "August 23", title: "Shared-device browser path: user unresolved", short: "Surface Pro artifacts · Tom T. Hall to suicide-methods page", category: "digital", evidence: "Objective record", certainty: "Contested", side: "top", tier: 1,
    summary: "A forensic image of a shared Surface Pro recorded a navigation path from a Facebook page and Tom T. Hall material, through a hyperlink about his death, to a Wikipedia suicide-methods section and then the Grafton Bridge page.",
    details: ["The sequence ran approximately 9:40–9:48 a.m.; the artifact did not establish dwell time.", "The defense elicited that the suicide-methods page was reached through hyperlinks rather than a typed ‘methods of suicide’ query.", "The examiner could not identify the human user. The Surface Pro belonged to Patrick, and a browser artifact displayed his email address, but neither fact proves who was browsing at the relevant time.", "The defense introduced pediatric appointments for Callan and Dawson that morning as circumstantial context about Lindsay's activities; the examiner did not know of those appointments."],
    source: "SRC-0099, Trial Day 13, pp. 6–15, 00:59:17–01:28:40", caution: "The examiner could not identify the user. The browsing path establishes device activity but not attribution, diagnosis, or intent.", views: ["course"]
  },
  {
    id: "phone-note-oct25", date: "2022-10-25T18:00:00", displayDate: "October 25 / November 3", title: "Phone note: depression, connection, and sleep fears", short: "Created Oct. 25 · last modified Nov. 3", category: "digital", evidence: "Contemporaneous record", certainty: "Moderate", side: "top", tier: 2,
    summary: "A note on Clancy's phone, created October 25 and last modified November 3, recorded her own reflections on depression, parenting, connection with Callan, sleep deprivation, and whether to begin medication.",
    details: ["She wrote that she felt sad or depressed, had stopped breastfeeding, and felt less connected to Callan than she had hoped.", "She described some resentment toward the older children, immediately recognized that it was unfair, and wrote that she wanted love and connection with all three children.", "She wanted eight hours of sleep, therapy, and to feel happy and relaxed; she wrote that she felt traumatized only when ‘severely sleep-deprived and paranoid.’", "She feared that something could happen to the children or that mistakes could harm their development.", "The extraction could not identify what changed on November 3; the modification could have involved one character or the entire note."],
    source: "SRC-0099, Trial Day 13, pp. 23–26, 01:49:04–01:56:10", caution: "This is contemporaneous self-report, not a clinician assessment. ‘Paranoid’ is Clancy's own word in a private note and does not by itself establish delusional paranoia or psychosis.", views: ["course"]
  },
  {
    id: "phone-search-dec29", date: "2022-12-29T09:00:00", displayDate: "December 29–31", title: "Phone searches: McLean, suicide, bipolarity, and sleep", short: "Extracted search artifacts · clinical meaning unresolved", category: "digital", evidence: "Objective record", certainty: "High", side: "top", tier: 3,
    summary: "The iPhone extraction recorded searches or related artifacts involving McLean, suicide, bipolar disorder, trazodone, Ativan, and insomnia during the days leading to McLean admission.",
    details: ["December 29: McLean at 8:52 a.m.; bipolar-related artifacts beginning at 9:00 a.m.; and suicide at 1:02 p.m.", "December 31: trazodone entries from about 4:08–7:07 p.m.; an Ativan entry at 7:06 p.m.; and insomnia at 7:12 p.m.", "The bipolar-related artifact range continued through January 13; the search display does not establish which pages were read or how their contents were interpreted."],
    source: "SRC-0099, Trial Day 13, pp. 45–49, 03:33:20–03:42:38", caution: "Search terms are evidence of phone activity, not a diagnosis, prescription, dose, ingestion, adverse effect, clinician recommendation, or criminal-responsibility conclusion.", views: ["course"]
  },
  {
    id: "mclean-text-jan3", date: "2023-01-03T08:35:00", displayDate: "January 3", title: "Family texts from McLean: anxiety about team and discharge", short: "Phone messages · worried she would not be sent home soon", category: "digital", evidence: "Objective record", certainty: "High", side: "bottom", tier: 2,
    summary: "In a family text thread introduced through the phone extraction, Clancy said she was all right but anxious about meeting the full psychiatry team and worried that they would not send her home soon.",
    details: ["The messages were sent at approximately 8:35 and 8:37 a.m.", "The forensic witness understood the thread to place her at McLean, but that location was his recollection or inference from the conversation rather than a device-location finding.", "The messages add patient-reported context to the known voluntary admission; they are not a clinician observation or proof that discharge criteria had been met."],
    source: "SRC-0099, Trial Day 13, pp. 42–43, 03:24:24–03:25:54", caution: "Wanting to go home or worrying about discharge is not equivalent to demanding discharge, leaving against medical advice, or being clinically ready for discharge.", views: ["course"]
  },
  {
    id: "new-med-text-jan18", date: "2023-01-18T11:26:00", displayDate: "January 18", title: "Text: reports starting an unnamed ‘new med’", short: "Says she began it two nights earlier · drug and dose unknown", category: "digital", evidence: "Objective record", certainty: "High", side: "bottom", tier: 2,
    summary: "When her mother asked about a ‘new med,’ Clancy replied that she had started it two nights earlier.",
    details: ["The text supports a patient self-report of starting some medication around January 16.", "Neither the message nor the testimony identified the drug, dose, prescriber, number of doses, benefit, adverse effects, or continued use.", "Amitriptyline was separately prescribed on January 16 and later reported to Tufts on January 23, but the record does not establish that it was the unnamed medication in this text."],
    medication: "Unnamed ‘new med’: reportedly started two nights earlier", source: "SRC-0099, Trial Day 13, p. 45, 03:30:44–03:31:19", caution: "The text does not identify the medication or dose; attribution to amitriptyline remains unconfirmed.", views: ["course"]
  },
  {
    id: "phone-search-jan19", date: "2023-01-19T10:00:00", displayDate: "January 19–20", title: "Phone searches: psychosis, medications, and withdrawal", short: "Extracted search artifacts · not symptoms or diagnoses", category: "digital", evidence: "Objective record", certainty: "High", side: "top", tier: 2,
    summary: "The phone extraction recorded a dense cluster of mental-health and medication-related searches on January 19–20, including schizophrenia, hallucinations, psychosis symptoms, benzodiazepine withdrawal, ketamine, and a sociopathy query.",
    details: ["January 19: schizophrenia at 9:58 a.m., hallucinations at 10:33 a.m., and a ‘psychosis symptoms’ search.", "January 20: ‘benzo withdrawals’ at 8:11 p.m.; ‘can you treat a sociopath?’ at 8:28 p.m.; and psychosis/ketamine artifacts around 8:39 p.m.", "One January 20 query referred to being ‘on Seroquel’ and feeling unable to have a conversation; an ‘intrusive’ artifact was also shown, but its full query was not established.", "A single search may appear in multiple forensic-tool categories, so repeated rows are not necessarily separate user actions."],
    source: "SRC-0099, Trial Day 13, pp. 22–23 and 45–55, 01:46:45–01:48:56 and 03:33:20–03:56:33", caution: "Searches can reflect distress, curiosity, self-assessment, medication concerns, or many other motives. They do not establish that the searched condition was present or that any named drug was prescribed or taken.", views: ["course"]
  },
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
    summary: "At her second Tufts video visit, Clancy reported feeling somewhat better as the baby slept more, allowing her to sleep more. She said she had picked up sertraline but decided not to take it.", details: ["Tufts described her as alert, oriented, appropriately dressed and engaged, with euthymic mood, full affect, appropriate speech and thought, excellent judgment, intact cognition, and normal psychomotor activity.", "No hallucinations were reported.", "Medication decision: sertraline remained deferred; Clancy reported no doses taken."], source: "SRC-0087, Trial Day 9, pp. 98–102, 05:33:09–05:42:45; SRC-0091, Trial Day 10, pp. 12–13", caution: "The mental-status findings reflect this time-limited video encounter.", views: ["course"]
  },
  {
    id: "oct3-visit", date: "2022-10-03T12:00:00", displayDate: "October 3", title: "Telehealth visit: leave paperwork", short: "Video visit · postpartum leave documentation reviewed", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "Clancy met with Tufts by video after requesting help with paperwork to extend her maternity leave for postpartum anxiety and depression.", details: ["Tufts testified that the mental-status examination did not show a notable change from September 28.", "The appointment appears to have been scheduled after Tufts advised that the paperwork required information best reviewed together."], source: "SRC-0087, Trial Day 9, pp. 102–105, 05:42:50–05:52:52; SRC-0091, Trial Day 10, pp. 12–13", caution: "This encounter documented functional and administrative follow-up, not a new independent diagnosis.", views: ["course"]
  },
  {
    id: "oct3-therapy", date: "2022-10-03T16:00:00", displayDate: "October 3", title: "Therapy intake: first McAllister assessment", short: "Separate same-day encounter · complete therapy chart unavailable", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Jennifer McAllister", institution: "Aster Mental Health", side: "top", tier: 3,
    summary: "After the Tufts video visit, Clancy had her first documented therapy encounter with Jennifer McAllister.", details: ["Tufts identified the encounter from Exhibit 219 during testimony but was not present for it.", "The complete McAllister therapy record is not publicly available, limiting reconstruction of its symptom and safety content."], source: "SRC-0087, Trial Day 9, pp. 102–104, 05:47:11–05:52:52; Exhibit 219 p. 57", caution: "This establishes the encounter and sequence; it is not a substitute for the missing therapy note.", views: ["course"]
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
    summary: "After Sue Clancy initiated contact following a referral, Paul confirmed Lindsay's permission and called her personally before the formal November 21 intake.", details: ["Sue had only indicated that Lindsay was struggling; Lindsay herself supplied the symptom history.", "Clancy described an initially well 12 weeks, then anxiety after Patrick returned to work, difficulty leaving the baby, overwhelm, racing thoughts, fragmented sleep, and a wish to avoid long-term medication.", "Paul screened self-harm, baby/child harm, HI, auditory/visual hallucinations, and immediate safety; the responses were negative.", "Clancy reported prior sertraline use and that lorazepam plus diphenhydramine had been most helpful for sleep. Paul advised using the existing combination that night and scheduled the next-day intake."], source: "SRC-0091, Trial Day 10, pp. 91–94, 06:15:01–06:23:19", caution: "This reflects the history Clancy gave the service and a time-limited safety screen, not independent confirmation of every earlier symptom or dose.", views: ["course"]
  },
  {
    id: "rx-nov21", date: "2022-11-21T15:00:00", displayDate: "November 21", title: "Prescription: fluoxetine", short: "10 mg ×56 · selected from prior reported benefit", category: "medication", evidence: "Objective record", certainty: "High", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Paul prescribed fluoxetine 10 mg and a quantity of 56 was filled.", details: ["The selection relied on Clancy's report of prior benefit.", "Later evidence describes only a short trial before discontinuation."], medication: "Prozac (fluoxetine) 10 mg ×56 prescribed/filled", source: "SRC-0091, 06:23:24–06:33:23; SRC-0048", caution: "The quantity dispensed does not show how many doses were taken.", views: ["course"]
  },
  {
    id: "tufts-nov22", date: "2022-11-22T12:00:00", displayDate: "November 22", title: "Telehealth follow-up: transfer of care discussed", short: "Video visit · South Shore enrollment and medications reviewed", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "At a Tufts video visit, Clancy reported that she had enrolled with South Shore's perinatal mental-health service and planned to transfer psychiatric and therapy care there.", details: ["She reported plans to start fluoxetine and continued use of lorazepam and diphenhydramine for sleep as needed.", "She denied SI and HI, and Tufts observed no psychosis.", "They also discussed a return-to-work letter."], source: "SRC-0087, Trial Day 9, pp. 113–114, 06:16:20–06:19:11; SRC-0091, Trial Day 10, pp. 39–40", caution: "The medication history was Clancy's report to Tufts; fluoxetine 10 mg ×56 had been prescribed and filled on November 21.", views: ["course"]
  },
  {
    id: "fluoxetine-start-report", date: "2022-11-23T12:00:00", displayDate: "November 22–23", title: "Message/phone exchange: fluoxetine start confirmed", short: "Communication medium unresolved · nervousness addressed", category: "medication", evidence: "Treating testimony", certainty: "Moderate", clinician: "Julie Paul, psychiatric NP", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Clancy contacted Paul on November 22 because she was nervous about starting fluoxetine; Paul encouraged the trial. On November 23 Clancy reported that she had started it the day before.", details: ["Paul could not recall whether the exchange occurred by phone or MyChart.", "This is patient-reported ingestion beginning November 22 and is stronger than the November 21 dispensing row alone."], medication: "Prozac (fluoxetine) 10 mg reportedly started November 22", source: "SRC-0091, Trial Day 10, pp. 101–102, 06:39:52–06:41:19", caution: "The communication supports a reported start date, not continuous adherence or causation.", views: ["course"]
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
    id: "tufts-dec1", date: "2022-12-01T16:00:00", displayDate: "December 1", title: "Telehealth follow-up: fears approaching SI", short: "Video visit · medication history reviewed", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "At a Tufts video appointment, Clancy denied active suicidal ideation but described fear of getting close to suicidal thoughts and said she was not improving.", details: ["She reviewed recent sleep-medication trials and side effects as she understood them.", "Lamotrigine was discussed but not prescribed that day.", "She reported having started mirtazapine and was uncertain whether quetiapine had begun."], source: "SRC-0087, Trial Day 9, pp. 114–119, 06:19:11–06:31:40; SRC-0091, Trial Day 10, pp. 53–54", caution: "The medication history was Clancy's self-report during this Tufts video encounter.", views: ["course"]
  },
  {
    id: "dec1-urgent-outreach", date: "2022-12-01T18:00:00", displayDate: "December 1", title: "Primary-care outreach: urgent appointment sought", short: "Voicemail/MyChart outreach · completed visit unresolved", category: "clinical", evidence: "Treating testimony", certainty: "Moderate", institution: "South Shore Health", side: "top", tier: 3,
    summary: "A shared-network note indicated that Clancy requested an immediate nurse-practitioner medication appointment; an emergency slot was offered, but staff did not reach her in time to complete it.", details: ["Jollotta testified that, to her knowledge, no appointment occurred.", "On later questioning she could not confirm whether a separate Christina Zappi entry represented a completed visit."], source: "SRC-0096, Trial Day 11, p. 32, 01:47:27–01:48:24 and 06:12:23–06:13:25", caution: "This is an outreach attempt, not a confirmed clinical encounter; exact modality and completion remain unresolved.", views: ["course"]
  },
  {
    id: "dec2-dukes", date: "2022-12-02T15:00:00", displayDate: "December 2", title: "In-person LMHC intake: postpartum symptoms", short: "~1 hour · anxiety, depression, sleep loss, passive SI", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Latiesha Dukes, LMHC", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "At a fresh in-person intake, Clancy reported anxiety, depressive symptoms, severe sleep loss, and frequent passive suicidal ideation—wanting to die or no longer be present—without a plan.", details: ["Dukes observed low mood, numbness, and tearfulness while anxiety was discussed; thought process and intellectual functioning were within normal limits.", "Clancy reported constant fear that something bad would happen to the children, especially the baby, as well as panic, poor attention or confusion, 2–4 hours of sleep, appetite loss, and about 10 pounds of weight loss in one month.", "Clancy worried that she had an Ativan addiction. Dukes's substance-use assessment did not identify a substance-use disorder, and she understood Clancy to be using it as directed for anxiety.", "Clancy reported recent mirtazapine and quetiapine prescriptions that were not helping sleep and lorazepam use on December 1 after intrusive suicidal thoughts. Dukes did not independently reconcile the auto-populated medication list.", "Dukes formulated postpartum anxiety and planned weekly bridge therapy, continued prescriber management, IOP/PHP connection, CBT resources, and crisis/ER instructions."], source: "SRC-0098, Trial Day 12, 02:01:43–02:14:00; cross 03:04:34–03:22:44", caution: "Symptoms and medication use were patient reports documented by a treating LMHC. The encounter does not establish exact doses, active-medication reconciliation, medication causation, or risk outside this assessment.", views: ["course"]
  },
  {
    id: "dec5-aspire", date: "2022-12-05T14:00:00", displayDate: "December 5", title: "Telehealth LMHC follow-up: after Aspire contact", short: "~30 minutes · current SI denied · IOP/PHP recommended", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Latiesha Dukes, LMHC", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "Clancy told Dukes that a difficult weekend of continuous intrusive thoughts of wanting to die or not be present led to a virtual Aspire crisis evaluation; at the December 5 follow-up, she denied current suicidal ideation.", details: ["Clancy reported that Aspire found she did not meet inpatient criteria because she lacked a suicide plan and recommended a day program.", "Dukes did not observe psychosis, mania, homicidal ideation, delusions, or paranoia and did not assess an immediate crisis during this visit.", "Patrick joined the video visit. Dukes recommended IOP/PHP-level care and reviewed sleep hygiene; Clancy was interested rather than declining.", "Clancy requested psychological testing for additional diagnostic and medication input."], civilClaims: [{ claim: "The complaint labels a weekend crisis contact a New Bedford Suicide Hotline call prompted by hallucinations.", source: "SRC-0032 ¶45", context: "Dukes directly testified only to Clancy's report of a virtual Aspire evaluation after continuous suicidal thoughts. The underlying Aspire record, exact service identity, and alleged hallucination content remain unavailable." }], source: "SRC-0098, Trial Day 12, 02:14:00–02:23:15; cross 03:23:49–03:25:55; compare SRC-0032 ¶45", caution: "Aspire's reported disposition entered only through Clancy's account; no crisis-evaluator testimony or underlying record was available, and a refusal-of-care characterization is unsupported.", views: ["course"]
  },
  {
    id: "dec12-dukes", date: "2022-12-12T16:00:00", displayDate: "December 12", title: "Telehealth LMHC follow-up: SI without plan", short: "Second reported Aspire contact · two PHP pathways", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Latiesha Dukes, LMHC", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Clancy reported continued suicidal ideation without plan or attempt and another difficult weekend that included a second Aspire crisis contact.", details: ["Dukes considered Patrick, Clancy's mother-in-law, prior use of crisis services, and willingness to follow recommendations protective.", "Clancy said she planned to start a Norwell PHP on December 20; Dukes had not made that referral.", "With Clancy's consent, Dukes separately initiated a referral to the Women & Infants perinatal program.", "Dukes did not consider Section 12 or another emergency safety intervention required during this encounter."], source: "SRC-0098, Trial Day 12, 02:23:15–02:28:20; cross 03:26:18–03:34:16", caution: "Risk findings are time-bounded. Defense premises that Women & Infants later declined Clancy as ‘overmedicated’ or could not reach Jollotta were not adopted by Dukes and are not established by this testimony.", views: ["course"]
  },
  {
    id: "dec19-dukes", date: "2022-12-19T14:00:00", displayDate: "December 19", title: "Telehealth LMHC follow-up: mixed improvement", short: "Low mood persists · no weekend SI · more engaged", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Latiesha Dukes, LMHC", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 3,
    summary: "Clancy continued to report low mood and numbness, while reporting no suicidal ideation or crisis need over the preceding weekend and some improvement in sleep, family time, and exercise.", details: ["Dukes observed greater engagement and an ability to smile and laugh; her note still recorded low mood and numbness for most of the day.", "Clancy had missed a Women & Infants call while at another medical appointment, returned the contact, and attended the program on December 20.", "At this visit Dukes did not know that Clancy had gone to the MGH emergency department on December 15, that MGH had made a Women & Infants referral, or that Clancy reportedly chose outpatient Women & Infants care rather than inpatient McLean."], source: "SRC-0098, Trial Day 12, 02:28:21–02:32:27; redirect/recross 03:47:25–03:56:38", caution: "Organized or positive behavior coexisted with persistent depressive symptoms. Dukes's information gap supports fragmented communication, not by itself unreasonable care or clinical recovery.", views: ["course"]
  },
  {
    id: "dec27-dukes", date: "2022-12-27T12:00:00", displayDate: "December 27", title: "LMHC phone contacts: referral and prescription concerns", short: "Clancy reached · Patrick joined with consent · prescriber redirected", category: "clinical", evidence: "Treating testimony", certainty: "High", clinician: "Latiesha Dukes, LMHC", institution: "South Shore Perinatal Behavioral Health", side: "top", tier: 2,
    summary: "Dukes called Clancy to report that the referral had been completed and, with Clancy's consent, also spoke with Patrick about his prescription concerns.", details: ["Medication management was outside Dukes's role, so she redirected Patrick to the prescribing clinician.", "The chart's multiple entries reflected a list of contacts and tasks, not four unanswered calls to Clancy.", "Dukes testified that she and Clancy were in communication."], source: "SRC-0098, Trial Day 12, 02:32:48–02:35:08; cross 03:34:16–03:34:53", caution: "This establishes care coordination and a reported medication concern, not a new prescription, dose change, medication reconciliation, or ingestion.", views: ["course"]
  },
  {
    id: "jan7-party", date: "2023-01-07T15:00:00", displayDate: "January 7", title: "Family collateral: Cora's birthday party", short: "Says she feels ‘like a zombie’ · appears tired but engaged", category: "collateral", evidence: "Collateral testimony", certainty: "Moderate", side: "top", tier: 3,
    summary: "Bethany DeCollibus testified that Clancy said things had not improved and she felt ‘like a zombie,’ while appearing tired but remaining engaged with adults and children.", details: ["DeCollibus acknowledged telling police that Clancy ‘seemed fine.’", "The self-report and lay observation can coexist; neither is a psychiatric examination.", "Patrick testified that during January 7–23 morning check-ins Clancy denied suicidal and child-harm thoughts."], civilClaims: [{ claim: "The complaint alleges that at the party Clancy smiled but could not converse or process what others said.", source: "SRC-0032 ¶69", context: "DeCollibus's sworn testimony described tiredness and a ‘zombie’ disclosure but also engagement and a prior statement that Clancy ‘seemed fine.’" }], source: "SRC-0084, Trial Day 8, 01:23:25–01:25:06; SRC-0065, 02:26:43–02:27:30; compare SRC-0032 ¶69", caution: "This is retrospective lay collateral and illustrates apparent functioning, not a formal mental-status examination.", views: ["course"]
  },
  {
    id: "tufts-dec16", date: "2022-12-16T11:00:00", displayDate: "December 16", title: "Telehealth follow-up: depression despite restored sleep", short: "Video visit · post-MGH; hopelessness reviewed", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 2,
    summary: "At a Tufts video visit after the MGH evaluation, Clancy said sleep finally worked but daytime depression, low motivation, and hopelessness persisted.", details: ["She described prior suicidal ideation as hopelessness and fear of not improving, without intent or plan.", "She reported taking quetiapine 200 mg with diazepam and awaiting Women & Infants care.", "Prescription/fill: lamotrigine 25 mg ×30. Later that day, Jollotta endorsed lamotrigine and recommended quetiapine 300 mg."], source: "SRC-0087, Trial Day 9, pp. 119–121, 06:31:40–06:38:00; SRC-0091, Trial Day 10, pp. 62–63", caution: "Prescription, cross-provider endorsement, and a dose target do not establish ingestion.", views: ["course"]
  },
  {
    id: "tufts-jan9", date: "2023-01-09T10:00:00", displayDate: "January 9", title: "Telehealth follow-up: rebound anxiety", short: "Video visit · flat mood; no recent SI; no psychosis", category: "clinical", evidence: "Contemporaneous record", certainty: "High", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "top", tier: 1,
    summary: "Clancy reported rebound anxiety as nighttime lorazepam wore off, with a flat mood but some ability to laugh and no recent suicidal thoughts.", details: ["She denied HI, and Tufts observed no psychosis.", "Amitriptyline and bupropion were discussed, but no antidepressant was selected that day.", "Medication change: lorazepam was replaced with diazepam; diazepam 5 mg ×14 was filled for a longer-half-life taper strategy."], source: "SRC-0087, Trial Day 9, pp. 123–124, 06:44:06–06:47:54; SRC-0091, Trial Day 10, pp. 65–66", caution: "Medication options discussed are not medications prescribed or taken.", views: ["course"]
  },
  {
    id: "msg-dec8", date: "2022-12-08T12:00:00", displayDate: "December 8", title: "MyChart message: sleep improves; panic follows", short: "Reports diazepam + quetiapine; doses unspecified", category: "symptom", evidence: "Reported to clinician", certainty: "High", clinician: "Rebecca H. Jollotta, CNP", institution: "South Shore Perinatal Behavioral Health", side: "bottom", tier: 2,
    summary: "Clancy reported taking diazepam and quetiapine, sleeping about 9 p.m. to 5 a.m. with awakenings, then experiencing panic and asking for a slower diazepam taper.", details: ["The message did not specify the doses used."], medication: "Diazepam + quetiapine reportedly taken; doses unspecified", source: "SRC-0096, Day 11 PDF p. 54, 3:17:06–3:18:45", caution: "The proposed titration schedule does not establish the dose actually taken.", views: ["course"]
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
    summary: "Clancy went to the MGH emergency department after the December 15 higher-level-of-care discussion.", details: ["She then chose outpatient Women & Infants follow-up."], source: "SRC-0096, pp. 63–67", caution: "The complete MGH record is not publicly available; this sequence derives from treating testimony.", views: ["course"]
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
    summary: "The pharmacy exhibit records quetiapine ER 300 mg quantity 30 and diazepam 2 mg quantity 14.", details: ["The quetiapine fill followed a 300-mg recommendation.", "Neither fill proves the dose actually taken."], medication: "Seroquel XR 300 mg; Valium 2 mg", source: "SRC-0048, Dec. 19 rows; SRC-0096, pp. 65–70", caution: "The 300-mg fill does not establish an increase from the previously reported 200-mg dose or actual ingestion.", views: ["course"]
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
    summary: "The pharmacy display shows diazepam 2 mg quantity 7 and visually attributes it to Jollotta, but Jollotta testified that she prescribed no medication in January.", details: ["The dispensing row exists.", "The prescriber attribution remains unresolved in the public record."], medication: "Valium (diazepam) 2 mg ×7 filled; prescriber unresolved", source: "SRC-0048; SRC-0096, pp. 105–106", caution: "The exhibit attributes the prescription to Jollotta, while Jollotta denied issuing January prescriptions; attribution remains unresolved, and ingestion is unproved.", views: ["course"]
  },
  {
    id: "rx-jan16", date: "2023-01-16T17:00:00", displayDate: "January 16", title: "Prescriptions: amitriptyline + diazepam", short: "10 mg ×30 · diazepam label quantity unresolved", category: "medication", evidence: "Objective record", certainty: "Contested", clinician: "Jennifer Tufts, MD", institution: "Aster Mental Health", side: "bottom", tier: 3,
    summary: "Tufts prescribed amitriptyline 10 mg and continued the diazepam taper; both medications were dispensed, but the public evidence conflicts or is unclear about the diazepam bottle's original quantity.", details: ["Amitriptyline 10 mg ×30 was filled; Exhibit 155 later contained 22 tablets. The eight-tablet difference is not proof that Clancy ingested them.", "The pharmacy display had been read as diazepam 2 mg ×3. In Exhibit 155 testimony, the January 16 bottle label appeared to show ‘three’ with a pink strike-through, while 9.5 tablets remained.", "The available public display does not resolve the diazepam label's original quantity.", "Neither remaining nor missing tablets establish who handled them, when, the dose used, or adherence."], medication: "Elavil 10 mg; Valium 2 mg (original quantity unresolved)", source: "SRC-0091, 03:55:47–04:00:32; SRC-0048; SRC-0098, Trial Day 12, 00:51:05–00:51:49", caution: "Exhibit 155 is a later bottle inventory rather than an administration record; missing tablets do not establish doses taken.", views: ["course"]
  },
  {
    id: "rx-jan19", date: "2023-01-19T12:00:00", displayDate: "January 19", title: "Pharmacy fill: diazepam—prescriber disputed", short: "2 mg ×14 · display/testimony conflict", category: "medication", evidence: "Objective record", certainty: "Contested", side: "top", tier: 3,
    summary: "The pharmacy display shows diazepam 2 mg quantity 14 and visually attributes it to Jollotta, who testified that she issued no January prescriptions.", details: ["The fill is recorded, but prescriber attribution, coordination, and actual use remain unresolved."], medication: "Valium (diazepam) 2 mg ×14 filled; prescriber unresolved", source: "SRC-0048; SRC-0096, pp. 105–106", caution: "The fill does not establish daily dosing or adherence.", views: ["course"]
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
    { start: "2023-01-12", end: "2023-01-24", label: "150 mg", status: "prescribed", note: "150 mg ×30 prescribed and filled. Exhibit 155 later contained 20 tablets; the 10-tablet difference does not establish ingestion or nightly adherence." },
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
    { start: "2023-01-09", end: "2023-01-13", label: "5 mg", status: "prescribed", note: "Tufts restarted diazepam; 5 mg ×14 was filled. Exhibit 155 later contained 2.5 tablets; the difference does not establish ingestion or taper adherence." },
    { start: "2023-01-13", end: "2023-01-24", label: "2 mg", status: "reported", note: "Multiple 2-mg fills appear; prescriber attribution is disputed, and Clancy reported being down to 2 mg on January 23. Exhibit 155 later contained 9.5 tablets in a January 16 bottle whose printed quantity was anomalous; the count does not establish ingestion." },
    { start: "2023-01-24", label: "detected", status: "detected", note: "Diazepam and metabolites detected; dose and timing unresolved." },
  ]},
  { name: "Lamictal", generic: "lamotrigine", color: "#8ce99a", className: "mood stabilizer / anticonvulsant", summary: "Prescribed and filled at 25 mg; regular use is not documented, but later exposure was detected.", segments: [
    { start: "2022-12-16", end: "2023-01-24", label: "25 mg", status: "prescribed", note: "Tufts prescribed and the pharmacy filled 25 mg; Jollotta endorsed it but did not know whether it was taken." },
    { start: "2023-01-24", label: "detected", status: "detected", note: "6.1 mcg/mL reported by NMS." },
  ]},
  { name: "Elavil", generic: "amitriptyline", color: "#bea7ff", className: "tricyclic antidepressant", summary: "Started late in the course; dose increase prescribed the day before the deaths.", segments: [
    { start: "2023-01-16", end: "2023-01-23", label: "10 mg", status: "reported", note: "10 mg ×30 prescribed and filled; Clancy later reported starting 10 mg without apparent adverse effects. Exhibit 155 contained 22 tablets; the eight-tablet difference does not establish ingestion or adherence." },
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

const courseBreak = {
  birthEnd: "2022-06-02T00:00:00",
  onsetStart: "2022-08-23T00:00:00",
  breakStartPct: 1.5,
  breakEndPct: 2.3,
};

const postBreak = {
  earlyEnd: "2023-05-01T00:00:00",
  lateStart: "2024-05-01T00:00:00",
  breakStartPct: 59,
  breakEndPct: 63,
};

function timelinePct(value: string, view: ViewKey, start: string, end: string) {
  const time = stamp(value);
  if (view === "course") {
    const birthEnd = stamp(courseBreak.birthEnd);
    const onsetStart = stamp(courseBreak.onsetStart);
    if (time <= birthEnd) return ((time - stamp(start)) / (birthEnd - stamp(start))) * courseBreak.breakStartPct;
    if (time < onsetStart) return (courseBreak.breakStartPct + courseBreak.breakEndPct) / 2;
    return courseBreak.breakEndPct + ((time - onsetStart) / (stamp(end) - onsetStart)) * (100 - courseBreak.breakEndPct);
  }

  const earlyEnd = stamp(postBreak.earlyEnd);
  const lateStart = stamp(postBreak.lateStart);
  if (time <= earlyEnd) return ((time - stamp(start)) / (earlyEnd - stamp(start))) * postBreak.breakStartPct;
  if (time < lateStart) return (postBreak.breakStartPct + postBreak.breakEndPct) / 2;
  return postBreak.breakEndPct + ((time - lateStart) / (stamp(end) - lateStart)) * (100 - postBreak.breakEndPct);
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

function buildTimelineCards(eventsToPlace: TimelineEvent[], view: ViewKey): TimelineCardItem[] {
  const groupedDates = new Map<string, TimelineEvent[]>();
  const clusterEligible = (event: TimelineEvent) => {
    const day = event.date.slice(0, 10);
    return view === "course"
      && day >= "2022-11-01"
      && day <= "2022-12-31"
      && !/[–~]|late|after|before|about/i.test(event.displayDate);
  };

  eventsToPlace.forEach((event) => {
    if (!clusterEligible(event)) return;
    const day = event.date.slice(0, 10);
    groupedDates.set(day, [...(groupedDates.get(day) ?? []), event]);
  });

  const emitted = new Set<string>();
  return eventsToPlace.flatMap((event) => {
    const day = event.date.slice(0, 10);
    const group = clusterEligible(event) ? groupedDates.get(day) ?? [] : [];
    if (group.length < 2) {
      return [{
        id: event.id,
        date: event.date,
        displayDate: event.displayDate,
        side: event.side,
        color: categoryMeta[event.category].color,
        certainty: event.certainty,
        events: [event],
      }];
    }
    if (emitted.has(day)) return [];
    emitted.add(day);
    const categories = [...new Set(group.map((item) => item.category))];
    const certainties = group.map((item) => item.certainty);
    return [{
      id: `cluster-${day}`,
      date: group[0].date,
      displayDate: timelineDate(`${day}T12:00:00`, { month: "long", day: "numeric" }),
      side: group[0].side,
      color: categories.length === 1 ? categoryMeta[categories[0]].color : "#88a6b1",
      certainty: certainties.includes("Contested") ? "Contested" : certainties.includes("Moderate") ? "Moderate" : "High",
      events: group,
    }];
  });
}

function packTimelineEvents(cardsToPlace: TimelineCardItem[], view: ViewKey, start: string, end: string, canvasWidth: number) {
  const cardWidth = 184;
  const halfCard = cardWidth / 2;
  const collisionGap = 12;
  const laneEnds = {
    top: Array(3).fill(-Infinity) as number[],
    bottom: Array(3).fill(-Infinity) as number[],
  };
  const laneTop = {
    top: [25, 125, 225],
    bottom: [340, 440, 540],
  };

  return cardsToPlace.map((item) => {
    const x = Math.min(99.2, Math.max(.8, timelinePct(item.date, view, start, end)));
    const eventX = canvasWidth * x / 100;
    const cardCenter = Math.min(canvasWidth - halfCard - 8, Math.max(halfCard + 8, eventX));
    const cardLeft = cardCenter - halfCard;
    const cardRight = cardCenter + halfCard;
    const preferredSides: ("top" | "bottom")[] = [item.side, item.side === "top" ? "bottom" : "top"];
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
    const connectorTop = chosenSide === "top" ? top + 96 : 335;
    const connectorHeight = chosenSide === "top" ? 325 - (top + 96) : top - 335;
    return {
      item,
      x,
      top,
      cardOffset: cardCenter - eventX,
      connectorTop,
      connectorHeight,
      color: item.color,
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
  const [selection, setSelection] = useState<{ kind: "event"; index: number } | { kind: "cluster"; eventIds: string[] } | { kind: "medication"; medication: Medication } | null>(null);
  const [showMedicationOverlay, setShowMedicationOverlay] = useState(false);
  const [showScrollCoach, setShowScrollCoach] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const lastUserScrollLeft = useRef(0);
  const range = views[view];
  const canvasWidth = Math.round(range.baseWidth * zoom);

  const visibleEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEvents
      .filter((event) => event.views.includes(view) && activeCategories.has(event.category))
      .filter((event) => !q || [event.title, event.short, event.summary, event.details.join(" "), event.caution, event.clinician, event.institution, event.medication, event.source, event.sequence?.map((step) => `${step.time} ${step.title} ${step.detail} ${step.evidence}`).join(" "), event.civilClaims?.map((item) => `${item.claim} ${item.context ?? ""} ${item.source}`).join(" ")].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => stamp(a.date) - stamp(b.date));
  }, [view, activeCategories, query]);
  const selectedEventIndex = selection?.kind === "event" ? selection.index : -1;
  const selectedEvent = selectedEventIndex >= 0 ? visibleEvents[selectedEventIndex] ?? null : null;
  const selectedMedication = selection?.kind === "medication" ? selection.medication : null;
  const selectedClusterEvents = selection?.kind === "cluster"
    ? selection.eventIds.map((id) => visibleEvents.find((event) => event.id === id)).filter((event): event is TimelineEvent => Boolean(event))
    : [];
  const selected = selectedEvent ?? selectedMedication;

  const toggleCategory = (category: Category) => {
    const next = new Set(activeCategories);
    if (next.has(category)) next.delete(category); else next.add(category);
    setSelection(null);
    setActiveCategories(next);
  };

  const changeView = (nextView: ViewKey) => {
    if (nextView === view) return;
    setSelection(null);
    setShowScrollCoach(true);
    lastUserScrollLeft.current = 0;
    setView(nextView);
    requestAnimationFrame(() => scroller.current?.scrollTo({ left: 0, behavior: "smooth" }));
  };

  const showStoryEvent = (index: number) => {
    if (!visibleEvents.length) return;
    const normalized = (index + visibleEvents.length) % visibleEvents.length;
    const event = visibleEvents[normalized];
    setSelection({ kind: "event", index: normalized });
    const position = timelinePct(event.date, view, range.start, range.end) / 100;
    scroller.current?.scrollTo({ left: Math.max(0, canvasWidth * position - window.innerWidth * 0.43), behavior: "smooth" });
  };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
      if (event.key === "ArrowRight" && selectedEventIndex !== -1) showStoryEvent(selectedEventIndex + 1);
      if (event.key === "ArrowLeft" && selectedEventIndex !== -1) showStoryEvent(selectedEventIndex - 1);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });

  const ticks = view === "course"
    ? monthTicks(courseBreak.onsetStart, range.end)
    : [
        ...monthTicks(range.start, postBreak.earlyEnd),
        { date: postBreak.lateStart, label: "May 2024" },
        ...monthTicks(postBreak.lateStart, range.end),
      ];
  const medicationTicks = monthTicks(courseBreak.onsetStart, range.end);
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
  const timelineCards = useMemo(() => buildTimelineCards(visibleEvents, view), [visibleEvents, view]);
  const positionedEvents = useMemo(
    () => packTimelineEvents(timelineCards, view, range.start, range.end, canvasWidth),
    [timelineCards, view, range.start, range.end, canvasWidth],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <p className="kicker">Evidence-aware clinical chronology</p>
            <h1>Commonwealth <em>v.</em> Lindsay Clancy</h1>
            <p className="header-credit">Arranged by Alex Krawec, MS4</p>
          </div>
        </div>
        <div className="cutoff"><span>Evidence cutoff</span><strong>Aug 13, 2026 · Trial Day 13</strong><p className="header-credit">Feedback: AKrawec@mednet.ucla.edu</p></div>
      </header>

      <section className="orientation">
        <p className="section-number orientation-label">01 / BACKGROUND</p>
        <div className="orientation-content">
          <div className="story-beats" aria-label="Clinical arc summary">
            <article><span>Late summer</span><strong>Anxiety emerges after 12 well weeks</strong><p>Later clinical history described the first 12 postpartum weeks as going well.</p></article>
            <article><span>Sep–Nov</span><strong>Worsening symptoms</strong><p>Anxiety, depressed mood, insomnia, racing thoughts, and functional impairment prompt serial visits and an ED evaluation.</p></article>
            <article><span>Nov–Dec</span><strong>Rapid treatment changes</strong><p>Sleep improves unevenly while depression and intrusive thoughts intensify.</p></article>
            <article><span>January</span><strong>Severe depression persists, offense on January 24</strong><p>McLean admission, medication transition, outpatient follow-up, offense.</p></article>
          </div>
          <section className="orientation-care" aria-labelledby="orientation-care-title">
            <div className="orientation-care-heading">
              <div><span>Care and medication map</span><h2 id="orientation-care-title">Providers seen and major medication trials</h2></div>
              <p>Background summary only. Prescribed or filled does not necessarily mean taken; the interactive timeline below preserves the evidentiary distinctions.</p>
            </div>
            <div className="care-map-scroll">
              <div className="care-map" role="list" aria-label="Monthly summary of providers and medication trials">
                {orientationCareMap.map((month) => <article className="care-month" key={month.month} role="listitem">
                  <header><span>{month.month}</span><i /></header>
                  <div className="care-month-groups">
                    {month.groups.map((group) => <section className="care-group" key={`${month.month}-${group.date}-${group.provider}`}>
                      <time>{group.date}</time>
                      <strong>{group.provider}</strong>
                      <small>{group.organization}</small>
                      <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
                    </section>)}
                  </div>
                </article>)}
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className="reading-guide case-arguments">
        <p className="section-number argument-label">02 / THE ARGUMENTS</p>
        <div className="argument-grid">
          <article className="defense-argument"><span>Defense</span><h3>Psychotic illness overwhelmed legal capacity.</h3><p>The defense argues that severe perinatal mental illness—framed as postpartum or bipolar psychosis, intensified by insomnia and medication exposure—culminated in a command voice and a genuine suicide attempt, leaving Clancy without criminal responsibility.</p><small>Evidence introduced through Day 13 included months of documented depression, anxiety, and sleep disruption; repeated help-seeking and hospital care; Patrick&apos;s account of earlier distressing child-harm thoughts; a contemporaneous phone note describing depression, impaired bonding and severe sleep deprivation; mental-health searches; and his later report of a male “last chance” voice. The note and searches do not themselves establish psychosis.</small></article>
          <article className="prosecution-argument"><span>Prosecution</span><h3>Deliberate conduct with retained capacity.</h3><p>The Commonwealth argues that Clancy experienced depression and anxiety but was not psychotic, deliberately created an errand window, and retained the ability to understand and control her conduct.</p><small>Evidence introduced through Day 13 included ordinary-seeming same-day calls and messages; phone artifacts documenting the restaurant route, constipation-product activity, food-order sequence, and calls; a structured sequence and locked bedroom; repeated pre-offense clinical encounters without documented hallucinations, delusions, mania, or disorganization; and the retrospective timing of the command-voice account.</small></article>
          <p className="argument-boundary">Both formulations remain advocacy at this stage. Organized behavior can coexist with psychosis, and psychosis alone does not establish lack of criminal responsibility. Once the issue is raised, Massachusetts requires the Commonwealth to prove criminal responsibility beyond a reasonable doubt.</p>
        </div>
      </section>

      <section className="workspace" aria-label="Interactive evidence timeline">
        <div className="control-deck">
          <div className="view-tabs" role="tablist" aria-label="Timeline views">
            {(Object.keys(views) as ViewKey[]).map((key) => (
              <button key={key} role="tab" aria-selected={view === key} className={view === key ? "active" : ""} onClick={() => changeView(key)}>
                <strong>{views[key].label}</strong><span>{views[key].eyebrow}</span>
              </button>
            ))}
          </div>
          <div className="tools-row">
            <label className="search-control">
              <span className="search-icon" aria-hidden="true" />
              <input value={query} onChange={(event) => { setSelection(null); setQuery(event.target.value); }} placeholder="Search symptoms, medications, clinicians…" aria-label="Search timeline" />
              {query && <button onClick={() => { setSelection(null); setQuery(""); }} aria-label="Clear search">×</button>}
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
            <div className="filter-actions" aria-label="Bulk event-filter controls">
              <button disabled={activeCategories.size === 0} onClick={() => { setActiveCategories(new Set()); setSelection(null); }}>Hide all</button>
              <button disabled={activeCategories.size === Object.keys(categoryMeta).length} onClick={() => { setActiveCategories(new Set(Object.keys(categoryMeta) as Category[])); setSelection(null); }}>Show all</button>
            </div>
          </div>
        </div>

        <div className="timeline-status">
          <div><strong>{visibleEvents.length}</strong> events shown</div>
          <p><span className="drag-mark">↔</span> Drag or shift-scroll horizontally · select any card for its evidence note</p>
          <div className="evidence-mini"><span className="solid" /> documented <span className="dash" /> reported / uncertain</div>
        </div>

        <div className="timeline-viewport">
          <div className={`scroll-coach ${showScrollCoach ? "visible" : "dismissed"}`} aria-hidden={!showScrollCoach}>
            <div className="scroll-coach-visual" aria-hidden="true"><kbd>Shift</kbd><span>+</span><i className="mouse-icon"><b /></i></div>
            <div><strong>Move through the timeline</strong><span>Hold Shift while scrolling</span></div>
            <button onClick={() => setShowScrollCoach(false)} aria-label="Dismiss timeline scrolling instruction">×</button>
          </div>
          {/* Keyboard focus is intentional: this labeled region is horizontally scrollable. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className="timeline-scroll" ref={scroller} role="region" tabIndex={0} aria-label={`Scrollable ${range.label} timeline`} onWheel={(event) => { if ((event.shiftKey && Math.abs(event.deltaY) > 1) || Math.abs(event.deltaX) > 1) setShowScrollCoach(false); }} onPointerDown={() => { lastUserScrollLeft.current = scroller.current?.scrollLeft ?? 0; }} onPointerUp={() => { const left = scroller.current?.scrollLeft ?? 0; if (Math.abs(left - lastUserScrollLeft.current) > 4) setShowScrollCoach(false); }}>
          <div className={`timeline-canvas ${medicationVisible ? "with-meds" : "compact"} ${medicationVisible && showMedicationOverlay ? "overlay-open" : ""}`} style={{ width: canvasWidth, "--med-context-height": `${medicationContextHeight}px` } as React.CSSProperties}>
            <div className="time-ruler">
              <span className="range-start">{timelineDate(range.start, { month: "short", day: "numeric", year: "numeric" })}</span>
              {view === "course" && <div className="timeline-break ruler-break" style={{ left: `${courseBreak.breakStartPct}%`, width: `${courseBreak.breakEndPct - courseBreak.breakStartPct}%` }}><span>~11 weeks omitted</span></div>}
              {view === "post" && <div className="timeline-break ruler-break" style={{ left: `${postBreak.breakStartPct}%`, width: `${postBreak.breakEndPct - postBreak.breakStartPct}%` }}><span>~12 months omitted</span></div>}
              {ticks.map((tick) => <div className="tick" key={tick.date} style={{ left: `${timelinePct(tick.date, view, range.start, range.end)}%` }}><span>{tick.label}</span></div>)}
              <span className="range-end">{timelineDate(range.end, { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>

            {view === "course" && showMedicationOverlay && <section className="med-overlay-section" style={{ height: medicationContextHeight }} aria-label="Medication timeline context">
              <div className="med-overlay-heading"><span>Medication timeline</span><small>Expanded clinical-course context</small></div>
              <div className="med-overlay">
                {detectedMedicationGroups.map(([date, group]) => <div className="med-overlay-row detected-row" key={date}>
                  <div className="med-detected-cluster" style={{ left: `${Math.min(99.5, Math.max(0, timelinePct(date, "course", views.course.start, views.course.end)))}%` }}>
                    <small>Detected {timelineDate(date, { month: "short", day: "numeric" })}</small>
                    {group.map(({ medication, segment, segmentIndex }) => <button key={`${medication.generic}-${segmentIndex}`} style={{ "--med": medication.color } as React.CSSProperties} onClick={() => setSelection({ kind: "medication", medication })} title={`${medication.name} (${medication.generic}): ${segment.label}. ${segment.note}`}><i /><span>{medication.name}</span></button>)}
                  </div>
                </div>)}
                {packedMedicationRows.map((row, rowIndex) => <div className="med-overlay-row" key={rowIndex}>
                  {row.map(({ medication, segment, segmentIndex, start, end }) => (
                    <button key={`${medication.generic}-${segmentIndex}`} className={`med-overlay-segment ${segment.status}`} style={{ left: `${start}%`, width: `calc(${Math.max(.4, end - start)}% - 1px)`, "--med": medication.color } as React.CSSProperties} onClick={() => setSelection({ kind: "medication", medication })} title={`${medication.name} (${medication.generic}): ${segment.label}. ${segment.note}`}><span>{medication.name} · {segment.label}</span></button>
                  ))}
                </div>)}
              </div>
            </section>}

            <div className="event-field">
              {view === "course" && <div className="timeline-break field-break" style={{ left: `${courseBreak.breakStartPct}%`, width: `${courseBreak.breakEndPct - courseBreak.breakStartPct}%` }} aria-hidden="true" />}
              {view === "post" && <div className="timeline-break field-break" style={{ left: `${postBreak.breakStartPct}%`, width: `${postBreak.breakEndPct - postBreak.breakStartPct}%` }} aria-hidden="true" />}
              <div className="main-axis" />
              <div className="connector-layer" aria-hidden="true">
                {positionedEvents.map(({ item, x, connectorTop, connectorHeight, color }) => <span className="connector" key={item.id} style={{ left: `${x}%`, top: connectorTop, height: Math.max(10, connectorHeight), "--event": color } as React.CSSProperties} />)}
              </div>
              {positionedEvents.map(({ item, x, top, cardOffset, color }) => {
                const isCluster = item.events.length > 1;
                const event = item.events[0];
                const categories = [...new Set(item.events.map((member) => member.category))];
                return (
                  <div className="event-anchor" key={item.id} style={{ left: `${x}%`, "--event": color } as React.CSSProperties}>
                    <button className={`event-card ${isCluster ? "event-cluster" : ""} ${item.certainty.toLowerCase()}`} style={{ top, left: cardOffset }} onClick={() => isCluster ? setSelection({ kind: "cluster", eventIds: item.events.map((member) => member.id) }) : setSelection({ kind: "event", index: visibleEvents.findIndex((member) => member.id === event.id) })} aria-label={isCluster ? `${item.displayDate}: ${item.events.length} events. Open cluster.` : `${event.displayDate}: ${event.title}. Open details.`}>
                      <span className="card-date">{item.displayDate}</span>
                      {isCluster ? <><strong>{item.events.length} events</strong><span className="cluster-kinds">{categories.map((category) => <i key={category} style={{ "--cluster-color": categoryMeta[category].color } as React.CSSProperties} />)}<small>Select to unpack</small></span></> : <strong>{event.title}</strong>}
                    </button>
                    <span className="axis-dot" />
                  </div>
                );
              })}
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
                <div className="med-month-ruler" aria-label="Medication timeline months">
                  <div className="med-month-label">Months</div>
                  <div className="med-month-track">{medicationTicks.map((tick) => <div className="med-month-tick" key={tick.date} style={{ left: `${timelinePct(tick.date, "course", range.start, range.end)}%` }}><span>{tick.label}</span></div>)}</div>
                </div>
                <div className="med-grid">
                  {medications.map((medication) => (
                    <div className="med-row" key={medication.generic}>
                      <button className="med-name" onClick={() => setSelection({ kind: "medication", medication })} style={{ "--med": medication.color } as React.CSSProperties}>
                        <strong>{medication.name}</strong><span>{medication.generic}</span><small>{medication.className}</small>
                      </button>
                      <div className="med-track">
                        {medication.segments.map((segment, index) => {
                          const start = Math.min(99.5, Math.max(0, timelinePct(segment.start, view, range.start, range.end)));
                          const end = segment.end ? Math.min(100, Math.max(start, timelinePct(segment.end, view, range.start, range.end))) : start;
                          const width = segment.end ? Math.max(.4, end - start) : 0;
                          const level = segment.level ?? 0;
                          return segment.end ? (
                            <button key={index} className={`med-segment ${segment.status}`} style={{ left: `${start}%`, width: `calc(${width}% - 2px)`, top: `${5 + level * 26}px`, "--med": medication.color } as React.CSSProperties} onClick={() => setSelection({ kind: "medication", medication })} title={`${medication.name}: ${segment.label}. ${segment.note}`}>
                              <span>{segment.label}</span>
                            </button>
                          ) : (
                            <button key={index} className={`med-marker ${segment.status}`} style={{ left: `${start}%`, top: `${11 + level * 26}px`, "--med": medication.color } as React.CSSProperties} onClick={() => setSelection({ kind: "medication", medication })} title={`${medication.name}: ${segment.label}. ${segment.note}`} aria-label={`${medication.name}: ${segment.label}`} />
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
        </div>
      </section>

      <footer>
        <p>Educational evidence visualization · not an independent diagnosis, malpractice opinion, criminal-responsibility opinion, or verdict recommendation.</p>
        <p>Source IDs correspond to the 100-source master corpus. Update before presenting.</p>
      </footer>

      {selectedClusterEvents.length > 0 && (
        <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelection(null); }}>
          <aside key={`cluster-${selectedClusterEvents.map((event) => event.id).join("-")}`} className="detail-drawer cluster-drawer" role="dialog" aria-modal="true" aria-label={`${selectedClusterEvents.length} events on ${selectedClusterEvents[0].displayDate}`}>
            <button className="drawer-close" onClick={() => setSelection(null)} aria-label="Close event cluster">×</button>
            <div className="drawer-accent cluster-accent"><span>Local event cluster</span><i /></div>
            <p className="drawer-date">{timelineDate(selectedClusterEvents[0].date, { month: "long", day: "numeric", year: "numeric" })}</p>
            <h2>{selectedClusterEvents.length} events</h2>
            <p className="drawer-summary">Several separately documented events share this date. Select one to open its complete evidence panel.</p>
            <div className="cluster-event-list">
              {selectedClusterEvents.map((clusterEvent) => <button key={clusterEvent.id} onClick={() => setSelection({ kind: "event", index: visibleEvents.findIndex((item) => item.id === clusterEvent.id) })} style={{ "--cluster-color": categoryMeta[clusterEvent.category].color } as React.CSSProperties}>
                <span>{categoryMeta[clusterEvent.category].label}</span>
                <strong>{clusterEvent.title}</strong>
                <small>{clusterEvent.short}</small>
              </button>)}
            </div>
            <p className="cluster-boundary">Clustering changes only the display. Each event retains its original source posture, certainty, and chronological position.</p>
          </aside>
        </div>
      )}

      {selected && (
        <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelection(null); }}>
          <aside key={selectedEvent ? selectedEvent.id : `med-${selectedMedication?.generic}`} className="detail-drawer" role="dialog" aria-modal="true" aria-label={"title" in selected ? selected.title : `${selected.name} medication details`}>
            <button className="drawer-close" onClick={() => setSelection(null)} aria-label="Close details">×</button>
            {"title" in selected ? (
              <>
                <div className="drawer-accent" style={{ "--event": categoryMeta[selected.category].color } as React.CSSProperties}><span>{categoryMeta[selected.category].label}</span><i /></div>
                <p className="drawer-date">{selected.displayDate}</p>
                <h2>{selected.title}</h2>
                <p className="drawer-summary"><span className="drawer-context">{selected.short}</span>{selected.summary}</p>
                {(selected.clinician || selected.institution) && <div className="provider-card"><span>{selected.clinician ? "Clinician" : "Institution"}</span><strong>{selected.clinician || selected.institution}</strong>{selected.clinician && selected.institution && <small>{selected.institution}</small>}</div>}
                {selected.medication && <div className="med-callout"><span>Medication action</span><strong>{selected.medication}</strong></div>}
                {selected.sequence && <div className="drawer-section sequence-section"><h3>January 24 timeline</h3><div className="sequence-list">{selected.sequence.map((step) => <article key={`${step.time}-${step.title}`}><time>{step.time}</time><div><strong>{step.title}</strong><p>{step.detail}</p><small>{step.evidence}</small></div></article>)}</div></div>}
                <div className="drawer-section"><h3>What the evidence supports</h3><ul>{selected.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></div>
                {selected.civilClaims && selected.civilClaims.length > 0 && <div className="civil-claims-box"><span>Civil pleading allegations</span><p className="civil-claims-boundary">These are allegations in Lindsay Clancy&apos;s civil complaint—not findings—and do not substitute for the underlying medical record or sworn testimony.</p>{selected.civilClaims.map((item) => <article key={`${item.claim}-${item.source}`}><p>{item.claim}</p>{item.context && <p className="civil-claims-context">Record context: {item.context}</p>}<small>{item.source}</small></article>)}</div>}
                <div className="evidence-card"><div><span>Evidence posture</span><strong>{selected.evidence}</strong></div><div><span>Certainty</span><strong className={`certainty ${selected.certainty.toLowerCase()}`}>{selected.certainty}</strong></div></div>
                {selected.caution && <div className="caution-box"><span>Interpretive boundary</span><p>{selected.caution}</p></div>}
                <div className="source-box"><span>Corpus source</span><p>{selected.source}</p></div>
                <div className="drawer-nav">
                  <button onClick={() => showStoryEvent(selectedEventIndex - 1)}>← Previous</button>
                  <output key={selected && "title" in selected ? selected.id : "no-event"} aria-live="polite" aria-atomic="true">{selectedEventIndex !== -1 ? `${selectedEventIndex + 1} / ${visibleEvents.length}` : "Selected event"}</output>
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
