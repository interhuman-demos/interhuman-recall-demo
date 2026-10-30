import { type JobResult } from "@repo/shared";

/** Participant ids used by the synthetic demo (stable across all speakers). */
export const DEMO_PARTICIPANTS = [
  { id: "400", name: "Jordan Blake", talkTimeS: 29.4 },
  { id: "300", name: "Alex Rivera", talkTimeS: 40.2 },
  { id: "500", name: "Sam Chen", talkTimeS: 12.7 },
  { id: "600", name: "Taylor Morgan", talkTimeS: 9.3 },
];

/** The default focal speaker the demo opens on. */
export const DEMO_DEFAULT_FOCAL_ID = "300";

/** Shared transcript for the demo call (speaker-independent). */
const DEMO_TRANSCRIPT = [
  {
    index: 0,
    speaker: "Jordan Blake",
    startS: 2.1,
    endS: 12.8,
    text: "Alex, before we wrap up — the numbers you presented last week. We're a full month behind on the roadmap and burning runway. So just tell me straight: are we actually going to ship this on time, or not?",
  },
  {
    index: 1,
    speaker: "Alex Rivera",
    startS: 14.2,
    endS: 33.6,
    text: "Yeah, so, I mean... I think we can probably make it work. There were a couple of things that slipped, the integration took longer than we expected, and, um, I'd have to double-check with the team, but I believe we should be more or less on track if nothing else comes up.",
  },
  {
    index: 2,
    speaker: "Jordan Blake",
    startS: 34.9,
    endS: 44.2,
    text: '"More or less" doesn\'t really tell me much, Alex. I need to know what to tell the board on Friday. Is the date safe or not?',
  },
  {
    index: 3,
    speaker: "Alex Rivera",
    startS: 45.7,
    endS: 68.9,
    text: "Right. Okay. The honest answer is the original date is at risk by about one week. The integration is the only real blocker, and it's already in review — I'll have a confirmed date for you by end of day tomorrow after I sync with the team. So: not the original Friday, but a firm date within 48 hours.",
  },
  {
    index: 4,
    speaker: "Sam Chen",
    startS: 70.1,
    endS: 82.4,
    text: "Just to back Alex up — the integration delay was a vendor issue on their side, not ours. We've already got a workaround in staging, so a one-week slip is the realistic worst case, not the expected one. I'm confident we hold that line.",
  },
  {
    index: 5,
    speaker: "Taylor Morgan",
    startS: 83.0,
    endS: 94.6,
    text: "Okay. So the message for the board is: one-week risk, confirmed date in 48 hours, mitigation already in place. I think... yeah, I think that's something we can stand behind. Let's lock that and move on.",
  },
];

/**
 * Hardcoded, fully-assembled sample analysis used by the dependency-free demo
 * path. Lets `/api/demo` produce a complete report without the stream-proxy or
 * any external services. Derived from the "tough-question" fixture call.
 *
 * Focal speaker: Alex Rivera — the one under pressure to answer.
 */
export const DEMO_SAMPLE_RESULT: Omit<JobResult, "sessionId"> = {
  durationS: 96.0,
  focalSpeaker: "Alex Rivera",
  participants: DEMO_PARTICIPANTS,
  transcript: DEMO_TRANSCRIPT,
  signals: [
    {
      windowIndex: 0,
      startS: 14.2,
      endS: null,
      speaker: "Alex Rivera",
      type: "uncertainty",
      probability: "high",
      rationale:
        "The speaker opens with hedging language ('I think we can probably make it work') and multiple filler words ('um', 'I mean'). His gaze breaks from the camera repeatedly and his eyebrows raise in a questioning manner, signaling he is unsure of his own answer.",
      transcriptIndex: 1,
    },
    {
      windowIndex: 0,
      startS: 14.2,
      endS: null,
      speaker: "Alex Rivera",
      type: "hesitation",
      probability: "high",
      rationale:
        "There are noticeable pauses before key phrases and the speech is fragmented with restarts ('so, so, I mean...'). The delivery is slow and tentative, with rising intonation that turns a statement into something closer to a question.",
      transcriptIndex: 1,
    },
    {
      windowIndex: 0,
      startS: 14.2,
      endS: null,
      speaker: "Alex Rivera",
      type: "stress",
      probability: "medium",
      rationale:
        "A slight tightening around the jaw and a quick downward glance suggest discomfort under the direct pressure of the question.",
      transcriptIndex: 1,
    },
    {
      windowIndex: 1,
      startS: 45.7,
      endS: null,
      speaker: "Alex Rivera",
      type: "confidence",
      probability: "high",
      rationale:
        "After the follow-up, the speaker resets his posture, re-establishes steady eye contact, and delivers a clear, structured answer without filler. His voice is firmer and the pace is even, signaling regained composure and ownership.",
      transcriptIndex: 3,
    },
    {
      windowIndex: 1,
      startS: 45.7,
      endS: null,
      speaker: "Alex Rivera",
      type: "agreement",
      probability: "medium",
      rationale:
        "He nods while acknowledging the concern ('Right. Okay.'), aligning with his boss's need for a concrete answer before delivering it.",
      transcriptIndex: 3,
    },
  ],
  engagement: [
    { state: "engaged", startS: 0, endS: 34.0 },
    { state: "neutral", startS: 34.0, endS: 45.0 },
    { state: "engaged", startS: 45.0, endS: null },
  ],
  conversationQuality: {
    cqi: 54,
    dimensions: { clarity: 48, authority: 52, energy: 55, rapport: 60, learning: 55 },
  },
  summary: {
    headline:
      "You opened with visible uncertainty and hesitation — then found your footing and sounded genuinely confident",
    cqi: 54,
    conversationContext:
      "Jordan closed a status meeting by putting you on the spot about whether the product would ship on time, given the team is a month behind and burning runway. He pressed twice, needing a concrete answer to bring to the board on Friday. This report is about how you came across in that moment — the behavioral signals in your delivery, not the content of your answer.",
    keyMoments: [
      {
        startS: 45.7,
        endS: 68.9,
        label: "Confidence signal returns",
        signalType: "confidence",
        quote:
          "The honest answer is the original date is at risk by about one week. The integration is the only real blocker, and it's already in review — I'll have a confirmed date for you by end of day tomorrow.",
        insight:
          "This is your strongest stretch, and it shows up as high-probability confidence. The evidence is all in your delivery: you reset your posture, re-established steady eye contact, dropped the filler words, and your voice firmed up to an even pace. Same person, same facts as 30 seconds earlier — but this time you sounded like you owned the answer.",
      },
      {
        startS: 45.7,
        endS: 68.9,
        label: "Alignment cue before answering",
        signalType: "agreement",
        quote: "Right. Okay.",
        insight:
          "A nod and a quick 'Right. Okay.' before you answered registered as agreement (medium probability). That small affiliative cue told Jordan you'd taken in what he needed, so your firmer answer landed as responsive rather than defensive.",
      },
    ],
    dips: [
      {
        startS: 14.2,
        endS: 33.6,
        label: "Uncertainty signal on the opening answer",
        signalType: "uncertainty",
        quote:
          "Yeah, so, I mean... I think we can probably make it work... I'd have to double-check with the team, but I believe we should be more or less on track if nothing else comes up.",
        insight:
          "This came through as high-probability uncertainty — driven by hedging language ('probably,' 'more or less'), repeated gaze breaks from the camera, and eyebrows raised in a questioning way. Put together, you looked unsure of your own answer, which is what prompted Jordan to push again.",
      },
      {
        startS: 14.2,
        endS: 33.6,
        label: "Hesitation signal in the delivery",
        signalType: "hesitation",
        quote:
          "Yeah, so, I mean... the integration took longer than we expected, and, um...",
        insight:
          "Right alongside the uncertainty, there was a clear hesitation read: the pauses before key phrases, the restarts ('so, so, I mean…'), and rising intonation that turned statements into near-questions. These are delivery cues, not content — they're what made the first few seconds sound tentative.",
      },
    ],
    strengths: [
      "Your standout strength is recovery: within a single exchange you went from reading as uncertain and hesitant to a clear, high-probability confidence read.",
      "When you're confident, your delivery is strong — steady eye contact, an even pace, and filler-free speech are what carried that read.",
      "You use affiliative cues well — a nod and a brief acknowledgement registered as agreement, which kept a tense moment collaborative.",
    ],
    watchOuts: [
      "Under pressure, your opening seconds leak uncertainty — hedging words plus gaze breaks — before your actual point arrives.",
      "Hesitation cues (filler words, restarts, rising intonation) cluster at the start of high-stakes answers, exactly where they most undercut how steady you seem.",
      "There was a flash of stress on the first answer — a jaw tighten and a quick downward glance — a tell worth catching in yourself when you're put on the spot.",
    ],
    coaching: [
      "The hesitation read came from filler words and restarts in your opening — take a one-beat pause before answering a tough question so your first sentence lands cleanly instead of trailing into 'um, I mean.'",
      "The uncertainty came through partly from broken eye contact and a questioning brow — hold the camera and let your intonation fall at the end of sentences so statements read as statements, not as questions.",
      "You already showed the confident delivery later in the call — the goal is to bring that same steady posture and even pace to your first answer, not just your recovery.",
      "Watch for that stress tell (jaw tension, downward glance) early; noticing it in the moment is your cue to slow down and reset your posture before speaking.",
    ],
    narrative:
      "This report is about how you came across, not what you argued — and your delivery tells a clear two-act story. In your first answer, you read as uncertain and hesitant: hedging language, filler words, gaze breaks, restarts, and rising intonation. The substance was fine, but every cue in your delivery said you weren't sure of your own answer, which is exactly why Jordan pushed a second time. A flash of stress — a jaw tighten and a quick glance down — confirmed the pressure was getting to you.\n\nThe encouraging half is the recovery. On the second pass, everything flipped: you came through as genuinely confident, on the back of restored eye contact, an even pace, and filler-free delivery, with a brief agreement cue as you acknowledged the concern. The takeaway is simple — your composed delivery is already in your range; the work is bringing it to the first answer. Slow down, hold eye contact, and cut the openers ('um,' 'I mean') that made the start sound tentative.",
  },
};

/**
 * Second synthetic analysis for the other demo participant, Jordan Blake
 * — the one applying pressure. Lets the demo's speaker switcher show
 * a fully different behavioral read without the stream-proxy or a video.
 */
const DEMO_JORDAN_RESULT: Omit<JobResult, "sessionId"> = {
  durationS: 96.0,
  focalSpeaker: "Jordan Blake",
  participants: DEMO_PARTICIPANTS,
  transcript: DEMO_TRANSCRIPT,
  signals: [
    {
      windowIndex: 0,
      startS: 2.1,
      endS: null,
      speaker: "Jordan Blake",
      type: "confidence",
      probability: "high",
      rationale:
        "The speaker holds steady, level eye contact and uses a calm, even pace while framing a difficult question. His posture is open and his tone is matter-of-fact rather than aggressive, projecting authority without hostility.",
      transcriptIndex: 0,
    },
    {
      windowIndex: 0,
      startS: 2.1,
      endS: null,
      speaker: "Jordan Blake",
      type: "engagement",
      probability: "high",
      rationale:
        "He references specifics ('the numbers you presented last week', 'a full month behind') and leans in slightly, showing he is closely tracking the details rather than asking a generic question.",
      transcriptIndex: 0,
    },
    {
      windowIndex: 1,
      startS: 34.9,
      endS: null,
      speaker: "Jordan Blake",
      type: "skepticism",
      probability: "high",
      rationale:
        "He repeats the vague phrase back ('\"More or less\" doesn't really tell me much') with a flat tone and a slight head tilt, signaling he is not satisfied with the hedged answer and is pressing for certainty.",
      transcriptIndex: 2,
    },
    {
      windowIndex: 1,
      startS: 34.9,
      endS: null,
      speaker: "Jordan Blake",
      type: "stress",
      probability: "medium",
      rationale:
        "A brief brow furrow and a quicker cadence on the second ask suggest real pressure behind the question — he needs something concrete to take to the board.",
      transcriptIndex: 2,
    },
  ],
  engagement: [
    { state: "engaged", startS: 0, endS: 34.0 },
    { state: "engaged", startS: 34.0, endS: null },
  ],
  conversationQuality: {
    cqi: 72,
    dimensions: { clarity: 80, authority: 78, energy: 62, rapport: 58, learning: 65 },
  },
  summary: {
    headline:
      "You pressed with steady confidence and real engagement — with just a flicker of stress on the second ask",
    cqi: 72,
    conversationContext:
      "You closed a status meeting by pressing Alex on whether the product would ship on time, with the team a month behind and runway burning. You needed a concrete answer to bring to the board on Friday. This report is about how you came across — the behavioral signals in your delivery — not the substance of your questions.",
    keyMoments: [
      {
        startS: 2.1,
        endS: 12.8,
        label: "Confidence + engagement on the opening",
        signalType: "confidence",
        quote:
          "So just tell me straight: are we actually going to ship this on time, or not?",
        insight:
          "You came through as both confident and engaged here. The evidence is in your delivery: level, steady eye contact, an even unhurried pace, open posture, and a slight lean-in as you referenced specifics. You framed a hard question with authority but no hostility — and it showed.",
      },
      {
        startS: 34.9,
        endS: 44.2,
        label: "Skepticism signal holds the line",
        signalType: "skepticism",
        quote: '"More or less" doesn\'t really tell me much, Alex.',
        insight:
          "This read as clear skepticism — your flat tone and slight head tilt as you repeated the hedge back. It was constructive, not combative: that controlled skepticism is what moved Alex off 'more or less' and into a firm, dated answer.",
      },
    ],
    dips: [
      {
        startS: 34.9,
        endS: 44.2,
        label: "Stress signal on the second ask",
        signalType: "stress",
        quote: "I need to know what to tell the board on Friday.",
        insight:
          "A flash of stress showed up on the re-ask — a brief brow furrow and a quicker cadence. It's subtle, but worth catching: sustained, a faster tempo and brow tension start reading as impatience rather than the calm focus you opened with.",
      },
    ],
    strengths: [
      "Your dominant reads are confidence and engagement — level eye contact, even pacing, and an open, attentive posture throughout.",
      "That engagement came from how closely you tracked specifics (the numbers, the timeline), reinforced by a slight lean-in.",
      "Even your skepticism stayed composed: a flat, controlled tone rather than a raised or hostile one, which is what kept the pressure productive.",
    ],
    watchOuts: [
      "A flash of stress — quicker cadence and brow tension — showed on your second push; left unchecked, that can tip from focus into impatience.",
      "Your skepticism landed well; pair it with steady, level delivery so it keeps reading as a request for clarity rather than a challenge.",
    ],
    coaching: [
      "You read as engaged because your delivery showed you were tracking specifics — keep that lean-in and concrete framing; it comes across as genuine attentiveness.",
      "The stress came purely from speeding up on the second ask — consciously hold the even pace from your opening, and the same words will keep reading as calm authority.",
      "Your steady eye contact and level tone are a real asset under pressure — they're exactly what made your skepticism land as direction rather than friction.",
    ],
    narrative:
      "This report is about how you came across, and you came across strong. From the opening, you read as confident and engaged — level eye contact, an even pace, open posture, and a lean-in toward the specifics you raised. That delivery set the expectation that a vague answer wouldn't pass, without tipping into hostility.\n\nWhen the first answer hedged, clear skepticism carried your follow-up: a flat tone and slight head tilt as you named the hedge back. That controlled skepticism is what produced a concrete answer. The one thing to watch is a flash of stress on that second ask — a brow furrow and quicker cadence. It was mild, but it's the kind of delivery tell that, sustained, reads as impatience. Hold the level pace you opened with and your pressure will keep landing as focus.",
  },
};

/**
 * Third synthetic analysis: Sam Chen, the CTO who steps in to back Alex
 * up and defend the engineering timeline. A strong, positive behavioral read —
 * useful for showing the demo's speaker switcher across a confident contributor.
 */
const DEMO_SAM_RESULT: Omit<JobResult, "sessionId"> = {
  durationS: 96.0,
  focalSpeaker: "Sam Chen",
  participants: DEMO_PARTICIPANTS,
  transcript: DEMO_TRANSCRIPT,
  signals: [
    {
      windowIndex: 2,
      startS: 70.1,
      endS: null,
      speaker: "Sam Chen",
      type: "confidence",
      probability: "high",
      rationale:
        "She enters unprompted with a steady, level tone and direct eye contact, framing the delay as a known, contained issue. Her pace is even and her phrasing is declarative ('We've already got a workaround in staging'), projecting ownership of the technical picture.",
      transcriptIndex: 4,
    },
    {
      windowIndex: 2,
      startS: 70.1,
      endS: null,
      speaker: "Sam Chen",
      type: "engagement",
      probability: "high",
      rationale:
        "She tracks the specifics closely — distinguishing a vendor-side cause from internal slip and separating worst case from expected case — leaning in as she adds detail, showing she is fully in the problem rather than observing it.",
      transcriptIndex: 4,
    },
    {
      windowIndex: 2,
      startS: 70.1,
      endS: null,
      speaker: "Sam Chen",
      type: "agreement",
      probability: "medium",
      rationale:
        "Her opening ('Just to back Alex up') and aligned framing visibly reinforce Alex's answer, signaling a united front to the room rather than a competing account.",
      transcriptIndex: 4,
    },
  ],
  engagement: [
    { state: "neutral", startS: 0, endS: 70.0 },
    { state: "engaged", startS: 70.0, endS: null },
  ],
  conversationQuality: {
    cqi: 81,
    dimensions: { clarity: 86, authority: 84, energy: 70, rapport: 74, learning: 68 },
  },
  summary: {
    headline:
      "You stepped in with calm authority and backed the team without a trace of defensiveness",
    cqi: 81,
    conversationContext:
      "After Alex gave a firm date, you stepped in unprompted to defend the engineering timeline and reframe the delay as a contained, vendor-side issue. This report is about how you came across in that moment — the behavioral signals in your delivery, not the technical detail of your point.",
    keyMoments: [
      {
        startS: 70.1,
        endS: 82.4,
        label: "Confidence + engagement backing the team",
        signalType: "confidence",
        quote:
          "We've already got a workaround in staging, so a one-week slip is the realistic worst case, not the expected one. I'm confident we hold that line.",
        insight:
          "You came through as confident and fully engaged here. The evidence is in the delivery: a steady level tone, direct eye contact, an even pace, and declarative phrasing. Stepping in unprompted to draw the line between worst case and expected case is exactly what made the room treat your read as authoritative.",
      },
      {
        startS: 70.1,
        endS: 82.4,
        label: "Agreement that reinforced Alex",
        signalType: "agreement",
        quote: "Just to back Alex up — the integration delay was a vendor issue on their side, not ours.",
        insight:
          "Opening with 'just to back Alex up' read as a clear agreement cue. Rather than competing with his answer, your delivery presented a united front — which is what made the combined message land as settled rather than contested.",
      },
    ],
    dips: [],
    strengths: [
      "Your dominant reads are confidence and engagement — a level tone, direct eye contact, and an even pace as you took ownership of the technical picture.",
      "You closely tracked specifics (vendor-side cause, worst case vs. expected case), and your delivery showed it with a slight lean-in.",
      "An agreement cue ('back Alex up') meant you reinforced a colleague rather than competing — presenting a united front to the room.",
    ],
    watchOuts: [
      "Your read here is strong with no dips; the only thing to watch is that you stayed largely neutral until late — entering earlier could let that authority shape the conversation sooner.",
    ],
    coaching: [
      "Your confident, declarative delivery is a real asset — the level tone and even pace are exactly what made a contained-risk framing believable; keep leading with that structure.",
      "You read as engaged because your delivery separated worst case from expected case — keep quantifying like that; it's a cue that comes across as command of the detail.",
      "You waited until after Alex before weighing in. When you hold the technical answer, entering a beat earlier lets your steady delivery anchor the room before uncertainty sets in.",
    ],
    narrative:
      "This report is about how you came across, and you came across with calm authority. When you stepped in, you read as confident and engaged — a level tone, direct eye contact, an even pace, and a lean-in as you separated the vendor-side cause from internal slip. Opening with 'back Alex up' registered as an agreement cue, so your point reinforced his rather than competing with it, and the combined message landed as settled.\n\nThere were no dips to flag. The one thing to consider is timing: you stayed neutral through most of the call and only engaged near the end. Your delivery is steady enough to anchor the room — bringing it in a beat earlier would let that authority shape the discussion before doubt has a chance to build.",
  },
};

/**
 * Fourth synthetic analysis: Taylor Morgan, the Head of Product who lands the
 * call by summarizing the board message. A measured, mostly-positive read with
 * a small hesitation tell on the commitment — gives the switcher a contrasting,
 * subtler profile.
 */
const DEMO_TAYLOR_RESULT: Omit<JobResult, "sessionId"> = {
  durationS: 96.0,
  focalSpeaker: "Taylor Morgan",
  participants: DEMO_PARTICIPANTS,
  transcript: DEMO_TRANSCRIPT,
  signals: [
    {
      windowIndex: 2,
      startS: 83.0,
      endS: null,
      speaker: "Taylor Morgan",
      type: "agreement",
      probability: "high",
      rationale:
        "He synthesizes the room's position into a single shared message ('one-week risk, confirmed date in 48 hours, mitigation already in place'), nodding as he restates it. The move aligns everyone and signals consensus before closing.",
      transcriptIndex: 5,
    },
    {
      windowIndex: 2,
      startS: 83.0,
      endS: null,
      speaker: "Taylor Morgan",
      type: "hesitation",
      probability: "medium",
      rationale:
        "On the commitment itself there is a brief restart and filler ('I think... yeah, I think that's something we can stand behind'), with a short pause before 'stand behind', suggesting a flicker of caution as he takes ownership of the message.",
      transcriptIndex: 5,
    },
    {
      windowIndex: 2,
      startS: 83.0,
      endS: null,
      speaker: "Taylor Morgan",
      type: "confidence",
      probability: "medium",
      rationale:
        "The decisive close ('Let's lock that and move on') is delivered with a firmer, even tone and a clear downward intonation, recovering from the brief hesitation and giving the room a clean point to act on.",
      transcriptIndex: 5,
    },
  ],
  engagement: [
    { state: "engaged", startS: 0, endS: 70.0 },
    { state: "neutral", startS: 70.0, endS: 83.0 },
    { state: "engaged", startS: 83.0, endS: null },
  ],
  conversationQuality: {
    cqi: 69,
    dimensions: { clarity: 74, authority: 66, energy: 60, rapport: 76, learning: 62 },
  },
  summary: {
    headline:
      "You aligned the room and closed cleanly — with a small hesitation right as you took ownership",
    cqi: 69,
    conversationContext:
      "You closed the meeting by summarizing the agreed message for the board and calling for it to be locked. This report is about how you came across as you brought the room to a decision — the behavioral signals in your delivery, not the content of the summary.",
    keyMoments: [
      {
        startS: 83.0,
        endS: 94.6,
        label: "Agreement that aligned the room",
        signalType: "agreement",
        quote:
          "So the message for the board is: one-week risk, confirmed date in 48 hours, mitigation already in place.",
        insight:
          "This read as high-probability agreement. By restating everyone's position as one shared message and nodding as you did it, your delivery pulled the room to consensus — the kind of cue that makes a close feel collective rather than imposed.",
      },
      {
        startS: 83.0,
        endS: 94.6,
        label: "Confident, decisive close",
        signalType: "confidence",
        quote: "Let's lock that and move on.",
        insight:
          "Your close came through as confident — a firmer, even tone and a clear downward intonation. After the brief hesitation a moment earlier, this is where your delivery firmed up and gave the room a clean point to act on.",
      },
    ],
    dips: [
      {
        startS: 83.0,
        endS: 94.6,
        label: "Hesitation as you took ownership",
        signalType: "hesitation",
        quote: "I think... yeah, I think that's something we can stand behind.",
        insight:
          "Right on the commitment there was a hesitation read — a restart and filler ('I think... yeah, I think'), with a short pause before 'stand behind.' It's the one spot where your delivery softened, just as you were taking ownership of the message.",
      },
    ],
    strengths: [
      "Your standout read is agreement — you synthesized the room into one shared message and nodded as you restated it, which is what made the close feel collective.",
      "You recovered well: the decisive 'Let's lock that' came through as confidence, with a firmer tone and a clean downward intonation.",
      "Strong rapport throughout — your delivery kept the close collaborative rather than top-down.",
    ],
    watchOuts: [
      "A hesitation cue (restart and filler, a short pause) landed right on the commitment — exactly the moment where you most want to sound settled.",
      "The softening was brief, but it sat on 'we can stand behind' — the phrase that needed the most conviction.",
    ],
    coaching: [
      "The hesitation came from the 'I think... yeah, I think' restart — state the commitment once and let it land, so the ownership reads as settled rather than tentative.",
      "Your agreement cue (restating the shared message, nodding) is a real strength for closing — keep using it to pull consensus before you call the decision.",
      "You already firmed up on 'Let's lock that' — bring that same even, downward-intonation delivery to the commitment line itself, not just the sign-off.",
    ],
    narrative:
      "This report is about how you came across as you closed the room, and the read is mostly strong. Your dominant cue was agreement: you restated everyone's position as a single shared message and nodded as you did it, which made the close feel collective rather than imposed. Rapport stayed high throughout.\n\nThe one thing to flag is a brief hesitation — a restart and filler ('I think... yeah, I think'), with a short pause right before 'stand behind.' It landed on the commitment itself, the moment that most needs to sound settled. You recovered immediately: 'Let's lock that and move on' came through as confident, with a firmer tone and a clean downward intonation. Bring that same delivery to the ownership line and your close will read as fully settled from the first word.",
  },
};

/**
 * Synthetic demo analyses keyed by participant id. The speaker switcher in a
 * demo report restores from this map instead of calling the stream-proxy
 * (there is no backing video for the sample fixture).
 */
export const DEMO_RESULTS_BY_PARTICIPANT: Record<
  string,
  Omit<JobResult, "sessionId">
> = {
  "300": DEMO_SAMPLE_RESULT,
  "400": DEMO_JORDAN_RESULT,
  "500": DEMO_SAM_RESULT,
  "600": DEMO_TAYLOR_RESULT,
};
