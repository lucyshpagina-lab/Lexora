import React from "react";
import GothicModal from "./GothicModal.jsx";

export default function ExitModal({ onConfirm, onCancel }) {
  return (
    <GothicModal
      title="Threshold"
      body="You are about to leave your progress behind."
      confirmLabel="Leave anyway"
      cancelLabel="Stay"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
