import streamDeck from "@elgato/streamdeck";
import { ProgressBars } from "./actions/progress-bars";

// Register the increment action.
streamDeck.actions.registerAction(new ProgressBars());

// Finally, connect to the Stream Deck.
streamDeck.connect();
