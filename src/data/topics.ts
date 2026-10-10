import type { AiPersonaId, Topic, TopicGroup } from "../types";

export const TOPIC_GROUPS: TopicGroup[] = ["Abstract", "Controversial", "Case-based", "Current affairs India", "Campus"];

export const TOPICS: Topic[] = [
  {
    id: "failure-success", title: "Is failure a better teacher than success?", group: "Abstract", subject: "learning from setbacks",
    arguments: {
      rohan: "A failed first attempt gives sharper feedback than an easy win; a student who misses one interview can rebuild the answer that cost them the next one.",
      ananya: "In a hypothetical batch of 30, roughly ten may need a second attempt to learn what actually works; the lesson is to review patterns, not label people.",
      meera: "One setback should teach a skill, not become a permanent label on someone's ability.",
      karan: "I once blanked during a class presentation, then practised with a friend; the awkward rehearsal made the next one easier.",
      sana: "Rohan's feedback point and Meera's concern about labels fit together: make failure useful, then give people a fair second chance.",
    }, moderatorRedirect: "When does a setback stop being useful feedback and become a barrier to trying again?", moderatorInvite: "Meera, what would make a second chance feel fair?", counterAngle: "the cost of repeated failure"
  },
  {
    id: "competition", title: "Does competition bring out the best in people?", group: "Abstract", subject: "competition",
    arguments: {
      rohan: "A close contest can raise effort fast; two teams preparing for the same case competition often sharpen each other's research.",
      ananya: "In a mock group of ten, roughly half may improve when goals are visible, but the gain only matters if everyone gets the same starting resources.",
      meera: "Competition can motivate, but nobody should feel their worth depends on a rank.",
      karan: "My cricket group practised harder before an inter-college match, then stayed friends after; the shared routine mattered as much as winning.",
      sana: "Rohan's case-contest example shows energy, while Meera's point reminds us to separate a result from a person's value.",
    }, moderatorRedirect: "Could a team leaderboard reward improvement instead of only the top score?", moderatorInvite: "Meera, where should the line between motivation and pressure sit?", counterAngle: "the effect on people outside the top rank"
  },
  {
    id: "ambition-talent", title: "Should ambition matter more than talent?", group: "Abstract", subject: "ambition and talent",
    arguments: {
      rohan: "Practice turns potential into output; a talented coder who never ships a project loses ground to a steady teammate who keeps building.",
      ananya: "Roughly, a portfolio with several finished projects can tell a recruiter more than one high test score; that suggests effort needs visible proof.",
      meera: "Talent opens a door, but people deserve support when time or money limits their practice.",
      karan: "A friend learned design after evening shifts, one small portfolio page at a time; consistency made the skill visible.",
      sana: "Rohan's finished-project example and Meera's access concern point to the same need: measure growth without ignoring unequal time.",
    }, moderatorRedirect: "How could an interviewer spot potential when two candidates had very different practice time?", moderatorInvite: "Meera, what support would make that comparison fairer?", counterAngle: "unequal time and access to practice"
  },
  {
    id: "work-from-home", title: "Should work from home be a legal right?", group: "Controversial", subject: "remote work",
    arguments: {
      rohan: "A remote option can remove a daily commute; an analyst in Pune can spend that hour finishing a client brief instead of sitting in traffic.",
      ananya: "In a hypothetical team of 20, roughly half may prefer a hybrid week; the useful question is which tasks need a shared room.",
      meera: "A quiet home is not available to everyone, so choice should include a safe, private place to work.",
      karan: "My cousin saves a long bus ride on report days, then comes in for whiteboard reviews; that split keeps the commute point practical.",
      sana: "Rohan's commute example and Meera's home-space concern both matter; a choice of workspace can bridge the two.",
    }, moderatorRedirect: "What would a fair alternative look like for workers whose homes are not suitable for work?", moderatorInvite: "Meera, how should employers protect that choice?", counterAngle: "access to a quiet home workspace"
  },
  {
    id: "social-media", title: "Is social media doing more harm than good?", group: "Controversial", subject: "social media",
    arguments: {
      rohan: "A local flood update can reach volunteers before a noticeboard does; speed is a real benefit when the post is checked.",
      ananya: "Roughly, one forwarded rumour can reach several class groups in minutes; that makes a pause-and-check habit more valuable than another share button.",
      meera: "A student should not have to trade privacy for belonging in a class group.",
      karan: "I found a lost notebook through a hostel group once; one useful post can make the feed feel like a neighbourhood.",
      sana: "Rohan's fast alert and Meera's privacy point can coexist if groups make verification and consent normal.",
    }, moderatorRedirect: "Who should act first when an unverified campus post starts spreading?", moderatorInvite: "Meera, what privacy rule would feel reasonable?", counterAngle: "verification before a post spreads"
  },
  {
    id: "mandatory-attendance", title: "Should college attendance be mandatory?", group: "Controversial", subject: "attendance rules",
    arguments: {
      rohan: "A lab partner cannot practise alone; attendance matters most in sessions where a student handles equipment or gives peer feedback.",
      ananya: "In a hypothetical class of 40, roughly ten may miss a week for health or family duties; the policy should track learning, not just a seat.",
      meera: "A student caring for family should not lose marks for explaining an absence.",
      karan: "My batch understood circuits only after building them in the lab; the hands-on session was different from reading the slides later.",
      sana: "Rohan's lab example supports a clear rule for practical sessions, while Meera's point calls for a humane exception process.",
    }, moderatorRedirect: "Which classes need presence, and what evidence could replace attendance elsewhere?", moderatorInvite: "Meera, what would a humane exception process include?", counterAngle: "care and health-related absences"
  },
  {
    id: "campus-cafe", title: "Campus café expansion: where should the budget go?", group: "Case-based", subject: "the campus café plan",
    caseBrief: ["The student café has a fixed budget for one upgrade this term.", "Queues are long at lunch, but many students ask for cheaper options.", "The committee must choose equipment, seating, or a subsidy."],
    arguments: {
      rohan: "A second serving counter could clear the lunch queue; a ten-minute break should not disappear before students reach the register.",
      ananya: "Roughly, a short queue count across three lunch periods would show whether speed or seating is the bigger bottleneck.",
      meera: "Keep one affordable meal available so students are not priced out of the only nearby option.",
      karan: "My lab group eats between lectures, so a grab-and-go shelf could help without turning the whole room into a queue.",
      sana: "Rohan's counter idea fixes time, while Meera's price point protects access; a small pilot can compare both.",
    }, moderatorRedirect: "What could the committee measure in a one-week pilot before spending the budget?", moderatorInvite: "Meera, which students might the current menu leave out?", counterAngle: "affordability alongside shorter queues"
  },
  {
    id: "shrinking-budget", title: "The shrinking launch budget", group: "Case-based", subject: "the launch plan",
    caseBrief: ["A student team has four weeks to launch a campus event app.", "A sponsor has cut the budget by a third, while registrations are rising.", "The team can reduce features, seek partners, or delay launch."],
    arguments: {
      rohan: "Ship the registration flow first; a working sign-up page is more useful than three half-built extras on event day.",
      ananya: "Roughly, a small test with one club can reveal whether the missing feature is essential before the team cuts it everywhere.",
      meera: "Do not remove accessibility checks just to meet a deadline.",
      karan: "Our fest team borrowed a projector from another club once; a clear partner request can save a useful feature.",
      sana: "Rohan's smaller launch and Meera's accessibility guardrail work together if the team sets a minimum quality bar.",
    }, moderatorRedirect: "Which feature would you protect even if the launch date cannot move?", moderatorInvite: "Meera, what should the team never cut?", counterAngle: "quality and accessibility under time pressure"
  },
  {
    id: "delayed-app", title: "A delayed student app launch", group: "Case-based", subject: "the student app launch",
    caseBrief: ["A campus team promised an app before placement week.", "Testing found a privacy bug in the résumé upload flow.", "The college wants a launch date, but students need a reliable tool."],
    arguments: {
      rohan: "Pause résumé uploads until the bug is fixed; a delayed feature beats exposing a student's private document.",
      ananya: "A short retest with a small volunteer group can show whether the fix works across devices before the placement office announces a date.",
      meera: "Students should be told plainly what information is stored and who can open it.",
      karan: "My club once caught a form error by asking two students to try an older phone; one real device found what the demo missed.",
      sana: "Rohan's pause and Meera's clear notice are both part of trust; the launch note should explain the test result.",
    }, moderatorRedirect: "Who should verify the fix before the placement office shares a new date?", moderatorInvite: "Meera, what information would you want before uploading a résumé?", counterAngle: "privacy and transparent communication"
  },
  {
    id: "upi-world", title: "Is UPI a model for the world?", group: "Current affairs India", subject: "UPI payments",
    arguments: {
      rohan: "A tea stall can accept a small payment without a card machine; that simple counter example explains why UPI travels well.",
      ananya: "Roughly, one QR code can serve a very small shop without extra checkout hardware; the lesson is to keep entry costs low.",
      meera: "A cash option still matters when a phone is lost, shared, or out of battery.",
      karan: "At a college fest, the food line moved faster once vendors accepted scans; a backup token helped when network bars dipped.",
      sana: "Rohan's low-cost shop example shows access, while Meera's cash fallback keeps that access inclusive.",
    }, moderatorRedirect: "What support is needed for a seller or customer with no reliable data signal?", moderatorInvite: "Meera, what fallback should remain available?", counterAngle: "reliability when devices or networks fail"
  },
  {
    id: "manufacturing-services", title: "Should India focus more on manufacturing or services?", group: "Current affairs India", subject: "jobs in manufacturing and services",
    arguments: {
      rohan: "A local electronics plant can create jobs beyond engineers, from repair to logistics; that reach makes manufacturing worth building.",
      ananya: "Roughly, a district needs both skilled services and steady production roles; one sector can support demand for the other.",
      meera: "New factories should not ask workers to trade safety for a job.",
      karan: "My uncle's repair shop gets more work when nearby offices and factories both grow; the supply chain links the choices.",
      sana: "Rohan's wider job ladder and Meera's safety condition suggest growth should be judged by the quality of jobs too.",
    }, moderatorRedirect: "What local skill would help a district connect production with digital services?", moderatorInvite: "Meera, what should a worker be able to expect from a new job?", counterAngle: "job quality and worker safety"
  },
  {
    id: "cities-cars", title: "Can India's cities grow without cars?", group: "Current affairs India", subject: "urban transport",
    arguments: {
      rohan: "A reliable bus lane can move more office commuters through the same road than another row of private cars.",
      ananya: "A simple count at a busy junction can compare bus occupancy with car occupancy before a city spends on another flyover.",
      meera: "A late-shift worker needs a safe route home, not just a daytime bus map.",
      karan: "My commute got easier when a feeder bus met the metro; the last kilometre was the missing piece.",
      sana: "Rohan's bus capacity and Meera's night-safety point both belong in a transport plan.",
    }, moderatorRedirect: "Which last-mile connection would make public transport workable after a late shift?", moderatorInvite: "Meera, what would make that route feel safe?", counterAngle: "late-hour safety and last-mile access"
  },
  {
    id: "attendance-grades", title: "Should attendance affect grades?", group: "Campus", subject: "attendance marks",
    arguments: {
      rohan: "Give marks for work done in a workshop, not for occupying a chair; a student who completes the lab task has shown the skill.",
      ananya: "A short comparison of attendance and project outcomes can show whether presence predicts learning in a particular course.",
      meera: "A student with a health flare-up should have a route to make up the learning without shame.",
      karan: "I missed a lecture once for a family appointment, then caught up through a friend's notes; one class did not define my effort.",
      sana: "Rohan's demonstrated-work idea and Meera's make-up path can reward learning without making absence the whole story.",
    }, moderatorRedirect: "How could a course verify participation without penalising unavoidable absence?", moderatorInvite: "Meera, what would a fair make-up option look like?", counterAngle: "learning evidence and unavoidable absence"
  },
  {
    id: "placement-fairness", title: "Is campus recruitment fair to all students?", group: "Campus", subject: "campus recruitment",
    arguments: {
      rohan: "Publish the interview rubric before the drive; candidates should know whether the role values problem-solving, communication, or both.",
      ananya: "If roughly the same short task is given to every candidate, recruiters can compare skills more fairly than polished résumés alone.",
      meera: "A student should not be excluded because a costly course was missing from their résumé.",
      karan: "My roommate practised interviews in the library with peers; a free practice room can narrow one avoidable gap.",
      sana: "Rohan's clear rubric and Meera's access point both matter; a consistent task makes the comparison easier to trust.",
    }, moderatorRedirect: "Which part of the selection process could the placement cell make transparent first?", moderatorInvite: "Meera, what barrier is easiest to miss from the panel's side?", counterAngle: "access to preparation and clear evaluation"
  },
  {
    id: "paid-internships", title: "Should internships be paid by law?", group: "Campus", subject: "paid internships",
    arguments: {
      rohan: "A student doing real client work should receive pay; otherwise only people with family support can afford the experience.",
      ananya: "Even a modest stipend can cover travel and meals; that changes who can accept a short placement outside their city.",
      meera: "Learning should not require someone to work unpaid when they need income.",
      karan: "I took a bus across town for an unpaid project once; transport alone made the opportunity hard to continue.",
      sana: "Rohan's work-for-pay point and Karan's commute example show why the stipend design matters, not only the job title.",
    }, moderatorRedirect: "Could a small organisation offer a shorter paid placement instead of an unpaid full term?", moderatorInvite: "Meera, what would make the opportunity accessible?", counterAngle: "small employers and affordable access"
  },
  {
    id: "coding-focus", title: "Are campus placements too focused on coding?", group: "Campus", subject: "placement skills",
    arguments: {
      rohan: "A product role also needs clear writing and user interviews; a coding test alone cannot show how someone solves the whole problem.",
      ananya: "A hiring rubric with a short task and a discussion can reveal more than one timed coding round.",
      meera: "Students should be able to show strengths that are not measured by speed typing.",
      karan: "My friend in design helped a coding team spot a confusing screen; the product improved because both skills were in the room.",
      sana: "Rohan's broader task and Meera's point about different strengths support a hiring day with more than one way to contribute.",
    }, moderatorRedirect: "What second task could sit beside a coding round for a product team?", moderatorInvite: "Meera, how could students show strengths a timed test misses?", counterAngle: "skills beyond timed coding tests"
  },
];

export const findTopic = (id: string): Topic => TOPICS.find((topic) => topic.id === id) ?? TOPICS[3];

export function makeCustomTopic(title: string): Topic {
  const cleaned = title.trim().replace(/\s+/g, " ");
  const plain = cleaned.replace(/[?!.]+$/g, "");
  const isDogCatComparison = /^are\s+dogs?\s+better\s+than\s+cats?$/i.test(plain);
  const normalizedTitle = isDogCatComparison ? "Are dogs better pets than cats?" : `${plain.charAt(0).toUpperCase()}${plain.slice(1)}?`;
  const subject = isDogCatComparison ? "dogs and cats as pets" : plain.slice(0, 52) || "your question";
  const argumentsByPersona = isDogCatComparison ? {
    rohan: "Dogs suit active households; daily walks can turn pet care into shared exercise.",
    ananya: "Compare time, space, allergies, and routine before ranking dogs and cats for a home.",
    meera: "The better pet is the animal whose needs the owner can meet every day.",
    karan: "Cats may fit a small flat, while energetic dogs often need outdoor time.",
    sana: "Rohan's activity point and Karan's space point show that the right fit depends on the home.",
  } : {
    rohan: `Take a clear position on ${subject.toLowerCase()}, then test it with one practical example.`,
    ananya: `Compare two real situations to see what ${subject.toLowerCase()} changes for people.`,
    meera: "The fairest answer should include people who have the least choice in this situation.",
    karan: `A familiar daily routine can show how ${subject.toLowerCase()} affects someone's day.`,
    sana: `A clear example and a fairness check can help the group weigh ${subject.toLowerCase()} together.`,
  } satisfies Record<AiPersonaId, string>;
  return {
    id: `custom-${Date.now()}`,
    title: normalizedTitle,
    group: "Campus" as const,
    subject,
    arguments: argumentsByPersona,
    moderatorRedirect: isDogCatComparison
      ? "When choosing between dogs and cats, what matters most: time, space, or daily care?"
      : "Which people would feel the effect of this choice first?",
    moderatorInvite: isDogCatComparison
      ? "Meera, what should an owner consider before bringing either animal home?"
      : "Meera, what perspective should the group hear before deciding?",
    counterAngle: isDogCatComparison ? "matching each animal's needs to the household" : "who has least choice",
  };
}
