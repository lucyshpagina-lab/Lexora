import React from "react";
import Flashcard from "./Flashcard.jsx";

export default function Review({ session, reloadKey, activeTopic, onCardChange, onSentencesForce, onAlert }) {
  return (
    <Flashcard
      session={session}
      reloadKey={reloadKey}
      activeTopic={activeTopic}
      onCardChange={onCardChange}
      onSentencesForce={onSentencesForce}
      onAlert={onAlert}
    />
  );
}
