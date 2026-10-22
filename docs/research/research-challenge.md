# Research: DEV Hacktoberfest Open-Source AI Challenge, Week 3 "Slow and Steady"

Researched 2026-10-22. Sources: DevRelay `get_challenges` / `get_challenge_details` (id 81), DevRelay `get_organization_articles(devteam)` and `get_article_content`, the dev.to public article API (`https://dev.to/api/articles/<user>/<slug>`), and a direct fetch of the challenge page, hub and contest-rules page. Quotes are verbatim unless marked as paraphrase.

---

## 1. Week 3 challenge facts

**Challenge page:** https://dev.to/challenges/hacktoberfest-week3-2026-10-19 (confirmed; DevRelay event id 81)
**Hub:** https://dev.to/challenges/hf26
**Launch post:** "Join the Hacktoberfest Open-Source AI Challenge: Slow and Steady! $2,850 in Prizes Across 21 Winners." by Jem (heyitsjem), https://dev.to/devteam/join-the-hacktoberfest-open-source-ai-challenge-slow-and-steady-2850-in-prizes-across-21-3iee
**Contest rules:** https://dev.to/page/hacktoberfest-week3-2026-10-19-contest-rules
**Tags:** `#devchallenge` and `#hf26challenge` (the template adds both; the rules require `#hf26challenge`)

### Prompt (verbatim, from the challenge page)
> Build something with open-source AI at its core.
> That can mean running an open-weight model, building on an open-source agent harness or framework, running inference locally, or all three. Whatever you pick, the open pieces should be what makes your project work.
>
> **This Week's Theme: Slow and Steady**
> Build something with open-weight models or open-source AI that rewards laziness.
> Tomorrow, October 20, is International Sloth Day, and we think sloths have it figured out. They move at their own pace, conserve their energy, and even help moderate our website. This week, we want you to channel your inner sloth and build something that does the work so you don't have to.
> Your build could help someone relax, automate a task they dread, or just make life a little easier. A few ideas to get you going:
> - A local agent that reads your group chats overnight and hands you a two-line summary in the morning
> - A wind-down companion that generates a calming bedtime story or ambient soundscape, running entirely offline
> - A fridge photo to grocery list tool, so you never have to stand there with the door open again
> - A file and inbox tidier that automatically sorts, renames, and archives the clutter you keep putting off
>
> In your post, tell us **why open innovation matters for what you built**. Does running your own model mean your automation works without an internet connection? Keep your personal messages and files on your own machine? Let you set it up once and never pay for it again? Tell us where your open-based approach worked better than a closed one.

How To Participate (verbatim): "Tell us what you built and what effort it saves, show us a demo, and explain why open innovation matters for what you built. If you can show us the lazy payoff, even better!"

Contest rules, "Required Elements for Entries" (verbatim):
- "A published submission post on DEV that uses the submission template and unique challenge tag (#hf26challenge) provided on the Contest Page."
- "A brand-new project created and completed during the Entry Period, with open-source AI (open-weight models, open-source agent harnesses or frameworks, and/or local inference) at its core. Pull requests to existing projects do not qualify."
- "A project that fits the "Slow and Steady" theme: it rewards laziness by helping someone relax, automating a task, or otherwise making life easier."
- "An explanation of why open innovation matters for the project."
- "Entries submitted for a partner prize category must meaningfully incorporate that partner's technology and identify the category in the submission post."

### Deadline (note the conflict)
- Contest rules: "The Contest begins on October 19, 2026 at 9:00 AM PDT and ends on October 25, 2026 at 11:59 PM PDT". Challenge page footer says the same. The page countdown script is initialised with `Mon Oct 26 2026 06:59:59 GMT+0000`, which is the same moment (**Oct 25 23:59 PDT = Oct 26 06:59 UTC = Oct 26 12:29 IST**).
- **Conflict:** the DevRelay events API returns `ends_at: 2026-10-25T06:59:00.000Z`, which is **Oct 24 23:59 PDT**, a full day earlier. Week 2 used the same pattern correctly (Oct 18 11:59 PM PDT = `2026-10-19T06:59Z`), so the Week 3 API value looks like an off-by-one-day data error. The official rules say Oct 25 11:59 PM PDT, and "Sponsor's servers and clock will be deemed the official clock". **Safe plan: publish before Oct 25 06:59 UTC (Oct 24 11:59 PM PDT, Oct 25 12:29 IST) so the conflict cannot matter.** NOT VERIFIED which value the submission system actually enforces.
- Winners: "Week of October 26".
- Rules also say the project must be "created and completed during the Entry Period" (from Oct 19 9:00 AM PDT). FAQ: "Commits made after the submission deadline must be noted in the project's readme. Failure to do so may result in disqualification." Check that the TwoToe repo has no commits before Oct 19 16:00 UTC.

### Judging criteria
Launch post wording (verbatim):
- **Writing Quality (weighted most heavily):** Is the post clear and engaging? Does it explain what you built, who it's for, and why open innovation matters?
- **Relevance to the Prompt and Theme:** Is open-source AI or open-weight models at the core of the project? Does it genuinely save effort, help someone relax, or make life easier?
- **Creativity:** Is it an original idea, or a fresh take on a familiar problem?
- **Technical Execution:** Does it work, and is it well built?
- **Use of Partner Technology (optional):** If you're entering a partner category, does the project use that technology in a meaningful way?

Challenge page FAQ, "How are submissions judged?" (verbatim): "This is DEV, so **your write-up matters most**. **A great project with a thin write-up won't win.** We judge on Writing Quality (weighted most heavily), Relevance to the Prompt and Theme, Creativity, Technical Execution, and, if you're entering a partner category, Use of Partner Technology."

Ties (verbatim): "In the event of a tie in scoring between judges, the judges will select the entry that received the highest number of positive reactions on their DEV post to determine the winner." So reactions matter only as a tiebreak.

Agent session (verbatim): "Show your work. We'd love to see how you built it. Save your agent session with DevRelay and embed it in your post, or link to it. It's optional, but it helps the judges understand your process." The template says "Optional, but judges love it."

### One-win and repeat-winner rules
- Contest rules (verbatim): "A participant may win no more than one (1) prize in this Contest." This is per challenge, so a Week 1 win does not formally block Week 3.
- FAQ "Can one submission win more than once?" (verbatim): "No. Each submission is automatically in the running for the overall prize and every partner category it qualifies for, but you can win once per challenge, **and we'll aim to celebrate as many different builders as possible across the month.**"
- Launch post note (verbatim): "One project can enter every category it genuinely uses, but you can only win once per challenge, and we'll aim to celebrate as many different builders as possible across the month."
- **Implication:** no rule bars a previous winner, but the stated intent to spread wins across "as many different builders as possible" is a real tie-break headwind for a Week 1 winner. A previous winner probably needs to be clearly ahead, not just close. This is my reading of the stated intent; how judges apply it is not published.
- Launch post "Pro Tip" (verbatim): "Partner category winners come from a smaller pool of submissions, so your odds are meaningfully higher."
- Partner categories: "You opt in by using the partner's technology in your project and listing each category you're entering in the Prize Categories section of your post."

### Prizes
Overall winner (1): $250 USD + DEV++ + badge. Featured category winners (6): $200 + badge. Partner category winners (14): $100 + badge. 21 winners, $2,850 total. Everyone with a valid entry gets a completion badge.

### All 20 prize categories: exact requirement text (verbatim from the Week 3 challenge page)

**Featured ($200)**
| Category | Requirement text |
|---|---|
| Render | "Use Render as your project's AI runtime, to host an agent's front end, or to run Hermes or OpenClaw." |
| TabPFN | "Use TabPFN, Prior Labs' tabular foundation model, to forecast, predict, classify, or spot anomalies from historical data like a CSV. Prior Labs strongly recommends the latest version, TabPFN-3.5: it's open-weight and free to use once you sign the non-commercial license at platform.priorlabs.ai, and you can then run it locally. The API adds features like Thinking Mode. Prior Labs favors projects that use TabPFN inside a wider prediction agent (with or without the MCP server)." |
| Tinker | "Use Thinking Machines' Tinker to fine-tune a model for a specific task, and show a clear improvement in performance, latency, or cost over a baseline." |
| Arduino | "Build with an Arduino UNO Q: run a model on the board, build a physical agent that senses and acts, or optimize a model for it with Qualcomm AI Hub. Open to anyone building with an UNO Q, whether you got one at an in-person Fest or have your own." |
| DigitalOcean | "Build or deploy your project on DigitalOcean: host your app or agent, run an open-weight model on a GPU Droplet (1-Click Models make this quick), or build an agent on the Gradient AI Platform." |
| **Gemma** | "Use Gemma, Google's open-weight model, in building your project: run it locally, fine-tune it, or serve it through Google Cloud or another provider." |

**Partner ($100)**
| Category | Requirement text |
|---|---|
| Auth0 for AI Agents (new this week) | "Use Auth0 for AI Agents: sign users in to an agent, call tools on a user's behalf with Token Vault, ask a person to approve a risky action before the agent takes it, or limit what a RAG pipeline can retrieve with fine-grained authorization." |
| Backboard | "Build with R-CLI, Backboard's open-source terminal coding agent, compare open-weight models through a single Backboard API key, or give an open-source project's assistant memory and RAG." |
| ElevenLabs | "Give an open-source agent a voice, transcribe audio for a local model, or generate narration for your demo." |
| Browserbase (new) | "Give your agent a real browser: drive a live site end to end using Stagehand's SDK, pull the context an open-weight model reasons over, or turn a one-off agent run into a repeatable workflow." |
| Entire | "Share the agent sessions behind your project in the write-up, or search past agent work to explain why code exists." |
| GitHub Copilot | "Build with Copilot's coding agent, the Copilot CLI, or the new Copilot app, automate your project with GitHub Actions, or review contributors' PRs with Copilot." |
| Mastra | "Orchestrate an agent over open models, add memory and tools to a chat agent, or build a workflow that triages GitHub issues." |
| MongoDB Atlas | "Use Atlas as your data layer: Atlas Vector Search for retrieval, long-term memory for an agent, or the database behind an app built on an open-weight model." |
| Ultramarine (Paper Instruments) (new) | "Put Ultramarine, Paper Instruments' model, to work on something real: research, analysis, drafting, or an agent that reasons over a pile of documents. Call it with the OpenAI or Anthropic SDKs, and say what your run actually cost. Claim $5 of free credit at hacktoberfest.com/my/promos." |
| **Sentry Agent Tracing** | "Show your agent's work: how it's set up, how it performs (latency, tokens, cost), what you found, and how you debugged it. Include traces or screenshots in your write-up." |
| SerpApi | "Give an agent live web search, ground a RAG app in fresh results, or track news for an open-source project." |
| **.tech Domain** | "Put your project live on a .tech domain you claimed through Hacktoberfest, and link to it in your write-up. Claim a free first-year .tech domain at hacktoberfest.com/my/promos (it renews at $29.99 a year)." |
| **Temporal** | "Make your agent durable. Wrap it in a Temporal workflow so it survives failures, retries flaky tool calls, and picks up where it left off." |
| Tiger Data | "Store embeddings with pgvector, run hybrid keyword and vector search for an agent, or let an agent manage a database through Tiger MCP." |

### Category details a casual integration could miss (TwoToe-specific)
- **Temporal:** the text is about durability, not scheduling. "Survives failures, retries flaky tool calls, and picks up where it left off." A Temporal **Schedule** that triggers a run is not enough on its own. Both Temporal winners so far demonstrated a crash: one ran `kill -9` on the worker mid-activity and showed it resume from a checkpoint; the other stopped the whole stack (Temporal included) and showed a durable timer still firing after restart ("24.6 s late, not lost"). Both included a screenshot of the Temporal UI timeline. Show: the model call (and any slow scanner step) as activities with a RetryPolicy, heartbeats on long steps, and a recorded kill-and-resume.
- **Sentry Agent Tracing:** it names Sentry's *agent* tracing, so the spans should follow Sentry's AI agent span conventions: `gen_ai.invoke_agent`, `gen_ai.chat` / `gen_ai.request` with `gen_ai.request.model` and `gen_ai.usage.input_tokens` / `output_tokens`, and `gen_ai.execute_tool` for tool steps. Plain HTTP or transaction tracing will look generic. It asks for **latency, tokens, cost**, plus **"what you found, and how you debugged it."** All three Sentry winners had a debugging story found through the traces: a 60 s timeout, a secret scrubber that blanked `input_tokens` because the name contains "token", and a slow TabPFN tool span cut from 3.25 s to 268 ms. **Screenshots are required.** Both winners kept prompts out of Sentry (`include_prompts=False`, `send_default_pii=False`) and said so. That matches TwoToe's rules.
- **.tech:** requires the project to be **"live"** on a .tech domain claimed **through Hacktoberfest**, with a link in the post. For a local-only CLI, the realistic version is a static project page or demo page (for example a fixture-based sample report) on the domain. A local tool cannot otherwise be "live". The .tech entrant seen this week (MorningDrop) used a project page. VERIFY whether judges accept a landing page; the text does not say "app".
- **Gemma:** the cheapest category to qualify for (local Gemma counts), but also the most crowded. Gemma has appeared in many winning posts, including the Week 1 overall winner. Winners showed a model-size comparison and an eval table, and named exact model tags (`gemma4:e4b`, `gemma-3-1b-it`).
- **Render / DigitalOcean / MongoDB Atlas / Tiger Data / Ultramarine / SerpApi / Browserbase / Auth0:** each implies cloud hosting or a cloud API in the data path. Using them would **conflict with TwoToe's local, offline, egress-guarded design** (CLAUDE.md rule 4 allows only loopback, www.cisa.gov, and Sentry when opted in). Not recommended.
- **ElevenLabs:** "generate narration for your demo" keeps user data out of ElevenLabs, because it touches only the demo video. It is a low-conflict option, but thin. Any ElevenLabs call must not be made by TwoToe at runtime.
- **Entire / GitHub Copilot:** no data-path conflict. Entire wants agent sessions shared in the write-up. Copilot covers "automate your project with GitHub Actions" (TwoToe has Windows CI), but a plain CI file is a casual integration and likely weak.
- **Mastra:** a TypeScript agent framework that can orchestrate over open models via Ollama. It is local-compatible, but it is only worth it if TwoToe actually orchestrates through it.
- **Sentry itself is a SaaS endpoint.** Entering Sentry means sending spans off-machine. TwoToe already allows that only under opt-in, so the post should say explicitly that telemetry is opt-in, carries no paths, env values or prompts, and that the default run is fully offline.

### Submission template (verbatim headings and comments)
```
*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19)*

## What I Built
<!-- What does it do, and what effort does it save? Who gets to be a little lazier because of it? -->
## Demo
<!-- Share a deployed link or a video demo. -->
## Code
<!-- Show us the code!  You can embed a GitHub repo directly into your post. -->
## How I Built It
<!-- Which open-source AI did you use (open-weight models, agent harnesses, frameworks, local inference), and how is your project built around it? -->
## Why Does Open Innovation Matter?
<!-- Why does open innovation matter for what you built?  What did it make possible that a closed API wouldn't? -->
## My Agent Session
<!-- Optional, but judges love it.  Save your session with DevRelay and embed it with the agent_session tag (see the challenge page), or link to it. -->
## The Lazy Payoff
<!-- Optional, but this is where you can make your post stand out.  How much time or effort does it actually save?  Did you (or someone else) use it this week?  If not, remove this section. -->
## Prize Categories
<!-- Which partner categories are you entering?  List every one that applies, or remove this section. -->
```
Front matter: `tags: devchallenge, hf26challenge`.

---

## 2. Previous winners in the hf26 series

Week 2 ("Side Hustle") winners were **not yet announced** as of 2026-10-22: there is no Week 2 announcement in the devteam org feed. The Kaggle and Sanity winners were also not checked in depth.

### Judges' own words (announcement posts)
The announcements list winners only. **They give no per-winner reasons.** The general praise:
- Week 1, "Congrats to the Hacktoberfest Open-Source AI Challenge: Touch Grass Winners!" by Jem, https://dev.to/devteam/congrats-to-the-hacktoberfest-open-source-ai-challenge-touch-grass-winners-152c : "Many of you took your projects outside and told us how it went, which made reviewing your builds a blast." "Your builds made a strong case for why open innovation matters, from models running locally with no signal to tools that keep your data on your own device." The post highlights builds with a concrete hook: "a laptop that sends you outside the moment the power cuts out", "a kids' plant treasure hunt that will never let poison ivy count as a win". Record turnout for the second week in a row.
- Weekend, "Congrats to the Hacktoberfest Weekend Challenge: Build for a Friend Winners!" by Jem, https://dev.to/devteam/congrats-to-the-hacktoberfest-weekend-challenge-build-for-a-friend-winners-pgc : "nearly **tripling** our previous record for submissions." "Many of you told us how the person you built for reacted, and those stories made judging both a joy and a challenge." "Your projects show exactly why open models matter: private data stays at home, tools run without a credit card, and builders get to shape AI around the people they care about."
- **Takeaway:** judges reward the theme's "bonus" ask actually done (took it outside, handed it to the friend). For Week 3 that bonus is **the Lazy Payoff: real time saved, measured, and used this week.**

### Week 1 "Touch Grass" winners (from the announcement)
| Category | Post |
|---|---|
| **Overall** | "Paper Trail: Gemma writes your walk a field card, then the screen goes away" by mikek, https://dev.to/mikek/paper-trail-gemma-writes-your-walk-a-field-card-then-the-screen-goes-away-3mf4 (the announcement links the old handle https://dev.to/mike_kim_692aa79c288bfed8/..., which now redirects) |
| Render | tanay_singh_1005, "Golden Hour..." https://dev.to/tanay_singh_1005/golden-hour-an-open-model-that-finds-your-40-minutes-outside-and-where-to-spend-them-5fe8 |
| TabPFN | code_neuron58, "Turnaround..." https://dev.to/code_neuron58/turnaround-an-open-source-hiking-buddy-that-knows-when-you-should-turn-back-and-tells-someone-if-1pha |
| Tinker | soumyadeepdey, "I Distilled a 397B Model Into a 4B One for $1.60..." https://dev.to/soumyadeepdey/i-distilled-a-397b-model-into-a-4b-one-for-160-it-now-catches-28-of-33-park-alerts-that-should-bic (**the user's Week 1 win**) |
| Arduino | utsavbhattarai007 https://dev.to/utsavbhattarai007/i-won-an-arduino-uno-q-at-a-hack-day-now-im-building-a-device-to-help-me-touch-grass-k68 |
| DigitalOcean | sbis04 "Leaf Peep" https://dev.to/sbis04/leaf-peep-an-open-model-reads-the-trees-so-you-know-where-to-walk-this-weekend-16hk |
| Gemma | anshsaini "Grow a Song..." https://dev.to/anshsaini/grow-a-song-my-run-wrote-its-own-soundtrack-with-gemma-running-on-my-phone-44ml |
| Backboard | dumnicki https://dev.to/dumnicki/weekend-micro-adventure-3bee |
| ElevenLabs | defiantlydefying https://dev.to/defiantlydefying/outside-i-built-a-meditation-app-whose-only-goal-is-to-make-you-stop-looking-at-it-5dnk |
| Entire | scs0209 https://dev.to/scs0209/should-i-go-out-a-local-gemma-agent-that-picks-one-outdoor-plan-then-tells-you-to-put-your-phone-5hbh |
| GitHub Copilot | yuvan_shankar https://dev.to/yuvan_shankar/touch-grass-garden-a-plant-tracker-that-only-counts-the-days-you-went-outside-10na |
| Mastra | asiboy6789 https://dev.to/asiboy6789/your-photo-picks-the-next-street-a-walking-mystery-on-open-weight-gemma-33od |
| MongoDB Atlas | aryan_sethi_afdba87340e96 https://dev.to/aryan_sethi_afdba87340e96/lumiroam-a-tour-guide-that-tells-you-where-to-stand-which-lens-to-use-and-when-the-light-is-right-1i1h |
| **Sentry** | antoniahp "I asked Gemma to turn 'I'm too tired' into 'glad I went out'" https://dev.to/antoniahp/i-asked-gemma-to-turn-im-too-tired-into-glad-i-went-out-fi1 |
| SerpApi | nikithakls17sys https://dev.to/nikithakls17sys/i-made-walking-a-game-quests-a-diary-and-an-app-that-judges-your-screen-time-2fii |
| **Temporal** | codersacademy006 "Butterflies don't take weekends off..." https://dev.to/codersacademy006/butterflies-dont-take-weekends-off-40000-pune-sightings-and-a-forecast-that-fell-apart-when-i-1g4 |
| Tiger Data | anishisbusy https://dev.to/anishisbusy/nice-out-an-app-that-learns-your-kind-of-nice-weather-then-tells-you-to-go-outside-58bg |

### Weekend "Build for a Friend" winners
| Category | Post |
|---|---|
| **Overall** | adk_bbx "Phone calls are the boss fight of living in Japan." https://dev.to/adk_bbx/phone-calls-are-the-boss-fight-of-living-in-japan-1h6h |
| Arduino | https://dev.to/abhinavkrishna3211/jarvis-ai-lab-assistant-18jp |
| DigitalOcean | https://dev.to/alexgeorgiev17/i-couldnt-legally-use-the-repair-manual-so-i-built-my-friend-something-better-84 |
| **Gemma** | uptimearchitect "Gemma 4 reads my parent's mail at home: 39 test letters, 9 of them real, and one calm wrong answer I engineered out" https://dev.to/uptimearchitect/gemma-4-reads-my-parents-mail-at-home-39-test-letters-9-of-them-real-and-one-calm-wrong-answer-3obf |
| Render | https://dev.to/highcenburg/tala-free-audio-to-text-for-my-designer-friend-no-signup-no-credit-card-2o26 |
| TabPFN | https://dev.to/iamrobertmoore/my-mate-wants-a-sub-5-703-before-recommending-one-i-made-an-open-model-predict-79-of-my-old-race-4kcp |
| Tinker | https://dev.to/muaazsm/rakshak-i-built-my-parents-a-scam-checker-that-never-leaves-the-house-22ah |
| Backboard | https://dev.to/coffeeandcommits/kharcha-a-4b-model-that-reads-indian-bank-sms-so-the-money-stays-on-your-laptop-2n8j |
| ElevenLabs | https://dev.to/rahullkumr/padh-ke-batao-an-ai-that-reads-my-grandfathers-documents-to-him-on-a-laptop-with-no-gpu-3818 |
| Entire | https://dev.to/iamwasih/viva-a-mock-interview-that-knows-which-parts-of-your-project-an-ai-wrote-ahe |
| GitHub Copilot | https://dev.to/dosunmu_hassan_46f2ac141d/i-built-a-panic-button-that-doesnt-tell-me-anything-published-4glf |
| Mastra | https://dev.to/bipul_chamoli_09b5f0cc719/prep-buddy-an-ai-interview-coach-for-my-classmate-that-runs-on-his-laptop-with-the-wi-fi-off-426b |
| MongoDB Atlas | https://dev.to/raphelevator/i-turned-my-sister-in-laws-voice-notes-into-a-cookbook-that-answers-in-her-voice-41ja |
| **Sentry** | arqamwd "'If it's not in front of me, it's gone': I fine-tuned a 4B model for my friend with ADHD" https://dev.to/arqamwd/if-its-not-in-front-of-me-its-gone-i-fine-tuned-a-4b-model-for-my-friend-with-adhd-o4 |
| SerpApi | https://dev.to/muhammadmurtuzahussain/pizhu-pi-zhu-a-writing-tutor-that-never-rewrites-your-essay-built-for-my-friend-joy-gemma-4-2n6e |
| **Temporal** | prateek11rai "PaidYet: for the friend who says 'kal bhej dunga'" https://dev.to/prateek11rai/paidyet-for-the-friend-who-says-kal-bhej-dunga-p5l |
| Tiger Data | https://dev.to/priyanshu_jha_eee132b17e5/my-friend-runs-her-supplements-shop-from-whatsapp-voice-notes-so-i-built-her-a-shop-helper-5785 |

### Close reads (9 winning posts, fetched via the dev.to API)
Stats from the API at fetch time (words of markdown, image count, reactions):

| Post | Won | Words | Images | Video | Reactions |
|---|---|---|---|---|---|
| Paper Trail (mikek) | W1 Overall (entered only Gemma) | ~1,500 | 2 (PNG card + GIF) | live site | 14 |
| Phone calls... Japan (adk_bbx) | Weekend Overall | ~2,900 | 22 incl. hero GIF | YouTube | 33 |
| Kitchen Table (uptimearchitect) | Weekend Gemma | ~2,800 | 2 | YouTube 86 s | 2 |
| Grow a Song (anshsaini) | W1 Gemma | ~1,500 | 0 | YouTube | 6 |
| MicroAdventures (antoniahp) | W1 Sentry | ~3,600 | 11 | 2 YouTube | 7 |
| Actually (arqamwd) | Weekend Sentry | ~2,900 | 9 (diagrams, Sentry screenshots) | none | 7 |
| Fieldcast (codersacademy006) | W1 Temporal | ~2,400 | 7 | none | 0 |
| PaidYet (prateek11rai) | Weekend Temporal | ~2,300 | 7 | 3 agent sessions | 2 |
| TrailTruth (soumyadeepdey, the user) | W1 Tinker | ~4,800 | 17 | none | 26 |

Reaction counts are low for most category winners (0 to 7), so popularity is not what decides it.

**What the winners say about why they work (my analysis of the posts; the judges did not state reasons):**

1. **Paper Trail (W1 overall).** Hook: a relatable paradox ("they get you outside and then ask you to look at them"). The core of the post is **"A 1B model is a careless witness"**: a list of real wrong outputs quoted next to the Wikipedia source, then a deterministic `checkTip()` grounding check (every content word in the source, colour within 8 words of its part, no numbers, no taste), and a **4-prompt eval table over the same 72 species**. A deliberate trade-off is explained ("v4 prints fewer of Gemma's lines than v3 on purpose... v3 had 12 wrong where v4 has 5"). There is an honest "What the check can't see" section (5 wrong of 39, and one wrong line left visible on the example card), a deploy surprise with a one-line fix, and an open-innovation section that includes **"Where a closed model would be better."** At about 1,500 words it is short and dense, with numbers in every section. **This is architecturally almost identical to TwoToe ("every line is either checked or quoted"), and it won overall.**
2. **Kitchen Table (Weekend Gemma).** Hook: the pile of mail on the kitchen table, with the scam letter that looks like all the others. Section **"Two passes, and code owns the scary parts"**: the model reads, while code owns dates, scam rules and urgency, with the override code shown. Eval: 30 synthetic letters, 6 held out and written *after* tuning, plus 9 real letters run once and "changed nothing afterwards". The headline failure, "wrong *and calm*" (2026 read as 2020), was engineered out. Honesty: refuses to add a rule that would "turn my only untuned real-world number into a tuned one". Has a "What it can't do (yet)" section and a model comparison table (size, speed, capability). Again very close to TwoToe's thesis.
3. **Fieldcast (W1 Temporal).** A number-first hook ("12.2 species on Sunday, 4.0 on Monday"). "Code owns the numbers, Gemma writes the words, Temporal keeps it all alive." The Temporal section is **"the afternoon I killed the worker"**: `kill -9` mid-fetch, heartbeat timeout, resume from the checkpoint, then a real config bug fixed while the retry was pending and it succeeded on attempt 7. Includes a Temporal timeline screenshot and verifies that the resumed run equals a clean run.
4. **PaidYet (Weekend Temporal, also entered Sentry and Gemma).** One workflow per item, the model call as a retried activity, input deleted in `finally` and never in Temporal history, signals and queries, durable timers, a full-stack kill-and-restart table with timestamps, 138 unit tests on the time-skipping test server, and Sentry `invoke_agent` > `gen_ai.chat` > `execute_tool` spans propagated through Temporal interceptors with "no bill contents in Sentry, enforced by a test". It also has a "what went wrong" list of 4 real bugs.
5. **Actually and MicroAdventures (Sentry winners).** Both lead the Sentry section with a finding: "Sentry found the slowest part, and it was not the language model", and "Then the traces caught a bug of mine". Both include before/after screenshots and state the privacy stance explicitly (prompts excluded).
6. **Phone calls / Japan (Weekend overall).** Personal first-person hook ("stared at the building manager's number for twenty minutes"), a hero GIF at the top, a video, many screenshots, and a "What my friend said" section with the real reaction.

**Common structural patterns:**
- Title = concrete outcome plus a number or a tension: "39 test letters, 9 of them real, and one calm wrong answer", "28 of 33 park alerts", "40,000 Pune sightings and a forecast that fell apart".
- The first 3 lines are a human scene or a striking number, not a feature list. The template headings follow.
- Visuals: a hero image or GIF near the top, an ASCII or diagram pipeline in "How I Built It", and partner-tech screenshots (Temporal UI timeline, Sentry trace waterfall or Explore table).
- Evals with tables: held-out sets, "ran once and changed nothing", model-size comparisons, and failure examples quoted verbatim.
- Honesty sections: "What the check can't see", "What it can't do (yet)", "What went wrong", and "Where a closed model would be better".
- The Prize Categories section is one dense bullet per category with mechanism plus measured result (for example "3.25 s to 268 ms", "24.6 s late, not lost").
- Length: 1,500 to 3,600 words. The overall winners were 1,500 and 2,900.
- The partner tech is shown doing something, through a failure that was survived or a bug that was found, not just "I used X".

---

## 3. Week 3 competitive field (entries seen so far, via DevRelay semantic search)
The idea "overnight local agent that hands you a morning summary" is the **first example idea on the prompt**, and the field is crowded with it: SlothSRE/NapOps (gde org; Gemma 4 + ADK + Sentry `gen_ai` spans, overnight alerts to a 2-line digest) https://dev.to/gde/slothsre-napops-an-overnight-gemma-4-adk-agent-that-compresses-418-lines-of-3-am-alerts-into-a-1pk6 ; MorningDrop ("a local Gemma agent that checks last night's data drops, and gets checked itself"; entered Gemma and .tech with a project page) https://dev.to/nightmoose/morningdrop-a-local-gemma-agent-that-checks-last-nights-data-drops-and-gets-checked-itself-29j0 ; standup-sloth ("a citation check keeps it honest") https://dev.to/dhanushnehru/standup-sloth-a-local-llm-drafts-your-standup-and-a-citation-check-keeps-it-honest-5h7h ; QuietOps (local Gemma, Docker logs into five signals) https://dev.to/infraopsx/quietops-local-gemma-turns-240-docker-log-lines-into-five-signals-lep ; plus Sloth Brief, SlothBrief, catchup, Sloth Digest, Lazybrief and SlothPilot.

**Implication:** "local Gemma + a checker that keeps it honest + overnight digest" is now common, and the Week 1 overall winner already told that story very well. TwoToe stands out only if it leans on what is specific to it: a **breach-week triage scenario with real stakes**, a **hard safety boundary** (never opens IOC files, never prints env values, canary-tested), **fixture evals with a held-out set**, and a **measured lazy payoff** (minutes of manual triage saved on a real advisory). I found no security or supply-chain triage entries in Week 3 so far (search coverage is partial).

---

## 4. Things I could not verify
- Which deadline the submission system enforces: the API says Oct 25 06:59 UTC, while the rules and page say Oct 26 06:59 UTC. Treat the earlier one as the safe target.
- Whether judges accept a static landing or demo page as "project live on a .tech domain" for a local CLI.
- How the "celebrate as many different builders as possible" intent is applied to previous winners. No rule text bars repeat winners.
- Week 2 winners (not announced yet). The judges' reasons for individual winners are not published, so the patterns above are inferred from the posts.
- Whether Sentry's AI Agents view needs specific `gen_ai.*` attribute names. That is inferred from winning posts, not from Sentry docs fetched in this session.
