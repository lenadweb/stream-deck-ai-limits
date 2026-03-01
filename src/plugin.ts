import streamDeck from "@elgato/streamdeck";
import { ProgressBars } from "./actions/progress-bars";
import { CodexProgressBars } from "./actions/codex-progress-bars";
import { AntigravityProgressBars } from "./actions/antigravity-progress-bars";
import { GeminiCliProgressBars } from "./actions/gemini-cli-progress-bars";

streamDeck.actions.registerAction(new ProgressBars());
streamDeck.actions.registerAction(new CodexProgressBars());
streamDeck.actions.registerAction(new AntigravityProgressBars());
streamDeck.actions.registerAction(new GeminiCliProgressBars());

streamDeck.connect();
