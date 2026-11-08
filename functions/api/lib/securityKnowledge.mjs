// What Orb knows about running a UK security company: licensing, right to work, the law on the door, incidents and
// welfare. Scotland first (the company works in Edinburgh and Glasgow), with England and Wales differences noted.
// General guidance for managers, not legal advice: Orb says so when a case turns on the law.

export const KNOWLEDGE_NOTE = 'General guidance, not legal advice. For a specific case, check with the SIA, Police Scotland, the licensing board or a solicitor.';

export const TOPICS = [
  {
    id: 'sia', title: 'SIA licences', tags: 'sia licence licensing door supervisor security guard cctv close protection key holding front line badge renewal expiry register conditions unlicensed offence acs approved contractor',
    body: `The Security Industry Authority (SIA) licenses private security across the UK, Scotland included. Anyone doing licensable work needs the right licence for that work, and so does a director or manager who supplies them.
- Front-line licences: Door Supervisor, Security Guarding, CCTV (Public Space Surveillance), Close Protection, Cash and Valuables in Transit, Key Holding. A Door Supervisor licence also covers security guarding. Which licences a role accepts is set in Settings, Workforce rules (roles), and the rota and compliance checks use that.
- Door supervision means guarding licensed premises (selling alcohol or open to the public late) and deciding who comes in, searching, refusing entry and removing people. In Scotland that needs a Door Supervisor licence, whatever the job is called.
- A licence lasts 3 years. Officers can apply to renew up to 4 months before it expires, and should: a gap means they cannot work. Renewal needs current training, including a valid first aid certificate for door supervisors and security guards.
- Front-line officers must wear the licence where it can be seen while working.
- Working without a licence, or supplying unlicensed staff, is a criminal offence for the officer and for the company: a fine and up to 6 months in prison in the sheriff or magistrates' court, up to 5 years on indictment.
- The SIA's public register shows whether a licence is valid, suspended or revoked. A licence can be suspended at any time (for example after an arrest), so checking the register now and then, not just at expiry, is good practice. Orb can do this on its compliance cards when SIA checks are switched on.
- Officers must tell the SIA about changes such as a new address, name or a conviction.
- The Approved Contractor Scheme (ACS) is the SIA's voluntary quality mark for security companies; many venues and councils ask for it in tenders.`,
  },
  {
    id: 'rtw', title: 'Right to work checks', tags: 'right to work rtw share code evisa passport british irish idsp home office list a list b penalty civil penalty statutory excuse immigration time limited follow up brp',
    body: `Before anyone starts work the company checks they have the right to work in the UK, and keeps the record. Done properly, the check gives a "statutory excuse" against a penalty if the person turns out not to be allowed to work.
- British or Irish citizens: check the original passport (or Irish passport card) in front of them, or use a certified digital identity provider (IDSP). Copy it, date the copy and note the check was made.
- Everyone else now has an eVisa: they give a share code (9 characters, starting W) and date of birth, and the company checks it on GOV.UK ("Check a job applicant's right to work"). Share codes stop working after 90 days. Save the result page. Biometric residence permits stopped being valid at the end of 2024.
- Permission with an end date: check again before it ends. If it lapses, they cannot work until a new check is done.
- Keep the evidence while they work for the company and for 2 years after.
- The civil penalty for each illegal worker is up to £45,000 for a first breach and up to £60,000 for repeat breaches (since February 2024). Knowingly using an illegal worker is a crime.
- The rules were written for employees, but the government is extending them to other working arrangements and venues expect every officer to be checked. Check self-employed officers the same way.
- In the app: the Right to work tile on the profile records the evidence and the check; Check right to work saves a GOV.UK result.`,
  },
  {
    id: 'screening', title: 'Vetting and screening (BS 7858)', tags: 'bs7858 bs 7858 vetting screening references employment history gaps disclosure scotland basic criminal record credit check pvg',
    body: `BS 7858 is the British Standard for screening people in security jobs. ACS-approved companies and many clients expect it.
- It covers identity, right to work, 5 years of employment and education history with references, explanations for gaps, a financial check (credit and county court judgments) and a criminal record check.
- In Scotland the criminal record check is a Basic Disclosure from Disclosure Scotland. Officers working with children or protected adults may need PVG scheme membership instead.
- Screening can be finished after someone starts only within the limits of the standard, and they should be supervised until it is.
- Keep the screening file for the time the standard and data protection allow, and no longer.`,
  },
  {
    id: 'licensing-scotland', title: 'Licensed premises in Scotland', tags: 'licensing scotland act 2005 licensing board premises licence conditions objectives drunk refuse leave challenge 25 age verification id proof of age underage children young persons lso licensing standards officer',
    body: `Pubs, bars and clubs in Scotland are licensed under the Licensing (Scotland) Act 2005 by the local licensing board (City of Edinburgh, Glasgow City and so on). Licensing standards officers check that premises keep to their licence.
- The five licensing objectives: preventing crime and disorder; securing public safety; preventing public nuisance; protecting and improving public health; protecting children and young persons from harm. Door staff help the venue meet them, and their logs are evidence at a licence review.
- A premises licence often sets conditions about door staff: how many, from what time, searching, ID scanners, a refusals log. Each venue's site pack should say what its licence requires.
- Age: every licensed premises in Scotland must have an age verification policy, at least Challenge 25. Acceptable ID is a passport, a photocard driving licence, a PASS-hologram card (including Young Scot) or a military ID card. If in doubt, refuse.
- It is an offence to sell alcohol to someone who is drunk, or to buy it for them. A person who is drunk, violent or disorderly and refuses to leave when asked commits an offence, and the police must help remove them if asked.
- Record refusals and ejections: who, when, why, and what was said.
In England and Wales the Licensing Act 2003 applies instead, with four objectives and Challenge 21 or 25 by the venue's own policy.`,
  },
  {
    id: 'force', title: 'Use of force, ejections and arrest', tags: 'force reasonable proportionate ejection eject remove restraint restrain arrest citizens arrest detain self defence positional asphyxia prone handcuffs police assault',
    body: `Door supervisors have no special powers: in law they are members of the public.
- Any force must be reasonable, necessary and proportionate to what the officer honestly and reasonably believed at the time. Talking someone down always comes first. Unnecessary force is assault, and it can cost the officer their licence.
- Ejecting: the venue can ask anyone to leave. If they refuse, minimal reasonable force can be used to remove them. Stop once they are out; never use force as punishment.
- Restraint: never on the ground face down for longer than it takes; never kneel on the neck, back or chest; keep watching their breathing and colour, and release and get first aid at once if they struggle to breathe (positional asphyxia kills).
- Arrest in Scotland: anyone may arrest a person they see committing a crime, or reasonably believe has just committed one, when it is not practicable to wait for the police and it is needed (for example to stop them escaping or hurting someone). Hand them to Police Scotland as soon as possible and stay with them. In England and Wales it is section 24A of PACE: indictable offences only, with similar conditions.
- Every use of force goes in an incident report the same night: what led up to it, what force, why it was needed, how long, injuries, witnesses, CCTV or bodycam.`,
  },
  {
    id: 'search', title: 'Searching, drugs and weapons', tags: 'search searching bag search consent condition of entry drugs seize seizure weapon knife offensive weapon evidence bag police property amnesty bin',
    body: `- Searches are by consent, usually made a condition of entry. Someone who refuses can be refused entry, but cannot be searched against their will.
- A person should be searched by an officer of the same sex where possible, in view of CCTV or a colleague, and never in private alone. Ask them to empty their own pockets and bags first.
- Drugs found: seize them, put them in a sealed evidence bag, label it (time, place, who found it, from whom), log it and hand it to Police Scotland. Never destroy, return or keep drugs.
- Knives or weapons: keep a safe distance, call 999 if anyone is at risk, and keep the item safe for the police. Carrying an offensive weapon in public is a crime.
- Record every find, and what was done with it, in the venue's log and an incident report.`,
  },
  {
    id: 'welfare', title: 'Vulnerability, spiking and welfare', tags: 'vulnerable vulnerability welfare wave ask for angela spiking spiked drink drugs alone intoxicated young person child safeguarding duty of care women safety',
    body: `- Door staff have a duty of care: a vulnerable person should not be ejected alone into danger. Find their friends, a taxi or a safe place, and get help if needed.
- WAVE (Welfare and Vulnerability Engagement) training teaches spotting vulnerability: heavy intoxication, being separated from friends, someone being targeted. Many licensing boards and Pubwatches expect it.
- Ask for Angela: someone who asks the bar for "Angela" wants help leaving safely. Take them somewhere safe, discreetly, and help them get home or call the police.
- Suspected spiking: keep them with a trusted friend or staff, give first aid and call 999 if they are very unwell, keep the drink if possible, and report it to Police Scotland. Record what was seen.
- Children and young people at risk: get them somewhere safe and call the police. Never leave them alone.`,
  },
  {
    id: 'first-aid', title: 'First aid and emergencies', tags: 'first aid efaw emergency 999 ambulance cpr defibrillator aed unconscious recovery position injury head injury seizure overdose',
    body: `- Door supervisor and security guard training needs a current Emergency First Aid at Work (or higher) certificate. The app tracks first aid certificates on Training.
- 999 for police, ambulance or fire when life, safety or a crime in progress is at stake; 101 for Police Scotland non-emergencies.
- Unconscious and breathing: recovery position, keep checking. Not breathing normally: 999, start CPR and send someone for the defibrillator.
- Head injuries, people who have been restrained, and anyone very drunk need watching: if in doubt, call an ambulance.
- The officer records what they saw and did, and the ambulance or police incident number, in an incident report.
- The Emergency guide in the app has step-by-step help for officers on shift.`,
  },
  {
    id: 'incidents', title: 'Good incident reports and evidence', tags: 'incident report reporting evidence notes notebook cctv bodycam body worn camera police incident number witness statement court preserve retention',
    body: `A good report is written as soon as possible (the same shift), in the officer's own words, and sticks to facts.
- Cover who, what, where (exact spot), when (times), why it started and how it ended; descriptions of the people involved; injuries and first aid; any force used and why; witnesses; the Police Scotland incident number or ambulance reference.
- Say what was seen and heard, not opinions. Quote what people said when it matters.
- CCTV and bodycam: ask the venue to keep the footage straight away, as many systems overwrite after about 28 to 31 days. Note the camera and time.
- Never change a report after it is submitted except through a correction that leaves the original visible. Reports may be used by the police, the licensing board, insurers or a court.
- Orb compares a report with its photos and files and asks the officer about anything that does not match or is missing.`,
  },
  {
    id: 'data', title: 'Data protection, CCTV and ban lists', tags: 'data protection gdpr uk gdpr privacy subject access request sar cctv bodycam retention share police pubwatch ban list barred photos personal data',
    body: `- Personal data (officers' documents, incident reports, CCTV, bodycam, ban lists) falls under UK GDPR and the Data Protection Act 2018. Keep only what is needed, for as long as needed, and only let people see what they need.
- A subject access request (someone asking for their data, including footage of them) must be answered within one month.
- Sharing with the police to prevent or detect crime is allowed when it is necessary; record what was shared and why.
- Ban lists and Pubwatch schemes share personal data: there must be a clear purpose, a fixed ban period and a way to appeal. Don't share photos or details more widely than the scheme allows.
- Venue logins never see officer pay, HR notes or documents.`,
  },
  {
    id: 'terrorism', title: "Martyn's Law and counter-terrorism", tags: 'martyns law martyn terrorism protection of premises act 2025 standard enhanced tier act awareness run hide tell hot suspicious item package behaviour lockdown evacuation',
    body: `- The Terrorism (Protection of Premises) Act 2025 (Martyn's Law) covers the whole UK, Scotland included. Premises and events expecting 200 to 799 people at a time are "standard tier" (procedures for evacuation, invacuation, lockdown and communication); 800 or more are "enhanced tier" (also documented security measures and a responsible person). The SIA is the regulator. There is an implementation period of at least two years from April 2025 before duties are enforced.
- ACT Awareness e-learning (free, from Counter Terrorism Policing) is the usual baseline for officers.
- Run, Hide, Tell if there is an attack.
- Suspicious items: the HOT test (Hidden, Obviously suspicious, not Typical for the place). If it fails, don't touch it, move people away, call 999.
- Suspicious behaviour (filming entrances, asking about security, testing the door): note it and report it to the police or the anti-terrorism hotline.`,
  },
  {
    id: 'contractors', title: 'Self-employed officers', tags: 'self employed contractor contractors employment status worker employee ir35 hmrc tax ni national insurance holiday pay sick pay substitution control mutuality utr invoice',
    body: `The company's officers are self-employed contractors, paid by remittance statement against approved hours.
- Employment status depends on how things really work, not on the contract's label: how much control the company has over how the work is done, whether the officer could send a substitute, and whether there is an obligation to offer and accept work. If the reality looks like employment, an officer could claim worker rights such as holiday pay and the minimum wage, and HMRC could treat them as employed for tax.
- Officers are responsible for their own tax and National Insurance through Self Assessment.
- Keep instructions to what the job and the venue need (site packs, assignment instructions, safety rules), let officers accept or decline shifts, and avoid language like "staff", "employees", "sick leave" or "disciplinary" for them.
- Working time limits don't apply to the genuinely self-employed, but long runs of night shifts are a safety risk; the rota should avoid them.`,
  },
  {
    id: 'safety', title: 'Officer safety and lone working', tags: 'lone working safety risk assessment radio bodycam stab vest ppe check in welfare checks fatigue night shift breaks',
    body: `- Every site should have a risk assessment covering violence, lone working, crowd, fire and medical risks, and what the officer should do.
- Lone officers need a way to call for help and regular welfare checks (radio, phone or the app).
- Equipment such as radios, bodycams and stab-resistant vests should match the risks of the site.
- Fatigue causes mistakes: plan breaks and avoid back-to-back long night shifts.
- Any injury to an officer goes in an incident report, and serious ones may need reporting under RIDDOR.`,
  },
  {
    id: 'events', title: 'Events and crowds', tags: 'event events crowd stewarding steward stewards purple guide green guide sports ground capacity density queue ingress egress festival concert',
    body: `- Event safety follows the Purple Guide (events) and, at sports grounds, the Green Guide and the ground's safety certificate. The event organiser's plan says how many stewards and door supervisors are needed and where.
- Stewarding (directing people, staffing exits, managing queues) does not always need an SIA licence. Searching, refusing entry or removing people at an event where alcohol is sold usually does: if in doubt, use licensed door supervisors.
- Watch crowd density at entrances, bars, stages and exits; report crushing or surging at once and stop entry if needed.
- Brief every officer on the site plan, emergency exits, radio channels and who is in charge before the doors open.`,
  },
  {
    id: 'clients', title: 'Working with venues', tags: 'client clients venue manager complaint feedback assignment instructions site pack contract invoice minimum hours cover request service level',
    body: `- Each venue should have assignment instructions (in the app: the site pack) that every officer reads and signs before working there: the licence conditions, the layout, procedures, contacts and what the venue expects.
- Venue feedback, good or bad, is answered politely and quickly; say what will be done, without blaming a named officer or sharing HR details.
- Cover requests are confirmed with names once staffed. Venues see officers' names, photos, SIA badges and roles only.
- Invoices follow approved and signed-off hours; a venue's minimum hours per shift apply to the invoice, not to officer pay.`,
  },
];

const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** The best topics for a question (up to three), with the guidance note */
export function searchKnowledge(question) {
  const want = words(question);
  const text = TOPICS.map((t) => ({ t, head: `${t.title} ${t.tags}`.toLowerCase(), body: t.body.toLowerCase() }));
  // A word found in few topics says more than one found in most ("door" is everywhere, "arrest" is not)
  const weight = Object.fromEntries(want.map((w) => [w, 1 / Math.max(1, text.filter((x) => x.head.includes(w) || x.body.includes(w)).length)]));
  const hits = text.map(({ t, head, body }) => ({ t, score: want.reduce((n, w) => n + ((head.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0)) * weight[w], 0) })).filter((h) => h.score).sort((a, b) => b.score - a.score).slice(0, 3);
  return hits.map(({ t }) => ({ topic: t.title, body: t.body }));
}

export const KNOWLEDGE_TOPICS = TOPICS.map((t) => t.title).join(', ');
