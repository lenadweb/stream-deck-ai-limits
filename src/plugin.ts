import streamDeck from "@elgato/streamdeck";
import { ProgressBars } from "./actions/progress-bars";
import { CodexProgressBars } from "./actions/codex-progress-bars";

// Register the actions.
streamDeck.actions.registerAction(new ProgressBars());
streamDeck.actions.registerAction(new CodexProgressBars());

// Finally, connect to the Stream Deck.
streamDeck.connect();
